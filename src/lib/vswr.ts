// Reflection, standing-wave ratio and mismatch between ports, after D. M. Pozar, Microwave Engineering,
// 4th ed., Wiley 2012: §2.3 (Γ = (ZL − Z0)/(ZL + Z0), SWR = (1 + |Γ|)/(1 − |Γ|), RL = −20 log|Γ|),
// §2.6 and §12.1 (power delivered between a mismatched source and load, transducer gain).
// Every result is computed from |Γ| and 1 − |Γ|², and 1 − |Γ|² is formed without cancellation from
// whichever quantity was entered, so values near a perfect match and near total reflection stay exact.

export type Quantity = 'vswr' | 'gamma' | 'rl' | 'ml' | 'reflected' | 'transmitted';

export interface Match {
  /** reflection coefficient magnitude |Γ|, 0…1 */
  gamma: number;
  /** voltage standing-wave ratio, 1…∞ */
  vswr: number;
  /** return loss, dB, −20 log10 |Γ| (∞ for a perfect match) */
  rl: number;
  /** mismatch loss, dB, −10 log10 (1 − |Γ|²) (∞ for total reflection) */
  ml: number;
  /** reflected power as a fraction of incident power, |Γ|² */
  reflected: number;
  /** power delivered to the load as a fraction of incident power, 1 − |Γ|² */
  transmitted: number;
}

const LN10 = Math.LN10;

/** Build every quantity from |Γ| and t = 1 − |Γ|² (both already accurate). */
function build(g: number, t: number, given: Partial<Match> = {}): Match {
  return {
    gamma: g,
    vswr: given.vswr ?? (t > 0 ? ((1 + g) * (1 + g)) / t : Infinity), // (1 + g)/(1 − g) with 1 − g = t/(1 + g)
    rl: given.rl ?? (g > 0 ? 0 - 20 * Math.log10(g) : Infinity), // 0 − … turns −0 into 0 at |Γ| = 1
    ml: given.ml ?? (t > 0 ? 0 - 10 * Math.log10(t) : Infinity),
    reflected: g * g,
    transmitted: t,
  };
}

/** Why a value cannot be used for a quantity, or null when it is valid. Return and mismatch loss must already be ≥ 0 here. */
export function quantityError(q: Quantity, v: number): string | null {
  if (!Number.isFinite(v)) return 'Enter a number.';
  switch (q) {
    case 'vswr':
      return v >= 1 ? null : 'VSWR must be 1 or more (1 is a perfect match).';
    case 'gamma':
      return v >= 0 && v <= 1 ? null : 'The reflection coefficient magnitude |Γ| must be between 0 and 1 for a passive load.';
    case 'rl':
      return v >= 0 ? null : 'Return loss must be 0 dB or more.';
    case 'ml':
      return v >= 0 ? null : 'Mismatch loss must be 0 dB or more.';
    case 'reflected':
    case 'transmitted':
      return v >= 0 && v <= 1 ? null : 'Power fractions must be between 0 and 100 %.';
  }
}

/**
 * All match quantities from one of them. Powers are fractions (0…1), losses in dB (≥ 0).
 * Returns null for an invalid value (see quantityError).
 */
export function matchFrom(q: Quantity, v: number): Match | null {
  if (quantityError(q, v)) return null;
  switch (q) {
    case 'vswr':
      return build((v - 1) / (v + 1), (4 * v) / (v + 1) / (v + 1), { vswr: v });
    case 'gamma':
      return build(v, (1 - v) * (1 + v));
    case 'rl':
      // |Γ| = 10^(−RL/20); 1 − |Γ|² = −expm1(−RL ln10 / 10) keeps precision at high RL
      return build(10 ** (-v / 20), Math.max(0, -Math.expm1((-v * LN10) / 10)), { rl: v });
    case 'ml': {
      // 1 − |Γ|² = 10^(−ML/10); |Γ|² = −expm1(−ML ln10 / 10) keeps precision at small ML
      return build(Math.sqrt(Math.max(0, -Math.expm1((-v * LN10) / 10))), 10 ** (-v / 10), { ml: v });
    }
    case 'reflected':
      return build(Math.sqrt(v), 1 - v);
    case 'transmitted':
      return build(Math.sqrt(1 - v), v);
  }
}

/** The value of one quantity in a Match, in the units matchFrom takes. */
export function quantityOf(m: Match, q: Quantity): number {
  return q === 'vswr' ? m.vswr : q === 'gamma' ? m.gamma : q === 'rl' ? m.rl : q === 'ml' ? m.ml : q === 'reflected' ? m.reflected : m.transmitted;
}

