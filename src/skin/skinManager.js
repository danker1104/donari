// @ts-check

import { parseSkinIni } from './skinIniParser.js';

export class SkinManager {
  /** @param {(url:string)=>Promise<Response>} fetcher */
  constructor(fetcher) {
    this.fetcher = fetcher;
    /** @type {Map<string, CanvasImageSource>} */
    this.images = new Map();
    this.config = parseSkinIni('[General]\nVersion: latest');
    /** @type {Record<string, string|string[]|null>} */
    this.roles = {};
    /** @type {string[]} */
    this.diagnostics = [];
  }

  /** @param {string} source */
  configure(source) {
    this.config = parseSkinIni(source);
    this.diagnostics = [...this.config.warnings];
    return this.config;
  }

  /** @param {Record<string, string|string[]|null>} roles */
  configureRoles(roles) {
    this.roles = { ...roles };
  }

  /** @param {string} role */
  getRole(role) {
    const name = this.roles[role];
    return typeof name === 'string' ? this.get(name) : null;
  }

  /** @param {string} role @param {number} index */
  getRoleAt(role, index) {
    const names = this.roles[role];
    return Array.isArray(names) && typeof names[index] === 'string' ? this.get(names[index]) : null;
  }

  /** @param {string} role */
  hasRole(role) {
    return this.roles[role] !== undefined && this.roles[role] !== null;
  }

  /**
   * @param {string[]} names
   * @param {Set<string>} required
   * @param {(name:string)=>string} resolveUrl
   */
  async loadPlannedImages(names, required, resolveUrl) {
    await Promise.all(names.map(async (name) => {
      try {
        const image = await this.loadImage(name, resolveUrl(name));
        if (image) {
          this.registerLogicalCounterpart(name, image);
          return;
        }
      } catch { /* exact @2x counterpart retry below */ }
      if (name.endsWith('@2x.png')) {
        const counterpart = name.replace(/@2x\.png$/, '.png');
        try {
          const image = await this.loadImage(name, resolveUrl(counterpart));
          if (image) {
            this.registerLogicalCounterpart(name, image);
            this.diagnostics.push(`SKIN_HIGH_RESOLUTION_FALLBACK: ${name} -> ${counterpart}`);
            return;
          }
        } catch { /* report the requested logical role below */ }
      }
      if (required.has(name)) throw new Error(`SKIN_REQUIRED_IMAGE_LOAD_FAILED: ${name}`);
      this.diagnostics.push(`SKIN_OPTIONAL_IMAGE_LOAD_FAILED: ${name}`);
    }));
  }

  /** @param {string} name @param {CanvasImageSource} image */
  registerLogicalCounterpart(name, image) {
    if (name.endsWith('@2x.png')) this.images.set(name.replace(/@2x\.png$/, '.png'), image);
  }

  /** @param {string} name @param {string} url */
  async loadImage(name, url) {
    const response = await this.fetcher(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    let image;
    if (typeof createImageBitmap === 'function') image = await createImageBitmap(blob);
    else image = await loadHtmlImage(url);
    this.images.set(name, image);
    return image;
  }

  /** @param {string} name */
  get(name) {
    return this.images.get(name) ?? null;
  }
}

/** @param {string} url @returns {Promise<HTMLImageElement>} */
function loadHtmlImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`IMAGE_DECODE_FAILED: ${url}`));
    image.src = url;
  });
}
