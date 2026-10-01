import { describe, expect, it } from 'vitest';
import { adcAccuracy, type AdcAccuracyParams } from './adcAccuracy';

const base: AdcAccuracyParams = { bits: 12, spanVolts: 2.5, signalVolts: 1, offsetVolts: 0, gainPct: 0,
  referencePct: 0, inlLsb: 0, quantisation: false, settlingVolts: 0 };

describe('ADC DC accuracy budget', () => {
  it('reproduces ADI’s 8 mV offset at a 2.5 V span and 12 bits', () => {
    const r = adcAccuracy({ ...base, offsetVolts: 0.008 });
    expect(r.worstLsb).toBeCloseTo(13.1072, 12);
    expect(r.low).toBe(-0.008);
    expect(r.high).toBe(0.008);
  });
  it('gives zero systematic error for an ideal ADC without quantisation', () => {
    expect(adcAccuracy(base).worstVolts).toBe(0);
  });
  it('keeps the quantisation bound at half a nominal code step', () => {
    const r = adcAccuracy({ ...base, quantisation: true });
    expect(r.worstLsb).toBe(0.5);
    expect(r.railLimited).toBe(false);
  });
  it('uses reciprocal reference error, with unequal positive and negative limits', () => {
    const r = adcAccuracy({ ...base, referencePct: 10 });
    expect(r.low).toBeCloseTo(-1 / 11, 12);
    expect(r.high).toBeCloseTo(1 / 9, 12);
    expect(r.worstVolts).toBeCloseTo(1 / 9, 12);
  });
  it('contains all actual gain/reference/settling corner readings', () => {
    const p = { ...base, gainPct: 2, referencePct: 3, settlingVolts: 0.01, offsetVolts: 0.002, inlLsb: 1 };
    const r = adcAccuracy(p);
    for (const gain of [-0.02, 0.02]) for (const reference of [-0.03, 0.03]) for (const settling of [-0.01, 0.01]) {
      for (const additive of [-1, 1]) {
        const indication = (p.signalVolts + settling) * (1 + gain) / (1 + reference) + additive * (p.offsetVolts + r.lsbVolts);
        expect(indication).toBeGreaterThanOrEqual(r.indicatedLow - 1e-12);
        expect(indication).toBeLessThanOrEqual(r.indicatedHigh + 1e-12);
      }
    }
  });
  it('adds maximum offset, INL and quantisation bounds arithmetically', () => {
    const r = adcAccuracy({ ...base, offsetVolts: 0.001, inlLsb: 2, quantisation: true });
    expect(r.worstVolts).toBeCloseTo(0.001 + 2.5 * 2.5 / 4096, 12);
  });
  it('flags saturation without clipping away the uncertainty', () => {
    const r = adcAccuracy({ ...base, signalVolts: 2.49, offsetVolts: 0.05 });
    expect(r.railLimited).toBe(true);
    expect(r.indicatedHigh).toBeGreaterThan(2.5);
    expect(r.worstVolts).toBe(0.05);
  });
  it('reports no percentage of reading at zero', () => {
    expect(adcAccuracy({ ...base, signalVolts: 0 }).readingPct).toBeNull();
  });
  it.each([{ bits: 12.5 }, { spanVolts: 0 }, { signalVolts: -1 }, { signalVolts: 3 }, { offsetVolts: -1 }, { gainPct: 100 }, { referencePct: 100 }, { inlLsb: NaN }, { settlingVolts: Infinity }])('rejects invalid inputs %j', patch => {
    expect(() => adcAccuracy({ ...base, ...patch })).toThrow(RangeError);
  });
});
