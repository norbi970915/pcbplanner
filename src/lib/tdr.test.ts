import { describe, expect, it } from 'vitest';
import { besselI0, checkLowPassGrid, fft, impedanceFromRho, kaiserHalf, lowPassStep, stepRiseTime } from './tdr';

/** Reflection Γ·e^{−jω·2τ} of a matched line of one-way delay τ ending in a load, on f = k·df, k = 1…N. */
function lineWithLoad(gamma: number, tau: number, df: number, N: number) {
  const freq = new Float64Array(N);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    const f = (k + 1) * df;
    freq[k] = f;
    re[k] = gamma * Math.cos(2 * Math.PI * f * 2 * tau);
    im[k] = -gamma * Math.sin(2 * Math.PI * f * 2 * tau);
  }
  return { freq, re, im };
}

const zAt = (r: { t: Float64Array; rho: Float64Array }, t: number, z0 = 50) => {
  let k = 0;
  while (k < r.t.length - 1 && r.t[k] < t) k++;
  return impedanceFromRho(r.rho[k], z0);
};

describe('transform building blocks', () => {
  it('inverts an FFT exactly', () => {
    const re = Float64Array.from({ length: 64 }, (_, i) => Math.sin(i) + i / 10);
    const im = Float64Array.from({ length: 64 }, (_, i) => Math.cos(3 * i));
    const r0 = re.slice(), i0 = im.slice();
    fft(re, im, -1);
    fft(re, im, 1);
    for (let i = 0; i < 64; i++) {
      expect(re[i] / 64).toBeCloseTo(r0[i], 12);
      expect(im[i] / 64).toBeCloseTo(i0[i], 12);
    }
  });

  it('builds the Kaiser window from I0', () => {
    expect(besselI0(0)).toBe(1);
    expect(besselI0(1)).toBeCloseTo(1.2660658777520082, 14);
    const w = kaiserHalf(6, 100);
    expect(w[0]).toBe(1);
    expect(w[100]).toBeCloseTo(1 / besselI0(6), 14);
    expect(Array.from(kaiserHalf(0, 10))).toEqual(new Array(11).fill(1));
  });

  it('accepts harmonic grids from DC or from Δf and explains every other grid', () => {
    const fromDf = Float64Array.from({ length: 100 }, (_, k) => (k + 1) * 1e7);
    const fromDc = Float64Array.from({ length: 100 }, (_, k) => k * 1e7);
    expect(checkLowPassGrid(fromDf)).toMatchObject({ ok: true, hasDc: false });
    expect(checkLowPassGrid(fromDf).df).toBeCloseTo(1e7, 3);
    expect(checkLowPassGrid(fromDc)).toMatchObject({ ok: true, hasDc: true });
    const offset = Float64Array.from({ length: 100 }, (_, k) => 3e8 + k * 1e7);
    expect(checkLowPassGrid(offset).reason).toMatch(/not at DC or at one frequency step/);
    const log = Float64Array.from({ length: 100 }, (_, k) => 1e6 * 1.1 ** k);
    expect(checkLowPassGrid(log).ok).toBe(false);
    expect(checkLowPassGrid(Float64Array.of(1, 2, 3)).reason).toMatch(/at least/);
  });
});

describe('low-pass step TDR', () => {
  it('shows 50 Ω for a matched load and 75 Ω for a resistor', () => {
    const matched = lowPassStep(...Object.values(lineWithLoad(0, 0, 1e7, 2000)) as [Float64Array, Float64Array, Float64Array], 6);
    if ('error' in matched) throw new Error(matched.error);
    for (const t of [0, 1e-9, 20e-9]) expect(zAt(matched, t)).toBeCloseTo(50, 9);
    const r75 = lineWithLoad(0.2, 0, 1e7, 2000);
    const step = lowPassStep(r75.freq, r75.re, r75.im, 6);
    if ('error' in step) throw new Error(step.error);
    expect(step.dc).toBeCloseTo(0.2, 12);
    expect(step.dcExtrapolated).toBe(true);
    expect(zAt(step, 1e-9)).toBeCloseTo(75, 2);
    expect(zAt(step, 30e-9)).toBeCloseTo(75, 2);
    expect(zAt(step, -1e-9)).toBeCloseTo(50, 2);
  });

  it('places the load of a delayed line at the round-trip time', () => {
    const d = lineWithLoad(0.2, 0.5e-9, 1e7, 2000); // 10 MHz to 20 GHz, 1 ns round trip
    const r = lowPassStep(d.freq, d.re, d.im, 6);
    if ('error' in r) throw new Error(r.error);
    expect(r.range).toBeCloseTo(100e-9, 15);
    expect(r.fMax).toBeCloseTo(20e9, 0);
    expect(zAt(r, 0.5e-9)).toBeCloseTo(50, 2);
    expect(zAt(r, 1.5e-9)).toBeCloseTo(75, 2);
    // half-way up the step at the round trip
    expect(zAt(r, 1e-9)).toBeGreaterThan(55);
    expect(zAt(r, 1e-9)).toBeLessThan(70);
  });

  it('uses a DC point when the file has one', () => {
    const N = 500;
    const freq = Float64Array.from({ length: N + 1 }, (_, k) => k * 2e7);
    const re = new Float64Array(N + 1).fill(-1);
    const r = lowPassStep(freq, re, new Float64Array(N + 1), 0);
    if ('error' in r) throw new Error(r.error);
    expect(r.dcExtrapolated).toBe(false);
    expect(r.rho[r.rho.length - 1]).toBeCloseTo(-1, 9);
    expect(impedanceFromRho(-1, 50)).toBe(0);
    expect(impedanceFromRho(1, 50)).toBe(Infinity);
  });

  it('has the step rise times of Keysight Table 1-3 for β = 0, 6 and 13', () => {
    // minimum 0.45, normal 0.99, maximum 1.48 divided by the frequency span
    expect(stepRiseTime(2000, 1e7, 0) * 20e9).toBeCloseTo(0.45, 1);
    expect(stepRiseTime(2000, 1e7, 6) * 20e9).toBeCloseTo(0.99, 1);
    expect(stepRiseTime(2000, 1e7, 13) * 20e9).toBeCloseTo(1.48, 1);
  });

  it('reports why a non-uniform grid has no TDR', () => {
    const r = lowPassStep(Float64Array.from({ length: 50 }, (_, k) => 1e9 + k * 1e8), new Float64Array(50), new Float64Array(50), 6);
    expect('error' in r && r.error).toMatch(/DC/);
  });
});
