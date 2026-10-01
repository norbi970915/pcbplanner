// Phase noise → RMS phase jitter, jitter-limited ADC SNR and a serial-link jitter budget.
//
// Integration follows ADI MT-008: the SSB phase noise L(f) is taken as straight lines between the
// given points on the log-log plot, each segment is integrated on its own and the areas are added.
// A straight line in dBc/Hz against log f is a power law, L(f) = L1 · (f / f1)^b, so every segment
// integrates exactly in closed form; b = −1 (−10 dB/decade) gives a logarithm instead.
// SI units: Hz, s, rad. Phase noise in dBc/Hz, integrated noise in dBc.
import { si } from './units';

export interface PnPoint {
  f: number; // offset frequency, Hz
  l: number; // SSB phase noise L(f), dBc/Hz
}

/** ∫ from fa to fb of l1 · (f / f1)^b df, exact for any exponent b (fa, fb, f1 > 0). */
export function powerLawArea(l1: number, f1: number, b: number, fa: number, fb: number): number {
  if (!(fb > fa)) return 0;
  const c = b + 1;
  const la = l1 * (fa / f1) ** b; // level at fa
  const r = Math.log(fb / fa);
  // (r^c − 1)/c written with expm1 so slopes close to −10 dB/decade lose no precision
  const g = Math.abs(c) < 1e-12 ? r : Math.expm1(c * r) / c;
  return la * fa * g;
}

/** Exponent b of the power law through two points: slope in dB/decade divided by 10. */
export const slopeExponent = (p: PnPoint, q: PnPoint) => (q.l - p.l) / (10 * Math.log10(q.f / p.f));
export const slopeDbPerDecade = (p: PnPoint, q: PnPoint) => (q.l - p.l) / Math.log10(q.f / p.f);

export interface Segment {
  f1: number; // integrated range of this segment
  f2: number;
  l1: number; // L(f) at f1 and f2, dBc/Hz
  l2: number;
  slope: number; // dB/decade
  extended: boolean; // flat extension beyond the last point
  area: number; // ∫ L(f) df over the range, linear (rad² / 2)
  areaDbc: number;
  jitter: number; // RMS jitter of this segment alone, s
  share: number; // share of the total area, 0…1
}

export interface PhaseJitter {
  points: PnPoint[]; // sorted
  segments: Segment[];
  area: number; // ∫ L(f) df, linear
  dbc: number; // integrated phase noise A, dBc
  rad: number; // RMS phase jitter, rad
  seconds: number; // RMS phase jitter, s
  extended: boolean; // true when the band reached beyond the last point and the last level was held
}

export type JitterResult = { ok: true; value: PhaseJitter } | { ok: false; error: string };

/** RMS phase jitter in radians from the integrated SSB phase noise A in dBc: √(2 · 10^(A/10)). */
export const phaseJitterRad = (dbc: number) => Math.sqrt(2 * 10 ** (dbc / 10));
/** RMS jitter in seconds: the phase jitter divided by 2π fc. */
export const phaseJitterSeconds = (dbc: number, fc: number) => phaseJitterRad(dbc) / (2 * Math.PI * fc);

/** Sorted copy; returns an error text for invalid or duplicated points. */
export function sortPoints(points: readonly PnPoint[]): { points: PnPoint[]; error?: string } {
  for (const p of points) {
    if (!(Number.isFinite(p.f) && p.f > 0)) return { points: [], error: 'Every offset frequency must be a number greater than 0.' };
    if (!Number.isFinite(p.l)) return { points: [], error: 'Every phase noise level must be a number (dBc/Hz).' };
  }
  const sorted = [...points].sort((a, b) => a.f - b.f);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].f === sorted[i - 1].f) return { points: [], error: `Two points share the offset ${si(sorted[i].f, 'Hz', 6)}; remove one of them.` };
  }
  return { points: sorted };
}

/**
 * Integrate L(f) from fLow to fHigh and convert it to RMS phase jitter at carrier fc.
 * The points need not be sorted. Below the first point nothing is assumed: fLow must not be lower.
 * Above the last point the last level is held flat only when `extendFlat` is set (a measured
 * noise floor extended to the band edge, as in Skyworks AN279); otherwise fHigh must not be higher.
 */
