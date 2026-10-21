// @ts-check

import { HealthProcessor } from './healthProcessor.js';
import { calculateAccuracy, calculateObjectScore, resultRank } from './scoreV1.js';

const HIT_VALUES = Object.freeze({ 300: 300, 100: 100, 50: 50, miss: 0 });

export class GameplayState {
  /** @param {{difficultyMultiplier:number,hpDrainRate:number,initialHealth?:number}} options */
  constructor(options) {
    this.difficultyMultiplier = options.difficultyMultiplier;
    this.health = new HealthProcessor(options.hpDrainRate, options.initialHealth ?? 1);
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.judgements = { 300: 0, 100: 0, 50: 0, miss: 0 };
    this.sliderBreaks = 0;
    this.spinnerBonus = 0;
  }

  get accuracy() { return calculateAccuracy(this.judgements); }
  get rank() { return resultRank(this.judgements); }
  get failed() { return this.health.failed; }

  /** @param {any} event */
  apply(event) {
    if (this.failed) return;
    if (event.type === 'slider-part') {
      if (event.result === 'hit') {
        this.score += event.kind === 'tick' ? 10 : 30;
        this.incrementCombo();
        this.health.applySliderPart();
      } else if (event.comboBreak) {
        this.combo = 0;
        this.sliderBreaks += 1;
      }
      return;
    }
    if (!['circle-judged', 'slider-judged', 'spinner-judged'].includes(event.type)) return;
    const judgement = /** @type {'300'|'100'|'50'|'miss'} */ (event.judgement);
    const comboBeforeHit = this.combo;
    this.judgements[judgement] += 1;
    this.score += calculateObjectScore(HIT_VALUES[judgement], comboBeforeHit, this.difficultyMultiplier);
    this.health.applyJudgement(judgement);

    if (event.type === 'circle-judged') {
      if (judgement === 'miss') this.combo = 0;
      else this.incrementCombo();
    } else if (event.type === 'spinner-judged') {
      if (judgement === 'miss') this.combo = 0;
      const completed = Number(event.completedSpins ?? 0);
      const required = Number(event.requiredSpins ?? Math.max(0, completed - Number(event.bonusSpins ?? 0)));
      const bonus = Math.max(0, Number(event.bonusSpins ?? 0));
      this.score += Math.min(completed, required) * 100 + bonus * 1100;
      this.spinnerBonus += bonus;
      this.health.applySpinnerBonus(bonus);
    }
  }

  incrementCombo() {
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
  }

  /**
   * Drain and apply a frame's events at their authoritative map timestamps.
   * Later events are discarded after failure is latched.
   *
   * @param {{
   *   previousTimeMs:number,
   *   currentTimeMs:number,
   *   drainStartTimeMs:number,
   *   drainEndTimeMs:number,
   *   breaks:Array<{startTimeMs:number,endTimeMs:number}>,
   *   events:Array<any>,
   *   onApplied?:(event:any,before:ReturnType<GameplayState['snapshot']>,after:ReturnType<GameplayState['snapshot']>)=>void,
   * }} frame
   */
  processFrame(frame) {
    const start = Math.min(frame.previousTimeMs, frame.currentTimeMs);
    const end = Math.max(frame.previousTimeMs, frame.currentTimeMs);
    const ordered = frame.events
      .map((event, index) => ({ event, index, mapTimeMs: Number.isFinite(event.mapTimeMs) ? event.mapTimeMs : end }))
      .sort((left, right) => left.mapTimeMs - right.mapTimeMs || left.index - right.index);
    /** @type {Array<any>} */
    const applied = [];
    let cursor = start;
    const drainTo = (/** @type {number} */ target) => {
      const drainStart = Math.max(cursor, frame.drainStartTimeMs);
      const drainEnd = Math.min(target, frame.drainEndTimeMs);
      if (drainEnd > drainStart) this.health.advance(drainStart, drainEnd, frame.breaks);
      cursor = Math.max(cursor, target);
    };

    for (const item of ordered) {
      const eventTime = Math.max(start, Math.min(end, item.mapTimeMs));
      drainTo(eventTime);
      if (this.failed) break;
      const before = frame.onApplied ? this.snapshot() : null;
      this.apply(item.event);
      applied.push(item.event);
      if (before) frame.onApplied?.(item.event, before, this.snapshot());
      if (this.failed) break;
    }
    if (!this.failed) drainTo(end);
    return applied;
  }

  snapshot() {
    return {
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      health: this.health.value,
      failed: this.failed,
      judgements: { ...this.judgements },
      sliderBreaks: this.sliderBreaks,
      spinnerBonus: this.spinnerBonus,
    };
  }
}
