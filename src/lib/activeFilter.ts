// Active low-pass and high-pass filters built from cascaded first- and second-order sections
// (TI SLOA088, "Op Amps for Everyone" chapter 16, Active Filter Design Techniques, T. Kugelstadt).
// Each section is 1 / (1 + a·s + b·s²) with s normalised to the corner fc (low-pass), or the same
// with s replaced by 1/s (high-pass). The coefficients a, b are computed here from the pole
// positions rather than copied: Butterworth and Chebyshev in closed form, Bessel from the roots of
// the Bessel polynomial. All are scaled so the overall gain is 3.0103 dB below the passband (DC for
// a low-pass) gain at fc, which is the normalisation of the TI tables 16-4 to 16-9.
// SI units throughout: Ω, F, Hz, s.
import { E_SERIES, type ESeries } from './electronics';

export type FilterResponse = 'butterworth' | 'bessel' | 'cheb05' | 'cheb1' | 'cheb2' | 'cheb3';
export type FilterKind = 'lowpass' | 'highpass';
export type FilterTopology = 'sallen-key' | 'mfb';
export type CapSeries = 'E6' | 'E12' | 'E24';

export const MAX_ORDER = 8;
export const RIPPLE_DB: Record<FilterResponse, number> = { butterworth: 0, bessel: 0, cheb05: 0.5, cheb1: 1, cheb2: 2, cheb3: 3 };
export const RESPONSE_LABEL: Record<FilterResponse, string> = {
  butterworth: 'Butterworth',
  bessel: 'Bessel',
  cheb05: 'Chebyshev 0.5 dB',
  cheb1: 'Chebyshev 1 dB',
  cheb2: 'Chebyshev 2 dB',
  cheb3: 'Chebyshev 3 dB',
};

/** One normalised section 1 / (1 + a s + b s²); b = 0 for a first-order section. */
export interface Coef {
  a: number;
  b: number;
}

/** Pole quality √b / a of a second-order section (0 for a first-order section). */
export const sectionQ = (c: Coef) => (c.b > 0 ? Math.sqrt(c.b) / c.a : 0);

/**
 * k = fci / fc of the TI tables: the −3.0103 dB frequency of the section on its own (relative to
 * its DC gain), as a multiple of the overall corner. For a high-pass section it is fc / fci.
 * From |A|² = 1 / ((1 − bΩ²)² + a²Ω²) = ½, a quadratic in Ω².
 */
export function sectionK(c: Coef): number {
  if (c.b === 0) return 1 / c.a;
  const p = c.a * c.a - 2 * c.b;
  const x = (-p + Math.sqrt(p * p + 4 * c.b * c.b)) / (2 * c.b * c.b);
  return Math.sqrt(x);
}

type Cx = [number, number];

/** Left-half-plane poles of the Chebyshev type I prototype, normalised to the ripple bandwidth. */
function chebyshevPoles(n: number, rippleDb: number): Cx[] {
  const eps = Math.sqrt(10 ** (rippleDb / 10) - 1);
  const mu = Math.asinh(1 / eps) / n;
  return Array.from({ length: n }, (_, i) => {
    const th = (Math.PI * (2 * i + 1)) / (2 * n);
    return [-Math.sinh(mu) * Math.sin(th), Math.cosh(mu) * Math.cos(th)] as Cx;
  });
}

/**
 * fc / (ripple-band edge) for a Chebyshev response: where the gain is 3.0103 dB below the DC gain.
 * Odd order: DC is a ripple peak, so ε²Tn²(Ω) = 1. Even order: DC is a ripple trough at
 * 1/√(1 + ε²), so 1 + ε²Tn²(Ω) = 2(1 + ε²). Above the ripple band Tn(Ω) = cosh(n·acosh Ω).
 */
export function chebyshevCornerRatio(n: number, rippleDb: number): number {
  const e2 = 10 ** (rippleDb / 10) - 1;
  const t = n % 2 ? 1 / Math.sqrt(e2) : Math.sqrt((1 + 2 * e2) / e2);
  return Math.cosh(Math.acosh(t) / n);
}

