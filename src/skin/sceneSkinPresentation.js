// @ts-check

/** @param {string} scene @param {string|null} [rank] @param {boolean} [hasMapFailure] */
export function sceneSkinPresentation(scene, rank = null, hasMapFailure = false) {
  if (scene === 'PAUSED') return { artwork: 'pause-continue.png', panel: null, section: null };
  if (scene === 'FAILED') return { artwork: hasMapFailure ? 'map:fail-background.png' : 'section-fail.png', panel: null, section: 'section-fail.png' };
  if (scene === 'RESULT') return { artwork: `ranking-${rank === 'SS' ? 'X' : rank ?? 'D'}.png`, panel: 'ranking-panel.png', section: 'section-pass.png' };
  return { artwork: null, panel: null, section: null };
}

/** @param {boolean} cleared */
export function completionSoundCandidates(cleared) {
  return cleared
    ? ['applause.mp3', 'sectionpass.wav']
    : ['failsound.wav', 'failsound.mp3', 'sectionfail.wav'];
}

/** @param {string} title */
export function resultRankFromTitle(title) {
  return title.match(/^(SS|[A-DXS])\s/)?.[1] ?? null;
}
