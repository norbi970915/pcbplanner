// Quarter-wave and multisection transformers, transmission-line stubs and single-stub shunt matching,
// after Pozar, Microwave Engineering, 4th ed.: §2.3 (terminated line), §5.2 (single-stub tuning),
// §5.4 (quarter-wave transformer), §5.5 (theory of small reflections), §5.6 (binomial) and §5.7
// (Chebyshev). Lines are lossless and TEM, so the electrical length θ is proportional to frequency.
// SI units: Ω, S, Hz, m (lengths in mm where stated).
import { microstripHJ, striplineWheeler } from './closedform';
import { cAbs, cAdd, cDiv, cInv, cMul, cSub, cx, type Cx } from './matching';
import { C0 } from './units';

/* ------------------------------------------------------------------ lines */

/** Input impedance of a lossless line of impedance z0 and electrical length θ (rad) terminated in zl. */
export function lineZin(z0: number, zl: Cx, theta: number): Cx {
  const c = Math.cos(theta), s = Math.sin(theta);
  // Z0 (ZL cos θ + j Z0 sin θ) / (Z0 cos θ + j ZL sin θ), finite at θ = π/2
  const num = cx(zl.re * c, zl.im * c + z0 * s);
  const den = cx(z0 * c - zl.im * s, zl.re * s);
  return cMul(cx(z0), cDiv(num, den));
}

/** Quarter wavelength in mm at f (Hz) for an effective permittivity εeff. */
export const quarterWaveMm = (f: number, eeff: number) => (C0 / (4 * f * Math.sqrt(eeff))) * 1e3;
/** Wavelength in mm. */
export const wavelengthMm = (f: number, eeff: number) => (C0 / (f * Math.sqrt(eeff))) * 1e3;

/* ------------------------------------------------------------------ multisection transformers */

/** Reflection coefficient Γ = (ZL − Z0)/(ZL + Z0) of a real load. */
export const gammaReal = (z0: number, zl: number) => (zl - z0) / (zl + z0);

/** Single-section quarter-wave transformer impedance, Z1 = √(Z0 ZL) (real load). */
export const quarterWaveZ = (z0: number, zl: number) => Math.sqrt(z0 * zl);

