import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PlayfieldRenderer } from '../src/renderer/playfieldRenderer.js';
import { CoordinateMapper } from '../src/input/coordinateMapper.js';
import { GameplayState } from '../src/rules/gameplayState.js';

test('slider geometry is reused between frames and rebuilt after resize', () => {
  const originalPath = globalThis.Path2D;
  globalThis.Path2D = class { moveTo() {} lineTo() {} };
  try {
    const mapper = new CoordinateMapper(1024, 768, 1);
    let conversions = 0;
    const convert = mapper.playfieldToScreen.bind(mapper);
    mapper.playfieldToScreen = (point) => { conversions += 1; return convert(point); };
    const renderer = new PlayfieldRenderer({}, mapper, {});
    const slider = { pathPoints: [{ x: 0, y: 0 }, { x: 256, y: 192 }] };
    const first = renderer.getSliderGeometry(slider);
    for (let frame = 0; frame < 120; frame += 1) assert.equal(renderer.getSliderGeometry(slider), first);
    assert.equal(conversions, 2);
    mapper.update(640, 480, 2);
    const resized = renderer.getSliderGeometry(slider);
    assert.notEqual(resized, first);
    assert.equal(conversions, 4);
    assert.deepEqual(resized.points[0], mapper.playfieldToScreen(slider.pathPoints[0]));
  } finally {
    globalThis.Path2D = originalPath;
  }
});

test('normal gameplay skips diagnostic snapshots without changing judgement results', () => {
  const gameplay = new GameplayState({ difficultyMultiplier: 1, hpDrainRate: 0 });
  let snapshots = 0;
  const snapshot = gameplay.snapshot.bind(gameplay);
  gameplay.snapshot = () => { snapshots += 1; return snapshot(); };
  const frame = { previousTimeMs: 0, currentTimeMs: 10, drainStartTimeMs: 100, drainEndTimeMs: 200, breaks: [],
    events: [{ type: 'circle-judged', judgement: '300', mapTimeMs: 5 }] };
  gameplay.processFrame(frame);
  assert.equal(snapshots, 0);
  assert.equal(gameplay.judgements[300], 1);
  let diagnostic = null;
  gameplay.processFrame({ ...frame, onApplied: (event, before, after) => { diagnostic = { before, after }; } });
  assert.equal(snapshots, 2);
  assert.equal(diagnostic.before.judgements[300], 1);
  assert.equal(diagnostic.after.judgements[300], 2);
});