// @ts-check

const HIT_WHISTLE = 2;
const HIT_FINISH = 4;
const HIT_CLAP = 8;

/** @param {string|undefined} value @param {string} fallback */
function sampleSetName(value, fallback) {
  return value && value !== 'None' ? value.toLowerCase() : fallback;
}

/** @param {Array<any>} samplePoints @param {number} mapTimeMs @param {any} object */
export function sampleContextAt(samplePoints, mapTimeMs, object) {
  const point = samplePoints.filter((candidate) => candidate.startTimeMs <= mapTimeMs).at(-1)
    ?? { sampleSet: 'Normal', customIndex: 1, volume: 100 };
  const sample = object.samples?.[0] ?? {};
  const sampleSet = sampleSetName(sample.hitSound, sampleSetName(point.sampleSet, 'normal'));
  return {
    sampleSet,
    additionSet: sampleSetName(sample.sampleSet, sampleSet),
    customIndex: Number(sample.customIndex || point.customIndex || 1),
    volume: Math.max(0, Math.min(1, Number(sample.volume || point.volume || 100) / 100)),
    filename: String(sample.filename ?? ''),
  };
}

/** @param {any} event @param {any} object @param {{sampleSet:string,additionSet:string,customIndex:number,volume:number,filename:string}} [sampleContext] */
export function hitSoundRequests(event, object, sampleContext = { sampleSet: 'normal', additionSet: 'normal', customIndex: 1, volume: 1, filename: '' }) {
  if (event.type === 'slider-part' && event.result === 'miss' && event.comboBreak) return [{ name: 'combobreak.wav', volume: 1 }];
  if (event.type === 'circle-judged') {
    if (event.judgement === 'miss') return [];
    const judgementVolume = event.judgement === '300' ? 1 : event.judgement === '100' ? 0.8 : 0.62;
    const volume = Number((judgementVolume * sampleContext.volume).toFixed(3));
    if (sampleContext.filename) return [{ name: sampleContext.filename, volume }];
    const requests = [{ name: `${sampleContext.sampleSet}-hitnormal.wav`, volume }];
    const accentVolume = Number((volume * 0.78).toFixed(3));
    if ((object.hitSound & HIT_WHISTLE) !== 0) requests.push({ name: `${sampleContext.additionSet}-hitwhistle.wav`, volume: accentVolume });
    if ((object.hitSound & HIT_FINISH) !== 0) requests.push({ name: `${sampleContext.additionSet}-hitfinish.wav`, volume: accentVolume });
    if ((object.hitSound & HIT_CLAP) !== 0) requests.push({ name: `${sampleContext.additionSet}-hitclap.wav`, volume: accentVolume });
    return requests;
  }
  if (event.type === 'slider-part' && event.result === 'hit') {
    if (['head', 'repeat', 'tail'].includes(event.kind) && object.edgeSamples?.length) {
      const edgeParts = (object.parts ?? object.nestedParts ?? []).filter((/** @type {any} */ part) => ['head', 'repeat', 'tail'].includes(part.kind));
      const edgeIndex = Math.max(0, edgeParts.findIndex((/** @type {any} */ part) => part.id === event.partId));
      const edge = object.edgeSamples[Math.min(edgeIndex, object.edgeSamples.length - 1)] ?? [];
      const volume = Number(((event.kind === 'head' ? 0.88 : 0.58) * sampleContext.volume).toFixed(3));
      return edge.map((/** @type {any} */ sample) => {
        if (sample.filename) return { name: sample.filename, volume };
        const set = sampleSetName(sample.sampleSet, sampleContext.sampleSet);
        const kind = String(sample.hitSound || 'Normal').toLowerCase();
        return { name: `${set}-hit${kind}.wav`, volume };
      });
    }
    if (event.kind === 'tick' || event.kind === 'repeat' || event.kind === 'tail') return [{ name: `${sampleContext.sampleSet}-slidertick.wav`, volume: Number((0.58 * sampleContext.volume).toFixed(3)) }];
    return [{ name: `${sampleContext.sampleSet}-hitnormal.wav`, volume: Number((0.88 * sampleContext.volume).toFixed(3)) }];
  }
  if (event.type === 'spinner-judged' && event.bonusSpins > 0) return [{ name: 'spinnerbonus.wav', volume: 0.8 }];
  return [];
}
