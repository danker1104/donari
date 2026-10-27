import assert from 'node:assert/strict';
import { test } from 'node:test';
import { judgeCirclePress } from '../src/rules/circleJudge.js';
import { getHitWindows, RULESET_VERSION } from '../src/rules/standardRules.js';
import { ObjectScheduler } from '../src/engine/objectScheduler.js';

test('early and late presses receive wider 100 and 50 grades without widening 300', () => {
  const windows = getHitWindows(8.5);
  assert.equal(windows.hit300, 44.25);
  assert.equal(windows.hit100, 150);
  assert.equal(windows.hit50, 263.75);

  const circle = { position: { x: 100, y: 100 }, radius: 32, startTimeMs: 1000 };
  const press = (mapTimeMs) => ({ mapTimeMs, playfieldPosition: { x: 100, y: 100 } });
  assert.equal(judgeCirclePress(circle, press(1044.25), windows), '300');
  assert.equal(judgeCirclePress(circle, press(1044.26), windows), '100');
  assert.equal(judgeCirclePress(circle, press(955.75), windows), '300');
  for (const sign of [-1, 1]) {
    assert.equal(judgeCirclePress(circle, press(1000 + sign * 150), windows), '100');
    assert.equal(judgeCirclePress(circle, press(1000 + sign * 150.01), windows), '50');
    assert.equal(judgeCirclePress(circle, press(1000 + sign * 263.75), windows), '50');
    assert.equal(judgeCirclePress(circle, press(1000 + sign * 263.76), windows), null);
  }
  assert.equal(RULESET_VERSION, 7);
});

test('a pending earlier note elsewhere cannot block an early press on the next circle', () => {
  const scheduler = new ObjectScheduler([
    {id:1,kind:'circle',position:{x:0,y:0},radius:32,startTimeMs:800},
    {id:2,kind:'circle',position:{x:200,y:100},radius:32,startTimeMs:1000},
  ], getHitWindows(4));
  const event = scheduler.press({mapTimeMs:750,playfieldPosition:{x:200,y:100}});
  assert.equal(event?.objectId,2);
  assert.equal(event?.judgement,'50');
  assert.equal(event?.hitErrorMs,-250);
  assert.equal(scheduler.circles.circles[0].resolved,false);
  assert.equal(scheduler.press({mapTimeMs:750,playfieldPosition:{x:400,y:300}}),null);
});
