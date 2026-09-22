import { describe, expect, it } from 'vitest';
import { annularFinEfficiency, besselI0, besselI1, besselK0, besselK1, naturalConvection, radiationH, spread, spreadResistance, SIGMA } from './spreading';

const rel = (a: number, b: number) => Math.abs(a / b - 1);

describe('modified Bessel functions (reference values, A&S tables)', () => {
  it.each([
    [0.5, 1.0634833707, 0.2578943054, 0.9244190712, 1.656441120],
    [1, 1.2660658778, 0.5651591040, 0.4210244382, 0.6019072302],
    [2, 2.2795853023, 1.5906368546, 0.1138938727, 0.1398658818],
    [5, 27.239871823, 24.335642142, 0.0036910983, 0.0040446134],
  ])('x = %s', (x, i0, i1, k0, k1) => {
    expect(rel(besselI0(x), i0)).toBeLessThan(2e-6);
    expect(rel(besselI1(x), i1)).toBeLessThan(2e-6);
    expect(rel(besselK0(x), k0)).toBeLessThan(2e-6);
    expect(rel(besselK1(x), k1)).toBeLessThan(2e-6);
  });
});

/** Independent check: finite-difference solution of (1/r)(r θ')' = m²θ, θ(r1) = 1, θ'(r2) = 0. */
function finEfficiencyFD(r1: number, r2: number, m: number, n = 4000): number {
  const dr = (r2 - r1) / n;
  const r = (i: number) => r1 + i * dr;
  // unknowns θ1..θn (θ0 = 1); Thomas algorithm
  const a = new Float64Array(n + 1), b = new Float64Array(n + 1), c = new Float64Array(n + 1), d = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++) {
    const rw = r(i) - dr / 2, re = r(i) + dr / 2;
    if (i < n) {
      a[i] = rw; c[i] = re; b[i] = -(rw + re) - m * m * r(i) * dr * dr;
    } else {
      // adiabatic rim: half cell
      a[i] = rw; c[i] = 0; b[i] = -rw - (m * m * r(i) * dr * dr) / 2;
    }
  }
  d[1] = -a[1]; // θ0 = 1 moved to the right-hand side
  a[1] = 0;
  for (let i = 2; i <= n; i++) {
    const w = a[i] / b[i - 1];
    b[i] -= w * c[i - 1];
    d[i] -= w * d[i - 1];
  }
  const th = new Float64Array(n + 1);
  th[0] = 1;
  th[n] = d[n] / b[n];
  for (let i = n - 1; i >= 1; i--) th[i] = (d[i] - c[i] * th[i + 1]) / b[i];
  // heat leaving the faces = Σ m²·θ·2πr dr (trapezoid), normalised by the ideal m²·π(r2² − r1²)
  let q = 0;
  for (let i = 0; i <= n; i++) q += (i === 0 || i === n ? 0.5 : 1) * th[i] * r(i) * dr;
  return (2 * q) / (r2 * r2 - r1 * r1);
}

describe('annular fin efficiency', () => {
  it.each([
    [0.003, 0.03, 20],
    [0.003, 0.05, 60],
    [0.005, 0.1, 40],
    [0.002, 0.02, 150],
  ])('Bessel solution matches finite differences within 0.2 %% (r1 %s, r2 %s, m %s)', (r1, r2, m) => {
    expect(rel(annularFinEfficiency(r1, r2, m), finEfficiencyFD(r1, r2, m))).toBeLessThan(0.002);
  });
  it('→ 1 for a perfectly conducting sheet', () => {
    expect(annularFinEfficiency(0.003, 0.05, 1e-4)).toBeCloseTo(1, 6);
  });
  it('large-argument branch agrees with the full formula at the switch-over', () => {
    const r1 = 0.01, r2 = 0.02;
    const m = 599 / r2;
    const full = annularFinEfficiency(r1, r2, m);
    const asym = annularFinEfficiency(r1, r2, 601 / r2);
    expect(rel(full, asym)).toBeLessThan(0.01);
  });
});

describe('spreading resistance', () => {
  it('ideal copper: θ = 1 / (h·A) over both faces', () => {
    const r = spreadResistance(0.005, 0.05, 1e9, 20);
    expect(r.theta).toBeCloseTo(1 / (20 * 0.05 * 0.05), 6);
  });
  it('more copper area always helps, with diminishing returns', () => {
    const t = [0.01, 0.02, 0.04, 0.08].map((s) => spreadResistance(0.005, s, 401 * 35e-6, 25).theta);
    for (let i = 1; i < t.length; i++) expect(t[i]).toBeLessThan(t[i - 1]);
    expect(t[0] / t[1]).toBeGreaterThan(t[2] / t[3]);
  });
});

describe('air cooling', () => {
  it('radiation: 4σT³ for a black surface near ambient (≈ 6.1 W/m²K at 25 °C)', () => {
    expect(radiationH(1, 25.0001, 25)).toBeCloseTo(4 * SIGMA * 298.15 ** 3, 4);
  });
  it('natural convection on a 100 mm board at ΔT 30 K is in the textbook range (5–12 W/m²K)', () => {
    const h = naturalConvection(0.1, 30, 25, 'horizontal');
    expect(h.top).toBeGreaterThan(5);
    expect(h.top).toBeLessThan(12);
    expect(h.bottom).toBeLessThan(h.top); // hot lower face convects worse
  });
  it('the coupled problem converges and heat balance holds', () => {
    const r = spread({ power: 1, taC: 25, sourceSide: 0.005, pourSide: 0.03, copperT: 35e-6, layers: 1, kCu: 401, emissivity: 0.9, orient: 'horizontal' });
    expect(r.iterations).toBeLessThan(100);
    expect(r.tBoard - 25).toBeCloseTo(1 * r.theta, 4);
  });
});
