// @ts-check

import { InputState } from './inputState.js';

const POINTER_CHANNELS = new Map([[0, 'mouse-left'], [2, 'mouse-right']]);

/** @param {any} target */
function isEditableTarget(target) {
  const tagName = String(target?.tagName ?? '').toLocaleLowerCase('en-US');
  return ['input', 'textarea', 'select', 'button'].includes(tagName) || Boolean(target?.isContentEditable) || Boolean(target?.closest?.('[role="dialog"]'));
}

export class InputManager {
  /**
   * @param {{
   *   clock: {eventTimestampToMapTime:(timestamp:number)=>{mapTimeMs:number,fallback:boolean},getMapTimeMs:()=>number},
   *   mapper: {screenToPlayfield:(point:{x:number,y:number})=>{x:number,y:number}},
   *   requestPause: (reason:string)=>void,
   *   keyBindings?: [string,string],
   *   sensitivity?: number,
   *   correctAim?: (point:{x:number,y:number},timeMs:number)=>{x:number,y:number},
   *   onMetric?: (name:'INPUT_TIMESTAMP_FALLBACK')=>void,
   * }} options
   */
  constructor(options) {
    this.sensitivity = options.sensitivity ?? 1;
    this.correctAim = options.correctAim ?? ((point) => point);
    /** @type {{x:number,y:number}|null} */
    this.lastPointerPosition = null;
    this.clock = options.clock;
    this.mapper = options.mapper;
    this.requestPause = options.requestPause;
    this.keyBindings = options.keyBindings ?? ['KeyZ', 'KeyX'];
    this.onMetric = options.onMetric ?? (() => {});
    this.state = new InputState();
    this.active = false;
    this.interrupted = false;
    this.timestampFallbackCount = 0;
    this.cursorScreenPosition = { x: 0, y: 0 };
    this.pressCounts = { 'mouse-left': 0, 'mouse-right': 0, 'key-left': 0, 'key-right': 0 };
    /** @type {Array<()=>void>} */
    this.detachCallbacks = [];
  }

  /** @param {boolean} active */
  setActive(active) {
    this.active = active;
    if (active) this.interrupted = false;
  }

  /** @param {[string,string]} keyBindings */
  setKeyBindings(keyBindings) {
    if (!keyBindings[0] || !keyBindings[1] || keyBindings[0] === keyBindings[1]) {
      throw new Error('INPUT_BINDING_DUPLICATE');
    }
    this.keyBindings = /** @type {[string,string]} */ ([keyBindings[0], keyBindings[1]]);
  }

  /** @param {{x:number,y:number}} position */
  setCursorScreenPosition(position) {
    this.cursorScreenPosition = { ...position };
  }

  /** @param {any} event @param {{left:number,top:number}} [rect] */
  updatePointerPosition(event, rect = event.currentTarget?.getBoundingClientRect?.() ?? { left: 0, top: 0 }) {
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    const position = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (this.lastPointerPosition && this.active) {
      const mapper = /** @type {any} */ (this.mapper);
      this.setCursorScreenPosition({
        x: Math.max(0, Math.min(mapper.cssWidth ?? Infinity, this.cursorScreenPosition.x + (position.x - this.lastPointerPosition.x) * this.sensitivity)),
        y: Math.max(0, Math.min(mapper.cssHeight ?? Infinity, this.cursorScreenPosition.y + (position.y - this.lastPointerPosition.y) * this.sensitivity)),
      });
    } else this.setCursorScreenPosition(position);
    this.lastPointerPosition = position;
  }

  get playfieldPosition() {
    return this.positionAt(this.clock.getMapTimeMs());
  }

  /** @param {number} timeMs */
  positionAt(timeMs) {
    return this.correctAim(this.mapper.screenToPlayfield(this.cursorScreenPosition), timeMs);
  }

  /** @param {any} event @param {{left:number,top:number}} [rect] */
  handlePointerMove(event, rect = { left: 0, top: 0 }) {
    this.updatePointerPosition(event, rect);
    if (!this.active || !Number.isFinite(event.timeStamp)) return;
    const time = this.mapEventTimestamp(event.timeStamp);
    this.state.move(time.mapTimeMs, this.positionAt(time.mapTimeMs));
  }