/** Factorial as a float (exact up to 18!). */
const fact = (k: number) => {
  let r = 1;
  for (let i = 2; i <= k; i++) r *= i;
  return r;
};

/**
 * Roots of the reverse Bessel polynomial θn(s) = Σ (2n − k)! / (2^(n−k) k! (n − k)!) s^k (poles of
 * the delay-normalised Bessel filter), by the Durand–Kerner iteration.
 */
export function besselPoles(n: number): Cx[] {
  const c = Array.from({ length: n + 1 }, (_, k) => fact(2 * n - k) / (2 ** (n - k) * fact(k) * fact(n - k)));
  const a = c.map((x) => x / c[n]); // monic
  const r0 = Math.abs(a[0]) ** (1 / n);
  let z: Cx[] = Array.from({ length: n }, (_, k) => [r0 * Math.cos((2 * Math.PI * k) / n + 0.4), r0 * Math.sin((2 * Math.PI * k) / n + 0.4)]);
  for (let it = 0; it < 500; it++) {
    let move = 0;
    z = z.map((zi, i) => {
      // p(zi) by Horner
      let pr = 1;
      let pi = 0;
      for (let k = n - 1; k >= 0; k--) {
        const nr = pr * zi[0] - pi * zi[1] + a[k];
        pi = pr * zi[1] + pi * zi[0];
        pr = nr;
      }
      let qr = 1;
      let qi = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const dr = zi[0] - z[j][0];
        const di = zi[1] - z[j][1];
        const nr = qr * dr - qi * di;
        qi = qr * di + qi * dr;
        qr = nr;
      }
      const d = qr * qr + qi * qi;
      const sr = (pr * qr + pi * qi) / d;
      const si = (pi * qr - pr * qi) / d;
      move = Math.max(move, Math.hypot(sr, si) / Math.max(1, Math.hypot(zi[0], zi[1])));
      return [zi[0] - sr, zi[1] - si];
    });
    if (move < 1e-15) break;
  }
  return z;
}

/** |H(jΩ)| / |H(0)| of an all-pole filter with these poles. */
function poleMagnitude(poles: Cx[], w: number): number {
  let m = 1;
  for (const [re, im] of poles) m *= Math.hypot(re, im) / Math.hypot(re, w - im);
  return m;
}

/** Group the poles (scaled by 1/k so fc becomes 1) into sections, ordered by rising Q as in the TI tables. */
function sectionsFromPoles(poles: Cx[], k: number): Coef[] {
  const out: Coef[] = [];
  for (const [re, im] of poles) {
    if (im < -1e-9) continue; // the conjugate of a pole already used
    const r = re / k;
    const i = im / k;
    if (Math.abs(i) < 1e-9) out.push({ a: -1 / r, b: 0 });
    else {
      const m2 = r * r + i * i;
      out.push({ a: (-2 * r) / m2, b: 1 / m2 });
    }
  }
  return out.sort((x, y) => sectionQ(x) - sectionQ(y));
}

const cache = new Map<string, Coef[]>();

/**
 * Section coefficients for a response and order (1…MAX_ORDER), first-order section first and the
 * second-order sections in order of rising Q (TI SLOA088 section 16.3, figure 16-11).
 */
export function filterCoefficients(response: FilterResponse, order: number): Coef[] {
  if (!Number.isInteger(order) || order < 1 || order > MAX_ORDER) throw new RangeError(`Order must be a whole number from 1 to ${MAX_ORDER}.`);
  if (!(response in RIPPLE_DB)) throw new RangeError('Unknown filter response.');
  const key = `${response}/${order}`;
  const hit = cache.get(key);
  if (hit) return hit.map((c) => ({ ...c }));
  let poles: Cx[];
  let k: number;
  if (response === 'butterworth') {
    poles = Array.from({ length: order }, (_, i) => {
      const th = (Math.PI * (2 * i + 1)) / (2 * order);
      return [-Math.sin(th), Math.cos(th)] as Cx;
    });
    k = 1;
  } else if (response === 'bessel') {
    poles = besselPoles(order);
    // magnitude falls monotonically: bisect for the −3.0103 dB frequency
    let lo = 1e-3;
    let hi = 1e3;
    for (let i = 0; i < 200; i++) {
      const mid = Math.sqrt(lo * hi);
      if (poleMagnitude(poles, mid) > Math.SQRT1_2) lo = mid;
      else hi = mid;
    }
    k = Math.sqrt(lo * hi);
  } else {
    const r = RIPPLE_DB[response];
    poles = chebyshevPoles(order, r);
    k = chebyshevCornerRatio(order, r);
  }
  const out = sectionsFromPoles(poles, k);
  cache.set(key, out);
  return out.map((c) => ({ ...c }));
}

