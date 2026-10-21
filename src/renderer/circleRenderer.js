// @ts-check

/** @param {number} value @param {number} minimum @param {number} maximum */
function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

/**
 * @param {{startTimeMs:number}} circle
 * @param {number} mapTimeMs
 * @param {number} preemptMs
 */
export function calculateCircleVisualState(circle, mapTimeMs, preemptMs) {
  const appearTimeMs = circle.startTimeMs - preemptMs;
  const fadeDurationMs = preemptMs * 2 / 3;
  return {
    opacity: clamp((mapTimeMs - appearTimeMs) / fadeDurationMs, 0, 1),
    approachScale: 1 + 3 * clamp((circle.startTimeMs - mapTimeMs) / preemptMs, 0, 1),
  };
}

/**
 * @param {{id:number,startTimeMs:number,position:{x:number,y:number},radius:number,comboNumber?:number,comboColour?:number[]}} circle
 * @param {number} mapTimeMs
 * @param {number} preemptMs
 */
export function createCircleDrawCommands(circle, mapTimeMs, preemptMs) {
  const visual = calculateCircleVisualState(circle, mapTimeMs, preemptMs);
  const common = { objectId: circle.id, position: circle.position, radius: circle.radius, opacity: visual.opacity, comboColour: circle.comboColour ?? [255, 255, 255] };
  return [
    { ...common, type: 'approach-circle', scale: visual.approachScale },
    { ...common, type: 'hit-circle', scale: 1 },
    { ...common, type: 'hit-circle-overlay', scale: 1 },
    { ...common, type: 'combo-number', scale: 1, value: circle.comboNumber ?? 1 },
  ];
}
