// @ts-check

import { StandardRuleset } from 'osu-standard-stable';

const standardRuleset = new StandardRuleset();

/**
 * Keep third-party Standard classes inside the adapter boundary.
 *
 * @param {import('osu-classes').IBeatmap} parsedBeatmap
 */
export function verifyStandardBeatmap(parsedBeatmap) {
  const standard = standardRuleset.applyToBeatmap(parsedBeatmap);
  return {
    maxCombo: standard.maxCombo,
    counts: {
      circles: standard.circles.length,
      sliders: standard.sliders.length,
      spinners: standard.spinners.length,
    },
    objects: standard.hitObjects.map((objectValue) => {
      const object = /** @type {any} */ (objectValue);
      const stackedPosition = {
        x: Number(object.stackedStartPosition.x),
        y: Number(object.stackedStartPosition.y),
      };
      if ('path' in object) {
        const start = object.stackedStartPosition;
        return {
          kind: 'slider',
          position: stackedPosition,
          endTimeMs: Number(object.endTime),
          pathPoints: object.path.calculatedPath.map((/** @type {any} */ point) => ({
            x: Number(start.x + point.x),
            y: Number(start.y + point.y),
          })),
          nestedParts: object.nestedHitObjects.map((/** @type {any} */ part, /** @type {number} */ index) => ({
            id: `${part.constructor.name}-${index}`,
            kind: part.constructor.name === 'SliderHead' ? 'head'
              : part.constructor.name === 'SliderTick' ? 'tick'
                : part.constructor.name === 'SliderRepeat' ? 'repeat' : 'tail',
            timeMs: Number(part.startTime),
            position: { x: Number(part.stackedStartPosition.x), y: Number(part.stackedStartPosition.y) },
          })),
        };
      }
      if ('spinsRequired' in object) {
        return {
          kind: 'spinner',
          requiredSpins: Number(object.spinsRequired),
          maximumBonusSpins: Number(object.maximumBonusSpins),
        };
      }
      return { kind: 'circle', position: stackedPosition };
    }),
  };
}
