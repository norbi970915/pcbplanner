import { describe, expect, it } from 'vitest';
import { capBand, capImpedance, capReactance, capsNeeded, logSpace, pdnImpedance, planeCapacitance, planeCapPerCm2, srf, targetImpedance } from './pdn';

const cap = { c: 100e-9, esr: 0.02, esl: 1e-9 }; // 100 nF, 20 mΩ, 1 nH mounted

describe('target impedance', () => {
  it('1.0 V, 5 %, 2 A step → 25 mΩ', () => {
    expect(targetImpedance(1.0, 5, 2)).toBeCloseTo(0.025, 12);
  });
  it('3.3 V, 3 %, 0.5 A → 198 mΩ', () => {
    expect(targetImpedance(3.3, 3, 0.5)).toBeCloseTo(0.198, 12);
  });
});

describe('plane-pair capacitance', () => {
  it('100 × 100 mm, 0.1 mm, εr 4.3 → 3.807 nF', () => {
    // 8.8541878e-12 · 4.3 · 0.01 m² / 1e-4 m = 3.8073e-9 F
    expect(planeCapacitance(100 * 100, 0.1, 4.3) * 1e9).toBeCloseTo(3.8073, 3);
  });
  it('per cm²: 38.07 pF at 0.1 mm, εr 4.3', () => {
    expect(planeCapPerCm2(0.1, 4.3) * 1e12).toBeCloseTo(38.073, 2);
  });
});

describe('decoupling capacitor', () => {
  it('SRF of 100 nF with 1 nH ≈ 15.915 MHz', () => {
    expect(srf(cap) / 1e6).toBeCloseTo(15.9155, 3);
  });
  it('|Z| at SRF equals ESR', () => {
    expect(capImpedance(cap, srf(cap))).toBeCloseTo(0.02, 9);
  });
  it('at 10 MHz: X = 62.83 − 159.15 = −96.32 mΩ, |Z| = 98.38 mΩ', () => {
    expect(capReactance(cap, 10e6) * 1e3).toBeCloseTo(-96.323, 2);
    expect(capImpedance(cap, 10e6) * 1e3).toBeCloseTo(98.378, 2);
  });
  it('caps needed at 10 MHz for 25 mΩ: ceil(98.38/25) = 4', () => {
    expect(capsNeeded(cap, 10e6, 0.025)).toBe(4);
  });
  it('at SRF, 20 mΩ ESR needs 1 cap for 25 mΩ and 2 for 15 mΩ', () => {
    expect(capsNeeded(cap, srf(cap), 0.025)).toBe(1);
    expect(capsNeeded(cap, srf(cap), 0.015)).toBe(2);
  });
  it('band edges are where N caps just reach Ztarget', () => {
    const b = capBand(cap, 4, 0.025)!;
    expect(b.fLow).toBeLessThan(srf(cap));
    expect(b.fHigh).toBeGreaterThan(srf(cap));
    expect(capImpedance(cap, b.fLow) / 4).toBeCloseTo(0.025, 9);
    expect(capImpedance(cap, b.fHigh) / 4).toBeCloseTo(0.025, 9);
  });
  it('no band when ESR/N exceeds Ztarget', () => {
    expect(capBand(cap, 1, 0.01)).toBeNull();
  });
});

describe('PDN impedance', () => {
  it('plane alone is 1/(ωC)', () => {
    const f = 1e8, C = 3.8073e-9;
    expect(pdnImpedance(cap, 0, C, f)).toBeCloseTo(1 / (2 * Math.PI * f * C), 9);
  });
  it('without plane, N caps give |Zcap|/N', () => {
    expect(pdnImpedance(cap, 4, 0, 10e6)).toBeCloseTo(capImpedance(cap, 10e6) / 4, 12);
  });
  it('logSpace covers the end points', () => {
    const f = logSpace(1e5, 1e9, 5);
    expect(f[0]).toBeCloseTo(1e5, 3);
    expect(f[2]).toBeCloseTo(1e7, 0);
    expect(f[4]).toBeCloseTo(1e9, -2);
  });
});
