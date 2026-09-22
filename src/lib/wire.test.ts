import { describe, expect, it } from 'vitest';
import { awgAreaMm2, awgDiameterMm, minimumGauge, preeceFusing, resistancePerM, voltageDrop } from './wire';

describe('AWG (ASTM B258 formula)', () => {
  // Reference diameters: ASTM B258 / widely published AWG tables (inches): 10 → 0.1019, 24 → 0.0201, 36 → 0.0050, 0000 → 0.4600
  it.each([
    [10, 0.1019],
    [24, 0.0201],
    [36, 0.005],
    [-3, 0.46],
  ])('AWG %s ≈ %s in', (n, inch) => {
    expect(awgDiameterMm(n) / 25.4).toBeCloseTo(inch, 4);
  });
  it('AWG 24 copper ≈ 84.2 Ω/km at 20 °C', () => {
    expect(resistancePerM(awgAreaMm2(24), 'copper', 20) * 1000).toBeCloseTo(84.2, 0);
  });
  it('each 3 gauges roughly halves the area', () => {
    expect(awgAreaMm2(20) / awgAreaMm2(23)).toBeCloseTo(2, 1);
  });
});

describe('voltage drop', () => {
  it('round trip doubles the drop', () => {
    const base = { n: 18, metal: 'copper' as const, lengthM: 5, currentA: 2, supplyV: 12, tempC: 20 };
    expect(voltageDrop({ ...base, roundTrip: true }).V).toBeCloseTo(2 * voltageDrop({ ...base, roundTrip: false }).V, 9);
  });
  it('minimum gauge meets the limit and the next thinner one does not', () => {
    const i = { metal: 'copper' as const, lengthM: 3, roundTrip: true, currentA: 5, supplyV: 12, tempC: 20 };
    const g = minimumGauge(i, 3)!;
    expect(voltageDrop({ ...i, n: g.n }).dropPct).toBeLessThanOrEqual(3);
    expect(voltageDrop({ ...i, n: g.n + 1 }).dropPct).toBeGreaterThan(3);
  });
  it('Preece: 10244 · d^1.5 for copper', () => {
    expect(preeceFusing(25.4, 'copper')).toBeCloseTo(10244, 6);
  });
});
