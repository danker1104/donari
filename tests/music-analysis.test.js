import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AudioEngine } from '../src/audio/audioEngine.js';

function audioContext() {
  const node = () => ({
    connections: [], gain: { value: 1 }, start() {}, stop() {}, disconnect() {},
    connect(destination) { this.connections.push(destination); },
  });
  const context = {
    state: 'running', currentTime: 0, sampleRate: 48000, destination: {},
    amplitude: 0, frequency: 0, waveformReads: 0, frequencyReads: 0,
    createGain: node, createBufferSource: node,
    createAnalyser() {
      return {
        ...node(),
        getFloatTimeDomainData(data) { context.waveformReads += 1; data.fill(context.amplitude); },
        getByteFrequencyData(data) { context.frequencyReads += 1; data.fill(context.frequency); },
      };
    },
  };
  return context;
}

async function engine() {
  const context = audioContext();
  const audio = new AudioEngine(() => context);
  await audio.unlockFromGesture();
  audio.playMusic({});
  return { context, audio };
}

test('analyser is a music-only side branch and never adds a second audible route', async () => {
  const { audio } = await engine();
  assert.deepEqual(audio.musicGain.connections, [audio.masterGain, audio.musicAnalyser]);
  assert.deepEqual(audio.effectGain.connections, [audio.masterGain]);
  assert.deepEqual(audio.storyGain.connections, [audio.masterGain]);
  assert.deepEqual(audio.musicAnalyser.connections, []);
  assert.deepEqual(audio.musicSource.connections, [audio.musicGain]);
  assert.deepEqual(audio.playEffect({}).connections, [audio.effectGain]);
  assert.deepEqual(audio.playEffect({}, 'storyboard').connections, [audio.storyGain]);
  assert.equal(audio.getMusicAnalysis().level, 0);
});

test('real signal amplitude and spectrum drive bounded reusable music analysis', async () => {
  const { audio, context } = await engine();
  context.amplitude = 0.02;
  context.frequency = 20;
  const quiet = audio.getMusicAnalysis();
  const quietLevel = quiet.level;
  const bands = quiet.bands;
  context.currentTime = 0.1;
  context.amplitude = 0.3;
  context.frequency = 220;
  const loud = audio.getMusicAnalysis();
  assert.equal(loud, quiet);
  assert.equal(loud.bands, bands);
  assert.equal(bands.length, 32);
  assert.ok(loud.level > quietLevel);
  assert.ok(loud.level > 0 && loud.level <= 1);
  assert.ok(loud.bass > 0 && loud.bass <= 1);
  assert.ok([...bands].every((band) => band > 0 && band <= 1));
  assert.ok(audio.musicBandRanges.every(({ start, end }) => start >= 1 && end > start && end <= 512));
});

test('sampling is limited to 30Hz and never changes the audio clock or volume', async () => {
  const { audio, context } = await engine();
  context.amplitude = 0.2;
  audio.clock.setOffset(45);
  context.currentTime = 0.1;
  const expected = audio.clock.getMapTimeMs();
  audio.getMusicAnalysis();
  for (let index = 0; index < 100; index += 1) audio.getMusicAnalysis();
  assert.equal(context.waveformReads, 1);
  assert.equal(context.frequencyReads, 1);
  assert.equal(audio.clock.getMapTimeMs(), expected);
  assert.equal(audio.masterGain.gain.value, 1);
  assert.equal(audio.musicGain.gain.value, 1);
  context.currentTime += 0.02;
  audio.getMusicAnalysis();
  assert.equal(context.waveformReads, 1);
  context.currentTime += 0.02;
  audio.getMusicAnalysis();
  assert.equal(context.waveformReads, 2);
});

test('pause, interruption, mute and restart clear stale spectrum without breaking playback', async () => {
  const { audio, context } = await engine();
  context.amplitude = 0.3;
  context.frequency = 200;
  assert.ok(audio.getMusicAnalysis().level > 0);
  audio.pause();
  assert.equal(audio.getMusicAnalysis().level, 0);
  assert.ok([...audio.musicAnalysis.bands].every((value) => value === 0));
  audio.resumeMusic();
  assert.ok(audio.getMusicAnalysis().level > 0);
  audio.setVolumes({ muted: true });
  assert.equal(audio.getMusicAnalysis().level, 0);
  audio.setVolumes({ master: 1 });
  assert.ok(audio.getMusicAnalysis().level > 0);
  audio.restart(2000);
  assert.equal(audio.musicAnalysis.level, 0);
  assert.equal(audio.clock.getRawAudioPositionMs(), 2000);
  audio.getMusicAnalysis();
  context.state = 'suspended';
  audio.handleContextStateChange();
  assert.equal(audio.getMusicAnalysis().level, 0);
  assert.equal(audio.musicSource, null);
});

test('master volume scales visual energy and missing audio remains silent', async () => {
  const full = await engine();
  const half = await engine();
  for (const { context } of [full, half]) { context.amplitude = 0.2; context.frequency = 160; }
  half.audio.setVolumes({ master: 0.5 });
  const high = full.audio.getMusicAnalysis();
  const low = half.audio.getMusicAnalysis();
  assert.equal(low.level, high.level / 2);
  assert.equal(low.bass, high.bass / 2);
  const idle = new AudioEngine(() => audioContext());
  assert.equal(idle.getMusicAnalysis().level, 0);
});

test('musical energy rises trigger a short burst, not a permanent loud-song plateau', async () => {
  const { audio, context } = await engine();
  context.amplitude = 0.05;
  context.frequency = 100;
  audio.getMusicAnalysis();
  assert.equal(audio.musicAnalysis.burst, 0);
  for (let index = 0; index < 10; index += 1) {
    context.currentTime += 0.05;
    audio.getMusicAnalysis();
  }
  context.amplitude = 0.4;
  context.currentTime += 0.05;
  assert.ok(audio.getMusicAnalysis().burst > 0.9);
  for (let index = 0; index < 40; index += 1) {
    context.currentTime += 0.05;
    audio.getMusicAnalysis();
  }
  assert.ok(audio.musicAnalysis.burst < 0.01);
  context.amplitude = 0;
  context.frequency = 0;
  for (let index = 0; index < 50; index += 1) {
    context.currentTime += 0.05;
    audio.getMusicAnalysis();
  }
  assert.ok(audio.musicAnalysis.level < 0.001);
  assert.ok(audio.musicAnalysis.burst < 0.001);
  context.amplitude = 0.4;
  context.currentTime += 0.05;
  assert.ok(audio.getMusicAnalysis().burst > 0.9);
  audio.pause();
  assert.equal(audio.musicAnalysis.burst, 0);
  audio.resumeMusic();
  assert.equal(audio.getMusicAnalysis().burst, 0);
});
