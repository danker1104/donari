// @ts-check

/** @typedef {{kind:'silent'}|{kind:'buffer',buffer:any}} AudioHandle */

/** @param {Map<string,AudioHandle>} entries */
function caseFolded(entries) {
  return new Map([...entries].map(([name, handle]) => [name.toLowerCase(), handle]));
}

/** @param {string} name @param {number} index */
function indexedName(name, index) {
  if (index <= 1) return name;
  const dot = name.lastIndexOf('.');
  return dot < 0 ? `${name}${index}` : `${name.slice(0, dot)}${index}${name.slice(dot)}`;
}

/** @param {string} name @param {string} extension */
function withExtension(name, extension) {
  const dot = name.lastIndexOf('.');
  return `${dot < 0 ? name : name.slice(0, dot)}.${extension}`;
}

export class HitSoundResolver {
  /** @param {Map<string,AudioHandle>} beatmap @param {Map<string,AudioHandle>} skin @param {Map<string,AudioHandle>} [fallback] */
  constructor(beatmap, skin, fallback = new Map()) {
    this.beatmap = caseFolded(beatmap);
    this.skin = caseFolded(skin);
    this.fallback = caseFolded(fallback);
  }

  /** @param {string} name */
  resolveCustom(name) {
    return this.beatmap.get(name.toLowerCase()) ?? null;
  }

  /** @param {string} name @param {number} [customIndex] */
  resolve(name, customIndex = 1) {
    const indexed = indexedName(name, customIndex).toLowerCase();
    const unnumbered = name.toLowerCase();
    return this.beatmap.get(indexed)
      ?? this.beatmap.get(unnumbered)
      ?? this.skin.get(unnumbered)
      ?? this.skin.get(withExtension(unnumbered, unnumbered.endsWith('.wav') ? 'mp3' : 'wav'))
      ?? this.fallback.get(unnumbered)
      ?? this.fallback.get(withExtension(unnumbered, unnumbered.endsWith('.wav') ? 'mp3' : 'wav'))
      ?? null;
  }
}
