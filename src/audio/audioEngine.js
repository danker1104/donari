// @ts-check

import { AudioClock } from './audioClock.js';

export class AudioEngine {
  /**
   * @param {()=>any} contextFactory
   * @param {(url:string)=>Promise<any>} [fetcher]
   * @param {(reason:string)=>void} [onInterruption]
   */
  constructor(contextFactory, fetcher = globalThis.fetch?.bind(globalThis), onInterruption = () => {}) {
    this.contextFactory = contextFactory;
    this.fetcher = fetcher;
    this.onInterruption = onInterruption;
    /** @type {any|null} */
    this.context = null;
    /** @type {AudioClock|null} */
    this.clock = null;
    /** @type {any|null} */
    this.musicGain = null;
    /** @type {any|null} */
    this.effectGain = null;
    /** @type {any|null} */
    this.storyGain = null;
    /** @type {any|null} */
    this.masterGain = null;
    /** @type {any|null} */
    this.musicSource = null;
    /** @type {any|null} */
    this.musicBuffer = null;
    /** @type {Map<string, Promise<any>>} */
    this.decodedCache = new Map();
    this.streamCache = new Map();
    this.generation = 0;
    this.interruptionReported = false;
    this.musicVolume = 1;
    /** @type {Map<any,()=>void>} */
    this.effectSources = new Map();
    /** @type {AnalyserNode|null} */
    this.musicAnalyser = null;
    this.musicWaveform = new Float32Array(1024);
    this.musicFrequencies = new Uint8Array(512);
    this.musicAnalysis = { level: 0, bass: 0, burst: 0, bands: new Float32Array(32) };
    this.musicEnergyBaseline = 0;
    this.musicEnergyInitialized = false;
    this.lastMusicBurstTime = -Infinity;
    /** @type {Array<{start:number,end:number}>} */
    this.musicBandRanges = [];
    this.lastMusicAnalysisTime = -Infinity;
  }

  async unlockFromGesture() {
    if (!this.context) {
      this.context = this.contextFactory();
      this.musicGain = this.context.createGain();
      this.effectGain = this.context.createGain();
      this.storyGain = this.context.createGain();
      this.masterGain = this.context.createGain();
      this.musicGain.connect(this.masterGain);
      this.musicAnalyser = this.context.createAnalyser();
      this.musicAnalyser.fftSize = 1024;
      this.musicAnalyser.smoothingTimeConstant = 0.65;
      // A side branch observes only music; it never routes a second audible signal.
      this.musicGain.connect(this.musicAnalyser);
      const binHz = this.context.sampleRate / this.musicAnalyser.fftSize;
      const maximumHz = Math.min(16000, this.context.sampleRate / 2);
      this.musicBandRanges = Array.from({ length: this.musicAnalysis.bands.length }, (_, index) => {
        const start = Math.min(511, Math.max(1, Math.floor(30 * (maximumHz / 30) ** (index / 32) / binHz)));
        const end = Math.min(512, Math.max(start + 1, Math.ceil(30 * (maximumHz / 30) ** ((index + 1) / 32) / binHz)));
        return { start, end };
      });
      this.effectGain.connect(this.masterGain);
      this.storyGain.connect(this.masterGain);
      this.masterGain.connect(this.context.destination);
      this.clock = new AudioClock(this.context, 0);
      this.context.addEventListener?.('statechange', () => this.handleContextStateChange());
    }
    if (this.context.state !== 'running') await this.context.resume();
    if (this.context.state !== 'running') throw new Error(`AUDIO_CONTEXT_NOT_RUNNING: ${this.context.state}`);
  }

