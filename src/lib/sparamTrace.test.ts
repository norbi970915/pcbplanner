import { describe, expect, it } from 'vitest';
import { decimateMinMax, groupDelay, lowerIndex, magnitudeDb, phaseDeg, seriesAt, svgPath, term, unwrappedPhase, valueAt } from './sparamTrace';
import type { Matrices } from './touchstone';

/** Ideal delay line exp(−jωτ) sampled at k·df, k = 1…count. */
function delayLine(tau: number, df: number, count: number) {
  const freq = new Float64Array(count);
  const re = new Float64Array(count);
  const im = new Float64Array(count);
  for (let k = 0; k < count; k++) {
    const f = (k + 1) * df;
    freq[k] = f;
    re[k] = Math.cos(2 * Math.PI * f * tau);
    im[k] = -Math.sin(2 * Math.PI * f * tau);
  }
  return { freq, t: { re, im } };
}

describe('trace quantities', () => {
  it('extracts one matrix element over frequency', () => {
    const m: Matrices = { ports: 2, freq: Float64Array.of(1, 2), re: Float64Array.of(1, 2, 3, 4, 5, 6, 7, 8), im: Float64Array.of(0, 0, -1, 0, 0, 0, -2, 0) };
    const t = term(m, 1, 0);
    expect(Array.from(t.re)).toEqual([3, 7]);
    expect(Array.from(t.im)).toEqual([-1, -2]);
    expect(magnitudeDb({ re: Float64Array.of(0.1, 0), im: Float64Array.of(0, 0) })[0]).toBeCloseTo(-20, 12);
    expect(magnitudeDb({ re: Float64Array.of(0), im: Float64Array.of(0) })[0]).toBe(-Infinity);
    expect(phaseDeg({ re: Float64Array.of(0), im: Float64Array.of(-1) })[0]).toBeCloseTo(-90, 12);
  });

  it('unwraps the phase of a delay line and returns its delay as group delay', () => {
    const tau = 100e-12;
    const { freq, t } = delayLine(tau, 10e6, 2000); // 10 MHz to 20 GHz: two full turns of phase
    const phi = unwrappedPhase(t);
    expect(phi[1999]).toBeCloseTo(-2 * Math.PI * 20e9 * tau, 9);
    for (const half of [1, 2, 5, 20]) {
      const gd = groupDelay(freq, t, half);
      for (const k of [0, 1, 777, 1998, 1999]) expect(gd[k]).toBeCloseTo(tau, 18);
    }
  });

  it('returns NaN group delay where the magnitude is zero', () => {
    const { freq, t } = delayLine(50e-12, 1e8, 10);
    t.re[4] = 0;
    t.im[4] = 0;
    const gd = groupDelay(freq, t, 1);
    expect(Number.isNaN(gd[3])).toBe(true);
    expect(Number.isNaN(gd[5])).toBe(true);
    expect(gd[8]).toBeCloseTo(50e-12, 18);
  });

  it('interpolates dB and the phase the short way round at a marker, without extrapolation', () => {
    const freq = Float64Array.of(1e9, 2e9);
    const a = (179 * Math.PI) / 180, b = (-179 * Math.PI) / 180;
    const t = { re: Float64Array.of(0.1 * Math.cos(a), 0.01 * Math.cos(b)), im: Float64Array.of(0.1 * Math.sin(a), 0.01 * Math.sin(b)) };
    const v = valueAt(freq, t, 1.5e9)!;
    expect(v.db).toBeCloseTo(-30, 9);
    expect(Math.abs(v.deg)).toBeCloseTo(180, 9);
    expect(valueAt(freq, t, 2e9)!.db).toBeCloseTo(-40, 9);
    expect(valueAt(freq, t, 2.5e9)).toBeNull();
    expect(seriesAt(freq, Float64Array.of(1, 3), 1.25e9)).toBeCloseTo(1.5, 12);
    expect(seriesAt(freq, Float64Array.of(1, NaN), 2e9)).toBeNull();
    expect(lowerIndex(Float64Array.of(1, 2, 3, 4), 3.5)).toBe(2);
    expect(lowerIndex(Float64Array.of(1, 2, 3, 4), 0.5)).toBe(-1);
  });
});

describe('min/max decimation', () => {
  it('keeps every peak and notch while reducing 100 000 points to the plot width', () => {
    const count = 100_000;
    const x = new Float64Array(count);
    const y = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      x[i] = i;
      y[i] = Math.sin(i / 50) * 0.1;
    }
    y[54_321] = 5;
    y[77_777] = -7;
    const d = decimateMinMax(x, y, 0, count - 1, 700);
    expect(d.x.length).toBeLessThanOrEqual(4 * 700);
    expect(Math.max(...d.y)).toBe(5);
    expect(Math.min(...d.y)).toBe(-7);
    expect(Array.from(d.x)).toContain(54_321);
    expect(Array.from(d.x)).toContain(77_777);
    expect(d.x[0]).toBe(0);
    expect(d.x[d.x.length - 1]).toBe(count - 1);
    for (let i = 1; i < d.x.length; i++) expect(d.x[i]).toBeGreaterThan(d.x[i - 1]);
  });

  it('breaks the line at undefined values', () => {
    const x = Float64Array.from({ length: 10_000 }, (_, i) => i);
    const y = Float64Array.from({ length: 10_000 }, (_, i) => (i >= 5000 && i < 5100 ? NaN : 1));
    const d = decimateMinMax(x, y, 0, 9999, 100);
    expect(d.y.filter((v) => Number.isNaN(v)).length).toBe(1);
    const path = svgPath(d, (v) => v / 100, (v) => v);
    expect(path.match(/M/g)?.length).toBe(2);
    expect(path).not.toContain('NaN');
    const zero = decimateMinMax(x, Float64Array.from({ length: 10_000 }, (_, i) => (i === 4321 ? -Infinity : -3)), 0, 9999, 100);
    expect(Array.from(zero.y)).toContain(-Infinity);
    expect(zero.y.some((v) => Number.isNaN(v))).toBe(false);
    const small = decimateMinMax(Float64Array.of(0, 1, 2), Float64Array.of(1, 2, 3), 0, 2, 700);
    expect(Array.from(small.y)).toEqual([1, 2, 3]);
  });
});
