// @ts-check

import { calculateCircleVisualState, createCircleDrawCommands } from './circleRenderer.js';
import { SLIDER_VISUAL_FADE_OUT_MS, sliderPositionAt } from '../rules/sliderJudge.js';
import { RenderCoordinator, RenderLayer } from './renderCoordinator.js';
import { activeStoryboardObjects } from '../storyboard/storyboardTimeline.js';
import { StoryboardRenderer } from '../storyboard/storyboardRenderer.js';
import { layoutComboDigits, sliderHeadShowsCombo } from './comboNumber.js';
import { HitFeedbackTimeline } from './hitFeedback.js';
import { comboColourCss, followPointSprites, reverseArrowAngle } from './hitObjectVisuals.js';
import { gameplayHudLayout, scoreGlyphs } from './gameplayHud.js';
import { drawMusicBackground, musicBackgroundTransform } from './musicBackground.js';

export class PlayfieldRenderer {
  /** @param {CanvasRenderingContext2D} context @param {import('../input/coordinateMapper.js').CoordinateMapper} mapper @param {import('../skin/skinManager.js').SkinManager} skin */
  constructor(context, mapper, skin) {
    this.context = context;
    this.mapper = mapper;
    this.skin = skin;
    this.coordinator = new RenderCoordinator(context, mapper.cssWidth, mapper.cssHeight);
    /** @type {CanvasImageSource|null} */
    this.background = null;
    this.backgroundDim = 0.65;
    /** @type {import('./musicBackground.js').MusicAnalysis|null} */
    this.musicAnalysis = null;
    this.reducedMotion = false;
    this.cursorPosition = { x: 256, y: 192 };
    this.cursorScale = 1;
    this.cursorTrailEnabled = true;
    this.hudDetailEnabled = true;
    this.inputOverlayEnabled = true;
    /** @type {Array<{x:number,y:number,timeMs?:number}>} */
    this.cursorTrail = [];
    /** @type {Array<any>} */
    this.hitObjects = [];
    this.storyboard = null;
    this.storyboardRenderer = null;
    this.hitFeedback = new HitFeedbackTimeline();
    /** @type {{score:number,accuracy:number,combo:number,health:number,judgements:Record<string,number>,activeChannels:Set<string>,pressChannels:Set<string>,timingErrorMs:number|null}} */
    this.hudState = {
      score: 0, accuracy: 1, combo: 0, health: 1,
      judgements: { 300: 0, 100: 0, 50: 0, miss: 0 },
      activeChannels: new Set(), pressChannels: new Set(),
      timingErrorMs: null,
    };
    /** @type {WeakMap<object, Map<string, CanvasImageSource>>} */
    this.tintedImages = new WeakMap();
    this.sliderGeometry = new WeakMap();
  }

  /** @param {CanvasImageSource|null} image */
  setBackground(image) { this.background = image; }

  /** @param {import('./musicBackground.js').MusicAnalysis} analysis */
  setMusicAnalysis(analysis) { this.musicAnalysis = analysis; }

  /** @param {any} storyboard @param {Map<string,CanvasImageSource>} images */
  setStoryboard(storyboard, images) {
    this.storyboard = storyboard;
    this.storyboardRenderer = new StoryboardRenderer(this.mapper, images);
  }

  /** @param {Array<any>} objects */
  setHitObjects(objects) { this.hitObjects = objects; }

  /** @param {{score:number,accuracy:number,combo:number,health:number,timingErrorMs?:number|null,judgements?:Record<string,number>,activeChannels:Set<string>,pressChannels?:Set<string>}} state */
  setHudState(state) {
    this.hudState = {
      ...state,
      judgements: {
        300: state.judgements?.[300] ?? 0,
        100: state.judgements?.[100] ?? 0,
        50: state.judgements?.[50] ?? 0,
        miss: state.judgements?.miss ?? 0,
      },
      pressChannels: state.pressChannels ?? new Set(),
      timingErrorMs: typeof state.timingErrorMs === 'number' && Number.isFinite(state.timingErrorMs) ? state.timingErrorMs : null,
    };
  }

  /** @param {{x:number,y:number}} position @param {number} [mapTimeMs] */
  setCursor(position, mapTimeMs) {
    this.cursorPosition = { ...position };
    if (this.cursorTrailEnabled) {
      const last = this.cursorTrail.at(-1);
      if (!last || Math.hypot(position.x - last.x, position.y - last.y) >= 0.5) {
        this.cursorTrail.push({ ...position, timeMs: mapTimeMs });
      }
      if (Number.isFinite(mapTimeMs)) {
        this.cursorTrail = this.cursorTrail.filter((point) => !Number.isFinite(point.timeMs) || /** @type {number} */ (mapTimeMs) - /** @type {number} */ (point.timeMs) <= 140);
      }
      if (this.cursorTrail.length > 24) this.cursorTrail.splice(0, this.cursorTrail.length - 24);
    }
  }

