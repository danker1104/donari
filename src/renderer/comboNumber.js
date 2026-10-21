// @ts-check

/** @param {number} value @param {number} radius @param {number} [overlap] */
export function layoutComboDigits(value, radius, overlap = 0) {
  const digits = String(Math.max(0, Math.trunc(value))).split('').map(Number);
  const width = radius * 0.5;
  const height = radius * 0.7;
  const advance = width - overlap * radius / 64;
  const totalWidth = width + Math.max(0, digits.length - 1) * advance;
  const startX = -totalWidth / 2;
  return digits.map((digit, index) => ({ digit, x: startX + index * advance, width, height }));
}

/** @param {{parts?:Array<{kind:string,result:string|null}>}} slider */
export function sliderHeadShowsCombo(slider) {
  // A Slider head is judged as soon as it is pressed.  Hiding the combo
  // number from that point made every held Slider look unnumbered.  Keep the
  // label visible for the duration of the Slider, until its tail resolves.
  const tail = slider.parts?.find((part) => part.kind === 'tail');
  if (tail) return tail.result === null;
  return slider.parts?.find((part) => part.kind === 'head')?.result === null;
}
