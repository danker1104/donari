// @ts-check

/** @param {Array<any>} objects @param {number[][]} comboColours */
export function decorateHitObjects(objects, comboColours) {
  const colours = comboColours.length > 0 ? comboColours : [[255, 255, 255]];
  let comboNumber = 0;
  let colourIndex = 0;
  let started = false;
  return objects.map((object) => {
    if (!started) {
      comboNumber = 1;
      colourIndex = 0;
      started = true;
    } else if (object.isNewCombo) {
      comboNumber = 1;
      colourIndex = (colourIndex + 1 + Math.max(0, object.comboOffset ?? 0)) % colours.length;
    } else comboNumber += 1;
    return { ...object, comboNumber, comboColour: [...colours[colourIndex]] };
  });
}

/**
 * @param {Array<any>} objects
 * @param {number} mapTimeMs
 * @param {number} preemptMs
 */
export function followPointSprites(objects, mapTimeMs, preemptMs) {
  const sprites = [];
  for (let index = 1; index < objects.length; index += 1) {
    const from = objects[index - 1];
    const to = objects[index];
    if (to.isNewCombo || from.kind === 'spinner' || to.kind === 'spinner') continue;
    if (mapTimeMs < to.startTimeMs - preemptMs || mapTimeMs > to.startTimeMs) continue;
    const start = from.kind === 'slider' ? from.pathPoints.at(-1) ?? from.position : from.position;
    const end = to.position;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.hypot(dx, dy);
    const count = Math.max(0, Math.floor((distance - 64) / 32));
    for (let pointIndex = 1; pointIndex <= count; pointIndex += 1) {
      const ratio = pointIndex / (count + 1);
      sprites.push({
        fromId: from.id,
        toId: to.id,
        position: { x: start.x + dx * ratio, y: start.y + dy * ratio },
        angle: Math.atan2(dy, dx),
        opacity: Math.min(1, Math.max(0, (mapTimeMs - (to.startTimeMs - preemptMs)) / (preemptMs * 0.5))),
        // YUGEN exposes exactly followpoint-0..2. Cycling outside that
        // manifest-backed sequence would make the connector blink out.
        frame: Math.floor((mapTimeMs + pointIndex * 35) / 45) % 3,
      });
    }
  }
  return sprites;
}

/** @param {{pathPoints:Array<{x:number,y:number}>}} slider @param {{position:{x:number,y:number}}} repeat */
export function reverseArrowAngle(slider, repeat) {
  const first = slider.pathPoints[0] ?? repeat.position;
  const last = slider.pathPoints.at(-1) ?? repeat.position;
  const atEnd = Math.hypot(repeat.position.x - last.x, repeat.position.y - last.y)
    <= Math.hypot(repeat.position.x - first.x, repeat.position.y - first.y);
  return atEnd ? Math.atan2(first.y - last.y, first.x - last.x) : Math.atan2(last.y - first.y, last.x - first.x);
}

/** @param {number[]|undefined} colour */
export function comboColourCss(colour) {
  const [red, green, blue] = colour ?? [255, 255, 255];
  return `rgb(${red}, ${green}, ${blue})`;
}
