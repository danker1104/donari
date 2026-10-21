import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { SliderHead, SliderRepeat, SliderTail, SliderTick } from 'osu-standard-stable';
import { decodeBeatmapText } from '../src/beatmap/beatmapAdapter.js';

test('slider parts keep their roles when class names are changed by a production build', async () => {
  const beatmap = await readFile(new URL('../public/content/v2/silhouette/KANA-BOON - Silhouette (Kagetsu) [Easy].osu', import.meta.url), 'utf8');
  const types = [SliderHead, SliderRepeat, SliderTail, SliderTick];
  const originalConstructors = types.map((type) => Object.getOwnPropertyDescriptor(type.prototype, 'constructor'));
  try {
    for (const type of types) Object.defineProperty(type.prototype, 'constructor', { configurable: true, value: function a() {} });
    const decoded = decodeBeatmapText(beatmap);
    const sliders = decoded.hitObjects.filter((object) => object.kind === 'slider');
    const roles = sliders.flatMap((slider) => slider.nestedParts.map((part) => part.kind));
    assert.equal(sliders.length, 68);
    assert.equal(roles.filter((kind) => kind === 'head').length, sliders.length);
    assert.equal(roles.filter((kind) => kind === 'tail').length, sliders.length);
    assert.ok(roles.includes('repeat'));
    assert.ok(roles.includes('tick'));
  } finally {
    types.forEach((type, index) => Object.defineProperty(type.prototype, 'constructor', originalConstructors[index]));
  }
});