export function integratePhaseNoise(input: readonly PnPoint[], fc: number, fLow: number, fHigh: number, extendFlat = false): JitterResult {
  if (!(fc > 0)) return { ok: false, error: 'Carrier frequency must be greater than 0.' };
  if (!(fLow > 0 && fHigh > 0)) return { ok: false, error: 'Integration limits must be greater than 0.' };
  if (!(fHigh > fLow)) return { ok: false, error: 'The upper integration limit must be above the lower one.' };
  const s = sortPoints(input);
  if (s.error) return { ok: false, error: s.error };
  const pts = s.points;
  if (pts.length < 2) return { ok: false, error: 'Enter at least two phase noise points: a single point does not define a curve.' };
  const first = pts[0].f;
  const last = pts[pts.length - 1].f;
  // relative tolerance so that a limit typed as the same number as a point counts as inside
  const eps = 1e-9;
  if (fLow < first * (1 - eps)) return { ok: false, error: `The lower limit is below the first point (${si(first, 'Hz', 4)}). Add a point at or below the lower limit; the curve is not extrapolated towards the carrier.` };
  if (fHigh > last * (1 + eps) && !extendFlat) {
    return { ok: false, error: `The upper limit is above the last point (${si(last, 'Hz', 4)}). Add a point at or above it, or allow the last level to be extended flat.` };
  }
  if (fLow >= last) return { ok: false, error: 'The integration band lies entirely above the last point.' };

  const segments: Segment[] = [];
  const level = (p: PnPoint, q: PnPoint, f: number) => p.l + slopeDbPerDecade(p, q) * Math.log10(f / p.f);
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    const a = Math.max(p.f, fLow);
    const b = Math.min(q.f, fHigh);
    if (!(b > a)) continue;
    const exp = slopeExponent(p, q);
    const area = powerLawArea(10 ** (p.l / 10), p.f, exp, a, b);
    segments.push({ f1: a, f2: b, l1: level(p, q, a), l2: level(p, q, b), slope: slopeDbPerDecade(p, q), extended: false, area, areaDbc: 0, jitter: 0, share: 0 });
  }
  const extended = fHigh > last;
  if (extended) {
    const lv = pts[pts.length - 1].l;
    const a = Math.max(last, fLow);
    segments.push({ f1: a, f2: fHigh, l1: lv, l2: lv, slope: 0, extended: true, area: 10 ** (lv / 10) * (fHigh - a), areaDbc: 0, jitter: 0, share: 0 });
  }
  const area = segments.reduce((t, g) => t + g.area, 0);
  if (!(area > 0) || !Number.isFinite(area)) return { ok: false, error: 'The integrated phase noise is not a finite positive number; check the points.' };
  for (const g of segments) {
    g.areaDbc = 10 * Math.log10(g.area);
    g.jitter = Math.sqrt(2 * g.area) / (2 * Math.PI * fc);
    g.share = g.area / area;
  }
  const dbc = 10 * Math.log10(area);
  return { ok: true, value: { points: pts, segments, area, dbc, rad: phaseJitterRad(dbc), seconds: phaseJitterSeconds(dbc, fc), extended } };
}

/* ---------------------------------------------------------------- URL encoding */

const num = (v: number, digits: number) => {
  const n = Number(v.toPrecision(digits));
  const plain = String(n);
  const exp = n.toExponential().replace('e+', 'e');
  return exp.length < plain.length ? exp : plain;
};

/** "1e3:-90,1e4:-110" — compact form of a point list for one URL parameter. */
export const encodePoints = (points: readonly PnPoint[]) => points.map((p) => `${num(p.f, 7)}:${num(p.l, 6)}`).join(',');

/** Inverse of encodePoints; null when the text is not a valid list. Order is kept. */
export function decodePoints(text: string): PnPoint[] | null {
  if (!text.trim()) return [];
  const out: PnPoint[] = [];
  for (const item of text.split(',')) {
    const [fs, ls, extra] = item.split(':');
    if (extra !== undefined || fs === undefined || ls === undefined || !fs.trim() || !ls.trim()) return null;
    const f = Number(fs);
    const l = Number(ls);
    if (!Number.isFinite(f) || !Number.isFinite(l)) return null;
    out.push({ f, l });
  }
  return out;
}

/* ---------------------------------------------------------------- text input */

/**
 * Frequency typed by the user: "12k", "1.5 MHz", "2e7", "100 Hz". k/K = 10³, M = 10⁶, G = 10⁹.
 * A lower-case m is rejected because it would mean milli and is usually a typo for M.
 */
export function parseFrequency(text: string): number | null {
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*([kKMG]?)\s*(?:hz|Hz|HZ)?\s*$/.exec(text);
  if (!m) return null;
  const mult = m[2] === 'k' || m[2] === 'K' ? 1e3 : m[2] === 'M' ? 1e6 : m[2] === 'G' ? 1e9 : 1;
  const v = Number(m[1]) * mult;
  return Number.isFinite(v) ? v : null;
}

