// @ts-check

import { judgeCirclePress, selectNotelockedCandidate } from '../rules/circleJudge.js';

/** @typedef {'300'|'100'|'50'|'miss'} CircleJudgement */

export class CircleScheduler {
  /**
   * @param {Array<{id:number,kind:string,startTimeMs:number,position:{x:number,y:number},radius:number}>} circles
   * @param {{hit300:number,hit100:number,hit50:number}} windows
   */
  constructor(circles, windows) {
    this.circles = circles
      .filter((object) => object.kind === 'circle')
      .map((object) => ({ ...object, resolved: false }))
      .sort((left, right) => left.startTimeMs - right.startTimeMs || left.id - right.id);
    this.windows = { ...windows };
  }

  get unresolvedCount() {
    return this.circles.filter((circle) => !circle.resolved).length;
  }

  /** @param {number} _previousTimeMs @param {number} currentTimeMs */
  advance(_previousTimeMs, currentTimeMs) {
    const events = [];
    for (const circle of this.circles) {
      if (circle.resolved || currentTimeMs <= circle.startTimeMs + this.windows.hit50) continue;
      circle.resolved = true;
      events.push({
        type: 'circle-judged',
        objectId: circle.id,
        judgement: /** @type {CircleJudgement} */ ('miss'),
        hitErrorMs: null,
      });
    }
    return events;
  }

  /** @param {{mapTimeMs:number,playfieldPosition:{x:number,y:number}}} transition */
  press(transition) {
    const candidate = selectNotelockedCandidate(this.circles, transition.mapTimeMs, this.windows.hit50);
    if (!candidate) return null;
    return this.judgeCandidate(candidate, transition);
  }

  /** @param {any} candidate @param {{mapTimeMs:number,playfieldPosition:{x:number,y:number}}} transition */
  judgeCandidate(candidate, transition) {
    const judgement = judgeCirclePress(candidate, transition, this.windows);
    if (!judgement) return null;
    candidate.resolved = true;
    return {
      type: 'circle-judged',
      objectId: candidate.id,
      judgement,
      hitErrorMs: transition.mapTimeMs - candidate.startTimeMs,
      mapTimeMs: transition.mapTimeMs,
    };
  }

  /** @param {number} mapTimeMs @param {number} preemptMs */
  getVisibleCircles(mapTimeMs, preemptMs) {
    return this.circles.filter(
      (circle) => !circle.resolved && mapTimeMs >= circle.startTimeMs - preemptMs && mapTimeMs <= circle.startTimeMs + this.windows.hit50,
    );
  }
}
