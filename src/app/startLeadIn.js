// @ts-check

const MINIMUM_READY_TIME_MS = 3_000;

/** @param {number} firstObjectTimeMs */
export function startLeadInDelayMs(firstObjectTimeMs) {
  if (!Number.isFinite(firstObjectTimeMs)) return 0;
  return Math.max(0, MINIMUM_READY_TIME_MS - Math.max(0, firstObjectTimeMs));
}
