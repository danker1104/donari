// @ts-check

/** Soft attraction to the next hittable head; never generates presses or changes timing.
 * @param {{x:number,y:number}} point
 * @param {{position:{x:number,y:number},radius:number,startTimeMs:number}|null} target
 * @param {number} mapTimeMs
 * @param {number} windowMs
 */
export function assistAim(point, target, mapTimeMs, windowMs) {
  if (!target || Math.abs(mapTimeMs - target.startTimeMs) > Math.min(windowMs, 120)) return point;
  const dx = target.position.x - point.x;
  const dy = target.position.y - point.y;
  const distance = Math.hypot(dx, dy);
  if (!distance || distance > target.radius * 1.2) return point;
  const pull = Math.min(distance * 0.18, target.radius * 0.12);
  return { x: point.x + dx / distance * pull, y: point.y + dy / distance * pull };
}
