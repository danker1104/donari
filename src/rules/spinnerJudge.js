// @ts-check

export const SPINNER_CENTER = Object.freeze({ x: 256, y: 192 });
export const SPINNER_CENTER_CUTOFF = 16;
export const SPINNER_MAX_ANGLE_DELTA = Math.PI / 2;

/** @param {number} overallDifficulty @param {number} durationMs */
export function requiredSpinnerSpins(overallDifficulty, durationMs) {
  const spinsPerSecond = overallDifficulty < 5 ? 1.5 + 0.2 * overallDifficulty : 1.25 + 0.25 * overallDifficulty;
  return Math.trunc(durationMs / 1000 * spinsPerSecond + 0.5);
}

export class SpinnerRuntime {
  /** @param {{id:number,startTimeMs:number,endTimeMs:number,requiredSpins:number}} spinner */
  constructor(spinner) {
    this.id = spinner.id;
    this.startTimeMs = spinner.startTimeMs;
    this.endTimeMs = spinner.endTimeMs;
    this.requiredSpins = spinner.requiredSpins;
    this.rotationRadians = 0;
    this.lastAngle = null;
    this.direction = 0;
    this.lastSampleTimeMs = null;
  }

  /** @param {{x:number,y:number}} cursor @param {boolean} holding @param {number} [mapTimeMs] */
  sample(cursor, holding, mapTimeMs) {
    if (Number.isFinite(mapTimeMs) && this.lastSampleTimeMs !== null && /** @type {number} */ (mapTimeMs) < this.lastSampleTimeMs) return;
    if (Number.isFinite(mapTimeMs)) this.lastSampleTimeMs = /** @type {number} */ (mapTimeMs);
    const dx = cursor.x - SPINNER_CENTER.x;
    const dy = cursor.y - SPINNER_CENTER.y;
    if (!holding || Math.hypot(dx, dy) < SPINNER_CENTER_CUTOFF) { this.lastAngle = null; return; }
    const angle = Math.atan2(dy, dx);
    if (this.lastAngle === null) { this.lastAngle = angle; return; }
    let delta = angle - this.lastAngle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.lastAngle = angle;
    if (Math.abs(delta) > SPINNER_MAX_ANGLE_DELTA) return;
    const direction = Math.sign(delta);
    if (this.direction !== 0 && direction !== 0 && direction !== this.direction) { this.direction = direction; return; }
    if (direction !== 0) this.direction = direction;
    this.rotationRadians += Math.abs(delta);
  }

  finish() {
    const completedSpins = Math.floor(this.rotationRadians / (Math.PI * 2) + 1e-9);
    const required = this.requiredSpins;
    const judgement = completedSpins >= required ? '300'
      : completedSpins > 0 && completedSpins >= required - 1 ? '100'
        : completedSpins >= Math.ceil(required * 0.25) ? '50' : 'miss';
    return { type: 'spinner-judged', objectId: this.id, judgement, completedSpins, requiredSpins: required, bonusSpins: Math.max(0, completedSpins - required) };
  }
}
