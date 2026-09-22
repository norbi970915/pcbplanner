import { describe, expect, it } from 'vitest';
import { GeometryError, solve } from './fieldsolver';

/** Complete elliptic integral of the first kind K(k) by the AGM (Abramowitz & Stegun 17.6). */
function ellipK(k: number): number {
  let a = 1;
  let b = Math.sqrt(1 - k * k);
  for (let i = 0; i < 40; i++) {
    const an = (a + b) / 2;
    b = Math.sqrt(a * b);
    a = an;
  }
  return Math.PI / (2 * a);
}

/** Exact zero-thickness centred stripline, S. B. Cohn, IRE Trans. MTT-2, 1954: Z0 = 30π/√εr · K(k)/K(k'), k = sech(πW/2b). */
function cohnStripline(w: number, b: number, er: number): number {
  const k = 1 / Math.cosh((Math.PI * w) / (2 * b));
  return ((30 * Math.PI) / Math.sqrt(er)) * (ellipK(k) / ellipK(Math.tanh((Math.PI * w) / (2 * b))));
}

const pct = (a: number, b: number) => (100 * (a - b)) / b;

/**
 * Exact zero-thickness edge-coupled stripline, S. B. Cohn, "Shielded coupled-strip
 * transmission line", IRE Trans. MTT-3, 1955: Z0e,o = 30π/√εr · K(k'e,o)/K(ke,o),
 * ke = tanh(πW/2b)·tanh(π(W+S)/2b), ko = tanh(πW/2b)·coth(π(W+S)/2b).
 */
function cohnCoupled(w: number, s: number, b: number, er: number) {
  const a = Math.tanh((Math.PI * w) / (2 * b));
  const c = Math.tanh((Math.PI * (w + s)) / (2 * b));
  const z = (k: number) => ((30 * Math.PI) / Math.sqrt(er)) * (ellipK(Math.sqrt(1 - k * k)) / ellipK(k));
  return { ze: z(a * c), zo: z(a / c) };
}

const T = 0.001; // near-zero thickness; its own effect is < 1.5 % for these widths

describe('audit: field solver normalisation against exact solutions', () => {
  it.each([
    [0.15, 0.5],
    [0.3, 0.6],
    [1, 0.5],
  ])('single stripline W=%s b=%s vs Cohn (within 2 %%, εeff = εr)', (w, b) => {
    const r = solve({ w, t: T, yTrace: (b - T) / 2, diff: false, slabs: [{ y0: 0, y1: b, er: 3 }], topPlane: b }).se!;
    const d = pct(r.z, cohnStripline(w, b, 3));
    expect(d).toBeLessThan(0.3);
    expect(d).toBeGreaterThan(-2); // finite thickness lowers Z slightly
    expect(r.eeff).toBeCloseTo(3, 4);
  }, 60000);

  it.each([
    [0.2, 0.2, 0.6],
    [0.1, 0.3, 0.5],
  ])('coupled stripline W=%s S=%s b=%s: Zeven/Zodd vs Cohn (within 2 %%)', (w, s, b) => {
    const r = solve({ w, t: T, s, yTrace: (b - T) / 2, diff: true, slabs: [{ y0: 0, y1: b, er: 1 }], topPlane: b });
    const ref = cohnCoupled(w, s, b, 1);
    for (const [z, zr] of [
      [r.even!.z, ref.ze],
      [r.odd!.z, ref.zo],
    ]) {
      expect(pct(z, zr)).toBeLessThan(0.3);
      expect(pct(z, zr)).toBeGreaterThan(-2);
    }
    expect(r.zdiff).toBeCloseTo(2 * r.odd!.z, 12);
    expect(r.zcomm).toBeCloseTo(r.even!.z / 2, 12);
  }, 60000);

  it('rejects invalid geometry instead of returning numbers', () => {
    const base = { w: 0.1, t: 0.035, yTrace: 0.1, diff: false, slabs: [{ y0: 0, y1: 0.1, er: 4 }] };
    expect(() => solve({ ...base, w: 0 })).toThrow(GeometryError);
    expect(() => solve({ ...base, w: NaN })).toThrow(GeometryError);
    expect(() => solve({ ...base, yTrace: -1 })).toThrow(GeometryError);
    expect(() => solve({ ...base, slabs: [{ y0: 0, y1: 0.1, er: 0.5 }] })).toThrow(GeometryError);
    expect(() => solve({ ...base, topPlane: 0.12 })).toThrow(GeometryError);
    expect(() => solve({ ...base, diff: true })).toThrow(GeometryError);
  });
});
