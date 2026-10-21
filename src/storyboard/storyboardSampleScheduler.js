// @ts-check

export class StoryboardSampleScheduler {
  /** @param {any} audio @param {Array<any>} samples @param {Map<string, any>} buffers @param {number} [lookAheadMs] */
  constructor(audio, samples, buffers, lookAheadMs = 100) {
    this.audio = audio;
    this.samples = samples;
    this.buffers = buffers;
    this.lookAheadMs = lookAheadMs;
    this.generation = audio.generation;
    this.scheduled = new Set();
    /** @type {Array<any>} */
    this.sources = [];
    /** @type {number|null} */
    this.lastMapTimeMs = null;
  }

  /** @param {number} mapTimeMs */
  update(mapTimeMs) {
    if (this.generation !== this.audio.generation) this.reset(this.audio.generation);
    const lowerBound = this.lastMapTimeMs === null ? mapTimeMs : Math.min(this.lastMapTimeMs, mapTimeMs);
    for (const sample of this.samples) {
      if (this.scheduled.has(sample.id) || sample.startTimeMs < lowerBound || sample.startTimeMs > mapTimeMs + this.lookAheadMs) continue;
      const buffer = this.buffers.get(sample.path);
      if (!buffer || !this.audio.context) { this.scheduled.add(sample.id); continue; }
      const when = Math.max(this.audio.context.currentTime, this.audio.context.currentTime + (sample.startTimeMs - mapTimeMs) / 1000);
      const source = this.audio.playEffect(buffer, 'storyboard', when, sample.volume);
      this.sources.push(source);
      this.scheduled.add(sample.id);
    }
    this.lastMapTimeMs = mapTimeMs;
  }

  /** @param {number} [generation] */
  reset(generation = this.audio.generation) {
    for (const source of this.sources) {
      try { source?.stop(); } catch { /* already ended */ }
    }
    this.sources = [];
    this.scheduled.clear();
    this.generation = generation;
    this.lastMapTimeMs = null;
  }
}