  /** @param {{backgroundDim?:number,cursorScale?:number,cursorTrail?:boolean,hudDetailEnabled?:boolean,inputOverlayEnabled?:boolean}} settings */
  setVisualSettings(settings) {
    if (settings.backgroundDim !== undefined) this.backgroundDim = settings.backgroundDim;
    if (settings.cursorScale !== undefined) this.cursorScale = settings.cursorScale;
    if (settings.cursorTrail !== undefined) { this.cursorTrailEnabled = settings.cursorTrail; if (!settings.cursorTrail) this.cursorTrail = []; }
    if (settings.hudDetailEnabled !== undefined) this.hudDetailEnabled = settings.hudDetailEnabled;
    if (settings.inputOverlayEnabled !== undefined) this.inputOverlayEnabled = settings.inputOverlayEnabled;
  }

  /** @param {any|null} effect */
  pushHitFeedback(effect) { this.hitFeedback.push(effect); }

  /** @param {{circles:Array<any>,sliders:Array<any>,spinners:Array<any>}} objects @param {number} mapTimeMs @param {number} preemptMs */
  render(objects, mapTimeMs, preemptMs) {
    const commands = [];
    let activeStoryboardCount = 0;
    commands.push({ layer: RenderLayer.BACKGROUND, draw: (/** @type {CanvasRenderingContext2D} */ context) => this.drawBackground(context, mapTimeMs) });
    if (this.storyboard && this.storyboardRenderer) {
      const active = activeStoryboardObjects(this.storyboard, mapTimeMs, 'playing');
      activeStoryboardCount = active.length;
      commands.push(...this.storyboardRenderer.createDrawCommands(active));
    }
    if (this.musicAnalysis && !this.reducedMotion) {
      const analysis = this.musicAnalysis;
      commands.push({
        layer: RenderLayer.MUSIC_BACKGROUND,
        draw: (/** @type {CanvasRenderingContext2D} */ context) => drawMusicBackground(context, this.mapper.cssWidth, this.mapper.cssHeight, analysis, mapTimeMs),
      });
    }
    commands.push({
      layer: RenderLayer.BACKGROUND_DIM,
      draw: (/** @type {CanvasRenderingContext2D} */ context) => {
        context.fillStyle = `rgba(0,0,0,${this.backgroundDim})`;
        context.fillRect(0, 0, this.mapper.cssWidth, this.mapper.cssHeight);
      },
    });
    const followPoints = followPointSprites(this.hitObjects, mapTimeMs, preemptMs);
    if (followPoints.length > 0) {
      commands.push({ layer: RenderLayer.HIT_OBJECT, draw: (/** @type {CanvasRenderingContext2D} */ context) => this.drawFollowPoints(context, followPoints) });
    }
    const orderedSliders = [...objects.sliders].sort((left, right) => {
      const leftActive = mapTimeMs >= left.startTimeMs ? 1 : 0;
      const rightActive = mapTimeMs >= right.startTimeMs ? 1 : 0;
      return leftActive - rightActive || right.startTimeMs - left.startTimeMs;
    });
    for (const slider of orderedSliders) {
      commands.push({ layer: RenderLayer.HIT_OBJECT, draw: (/** @type {CanvasRenderingContext2D} */ context) => this.drawSlider(context, slider, mapTimeMs, preemptMs) });
    }
    for (const circle of objects.circles) {
      for (const command of createCircleDrawCommands(circle, mapTimeMs, preemptMs)) {
        commands.push({ layer: RenderLayer.HIT_OBJECT, draw: (/** @type {CanvasRenderingContext2D} */ context) => this.drawCircleCommand(context, command) });
      }
    }
    for (const spinner of objects.spinners) {
      commands.push({ layer: RenderLayer.HIT_OBJECT, draw: (/** @type {CanvasRenderingContext2D} */ context) => this.drawSpinner(context, spinner, mapTimeMs) });
    }
    for (const effect of this.hitFeedback.snapshot(mapTimeMs)) {
      commands.push({ layer: RenderLayer.HIT_OBJECT, draw: (/** @type {CanvasRenderingContext2D} */ context) => this.drawHitFeedback(context, effect) });
    }
    commands.push({ layer: RenderLayer.HUD, draw: (/** @type {CanvasRenderingContext2D} */ context) => this.drawHud(context) });
    commands.push({ layer: RenderLayer.CURSOR, draw: (/** @type {CanvasRenderingContext2D} */ context) => this.drawCursorTrail(context) });
    commands.push({ layer: RenderLayer.CURSOR, draw: (/** @type {CanvasRenderingContext2D} */ context) => this.drawCursor(context) });
    this.coordinator.width = this.mapper.cssWidth;
    this.coordinator.height = this.mapper.cssHeight;
    this.coordinator.render(commands);
    return { drawCalls: commands.length, activeStoryboardCount };
  }

