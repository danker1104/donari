// @ts-check

import { BeatmapDecoder } from 'osu-parsers';
import { verifyStandardBeatmap } from './standardAdapter.js';

const decoder = new BeatmapDecoder();

/** @param {number} value */
function normalizeDifficultyValue(value) {
  return Number(value.toFixed(6));
}

/** @param {string} source */
function countTimingPointDeclarations(source) {
  let inTimingPoints = false;
  let count = 0;
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('[')) {
      inTimingPoints = line === '[TimingPoints]';
      continue;
    }
    if (inTimingPoints && line && !line.startsWith('//')) count += 1;
  }
  return count;
}

/** @param {any} sample */
function adaptSample(sample) {
  return {
    sampleSet: String(sample.sampleSet),
    hitSound: String(sample.hitSound),
    customIndex: Number(sample.customIndex),
    volume: Number(sample.volume),
    filename: String(sample.filename ?? ''),
  };
}

/** @param {any} object @param {number} id @param {any} standardObject */
function adaptHitObject(object, id, standardObject) {
  const base = {
    id,
    startTimeMs: Number(object.startTime),
    endTimeMs: Number(object.endTime ?? object.startTime),
    position: standardObject.position ?? { x: Number(object.startPosition.x), y: Number(object.startPosition.y) },
    hitSound: Number(object.hitSound),
    samples: object.samples.map(adaptSample),
    isNewCombo: Boolean(object.isNewCombo),
    comboOffset: Number(object.comboOffset ?? 0),
  };

  if (object.path) {
    return {
      ...base,
      kind: 'slider',
      curveType: String(object.path.curveType),
      controlPoints: object.path.controlPoints.map((/** @type {any} */ point) => ({
        x: Number(point.position.x),
        y: Number(point.position.y),
        type: point.type === null ? null : String(point.type),
      })),
      pixelLength: Number(object.path.expectedDistance),
      spanCount: Number(object.repeats) + 1,
      spanDurationMs: Number(object.spanDuration),
      legacyLastTickOffsetMs: Number(object.legacyLastTickOffset ?? 0),
      endTimeMs: standardObject.endTimeMs,
      pathPoints: standardObject.pathPoints,
      nestedParts: standardObject.nestedParts,
      edgeSamples: object.nodeSamples.map((/** @type {any[]} */ samples) => samples.map(adaptSample)),
    };
  }

  if ('endTime' in object) return {
    ...base,
    kind: 'spinner',
    requiredSpins: standardObject.requiredSpins,
    maximumBonusSpins: standardObject.maximumBonusSpins,
  };
  return { ...base, kind: 'circle' };
}

/** @param {any} point */
function pointStartTime(point) {
  return Number(point.group?.startTime ?? 0);
}

/**
 * Decode `.osu` text and immediately cross the parser-instance boundary.
 *
 * @param {string} source
 */
export function decodeBeatmapText(source) {
  const parsed = decoder.decodeFromString(source);
  if (parsed.mode !== 0) throw new Error(`BEATMAP_MODE_UNSUPPORTED: ${parsed.mode}`);

  const standardVerification = verifyStandardBeatmap(parsed);
  const hitObjects = parsed.hitObjects.map((object, index) => adaptHitObject(object, index, standardVerification.objects[index]));
  /** @type {Record<string, number>} */
  const counts = { circle: 0, slider: 0, spinner: 0 };
  for (const object of hitObjects) counts[object.kind] += 1;
  if (
    counts.circle !== standardVerification.counts.circles ||
    counts.slider !== standardVerification.counts.sliders ||
    counts.spinner !== standardVerification.counts.spinners
  ) {
    throw new Error('BEATMAP_STANDARD_COUNT_MISMATCH');
  }

  return {
    beatmapId: parsed.metadata.beatmapId,
    beatmapSetId: parsed.metadata.beatmapSetId,
    mode: 0,
    title: parsed.metadata.title,
    artist: parsed.metadata.artist,
    creator: parsed.metadata.creator,
    difficultyName: parsed.metadata.version,
    hpDrainRate: normalizeDifficultyValue(parsed.difficulty.drainRate),
    circleSize: normalizeDifficultyValue(parsed.difficulty.circleSize),
    overallDifficulty: normalizeDifficultyValue(parsed.difficulty.overallDifficulty),
    approachRate: normalizeDifficultyValue(parsed.difficulty.approachRate),
    sliderMultiplier: normalizeDifficultyValue(parsed.difficulty.sliderMultiplier),
    sliderTickRate: normalizeDifficultyValue(parsed.difficulty.sliderTickRate),
    stackLeniency: parsed.general.stackLeniency,
    audioPath: parsed.general.audioFilename,
    backgroundPath: parsed.events.backgroundPath,
    timingPoints: parsed.controlPoints.timingPoints.map((point) => ({
      startTimeMs: pointStartTime(point),
      beatLengthMs: Number(point.beatLengthUnlimited),
      timeSignature: Number(point.timeSignature),
    })),
    difficultyPoints: parsed.controlPoints.difficultyPoints.map((point) => ({
      startTimeMs: pointStartTime(point),
      sliderVelocity: Number(point.sliderVelocityUnlimited),
      generateTicks: Boolean(point.generateTicks),
    })),
    samplePoints: parsed.controlPoints.samplePoints.map((point) => ({
      startTimeMs: pointStartTime(point),
      sampleSet: String(point.sampleSet),
      customIndex: Number(point.customIndex),
      volume: Number(point.volume),
    })),
    effectPoints: parsed.controlPoints.effectPoints.map((point) => ({
      startTimeMs: pointStartTime(point),
      kiai: Boolean(point.kiai),
      omitFirstBarLine: Boolean(point.omitFirstBarLine),
    })),
    breaks: parsed.events.breaks.map((event) => ({
      startTimeMs: event.startTime,
      endTimeMs: event.endTime,
    })),
    hitObjects,
    standardMaxCombo: standardVerification.maxCombo,
    statistics: {
      timingPointCount: countTimingPointDeclarations(source),
      total: hitObjects.length,
      circles: counts.circle,
      sliders: counts.slider,
      spinners: counts.spinner,
      firstStartTimeMs: hitObjects[0]?.startTimeMs ?? 0,
      lastStartTimeMs: hitObjects.at(-1)?.startTimeMs ?? 0,
    },
  };
}
