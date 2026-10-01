import { describe, expect, it } from 'vitest';
import { analyseHysteresis, designHysteresis, type HysteresisCircuit } from './comparatorHysteresis';

const base: HysteresisCircuit = { topology: 'noninverting', resistance: 330e3, feedback: 1e6, reference: 2.5,
  outputHigh: 5, outputLow: 0, tolerancePct: 0, offsetVolts: 0, referenceErrorVolts: 0 };

describe('comparator hysteresis', () => {
  it('reproduces TI TLV3201 SBOS561C Figure 8-5 (330 kΩ / 1 MΩ, 2.5 V)', () => {
    const r = analyseHysteresis(base);
    expect(r.rising).toBeCloseTo(3.325, 12);
    expect(r.falling).toBeCloseTo(1.675, 12);
    expect(r.width).toBeCloseTo(1.65, 12);
  });
  it('reproduces Figure 8-4 via the Thevenin equivalent of two 1 MΩ reference resistors', () => {
    const r = analyseHysteresis({ ...base, topology: 'inverting', resistance: 500e3 });
    expect(r.rising).toBeCloseTo(10 / 3, 12);
    expect(r.falling).toBeCloseTo(5 / 3, 12);
    expect(r.width).toBeCloseTo(5 / 3, 12);
  });
  it.each(['inverting', 'noninverting'] as const)('solves asymmetric target thresholds for %s with non-rail outputs', topology => {
    const d = designHysteresis({ ...base, topology, resistance: 10000, outputHigh: 3.1, outputLow: 0.2, targetRising: 1.8, targetFalling: 1.1, series: 'E96' });
    expect(d.exact.rising).toBeCloseTo(1.8, 12);
    expect(d.exact.falling).toBeCloseTo(1.1, 12);
    expect(d.standard.width).toBeGreaterThan(0);
    expect(Math.abs(d.standard.rising - 1.8)).toBeLessThan(0.03);
  });
  it('allows negative references with bipolar output levels', () => {
    const r = analyseHysteresis({ ...base, reference: 0, outputHigh: 5, outputLow: -5 });
    expect(r.rising).toBeCloseTo(1.65, 12);
    expect(r.falling).toBeCloseTo(-1.65, 12);
  });
  it.each(['inverting', 'noninverting'] as const)('contains interior resistor/reference/offset samples in the %s corner bounds', topology => {
    const p = { ...base, topology, tolerancePct: 5, offsetVolts: 0.01, referenceErrorVolts: 0.02 };
    const bounds = analyseHysteresis(p);
    // Direct KCL evaluation at several interior samples, independent of the corner implementation.
    for (const a of [0.951, 0.997, 1.043]) for (const b of [0.959, 1.021, 1.049]) for (const vos of [-0.009, 0.003]) {
      const k = p.resistance * a / (p.feedback * b), vref = p.reference + 0.017;
      const rising = topology === 'inverting' ? (vref + k * p.outputHigh) / (1 + k) - vos : (vref + vos) * (1 + k) - k * p.outputLow;
      const falling = topology === 'inverting' ? (vref + k * p.outputLow) / (1 + k) - vos : (vref + vos) * (1 + k) - k * p.outputHigh;
      expect(rising).toBeGreaterThanOrEqual(bounds.risingRange[0]);
      expect(rising).toBeLessThanOrEqual(bounds.risingRange[1]);
      expect(falling).toBeGreaterThanOrEqual(bounds.fallingRange[0]);
      expect(falling).toBeLessThanOrEqual(bounds.fallingRange[1]);
    }
  });
  it('does not confuse offset uncertainty across devices with hysteresis width', () => {
    const r = analyseHysteresis({ ...base, offsetVolts: 2, referenceErrorVolts: 0.1 });
    expect(r.fallingRange[1]).toBeGreaterThan(r.risingRange[0]);
    expect(r.widthRange[0]).toBeCloseTo(1.65, 12);
    expect(r.widthRange[1]).toBeCloseTo(1.65, 12);
  });
  it('rejects impossible inverting feedback ratios', () => {
    expect(() => designHysteresis({ ...base, topology: 'inverting', targetRising: 5, targetFalling: 0, series: 'E24' })).toThrow();
  });
  it.each([{ resistance: 0 }, { feedback: -1 }, { outputHigh: 0 }, { reference: NaN }, { tolerancePct: 100 }, { offsetVolts: -1 }, { outputLow: Infinity }])('rejects invalid inputs %j', patch => {
    expect(() => analyseHysteresis({ ...base, ...patch })).toThrow(RangeError);
  });
  it('keeps very small feedback ratios finite', () => {
    const r = analyseHysteresis({ ...base, resistance: 1, feedback: 1e9 });
    expect(r.width).toBeCloseTo(5e-9, 18);
    expect(Number.isFinite(r.risingRange[1])).toBe(true);
  });
});
