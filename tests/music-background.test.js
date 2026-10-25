import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drawMusicBackground, musicBackgroundTransform } from '../src/renderer/musicBackground.js';
import { PlayfieldRenderer } from '../src/renderer/playfieldRenderer.js';
import { CoordinateMapper } from '../src/input/coordinateMapper.js';
import { RenderLayer } from '../src/renderer/renderCoordinator.js';

const spectrum = { level: 1, bass: 1, bands: new Float32Array(32).fill(0.8) };

function canvasContext() {
  const stack = [];
  return {
    calls: [], gradients: [], filter: 'none', globalAlpha: 1, globalCompositeOperation: 'source-over', lineWidth: 1,
    save() {
      stack.push({ filter: this.filter, globalAlpha: this.globalAlpha, globalCompositeOperation: this.globalCompositeOperation, lineWidth: this.lineWidth });
    },
    restore() { Object.assign(this, stack.pop()); },
    createLinearGradient() {
      const stops = [];
      this.gradients.push(stops);
      return { addColorStop(...args) { stops.push(args); } };
    },
    beginPath() {}, moveTo() {}, lineTo() {}, clearRect() {},
    stroke() { this.calls.push({ type: 'wave', filter: this.filter, alpha: this.globalAlpha }); },
    fillRect(x, y, width, height) { this.calls.push({ type: 'rect', x, y, width, height, filter: this.filter, alpha: this.globalAlpha }); },
    drawImage(...args) { this.calls.push({ type: 'image', args }); },
  };
}

test('music motion is bounded and silent or reduced-motion backgrounds remain static', () => {
  assert.deepEqual(musicBackgroundTransform(null, 1000, false), { zoom: 1, x: 0, y: 0 });
  assert.deepEqual(musicBackgroundTransform(spectrum, 1000, true), { zoom: 1, x: 0, y: 0 });
  const silent = { level: 0, bass: 0, bands: new Float32Array(32) };
  assert.equal(musicBackgroundTransform(silent, 1000, false).zoom, 1);
  for (let time = 0; time < 10000; time += 100) {
    const motion = musicBackgroundTransform(spectrum, time, false);
    assert.ok(motion.zoom >= 1 && motion.zoom <= 1.018);
    assert.ok(Math.abs(motion.x) <= 2 && Math.abs(motion.y) <= 2);
  }
  assert.notDeepEqual(musicBackgroundTransform(spectrum, 1000, false), musicBackgroundTransform(spectrum, 2000, false));
});

test('soft gradients and transparency are scoped to 32 sound bars and two background waves', () => {
  const context = canvasContext();
  drawMusicBackground(context, 1024, 768, spectrum, 1000);
  const bars = context.calls.filter((call) => call.type === 'rect');
  assert.equal(bars.length, 32);
  assert.equal(context.calls.filter((call) => call.type === 'wave').length, 2);
  for (const bar of bars) {
    assert.equal(bar.filter, 'none');
    assert.equal(bar.alpha, 0.45);
    assert.ok(bar.height <= 768 * 0.07);
    assert.ok(Math.abs(bar.y + bar.height - 768) < 1e-9);
  }
  assert.equal(context.filter, 'none');
  assert.equal(context.globalAlpha, 1);
  assert.equal(context.globalCompositeOperation, 'source-over');
  assert.equal(context.lineWidth, 1);
  assert.equal(context.gradients.length, 32);
  assert.ok(context.gradients.every((stops) => stops[0][1].endsWith(',0)') && stops.at(-1)[1].endsWith(',0)')));
  drawMusicBackground(context, 1024, 768, spectrum, 1100);
  assert.equal(context.gradients.length, 32);
  drawMusicBackground(context, 640, 480, spectrum, 1200);
  assert.equal(context.gradients.length, 64);
  const silent = canvasContext();
  drawMusicBackground(silent, 1024, 768, { ...spectrum, level: 0 }, 1000);
  assert.equal(silent.calls.length, 0);
});

