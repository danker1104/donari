// @ts-check

export const HEALTH_GAIN = Object.freeze({ 300: 0.06, 100: 0.03, 50: 0.015, miss: -0.14 });
export const SLIDER_PART_GAIN = 0.01;
export const SPINNER_BONUS_GAIN = 0.01;

/** @param {number} hpDrainRate */
export function passiveDrainPerSecond(hpDrainRate) {
  return 0.01 + 0.002 * hpDrainRate;
}

/** @param {number} start @param {number} end @param {Array<{startTimeMs:number,endTimeMs:number}>} breaks */
function activeDuration(start, end, breaks) {
  let duration = Math.max(0, end - start);
  for (const period of breaks) {
    duration -= Math.max(0, Math.min(end, period.endTimeMs) - Math.max(start, period.startTimeMs));
  }
  return Math.max(0, duration);
}

export class HealthProcessor {
  /** @param {number} hpDrainRate @param {number} [initial] */
  constructor(hpDrainRate, initial = 1) {
    this.hpDrainRate = hpDrainRate;
    this.value = Math.max(0, Math.min(1, initial));
    this.hasFailed = this.value <= 0;
  }

  get failed() { return this.hasFailed; }

  /** @param {number} previousTimeMs @param {number} currentTimeMs @param {Array<{startTimeMs:number,endTimeMs:number}>} breaks */
  advance(previousTimeMs, currentTimeMs, breaks) {
    const seconds = activeDuration(previousTimeMs, currentTimeMs, breaks) / 1000;
    this.change(-passiveDrainPerSecond(this.hpDrainRate) * seconds);
  }

  /** @param {'300'|'100'|'50'|'miss'} judgement */
  applyJudgement(judgement) { this.change(HEALTH_GAIN[judgement]); }

  applySliderPart() { this.change(SLIDER_PART_GAIN); }

  /** @param {number} count */
  applySpinnerBonus(count) { this.change(SPINNER_BONUS_GAIN * count); }

  /** @param {number} amount */
  change(amount) {
    if (this.hasFailed) return;
    this.value = Math.max(0, Math.min(1, this.value + amount));
    if (this.value <= 0) this.hasFailed = true;
  }
}
