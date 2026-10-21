// @ts-check

/**
 * @typedef {{
 *   currentTime: number,
 *   getOutputTimestamp?: () => { contextTime: number, performanceTime: number },
 * }} ClockAudioContext
 */

export class AudioClock {
  /** @param {ClockAudioContext} audioContext @param {number} [offsetMs] */
  constructor(audioContext, offsetMs = 0) {
    this.audioContext = audioContext;
    this.offsetMs = offsetMs;
    this.startedAtSec = 0;
    this.seekOffsetMs = 0;
    this.running = false;
  }

  /** @param {number} startedAtSec @param {number} seekOffsetMs */
  start(startedAtSec, seekOffsetMs) {
    this.startedAtSec = startedAtSec;
    this.seekOffsetMs = seekOffsetMs;
    this.running = true;
  }

  /** @returns {number} */
  pause() {
    this.seekOffsetMs = this.getRawAudioPositionMs();
    this.running = false;
    return this.seekOffsetMs;
  }

  /** @param {number} seekOffsetMs */
  seek(seekOffsetMs) {
    this.seekOffsetMs = Math.max(0, seekOffsetMs);
    if (this.running) this.startedAtSec = this.audioContext.currentTime;
  }

  /** @param {number} offsetMs */
  setOffset(offsetMs) {
    this.offsetMs = offsetMs;
  }

  /** @returns {number} */
  getRawAudioPositionMs() {
    if (!this.running) return this.seekOffsetMs;
    return this.seekOffsetMs + (this.audioContext.currentTime - this.startedAtSec) * 1000;
  }

  /** @returns {number} */
  getMapTimeMs() {
    return this.getRawAudioPositionMs() + this.offsetMs;
  }

  /**
   * @param {number} eventTimestampMs
   * @returns {{ mapTimeMs: number, fallback: boolean }}
   */
  eventTimestampToMapTime(eventTimestampMs) {
    const timestamp = this.audioContext.getOutputTimestamp?.();
    if (
      !timestamp ||
      !Number.isFinite(timestamp.contextTime) ||
      !Number.isFinite(timestamp.performanceTime) ||
      !Number.isFinite(eventTimestampMs) ||
      !this.running
    ) {
      return { mapTimeMs: this.getMapTimeMs(), fallback: true };
    }

    const eventContextTime = timestamp.contextTime + (eventTimestampMs - timestamp.performanceTime) / 1000;
    const rawAudioPositionMs = this.seekOffsetMs + (eventContextTime - this.startedAtSec) * 1000;
    return { mapTimeMs: rawAudioPositionMs + this.offsetMs, fallback: false };
  }
}
