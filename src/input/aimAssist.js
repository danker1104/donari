// @ts-check

const DEFAULT_AIM_ASSIST = Object.freeze({ range: 1.2, strength: 0.18, maxPull: 0.12 });
// Allow the full 25% pull throughout the enlarged beginner attraction range.
const BEGINNER_AIM_ASSIST = Object.freeze({ range: 1.5, strength: 0.25, maxPull: 1.5 * 0.25 });

/** @param {string} [difficulty] */
export function getAimAssistProfile(difficulty = '') {
  return ['easy', 'normal'].includes(difficulty.trim().toLowerCase())
    ? BEGINNER_AIM_ASSIST : DEFAULT_AIM_ASSIST;
}

/** @param {number} value */
function smoothstep(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

/** @param {string} [difficulty] */
export function usesSmoothAim(difficulty = '') {
  return getAimAssistProfile(difficulty) === BEGINNER_AIM_ASSIST;
}

/** Apply steering and overshoot resistance to sensitivity-scaled movement.
 * Integrating in small spatial steps keeps fast/slow pointer event rates close.
 * No position offset is removed when a target expires, resolves or changes.
 * @param {{x:number,y:number}} previous
 * @param {{x:number,y:number}} next
 * @param {{position:{x:number,y:number},radius:number,startTimeMs:number}|null} target
 * @param {number} mapTimeMs
 * @param {number} windowMs
 * @param {string} [difficulty]
 */
export function brakeAimMovement(previous, next, target, mapTimeMs, windowMs, difficulty = '') {
  if (!usesSmoothAim(difficulty) || !target || target.radius <= 0) return next;
  const window = Math.min(windowMs, 120);
  if (window <= 0) return next;
  const timeWeight = smoothstep((window - Math.abs(mapTimeMs - target.startTimeMs)) / (window / 3));
  if (!timeWeight) return next;
  const dx = next.x - previous.x, dy = next.y - previous.y;
  const length = Math.hypot(dx, dy);
  if (!length) return next;
  const ux = dx / length, uy = dy / length;
  // At most 1/32 radius per step, with a bound for extreme input jumps.
  const steps = Math.min(2048, Math.max(1, Math.ceil(length / (target.radius / 32))));
  const step = length / steps;
  let x = previous.x, y = previous.y;
  for (let i = 0; i < steps; i++) {
    const tx = target.position.x - x, ty = target.position.y - y;
    const distance = Math.hypot(tx, ty);
    const weight = timeWeight * smoothstep((1.5 - distance / target.radius) / 0.5);
    // The softened direction avoids a velocity discontinuity at the center.
    const denominator = Math.max(distance, target.radius * 0.35);
    const nx = tx / denominator, ny = ty / denominator;
    const alignment = ux * nx + uy * ny;
    const brake = 1 - 0.65 * weight * smoothstep(-alignment);
    // Steer sideways toward the center by up to 25%, without reversing travel.
    const steer = 0.25 * weight;
    x += step * (ux * brake + (nx - ux * alignment) * steer);
    y += step * (uy * brake + (ny - uy * alignment) * steer);
  }
  return { x, y };
}

/** Soft attraction to the next hittable head; never generates presses or changes timing.
 * @param {{x:number,y:number}} point
 * @param {{position:{x:number,y:number},radius:number,startTimeMs:number}|null} target
 * @param {number} mapTimeMs
 * @param {number} windowMs
 * @param {string} [difficulty]
 */
export function assistAim(point, target, mapTimeMs, windowMs, difficulty = '') {
  const profile = getAimAssistProfile(difficulty);
  if (!target || Math.abs(mapTimeMs - target.startTimeMs) > Math.min(windowMs, 120)) return point;
  const dx = target.position.x - point.x;
  const dy = target.position.y - point.y;
  const distance = Math.hypot(dx, dy);
  if (!distance || distance > target.radius * profile.range) return point;
  const pull = Math.min(distance * profile.strength, target.radius * profile.maxPull);
  return { x: point.x + dx / distance * pull, y: point.y + dy / distance * pull };
}