/** Level in dBc/Hz: a plain number, optionally followed by "dBc/Hz". */
export function parseLevel(text: string): number | null {
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(?:dBc(?:\/Hz)?)?\s*$/i.exec(text);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

/** Pasted "offset, dBc/Hz" lines (comma, semicolon, tab or space separated). Empty lines are skipped. */
export function parsePastedPoints(text: string): { points: PnPoint[]; errors: string[] } {
  const points: PnPoint[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const parts = line.split(/\s*[,;\t]\s*|\s+(?=[+-]?\d)/).filter((s) => s !== '');
    const f = parts.length === 2 ? parseFrequency(parts[0]) : null;
    const l = parts.length === 2 ? parseLevel(parts[1]) : null;
    if (f === null || l === null || !(f > 0)) errors.push(`Line ${i + 1} (“${line}”) is not “offset, dBc/Hz”.`);
    else points.push({ f, l });
  });
  return { points, errors };
}

/* ---------------------------------------------------------------- ADC SNR */

/** Jitter-limited SNR of a full-scale sine at fin: −20 log10(2π fin σ) (MT-008 Eq. 1). */
export const jitterSnrDb = (fin: number, sigma: number) => -20 * Math.log10(2 * Math.PI * fin * sigma);
/** RMS jitter that limits the SNR to snrDb at fin. */
export const jitterForSnr = (fin: number, snrDb: number) => 10 ** (-snrDb / 20) / (2 * Math.PI * fin);
/** Number of bits an ideal ADC needs for this SNR: (SNR − 1.76 dB) / 6.02 dB (MT-001). */
export const enobFromSnr = (snrDb: number) => (snrDb - 1.76) / 6.02;
export const snrFromEnob = (bits: number) => 6.02 * bits + 1.76;
/** Two independent noise contributions given as SNRs in dB, combined on a power basis (TI SLWA034). */
export const combineSnrDb = (a: number, b: number) => -10 * Math.log10(10 ** (-a / 10) + 10 ** (-b / 10));
/** Root-sum-square of independent RMS terms. */
export const rss = (values: readonly number[]) => Math.sqrt(values.reduce((t, v) => t + v * v, 0));

/* ---------------------------------------------------------------- jitter budget */

/** erfc(x) for x ≥ 0: Maclaurin series of erf below 2, Laplace continued fraction above. */
function erfc(x: number): number {
  if (x < 0) return 2 - erfc(-x);
  if (x < 2) {
    let term = x;
    let sum = x;
    for (let n = 1; n < 200; n++) {
      term *= (-x * x) / n;
      const t = term / (2 * n + 1);
      sum += t;
      if (Math.abs(t) < 1e-17 * Math.abs(sum)) break;
    }
    return 1 - (2 / Math.sqrt(Math.PI)) * sum;
  }
  // erfc(x) = e^(−x²)/√π · 1/(x + (1/2)/(x + 1/(x + (3/2)/(x + 2/(x + …))))), evaluated bottom-up
  let cf = x;
  for (let k = 120; k >= 1; k--) cf = x + k / 2 / cf;
  return Math.exp(-x * x) / (Math.sqrt(Math.PI) * cf);
}

/** Gaussian upper tail: probability that a standard normal variable exceeds q. */
export const gaussTail = (q: number) => 0.5 * erfc(q / Math.SQRT2);

/**
 * Q for a bit error ratio: the q with ½ erfc(q / √2) = BER, i.e. the inverse complementary error
 * function scaled by √2. Peak-to-peak random jitter at that BER is 2 Q · RJrms (Renesas AN-815 Table 1).
 */
export function qFromBer(ber: number): number {
  if (!(ber > 0 && ber < 0.5)) return NaN;
  const target = Math.log(ber);
  let lo = 0;
  let hi = 40;
  for (let i = 0; i < 200 && hi - lo > 1e-14; i++) {
    const mid = (lo + hi) / 2;
    if (Math.log(gaussTail(mid)) > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export interface JitterBudget {
  rj: number; // RSS of the random terms, RMS
  dj: number; // sum of the deterministic terms, peak-to-peak
  q: number;
  rjPp: number; // 2 Q · RJ
  tj: number; // DJ + 2 Q RJ
}

/** Total jitter at a BER: random terms add as RSS, deterministic terms linearly, TJ = DJ + 2 Q RJ. */
export function jitterBudget(rjTerms: readonly number[], djTerms: readonly number[], ber: number): JitterBudget {
  const rj = rss(rjTerms);
  const dj = djTerms.reduce((t, v) => t + v, 0);
  const q = qFromBer(ber);
  return { rj, dj, q, rjPp: 2 * q * rj, tj: dj + 2 * q * rj };
}

/** Comma- or space-separated list of non-negative numbers; null when any entry is not one. */
export function parseList(text: string): number[] | null {
  const parts = text.split(/[\s,;]+/).filter((s) => s !== '');
  const out: number[] = [];
  for (const s of parts) {
    const v = Number(s);
    if (!Number.isFinite(v) || v < 0) return null;
    out.push(v);
  }
  return out;
}