  /** @param {any} slider */
  getSliderGeometry(slider) {
    const key = `${this.mapper.cssWidth}:${this.mapper.cssHeight}:${this.mapper.scale}`;
    const cached = this.sliderGeometry.get(slider);
    if (cached?.key === key) return cached;
    const points = slider.pathPoints.map((/** @type {{x:number,y:number}} */ point) => this.mapper.playfieldToScreen(point));
    const path = new Path2D();
    if (points.length > 0) {
      path.moveTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length; index += 1) path.lineTo(points[index].x, points[index].y);
    }
    const geometry = { key, points, path };
    this.sliderGeometry.set(slider, geometry);
    return geometry;
  }

  /** @param {CanvasRenderingContext2D} context @param {any} slider @param {number} mapTimeMs @param {number} [preemptMs] */
  drawSlider(context, slider, mapTimeMs, preemptMs = 1200) {
    const { points, path } = this.getSliderGeometry(slider);
    if (points.length < 2) return;
    context.save();
    const fadeIn = calculateCircleVisualState(slider, mapTimeMs, preemptMs).opacity;
    const fadeOut = mapTimeMs <= slider.endTimeMs
      ? 1
      : Math.max(0, 1 - (mapTimeMs - slider.endTimeMs) / SLIDER_VISUAL_FADE_OUT_MS);
    context.globalAlpha = fadeIn * fadeOut;
    context.lineCap = 'round'; context.lineJoin = 'round';
    const bodyWidth = slider.radius * this.mapper.scale;
    context.strokeStyle = 'rgb(0 0 0 / 62%)'; context.lineWidth = bodyWidth * 2.35;
    context.shadowColor = comboColourCss(slider.comboColour); context.shadowBlur = bodyWidth * 0.28;
    context.stroke(path);
    context.shadowBlur = 0;
    context.strokeStyle = comboColourCss(this.skin.config.colours.SliderBorder); context.lineWidth = bodyWidth * 2.1;
    context.stroke(path);
    context.strokeStyle = comboColourCss(this.skin.config.colours.SliderTrackOverride ?? slider.comboColour); context.lineWidth = bodyWidth * 1.75; context.stroke(path);
    context.save();
    context.globalAlpha = fadeIn * fadeOut * 0.11;
    context.strokeStyle = '#fff'; context.lineWidth = bodyWidth * 1.08; context.stroke(path);
    context.restore();
    const radius = bodyWidth;
    if (sliderHeadShowsCombo(slider)) {
      const head = points[0];
      if (mapTimeMs <= slider.startTimeMs) {
        const visual = calculateCircleVisualState(slider, mapTimeMs, preemptMs);
        const approach = this.skin.getRole?.('approachCircle') ?? this.skin.get('approachcircle.png');
        const approachRadius = radius * visual.approachScale;
        context.save(); context.globalAlpha = visual.opacity;
        if (approach) this.drawTintedImage(context, approach, head.x - approachRadius, head.y - approachRadius, approachRadius * 2, approachRadius * 2, slider.comboColour);
        else {
          context.strokeStyle = comboColourCss(slider.comboColour); context.lineWidth = Math.max(2, this.mapper.scale * 2);
          context.beginPath(); context.arc(head.x, head.y, approachRadius, 0, Math.PI * 2); context.stroke();
        }
        context.restore();
      }
      const base = this.skin.getRole?.('sliderHeadBase') ?? this.skin.get('hitcircle.png');
      const overlay = this.skin.getRole?.('sliderHeadOverlay') ?? this.skin.get('hitcircleoverlay.png');
      if (base) this.drawTintedImage(context, base, head.x - radius, head.y - radius, radius * 2, radius * 2, slider.comboColour);
      else { context.fillStyle = '#7656d8'; context.beginPath(); context.arc(head.x, head.y, radius, 0, Math.PI * 2); context.fill(); }
      if (overlay) context.drawImage(overlay, head.x - radius, head.y - radius, radius * 2, radius * 2);
      this.drawComboNumber(context, head, radius, slider.comboNumber ?? 1);
    }
    const tailPart = slider.parts.find((/** @type {any} */ part) => part.kind === 'tail');
    if (tailPart?.result === null) {
      const end = points.at(-1);
      const endImage = this.skin.getRole?.('sliderTail') ?? this.skin.get('sliderendcircle.png');
      if (end && endImage) this.drawTintedImage(context, endImage, end.x - radius, end.y - radius, radius * 2, radius * 2, slider.comboColour);
    }
    for (const part of slider.parts.filter((/** @type {any} */ part) => part.kind === 'tick' && part.result === null)) {
      const tick = this.mapper.playfieldToScreen(part.position);
      const image = this.skin.getRole?.('sliderScorePoint') ?? this.skin.get('sliderscorepoint.png');
      if (image) context.drawImage(image, tick.x - 8, tick.y - 8, 16, 16);
      else { context.fillStyle = '#fff'; context.beginPath(); context.arc(tick.x, tick.y, 4, 0, Math.PI * 2); context.fill(); }
    }
    for (const part of slider.parts.filter((/** @type {any} */ part) => part.kind === 'repeat' && part.result === null)) {
      const repeat = this.mapper.playfieldToScreen(part.position);
      const image = this.skin.getRole?.('reverseArrow') ?? this.skin.get('reversearrow.png');
      if (image) {
        context.save(); context.translate(repeat.x, repeat.y); context.rotate(reverseArrowAngle(slider, part));
        context.drawImage(image, -radius, -radius, radius * 2, radius * 2); context.restore();
      }
    }
    if (mapTimeMs >= slider.startTimeMs && mapTimeMs <= slider.endTimeMs) {
      const ball = this.mapper.playfieldToScreen(sliderPositionAt(slider, mapTimeMs));
      const follow = this.skin.getRole?.('sliderFollowCircle') ?? this.skin.get('sliderfollowcircle.png');
      if (follow && slider.tracking) context.drawImage(follow, ball.x - radius * 1.5, ball.y - radius * 1.5, radius * 3, radius * 3);
      const image = this.skin.getRole?.('sliderBall') ?? this.skin.get('sliderb0.png');
      if (image && this.skin.config.general.allowSliderBallTint) this.drawTintedImage(context, image, ball.x - radius, ball.y - radius, radius * 2, radius * 2, slider.comboColour);
      else if (image) context.drawImage(image, ball.x - radius, ball.y - radius, radius * 2, radius * 2);
      else { context.fillStyle = '#fff'; context.beginPath(); context.arc(ball.x, ball.y, radius * 0.55, 0, Math.PI * 2); context.fill(); }
    }
    context.restore();
  }

  /** @param {CanvasRenderingContext2D} context @param {Array<any>} points */
  drawFollowPoints(context, points) {
    for (const point of points) {
      const center = this.mapper.playfieldToScreen(point.position);
      const image = this.skin.getRoleAt?.('followPoints', point.frame) ?? this.skin.get(`followpoint-${point.frame}.png`) ?? this.skin.get('followpoint.png');
      if (!image) continue;
      context.save(); context.globalAlpha = point.opacity; context.translate(center.x, center.y); context.rotate(point.angle);
      context.drawImage(image, -16 * this.mapper.scale, -8 * this.mapper.scale, 32 * this.mapper.scale, 16 * this.mapper.scale);
      context.restore();
    }
  }

  /** @param {CanvasRenderingContext2D} context @param {any} spinner @param {number} mapTimeMs */
  drawSpinner(context, spinner, mapTimeMs) {
    const center = this.mapper.playfieldToScreen({ x: 256, y: 192 });
    const size = Math.min(this.mapper.cssWidth, this.mapper.cssHeight) * 0.68;
    const isRenderable = (/** @type {any} */ image) => image && !(Number(image.width) === 1 && Number(image.height) === 1);
    const drawLayer = (/** @type {string} */ name, rotation = 0, scale = 1) => {
      const image = this.skin.get(name); if (!image) return;
      if (!isRenderable(image)) return;
      context.save(); context.translate(center.x, center.y); context.rotate(rotation);
      const layerSize = size * scale;
      context.drawImage(image, -layerSize / 2, -layerSize / 2, layerSize, layerSize); context.restore();
    };
    const drawNaturalLayer = (/** @type {string} */ name, yOffset = 0) => {
      const image = /** @type {any} */ (this.skin.get(name));
      if (!isRenderable(image)) return;
      const sourceWidth = Math.max(1, Number(image.width));
      const sourceHeight = Math.max(1, Number(image.height));
      const scale = Math.min(this.mapper.scale, size * 0.42 / sourceWidth);
      const width = sourceWidth * scale;
      const height = sourceHeight * scale;
      context.drawImage(image, center.x - width / 2, center.y + yOffset - height / 2, width, height);
    };
    context.save(); context.globalAlpha = 0.9;
    const background = this.skin.get('spinner-background.png');
    if (isRenderable(background)) context.drawImage(/** @type {CanvasImageSource} */ (background), center.x - size / 2, center.y - size / 2, size, size);
    else {
      context.fillStyle = 'rgb(0 0 0 / 45%)'; context.beginPath(); context.arc(center.x, center.y, size / 2, 0, Math.PI * 2); context.fill();
    }
    drawLayer('spinner-bottom.png');
    drawLayer('spinner-circle.png', spinner.rotationRadians);
    drawLayer('spinner-middle.png'); drawLayer('spinner-middle2.png'); drawLayer('spinner-glow.png');
    drawLayer('spinner-spin.png', spinner.rotationRadians);
    drawLayer('spinner-top.png');
    context.save(); context.translate(center.x, center.y); context.rotate(spinner.rotationRadians);
    context.strokeStyle = '#f5e9ff'; context.lineWidth = Math.max(2, this.mapper.scale * 3);
    for (let index = 0; index < 12; index += 1) {
      const angle = index * Math.PI / 6;
      const inner = size * 0.26; const outer = size * 0.31;
      context.beginPath(); context.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      context.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer); context.stroke();
    }
    context.restore();
    const timeProgress = Math.min(1, Math.max(0, (mapTimeMs - spinner.startTimeMs) / Math.max(1, spinner.endTimeMs - spinner.startTimeMs)));
    drawLayer('spinner-approachcircle.png', 0, Math.max(0.08, 1 - timeProgress));
    drawNaturalLayer('spinner-rpm.png', size * 0.2);
    const progress = Math.min(1, spinner.rotationRadians / (Math.PI * 2 * Math.max(1, spinner.requiredSpins)));
    if (progress >= 1) drawNaturalLayer('spinner-clear.png', -size * 0.18);
    context.save();
    context.strokeStyle = progress >= 1 ? '#76edff' : 'rgb(255 255 255 / 78%)';
    context.lineWidth = Math.max(3, this.mapper.scale * 4);
    context.beginPath();
    context.arc(center.x, center.y, size * 0.36, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    context.stroke();
    const remainingSeconds = Math.max(0, spinner.endTimeMs - mapTimeMs) / 1000;
    context.fillStyle = '#fff';
    context.font = `700 ${Math.max(18, 20 * this.mapper.scale)}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(remainingSeconds.toFixed(1), center.x, center.y + size * 0.29);
    context.restore();
    context.restore();
  }

  /** @param {CanvasRenderingContext2D} context @param {number} [mapTimeMs] */
  drawBackground(context, mapTimeMs = 0) {
    context.fillStyle = '#090713';
    context.fillRect(0, 0, this.mapper.cssWidth, this.mapper.cssHeight);
    if (!this.background) return;
    const imageWidth = Number(/** @type {any} */ (this.background).width);
    const imageHeight = Number(/** @type {any} */ (this.background).height);
    const motion = musicBackgroundTransform(this.musicAnalysis, mapTimeMs, this.reducedMotion);
    const scale = Math.max(this.mapper.cssWidth / imageWidth, this.mapper.cssHeight / imageHeight) * motion.zoom;
    const width = imageWidth * scale;
    const height = imageHeight * scale;
    context.drawImage(this.background, (this.mapper.cssWidth - width) / 2 + motion.x, (this.mapper.cssHeight - height) / 2 + motion.y, width, height);
  }

  /** @param {CanvasRenderingContext2D} context @param {any} command */
  drawCircleCommand(context, command) {
    const center = this.mapper.playfieldToScreen(command.position);
    const radius = command.radius * this.mapper.scale;
    context.save();
    context.globalAlpha = command.opacity;
    if (command.type === 'combo-number') {
      this.drawComboNumber(context, center, radius, command.value);
    } else {
      const role = command.type === 'approach-circle' ? 'approachCircle' : command.type === 'hit-circle-overlay' ? 'circleOverlay' : 'circleBase';
      const assetName = command.type === 'approach-circle' ? 'approachcircle.png' : command.type === 'hit-circle-overlay' ? 'hitcircleoverlay.png' : 'hitcircle.png';
      const image = this.skin.getRole?.(role) ?? this.skin.get(assetName);
      const drawRadius = radius * command.scale;
      if (image && command.type !== 'hit-circle-overlay') this.drawTintedImage(context, image, center.x - drawRadius, center.y - drawRadius, drawRadius * 2, drawRadius * 2, command.comboColour);
      else if (image) context.drawImage(image, center.x - drawRadius, center.y - drawRadius, drawRadius * 2, drawRadius * 2);
      else {
        context.strokeStyle = command.type === 'approach-circle' ? '#fff' : '#8b6cff';
        context.lineWidth = Math.max(2, this.mapper.scale * 2);
        context.beginPath(); context.arc(center.x, center.y, drawRadius, 0, Math.PI * 2); context.stroke();
      }
    }
    context.restore();
  }

  /** @param {CanvasRenderingContext2D} context @param {{x:number,y:number}} center @param {number} radius @param {number} value */
  drawComboNumber(context, center, radius, value) {
    const prefix = this.skin.config.fonts.hitCirclePrefix ?? 'default';
    const layout = layoutComboDigits(value, radius, this.skin.config.fonts.hitCircleOverlap ?? 0);
    const allImages = layout.map((digit) => this.skin.get(`${prefix}-${digit.digit}.png`));
    if (allImages.every(Boolean)) {
      layout.forEach((digit, index) => context.drawImage(/** @type {CanvasImageSource} */ (allImages[index]), center.x + digit.x, center.y - digit.height / 2, digit.width, digit.height));
      return;
    }
    context.fillStyle = '#fff'; context.font = `700 ${radius}px sans-serif`; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(String(value), center.x, center.y);
  }

  /** @param {CanvasRenderingContext2D} context @param {import('./hitFeedback.js').HitFeedbackEffect & {progress:number}} effect */
  drawHitFeedback(context, effect) {
    const center = this.mapper.playfieldToScreen(effect.position);
    const radius = (effect.radius ?? 36) * this.mapper.scale;
    const progress = effect.progress;
    const fade = (1 - progress) ** 2;
    const travel = 1 - (1 - progress) ** 3;
    const pulseRadius = radius * (0.55 + travel * 1.15);
    const resultImage = effect.assetName ? this.skin.get(effect.assetName) : null;
    context.save();
    context.translate(center.x, center.y);
    context.globalCompositeOperation = 'lighter';
    context.globalAlpha = fade * effect.strength;
    context.strokeStyle = effect.tone;
    context.fillStyle = effect.tone;
    context.lineWidth = Math.max(1.5, radius * 0.075 * (1 - progress));
    context.beginPath(); context.arc(0, 0, pulseRadius, 0, Math.PI * 2); context.stroke();
    if (effect.grade === 'miss') {
      const size = radius * (0.25 + travel * 0.2);
      context.beginPath(); context.moveTo(-size, -size); context.lineTo(size, size);
      context.moveTo(size, -size); context.lineTo(-size, size); context.stroke();
    } else {
      if (effect.kind === 'repeat' || effect.kind === 'tail' || effect.kind === 'judgement') {
        context.globalAlpha = fade * effect.strength * 0.55;
        context.beginPath(); context.arc(0, 0, pulseRadius * 0.72, 0, Math.PI * 2); context.stroke();
      }
      context.globalAlpha = fade * effect.strength * 0.12;
      context.beginPath(); context.arc(0, 0, radius * (0.45 + travel * 0.4), 0, Math.PI * 2); context.fill();
      context.globalAlpha = fade * effect.strength * 0.9;
      const phase = effect.startTimeMs * 0.01;
      for (let index = 0; index < effect.particles; index += 1) {
        const angle = phase + index * Math.PI * 2 / effect.particles;
        const distance = radius * (0.4 + travel * (index % 2 === 0 ? 1.35 : 1.05));
        const length = radius * (0.12 + effect.strength * 0.16) * (1 - progress);
        const x = Math.cos(angle);
        const y = Math.sin(angle);
        context.beginPath(); context.moveTo(x * distance, y * distance);
        context.lineTo(x * (distance + length), y * (distance + length)); context.stroke();
      }
      if (effect.kind === 'head' || effect.kind === 'repeat') {
        const size = radius * (0.22 + travel * 0.15);
        context.beginPath();
        context.moveTo(0, -size); context.lineTo(size, 0); context.lineTo(0, size);
        context.lineTo(-size, 0); context.closePath(); context.stroke();
      }
    }
    context.restore();
    if (resultImage) {
      const size = radius * 2.1 * (1 + travel * 0.08);
      context.save();
      context.globalAlpha = 1 - progress;
      context.drawImage(resultImage, center.x - size / 2, center.y - size / 2 - radius * progress * 0.25, size, size);
      context.restore();
    }
  }

  /** @param {CanvasRenderingContext2D} context */
  drawHud(context) {
    const layout = gameplayHudLayout(this.mapper.cssWidth, this.mapper.cssHeight);
    const scorePrefix = this.skin.config.fonts.scorePrefix ?? 'score';
    const comboPrefix = this.skin.config.fonts.comboPrefix ?? 'combo';
    const defaultPrefix = 'default';
    const scoreHeight = 36;
    const accuracyHeight = 33;
    const comboHeight = 42;
    this.drawHudGlyphs(context, String(Math.max(0, Math.trunc(this.hudState.score))).padStart(8, '0'), layout.score.x, layout.score.y, 'right', scorePrefix, scoreHeight);
    this.drawHudGlyphs(context, `${(this.hudState.accuracy * 100).toFixed(2)}%`, layout.accuracy.x, layout.accuracy.y, 'center', defaultPrefix, accuracyHeight, scorePrefix);
    this.drawHudGlyphs(context, String(this.hudState.combo), layout.combo.x, layout.combo.y, 'left', comboPrefix, comboHeight);
    const comboX = this.skin.get('combo-x.png');
    if (comboX) {
      const comboAdvance = comboHeight * 0.62 - (this.skin.config.fonts.comboOverlap ?? 0) * comboHeight / 64;
      const comboXSize = 33;
      context.drawImage(
        comboX,
        layout.combo.x + Math.max(1, String(this.hudState.combo).length) * comboAdvance,
        layout.combo.y + (comboHeight - comboXSize) / 2,
        comboXSize,
        comboXSize,
      );
    }

    const hpBackground = this.skin.get('scorebar-bg.png');
    const hpColour = this.skin.get('scorebar-colour.png');
    const hpMarker = this.skin.get('scorebar-marker.png');
    const hpHeight = 24;
    if (hpBackground) context.drawImage(hpBackground, layout.hp.x, layout.hp.y, layout.hp.width, hpHeight);
    if (hpColour) {
      const fillWidth = layout.hp.width * Math.max(0, Math.min(1, this.hudState.health));
      if (fillWidth > 0) context.drawImage(hpColour, 0, 0, Number(/** @type {any} */ (hpColour).width) * this.hudState.health, Number(/** @type {any} */ (hpColour).height), layout.hp.x, layout.hp.y, fillWidth, hpHeight);
    }
    if (hpMarker) {
      const markerX = layout.hp.x + layout.hp.width * Math.max(0, Math.min(1, this.hudState.health));
      context.drawImage(hpMarker, markerX - 8, layout.hp.y - 4, 16, 32);
    }
    context.save();
    context.strokeStyle = 'rgb(225 246 255 / 88%)';
    context.lineWidth = 1;
    context.strokeRect(layout.hp.x + 0.5, layout.hp.y + 0.5, layout.hp.width - 1, hpHeight - 1);
    context.restore();

    if (this.inputOverlayEnabled) {
      const inputBackground = this.skin.get('inputoverlay-background.png');
      if (inputBackground) context.drawImage(inputBackground, layout.input.x, layout.input.y, 64, 112);
      const inputKey = this.skin.get('inputoverlay-key.png');
      const inputRows = [['key-left', 'K1'], ['key-right', 'K2'], ['mouse-left', 'M1'], ['mouse-right', 'M2']];
      inputRows.forEach(([channel, label], index) => {
        const active = this.hudState.activeChannels.has(channel);
        const pressed = this.hudState.pressChannels?.has(channel) ?? false;
        context.save(); context.globalAlpha = active ? 1 : pressed ? 0.72 : 0.32;
        if (inputKey) context.drawImage(inputKey, layout.input.x + 16, layout.input.y + 6 + index * 24, 32, 20);
        context.fillStyle = '#fff'; context.font = '700 10px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
        context.fillText(label, layout.input.x + 32, layout.input.y + 16 + index * 24); context.restore();
      });
    }

    if (!this.hudDetailEnabled) return;
    context.save();
    context.fillStyle = 'rgb(255 255 255 / 42%)';
    context.fillRect(layout.timing.x, layout.timing.y, layout.timing.width, 3);
    context.fillStyle = '#fff';
    context.fillRect(layout.timing.centerX - 1, layout.timing.y - 4, 2, 11);
    if (this.hudState.timingErrorMs !== null) {
      const normalized = Math.max(-1, Math.min(1, this.hudState.timingErrorMs / 150));
      const markerX = layout.timing.centerX + normalized * layout.timing.width / 2;
      context.fillStyle = Math.abs(normalized) <= 0.35 ? '#65e6ff' : Math.abs(normalized) <= 0.7 ? '#f7d85b' : '#ff5575';
      context.fillRect(markerX - 1.5, layout.timing.y - 7, 3, 17);
    }
    context.restore();
  }

  /** @param {CanvasRenderingContext2D} context @param {string} value @param {number} x @param {number} y @param {'left'|'center'|'right'} align @param {string} prefix @param {number} height @param {string} [symbolPrefix] */
  drawHudGlyphs(context, value, x, y, align, prefix, height, symbolPrefix = prefix) {
    const names = scoreGlyphs(value, prefix, symbolPrefix);
    const width = height * 0.62;
    const comboPrefix = this.skin.config.fonts.comboPrefix ?? 'combo';
    const defaultPrefix = 'default';
    const overlapSetting = prefix === comboPrefix
      ? this.skin.config.fonts.comboOverlap
      : prefix === defaultPrefix
        ? this.skin.config.fonts.hitCircleOverlap
        : this.skin.config.fonts.scoreOverlap;
    const overlap = (overlapSetting ?? 0) * height / 64;
    const advance = width - overlap;
    const totalWidth = width + Math.max(0, names.length - 1) * advance;
    const startX = align === 'right' ? x - totalWidth : align === 'center' ? x - totalWidth / 2 : x;
    const images = names.map((name) => this.skin.get(name));
    if (images.every(Boolean)) {
      images.forEach((image, index) => context.drawImage(/** @type {CanvasImageSource} */ (image), startX + index * advance, y, width, height));
      return;
    }
    context.fillStyle = '#fff'; context.font = `700 ${height}px sans-serif`; context.textAlign = align; context.textBaseline = 'top'; context.fillText(value, x, y);
  }

  /** @param {CanvasRenderingContext2D} context */
  drawCursor(context) {
    const center = this.mapper.playfieldToScreen(this.cursorPosition);
    const image = this.skin.getRole?.('cursor') ?? this.skin.get('cursor.png');
    const radius = 20 * this.cursorScale;
    if (image) context.drawImage(image, center.x - radius, center.y - radius, radius * 2, radius * 2);
    else { context.fillStyle = '#fff'; context.beginPath(); context.arc(center.x, center.y, 8 * this.cursorScale, 0, Math.PI * 2); context.fill(); }
  }

  /** @param {CanvasRenderingContext2D} context */
  drawCursorTrail(context) {
    if (!this.cursorTrailEnabled || this.cursorTrail.length < 2) return;
    const roleDeclared = this.skin.hasRole?.('cursorTrail') ?? false;
    const image = this.skin.getRole?.('cursorTrail') ?? (roleDeclared ? null : this.skin.get('cursortrail.png'));
    if (roleDeclared && !image) return;
    context.save(); context.fillStyle = '#fff';
    this.cursorTrail.slice(0, -1).forEach((position, index, points) => {
      const center = this.mapper.playfieldToScreen(position);
      context.globalAlpha = (index + 1) / points.length * 0.28;
      const radius = 9 * this.cursorScale;
      if (image) context.drawImage(image, center.x - radius, center.y - radius, radius * 2, radius * 2);
      else { context.beginPath(); context.arc(center.x, center.y, 3.5 * this.cursorScale, 0, Math.PI * 2); context.fill(); }
    });
    context.restore();
  }

  /** @param {CanvasRenderingContext2D} context @param {CanvasImageSource} image @param {number} x @param {number} y @param {number} width @param {number} height @param {number[]|undefined} colour */
  drawTintedImage(context, image, x, y, width, height, colour) {
    const sourceWidth = Number(/** @type {any} */ (image).naturalWidth ?? /** @type {any} */ (image).width ?? 0);
    const sourceHeight = Number(/** @type {any} */ (image).naturalHeight ?? /** @type {any} */ (image).height ?? 0);
    if (sourceWidth <= 0 || sourceHeight <= 0 || (typeof image !== 'object' && typeof image !== 'function')) {
      context.drawImage(image, x, y, width, height);
      return;
    }
    const tint = comboColourCss(colour);
    let variants = this.tintedImages.get(/** @type {object} */ (image));
    if (!variants) { variants = new Map(); this.tintedImages.set(/** @type {object} */ (image), variants); }
    let tinted = variants.get(tint);
    if (!tinted) {
      const canvas = typeof globalThis.OffscreenCanvas === 'function'
        ? new globalThis.OffscreenCanvas(sourceWidth, sourceHeight)
        : document.createElement('canvas');
      canvas.width = sourceWidth; canvas.height = sourceHeight;
      const tintContext = /** @type {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D|null} */ (canvas.getContext('2d'));
      if (!tintContext) { context.drawImage(image, x, y, width, height); return; }
      tintContext.drawImage(image, 0, 0, sourceWidth, sourceHeight);
      tintContext.globalCompositeOperation = 'source-in';
      tintContext.fillStyle = tint;
      tintContext.fillRect(0, 0, sourceWidth, sourceHeight);
      tintContext.globalCompositeOperation = 'source-over';
      tinted = canvas;
      variants.set(tint, tinted);
    }
    context.drawImage(tinted, x, y, width, height);
  }
}
