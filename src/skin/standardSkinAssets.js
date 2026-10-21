// @ts-check

/** @param {string} prefix */
const digits = (prefix) => Array.from({ length: 10 }, (_, index) => `${prefix}-${index}.png`);

const FIXED_GROUPS = Object.freeze({
  gameplay: Object.freeze([
    'approachcircle.png', 'hitcircle.png', 'hitcircleoverlay.png',
    'sliderb0.png', 'sliderstartcircle.png', 'sliderstartcircleoverlay.png',
    'sliderendcircle.png', 'sliderfollowcircle.png', 'sliderscorepoint.png', 'reversearrow.png',
    'followpoint.png', ...Array.from({ length: 3 }, (_, index) => `followpoint-${index}.png`),
  ]),
  cursor: Object.freeze(['cursor.png', 'cursortrail.png', 'cursor-smoke.png']),
  judgements: Object.freeze([
    'hit0.png', 'hit0-0.png', 'hit50.png', 'hit50-0.png',
    'hit100.png', 'hit100-0.png', 'hit100k.png', 'hit100k-0.png',
    'hit300.png', 'hit300-0.png', 'hit300g.png', 'hit300g-0.png', 'hit300k.png', 'hit300k-0.png',
  ]),
  spinner: Object.freeze([
    'spinner-approachcircle.png', 'spinner-background.png', 'spinner-bottom.png', 'spinner-circle.png',
    'spinner-clear.png', 'spinner-glow.png', 'spinner-middle.png', 'spinner-middle2.png',
    'spinner-osu.png', 'spinner-rpm.png', 'spinner-spin.png', 'spinner-top.png', 'spinner-warning.png',
  ]),
  hud: Object.freeze([
    'combo-x.png', 'inputoverlay-background.png', 'inputoverlay-key.png',
    'score-comma.png', 'score-dot.png', 'score-percent.png', 'score-x.png',
    'scorebar-bg.png', 'scorebar-colour.png', 'scorebar-marker.png',
  ]),
  pause: Object.freeze(['pause-back.png', 'pause-continue.png', 'pause-replay.png', 'pause-retry.png']),
  results: Object.freeze([
    'ranking-A.png', 'ranking-accuracy.png', 'ranking-B.png', 'ranking-C.png', 'ranking-D.png',
    'ranking-graph.png', 'ranking-maxcombo.png', 'ranking-panel.png', 'ranking-perfect.png',
    'ranking-S.png', 'Ranking-title.png', 'ranking-X.png',
  ]),
  selection: Object.freeze([
    'mode-osu.png', 'mode-osu-med.png', 'mode-osu-small.png', 'section-fail.png', 'section-pass.png',
    'selection-tab.png', 'songselect-bottom.png',
  ]),
});

const REQUIRED_FIXED = Object.freeze([
  'approachcircle.png', 'hitcircle.png', 'hitcircleoverlay.png', 'cursor.png', 'sliderb0.png',
]);

/**
 * @param {{files:Array<{path:string,role:string}>}} manifest
 * @param {{fonts:Record<string,any>}} config
 * @param {{highResolution?:boolean}} [options]
 */
export function buildStandardSkinPlan(manifest, config, options = {}) {
  const availableImages = new Set(
    manifest.files.filter((file) => file.role === 'image').map((file) => file.path),
  );
  const hitCirclePrefix = config.fonts.hitCirclePrefix ?? 'default';
  const scorePrefix = config.fonts.scorePrefix ?? 'score';
  const comboPrefix = config.fonts.comboPrefix ?? 'combo';
  const select = (/** @type {string} */ name) => {
    const highResolutionName = name.endsWith('.png') ? name.replace(/\.png$/, '@2x.png') : name;
    if (options.highResolution && availableImages.has(highResolutionName)) return highResolutionName;
    return availableImages.has(name) ? name : null;
  };
  const requiredLogical = [...REQUIRED_FIXED, ...digits(hitCirclePrefix)];

  for (const name of requiredLogical) {
    if (!select(name)) throw new Error(`SKIN_REQUIRED_IMAGE_MISSING: ${name}`);
  }
  const required = requiredLogical.map((name) => /** @type {string} */ (select(name)));

  const requestedGroups = {
    gameplay: [...FIXED_GROUPS.gameplay],
    cursor: [...FIXED_GROUPS.cursor],
    judgements: [...FIXED_GROUPS.judgements],
    spinner: [...FIXED_GROUPS.spinner],
    hitCircleNumbers: digits(hitCirclePrefix),
    hud: [...FIXED_GROUPS.hud, ...digits(scorePrefix), ...digits(comboPrefix)],
    pause: [...FIXED_GROUPS.pause],
    results: [...FIXED_GROUPS.results],
    selection: [...FIXED_GROUPS.selection],
  };
  /** @type {string[]} */
  const diagnostics = [];
  /** @type {Record<string,string[]>} */
  const groups = {};

  for (const [group, names] of Object.entries(requestedGroups)) {
    groups[group] = names.flatMap((name) => {
      const selected = select(name);
      if (selected) return [selected];
      if (!requiredLogical.includes(name)) diagnostics.push(`SKIN_OPTIONAL_IMAGE_MISSING: ${name}`);
      return [];
    });
  }

  const present = (/** @type {string} */ name) => select(name);
  const roles = Object.freeze({
    circleBase: present('hitcircle.png'),
    circleOverlay: present('hitcircleoverlay.png'),
    approachCircle: present('approachcircle.png'),
    sliderBall: present('sliderb0.png'),
    sliderHeadBase: present('hitcircle.png'),
    sliderHeadOverlay: present('hitcircleoverlay.png'),
    sliderStartBase: present('sliderstartcircle.png'),
    sliderStartOverlay: present('sliderstartcircleoverlay.png'),
    sliderTail: present('sliderendcircle.png'),
    sliderEndOverlay: present('sliderendcircleoverlay.png'),
    sliderFollowCircle: present('sliderfollowcircle.png'),
    reverseArrow: present('reversearrow.png'),
    sliderScorePoint: present('sliderscorepoint.png'),
    followPoints: ['followpoint-0.png', 'followpoint-1.png', 'followpoint-2.png'].flatMap((name) => {
      const selected = present(name);
      return selected ? [selected] : [];
    }),
    cursor: present('cursor.png'),
    cursorTrail: present('cursortrail.png'),
  });

  return { groups, required, diagnostics, roles };
}

/** @param {{groups:Record<string,string[]>}} plan @param {string[]} names */
export function skinAssetsForGroups(plan, names) {
  return [...new Set(names.flatMap((name) => plan.groups[name] ?? []))];
}
