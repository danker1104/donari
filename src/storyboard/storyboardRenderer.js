// @ts-check

import { RenderLayer } from '../renderer/renderCoordinator.js';

const LAYER_MAP = Object.freeze({
  Background: RenderLayer.STORYBOARD_BACKGROUND,
  Fail: RenderLayer.STORYBOARD_FAIL_PASS,
  Pass: RenderLayer.STORYBOARD_FAIL_PASS,
  Foreground: RenderLayer.STORYBOARD_FOREGROUND,
  Overlay: RenderLayer.STORYBOARD_OVERLAY,
});

/** @param {string} origin @param {number} width @param {number} height */
function originOffset(origin, width, height) {
  const horizontal = origin.includes('Left') ? 0 : origin.includes('Right') ? width : width / 2;
  const vertical = origin.startsWith('Top') ? 0 : origin.startsWith('Bottom') ? height : height / 2;
  return { x: horizontal, y: vertical };
}

/** @param {string} basePath @param {number} frame */
function animationFramePath(basePath, frame) {
  const dot = basePath.lastIndexOf('.');
  const base = dot < 0 ? basePath : basePath.slice(0, dot);
  const extension = dot < 0 ? '' : basePath.slice(dot);
  return `${base}${frame}${extension}`;
}

export class StoryboardRenderer {
  /** @param {any} mapper @param {Map<string,CanvasImageSource>} images */
  constructor(mapper, images) {
    this.mapper = mapper;
    this.images = images;
    /** @type {Map<string,boolean>} */
    this.animationAvailability = new Map();
  }

  /** @param {Array<any>} objects */
  createDrawCommands(objects) {
    const commands = [];
    for (const object of objects) {
      if (object.kind === 'animation' && !this.hasCompleteAnimation(object)) continue;
      const image = this.images.get(object.activePath);
      const layer = /** @type {Record<string,number>} */ (LAYER_MAP)[String(object.layer)];
      if (!image || layer === undefined) continue;
      commands.push({ layer, draw: (/** @type {CanvasRenderingContext2D} */ context) => this.draw(context, image, object) });
    }
    return commands;
  }

  /** @param {any} object */
  hasCompleteAnimation(object) {
    const key = String(object.id ?? `${object.path}:${object.frameCount}`);
    const cached = this.animationAvailability.get(key);
    if (cached !== undefined) return cached;
    const complete = Number(object.frameCount) > 0 && Array.from(
      { length: Number(object.frameCount) },
      (_, frame) => animationFramePath(String(object.path), frame),
    ).every((path) => this.images.has(path));
    this.animationAvailability.set(key, complete);
    return complete;
  }

  /** @param {CanvasRenderingContext2D|any} context @param {CanvasImageSource|any} image @param {any} object */
  draw(context, image, object) {
    const center = this.mapper.storyboardToScreen(object.evaluated.position);
    const naturalWidth = Number(image.width);
    const naturalHeight = Number(image.height);
    const width = naturalWidth * object.evaluated.scale.x * this.mapper.scale;
    const height = naturalHeight * object.evaluated.scale.y * this.mapper.scale;
    const anchor = originOffset(object.origin, width, height);
    context.save();
    context.globalAlpha = Math.max(0, Math.min(1, object.evaluated.opacity));
    context.drawImage(image, center.x - anchor.x, center.y - anchor.y, width, height);
    context.restore();
  }
}
