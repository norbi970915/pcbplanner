// Per-trace quantities of S-parameter data: magnitude in dB, phase, group delay,
// marker interpolation and min/max decimation for plotting.
import type { Matrices } from './touchstone';

export interface Trace {
  re: Float64Array;
  im: Float64Array;
}

/** Element (i, j) of every matrix (0-based, i = response, j = stimulus). */
export function term(m: Matrices, i: number, j: number): Trace {
  const n = m.ports;
  const count = m.freq.length;
  const re = new Float64Array(count);
  const im = new Float64Array(count);
  const off = i * n + j;
  for (let k = 0, p = off; k < count; k++, p += n * n) {
    re[k] = m.re[p];
    im[k] = m.im[p];
  }
  return { re, im };
}

/** 20·log10|S|; −Infinity where |S| = 0. */
export function magnitudeDb(t: Trace): Float64Array {
  const out = new Float64Array(t.re.length);
  for (let k = 0; k < out.length; k++) out[k] = 20 * Math.log10(Math.hypot(t.re[k], t.im[k]));
  return out;
}

/** Phase in degrees, wrapped to (−180°, 180°]. */
export function phaseDeg(t: Trace): Float64Array {
  const out = new Float64Array(t.re.length);
  for (let k = 0; k < out.length; k++) out[k] = (Math.atan2(t.im[k], t.re[k]) * 180) / Math.PI;
  return out;
}

/** Phase in radians, unwrapped by assuming it changes by less than π between neighbouring points. */
export function unwrappedPhase(t: Trace): Float64Array {
  const out = new Float64Array(t.re.length);
  let prev = 0;
  for (let k = 0; k < out.length; k++) {
    const raw = Math.atan2(t.im[k], t.re[k]);
    if (k === 0) out[k] = raw;
    else {
      let d = raw - prev;
      d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
      out[k] = out[k - 1] + d;
    }
    prev = raw;
  }
  return out;
}

/**
 * Group delay τ = −dφ/dω, as the finite difference of the unwrapped phase over an aperture of
 * `half` points either side of each point (clipped at the ends of the data). NaN where the
 * aperture is empty or the magnitude at either end is zero.
 */
export function groupDelay(freq: Float64Array, t: Trace, half: number): Float64Array {
  const phi = unwrappedPhase(t);
  const count = freq.length;
  const out = new Float64Array(count);
  const h = Math.max(1, Math.floor(half));
  for (let k = 0; k < count; k++) {
    const lo = Math.max(0, k - h);
    const hi = Math.min(count - 1, k + h);
    const zero = (q: number) => t.re[q] === 0 && t.im[q] === 0;
    if (hi === lo || zero(lo) || zero(hi)) out[k] = NaN;
    else out[k] = -(phi[hi] - phi[lo]) / (2 * Math.PI * (freq[hi] - freq[lo]));
  }
  return out;
}

/** Index of the last frequency ≤ f (binary search); −1 below the first point. */
export function lowerIndex(freq: Float64Array, f: number): number {
  let lo = 0;
  let hi = freq.length - 1;
  if (!(f >= freq[0])) return -1;
  if (f >= freq[hi]) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1;
    if (freq[mid] <= f) lo = mid;
    else hi = mid;
  }
  return lo;
}

export interface MarkerValue {
  db: number;
  deg: number;
}

/**
 * Value at frequency f between two data points: dB magnitude and phase are interpolated linearly
 * (the phase along the shorter way round). Null outside the data range; no extrapolation.
 */
