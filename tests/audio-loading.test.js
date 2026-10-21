import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AudioEngine } from '../src/audio/audioEngine.js';
import { CircleSliceApp } from '../src/app/circleSliceApp.js';
import { SkinManager } from '../src/skin/skinManager.js';

function engine() {
  const audio = new AudioEngine(() => null, () => { throw new Error('Streaming must not fetch/decode a whole file'); });
  audio.context = { state: 'running', createMediaElementSource: () => ({ connect() {} }) };
  audio.clock = {};
  audio.masterGain = {};
  return audio;
}

test('long completion music preloads once without waiting for full-file fetch or decode', async () => {
  const audio = engine();
  let loads = 0;
  const media = { load() { loads++; }, play: async () => {}, pause() {}, currentTime: 0 };
  assert.equal(audio.prepareStream('fail.mp3', () => media), true);
  assert.equal(audio.prepareStream('fail.mp3', () => { throw new Error('already prepared'); }), true);
  assert.equal(loads, 1);
  assert.equal(media.preload, 'auto');
  assert.equal(media.src, 'fail.mp3');
  assert.equal(await audio.playStream('fail.mp3'), true);
  assert.equal(audio.decodedCache.size, 0);
  audio.stopEffects();
  assert.equal(audio.effectSources.size, 0);
});

test('returning to selection stops pending completion playback and unsupported media falls back', async () => {
  const audio = engine();
  let resolvePlay;
  let paused = false;
  const media = { load() {}, play: () => new Promise((resolve) => { resolvePlay = resolve; }), pause() { paused = true; }, currentTime: 12 };
  audio.prepareStream('applause.mp3', () => media);
  const pending = audio.playStream('applause.mp3');
  audio.stopEffects();
  resolvePlay();
  assert.equal(await pending, false);
  assert.equal(paused, true);
  assert.equal(media.currentTime, 0);
  assert.equal(audio.prepareStream('unsupported', () => { throw new Error('unsupported'); }), false);
});

test('gameplay effects exclude the unwanted start voice and long completion music but retain hit and fallback sounds', async () => {
  const loaded = [];
  const fake = { song: { audio: 'song.mp3', root: 'content/' }, skinCatalogEntry: { root: 'skin/' }, baseUrl: '/',
    audio: { loadAudio: async (url) => { loaded.push(url); return { kind: 'buffer', buffer: url }; } } };
  const names = ['normal-hitnormal.wav', 'ready.mp3', 'applause.mp3', 'failsound.mp3', 'sectionfail.wav', 'sectionpass.wav'];
  const resolver = await CircleSliceApp.prototype.loadStage6Effects.call(fake,
    { files: [{ path: 'song.mp3', role: 'audio' }, { path: 'custom.wav', role: 'audio' }] },
    { files: names.map((path) => ({ path, role: 'audio' })) });
  assert.equal(loaded.some((url) => /ready\.mp3|applause|failsound|song\.mp3/.test(url)), false);
  for (const name of ['normal-hitnormal.wav', 'sectionfail.wav', 'sectionpass.wav']) assert.equal(resolver.resolve(name)?.kind, 'buffer');
  assert.equal(resolver.resolveCustom('custom.wav')?.kind, 'buffer');
});

test('changing difficulty reuses already decoded skin images', async () => {
  const skin = new SkinManager(() => { throw new Error('cached image must not refetch'); });
  const image = {};
  skin.images.set('circle.png', image);
  assert.equal(await skin.loadImage('circle.png', '/skin/circle.png'), image);
});
