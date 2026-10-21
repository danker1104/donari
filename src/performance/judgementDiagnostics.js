// @ts-check

const METRIC_NAMES = Object.freeze({
  INPUT_TIMESTAMP_FALLBACK: 'inputTimestampFallbacks',
});

export class JudgementDiagnostics {
  /** @param {number} [limit] */
  constructor(limit = 64) {
    this.limit = Math.max(1, Math.floor(limit));
    /** @type {Array<Record<string, any>>} */
    this.entries = [];
    this.metrics = { inputTimestampFallbacks: 0 };
  }

  /** @param {Record<string, any>} entry */
  record(entry) {
    this.entries.push({ ...entry });
    if (this.entries.length > this.limit) this.entries.splice(0, this.entries.length - this.limit);
  }

  /** @param {keyof typeof METRIC_NAMES} name */
  increment(name) {
    const metric = METRIC_NAMES[name];
    if (metric) this.metrics[metric] += 1;
  }

  snapshot() {
    const lastPress = [...this.entries].reverse().find((entry) => entry.event === 'judgement_press') ?? null;
    const lastApplied = [...this.entries].reverse().find((entry) => entry.event === 'judgement_applied') ?? null;
    return {
      entries: this.entries.map((entry) => ({ ...entry })),
      lastPress: lastPress ? { ...lastPress } : null,
      lastApplied: lastApplied ? { ...lastApplied } : null,
      metrics: { ...this.metrics },
    };
  }
}

/** @param {Record<string,any>|null} entry */
export function formatJudgementDiagnostic(entry) {
  if (!entry) return 'none';
  const identity = entry.candidateId === null || entry.candidateId === undefined
    ? 'none'
    : `${entry.candidateKind ?? 'object'}#${entry.candidateId}`;
  const error = Number.isFinite(entry.hitErrorMs) ? ` Δ${Number(entry.hitErrorMs).toFixed(1)}ms` : '';
  const distance = Number.isFinite(entry.distancePx) ? ` d${Number(entry.distancePx).toFixed(1)}px` : '';
  return `${identity}${error}${distance} => ${entry.result ?? 'unknown'}`;
}
