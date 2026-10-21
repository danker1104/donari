// @ts-check

/** @param {any} song @param {Map<string,any>} models @param {string} selectedId */
export function buildDifficultyItems(song, models, selectedId) {
  return song.difficulties.map((/** @type {any} */ difficulty) => {
    const model = models.get(difficulty.id);
    return {
      id: difficulty.id,
      label: difficulty.label,
      beatmapId: difficulty.beatmapId,
      selected: difficulty.id === selectedId,
      ready: Boolean(model),
      hp: model?.hpDrainRate ?? null,
      cs: model?.circleSize ?? null,
      od: model?.overallDifficulty ?? null,
      ar: model?.approachRate ?? null,
      total: model?.statistics?.total ?? null,
    };
  });
}

/** @param {Array<{id:string}>} difficulties @param {string} currentId @param {number} direction */
export function moveDifficultySelection(difficulties, currentId, direction) {
  if (difficulties.length === 0) return currentId;
  const currentIndex = Math.max(0, difficulties.findIndex((difficulty) => difficulty.id === currentId));
  const nextIndex = (currentIndex + Math.sign(direction) + difficulties.length) % difficulties.length;
  return difficulties[nextIndex].id;
}

/** @param {number} deltaX @param {number} deltaY */
export function difficultyDirectionForWheel(deltaX, deltaY) {
  const delta = Math.abs(deltaY) >= Math.abs(deltaX) ? deltaY : deltaX;
  return Number.isFinite(delta) ? Math.sign(delta) : 0;
}

/** @param {string} scene @param {string} key */
export function difficultyDirectionForKey(scene, key) {
  if (scene !== 'DIFFICULTY_SELECT') return 0;
  if (key === 'ArrowLeft') return -1;
  if (key === 'ArrowRight') return 1;
  return 0;
}

/** @param {Array<{id:string}>} difficulties @param {string} currentId @param {string} itemId */
export function carouselOffset(difficulties, currentId, itemId) {
  const length = difficulties.length;
  if (length === 0) return 0;
  const currentIndex = Math.max(0, difficulties.findIndex((difficulty) => difficulty.id === currentId));
  const itemIndex = Math.max(0, difficulties.findIndex((difficulty) => difficulty.id === itemId));
  let offset = itemIndex - currentIndex;
  if (offset > length / 2) offset -= length;
  if (offset < -length / 2) offset += length;
  return offset;
}

/** @param {boolean} playing */
export function previewLabel(playing) {
  return playing ? '미리듣기 중지' : '미리듣기';
}