test('sound bars stay low and bottom-anchored, expanding briefly on musical peaks', () => {
  for (const [width, height] of [[640, 480], [1024, 768], [390, 844]]) {
    const quiet = canvasContext();
    const loud = canvasContext();
    drawMusicBackground(quiet, width, height, { level: 0.2, bass: 0.2, bands: new Float32Array(32).fill(0.4) }, 1000);
    drawMusicBackground(loud, width, height, { ...spectrum, burst: 1, bands: new Float32Array(32).fill(1) }, 1000);
    const quietBars = quiet.calls.filter((call) => call.type === 'rect');
    const loudBars = loud.calls.filter((call) => call.type === 'rect');
    assert.equal(loudBars.length, 32);
    for (let index = 0; index < loudBars.length; index += 1) {
      const bar = loudBars[index];
      assert.ok(Math.abs(bar.y + bar.height - height) < 1e-9);
      assert.ok(Math.abs(bar.height - height * 0.19) < 1e-9);
      assert.ok(quietBars[index].height < height * 0.003);
      assert.ok(bar.alpha > quietBars[index].alpha);
    }
    const settled = canvasContext();
    drawMusicBackground(settled, width, height, { ...spectrum, burst: 0, bands: new Float32Array(32).fill(1) }, 1500);
    for (const bar of settled.calls.filter((call) => call.type === 'rect')) {
      assert.ok(bar.height <= height * 0.071);
      assert.ok(bar.height < loudBars[0].height / 2);
    }
  }
});

test('music visuals render below dimming and notes without changing note commands or coordinates', () => {
  assert.ok(RenderLayer.MUSIC_BACKGROUND < RenderLayer.BACKGROUND_DIM);
  assert.ok(RenderLayer.BACKGROUND_DIM < RenderLayer.HIT_OBJECT);
  const context = canvasContext();
  const mapper = new CoordinateMapper(1024, 768, 2);
  const renderer = new PlayfieldRenderer(context, mapper, {});
  const note = { id: 1, startTimeMs: 1000, position: { x: 100, y: 200 }, radius: 32 };
  const state = { circles: [note], sliders: [], spinners: [] };
  const commands = [];
  renderer.drawCircleCommand = (canvas, command) => {
    commands.push(structuredClone(command));
    assert.equal(canvas.filter, 'none');
    assert.equal(canvas.globalAlpha, 1);
    context.calls.push({ type: 'note' });
  };
  renderer.drawHud = () => {};
  renderer.drawCursor = () => {};
  renderer.drawCursorTrail = () => {};
  renderer.render(state, 900, 1200);
  const originalCommands = structuredClone(commands);
  const originalState = structuredClone(state);
  const originalMapper = structuredClone(mapper);
  commands.length = 0;
  context.calls.length = 0;
  renderer.setMusicAnalysis(spectrum);
  renderer.render(state, 900, 1200);
  assert.deepEqual(commands, originalCommands);
  assert.deepEqual(state, originalState);
  assert.deepEqual(structuredClone(mapper), originalMapper);
  const firstNote = context.calls.findIndex((call) => call.type === 'note');
  const lastWave = context.calls.findLastIndex((call) => call.type === 'wave');
  const dim = context.calls.findIndex((call, index) => index > lastWave && call.type === 'rect' && call.width === 1024);
  assert.ok(lastWave >= 0 && lastWave < dim && dim < firstNote);
  renderer.reducedMotion = true;
  context.calls.length = 0;
  renderer.render(state, 900, 1200);
  assert.equal(context.calls.some((call) => call.type === 'wave'), false);
});

test('only the background image changes geometry; reduced motion restores its original rectangle', () => {
  const context = canvasContext();
  const mapper = new CoordinateMapper(640, 480, 1);
  const renderer = new PlayfieldRenderer(context, mapper, {});
  const image = { width: 640, height: 480 };
  renderer.setBackground(image);
  renderer.drawBackground(context, 1000);
  const original = context.calls.find((call) => call.type === 'image').args;
  context.calls.length = 0;
  renderer.setMusicAnalysis(spectrum);
  renderer.drawBackground(context, 1000);
  const moving = context.calls.find((call) => call.type === 'image').args;
  assert.ok(moving[3] > original[3] && moving[4] > original[4]);
  context.calls.length = 0;
  renderer.reducedMotion = true;
  renderer.drawBackground(context, 1000);
  assert.deepEqual(context.calls.find((call) => call.type === 'image').args, original);
});
