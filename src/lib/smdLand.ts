/** Two-terminal chip land geometry. All dimensions are in millimetres. */
export interface SmdLandInput {
  lengthMin: number;
  lengthMax: number;
  widthMin: number;
  widthMax: number;
  terminalMin: number;
  terminalMax: number;
  toe: number;
  heel: number;
  side: number;
  fabrication: number;
  placement: number;
  courtyard: number;
  maskExpansion: number;
}

export function smdLand(i: SmdLandInput) {
  const values = Object.values(i);
  if (values.some((v) => !Number.isFinite(v) || v < 0)) return null;
  if (!(i.lengthMin > 0 && i.lengthMax >= i.lengthMin && i.widthMin > 0 && i.widthMax >= i.widthMin)) return null;
  if (!(i.terminalMin > 0 && i.terminalMax >= i.terminalMin && 2 * i.terminalMax < i.lengthMin)) return null;

  // Worst-case separation of the two inner termination edges. Independent limits
  // are deliberately conservative when the datasheet does not specify S directly.
  const separationMin = i.lengthMin - 2 * i.terminalMax;
  const separationMax = i.lengthMax - 2 * i.terminalMin;
  const rss = (component: number) => Math.hypot(component, i.fabrication, i.placement);
  const outer = i.lengthMin + 2 * i.toe + rss(i.lengthMax - i.lengthMin);
  const gap = separationMax - 2 * i.heel - rss(separationMax - separationMin);
  const padWidth = i.widthMin + 2 * i.side + rss(i.widthMax - i.widthMin);
  if (!(gap > 0 && outer > gap && padWidth > 0)) return null;

  const padLength = (outer - gap) / 2;
  const pitch = (outer + gap) / 2;
  const courtyardLength = Math.max(i.lengthMax, outer) + 2 * i.courtyard;
  const courtyardWidth = Math.max(i.widthMax, padWidth) + 2 * i.courtyard;
  const maskOpeningLength = padLength + 2 * i.maskExpansion;
  const maskOpeningWidth = padWidth + 2 * i.maskExpansion;
  return {
    outer, gap, padLength, padWidth, pitch, courtyardLength, courtyardWidth,
    maskOpeningLength, maskOpeningWidth, maskWeb: gap - 2 * i.maskExpansion,
    separationMin, separationMax,
  };
}
