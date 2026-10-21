// @ts-check

/** @typedef {'mouse-left'|'mouse-right'|'key-left'|'key-right'} InputChannel */
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{channel:InputChannel|null,phase:'press'|'release'|'move',mapTimeMs:number,playfieldPosition:Point,synthetic:boolean}} InputTransition */

export class InputState {
  constructor() {
    /** @type {Set<InputChannel>} */
    this.activeChannels = new Set();
    /** @type {Map<InputChannel, number>} */
    this.lastPressMapTime = new Map();
    /** @type {Array<InputTransition>} */
    this.transitions = [];
  }

  get isHolding() {
    return this.activeChannels.size > 0;
  }

  /** @param {InputChannel} channel @param {number} mapTimeMs @param {Point} position */
  press(channel, mapTimeMs, position) {
    if (this.activeChannels.has(channel)) return null;
    this.activeChannels.add(channel);
    this.lastPressMapTime.set(channel, mapTimeMs);
    const transition = {
      channel,
      phase: /** @type {'press'} */ ('press'),
      mapTimeMs,
      playfieldPosition: { ...position },
      synthetic: false,
    };
    this.transitions.push(transition);
    return transition;
  }

  /** @param {InputChannel} channel @param {number} mapTimeMs @param {Point} position @param {boolean} [synthetic] */
  release(channel, mapTimeMs, position, synthetic = false) {
    if (!this.activeChannels.delete(channel)) return null;
    const transition = {
      channel,
      phase: /** @type {'release'} */ ('release'),
      mapTimeMs,
      playfieldPosition: { ...position },
      synthetic,
    };
    this.transitions.push(transition);
    return transition;
  }

  /** @param {number} mapTimeMs @param {Point} position */
  move(mapTimeMs, position) {
    const transition = {
      channel: null,
      phase: /** @type {'move'} */ ('move'),
      mapTimeMs,
      playfieldPosition: { ...position },
      synthetic: false,
    };
    this.transitions.push(transition);
    return transition;
  }

  /** @param {number} mapTimeMs @param {Point} position */
  clear(mapTimeMs, position) {
    this.transitions.length = 0;
    for (const channel of [...this.activeChannels]) {
      this.release(channel, mapTimeMs, position, true);
    }
  }

  drainTransitions() {
    return this.transitions.splice(0);
  }

  /** @param {number} mapTimeMs @param {number} [durationMs] */
  pressFeedbackChannels(mapTimeMs, durationMs = 80) {
    /** @type {Set<InputChannel>} */
    const channels = new Set();
    for (const [channel, pressTimeMs] of this.lastPressMapTime) {
      if (mapTimeMs >= pressTimeMs && mapTimeMs - pressTimeMs <= durationMs) channels.add(channel);
    }
    return channels;
  }
}
