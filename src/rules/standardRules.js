// @ts-check

/** @typedef {'SS' | 'S' | 'A' | 'B' | 'C' | 'D'} Rank */

export const RULESET_VERSION = 5;
export const BEGINNER_HIT_WINDOW_MULTIPLIER = 1.25;

/**
 * @param {number} approachRate
 * @returns {number}
 */
export function approachRateToPreempt(approachRate) {
  if (approachRate < 5) {
    return 1200 + 120 * (5 - approachRate);
  }

  if (approachRate > 5) {
    return 1200 - 150 * (approachRate - 5);
  }

  return 1200;
}

/**
 * @param {number} circleSize
 * @returns {number}
 */
export function circleSizeToRadius(circleSize) {
  return 54.4 - 4.48 * circleSize;
}

/**
 * @param {number} overallDifficulty
 * @returns {{ hit300: number, hit100: number, hit50: number }}
 */
export function getHitWindows(overallDifficulty) {
  return {
    hit300: (80 - 6 * overallDifficulty) * BEGINNER_HIT_WINDOW_MULTIPLIER,
    hit100: (140 - 8 * overallDifficulty) * BEGINNER_HIT_WINDOW_MULTIPLIER,
    hit50: (200 - 10 * overallDifficulty) * BEGINNER_HIT_WINDOW_MULTIPLIER,
  };
}

/**
 * @param {{ hit300: number, hit100: number, hit50: number, miss: number }} counts
 * @returns {Rank}
 */
export function getRank(counts) {
  const total = counts.hit300 + counts.hit100 + counts.hit50 + counts.miss;
  if (total === 0) return 'D';

  const accuracy = (300 * counts.hit300 + 100 * counts.hit100 + 50 * counts.hit50) / (300 * total);
  const hit300Ratio = counts.hit300 / total;
  const hit50Ratio = counts.hit50 / total;

  if (accuracy === 1) return 'SS';
  if (hit300Ratio > 0.9 && hit50Ratio <= 0.01 && counts.miss === 0) return 'S';
  if ((hit300Ratio > 0.8 && counts.miss === 0) || hit300Ratio > 0.9) return 'A';
  if ((hit300Ratio > 0.7 && counts.miss === 0) || hit300Ratio > 0.8) return 'B';
  if (hit300Ratio > 0.6) return 'C';
  return 'D';
}
