// @ts-check

/** @param {number} easingId @param {number} progress */
export function applyEasing(easingId, progress) {
  const value = Math.max(0, Math.min(1, progress));
  if (easingId === 0) return value;
  return value;
}

/** @param {number|number[]} start @param {number|number[]} end @param {number} progress */
function interpolate(start, end, progress) {
  if (Array.isArray(start) && Array.isArray(end)) return start.map((value, index) => value + (end[index] - value) * progress);
  return Number(start) + (Number(end) - Number(start)) * progress;
}

/** @param {Array<any>} commands @param {number} mapTimeMs @param {number|number[]} fallback */
export function evaluateCommands(commands, mapTimeMs, fallback) {
  const applicable = commands.filter((command) => command.startTimeMs <= mapTimeMs)
    .sort((left, right) => left.startTimeMs - right.startTimeMs || left.order - right.order);
  const command = applicable.at(-1);
  if (!command) return fallback;
  if (command.endTimeMs <= command.startTimeMs || mapTimeMs >= command.endTimeMs) return command.endValue;
  const progress = applyEasing(command.easing, (mapTimeMs - command.startTimeMs) / (command.endTimeMs - command.startTimeMs));
  return interpolate(command.startValue, command.endValue, progress);
}

/** @param {string} basePath @param {number} frameCount @param {number} frameDelayMs @param {boolean} loopForever @param {number} startTimeMs @param {number} mapTimeMs */
export function animationFramePath(basePath, frameCount, frameDelayMs, loopForever, startTimeMs, mapTimeMs) {
  const dot = basePath.lastIndexOf('.');
  const base = dot < 0 ? basePath : basePath.slice(0, dot);
  const extension = dot < 0 ? '' : basePath.slice(dot);
  const elapsedFrames = Math.max(0, Math.floor((mapTimeMs - startTimeMs) / Math.max(1, frameDelayMs)));
  const frame = loopForever ? elapsedFrames % frameCount : Math.min(frameCount - 1, elapsedFrames);
  return `${base}${frame}${extension}`;
}

/** @param {any} object @param {number} mapTimeMs */
export function evaluateStoryboardObject(object, mapTimeMs) {
  const opacity = /** @type {number} */ (evaluateCommands(object.commands.filter((/** @type {any} */ command) => command.type === 'F'), mapTimeMs, 1));
  const movement = /** @type {number[]} */ (evaluateCommands(object.commands.filter((/** @type {any} */ command) => command.type === 'M'), mapTimeMs, [object.position.x, object.position.y]));
  const scale = /** @type {number} */ (evaluateCommands(object.commands.filter((/** @type {any} */ command) => command.type === 'S'), mapTimeMs, 1));
  return { opacity, position: { x: movement[0], y: movement[1] }, scale: { x: scale, y: scale } };
}

/** @param {any} storyboard @param {number} mapTimeMs @param {'playing'|'failed'|'passed'} state */
export function activeStoryboardObjects(storyboard, mapTimeMs, state = 'playing') {
  return storyboard.layers.flatMap((/** @type {any} */ layer) => {
    if (layer.name === 'Fail' && state !== 'failed') return [];
    if (layer.name === 'Pass' && state !== 'passed') return [];
    return layer.objects.filter((/** @type {any} */ object) => mapTimeMs >= object.startTimeMs && mapTimeMs <= object.endTimeMs)
      .map((/** @type {any} */ object) => ({ ...object, evaluated: evaluateStoryboardObject(object, mapTimeMs),
        activePath: object.kind === 'animation' ? animationFramePath(object.path, object.frameCount, object.frameDelayMs, object.loopForever, object.startTimeMs, mapTimeMs) : object.path }));
  });
}
