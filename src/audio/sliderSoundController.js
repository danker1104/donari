// @ts-check

export class SliderSoundController {
  /** @param {import('./audioEngine.js').AudioEngine} audio @param {import('./hitsoundResolver.js').HitSoundResolver} resolver */
  constructor(audio, resolver) {
    this.audio = audio;
    this.resolver = resolver;
    /** @type {Array<AudioBufferSourceNode>} */
    this.sources = [];
    this.activeName = '';
  }

  /** @param {Array<any>} sliders @param {boolean} holding @param {number} mapTimeMs */
  update(sliders, holding, mapTimeMs) {
    const slider = holding
      ? sliders.find((candidate) => candidate.tracking && mapTimeMs >= candidate.startTimeMs && mapTimeMs < candidate.endTimeMs)
      : null;
    const rawSet = slider?.samples?.[0]?.hitSound;
    const sampleSet = rawSet && rawSet !== 'None' ? String(rawSet).toLowerCase() : 'normal';
    const customIndex = Number(slider?.samples?.[0]?.customIndex || 1);
    const names = slider ? [`${sampleSet}-sliderslide.wav`, ...((slider.hitSound & 2) !== 0 ? [`${sampleSet}-sliderwhistle.wav`] : [])] : [];
    const key = names.join('|');
    if (key === this.activeName) return;
    this.stop(); this.activeName = key;
    for (const name of names) {
      const handle = this.resolver.resolve(name, customIndex);
      if (handle?.kind !== 'buffer') continue;
      const source = this.audio.playEffect(handle.buffer, 'effect', 0, 0.65); source.loop = true; this.sources.push(source);
    }
  }

  stop() { for (const source of this.sources) { try { source.stop(); } catch { /* already stopped */ } } this.sources = []; this.activeName = ''; }
}
