import assert from 'node:assert/strict';
import { test } from 'node:test';
import { judgeCirclePress } from '../src/rules/circleJudge.js';
import { getHitWindows, RULESET_VERSION } from '../src/rules/standardRules.js';

test('300 timing is slightly more forgiving while 100 and 50 boundaries stay unchanged', () => {
  const windows = getHitWindows(8.5);
  assert.equal(windows.hit300, 44.25);
  assert.equal(windows.hit100, 90);
  assert.equal(windows.hit50, 143.75);

  const circle = { position: { x: 100, y: 100 }, radius: 32, startTimeMs: 1000 };
  const press = (mapTimeMs) => ({ mapTimeMs, playfieldPosition: { x: 100, y: 100 } });
  assert.equal(judgeCirclePress(circle, press(1044.25), windows), '300');
  assert.equal(judgeCirclePress(circle, press(1044.26), windows), '100');
  assert.equal(judgeCirclePress(circle, press(955.75), windows), '300');
  assert.equal(RULESET_VERSION, 6);
});
