// @ts-check

export const SETTINGS_KEY = 'web-osu:v2:settings';
export const RESULTS_KEY = 'web-osu:v2:best-results';
export const LEADERBOARD_KEY = 'web-osu:v1:leaderboards';
export const NICKNAME_KEY = 'web-osu:v1:nickname';

/** @param {unknown} value */
export function normalizeNickname(value) {
  if (typeof value !== 'string') return '';
  return Array.from(value.normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim().replace(/\s+/gu, ' ')).slice(0, 16).join('');
}

/** @param {any} entry */
function validRanking(entry) {
  return entry && typeof entry.id === 'string' && normalizeNickname(entry.nickname)
    && Number.isSafeInteger(entry.score) && entry.score >= 0
    && Number.isFinite(entry.accuracy) && entry.accuracy >= 0 && entry.accuracy <= 1
    && Number.isSafeInteger(entry.maxCombo) && entry.maxCombo >= 0
    && ['SS', 'S', 'A', 'B', 'C', 'D'].includes(entry.rank)
    && typeof entry.playedAt === 'string' && Number.isFinite(Date.parse(entry.playedAt));
}

/** @param {any} left @param {any} right */
export function compareRankings(left, right) {
  return right.score - left.score || right.accuracy - left.accuracy || right.maxCombo - left.maxCombo
    || left.playedAt.localeCompare(right.playedAt) || left.id.localeCompare(right.id);
}

export const DEFAULT_SETTINGS = Object.freeze({
  keyBindings: /** @type {[string,string]} */ (['KeyZ', 'KeyX']),
  offsetMs: 0,
  masterVolume: 1,
  musicVolume: 1,
  effectVolume: 1,
  storyboardVolume: 1,
  backgroundDim: 0.65,
  cursorScale: 1,
  cursorTrail: true,
  storyboardEnabled: true,
  hudDetailEnabled: true,
  inputOverlayEnabled: true,
  fpsEnabled: false,
  lastSongId: 'silhouette-399358',
  lastBeatmapId: 892534,
});

/** @param {unknown} value @param {number} minimum @param {number} maximum @param {number} fallback */
function numberInRange(value, minimum, maximum, fallback) {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum ? value : fallback;
}

/** @param {any} value */
export function normalizeSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  const bindings = Array.isArray(source.keyBindings) && source.keyBindings.length === 2
    && source.keyBindings.every((/** @type {any} */ key) => typeof key === 'string' && key.length > 0)
    && source.keyBindings[0] !== source.keyBindings[1]
    ? /** @type {[string,string]} */ ([source.keyBindings[0], source.keyBindings[1]]) : [...DEFAULT_SETTINGS.keyBindings];
  return {
    keyBindings: bindings,
    offsetMs: numberInRange(source.offsetMs, -200, 200, DEFAULT_SETTINGS.offsetMs),
    masterVolume: numberInRange(source.masterVolume, 0, 1, DEFAULT_SETTINGS.masterVolume),
    musicVolume: numberInRange(source.musicVolume, 0, 1, DEFAULT_SETTINGS.musicVolume),
    effectVolume: numberInRange(source.effectVolume, 0, 1, DEFAULT_SETTINGS.effectVolume),
    storyboardVolume: numberInRange(source.storyboardVolume, 0, 1, DEFAULT_SETTINGS.storyboardVolume),
    backgroundDim: numberInRange(source.backgroundDim, 0, 1, DEFAULT_SETTINGS.backgroundDim),
    cursorScale: numberInRange(source.cursorScale, 0.5, 2, DEFAULT_SETTINGS.cursorScale),
    cursorTrail: typeof source.cursorTrail === 'boolean' ? source.cursorTrail : DEFAULT_SETTINGS.cursorTrail,
    storyboardEnabled: typeof source.storyboardEnabled === 'boolean' ? source.storyboardEnabled : DEFAULT_SETTINGS.storyboardEnabled,
    hudDetailEnabled: typeof source.hudDetailEnabled === 'boolean' ? source.hudDetailEnabled : DEFAULT_SETTINGS.hudDetailEnabled,
    inputOverlayEnabled: typeof source.inputOverlayEnabled === 'boolean' ? source.inputOverlayEnabled : DEFAULT_SETTINGS.inputOverlayEnabled,
    fpsEnabled: typeof source.fpsEnabled === 'boolean' ? source.fpsEnabled : DEFAULT_SETTINGS.fpsEnabled,
    lastSongId: typeof source.lastSongId === 'string' ? source.lastSongId : DEFAULT_SETTINGS.lastSongId,
    lastBeatmapId: Number.isInteger(source.lastBeatmapId) ? source.lastBeatmapId : DEFAULT_SETTINGS.lastBeatmapId,
  };
}

