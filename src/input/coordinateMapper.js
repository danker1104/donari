// @ts-check

export class CoordinateMapper {
  /** @param {number} cssWidth @param {number} cssHeight @param {number} devicePixelRatio */
  constructor(cssWidth, cssHeight, devicePixelRatio) {
    this.cssWidth = 0;
    this.cssHeight = 0;
    this.scale = 1;
    this.storyboardRect = { x: 0, y: 0, width: 640, height: 480 };
    this.playfieldRect = { x: 64, y: 48, width: 512, height: 384 };
    this.effectiveDpr = 1;
    this.backingSize = { width: 0, height: 0, effectiveDpr: 1 };
    this.update(cssWidth, cssHeight, devicePixelRatio);
  }

  /** @param {number} cssWidth @param {number} cssHeight @param {number} devicePixelRatio */
  update(cssWidth, cssHeight, devicePixelRatio) {
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.scale = Math.min(cssWidth / 640, cssHeight / 480);
    const storyboardWidth = 640 * this.scale;
    const storyboardHeight = 480 * this.scale;
    this.storyboardRect = {
      x: (cssWidth - storyboardWidth) / 2,
      y: (cssHeight - storyboardHeight) / 2,
      width: storyboardWidth,
      height: storyboardHeight,
    };
    this.playfieldRect = {
      x: this.storyboardRect.x + 64 * this.scale,
      y: this.storyboardRect.y + 48 * this.scale,
      width: 512 * this.scale,
      height: 384 * this.scale,
    };
    this.effectiveDpr = Math.min(Math.max(devicePixelRatio, 1), 2);
    this.backingSize = {
      width: Math.round(cssWidth * this.effectiveDpr),
      height: Math.round(cssHeight * this.effectiveDpr),
      effectiveDpr: this.effectiveDpr,
    };
  }

  /** @param {{x:number,y:number}} point */
  playfieldToStoryboard(point) {
    return { x: point.x + 64, y: point.y + 48 };
  }

  /** @param {{x:number,y:number}} point */
  storyboardToPlayfield(point) {
    return { x: point.x - 64, y: point.y - 48 };
  }

  /** @param {{x:number,y:number}} point */
  storyboardToScreen(point) {
    return {
      x: this.cssWidth / 2 + (point.x - 320) * this.scale,
      y: this.cssHeight / 2 + (point.y - 240) * this.scale,
    };
  }

  /** @param {{x:number,y:number}} point */
  screenToStoryboard(point) {
    return {
      x: (point.x - this.cssWidth / 2) / this.scale + 320,
      y: (point.y - this.cssHeight / 2) / this.scale + 240,
    };
  }

  /** @param {{x:number,y:number}} point */
  playfieldToScreen(point) {
    return this.storyboardToScreen(this.playfieldToStoryboard(point));
  }

  /** @param {{x:number,y:number}} point */
  screenToPlayfield(point) {
    return this.storyboardToPlayfield(this.screenToStoryboard(point));
  }

  /** @param {HTMLCanvasElement} canvas @param {CanvasRenderingContext2D} context */
  resizeCanvas(canvas, context) {
    canvas.width = this.backingSize.width;
    canvas.height = this.backingSize.height;
    canvas.style.width = `${this.cssWidth}px`;
    canvas.style.height = `${this.cssHeight}px`;
    context.setTransform(this.effectiveDpr, 0, 0, this.effectiveDpr, 0, 0);
  }

  /** @param {{innerWidth:number,innerHeight:number,devicePixelRatio:number}} viewport @param {HTMLCanvasElement} canvas @param {CanvasRenderingContext2D} context */
  resizeToViewport(viewport, canvas, context) {
    this.update(viewport.innerWidth, viewport.innerHeight, viewport.devicePixelRatio);
    this.resizeCanvas(canvas, context);
  }
}
