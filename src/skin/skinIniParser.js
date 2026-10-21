// @ts-check

/** @type {Readonly<Record<string, readonly [string, string]>>} */
const GENERAL_KEYS = Object.freeze({
  Name: ['name', 'string'],
  Author: ['author', 'string'],
  Version: ['version', 'string'],
  SliderBallFlip: ['sliderBallFlip', 'boolean'],
  CursorRotate: ['cursorRotate', 'boolean'],
  CursorTrailRotate: ['cursorTrailRotate', 'boolean'],
  CursorExpand: ['cursorExpand', 'boolean'],
  CursorCentre: ['cursorCentre', 'boolean'],
  SliderBallFrames: ['sliderBallFrames', 'number'],
  SpinnerFadePlayfield: ['spinnerFadePlayfield', 'boolean'],
  ComboBurstRandom: ['comboBurstRandom', 'boolean'],
  AllowSliderBallTint: ['allowSliderBallTint', 'boolean'],
  LayeredHitSounds: ['layeredHitSounds', 'boolean'],
  SliderStyle: ['sliderStyle', 'number'],
});

/** @type {Readonly<Record<string, readonly [string, string]>>} */
const FONT_KEYS = Object.freeze({
  HitCirclePrefix: ['hitCirclePrefix', 'string'],
  HitCircleOverlap: ['hitCircleOverlap', 'number'],
  ScorePrefix: ['scorePrefix', 'string'],
  ScoreOverlap: ['scoreOverlap', 'number'],
  ComboPrefix: ['comboPrefix', 'string'],
  ComboOverlap: ['comboOverlap', 'number'],
});

/** @param {string} value @param {string} type */
function parseValue(value, type) {
  if (type === 'string') return value.trim();
  if (type === 'boolean') {
    const number = Number(value);
    return number === 0 || number === 1 ? Boolean(number) : null;
  }
  if (type === 'number') {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

/** @param {string} value */
function parseColour(value) {
  const channels = value.split(',').map((channel) => Number(channel.trim()));
  return channels.length === 3 && channels.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255)
    ? channels
    : null;
}

/**
 * @param {string} source
 * @returns {{
 *   general: Record<string, any>,
 *   colours: Record<string, any> & { comboColours: number[][] },
 *   fonts: Record<string, any>,
 *   warnings: string[],
 * }}
 */
export function parseSkinIni(source) {
  const warnings = [];
  const normalized = source.replace(/^\uFEFF/, '');
  if (!normalized.split(/\r?\n/).some((line) => line.trim() === '[General]')) {
    throw new Error('SKIN_GENERAL_SECTION_MISSING');
  }

  /** @type {Record<string, unknown>} */
  const general = {};
  /** @type {Record<string, unknown>} */
  const fonts = {};
  /** @type {number[][]} */
  const comboColours = [];
  /** @type {Record<string, number[]>} */
  const colours = {};
  let section = '';

  for (const rawLine of normalized.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//')) continue;
    const sectionMatch = line.match(/^\[([^\]]+)]$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      continue;
    }
    const delimiter = line.indexOf(':');
    if (delimiter < 0) continue;
    const key = line.slice(0, delimiter).trim();
    const value = line.slice(delimiter + 1).split('//', 1)[0].trim();

    if (section === 'General') {
      const definition = GENERAL_KEYS[key];
      if (!definition) {
        warnings.push(`SKIN_UNKNOWN_KEY:General.${key}`);
        continue;
      }
      const parsed = parseValue(value, definition[1]);
      if (parsed !== null && parsed !== '') general[definition[0]] = parsed;
    } else if (section === 'Fonts') {
      const definition = FONT_KEYS[key];
      if (!definition) {
        warnings.push(`SKIN_UNKNOWN_KEY:Fonts.${key}`);
        continue;
      }
      const parsed = parseValue(value, definition[1]);
      if (parsed !== null && parsed !== '') fonts[definition[0]] = parsed;
    } else if (section === 'Colours') {
      const parsed = parseColour(value);
      if (!parsed) continue;
      const comboMatch = key.match(/^Combo([1-8])$/);
      if (comboMatch) comboColours[Number(comboMatch[1]) - 1] = parsed;
      else colours[key] = parsed;
    }
  }

  return {
    general: { layeredHitSounds: true, ...general },
    colours: { ...colours, comboColours: comboColours.filter(Boolean) },
    fonts,
    warnings,
  };
}

/**
 * @param {string[]} manifestPaths
 * @param {number} declaredFrames
 * @returns {string[]}
 */
export function resolveSliderBallAssets(manifestPaths, declaredFrames) {
  const available = new Set(manifestPaths);
  const frames = [];
  for (let index = 0; index < declaredFrames; index += 1) {
    const frame = `sliderb${index}.png`;
    if (!available.has(frame)) break;
    frames.push(frame);
  }
  if (frames.length > 0) return frames;
  return available.has('sliderb.png') ? ['sliderb.png'] : [];
}