  getMusicAnalysis() {
    const analyser = this.musicAnalyser;
    if (!analyser || !this.musicSource || this.context?.state !== 'running' || this.masterGain.gain.value <= 0) {
      this.resetMusicAnalysis();
      return this.musicAnalysis;
    }
    const now = this.context.currentTime;
    const elapsed = now - this.lastMusicAnalysisTime;
    if (elapsed < 1 / 30) return this.musicAnalysis;
    this.lastMusicAnalysisTime = now;
    const delta = Math.min(0.1, elapsed);
    const volume = Math.max(0, Math.min(1, this.masterGain.gain.value));
    analyser.getFloatTimeDomainData(this.musicWaveform);
    analyser.getByteFrequencyData(this.musicFrequencies);
    let energy = 0;
    for (const sample of this.musicWaveform) energy += sample * sample;
    const rms = Math.sqrt(energy / this.musicWaveform.length) * volume;
    const target = Math.min(1, rms * 2.5);
    this.musicAnalysis.burst *= Math.exp(-delta * 7);
    if (this.musicEnergyInitialized && rms > 0.12 && now - this.lastMusicBurstTime >= 0.22) {
      const rise = rms - this.musicEnergyBaseline;
      const onset = Math.min(1, Math.max(0, (rise - 0.04) * 5));
      if (onset > 0.15 && rms > this.musicEnergyBaseline * 1.25) {
        this.musicAnalysis.burst = Math.max(this.musicAnalysis.burst, onset);
        this.lastMusicBurstTime = now;
      }
    }
    if (!this.musicEnergyInitialized) {
      this.musicEnergyBaseline = rms;
      this.musicEnergyInitialized = true;
    } else {
      this.musicEnergyBaseline += (rms - this.musicEnergyBaseline) * (1 - Math.exp(-delta * 3));
    }
    const rate = target > this.musicAnalysis.level ? 18 : 6;
    this.musicAnalysis.level += (target - this.musicAnalysis.level) * (1 - Math.exp(-delta * rate));
    let bass = 0;
    for (let index = 0; index < this.musicBandRanges.length; index += 1) {
      const { start, end } = this.musicBandRanges[index];
      let sum = 0;
      for (let bin = start; bin < end; bin += 1) sum += this.musicFrequencies[bin];
      const band = sum / ((end - start) * 255) * volume;
      this.musicAnalysis.bands[index] += (band - this.musicAnalysis.bands[index]) * (1 - Math.exp(-delta * 12));
      if (index < 8) bass += this.musicAnalysis.bands[index];
    }
    this.musicAnalysis.bass = bass / 8;
    return this.musicAnalysis;
  }

  resetMusicAnalysis() {
    this.musicAnalysis.level = 0;
    this.musicAnalysis.bass = 0;
    this.musicAnalysis.burst = 0;
    this.musicAnalysis.bands.fill(0);
    this.lastMusicAnalysisTime = -Infinity;
    this.musicEnergyBaseline = 0;
    this.musicEnergyInitialized = false;
    this.lastMusicBurstTime = -Infinity;
  }

  handleContextStateChange() {
    if (!this.context || !this.clock) return;
    if (this.context.state === 'closed') {
      if (!this.interruptionReported) this.onInterruption('audio-closed');
      this.interruptionReported = true;
      this.stopMusicSource();
      this.stopEffects();
      return;
    }
    if (!['suspended', 'interrupted'].includes(this.context.state) || !this.clock.running) return;
    this.clock.pause();
    this.stopMusicSource();
    this.stopEffects();
    if (!this.interruptionReported) this.onInterruption('audio-interrupted');
    this.interruptionReported = true;
  }

  async resumeFromGesture() {
    if (!this.context || !this.clock) throw new Error('AUDIO_CONTEXT_NOT_INITIALIZED');
    if (this.context.state === 'closed') throw new Error('AUDIO_CONTEXT_CLOSED');
    await this.context.resume();
    if (this.context.state !== 'running') throw new Error(`AUDIO_CONTEXT_NOT_RUNNING: ${this.context.state}`);
    this.interruptionReported = false;
    if (this.musicBuffer && !this.musicSource) this.createAndStartMusicSource(this.clock.getRawAudioPositionMs());
  }

