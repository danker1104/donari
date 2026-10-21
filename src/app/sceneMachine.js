// @ts-check

const TRANSITIONS = Object.freeze({
  BOOT: ['CONSENT'],
  CONSENT: ['CATALOG'],
  CATALOG: ['DIFFICULTY_SELECT'],
  DIFFICULTY_SELECT: ['LOADING'],
  LOADING: ['READY', 'DIFFICULTY_SELECT'],
  READY: ['PLAYING', 'DIFFICULTY_SELECT'],
  PLAYING: ['PAUSED', 'FAILED', 'RESULT'],
  PAUSED: ['PLAYING', 'READY', 'DIFFICULTY_SELECT'],
  FAILED: ['READY', 'DIFFICULTY_SELECT'],
  RESULT: ['READY', 'DIFFICULTY_SELECT'],
});

export class SceneMachine {
  /** @param {keyof typeof TRANSITIONS} [initial] */
  constructor(initial = 'BOOT') { this.current = initial; }

  /** @param {keyof typeof TRANSITIONS} next */
  transition(next) {
    if (!TRANSITIONS[this.current].includes(next)) throw new Error(`SCENE_TRANSITION_INVALID: ${this.current}->${next}`);
    this.current = next;
    return next;
  }
}
