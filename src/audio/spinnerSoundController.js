// @ts-check

export class SpinnerSoundController {
  /** @param {import('./audioEngine.js').AudioEngine} audio @param {import('./hitsoundResolver.js').HitSoundResolver} resolver */
  constructor(audio, resolver) {
    this.audio = audio;
    this.resolver = resolver;
    /** @type {AudioBufferSourceNode|null} */
    this.source = null;
    this.active = false;
  }

  /** @param {Array<any>} spinners @param {boolean} holding @param {number} mapTimeMs */
  update(spinners, holding, mapTimeMs) {
    const active = holding && spinners.some((spinner) => mapTimeMs >= spinner.startTimeMs && mapTimeMs < spinner.endTimeMs);
    if (active === this.active) return;
    this.stop();
    this.active = active;
    if (!active) return;
    const handle = this.resolver.resolve('spinnerspin.wav');
    if (handle?.kind !== 'buffer') return;
    const source = this.audio.playEffect(handle.buffer, 'effect', 0, 0.58);
    source.loop = true;
    this.source = source;
  }

  stop() {
    if (this.source) {
      try { this.source.stop(); } catch { /* already stopped */ }
    }
    this.source = null;
    this.active = false;
  }
}
