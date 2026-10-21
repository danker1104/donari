// @ts-check

import { StoryboardDecoder } from 'osu-parsers';
import { LoopType, Origins, StoryboardAnimation, StoryboardSample } from 'osu-classes';

const LAYERS = ['Background', 'Fail', 'Pass', 'Foreground', 'Overlay'];
const FINALIZER_PATH = '__storyboard_adapter_finalize__';

/** @param {string} source */
function eventBody(source) {
  const lines = source.replace(/^\uFEFF/, '').split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === '[Events]');
  if (start < 0) return '';
  const body = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index].trim().startsWith('[')) break;
    body.push(lines[index]);
  }
  return `${body.join('\n')}\nSample,-999999,Background,"${FINALIZER_PATH}",0`;
}

/** @param {any[]} commands @param {string[]} diagnostics @param {string} objectId */
function adaptCommands(commands, diagnostics, objectId) {
  const adapted = [];
  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index];
    if (command.type === 'MX' && commands[index + 1]?.type === 'MY') {
      const y = commands[index + 1];
      adapted.push({ type: 'M', easing: command.easing, startTimeMs: command.startTime, endTimeMs: command.endTime,
        startValue: [Number(command.startValue), Number(y.startValue)], endValue: [Number(command.endValue), Number(y.endValue)], order: adapted.length });
      index += 1;
    } else if (command.type === 'F' || command.type === 'S') {
      adapted.push({ type: command.type, easing: command.easing, startTimeMs: command.startTime, endTimeMs: command.endTime,
        startValue: Number(command.startValue), endValue: Number(command.endValue), order: adapted.length });
    } else diagnostics.push(`STORYBOARD_COMMAND_SKIPPED: ${objectId} ${String(command.type)}`);
  }
  return adapted;
}

/** @param {string} source @param {'osu'|'osb'} sourceKind */
function decodeSource(source, sourceKind) {
  const parsed = new StoryboardDecoder().decodeFromString(eventBody(source));
  /** @type {Map<string, Array<any>>} */
  const layers = new Map(LAYERS.map((name) => [name, []]));
  const samples = [];
  /** @type {string[]} */
  const diagnostics = [];
  for (const name of LAYERS) {
    const parsedLayer = parsed.layers.get(name);
    if (!parsedLayer) continue;
    for (let index = 0; index < parsedLayer.elements.length; index += 1) {
      const element = /** @type {any} */ (parsedLayer.elements[index]);
      const id = `${sourceKind}-${name}-${index}`;
      const path = String(element.filePath ?? '').replaceAll('\\', '/');
      if (path === FINALIZER_PATH) continue;
      if (element instanceof StoryboardSample) {
        samples.push({ id, layer: name, startTimeMs: Number(element.startTime), path, volume: Number(element.volume) / 100 });
        continue;
      }
      const commands = adaptCommands(element.commands ?? [], diagnostics, id);
      const object = {
        id, source: sourceKind, layer: name,
        kind: element instanceof StoryboardAnimation ? 'animation' : 'sprite',
        path,
        origin: String(Origins[element.origin] ?? 'Centre'),
        position: { x: Number(element.startPosition.x), y: Number(element.startPosition.y) },
        startTimeMs: commands.length ? Math.min(...commands.map((command) => command.startTimeMs)) : Number(element.startTime ?? 0),
        endTimeMs: commands.length ? Math.max(...commands.map((command) => command.endTimeMs)) : Number(element.endTime ?? 0),
        commands,
        frameCount: Number(element.frameCount ?? 1),
        frameDelayMs: Number(element.frameDelay ?? 0),
        loopForever: element.loopType === LoopType.LoopForever,
      };
      layers.get(name)?.push(object);
    }
  }
  return { layers, samples, diagnostics };
}

/** @param {string} osuSource @param {string} osbSource */
export function decodeStoryboardText(osuSource, osbSource) {
  const embedded = decodeSource(osuSource, 'osu');
  const shared = decodeSource(osbSource, 'osb');
  return {
    layers: LAYERS.map((name) => ({ name, objects: [...(embedded.layers.get(name) ?? []), ...(shared.layers.get(name) ?? [])] })),
    samples: [...embedded.samples, ...shared.samples],
    diagnostics: [...embedded.diagnostics, ...shared.diagnostics],
  };
}

/** @param {any} storyboard */
export function storyboardImagePaths(storyboard) {
  const paths = new Set();
  for (const object of storyboard.layers.flatMap((/** @type {any} */ layer) => layer.objects)) {
    if (object.kind !== 'animation') { paths.add(object.path); continue; }
    const dot = object.path.lastIndexOf('.');
    const base = dot < 0 ? object.path : object.path.slice(0, dot);
    const extension = dot < 0 ? '' : object.path.slice(dot);
    for (let frame = 0; frame < object.frameCount; frame += 1) paths.add(`${base}${frame}${extension}`);
  }
  return [...paths];
}