/* ------------------------------------------------------------ transfer functions */

/**
 * A realised section H(s) = gain · s^m / (d0 + d1 s + d2 s²) with m = 0 (low-pass) or the section
 * order (high-pass). Absolute units: s in rad/s.
 */
export interface Stage {
  gain: number;
  m: number;
  d0: number;
  d1: number;
  d2: number;
}

export interface Point {
  mag: number; // |H|, V/V
  phase: number; // radians, continuous over frequency for a given cascade
  delay: number; // group delay, s
}

/** Exact response of a cascade at frequency f (Hz). */
export function cascadeAt(stages: readonly Stage[], f: number): Point {
  const w = 2 * Math.PI * f;
  let mag = 1;
  let phase = 0;
  let delay = 0;
  for (const s of stages) {
    const re = s.d0 - s.d2 * w * w;
    const im = s.d1 * w;
    mag *= (Math.abs(s.gain) * w ** s.m) / Math.hypot(re, im);
    phase += (s.m * Math.PI) / 2 - Math.atan2(im, re) - (s.gain < 0 ? Math.PI : 0);
    // −dφ/dω of 1 / (d0 + d1 jω − d2 ω²)
    delay += (s.d1 * (s.d0 + s.d2 * w * w)) / (re * re + im * im);
  }
  return { mag, phase, delay };
}

/** Passband gain magnitude of a cascade (DC for low-pass, f → ∞ for high-pass). */
export function passbandGain(stages: readonly Stage[], kind: FilterKind): number {
  return stages.reduce((g, s) => g * Math.abs(s.gain) * (kind === 'lowpass' ? 1 / s.d0 : s.d2 === 0 && s.m === 1 ? 1 / s.d1 : 1 / s.d2), 1);
}

/** Ideal stages for the target coefficients, corner fc and per-section signed gains. */
export function idealStages(coefs: readonly Coef[], kind: FilterKind, fc: number, gains: readonly number[]): Stage[] {
  const wc = 2 * Math.PI * fc;
  return coefs.map((c, i) => {
    const g = gains[i] ?? 1;
    if (kind === 'lowpass') return { gain: g, m: 0, d0: 1, d1: c.a / wc, d2: c.b / (wc * wc) };
    // 1 / (1 + a ωc/s + b ωc²/s²) = s² / (s² + a ωc s + b ωc²); first order: s / (s + a ωc)
    return c.b === 0 ? { gain: g, m: 1, d0: c.a * wc, d1: 1, d2: 0 } : { gain: g, m: 2, d0: c.b * wc * wc, d1: c.a * wc, d2: 1 };
  });
}

/** Natural frequency (Hz) and Q of a realised second-order section, or the corner of a first-order one. */
export function stageF0Q(s: Stage): { f0: number; q: number } {
  if (s.d2 === 0) return { f0: s.d0 / s.d1 / (2 * Math.PI), q: 0 };
  return { f0: Math.sqrt(s.d0 / s.d2) / (2 * Math.PI), q: Math.sqrt(s.d0 * s.d2) / s.d1 };
}

/**
 * Overall −3.0103 dB corner of a cascade relative to its passband gain: the highest frequency where
 * the low-pass gain is still ≥ passband/√2 (lowest for a high-pass), so ripple troughs inside the
 * passband are not mistaken for the corner. Searched over fGuess/100 … fGuess·100.
 */