  /** @param {string} url @param {{decodePolicy:'required'|'optional'|'silent'}} entry */
  async loadAudio(url, entry) {
    if (entry.decodePolicy === 'silent') return { kind: 'silent' };
    if (!this.context) throw new Error('AUDIO_CONTEXT_NOT_INITIALIZED');
    if (!this.fetcher) throw new Error('AUDIO_FETCH_UNAVAILABLE');

    let pending = this.decodedCache.get(url);
    if (!pending) {
      pending = (async () => {
        const response = await this.fetcher(url);
        if (!response.ok) throw new Error(`AUDIO_FETCH_FAILED: ${response.status} ${url}`);
        return this.context.decodeAudioData(await response.arrayBuffer());
      })();
      this.decodedCache.set(url, pending);
      pending.catch(() => this.decodedCache.delete(url));
    }

    try {
      return { kind: 'buffer', buffer: await pending };
    } catch (error) {
      if (entry.decodePolicy === 'optional') return { kind: 'silent' };
      throw error;
    }
  }

  /** Long scene music uses native buffering instead of decoding the entire file before play.
   * @param {string} url @param {()=>HTMLAudioElement} [createMedia]
   */
  prepareStream(url, createMedia = () => new Audio()) {
    if (this.streamCache.has(url)) return true;
    try {
      this.assertReady();
      const media = createMedia();
      media.preload = 'auto';
      media.src = url;
      const source = this.context.createMediaElementSource(media);
      source.connect(this.effectGain);
      media.load();
      this.streamCache.set(url, media);
      return true;
    } catch { return false; }
  }

  /** @param {string} url */
  async playStream(url) {
    this.assertReady();
    if (!this.prepareStream(url)) return false;
    const media = this.streamCache.get(url);
    const release = () => {
      if (this.effectSources.get(media) !== release) return;
      this.effectSources.delete(media);
      media.pause();
      media.currentTime = 0;
    };
    this.effectSources.set(media, release);
    media.onended = release;
    try {
      await media.play();
      return this.effectSources.get(media) === release;
    } catch {
      const active = this.effectSources.get(media) === release;
      release();
      return active ? false : null;
    }
  }

  /** @param {any} buffer @param {number} [seekOffsetMs] @param {number} [fadeInMs] */
  playMusic(buffer, seekOffsetMs = 0, fadeInMs = 0) {
    this.assertReady();
    this.stopMusicSource();
    this.musicBuffer = buffer;
    this.setVolumes({ music: this.musicVolume });
    this.createAndStartMusicSource(seekOffsetMs);
    if (fadeInMs > 0) {
      const target = this.musicVolume;
      this.musicGain.gain.cancelScheduledValues?.(this.context.currentTime);
      this.musicGain.gain.setValueAtTime?.(0, this.context.currentTime);
      this.musicGain.gain.linearRampToValueAtTime?.(target, this.context.currentTime + fadeInMs / 1000);
      if (!this.musicGain.gain.linearRampToValueAtTime) this.musicGain.gain.value = target;
    }
  }

  /** @returns {number} */
  pause() {
    this.assertReady();
    if (!this.clock) throw new Error('AUDIO_CONTEXT_NOT_INITIALIZED');
    const rawPositionMs = this.clock.pause();
    this.stopMusicSource();
    this.stopEffects();
    return rawPositionMs;
  }

  resumeMusic() {
    this.assertReady();
    if (!this.musicBuffer) throw new Error('AUDIO_MUSIC_BUFFER_MISSING');
    if (!this.clock) throw new Error('AUDIO_CONTEXT_NOT_INITIALIZED');
    if (this.musicSource) return;
    this.interruptionReported = false;
    this.createAndStartMusicSource(this.clock.getRawAudioPositionMs());
  }

  /** @param {number} [seekOffsetMs] */
  restart(seekOffsetMs = 0) {
    this.assertReady();
    this.stopMusicSource();
    if (!this.clock) throw new Error('AUDIO_CONTEXT_NOT_INITIALIZED');
    this.clock.seek(seekOffsetMs);
    if (this.musicBuffer) this.createAndStartMusicSource(seekOffsetMs);
    else this.generation += 1;
  }

