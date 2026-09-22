import { describe, expect, it } from 'vitest';
import { junction, viaArray } from './thermal';

describe('audit: thermal vias (Fourier conduction, R = L/(k·A))', () => {
  const base = { count: 1, holeMm: 0.3, platingMm: 0.025, lengthMm: 1.6, fillK: 0, padAreaMm2: 0, kLaminate: 0.3, powerW: 1 };

  it('open 0.3 mm via, 25 µm plating, 1.6 mm: 156.3 K/W', () => {
    // A = π/4·(0.35² − 0.3²) mm² = 0.025525 mm²; R = 1.6e-3 / (401 · 2.5525e-8) = 156.3 K/W
    expect(viaArray(base).rVia).toBeCloseTo(156.32, 1);
  });

  it('copper fill adds the core in parallel', () => {
    const r = viaArray({ ...base, fillK: 401 });
    // whole 0.35 mm rod: A = 0.096211 mm² → 41.47 K/W
    expect(r.rVia).toBeCloseTo(1.6e-3 / (401 * (Math.PI / 4) * 0.35 ** 2 * 1e-6), 6);
  });

  it('laminate path in parallel with the vias (3×3 mm pad, 9 vias, k = 0.3)', () => {
    const r = viaArray({ ...base, count: 9, padAreaMm2: 9 });
    const aLam = (9 - 9 * (Math.PI / 4) * 0.35 ** 2) * 1e-6;
    const gLam = (0.3 * aLam) / 1.6e-3;
    const gV = 9 / 156.3202;
    expect(r.rTotal).toBeCloseTo(1 / (gLam + gV), 2);
    expect(r.deltaT).toBeCloseTo(r.rTotal, 12);
    expect(r.viaShare).toBeGreaterThan(0.9);
  });
});

describe('audit: junction temperature (TI SPRA953: Tj = Ta + P·θ)', () => {
  it('θJA', () => {
    const r = junction({ powerW: 1.5, ambientC: 40, mode: 'ja', thetaJA: 40, thetaJC: 0, thetaCS: 0, thetaSA: 0, tjMaxC: 125 });
    expect(r.tj).toBeCloseTo(100, 9);
    expect(r.margin).toBeCloseTo(25, 9);
    expect(r.maxPower).toBeCloseTo(85 / 40, 9);
    expect(r.nodes).toBeNull();
    expect(Number.isNaN(r.thetaSARequired)).toBe(true);
  });
});
