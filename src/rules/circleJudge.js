// @ts-check

/**
 * @param {{position:{x:number,y:number},radius:number,startTimeMs:number}} circle
 * @param {{mapTimeMs:number,playfieldPosition:{x:number,y:number}}} press
 * @param {{hit300:number,hit100:number,hit50:number}} windows
 * @returns {'300'|'100'|'50'|null}
 */
export function judgeCirclePress(circle, press, windows) {
  const dx = press.playfieldPosition.x - circle.position.x;
  const dy = press.playfieldPosition.y - circle.position.y;
  if (dx * dx + dy * dy > circle.radius * circle.radius) return null;

  const error = Math.abs(press.mapTimeMs - circle.startTimeMs);
  if (error <= windows.hit300) return '300';
  if (error <= windows.hit100) return '100';
  if (error <= windows.hit50) return '50';
  return null;
}

/**
 * @template {{startTimeMs:number,resolved:boolean}} T
 * @param {T[]} objects
 * @param {number} mapTimeMs
 * @param {number} hit50WindowMs
 * @returns {T|null}
 */
export function selectNotelockedCandidate(objects, mapTimeMs, hit50WindowMs) {
  for (const object of objects) {
    if (object.resolved) continue;
    if (Math.abs(mapTimeMs - object.startTimeMs) <= hit50WindowMs) return object;
  }
  return null;
}
