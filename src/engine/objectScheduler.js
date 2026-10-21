// @ts-check

import { CircleScheduler } from './circleScheduler.js';
import {
  createSliderRuntime,
  judgeSliderHeadPress,
  judgeSliderPart,
  missSliderHead,
  sliderHeadPart,
  updateSliderTracking,
} from '../rules/sliderJudge.js';
import { SpinnerRuntime } from '../rules/spinnerJudge.js';

/** @typedef {{channel:string|null,phase:'press'|'release'|'move',mapTimeMs:number,playfieldPosition:{x:number,y:number},synthetic?:boolean}} RuleInputTransition */

export class ObjectScheduler {
  /**
   * @param {Array<any>} objects
   * @param {{hit300:number,hit100:number,hit50:number}} windows
   * @param {(entry:Record<string,any>)=>void} [onDiagnostic]
   */
  constructor(objects, windows, onDiagnostic = () => {}) {
    this.windows = { ...windows };
    this.circles = new CircleScheduler(objects, windows);
    this.sliders = objects.filter((object) => object.kind === 'slider').map(createSliderRuntime);
    this.spinners = objects
      .filter((object) => object.kind === 'spinner')
      .map((object) => ({ runtime: new SpinnerRuntime(object), resolved: false }));
    /** @type {Set<string>} */
    this.activeChannels = new Set();
    this.cursorPosition = { x: 0, y: 0 };
    this.onDiagnostic = onDiagnostic;
  }

  /** @param {{channel?:string|null,mapTimeMs:number,playfieldPosition:{x:number,y:number}}} transition */
  press(transition) {
    const candidates = [
      ...this.circles.circles.filter((circle) => !circle.resolved).map((circle) => ({ kind: 'circle', object: circle })),
      ...this.sliders
        .filter((slider) => sliderHeadPart(slider)?.result === null)
        .map((slider) => ({ kind: 'slider', object: slider })),
    ]
      .filter((candidate) => Math.abs(transition.mapTimeMs - candidate.object.startTimeMs) <= this.windows.hit50)
      .sort((left, right) => left.object.startTimeMs - right.object.startTimeMs || left.object.id - right.object.id);
    const candidate = candidates[0];
    if (!candidate) {
      this.onDiagnostic({
        event: 'judgement_press',
        mapTimeMs: transition.mapTimeMs,
        channel: transition.channel ?? null,
        candidateId: null,
        candidateKind: null,
        result: 'no-candidate',
      });
      return null;
    }
    const position = candidate.kind === 'slider'
      ? sliderHeadPart(candidate.object)?.position ?? candidate.object.position
      : candidate.object.position;
    const distancePx = Math.hypot(
      transition.playfieldPosition.x - position.x,
      transition.playfieldPosition.y - position.y,
    );
    const event = /** @type {any} */ (candidate.kind === 'circle'
      ? this.circles.judgeCandidate(candidate.object, transition)
      : judgeSliderHeadPress(candidate.object, transition, this.windows));
    this.onDiagnostic({
      event: 'judgement_press',
      mapTimeMs: transition.mapTimeMs,
      channel: transition.channel ?? null,
      candidateId: candidate.object.id,
      candidateKind: candidate.kind,
      objectTimeMs: candidate.object.startTimeMs,
      hitErrorMs: transition.mapTimeMs - candidate.object.startTimeMs,
      distancePx,
      radiusPx: candidate.object.radius,
      result: event?.judgement ?? event?.result ?? 'blocked-outside-radius',
    });
    return event;
  }

