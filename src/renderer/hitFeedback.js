// @ts-check

/** @param {any} event @param {any} object @param {number} mapTimeMs */
export function createHitFeedback(event, object, mapTimeMs) {
  if (!object) return null;
  const startTimeMs = Number.isFinite(event.mapTimeMs) ? event.mapTimeMs : mapTimeMs;
  if (['circle-judged', 'slider-judged', 'spinner-judged'].includes(event.type)) {
    const properties = event.judgement === '300'
      ? { strength: 1, durationMs: 420, tone: '#ffffff' }
      : event.judgement === '100'
        ? { strength: 0.72, durationMs: 460, tone: '#7ee7ff' }
        : event.judgement === '50'
          ? { strength: 0.5, durationMs: 500, tone: '#ffc36e' }
          : { strength: 0.58, durationMs: 540, tone: '#ff557a' };
    const position = event.type === 'spinner-judged' ? { x: 256, y: 192 } : { ...object.position };
    return { position, radius: object.radius ?? 48, startTimeMs, assetName: `hit${event.judgement === 'miss' ? '0' : event.judgement}.png`, ...properties };
  }
  if (event.type === 'slider-part') {
    const parts = object.parts ?? object.nestedParts ?? [];
    const part = parts.find((/** @type {any} */ candidate) => candidate.id === event.partId);
    if (event.result !== 'hit' || !part) return null;
    const strength = event.kind === 'head' ? 0.82 : 0.42;
    return { position: { ...part.position }, radius: object.radius, startTimeMs, strength, durationMs: event.kind === 'head' ? 170 : 130, tone: event.kind === 'head' ? '#ffffff' : '#76edff' };
  }
  return null;
}

export class HitFeedbackTimeline {
  constructor() {
    /** @type {Array<any>} */
    this.effects = [];
  }

  /** @param {any|null} effect */
  push(effect) { if (effect) this.effects.push(effect); }

  /** @param {number} mapTimeMs */
  snapshot(mapTimeMs) {
    this.effects = this.effects.filter((effect) => mapTimeMs - effect.startTimeMs <= effect.durationMs);
    return this.effects.map((effect) => ({ ...effect, progress: Math.max(0, (mapTimeMs - effect.startTimeMs) / effect.durationMs) }));
  }
}
