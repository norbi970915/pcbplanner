import { describe, expect, it } from 'vitest';
import { capBand, capImpedance, capsNeeded, pdnImpedance, planeCapacitance, srf, targetImpedance } from './pdn';

describe('audit: PDN', () => {
  it('plane capacitance matches Bogatin rule C[pF] = 0.225·Dk·A[in²]/h[in]', () => {
    // E. Bogatin, Signal and Power Integrity – Simplified, 2nd ed., §13 (parallel plate): 0.225 pF/in.
    // 1 in², 4 mil, Dk 4 → 0.225·4·1/0.004 = 225 pF
    expect(planeCapacitance(645.16, 0.1016, 4) * 1e12).toBeCloseTo(225, 0);
  });

  it('target impedance: Bogatin example 1.0 V, 5 %, 1 A → 50 mΩ', () => {
    expect(targetImpedance(1, 5, 1)).toBeCloseTo(0.05, 12);
  });

  it('SRF: 1/(2π√(LC)); 0.1 µF, 1 nH → 15.9 MHz', () => {
    expect(srf({ c: 1e-7, esr: 0, esl: 1e-9 })).toBeCloseTo(15.9155e6, -2);
  });

  it('caps needed: exact count at the boundary and never 0', () => {
    const cap = { c: 1e-7, esr: 0.01, esl: 1e-9 };
    const z = capImpedance(cap, 1e6);
    expect(capsNeeded(cap, 1e6, z / 3)).toBe(3);
    expect(capsNeeded(cap, 1e6, z / 3 * 1.0001)).toBe(3);
    expect(capsNeeded(cap, 1e6, z / 3 * 0.9999)).toBe(4);
    expect(capsNeeded(cap, 1e6, 1e3)).toBe(1);
  });

  it('band edges symmetric in log: fLow·fHigh = SRF² (series RLC)', () => {
    const cap = { c: 1e-7, esr: 0.01, esl: 1e-9 };
    const b = capBand(cap, 2, 0.05)!;
    expect(b.fLow * b.fHigh).toBeCloseTo(srf(cap) ** 2, -6);
  });

  it('anti-resonance of N·L_esl with plane C appears in pdnImpedance', () => {
    const cap = { c: 1e-6, esr: 0.005, esl: 1e-9 };
    const planeC = 4e-9;
    const n = 4;
    // parallel resonance ≈ 1/(2π√((L/N)·(Cplane)))  (C/N·… ≫ Cplane)
    const fp = 1 / (2 * Math.PI * Math.sqrt((1e-9 / n) * planeC));
    const zPeak = pdnImpedance(cap, n, planeC, fp);
    expect(zPeak).toBeGreaterThan(pdnImpedance(cap, n, planeC, fp / 2));
    expect(zPeak).toBeGreaterThan(pdnImpedance(cap, n, planeC, fp * 2));
  });
});
