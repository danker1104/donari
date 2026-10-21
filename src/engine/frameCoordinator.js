// @ts-check

export class FrameCoordinator {
  /**
   * @param {{getMapTimeMs:()=>number}} clock
   * @param {(previousTimeMs:number,currentTimeMs:number)=>void} advance
   * @param {(mapTimeMs:number)=>void} render
   */
  constructor(clock, advance, render) {
    this.clock = clock;
    this.advance = advance;
    this.render = render;
    /** @type {number|null} */
    this.previousTimeMs = null;
  }

  frame() {
    const mapTimeMs = this.clock.getMapTimeMs();
    const previousTimeMs = this.previousTimeMs ?? mapTimeMs;
    this.advance(previousTimeMs, mapTimeMs);
    this.render(mapTimeMs);
    this.previousTimeMs = mapTimeMs;
    return mapTimeMs;
  }

  reset() {
    this.previousTimeMs = null;
  }
}
