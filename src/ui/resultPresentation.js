// @ts-check

/** @param {any} result @param {boolean} newRecord */
export function buildResultPresentation(result, newRecord) {
  return {
    title: result.cleared ? 'RESULT' : 'PLAY FAILED',
    rank: String(result.rank),
    score: Number(result.score).toLocaleString('en-US'),
    accuracy: `${(Number(result.accuracy) * 100).toFixed(2)}%`,
    maxCombo: `${result.maxCombo}x`,
    judgements: {
      300: String(result.judgements[300] ?? 0),
      100: String(result.judgements[100] ?? 0),
      50: String(result.judgements[50] ?? 0),
      miss: String(result.judgements.miss ?? 0),
    },
    sliderBreaks: String(result.sliderBreaks ?? 0),
    spinnerBonus: String(result.spinnerBonus ?? 0),
    recordLabel: newRecord ? 'NEW RECORD' : 'BEST RETAINED',
    cleared: Boolean(result.cleared),
  };
}
