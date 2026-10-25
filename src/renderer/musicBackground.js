// @ts-check

/** @typedef {{level:number,bass:number,burst?:number,bands:Float32Array}} MusicAnalysis */

/** @type {WeakMap<CanvasRenderingContext2D,{width:number,gradients:CanvasGradient[]}>} */
const barGradients = new WeakMap();

/**
 * @param {MusicAnalysis|null} analysis
 * @param {number} mapTimeMs
 * @param {boolean} reducedMotion
 */
export function musicBackgroundTransform(analysis, mapTimeMs, reducedMotion) {
  if (!analysis || reducedMotion) return { zoom: 1, x: 0, y: 0 };
  const level = analysis.level;
  return {
    zoom: 1 + level * 0.018,
    x: Math.sin(mapTimeMs * 0.0007) * analysis.bass * level * 2,
    y: Math.cos(mapTimeMs * 0.0009) * analysis.bass * level * 2,
  };
}

/**
 * @param {CanvasRenderingContext2D} context
 * @param {number} width
 * @param {number} height
 * @param {MusicAnalysis} analysis
 * @param {number} mapTimeMs
 */
export function drawMusicBackground(context, width, height, analysis, mapTimeMs) {
  if (analysis.level < 0.001) return;
  context.save();
  const burst = analysis.burst ?? 0;
  context.globalAlpha = Math.min(0.55, analysis.level * 0.45 + burst * 0.2);
  const gap = width / analysis.bands.length;
  let cached = barGradients.get(context);
  if (!cached || cached.width !== width || cached.gradients.length !== analysis.bands.length) {
    const gradients = Array.from(analysis.bands, (_, index) => {
      const x = index * gap + gap * 0.18;
      const gradient = context.createLinearGradient(x, 0, x + gap * 0.64, 0);
      gradient.addColorStop(0, 'rgba(136,231,228,0)');
      gradient.addColorStop(0.4, 'rgba(136,231,228,0.85)');
      gradient.addColorStop(0.6, 'rgba(119,124,221,0.85)');
      gradient.addColorStop(1, 'rgba(119,124,221,0)');
      return gradient;
    });
    cached = { width, gradients };
    barGradients.set(context, cached);
  }
  const baseline = height;
  for (let index = 0; index < analysis.bands.length; index += 1) {
    const band = analysis.bands[index];
    const barHeight = band * band * height * (0.015 + analysis.level ** 2 * 0.055 + burst * 0.12);
    if (barHeight < 1) continue;
    context.fillStyle = cached.gradients[index];
    context.fillRect(index * gap + gap * 0.18, baseline - barHeight, gap * 0.64, barHeight);
  }
  context.strokeStyle = '#92bde4';
  context.globalAlpha = analysis.level * 0.12;
  context.lineWidth = 8;
  for (let wave = 0; wave < 2; wave += 1) {
    context.beginPath();
    for (let step = 0; step <= 24; step += 1) {
      const x = width * step / 24;
      const y = height * (0.48 + wave * 0.18)
        + Math.sin(step * 0.32 + mapTimeMs * 0.001 + wave * 2) * height * 0.025 * analysis.bass;
      if (step === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }
  context.restore();
}
