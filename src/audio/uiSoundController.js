// @ts-check

export class UiSoundController {
  /** @param {any} engine @param {()=>Promise<Map<string,any>>} load */
  constructor(engine, load) {
    this.engine = engine;
    this.load = load;
    /** @type {Promise<Map<string,any>>|null} */
    this.pending = null;
  }

  async handles() {
    if (!this.pending) this.pending = this.load().catch(() => new Map());
    return this.pending;
  }

  /** @param {string} name */
  async play(name) {
    try {
      await this.engine.unlockFromGesture();
      const handle = (await this.handles()).get(name);
      if (handle?.kind !== 'buffer' || this.engine.context?.state !== 'running') return false;
      this.engine.playEffect(handle.buffer, 'effect', 0, 0.72);
      return true;
    } catch { return false; }
  }
}