export function cascadeCorner(stages: readonly Stage[], kind: FilterKind, fGuess: number): number {
  const ref = passbandGain(stages, kind) * Math.SQRT1_2;
  const lo = Math.log10(fGuess / 100);
  const hi = Math.log10(fGuess * 100);
  const N = 1200;
  const f = (i: number) => 10 ** (lo + ((hi - lo) * i) / N);
  const above = (x: number) => cascadeAt(stages, x).mag >= ref;
  let a = NaN;
  let b = NaN;
  if (kind === 'lowpass') {
    for (let i = N - 1; i >= 0; i--) if (above(f(i))) { a = f(i); b = f(i + 1); break; }
  } else {
    for (let i = 1; i <= N; i++) if (above(f(i))) { a = f(i); b = f(i - 1); break; }
  }
  if (!Number.isFinite(a)) return NaN;
  for (let i = 0; i < 80; i++) {
    const m = Math.sqrt(a * b);
    if (above(m)) a = m;
    else b = m;
  }
  return Math.sqrt(a * b);
}

/* ---------------------------------------------------------------- standard values */

/** IEC 60063 E6 (20 %) preferred numbers for the decade 100…999. */
export const E6 = [100, 150, 220, 330, 470, 680] as const;
const seriesList = (s: ESeries | CapSeries): readonly number[] => (s === 'E6' ? E6 : E_SERIES[s]);
const scale = (n: number, d: number) => (d >= 2 ? n * 10 ** (d - 2) : n / 10 ** (2 - d));

/** Largest preferred value ≤ x and smallest ≥ x for E6…E96 (same algorithm as electronics.ts eNeighbors). */
export function prefNeighbors(x: number, s: ESeries | CapSeries) {
  const list = seriesList(s);
  let d = Math.floor(Math.log10(x));
  if (scale(100, d) > x) d--;
  if (scale(100, d + 1) <= x) d++;
  let below = scale(list[0], d);
  let above = scale(100, d + 1);
  for (const n of list) {
    const v = scale(n, d);
    if (v <= x) below = v;
    if (v >= x) {
      above = v;
      break;
    }
  }
  return { below, above };
}

/** Nearest preferred value on a logarithmic scale. */
export function prefNearest(x: number, s: ESeries | CapSeries): number {
  const { below, above } = prefNeighbors(x, s);
  return x / below <= above / x ? below : above;
}

/** Smallest preferred value ≥ x (with a 1 ppm allowance so an exact value is kept). */
export const prefAtLeast = (x: number, s: ESeries | CapSeries) => prefNeighbors(x * (1 - 1e-6), s).above;

/* ---------------------------------------------------------------- section design */

export type SectionCircuit = 'lp1' | 'hp1' | 'lp-sk' | 'lp-mfb' | 'hp-sk' | 'hp-mfb';
export type Parts = Record<string, number>;

/** Transfer function of a section from its component values (TI SLOA088 figure numbers in the comments). */
export function stageFromParts(circuit: SectionCircuit, p: Parts): Stage {
  switch (circuit) {
    case 'lp1': // figure 16-14, unity-gain buffer
      return { gain: 1, m: 0, d0: 1, d1: p.R1 * p.C1, d2: 0 };
    case 'hp1': // figure 16-25 without R2/R3 (unity gain), as in example 16-4
      return { gain: 1, m: 1, d0: 1 / (p.R1 * p.C1), d1: 1, d2: 0 };
    case 'lp-sk': // figure 16-16: R1, R2 in series, C1 to ground at the + input, C2 output to R1/R2 node
      return { gain: 1, m: 0, d0: 1, d1: p.C1 * (p.R1 + p.R2), d2: p.R1 * p.R2 * p.C1 * p.C2 };
    case 'lp-mfb': // figure 16-19: R1 input, C2 to ground, R2 output feedback, R3 to − input, C1 output to − input
      return { gain: -p.R2 / p.R1, m: 0, d0: 1, d1: p.C1 * (p.R2 + p.R3 + (p.R2 * p.R3) / p.R1), d2: p.C1 * p.C2 * p.R2 * p.R3 };
    case 'hp-sk': // figure 16-28 (unequal C allowed): C1, C2 in series, R1 to ground at + input, R2 output feedback
      return { gain: 1, m: 2, d0: 1 / (p.R1 * p.R2 * p.C1 * p.C2), d1: (p.C1 + p.C2) / (p.R1 * p.C1 * p.C2), d2: 1 };
    case 'hp-mfb': // figure 16-29: C1 input, R2 to ground, C2 output feedback, C3 to − input, R1 output to − input
      return { gain: -p.C1 / p.C2, m: 2, d0: 1 / (p.C2 * p.C3 * p.R1 * p.R2), d1: (p.C1 + p.C2 + p.C3) / (p.C2 * p.C3 * p.R1), d2: 1 };
  }
}