export function valueAt(freq: Float64Array, t: Trace, f: number): MarkerValue | null {
  if (!freq.length || !Number.isFinite(f) || f < freq[0] || f > freq[freq.length - 1]) return null;
  const k = lowerIndex(freq, f);
  const at = (q: number) => ({ db: 20 * Math.log10(Math.hypot(t.re[q], t.im[q])), rad: Math.atan2(t.im[q], t.re[q]) });
  const a = at(k);
  if (k === freq.length - 1 || freq[k] === f) return { db: a.db, deg: (a.rad * 180) / Math.PI };
  const b = at(k + 1);
  const u = (f - freq[k]) / (freq[k + 1] - freq[k]);
  const db = Number.isFinite(a.db) && Number.isFinite(b.db) ? a.db + (b.db - a.db) * u : u < 0.5 ? a.db : b.db;
  let d = b.rad - a.rad;
  d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
  let rad = a.rad + d * u;
  rad -= 2 * Math.PI * Math.round(rad / (2 * Math.PI));
  return { db, deg: (rad * 180) / Math.PI };
}

/** Linear interpolation of a real series at f; null outside the data range or where undefined. */
export function seriesAt(freq: Float64Array, y: Float64Array, f: number): number | null {
  if (!freq.length || !Number.isFinite(f) || f < freq[0] || f > freq[freq.length - 1]) return null;
  const k = lowerIndex(freq, f);
  if (k === freq.length - 1 || freq[k] === f) return Number.isFinite(y[k]) ? y[k] : null;
  const u = (f - freq[k]) / (freq[k + 1] - freq[k]);
  const v = y[k] + (y[k + 1] - y[k]) * u;
  return Number.isFinite(v) ? v : null;
}

export interface Decimated {
  x: Float64Array;
  y: Float64Array;
}

/**
 * Reduces a trace to at most four points per plot column (first, minimum, maximum, last, in data
 * order), so every peak and notch that would be drawn stays visible. x must be ascending.
 * NaN y values break the line (one NaN is emitted per gap); ±Infinity is kept for the plot to clamp.
 */
export function decimateMinMax(x: ArrayLike<number>, y: ArrayLike<number>, x0: number, x1: number, columns: number): Decimated {
  const count = x.length;
  const cols = Math.max(1, Math.floor(columns));
  if (count <= 4 * cols) return { x: Float64Array.from(x), y: Float64Array.from(y) };
  const ox: number[] = [];
  const oy: number[] = [];
  const span = x1 - x0 || 1;
  let col = -1;
  let first = -1, last = -1, lo = -1, hi = -1;
  let inGap = false;
  const flush = () => {
    if (first < 0) return;
    const idx = [first, lo, hi, last].sort((a, b) => a - b);
    for (let q = 0; q < 4; q++) {
      if (q && idx[q] === idx[q - 1]) continue;
      ox.push(x[idx[q]]);
      oy.push(y[idx[q]]);
    }
    first = last = lo = hi = -1;
  };
  for (let i = 0; i < count; i++) {
    const c = Math.min(cols - 1, Math.max(0, Math.floor(((x[i] - x0) / span) * cols)));
    if (c !== col) {
      flush();
      col = c;
    }
    const v = y[i];
    if (Number.isNaN(v)) {
      flush();
      if (!inGap) {
        ox.push(NaN);
        oy.push(NaN);
        inGap = true;
      }
      continue;
    }
    inGap = false;
    if (first < 0) first = lo = hi = i;
    if (v < y[lo]) lo = i;
    if (v > y[hi]) hi = i;
    last = i;
  }
  flush();
  return { x: Float64Array.from(ox), y: Float64Array.from(oy) };
}

/** SVG path for a decimated trace; NaN points start a new sub-path. Y must map ±Infinity to a finite position. */
export function svgPath(d: Decimated, X: (v: number) => number, Y: (v: number) => number): string {
  let s = '';
  let pen = false;
  for (let i = 0; i < d.x.length; i++) {
    const v = d.y[i];
    if (Number.isNaN(v) || !Number.isFinite(d.x[i])) {
      pen = false;
      continue;
    }
    s += `${pen ? 'L' : 'M'}${X(d.x[i]).toFixed(1)},${Y(v).toFixed(1)}`;
    pen = true;
  }
  return s;
}