  /** @param {any} event */
  handlePointerDown(event) {
    if (!this.active) return;
    const channel = POINTER_CHANNELS.get(event.button);
    if (!channel) return;
    event.preventDefault?.();
    this.updatePointerPosition(event);
    event.currentTarget?.setPointerCapture?.(event.pointerId);
    this.press(/** @type {any} */ (channel), event.timeStamp);
  }

  /** @param {any} event */
  handlePointerUp(event) {
    const channel = POINTER_CHANNELS.get(event.button);
    if (!channel) return;
    this.updatePointerPosition(event);
    this.release(/** @type {any} */ (channel), event.timeStamp);
  }

  handleLostPointerCapture() {
    if (this.state.activeChannels.has('mouse-left') || this.state.activeChannels.has('mouse-right')) {
      this.interrupt('pointer-capture-lost');
    }
  }

  /** @param {any} event */
  handleKeyDown(event) {
    if (!this.active || event.repeat || isEditableTarget(event.target)) return;
    const index = this.keyBindings.indexOf(event.code);
    if (index < 0) return;
    event.preventDefault?.();
    this.press(index === 0 ? 'key-left' : 'key-right', event.timeStamp);
  }

  /** @param {any} event */
  handleKeyUp(event) {
    const index = this.keyBindings.indexOf(event.code);
    if (index < 0) return;
    this.release(index === 0 ? 'key-left' : 'key-right', event.timeStamp);
  }

  /** @param {import('./inputState.js').InputChannel} channel @param {number} timestamp */
  press(channel, timestamp) {
    const time = this.mapEventTimestamp(timestamp);
    const transition = this.state.press(channel, time.mapTimeMs, this.positionAt(time.mapTimeMs));
    if (transition) this.pressCounts[channel] += 1;
  }

  /** @param {import('./inputState.js').InputChannel} channel @param {number} timestamp */
  release(channel, timestamp) {
    const time = this.mapEventTimestamp(timestamp);
    this.state.release(channel, time.mapTimeMs, this.positionAt(time.mapTimeMs));
  }

  /** @param {number} timestamp */
  mapEventTimestamp(timestamp) {
    const time = this.clock.eventTimestampToMapTime(timestamp);
    if (time.fallback) {
      this.timestampFallbackCount += 1;
      this.onMetric('INPUT_TIMESTAMP_FALLBACK');
    }
    return time;
  }

  /** @param {string} reason */
  interrupt(reason) {
    if (this.interrupted) return;
    this.interrupted = true;
    this.state.clear(this.clock.getMapTimeMs(), this.playfieldPosition);
    if (this.active) this.requestPause(reason);
  }

  /** @param {any} stage @param {any} windowObject @param {any} documentObject */
  attach(stage, windowObject, documentObject) {
    this.dispose();
    /** @param {any} target @param {string} type @param {(event:any)=>void} handler @param {any} [options] */
    const listen = (target, type, handler, options) => {
      target.addEventListener(type, handler, options);
      this.detachCallbacks.push(() => target.removeEventListener(type, handler, options));
    };
    listen(stage, 'pointermove', (/** @type {any} */ event) => this.handlePointerMove(event, stage.getBoundingClientRect()));
    listen(stage, 'pointerdown', (/** @type {any} */ event) => this.handlePointerDown(event));
    listen(stage, 'pointerup', (/** @type {any} */ event) => this.handlePointerUp(event));
    listen(stage, 'pointercancel', () => this.interrupt('pointer-cancel'));
    listen(stage, 'lostpointercapture', () => this.handleLostPointerCapture());
    listen(stage, 'contextmenu', (/** @type {any} */ event) => { if (this.active) event.preventDefault(); });
    listen(windowObject, 'keydown', (/** @type {any} */ event) => this.handleKeyDown(event));
    listen(windowObject, 'keyup', (/** @type {any} */ event) => this.handleKeyUp(event));
    listen(windowObject, 'blur', () => this.interrupt('window-blur'));
    listen(documentObject, 'visibilitychange', () => { if (documentObject.hidden) this.interrupt('visibility-hidden'); });
    listen(documentObject, 'fullscreenchange', () => { if (this.active && !documentObject.fullscreenElement) this.interrupt('fullscreen-exit'); });
  }

  dispose() {
    for (const detach of this.detachCallbacks.splice(0)) detach();
  }
}