export const circuitFor = (kind: FilterKind, topology: FilterTopology, firstOrder: boolean): SectionCircuit =>
  firstOrder ? (kind === 'lowpass' ? 'lp1' : 'hp1') : `${kind === 'lowpass' ? 'lp' : 'hp'}-${topology === 'mfb' ? 'mfb' : 'sk'}`;

/**
 * Minimum ratio C2/C1 for real resistor values: 4b/a² for the unity-gain Sallen-Key low-pass and
 * 4b(1 − A0)/a² for the MFB low-pass with A0 = −|gain| (TI SLOA088 section 16.3.2).
 */
export const minCapRatio = (c: Coef, circuit: SectionCircuit, gainMag = 1) => (circuit === 'lp-sk' ? (4 * c.b) / (c.a * c.a) : circuit === 'lp-mfb' ? (4 * c.b * (1 + gainMag)) / (c.a * c.a) : 0);

/**
 * Resistors for a section from the TI design equations, given the capacitors. `caps` holds C1 (and
 * C2 for the low-pass second-order circuits, C2 for the MFB high-pass). Returns the full part set
 * or throws when the capacitors cannot realise the section.
 */
export function designSection(c: Coef, circuit: SectionCircuit, fc: number, caps: Parts, gainMag = 1): Parts {
  const { C1 } = caps;
  if (!(fc > 0 && C1 > 0)) throw new RangeError('Corner frequency and capacitors must be greater than 0.');
  const pi = Math.PI;
  switch (circuit) {
    case 'lp1':
      return { C1, R1: c.a / (2 * pi * fc * C1) };
    case 'hp1':
      return { C1, R1: 1 / (2 * pi * fc * c.a * C1) };
    case 'lp-sk': {
      const { C2 } = caps;
      const disc = c.a * c.a * C2 * C2 - 4 * c.b * C1 * C2;
      if (!(disc >= -1e-12 * c.a * c.a * C2 * C2)) throw new RangeError('C2 is below C1·4b/a²; no real resistor values exist.');
      const root = Math.sqrt(Math.max(0, disc));
      const den = 4 * pi * fc * C1 * C2;
      return { C1, C2, R1: (c.a * C2 - root) / den, R2: (c.a * C2 + root) / den };
    }
    case 'lp-mfb': {
      const { C2 } = caps;
      const a0 = -gainMag;
      const disc = c.a * c.a * C2 * C2 - 4 * c.b * C1 * C2 * (1 - a0);
      if (!(disc >= -1e-12 * c.a * c.a * C2 * C2)) throw new RangeError('C2 is below C1·4b(1 − A0)/a²; no real resistor values exist.');
      const R2 = (c.a * C2 - Math.sqrt(Math.max(0, disc))) / (4 * pi * fc * C1 * C2);
      if (!(R2 > 0)) throw new RangeError('No positive R2 exists for these capacitors.');
      return { C1, C2, R1: R2 / -a0, R2, R3: c.b / (4 * pi * pi * fc * fc * C1 * C2 * R2) };
    }
    case 'hp-sk':
      // C1 = C2 = C
      return { C1, C2: C1, R1: 1 / (pi * fc * C1 * c.a), R2: c.a / (4 * pi * fc * C1 * c.b) };
    case 'hp-mfb': {
      // C1 = C3 = C, gain A∞ = −C/C2
      const C2 = caps.C2 ?? C1 / gainMag;
      const aInf = -C1 / C2;
      return { C1, C2, C3: C1, R1: (1 - 2 * aInf) / (2 * pi * fc * C1 * c.a), R2: c.a / (2 * pi * fc * c.b * C2 * (1 - 2 * aInf)) };
    }
  }
}

