import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHitFeedback, HitFeedbackTimeline, MAX_HIT_FEEDBACK_EFFECTS } from '../src/renderer/hitFeedback.js';
import { PlayfieldRenderer } from '../src/renderer/playfieldRenderer.js';
import { CoordinateMapper } from '../src/input/coordinateMapper.js';
import { getHitWindows } from '../src/rules/standardRules.js';
import { createSliderRuntime, judgeSliderHeadPress, judgeSliderPart } from '../src/rules/sliderJudge.js';
import { GameplayState } from '../src/rules/gameplayState.js';

const circle = { position: { x: 100, y: 120 }, radius: 32 };
const slider = {
  ...circle,
  parts: ['head', 'tick', 'repeat', 'tail'].map((kind, index) => ({
    id: `${kind}-${index}`, kind, position: { x: 100 + index * 50, y: 120 },
  })),
};
const colors = { 300: '#62f5dc', 100: '#72b5ff', 50: '#ffd166', miss: '#ff5c88' };

test('each accuracy judgement has its own burst color and keeps its skin label', () => {
  for (const grade of ['300', '100', '50', 'miss']) {
    const effect = createHitFeedback({ type: 'circle-judged', judgement: grade, mapTimeMs: 1000 }, circle, 1100);
    assert.equal(effect.grade, grade);
    assert.equal(effect.tone, colors[grade]);
    assert.equal(effect.assetName, `hit${grade === 'miss' ? '0' : grade}.png`);
    assert.equal(effect.startTimeMs, 1000);
    assert.deepEqual(effect.position, circle.position);
    assert.ok(effect.durationMs <= 500);
    assert.ok(effect.particles <= 12);
    if (grade === 'miss') assert.equal(effect.particles, 0);
  }
});

test('slider head, intermediate ticks, repeats and tail have positioned hit and miss feedback', () => {
  const radii = new Set();
  for (const part of slider.parts) {
    for (const result of ['hit', 'miss']) {
      const effect = createHitFeedback({ type: 'slider-part', kind: part.kind, partId: part.id, result }, slider, 1000);
      assert.equal(effect.kind, part.kind);
      assert.deepEqual(effect.position, part.position);
      assert.equal(effect.grade, result === 'miss' ? 'miss' : '300');
      assert.equal(effect.tone, colors[effect.grade]);
      assert.equal(effect.startTimeMs, 1000);
      assert.equal(effect.assetName, undefined);
      if (result === 'hit') radii.add(effect.radius);
    }
  }
  assert.equal(radii.size, 4);
  const nested = { ...slider, nestedParts: slider.parts, parts: undefined };
  assert.deepEqual(
    createHitFeedback({ type: 'slider-part', partId: 'tick-1', result: 'hit' }, nested, 1000).position,
    slider.parts[1].position,
  );
});

test('slider head color follows the actual timing windows including early and late hits', () => {
  const windows = getHitWindows(8.5);
  for (const [error, grade] of [[0, '300'], [44.25, '300'], [44.26, '100'], [90, '100'], [90.01, '50']]) {
    for (const sign of [-1, 1]) {
      const effect = createHitFeedback({
        type: 'slider-part', kind: 'head', partId: 'head-0', result: 'hit', hitErrorMs: error * sign,
      }, slider, 1000, windows);
      assert.equal(effect.grade, grade);
      assert.equal(effect.tone, colors[grade]);
    }
  }
});

test('final slider judgement appears at the tail and spinner feedback at playfield center', () => {
  const event = { type: 'slider-judged', judgement: '100' };
  assert.deepEqual(createHitFeedback(event, slider, 1000).position, slider.parts[3].position);
  assert.deepEqual(createHitFeedback({ ...event, type: 'spinner-judged' }, circle, 1000).position, { x: 256, y: 192 });
  assert.equal(createHitFeedback(event, null, 1000), null);
  assert.equal(createHitFeedback({ type: 'spinner-progress' }, circle, 1000), null);
  assert.equal(createHitFeedback({ type: 'slider-part', partId: 'absent', result: 'hit' }, slider, 1000), null);
});

