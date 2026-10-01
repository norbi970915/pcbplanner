export interface AdcAccuracyParams {
  bits: number;
  spanVolts: number;
  signalVolts: number;
  offsetVolts: number; // bound expressed in indicated volts at the nominal reference
  gainPct: number; // slope error relative to ideal, offset removed, excluding reference error
  referencePct: number;
  inlLsb: number; // specified INL bound after offset and gain removal
  quantisation: boolean;
  settlingVolts: number; // bound from acquisition model, or zero when excluded
}

/** Unipolar DC accuracy budget. ADC offset/INL use nominal-reference indicated units;
 * acquisition uncertainty is an input-voltage bound scaled by the indication slope.
 * Exact slope bounds are (1±gain)/(1∓reference).
 * Quantisation is bounded by ½ nominal LSB for interior codes. No RSS of maximum specs.
 * ADI: The ABCs of ADCs; Methods for Calibrating Gain Error in Data-Converter Systems.
 */
export function adcAccuracy(p: AdcAccuracyParams) {
  if (![p.bits, p.spanVolts, p.signalVolts, p.offsetVolts, p.gainPct, p.referencePct, p.inlLsb, p.settlingVolts].every(Number.isFinite)) throw new RangeError('Every accuracy-budget input must be finite.');
  if (!(Number.isInteger(p.bits) && p.bits >= 6 && p.bits <= 24)) throw new RangeError('Resolution must be a whole number from 6 to 24 bits.');
  if (!(p.spanVolts > 0 && p.spanVolts <= 100)) throw new RangeError('Reference span must be above 0 and at most 100 V.');
  if (!(p.signalVolts >= 0 && p.signalVolts <= p.spanVolts)) throw new RangeError('Signal voltage must be between 0 and the reference span for this unipolar budget.');
  if (!(p.offsetVolts >= 0 && p.offsetVolts <= 100 && p.settlingVolts >= 0 && p.settlingVolts <= 100)) throw new RangeError('Offset and settling bounds must be between 0 and 100 V.');
  if (!(p.gainPct >= 0 && p.gainPct < 100 && p.referencePct >= 0 && p.referencePct < 100)) throw new RangeError('Gain and reference uncertainty must be from 0 to less than 100 %.');
  if (!(p.inlLsb >= 0 && p.inlLsb <= 2 ** p.bits)) throw new RangeError('INL must be non-negative and no greater than the code span.');
  const lsbVolts = p.spanVolts / 2 ** p.bits;
  const gain = p.gainPct / 100, ref = p.referencePct / 100;
  const gainVolts = p.signalVolts * gain;
  const referenceVolts = p.signalVolts * ref / (1 - ref);
  const slopeLow = p.signalVolts * ((1 - gain) / (1 + ref) - 1);
  const slopeHigh = p.signalVolts * ((1 + gain) / (1 - ref) - 1);
  const inlVolts = p.inlLsb * lsbVolts;
  const quantisationVolts = p.quantisation ? lsbVolts / 2 : 0;
  const settlingIndicatedVolts = p.settlingVolts * (1 + gain) / (1 - ref);
  const additive = p.offsetVolts + inlVolts + quantisationVolts + settlingIndicatedVolts;
  const low = slopeLow - additive, high = slopeHigh + additive;
  const worstVolts = Math.max(Math.abs(low), Math.abs(high));
  return {
    lsbVolts, gainVolts, referenceVolts, slopeLow, slopeHigh, inlVolts, quantisationVolts, settlingIndicatedVolts,
    low, high, worstVolts, worstLsb: worstVolts / lsbVolts, fullScalePct: worstVolts / p.spanVolts * 100,
    readingPct: p.signalVolts > 0 ? worstVolts / p.signalVolts * 100 : null,
    indicatedLow: p.signalVolts + low, indicatedHigh: p.signalVolts + high,
    railLimited: p.signalVolts + low < 0 || p.signalVolts + high > p.spanVolts - lsbVolts,
  };
}