/* ---------------------------------------------------------------- op amp checks */

/**
 * Op amp unity-gain bandwidth needed by one section, TI SLOA088 section 16.8.4 (A_OL 40 dB above
 * the section's peak gain): first order 100·G·fc, second order with Q ≤ 1 100·G·fc·k, with Q > 1
 * 100·G·(fc/a)·√((Q² − 0.5)/(Q² − 0.25)). For a first-order section in a higher-order filter the
 * section's own corner k·fc = fc/a is used. Low-pass sections only.
 */
export function requiredGbw(c: Coef, fc: number, gainMag: number): number {
  const q = sectionQ(c);
  if (c.b === 0) return 100 * gainMag * fc * sectionK(c);
  if (q <= 1) return 100 * gainMag * fc * sectionK(c);
  return ((100 * gainMag * fc) / c.a) * Math.sqrt((q * q - 0.5) / (q * q - 0.25));
}

/** Minimum slew rate for full-power output at fc, SR = π · Vpp · fc (TI SLOA088 section 16.8.4). V/s. */
export const requiredSlewRate = (vpp: number, fc: number) => Math.PI * vpp * fc;

/** Peak gain of a second-order low-pass section relative to its DC gain, Q²/√(Q² − ¼) for Q > 1/√2. */
export const sectionPeak = (q: number) => (q > Math.SQRT1_2 ? (q * q) / Math.sqrt(q * q - 0.25) : 1);

/**
 * MFB high-pass gain is C1/C2 with both from a capacitor series. Among the series values within √10
 * of the target C1, pick the one whose nearest-value C2 = C1/|A| gives the gain closest to |A|
 * (ties: closest to the target C1).
 */
export function mfbHighPassC(target: number, gainMag: number, s: CapSeries): number {
  const list = seriesList(s);
  let best = prefNearest(target, s);
  let bestErr = Infinity;
  let bestOff = Infinity;
  const d0 = Math.floor(Math.log10(target)) - 1;
  for (let d = d0; d <= d0 + 2; d++)
    for (const n of list) {
      const c = scale(n, d);
      const off = Math.abs(Math.log(c / target));
      if (off > Math.log(Math.sqrt(10)) + 1e-9) continue;
      const err = Math.abs(Math.log(c / prefNearest(c / gainMag, s) / gainMag));
      if (err < bestErr - 1e-12 || (Math.abs(err - bestErr) <= 1e-12 && off < bestOff)) {
        best = c;
        bestErr = err;
        bestOff = off;
      }
    }
  return best;
}

/* ---------------------------------------------------------------- full design */

export interface FilterInput {
  kind: FilterKind;
  response: FilterResponse;
  order: number;
  fc: number;
  topology: FilterTopology;
  /** |gain| of each MFB second-order section (Sallen-Key and first-order sections are unity gain). */
  mfbGain: number;
  /** 'auto': capacitors from the resistance level; 'fixed': the given capacitor as C1 of every section. */
  capMode: 'auto' | 'fixed';
  rLevel: number;
  cFixed: number;
  rSeries: ESeries;
  cSeries: CapSeries;
}

export interface SectionDesign {
  index: number;
  coef: Coef;
  q: number;
  k: number;
  circuit: SectionCircuit;
  gainMag: number;
  /** resistors calculated for the chosen (standard) capacitors */
  exact: Parts;
  /** capacitors as chosen and resistors rounded to the resistor series */
  std: Parts;
  ideal: Stage;
  real: Stage;
  /** target section frequency (fc/√b, fc/a for first order; fc·√b, fc·a high-pass) and the realised one */
  f0: number;
  f0Real: number;
  qReal: number;
  capRatio: number;
  minRatio: number;
  gbw: number | null;
}

