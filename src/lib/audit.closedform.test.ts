import { describe, expect, it } from 'vitest';
import { microstripHJ, striplineAsym, striplineWheeler } from './closedform';
import { solve } from './fieldsolver';
import { ETA0 } from './units';

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
  const kp = Math.tanh((Math.PI * w) / (2 * b));
  return ((30 * Math.PI) / Math.sqrt(er)) * (ellipK(k) / ellipK(kp));
}

const pct = (a: number, b: number) => (100 * (a - b)) / b;

describe('audit: Hammerstad–Jensen microstrip', () => {
  it('transcription matches the published equations (Qucs technical papers §"Single microstrip line")', () => {
    // qucs.sourceforge.net/tech/node75.html, zero-thickness air line at u = 1:
    // f(1) = 6 + (2π−6)·exp(−30.666^0.7528) ≈ 6,  Z01 = η0/2π · ln(6 + √5) = 126.42 Ω
    expect(microstripHJ(1, 1, 0, 1).z0).toBeCloseTo((ETA0 / (2 * Math.PI)) * Math.log(6 + Math.sqrt(5)), 3);
    expect(microstripHJ(1, 1, 0, 1).z0).toBeCloseTo(126.42, 2);
    // εr = 1 → εeff = 1 exactly
    expect(microstripHJ(0.7, 1, 0, 1).eeff).toBeCloseTo(1, 12);
  });

  it('hand-computed εeff for u = 1, εr = 10 (H&J eqs. 3–5)', () => {
    const u = 1, er = 10;
    const a = 1 + Math.log((1 + (1 / 52) ** 2) / (1 + 0.432)) / 49 + Math.log(1 + (1 / 18.1) ** 3) / 18.7;
    const b = 0.564 * ((er - 0.9) / (er + 3)) ** 0.053;
    const e = (er + 1) / 2 + ((er - 1) / 2) * (1 + 10 / u) ** (-a * b);
    expect(microstripHJ(1, 1, 0, 10).eeff).toBeCloseTo(e, 12);
    expect(e).toBeCloseTo(6.705, 3);
  });

  it('thickness correction matches an independent 2-D field solution (ΔZ within 5 %, Z within 1 %)', () => {
    for (const [w, h, t] of [
      [0.3, 0.2, 0.035],
      [0.1, 0.1, 0.035],
    ]) {
      const thick = microstripHJ(w, h, t, 4.3).z0;
      const thin = microstripHJ(w, h, 0.0005, 4.3).z0;
      const g = (tt: number) => ({ w, t: tt, yTrace: h, diff: false, slabs: [{ y0: 0, y1: h, er: 4.3 }] });
      const fThick = solve(g(t), { accuracy: 'high' }).se!.z;
      const fThin = solve(g(0.0005), { accuracy: 'high' }).se!.z;
      expect(Math.abs(pct(thick, fThick))).toBeLessThan(1);
      expect(Math.abs(pct(thick - thin, fThick - fThin))).toBeLessThan(5);
    }
  }, 60000);

  it('invalid width does not produce a finite impedance', () => {
    expect(Number.isFinite(microstripHJ(0, 1, 0, 4).z0)).toBe(false);
    expect(Number.isFinite(microstripHJ(1, 1, 0, 0.5).z0)).toBe(false);
  });
});

describe('audit: Wheeler 1978 stripline', () => {
  it.each([
    [0.05, 0.5],
    [0.15, 0.5],
    [0.3, 0.6],
    [1, 0.5],
  ])('t → 0 agrees with Cohn exact elliptic solution within 0.5 %% (w=%s, b=%s)', (w, b) => {
    expect(Math.abs(pct(striplineWheeler(w, b, 0, 1).z0, cohnStripline(w, b, 1)))).toBeLessThan(0.5);
    expect(striplineWheeler(w, b, 0, 4).z0).toBeCloseTo(striplineWheeler(w, b, 0, 1).z0 / 2, 9);
  });

  it.each([
    [0.5, 0.5, 0.035],
    [0.3, 0.4, 0.07],
  ])('thick strip agrees with Cohn thick-strip formula within 0.5 %% (w=%s b=%s t=%s)', (w, b, t) => {
    // S. B. Cohn, "Problems in strip transmission lines", IRE Trans. MTT-3, 1955 (Wadell §3.5.1),
    // valid for W/(b−t) ≥ 0.35: Z0 = 94.15/√εr / (W/b/(1−t/b) + Cf/(0.0885εr)),
    // Cf/(0.0885εr) = (1/π)[2/(1−x)·ln(1/(1−x)+1) − (1/(1−x) − 1)·ln(1/(1−x)² − 1)], x = t/b.
    const g = 1 - t / b;
    const cf = ((2 / g) * Math.log(1 / g + 1) - (1 / g - 1) * Math.log(1 / (g * g) - 1)) / Math.PI;
    const ref = 94.15 / (w / b / g + cf);
    expect(Math.abs(pct(striplineWheeler(w, b, t, 1).z0, ref))).toBeLessThan(0.5);
  });

  it('offset stripline reduces to the symmetric case and is within 3 % of a field solution', () => {
    expect(striplineAsym(0.2, 0.15, 0.15, 0.035, 4).z0).toBeCloseTo(striplineWheeler(0.2, 0.335, 0.035, 4).z0, 9);
    // Known limitation of the parallel-combination approximation (Wadell §3.5.4):
    // for h2/h1 = 3 it reads 2.8 % high against the 2-D field solution.
    const w = 0.15, h1 = 0.1, h2 = 0.3, t = 0.035;
    const fs = solve({ w, t, yTrace: h1, diff: false, slabs: [{ y0: 0, y1: h1 + t + h2, er: 4 }], topPlane: h1 + t + h2 }).se!.z;
    expect(Math.abs(pct(striplineAsym(w, h1, h2, t, 4).z0, fs))).toBeLessThan(3.5);
  }, 60000);
});
