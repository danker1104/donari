// @ts-check

import { RenderCoordinator, RenderLayer } from './renderCoordinator.js';

/** @param {CanvasRenderingContext2D} context @param {number} width @param {number} height */
export function renderLayerProbe(context, width, height) {
  const fill = (/** @type {string} */ color, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ w, /** @type {number} */ h) => () => {
    context.fillStyle = color;
    context.fillRect(x, y, w, h);
  };
  new RenderCoordinator(context, width, height).render([
    { layer: RenderLayer.BACKGROUND, draw: fill('#000000', 0, 0, width, height) },
    { layer: RenderLayer.STORYBOARD_FOREGROUND, draw: fill('#ff0000', 10, 10, 40, 1) },
    { layer: RenderLayer.HIT_OBJECT, draw: fill('#00ff00', 20, 10, 30, 1) },
    { layer: RenderLayer.HUD, draw: fill('#0000ff', 30, 10, 20, 1) },
    { layer: RenderLayer.CURSOR, draw: fill('#ffffff', 40, 10, 10, 1) },
  ]);
}
