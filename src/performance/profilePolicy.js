// @ts-check

/**
 * @param {{failed:boolean,currentTimeMs:number,endTimeMs:number,hitWindowMs:number,profileMode:boolean}} state
 * @returns {'failed'|'cleared'|null}
 */
export function sessionOutcome(state) {
  if (state.failed && !state.profileMode) return 'failed';
  if (state.currentTimeMs > state.endTimeMs + state.hitWindowMs) return 'cleared';
  return null;
}