test('effect timeline hides future effects, expires effects and bounds dense bursts', () => {
  const timeline = new HitFeedbackTimeline();
  const effect = createHitFeedback({ type: 'circle-judged', judgement: '300' }, circle, 1000);
  timeline.push(null);
  timeline.push(effect);
  assert.equal(timeline.snapshot(999).length, 0);
  assert.equal(timeline.snapshot(1000)[0].progress, 0);
  assert.equal(timeline.snapshot(1230)[0].progress, 0.5);
  assert.equal(timeline.snapshot(1460).length, 0);
  for (let index = 0; index < MAX_HIT_FEEDBACK_EFFECTS + 20; index += 1) {
    timeline.push({ ...effect, startTimeMs: index });
  }
  assert.equal(timeline.effects.length, MAX_HIT_FEEDBACK_EFFECTS);
  assert.equal(timeline.effects[0].startTimeMs, 20);
  assert.equal(timeline.snapshot(10000).length, 0);
});

test('real slider judgement events produce all stage effects without changing scores or runtime', () => {
  const windows = getHitWindows(5);
  const runtime = createSliderRuntime({
    ...circle, id: 1, kind: 'slider', startTimeMs: 1000, endTimeMs: 1300,
    nestedParts: slider.parts.map((part, index) => ({ ...part, timeMs: 1000 + index * 100 })),
  });
  const events = [judgeSliderHeadPress(runtime, { mapTimeMs: 1000, playfieldPosition: circle.position }, windows)];
  for (const part of runtime.parts.slice(1)) events.push(...judgeSliderPart(runtime, part, true, part.position));
  const gameplay = new GameplayState({ difficultyMultiplier: 1, hpDrainRate: 0 });
  const applied = gameplay.processFrame({
    previousTimeMs: 999, currentTimeMs: 1300, drainStartTimeMs: 1000, drainEndTimeMs: 1300, breaks: [], events,
  });
  const before = structuredClone({ runtime, score: gameplay.snapshot() });
  const effects = applied.map((event) => createHitFeedback(event, runtime, 1300, windows));
  assert.deepEqual(effects.map((effect) => effect.kind), ['head', 'tick', 'repeat', 'tail', 'judgement']);
  assert.ok(effects.every((effect) => effect.grade === '300'));
  assert.deepEqual({ runtime, score: gameplay.snapshot() }, before);
});

function drawingContext() {
  const calls = [];
  const stack = [];
  return {
    calls, globalAlpha: 0.75, globalCompositeOperation: 'source-over',
    save() { stack.push([this.globalAlpha, this.globalCompositeOperation]); },
    restore() { [this.globalAlpha, this.globalCompositeOperation] = stack.pop(); },
    translate(...args) { calls.push(['translate', ...args]); },
    beginPath() {}, closePath() {}, fill() {},
    arc(...args) { calls.push(['arc', ...args]); },
    moveTo(...args) { calls.push(['moveTo', ...args]); },
    lineTo(...args) { calls.push(['lineTo', ...args]); },
    stroke() { calls.push(['stroke', this.strokeStyle]); },
    drawImage(...args) { calls.push(['image', ...args]); },
  };
}

test('skin judgement images no longer suppress procedural bursts and canvas state is restored', () => {
  const mapper = new CoordinateMapper(1024, 768, 1);
  const image = {};
  const renderer = new PlayfieldRenderer({}, mapper, { get: () => image });
  for (const grade of ['300', '100', '50', 'miss']) {
    const context = drawingContext();
    const effect = { ...createHitFeedback({ type: 'circle-judged', judgement: grade }, circle, 1000), progress: 0.25 };
    renderer.drawHitFeedback(context, effect);
    assert.ok(context.calls.some(([kind, value]) => kind === 'stroke' && value === colors[grade]));
    assert.equal(context.calls.filter(([kind]) => kind === 'image').length, 1);
    assert.equal(context.globalAlpha, 0.75);
    assert.equal(context.globalCompositeOperation, 'source-over');
    const second = drawingContext();
    renderer.drawHitFeedback(second, effect);
    assert.deepEqual(context.calls, second.calls);
  }
});

test('every slider stage renders finite colored geometry without a skin image', () => {
  const mapper = new CoordinateMapper(640, 480, 2);
  const renderer = new PlayfieldRenderer({}, mapper, { get: () => null });
  for (const part of slider.parts) {
    for (const result of ['hit', 'miss']) {
      const context = drawingContext();
      const effect = createHitFeedback({ type: 'slider-part', partId: part.id, result }, slider, 1000);
      renderer.drawHitFeedback(context, { ...effect, progress: 0.4 });
      const point = mapper.playfieldToScreen(part.position);
      assert.deepEqual(context.calls[0], ['translate', point.x, point.y]);
      assert.ok(context.calls.some(([kind]) => kind === 'stroke'));
      for (const [kind, ...values] of context.calls) {
        if (kind !== 'stroke') assert.ok(values.every(Number.isFinite));
      }
    }
  }
});
