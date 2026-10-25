// @ts-check

/** @typedef {'300'|'100'|'50'|'miss'} FeedbackGrade */
/** @typedef {'judgement'|'head'|'tick'|'repeat'|'tail'} FeedbackKind */
/** @typedef {{position:{x:number,y:number},radius:number,startTimeMs:number,strength:number,durationMs:number,tone:string,particles:number,kind:FeedbackKind,grade:FeedbackGrade,assetName?:string}} HitFeedbackEffect */

const GRADE_STYLES = Object.freeze({
  '300': { strength: 1, durationMs: 460, tone: '#62f5dc', particles: 12 },
  '100': { strength: 0.78, durationMs: 420, tone: '#72b5ff', particles: 8 },
  '50': { strength: 0.6, durationMs: 400, tone: '#ffd166', particles: 6 },
  miss: { strength: 0.65, durationMs: 400, tone: '#ff5c88', particles: 0 },
});

const PART_STYLES = Object.freeze({
  head: { scale: 0.8, strength: 0.8, durationMs: 280, particles: 8 },
  tick: { scale: 0.38, strength: 0.55, durationMs: 200, particles: 4 },
  repeat: { scale: 0.72, strength: 0.85, durationMs: 320, particles: 8 },
  tail: { scale: 0.9, strength: 0.9, durationMs: 340, particles: 10 },
});

export const MAX_HIT_FEEDBACK_EFFECTS = 128;

/**
 * @param {any} event
 * @param {any} object
 * @param {number} mapTimeMs
 * @param {{hit300:number,hit100:number}} [windows]
 * @returns {HitFeedbackEffect|null}
 */
export function createHitFeedback(event, object, mapTimeMs, windows) {
  if (!object) return null;
  const startTimeMs = Number.isFinite(event.mapTimeMs) ? event.mapTimeMs : mapTimeMs;
  if (['circle-judged', 'slider-judged', 'spinner-judged'].includes(event.type)) {
    /** @type {FeedbackGrade} */
    const grade = event.judgement;
    const parts = object.parts ?? object.nestedParts ?? [];
    const position = event.type === 'spinner-judged' ? { x: 256, y: 192 }
      : event.type === 'slider-judged' ? { ...(parts.find((/** @type {any} */ part) => part.kind === 'tail')?.position ?? object.position) }
        : { ...object.position };
    return { position, radius: object.radius ?? 48, startTimeMs, kind: 'judgement', grade,
      assetName: `hit${grade === 'miss' ? '0' : grade}.png`, ...GRADE_STYLES[grade] };
  }
  if (event.type === 'slider-part') {
    const parts = object.parts ?? object.nestedParts ?? [];
    const part = parts.find((/** @type {any} */ candidate) => candidate.id === event.partId);
    if (!part) return null;
    /** @type {'head'|'tick'|'repeat'|'tail'} */
    const kind = part.kind;
    /** @type {FeedbackGrade} */
    const grade = event.result === 'miss' ? 'miss'
      : kind === 'head' && windows && Number.isFinite(event.hitErrorMs)
        ? Math.abs(event.hitErrorMs) <= windows.hit300 ? '300'
          : Math.abs(event.hitErrorMs) <= windows.hit100 ? '100' : '50'
        : '300';
    const style = PART_STYLES[kind];
    return { position: { ...part.position }, radius: (object.radius ?? 48) * style.scale,
      startTimeMs, kind, grade, tone: GRADE_STYLES[grade].tone, strength: style.strength,
      durationMs: style.durationMs, particles: grade === 'miss' ? 0 : style.particles };
  }
  return null;
}

export class HitFeedbackTimeline {
  constructor() {
    /** @type {HitFeedbackEffect[]} */
    this.effects = [];
  }

  /** @param {HitFeedbackEffect|null} effect */
  push(effect) {
    if (!effect) return;
    if (this.effects.length >= MAX_HIT_FEEDBACK_EFFECTS) this.effects.shift();
    this.effects.push(effect);
  }

  /** @param {number} mapTimeMs */
  snapshot(mapTimeMs) {
    this.effects = this.effects.filter((effect) => mapTimeMs - effect.startTimeMs < effect.durationMs);
    return this.effects.filter((effect) => mapTimeMs >= effect.startTimeMs)
      .map((effect) => ({ ...effect, progress: (mapTimeMs - effect.startTimeMs) / effect.durationMs }));
  }
}