export interface LoadMatch extends Match {
  /** complex Γ */
  re: number;
  im: number;
  /** angle of Γ in degrees, −180…180; NaN when |Γ| = 0 */
  angleDeg: number;
  /** load admittance Y = 1/ZL = G + jB in siemens; Infinity for a short circuit (ZL = 0) */
  g: number;
  b: number;
}

/**
 * Γ of a load ZL = R + jX on a line of real impedance Z0 (Pozar §2.3). R must be ≥ 0 (passive).
 * 1 − |Γ|² = 4 R Z0 / |ZL + Z0|² exactly, so a nearly lossless reactive load still gives an accurate ML.
 */
export function fromImpedance(r: number, x: number, z0: number): LoadMatch | null {
  if (!(Number.isFinite(r) && Number.isFinite(x) && z0 > 0 && Number.isFinite(z0) && r >= 0)) return null;
  const den = (r + z0) * (r + z0) + x * x;
  const re = (r * r - z0 * z0 + x * x) / den;
  const im = (2 * x * z0) / den;
  const gamma = Math.min(1, Math.hypot(re, im));
  const t = (4 * r * z0) / den;
  const mag2 = r * r + x * x;
  const y = mag2 > 0 ? { g: r / mag2, b: -x / mag2 } : { g: Infinity, b: Infinity };
  return { ...build(gamma, t), re, im, angleDeg: gamma > 0 ? (Math.atan2(im, re) * 180) / Math.PI : NaN, ...y };
}

export interface MismatchBounds {
  /** |Γs| |Γl| */
  product: number;
  /** power into the load relative to the same load fed from a Z0 source, dB: 1/|1 − ΓsΓl|² between its limits */
  powerMinDb: number;
  powerMaxDb: number;
  /** total mismatch loss between the source's available power and the load, dB */
  lossMinDb: number;
  lossMaxDb: number;
}

/**
 * Limits over the unknown phase of Γs Γl (Pozar §12.1 transducer gain of a matched through, S21 = 1):
 *   P_L / P_avs = (1 − |Γs|²)(1 − |Γl|²) / |1 − Γs Γl|²,  1 − |Γs||Γl| ≤ |1 − Γs Γl| ≤ 1 + |Γs||Γl|.
 */
export function mismatchBounds(source: Match, load: Match): MismatchBounds {
  const p = source.gamma * load.gamma;
  const powerMinDb = -20 * Math.log10(1 + p);
  const powerMaxDb = p < 1 ? -20 * Math.log10(1 - p) : Infinity;
  const base = source.ml + load.ml; // −10 log((1 − |Γs|²)(1 − |Γl|²))
  if (!Number.isFinite(base)) return { product: p, powerMinDb, powerMaxDb, lossMinDb: Infinity, lossMaxDb: Infinity };
  return { product: p, powerMinDb, powerMaxDb, lossMinDb: base + 20 * Math.log10(1 - p), lossMaxDb: base + 20 * Math.log10(1 + p) };
}

export interface CascadeBounds {
  vswrMin: number;
  vswrMax: number;
  gammaMin: number;
  gammaMax: number;
}

/**
 * Resultant VSWR of a mismatch S2 seen through a lossless mismatch S1 at unknown phase: S1·S2 at most and
 * max(S1,S2)/min(S1,S2) at least. In |Γ|: (|Γ1| ± |Γ2|)/(1 ± |Γ1||Γ2|), the extremes of the bilinear map
 * Γin = (Γ1 + Γ2 e^jθ)/(1 + Γ1 Γ2 e^jθ) of an impedance step or any lossless two-port.
 */
export function cascadeBounds(a: Match, b: Match): CascadeBounds {
  const hi = Math.max(a.vswr, b.vswr);
  const lo = Math.min(a.vswr, b.vswr);
  if (hi === Infinity) return { vswrMin: Infinity, vswrMax: Infinity, gammaMin: 1, gammaMax: 1 };
  const g1 = a.gamma, g2 = b.gamma;
  return { vswrMin: hi / lo, vswrMax: hi * lo, gammaMin: Math.abs(g1 - g2) / (1 - g1 * g2), gammaMax: (g1 + g2) / (1 + g1 * g2) };
}

/** VSWR values for the quick-reference table. */
export const VSWR_TABLE = [1, 1.02, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3, 1.4, 1.5, 1.75, 2, 2.5, 3, 4, 5, 10] as const;
