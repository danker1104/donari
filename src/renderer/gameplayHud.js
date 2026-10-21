// @ts-check

/** @param {number} width @param {number} height */
export function gameplayHudLayout(width, height) {
  const margin = 24;
  const timingWidth = Math.min(300, width * 0.42);
  return {
    score: { x: width - margin, y: margin, align: 'right' },
    hp: { x: margin, y: margin, width: Math.min(360, width * 0.36) },
    accuracy: { x: width / 2, y: margin, align: 'center' },
    combo: { x: margin, y: height - 64 },
    input: { x: width - 96, y: height / 2 - 56 },
    timing: { x: (width - timingWidth) / 2, y: height - 30, width: timingWidth, centerX: width / 2 },
  };
}

/** @param {string} value @param {string} [prefix] @param {string} [symbolPrefix] */
export function scoreGlyphs(value, prefix = 'score', symbolPrefix = prefix) {
  /** @type {Record<string,string>} */
  const names = { '.': 'dot', ',': 'comma', '%': 'percent', x: 'x' };
  return [...value].map((character) => `${names[character] ? symbolPrefix : prefix}-${names[character] ?? character}.png`);
}

/** @param {number} accuracy @param {Record<string,number>} judgements */
export function hudAccuracy(accuracy, judgements) {
  const completed = (judgements[300] ?? 0) + (judgements[100] ?? 0) + (judgements[50] ?? 0) + (judgements.miss ?? 0);
  return completed === 0 ? 1 : accuracy;
}
