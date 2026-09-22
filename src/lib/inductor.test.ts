import { describe, expect, it } from 'vitest';
import { innerFromOuter, outerFromInner, perimeterFactor, spiral } from './inductor';

// Square spiral: n = 5, w = s = 0.2 mm, d_out = 10 mm
// d_in = 10 − 2·5·0.2 − 2·4·0.2 = 6.4 mm, d_avg = 8.2 mm, ρ = 3.6/16.4 = 0.21951
const base = { shape: 'square' as const, n: 5, wMm: 0.2, sMm: 0.2, dOutMm: 10, tMm: 0.035, freqHz: 10e6 };

describe('spiral geometry', () => {
  it('inner/outer diameter round trip', () => {
    expect(innerFromOuter(10, 5, 0.2, 0.2)).toBeCloseTo(6.4, 12);
    expect(outerFromInner(6.4, 5, 0.2, 0.2)).toBeCloseTo(10, 12);
  });
  it('perimeter factors: square 4, hexagon 2√3, octagon 8·tan(22.5°), circle π', () => {
    expect(perimeterFactor('square')).toBeCloseTo(4, 12);
    expect(perimeterFactor('hexagonal')).toBeCloseTo(2 * Math.sqrt(3), 12);
    expect(perimeterFactor('octagonal')).toBeCloseTo(3.313708, 5);
    expect(perimeterFactor('circular')).toBeCloseTo(Math.PI, 12);
  });
  it('d_avg and fill ratio', () => {
    const r = spiral(base);
    expect(r.dAvg).toBeCloseTo(8.2, 12);
    expect(r.rho).toBeCloseTo(0.219512, 5);
  });
});

describe('Mohan et al. 1999 inductance', () => {
  it('square, modified Wheeler: 2.34·µ0·25·8.2 mm/(1+2.75·0.21951) = 375.9 nH', () => {
    expect(spiral(base).lWheeler * 1e9).toBeCloseTo(375.90, 1);
  });
  it('square, current sheet: µ0·25·8.2 mm·1.27/2·(ln(2.07/ρ)+0.18ρ+0.13ρ²) = 374.55 nH', () => {
    expect(spiral(base).lSheet * 1e9).toBeCloseTo(374.55, 1);
  });
  it('octagonal, modified Wheeler = 325.77 nH', () => {
    expect(spiral({ ...base, shape: 'octagonal' }).lWheeler * 1e9).toBeCloseTo(325.77, 1);
  });
  it('circular has no Wheeler entry; current sheet = 312.50 nH', () => {
    const r = spiral({ ...base, shape: 'circular' });
    expect(Number.isNaN(r.lWheeler)).toBe(true);
    expect(r.lSheet * 1e9).toBeCloseTo(312.50, 1);
  });
});

describe('DC resistance and Q', () => {
  it('square length = 5·4·8.2 = 164 mm; R = 1.7241e-8·0.164/(0.2e-3·35e-6) = 0.4039 Ω', () => {
    const r = spiral(base);
    expect(r.lengthMm).toBeCloseTo(164, 9);
    expect(r.rDc).toBeCloseTo(0.403932, 5);
  });
  it('Q = 2πfL/R at 10 MHz ≈ 58.47', () => {
    const r = spiral(base);
    expect(r.q).toBeCloseTo((2 * Math.PI * 10e6 * 375.896e-9) / 0.403932, 1);
    expect(r.q).toBeCloseTo(58.47, 1);
  });
});