  /**
   * @param {number} previousTimeMs
   * @param {number} currentTimeMs
   * @param {boolean} holding
   * @param {{x:number,y:number}} cursor
   * @param {RuleInputTransition[]} [inputTransitions]
   */
  advance(previousTimeMs, currentTimeMs, holding, cursor, inputTransitions = []) {
    /** @type {Array<any>} */
    const events = [];
    const usesTimeline = inputTransitions.length > 0;
    if (!usesTimeline) this.cursorPosition = { ...cursor };

    const timeline = [
      ...inputTransitions
        .filter((transition) => transition.mapTimeMs <= currentTimeMs)
        .map((transition, index) => ({ timeMs: transition.mapTimeMs, priority: 0, index, type: 'input', transition })),
      ...this.scheduledEntries(previousTimeMs, currentTimeMs),
    ].sort((left, right) => left.timeMs - right.timeMs || left.priority - right.priority || left.index - right.index);

    for (const entry of timeline) {
      const isHolding = usesTimeline ? this.activeChannels.size > 0 : holding;
      if (entry.type === 'input') {
        const transition = entry.transition;
        this.cursorPosition = { ...transition.playfieldPosition };
        if (transition.phase === 'press') {
          this.activeChannels.add(transition.channel ?? 'trace');
          const event = this.press(transition);
          if (event) events.push(event);
        } else if (transition.phase === 'release') {
          this.activeChannels.delete(transition.channel ?? 'trace');
        }
        this.sampleSpinners(transition.mapTimeMs, this.activeChannels.size > 0, this.cursorPosition);
        continue;
      }

      if (entry.type === 'circle-miss') {
        if (!entry.object.resolved) {
          entry.object.resolved = true;
          events.push({ type: 'circle-judged', objectId: entry.object.id, judgement: 'miss', hitErrorMs: null, mapTimeMs: entry.timeMs });
        }
      } else if (entry.type === 'slider-head-miss') {
        events.push(...missSliderHead(entry.object, entry.timeMs));
      } else if (entry.type === 'slider-part') {
        events.push(...judgeSliderPart(entry.object, entry.part, isHolding, this.cursorPosition));
      } else if (entry.type === 'spinner-end' && !entry.spinner.resolved) {
        entry.spinner.resolved = true;
        events.push({ ...entry.spinner.runtime.finish(), mapTimeMs: entry.timeMs });
      }
    }

    const finalHolding = usesTimeline ? this.activeChannels.size > 0 : holding;
    const finalCursor = usesTimeline ? this.cursorPosition : cursor;
    for (const slider of this.sliders) updateSliderTracking(slider, currentTimeMs, finalHolding, finalCursor);
    return events;
  }

  /** @param {number} previousTimeMs @param {number} currentTimeMs */
  scheduledEntries(previousTimeMs, currentTimeMs) {
    /** @type {Array<any>} */
    const entries = [];
    let index = 0;
    for (const circle of this.circles.circles) {
      const timeMs = circle.startTimeMs + this.windows.hit50;
      if (!circle.resolved && currentTimeMs > timeMs) {
        entries.push({ timeMs, priority: 1, index: index++, type: 'circle-miss', object: circle });
      }
    }
    for (const slider of this.sliders) {
      const head = sliderHeadPart(slider);
      const headMissTime = slider.startTimeMs + this.windows.hit50;
      if (head?.result === null && currentTimeMs > headMissTime) {
        entries.push({ timeMs: headMissTime, priority: 1, index: index++, type: 'slider-head-miss', object: slider });
      }
      for (const part of slider.parts) {
        if (part.kind === 'head' || part.result !== null || part.timeMs <= previousTimeMs || part.timeMs > currentTimeMs) continue;
        entries.push({ timeMs: part.timeMs, priority: 1, index: index++, type: 'slider-part', object: slider, part });
      }
    }
    for (const spinner of this.spinners) {
      if (!spinner.resolved && spinner.runtime.endTimeMs > previousTimeMs && spinner.runtime.endTimeMs <= currentTimeMs) {
        entries.push({ timeMs: spinner.runtime.endTimeMs, priority: 1, index: index++, type: 'spinner-end', spinner });
      }
    }
    return entries;
  }

  /** @param {number} mapTimeMs @param {boolean} holding @param {{x:number,y:number}} cursor */
  sampleSpinners(mapTimeMs, holding, cursor) {
    for (const spinner of this.spinners) {
      if (spinner.resolved || mapTimeMs < spinner.runtime.startTimeMs || mapTimeMs > spinner.runtime.endTimeMs) continue;
      spinner.runtime.sample(cursor, holding, mapTimeMs);
    }
  }

  /** @param {number} mapTimeMs @param {number} preemptMs */
  getRenderState(mapTimeMs, preemptMs) {
    return {
      circles: this.circles.getVisibleCircles(mapTimeMs, preemptMs),
      sliders: this.sliders.filter((slider) => mapTimeMs >= slider.startTimeMs - preemptMs && mapTimeMs <= slider.renderEndTimeMs),
      spinners: this.spinners
        .filter((spinner) => !spinner.resolved && mapTimeMs >= spinner.runtime.startTimeMs && mapTimeMs <= spinner.runtime.endTimeMs)
        .map((spinner) => spinner.runtime),
    };
  }
}