  /** @param {{master?:number,music?:number,effect?:number,storyboard?:number,muted?:boolean}} volumes */
  setVolumes(volumes) {
    this.assertReady();
    if (volumes.music !== undefined) {
      this.musicVolume = volumes.music;
      this.musicGain.gain.cancelScheduledValues?.(this.context.currentTime);
      this.musicGain.gain.setValueAtTime?.(volumes.music, this.context.currentTime);
      this.musicGain.gain.value = volumes.music;
    }
    if (volumes.effect !== undefined) this.effectGain.gain.value = volumes.effect;
    if (volumes.storyboard !== undefined) this.storyGain.gain.value = volumes.storyboard;
    if (volumes.master !== undefined || volumes.muted !== undefined) {
      this.masterGain.gain.value = volumes.muted ? 0 : (volumes.master ?? this.masterGain.gain.value);
    }
  }

  /** @param {number} value @param {number} durationMs */
  fadeMusicTo(value, durationMs) {
    this.assertReady();
    const target = Math.max(0, Math.min(1, value));
    const now = this.context.currentTime;
    this.musicGain.gain.cancelScheduledValues?.(now);
    this.musicGain.gain.setValueAtTime?.(this.musicGain.gain.value, now);
    this.musicGain.gain.linearRampToValueAtTime?.(target, now + Math.max(0, durationMs) / 1000);
    if (!this.musicGain.gain.linearRampToValueAtTime) this.musicGain.gain.value = target;
  }

  /** @param {any} buffer @param {'effect'|'storyboard'} route @param {number} [whenSec] @param {number} [volume] */
  playEffect(buffer, route = 'effect', whenSec = 0, volume = 1) {
    this.assertReady();
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const destination = route === 'storyboard' ? this.storyGain : this.effectGain;
    let gain = null;
    if (volume === 1) source.connect(destination);
    else {
      gain = this.context.createGain();
      gain.gain.value = Math.max(0, volume);
      source.connect(gain);
      gain.connect(destination);
    }
    const release = () => {
      this.effectSources.delete(source);
      source.disconnect?.();
      gain?.disconnect?.();
    };
    source.onended = release;
    this.effectSources.set(source, release);
    source.start(whenSec);
    return source;
  }

  stopEffects() {
    for (const [source, release] of this.effectSources) {
      try { source.stop(); } catch { /* already ended */ }
      release();
    }
  }

  /** @param {number} seekOffsetMs */
  createAndStartMusicSource(seekOffsetMs) {
    if (!this.context || !this.clock) throw new Error('AUDIO_CONTEXT_NOT_INITIALIZED');
    const source = this.context.createBufferSource();
    source.buffer = this.musicBuffer;
    source.connect(this.musicGain);
    const audioOffsetMs = Math.max(0, seekOffsetMs);
    const leadInMs = Math.max(0, -seekOffsetMs);
    const scheduledStartSec = leadInMs > 0 ? this.context.currentTime + leadInMs / 1000 : 0;
    source.start(scheduledStartSec, audioOffsetMs / 1000);
    this.musicSource = source;
    this.generation += 1;
    this.clock.start(leadInMs > 0 ? scheduledStartSec : this.context.currentTime, audioOffsetMs);
  }

  stopMusicSource() {
    this.resetMusicAnalysis();
    if (!this.musicSource) return;
    try {
      this.musicSource.stop();
    } catch {
      // A source may already have ended; its lifecycle is still complete.
    }
    this.musicSource.disconnect?.();
    this.musicSource = null;
  }

  assertReady() {
    if (!this.context || !this.clock || !this.masterGain) throw new Error('AUDIO_CONTEXT_NOT_INITIALIZED');
    if (this.context.state !== 'running') throw new Error(`AUDIO_CONTEXT_NOT_RUNNING: ${this.context.state}`);
  }
}
