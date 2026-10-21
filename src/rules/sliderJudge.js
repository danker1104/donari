// @ts-check

export const SLIDER_FOLLOW_RADIUS_MULTIPLIER = 2.4;
export const SLIDER_VISUAL_FADE_OUT_MS = 120;

/** @param {{pathPoints:Array<{x:number,y:number}>,startTimeMs:number,endTimeMs:number,spanCount:number}} slider @param {number} mapTimeMs */
export function sliderPositionAt(slider, mapTimeMs) {
  const duration = Math.max(1, slider.endTimeMs - slider.startTimeMs);
  const overall = Math.max(0, Math.min(1, (mapTimeMs - slider.startTimeMs) / duration));
  const spanProgress = overall * slider.spanCount;
  const spanIndex = Math.min(slider.spanCount - 1, Math.floor(spanProgress));
  const progress = spanIndex % 2 === 0 ? spanProgress - spanIndex : 1 - (spanProgress - spanIndex);
  const points = slider.pathPoints;
  if (points.length < 2) return points[0] ? { ...points[0] } : { x: 0, y: 0 };
  const lengths = [0];
  for (let index = 1; index < points.length; index += 1) {
    lengths.push(lengths[index - 1] + Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y));
  }
  const target = progress * (lengths[lengths.length - 1] ?? 0);
  let index = 1;
  while (index < lengths.length - 1 && lengths[index] < target) index += 1;
  const segment = lengths[index] - lengths[index - 1];
  const ratio = segment === 0 ? 0 : (target - lengths[index - 1]) / segment;
  return {
    x: points[index - 1].x + (points[index].x - points[index - 1].x) * ratio,
    y: points[index - 1].y + (points[index].y - points[index - 1].y) * ratio,
  };
}

/** @param {any} slider */
export function createSliderRuntime(slider) {
  return {
    ...slider,
    parts: slider.nestedParts.map((/** @type {any} */ part) => ({ ...part, result: null })),
    finalJudgement: null,
    tracking: false,
    renderEndTimeMs: slider.endTimeMs + SLIDER_VISUAL_FADE_OUT_MS,
  };
}

/** @param {any} state */
export function sliderHeadPart(state) {
  return state.parts.find((/** @type {any} */ part) => part.kind === 'head') ?? null;
}

/** @param {any} state @param {{mapTimeMs:number,playfieldPosition:{x:number,y:number}}} press @param {{hit50:number}} windows */
export function judgeSliderHeadPress(state, press, windows) {
  const head = sliderHeadPart(state);
  if (!head || head.result !== null || Math.abs(press.mapTimeMs - state.startTimeMs) > windows.hit50) return null;
  const position = head.position ?? state.position ?? sliderPositionAt(state, state.startTimeMs);
  if (Math.hypot(press.playfieldPosition.x - position.x, press.playfieldPosition.y - position.y) > state.radius) return null;
  head.result = 'hit';
  return {
    type: 'slider-part', objectId: state.id, partId: head.id, kind: 'head', result: 'hit',
    comboBreak: false, hitErrorMs: press.mapTimeMs - state.startTimeMs, mapTimeMs: press.mapTimeMs,
  };
}

/** @param {any} state @param {number} [mapTimeMs] */
export function missSliderHead(state, mapTimeMs = state.startTimeMs) {
  const head = sliderHeadPart(state);
  if (!head || head.result !== null) return [];
  head.result = 'miss';
  return withSliderFinal(state, {
    type: 'slider-part', objectId: state.id, partId: head.id, kind: 'head', result: 'miss',
    comboBreak: true, hitErrorMs: null, mapTimeMs,
  });
}

/** @param {any} state @param {any} part @param {boolean} holding @param {{x:number,y:number}} cursor */
export function judgeSliderPart(state, part, holding, cursor) {
  if (!part || part.kind === 'head' || part.result !== null) return [];
  const ball = part.position ?? sliderPositionAt(state, part.timeMs);
  const hit = holding && Math.hypot(cursor.x - ball.x, cursor.y - ball.y) <= state.radius * SLIDER_FOLLOW_RADIUS_MULTIPLIER;
  part.result = hit ? 'hit' : 'miss';
  return withSliderFinal(state, {
    type: 'slider-part', objectId: state.id, partId: part.id, kind: part.kind, result: part.result,
    comboBreak: !hit && part.kind !== 'tail', mapTimeMs: part.timeMs,
  });
}

/** @param {any} state @param {any} partEvent */
function withSliderFinal(state, partEvent) {
  const events = [partEvent];
  if (state.finalJudgement !== null || !state.parts.every((/** @type {any} */ part) => part.result !== null)) return events;
  const hitParts = state.parts.filter((/** @type {any} */ part) => part.result === 'hit').length;
  state.finalJudgement = hitParts === state.parts.length ? '300' : hitParts * 2 >= state.parts.length ? '100' : hitParts > 0 ? '50' : 'miss';
  events.push({ type: 'slider-judged', objectId: state.id, judgement: state.finalJudgement, mapTimeMs: partEvent.mapTimeMs });
  return events;
}

/** @param {any} state @param {number} mapTimeMs @param {boolean} holding @param {{x:number,y:number}} cursor */
export function updateSliderTracking(state, mapTimeMs, holding, cursor) {
  const ball = sliderPositionAt(state, mapTimeMs);
  state.tracking = state.finalJudgement === null &&
    mapTimeMs >= state.startTimeMs && mapTimeMs <= state.endTimeMs &&
    holding && Math.hypot(cursor.x - ball.x, cursor.y - ball.y) <= state.radius * SLIDER_FOLLOW_RADIUS_MULTIPLIER;
}

/** @param {any} state @param {number} previousTimeMs @param {number} currentTimeMs @param {boolean} holding @param {{x:number,y:number}} cursor */
export function updateSliderRuntime(state, previousTimeMs, currentTimeMs, holding, cursor) {
  const events = [];
  for (const part of state.parts) {
    if (part.result !== null || part.timeMs <= previousTimeMs || part.timeMs > currentTimeMs) continue;
    if (part.kind === 'head') continue;
    events.push(...judgeSliderPart(state, part, holding, cursor));
  }
  updateSliderTracking(state, currentTimeMs, holding, cursor);
  return events;
}
