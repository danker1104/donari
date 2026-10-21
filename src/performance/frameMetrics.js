// @ts-check

export class FrameMetrics {
  /** @param {number} [capacity] */
  constructor(capacity = 7200) {
    this.capacity = capacity;
    /** @type {number[]} */
    this.samples = [];
  }

  /** @param {number} durationMs */
  record(durationMs) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return;
    this.samples.push(durationMs);
    if (this.samples.length > this.capacity) this.samples.shift();
  }

  snapshot() {
    if (this.samples.length === 0) return { sampleCount: 0, averageFps: 0, p95FrameMs: 0, over33Ratio: 0 };
    const total = this.samples.reduce((sum, value) => sum + value, 0);
    const sorted = [...this.samples].sort((left, right) => left - right);
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
    const over33 = this.samples.filter((value) => value > 33.3).length / this.samples.length;
    return { sampleCount: this.samples.length, averageFps: Number((1000 / (total / this.samples.length)).toFixed(2)), p95FrameMs: p95, over33Ratio: over33 };
  }

  meetsBudget() {
    if (this.samples.length === 0) return false;
    const total = this.samples.reduce((sum, value) => sum + value, 0);
    const sorted = [...this.samples].sort((left, right) => left - right);
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
    const over33 = this.samples.filter((value) => value > 33.3).length / this.samples.length;
    return 1000 / (total / this.samples.length) >= 59 && p95 <= 20 && over33 < 0.01;
  }
}