/** @param {any} candidate @param {any} current */
export function isBetterResult(candidate, current) {
  if (!current) return true;
  if (candidate.score !== current.score) return candidate.score > current.score;
  if (candidate.accuracy !== current.accuracy) return candidate.accuracy > current.accuracy;
  if (candidate.maxCombo !== current.maxCombo) return candidate.maxCombo > current.maxCombo;
  return String(candidate.playedAt) < String(current.playedAt);
}

export class LocalRepository {
  /** @param {{getItem:(key:string)=>string|null,setItem:(key:string,value:string)=>void}} storage */
  constructor(storage) { this.storage = storage; this.memory = new Map(); this.volatileKeys = new Set(); }

  /** @param {string} key */
  read(key) {
    if (this.volatileKeys.has(key)) return this.memory.get(key) ?? null;
    try { return this.storage.getItem(key) ?? this.memory.get(key) ?? null; }
    catch { return this.memory.get(key) ?? null; }
  }

  /** @param {string} key @param {string} value */
  write(key, value) {
    this.memory.set(key, value);
    try { this.storage.setItem(key, value); this.volatileKeys.delete(key); return true; }
    catch { this.volatileKeys.add(key); return false; }
  }

  loadNickname() { return normalizeNickname(this.read(NICKNAME_KEY)); }

  loadLeaderboards() {
    try {
      const value = JSON.parse(this.read(LEADERBOARD_KEY) ?? '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch { return {}; }
  }

  /** @param {string} key */
  getLeaderboard(key) {
    const entries = this.loadLeaderboards()[key];
    if (!Array.isArray(entries)) return [];
    const best = new Map();
    for (const entry of entries.filter(validRanking).sort(compareRankings)) {
      const nickname = normalizeNickname(entry.nickname);
      const identity = nickname.toLocaleLowerCase('en-US');
      if (!best.has(identity)) best.set(identity, { ...entry, nickname });
    }
    return [...best.values()].slice(0, 100);
  }

  /** @param {string} key @param {unknown} nickname @param {any} result */
  submitRanking(key, nickname, result) {
    const name = normalizeNickname(nickname);
    const entry = { id: result?.id, nickname: name, score: result?.score, accuracy: result?.accuracy,
      maxCombo: result?.maxCombo, rank: result?.rank, playedAt: result?.playedAt };
    if (!name) throw new Error('NICKNAME_REQUIRED');
    if (!result?.cleared || !validRanking(entry)) throw new Error('CLEARED_RESULT_REQUIRED');
    const entries = this.getLeaderboard(key);
    const current = entries.find((item) => item.nickname.toLocaleLowerCase('en-US') === name.toLocaleLowerCase('en-US'));
    if (entries.some((item) => item.id === entry.id) || (current && compareRankings(entry, current) >= 0)) {
      this.write(NICKNAME_KEY, name);
      return { updated: false, persistent: !this.volatileKeys.has(LEADERBOARD_KEY), entries };
    }
    const next = entries.filter((item) => item !== current).concat(entry).sort(compareRankings).slice(0, 100);
    const boards = this.loadLeaderboards();
    const persistent = this.write(LEADERBOARD_KEY, JSON.stringify({ ...boards, [key]: next }));
    this.write(NICKNAME_KEY, name);
    return { updated: next.some((item) => item.id === entry.id), persistent, entries: next };
  }

  loadSettings() {
    try { return normalizeSettings(JSON.parse(this.read(SETTINGS_KEY) ?? 'null')); }
    catch { return normalizeSettings(null); }
  }

  /** @param {any} settings */
  saveSettings(settings) { const normalized = normalizeSettings(settings); this.write(SETTINGS_KEY, JSON.stringify(normalized)); return normalized; }

  /** @param {string} key */
  getBestResult(key) {
    try { return JSON.parse(this.read(RESULTS_KEY) ?? '{}')[key] ?? null; }
    catch { return null; }
  }

  /** @param {string} key @param {any} result */
  saveBestResult(key, result) {
    /** @type {Record<string,any>} */
    let results = {};
    try { results = JSON.parse(this.read(RESULTS_KEY) ?? '{}'); } catch { /* replace corrupt storage */ }
    const current = results[key] ?? null;
    if (!isBetterResult(result, current)) return { updated: false, result: current };
    results[key] = { ...result };
    this.write(RESULTS_KEY, JSON.stringify(results));
    return { updated: true, result: results[key] };
  }
}