export interface FilterDesign {
  sections: SectionDesign[];
  ideal: Stage[];
  real: Stage[];
  fcReal: number;
  gainIdeal: number;
  gainReal: number;
}

/** Design every section: choose capacitors, compute resistors with the TI equations, round to standard values. */
export function designFilter(i: FilterInput): FilterDesign {
  if (!(i.fc > 0 && Number.isFinite(i.fc))) throw new RangeError('Corner frequency must be greater than 0.');
  if (i.topology === 'mfb' && !(i.mfbGain > 0 && Number.isFinite(i.mfbGain))) throw new RangeError('MFB section gain must be greater than 0.');
  if (i.capMode === 'auto' ? !(i.rLevel > 0) : !(i.cFixed > 0)) throw new RangeError(i.capMode === 'auto' ? 'Resistance level must be greater than 0.' : 'Capacitor must be greater than 0.');
  const coefs = filterCoefficients(i.response, i.order);
  const wc = 2 * Math.PI * i.fc;
  const sections = coefs.map((c, index): SectionDesign => {
    const first = c.b === 0;
    const circuit = circuitFor(i.kind, i.topology, first);
    const gainMag = circuit === 'lp-mfb' || circuit === 'hp-mfb' ? i.mfbGain : 1;
    const sign = circuit === 'lp-mfb' || circuit === 'hp-mfb' ? -1 : 1;
    // natural angular frequency of the section
    const w0 = i.kind === 'lowpass' ? (first ? wc / c.a : wc / Math.sqrt(c.b)) : first ? wc * c.a : wc * Math.sqrt(c.b);
    const minRatio = minCapRatio(c, circuit, gainMag);
    // capacitor ratio m = C2/C1 the section will use; choosing C1 = 1/(ω0 R0 √m) puts the geometric
    // mean of the two resistors that set ω0 (R1R2, R2R3 or R1R2 = 1/(ω0² C·C′)) near R0
    const m = minRatio > 0 ? minRatio : circuit === 'hp-mfb' ? 1 / gainMag : 1;
    let C1 = i.capMode === 'auto' ? prefNearest(1 / (w0 * i.rLevel * Math.sqrt(m)), i.cSeries) : i.cFixed;
    if (i.capMode === 'auto' && circuit === 'hp-mfb' && gainMag !== 1) C1 = mfbHighPassC(1 / (w0 * i.rLevel * Math.sqrt(m)), gainMag, i.cSeries);
    const caps: Parts = { C1 };
    if (circuit === 'lp-sk' || circuit === 'lp-mfb') caps.C2 = prefAtLeast(C1 * minRatio, i.cSeries);
    if (circuit === 'hp-mfb') caps.C2 = gainMag === 1 ? C1 : prefNearest(C1 / gainMag, i.cSeries);
    const exact = designSection(c, circuit, i.fc, caps, gainMag);
    const std: Parts = {};
    for (const [name, v] of Object.entries(exact)) std[name] = name.startsWith('R') ? prefNearest(v, i.rSeries) : v;
    const real = stageFromParts(circuit, std);
    const ideal = idealStages([c], i.kind, i.fc, [sign * gainMag])[0];
    const r = stageF0Q(real);
    return {
      index,
      coef: c,
      q: sectionQ(c),
      k: sectionK(c),
      circuit,
      gainMag,
      exact,
      std,
      ideal,
      real,
      f0: w0 / (2 * Math.PI),
      f0Real: r.f0,
      qReal: r.q,
      capRatio: caps.C2 !== undefined ? caps.C2 / C1 : 1,
      minRatio,
      gbw: i.kind === 'lowpass' ? requiredGbw(c, i.fc, gainMag) : null,
    };
  });
  const ideal = sections.map((s) => s.ideal);
  const real = sections.map((s) => s.real);
  return {
    sections,
    ideal,
    real,
    fcReal: cascadeCorner(real, i.kind, i.fc),
    gainIdeal: passbandGain(ideal, i.kind),
    gainReal: passbandGain(real, i.kind),
  };
}
