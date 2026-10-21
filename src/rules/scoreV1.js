// @ts-check

/** @typedef {{300:number,100:number,50:number,miss:number}} JudgementCounts */

/** @param {number} value @param {number} minimum @param {number} maximum */
function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

/** @param {{hp:number,cs:number,od:number,objectCount:number,drainTimeSeconds:number}} values */
export function calculateDifficultyMultiplier(values) {
  const density = values.drainTimeSeconds > 0 ? values.objectCount / values.drainTimeSeconds * 8 : 16;
  return Math.round((values.hp + values.cs + values.od + clamp(density, 0, 16)) / 38 * 5);
}

/** @param {50|100|300|number} hitValue @param {number} comboBeforeHit @param {number} difficultyMultiplier @param {number} [modMultiplier] */
export function calculateObjectScore(hitValue, comboBeforeHit, difficultyMultiplier, modMultiplier = 1) {
  const comboMultiplier = Math.max(comboBeforeHit - 1, 0);
  return Math.floor(hitValue * (1 + comboMultiplier * difficultyMultiplier * modMultiplier / 25));
}

/** @param {JudgementCounts} counts */
export function calculateAccuracy(counts) {
  const total = counts[300] + counts[100] + counts[50] + counts.miss;
  return total === 0 ? 0 : (300 * counts[300] + 100 * counts[100] + 50 * counts[50]) / (300 * total);
}

/** @param {JudgementCounts} counts @returns {'SS'|'S'|'A'|'B'|'C'|'D'} */
export function resultRank(counts) {
  const total = counts[300] + counts[100] + counts[50] + counts.miss;
  if (total === 0) return 'D';
  const accuracy = calculateAccuracy(counts);
  const ratio300 = counts[300] / total;
  const ratio50 = counts[50] / total;
  if (accuracy === 1) return 'SS';
  if (ratio300 > 0.9 && ratio50 <= 0.01 && counts.miss === 0) return 'S';
  if ((ratio300 > 0.8 && counts.miss === 0) || ratio300 > 0.9) return 'A';
  if ((ratio300 > 0.7 && counts.miss === 0) || ratio300 > 0.8) return 'B';
  if (ratio300 > 0.6) return 'C';
  return 'D';
}

/** @param {{statistics:{firstStartTimeMs:number},hitObjects:Array<{endTimeMs:number}>,breaks:Array<{startTimeMs:number,endTimeMs:number}>}} beatmap */
export function calculateDrainTimeSeconds(beatmap) {
  const start = beatmap.statistics.firstStartTimeMs;
  const end = Math.max(start, ...beatmap.hitObjects.map((object) => object.endTimeMs));
  let breakTime = 0;
  for (const period of beatmap.breaks) {
    breakTime += Math.max(0, Math.min(end, period.endTimeMs) - Math.max(start, period.startTimeMs));
  }
  return Math.max(0, end - start - breakTime) / 1000;
}