/** Binomial coefficient C(n, k). */
export function binom(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/**
 * Fractional bandwidth Δf/f0 where |Γ| ≤ Γm for a single-section transformer, exact for TEM lines
 * (Pozar §5.4): Δf/f0 = 2 − (4/π) acos[ Γm/√(1 − Γm²) · 2√(Z0 ZL)/|ZL − Z0| ].
 * Returns Infinity when |Γ| ≤ Γm at every frequency and NaN when ZL = Z0.
 */
export function singleBandwidth(z0: number, zl: number, gm: number): number {
  if (zl === z0) return NaN;
  const arg = (gm / Math.sqrt(1 - gm * gm)) * ((2 * Math.sqrt(z0 * zl)) / Math.abs(zl - z0));
  if (arg >= 1) return Infinity;
  return 2 - (4 / Math.PI) * Math.acos(arg);
}

/**
 * Binomial transformer section impedances Z1…ZN (Pozar §5.6), from the recommended form
 * ln(Zn+1/Zn) = 2^−N C(N, n) ln(ZL/Z0), which ends exactly on ZL.
 */
export function binomialZ(z0: number, zl: number, n: number): number[] {
  const out: number[] = [];
  let z = z0;
  for (let k = 0; k < n; k++) {
    z *= Math.exp(2 ** -n * binom(n, k) * Math.log(zl / z0));
    out.push(z);
  }
  return out;
}

/**
 * Binomial bandwidth (Pozar §5.6): Δf/f0 = 2 − (4/π) acos[ ½ (Γm/|A|)^(1/N) ], with A ≈ 2^−(N+1) ln(ZL/Z0),
 * the form consistent with the logarithmic section design (Pozar's three-section example uses it).
 * Small-reflection approximation. Infinity when the response never exceeds Γm.
 */
export function binomialBandwidth(z0: number, zl: number, n: number, gm: number): number {
  const a = Math.abs(2 ** -(n + 1) * Math.log(zl / z0));
  if (a === 0) return NaN;
  const arg = 0.5 * (gm / a) ** (1 / n);
  if (arg >= 1) return Infinity;
  return 2 - (4 / Math.PI) * Math.acos(arg);
}

/** Polynomial coefficients (ascending powers of x) of the Chebyshev polynomial T_N(x). */
export function chebyshevPoly(n: number): number[] {
  let a = [1], b = [0, 1];
  if (n === 0) return a;
  for (let k = 1; k < n; k++) {
    const c = new Array(k + 2).fill(0);
    for (let i = 0; i < b.length; i++) c[i + 1] += 2 * b[i];
    for (let i = 0; i < a.length; i++) c[i] -= a[i];
    a = b;
    b = c;
  }
  return b;
}

/** T_N(x) for any real x. */
export function chebyshevT(n: number, x: number): number {
  if (Math.abs(x) <= 1) return Math.cos(n * Math.acos(x));
  const t = Math.cosh(n * Math.acosh(Math.abs(x)));
  return x < 0 && n % 2 === 1 ? -t : t;
}

export interface ChebyshevDesign {
  z: number[];
  /** sec θm and θm (rad); the passband is θm ≤ θ ≤ π − θm */
  secThetaM: number;
  thetaM: number;
  /** Δf/f0 = 2 − 4θm/π */
  bandwidth: number;
  /** section reflection coefficients Γ0 … ΓN */
  gammas: number[];
}

/**
 * Chebyshev (equal-ripple) transformer by Pozar's §5.7 synthesis: Γ(θ) = A e^(−jNθ) T_N(sec θm cos θ)
 * with A = Γm, sec θm = cosh[(1/N) acosh(|ln(ZL/Z0)| / (2Γm))]. T_N(sec θm cos θ) is expanded into
 * cos(N − 2n)θ terms and matched to 2[Γ0 cos Nθ + Γ1 cos(N − 2)θ + …], and ln(Zn+1/Zn) = 2Γn.
 * Null when |ln(ZL/Z0)|/2 ≤ Γm (no transformer needed for that ripple).
 */
export function chebyshevDesign(z0: number, zl: number, n: number, gm: number): ChebyshevDesign | null {
  const l = Math.log(zl / z0);
  const ratio = Math.abs(l) / (2 * gm);
  if (!(ratio > 1) || !(n >= 1)) return null;
  const sec = Math.cosh(Math.acosh(ratio) / n);
  const a = gm * Math.sign(l);
  // coefficient of cos(mθ) in T_N(sec · cos θ), using cos^k θ = 2^−k Σ C(k, j) cos((k − 2j)θ)
  const poly = chebyshevPoly(n);
  const cosCoef = new Array(n + 1).fill(0);
  for (let k = 0; k <= n; k++) {
    if (poly[k] === 0) continue;
    const ck = poly[k] * sec ** k;
    for (let j = 0; j <= k; j++) cosCoef[Math.abs(k - 2 * j)] += (ck * binom(k, j)) / 2 ** k;
  }
  const gammas = new Array(n + 1).fill(0);
  for (let i = 0; 2 * i <= n; i++) {
    const m = n - 2 * i;
    const g = m === 0 ? a * cosCoef[0] : (a * cosCoef[m]) / 2;
    gammas[i] = g;
    gammas[n - i] = g;
  }
  const z: number[] = [];
  let zz = z0;
  for (let i = 0; i < n; i++) {
    zz *= Math.exp(2 * gammas[i]);
    z.push(zz);
  }
  const thetaM = Math.acos(1 / sec);
  return { z, secThetaM: sec, thetaM, bandwidth: 2 - (4 * thetaM) / Math.PI, gammas };
}

/** Exact input reflection of a cascade of sections z[] (each λ/4 at f0) terminated in zl, at f/f0 = fr. */
export function cascadeGamma(z0: number, zl: number, z: number[], fr: number): Cx {
  const theta = (Math.PI / 2) * fr;
  let zin = cx(zl);
  for (let k = z.length - 1; k >= 0; k--) zin = lineZin(z[k], zin, theta);
  return cDiv(cSub(zin, cx(z0)), cAdd(zin, cx(z0)));
}

/** Small-reflection approximation Γ(θ) = Σ Γn e^(−2jnθ) with Γn = ½ ln(Zn+1/Zn) (Pozar §5.5). */
export function smallReflectionGamma(z0: number, zl: number, z: number[], fr: number): Cx {
  const theta = (Math.PI / 2) * fr;
  const all = [z0, ...z, zl];
  let g = cx(0);
  for (let i = 0; i < all.length - 1; i++) {
    const gn = 0.5 * Math.log(all[i + 1] / all[i]);
    g = cAdd(g, cx(gn * Math.cos(2 * i * theta), -gn * Math.sin(2 * i * theta)));
  }
  return g;
}

export interface ExactBand {
  /** lowest f/f0 below 1 where |Γ| ≤ Γm (the band is symmetrical about f0); 0 when it reaches DC */
  lo: number;
  /** Δf/f0 = 2 (1 − lo) */
  bandwidth: number;
  /** largest exact |Γ| between lo and f0 */
  peak: number;
}

/**
 * Band from the exact cascade: the outermost frequency below f0 with |Γ| ≤ Γm, found on a fine grid
 * and refined by bisection. |Γ(f)| of real-impedance TEM sections is symmetrical about f0.
 */
export function exactBand(z0: number, zl: number, z: number[], gm: number): ExactBand {
  const mag = (fr: number) => cAbs(cascadeGamma(z0, zl, z, fr));
  const n = 4000;
  let first = -1;
  let peak = 0;
  for (let i = 0; i <= n; i++) {
    const fr = i / n;
    const m = mag(fr);
    if (first < 0 && m <= gm) first = i;
    if (first >= 0) peak = Math.max(peak, m);
  }
  if (first < 0) return { lo: NaN, bandwidth: 0, peak: NaN };
  if (first === 0) return { lo: 0, bandwidth: 2, peak };
  let a = (first - 1) / n, b = first / n;
  for (let i = 0; i < 60; i++) {
    const m = (a + b) / 2;
    if (mag(m) <= gm) b = m;
    else a = m;
  }
  return { lo: b, bandwidth: 2 * (1 - b), peak };
}

/* ------------------------------------------------------------------ closed-form trace widths */

export interface Trace {
  /** width, same unit as h and t */
  w: number;
  eeff: number;
}

function bisectWidth(z: number, zOf: (u: number) => number, scale: number): number | null {
  let lo = Math.log(0.01), hi = Math.log(100);
  const zHi = zOf(Math.exp(lo)), zLo = zOf(Math.exp(hi));
  if (!(z <= zHi && z >= zLo)) return null;
  for (let i = 0; i < 80; i++) {
    const m = (lo + hi) / 2;
    if (zOf(Math.exp(m)) > z) lo = m;
    else hi = m;
  }
  return Math.exp((lo + hi) / 2) * scale;
}

/** Microstrip width for impedance z by bisection on Hammerstad–Jensen (closedform.ts), w/h from 0.01 to 100. */
export function microstripWidth(z: number, h: number, t: number, er: number): Trace | null {
  const w = bisectWidth(z, (u) => microstripHJ(u * h, h, t, er).z0, h);
  return w === null ? null : { w, eeff: microstripHJ(w, h, t, er).eeff };
}

/** Symmetric stripline width (dielectric h above and below the trace) by bisection on Wheeler (closedform.ts). */
export function striplineWidth(z: number, h: number, t: number, er: number): Trace | null {
  const b = 2 * h + t;
  const w = bisectWidth(z, (u) => striplineWheeler(u * b, b, t, er).z0, b);
  return w === null ? null : { w, eeff: er };
}

/* ------------------------------------------------------------------ stubs */

export type StubEnd = 'open' | 'short';

/**
 * Input reactance of a lossless stub of impedance z0 and electrical length βl (Pozar §2.3):
 * short: Zin = j Z0 tan βl; open: Zin = −j Z0 cot βl. ±Infinity at a parallel resonance.
 */
export function stubX(end: StubEnd, z0: number, bl: number): number {
  const s = Math.sin(bl), c = Math.cos(bl);
  const eps = 1e-12;
  if (end === 'short') return Math.abs(c) < eps ? Infinity : (z0 * s) / c;
  return Math.abs(s) < eps ? -Infinity : (-z0 * c) / s;
}

/** Shortest electrical length βl in (0, π) that gives input reactance x. */
export function stubLengthForX(end: StubEnd, z0: number, x: number): number {
  const a = Math.atan(x / z0);
  if (end === 'open') return Math.PI / 2 + a;
  return x >= 0 ? a : Math.PI + a;
}

/** Shortest electrical length βl in [0, π) of a stub with input susceptance b (stub admittance y0 = 1/z0). */
export function stubLengthForB(end: StubEnd, y0: number, b: number): number {
  // open: Y = j Y0 tan βl; short: Y = −j Y0 cot βl
  let bl = end === 'open' ? Math.atan(b / y0) : Math.PI / 2 + Math.atan(b / y0);
  if (bl < 0) bl += Math.PI;
  if (bl >= Math.PI) bl -= Math.PI;
  return bl;
}

export interface StubMatch {
  /** distance from the load to the stub, in wavelengths, and its electrical length βd */
  d: number;
  /** susceptance of the line at d that the stub cancels, S */
  b: number;
  /** stub length in wavelengths */
  l: number;
}

/**
 * Single-stub shunt tuning (Pozar §5.2): the stub sits where Re{Y(d)} = Y0 and cancels the
 * susceptance B there. With t = tan βd:
 * RL ≠ Z0: t = [XL ± √(RL((Z0 − RL)² + XL²)/Z0)] / (RL − Z0); RL = Z0: t = −XL/(2Z0);
 * B = [RL² t − (Z0 − XL t)(XL + Z0 t)] / (Z0 [RL² + (XL + Z0 t)²]).
 * The stub (impedance zs) supplies −B. Up to two solutions, shortest d first.
 */
export function singleStub(z0: number, zl: Cx, zs: number, end: StubEnd): StubMatch[] {
  const rl = zl.re, xl = zl.im;
  if (!(rl > 0 && z0 > 0 && zs > 0)) return [];
  const ts: number[] = [];
  if (Math.abs(rl - z0) <= 1e-12 * z0) {
    // RL = Z0: one root t = −XL/(2 Z0) plus the root t → ∞ (d = λ/4)
    if (xl === 0) return [{ d: 0, b: 0, l: end === 'open' ? 0 : 0.25 }];
    ts.push(-xl / (2 * z0), Infinity);
  } else {
    const r = Math.sqrt((rl * ((z0 - rl) ** 2 + xl * xl)) / z0);
    ts.push((xl + r) / (rl - z0), (xl - r) / (rl - z0));
  }
  const out: StubMatch[] = [];
  for (const t of ts) {
    const bd = t === Infinity ? Math.PI / 2 : t >= 0 ? Math.atan(t) : Math.PI + Math.atan(t);
    const y = cInv(lineZin(z0, zl, bd));
    const b = y.im;
    const l = stubLengthForB(end, 1 / zs, -b) / (2 * Math.PI);
    out.push({ d: bd / (2 * Math.PI), b, l });
  }
  out.sort((p, q) => p.d - q.d);
  return out;
}

/** Input admittance of the line + stub at f/f0 = fr for a single-stub design, load given at fr. */
export function stubMatchZin(z0: number, zlAtF: Cx, zs: number, end: StubEnd, m: StubMatch, fr: number): Cx {
  const zd = lineZin(z0, zlAtF, 2 * Math.PI * m.d * fr);
  const bl = 2 * Math.PI * m.l * fr;
  if (end === 'short' && Math.abs(Math.sin(bl)) < 1e-15) return cx(0); // short stub of zero (or λ/2) length shorts the line
  const ys = end === 'open' ? cx(0, Math.tan(bl) / zs) : cx(0, -Math.cos(bl) / (Math.sin(bl) * zs));
  return cInv(cAdd(cInv(zd), ys));
}
