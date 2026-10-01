// Voltage-feedback op amp gain stages: inverting, non-inverting, four-resistor difference amplifier
// and inverting summer, with the effects of a real op amp. Sources:
//   ADI MT-033 (noise gain, closed-loop gain with finite A_VOL, gain-bandwidth product),
//   TI SLOD006B "Op Amps for Everyone" chapter 6 (inverting gain with finite open-loop gain),
//   ADI MT-037 / MT-038 (offset voltage and bias current reflected to the output, R3 = R1 ∥ R2),
//   ADI MT-049 / MT-048 (output noise of the single-pole system, noise bandwidth 1.57 fCL),
//   ADI MT-068 (difference amplifier common-mode rejection with resistor tolerance),
//   TI SLOA088 section 16.8.4 (slew rate for full-power output, SR = π Vpp f).
// SI units: Ω, V, A, Hz, V/s, V/√Hz, A/√Hz.
import { eNeighbors, eNearest, eValuesInRange, type ESeries } from './electronics';

export type Topology = 'inverting' | 'noninverting' | 'difference' | 'summing';

/** Boltzmann constant, J/K (SI 2019 exact value). */
export const K_BOLTZMANN = 1.380649e-23;

const par = (...r: number[]) => 1 / r.reduce((s, x) => s + 1 / x, 0);

/**
 * Resistors by topology (keys as stored in the URL):
 *  inverting / non-inverting: r1 = input (ground) resistor, r2 = feedback resistor Rf.
 *  difference (MT-068 figure 1): r1 = R1, r2 = R2 (inverting side), r3 = R1′, r4 = R2′ (to REF).
 *  summing: r2 = Rf, inputs r1, r3, r4 (0 = input not used).
 * rs = source resistance in series with the + input (non-inverting only); rcomp = resistor from
 * the + input to Vref (inverting / summing) or added in series with the source (non-inverting).
 */
export interface Circuit {
  topology: Topology;
  r1: number;
  r2: number;
  r3: number;
  r4: number;
  rs: number;
  rcomp: number;
}

export interface Term {
  name: string;
  k: number; // V/V from this input to the output
}

export interface Gains {
  /** inputs and their gains; for the difference amplifier the differential and common-mode gains */
  terms: Term[];
  /** gain from Vref to the output */
  kRef: number;
  /** the headline signal gain (first term) */
  signal: number;
  noise: number;
  /** resistance from the − input to the signal sources / ground (the "R1" of MT-049) */
  rg: number;
  rf: number;
  /** DC resistance seen by the + input (the "R3" of MT-049) */
  rPlus: number;
}

/** Ideal gains, noise gain 1 + Rf/Rg (MT-033 eq. 4) and the resistances seen by each input. */
export function gains(c: Circuit): Gains {
  const { r1, r2 } = c;
  if (!(r1 > 0 && r2 >= 0)) throw new RangeError('Resistors must be greater than 0.');
  switch (c.topology) {
    case 'inverting': {
      const ng = 1 + r2 / r1;
      return { terms: [{ name: 'Vin', k: -r2 / r1 }], kRef: ng, signal: -r2 / r1, noise: ng, rg: r1, rf: r2, rPlus: c.rcomp };
    }
    case 'noninverting': {
      const ng = 1 + r2 / r1;
      return { terms: [{ name: 'Vin', k: ng }], kRef: -r2 / r1, signal: ng, noise: ng, rg: r1, rf: r2, rPlus: c.rs + c.rcomp };
    }
    case 'summing': {
      const ins = [
        { name: 'V1', r: r1 },
        { name: 'V2', r: c.r3 },
        { name: 'V3', r: c.r4 },
      ].filter((x) => x.r > 0);
      const rg = par(...ins.map((x) => x.r));
      const ng = 1 + r2 / rg;
      return { terms: ins.map((x) => ({ name: x.name, k: -r2 / x.r })), kRef: ng, signal: -r2 / r1, noise: ng, rg, rf: r2, rPlus: c.rcomp };
    }
    case 'difference': {
      const { r3, r4 } = c;
      if (!(r3 > 0 && r4 > 0)) throw new RangeError('Resistors must be greater than 0.');
      const ng = 1 + r2 / r1;
      const a1 = r2 / r1;
      const a2 = (r4 / (r3 + r4)) * ng;
      const ad = (a1 + a2) / 2;
      return {
        terms: [
          { name: 'Vdiff', k: ad },
          { name: 'Vcm', k: a2 - a1 },
        ],
        kRef: (r3 / (r3 + r4)) * ng,
        signal: ad,
        noise: ng,
        rg: r1,
        rf: r2,
        rPlus: par(r3, r4),
      };
    }
  }
}

/* ------------------------------------------------------------ finite gain and bandwidth */

/** Closed-loop gain with finite open-loop gain A: G / (1 + NG/A) (MT-033 eq. 1; SLOD006B eq. 6-18 for the inverting case). */
export const finiteGain = (ideal: number, noiseGain: number, aol: number) => ideal / (1 + noiseGain / aol);

/** Closed-loop bandwidth estimate GBW / NG (MT-033 figure 5). */
export const closedLoopBw = (gbw: number, noiseGain: number) => gbw / noiseGain;

/**
 * Exact −3 dB frequency of the closed loop for a single-pole op amp A(f) = A0 / (1 + j f/fp),
 * fp = GBW/A0: |1 + NG/A(f)| = √2 (1 + NG/A0) gives f = GBW/NG + GBW/A0.
 */
export const closedLoopBwSinglePole = (gbw: number, noiseGain: number, aol: number) => gbw / noiseGain + gbw / aol;

/** |closed-loop gain| at f for the single-pole op amp model, and the open-loop gain there. */
export function closedLoopAt(ideal: number, noiseGain: number, aol: number, gbw: number, f: number) {
  const fp = gbw / aol;
  // A(f) = aol / (1 + j f/fp); 1 + NG/A = 1 + NG (1 + j f/fp)/aol
  const re = 1 + noiseGain / aol;
  const im = (noiseGain * f) / (aol * fp);
  return { closed: Math.abs(ideal) / Math.hypot(re, im), open: aol / Math.hypot(1, f / fp) };
}

/** Full-power bandwidth SR / (2π Vpk), the TI SLOA088 rule SR = π Vpp f solved for f. */
export const fullPowerBw = (slewRate: number, vPeak: number) => slewRate / (2 * Math.PI * vPeak);

/** dB from a V/V ratio and back. */
export const db = (x: number) => 20 * Math.log10(Math.abs(x));
export const fromDb = (d: number) => 10 ** (d / 20);

/* ------------------------------------------------------------ signal range */

export interface Range {
  lo: number;
  hi: number;
}

export interface SignalInput {
  /** input range: Vin (inverting / non-inverting), each input (summing), differential input (difference) */
  vin: Range;
  /** common-mode input range (difference amplifier only) */
  vcm: Range;
  vref: number;
}

const span = (k: number, r: Range): Range => ({ lo: Math.min(k * r.lo, k * r.hi), hi: Math.max(k * r.lo, k * r.hi) });

/** Ideal output range over the input ranges (the output is linear in every input). */
export function outputRange(c: Circuit, s: SignalInput): Range {
  const g = gains(c);
  let lo = g.kRef * s.vref;
  let hi = lo;
  g.terms.forEach((t) => {
    const r = span(t.k, c.topology === 'difference' && t.name === 'Vcm' ? s.vcm : s.vin);
    lo += r.lo;
    hi += r.hi;
  });
  return { lo, hi };
}

/** Voltage range at the + input (equal to the − input in closed loop): the op amp's common-mode input. */
export function plusInputRange(c: Circuit, s: SignalInput): Range {
  if (c.topology === 'inverting' || c.topology === 'summing') return { lo: s.vref, hi: s.vref };
  if (c.topology === 'noninverting') return { ...s.vin };
  // V+ = (V2 R2′ + Vref R1′) / (R1′ + R2′), V2 = Vcm + Vd/2
  const w = c.r4 / (c.r3 + c.r4);
  const base = s.vref * (1 - w);
  const v2lo = s.vcm.lo + Math.min(s.vin.lo, s.vin.hi) / 2;
  const v2hi = s.vcm.hi + Math.max(s.vin.lo, s.vin.hi) / 2;
  return { lo: base + w * v2lo, hi: base + w * v2hi };
}

/* ------------------------------------------------------------ DC errors */

/**
 * Worst-case output offset (MT-037, MT-038): Vos is amplified by the noise gain; the bias currents
 * give IB− · Rf − NG · R+ · IB+. With IB± = IB ± Ios/2 that is IB (Rf − NG R+) ∓ (Ios/2)(Rf + NG R+),
 * which is Ios · Rf when R+ = Rg ∥ Rf (MT-038 figure 3).
 */
export function outputOffset(g: Gains, vos: number, ib: number, ios: number) {
  const fromVos = Math.abs(vos) * g.noise;
  const fromIb = Math.abs(ib * (g.rf - g.noise * g.rPlus));
  const fromIos = (Math.abs(ios) / 2) * (g.rf + g.noise * g.rPlus);
  return { fromVos, fromIb, fromIos, total: fromVos + fromIb + fromIos };
}

/** Bias-current compensation resistor for the + input, R1 ∥ R2 (MT-038). */
export const biasCompR = (rg: number, rf: number) => par(rg, rf);

/* ------------------------------------------------------------ noise */

export interface NoiseSource {
  name: string;
  /** spectral density referred to the output, V/√Hz */
  out: number;
}

/**
 * Output noise density of each source in the MT-049 single-pole model (figure 2): voltage noise,
 * + input current noise in R+ and Johnson noise of R+ times the noise gain; − input current noise
 * times Rf; Johnson noise of Rg times Rf/Rg; Johnson noise of Rf directly. White noise only.
 */
export function noiseSources(g: Gains, en: number, inoise: number, tempC: number): NoiseSource[] {
  const fourKT = 4 * K_BOLTZMANN * (tempC + 273.15);
  const out: NoiseSource[] = [
    { name: 'Op amp voltage noise en', out: en * g.noise },
    { name: 'Current noise in R+ (+ input)', out: inoise * g.rPlus * g.noise },
    { name: 'Current noise in Rf (− input)', out: inoise * g.rf },
    { name: 'Johnson noise of R+', out: Math.sqrt(fourKT * g.rPlus) * g.noise },
    { name: 'Johnson noise of input resistor(s)', out: Math.sqrt(fourKT * g.rg) * (g.rf / g.rg) },
    { name: 'Johnson noise of Rf', out: Math.sqrt(fourKT * g.rf) },
  ];
  return out;
}

export const rss = (x: number[]) => Math.sqrt(x.reduce((s, v) => s + v * v, 0));

/** Equivalent noise bandwidth of a single-pole response, 1.57 · f−3dB (π/2, MT-048 figure 4). */
export const noiseBandwidth = (f3db: number) => (Math.PI / 2) * f3db;

/* ------------------------------------------------------------ resistor tolerance */

export interface ToleranceResult {
  /** headline gain range over all resistor corners */
  gain: Range;
  /** difference amplifier: worst-case CMRR over the corners (dB) and MT-068 eq. 1 */
  cmrrWorst?: number;
  cmrrMt068?: number;
}

/**
 * Worst-case gain with every resistor at ±tol (fraction). The difference amplifier is evaluated at
 * all 16 corners; its worst-case CMRR = min |Ad / Acm| is compared with MT-068 eq. 1,
 * CMR = 20 log10((1 + R2/R1) / (4 Kr)).
 */
export function tolerance(c: Circuit, tol: number): ToleranceResult {
  if (!(tol >= 0 && tol < 1)) throw new RangeError('Tolerance must be from 0 to less than 100 %.');
  const names = c.topology === 'difference' ? (['r1', 'r2', 'r3', 'r4'] as const) : c.topology === 'summing' ? (['r1', 'r2'] as const) : (['r1', 'r2'] as const);
  let lo = Infinity;
  let hi = -Infinity;
  let cmrr = Infinity;
  for (let m = 0; m < 1 << names.length; m++) {
    const v = { ...c };
    names.forEach((n, i) => {
      v[n] = c[n] * (m & (1 << i) ? 1 + tol : 1 - tol);
    });
    const g = gains(v);
    lo = Math.min(lo, g.signal);
    hi = Math.max(hi, g.signal);
    if (c.topology === 'difference') {
      const acm = Math.abs(g.terms[1].k);
      cmrr = Math.min(cmrr, acm > 0 ? db(g.signal / acm) : Infinity);
    }
  }
  if (c.topology !== 'difference') return { gain: { lo, hi } };
  return { gain: { lo, hi }, cmrrWorst: cmrr, cmrrMt068: tol > 0 ? db((1 + c.r2 / c.r1) / (4 * tol)) : Infinity };
}

/* ------------------------------------------------------------ design from standard values */

export interface GainPair {
  rin: number;
  rf: number;
  gain: number;
  error: number; // actual/target − 1
}

/**
 * Standard-value Rin/Rf pairs for a target gain magnitude, ranked by gain error, with Rin + Rf kept
 * within √10 of `rTotal`. Inverting and difference: |G| = Rf/Rin; non-inverting: G = 1 + Rf/Rin.
 */
export function gainPairs(topology: Exclude<Topology, 'summing'>, target: number, rTotal: number, s: ESeries, count = 8): GainPair[] {
  const k = topology === 'noninverting' ? target - 1 : target;
  if (!(k > 0 && Number.isFinite(k)) || !(rTotal > 0)) return [];
  const g = (rin: number, rf: number) => (topology === 'noninverting' ? 1 + rf / rin : rf / rin);
  const rinIdeal = rTotal / (1 + k);
  const seen = new Set<string>();
  const out: GainPair[] = [];
  for (const rin of eValuesInRange(rinIdeal / Math.sqrt(10), rinIdeal * Math.sqrt(10), s)) {
    const { below, above } = eNeighbors(k * rin, s);
    for (const rf of [below, above]) {
      const t = rin + rf;
      if (t < rTotal / Math.sqrt(10) || t > rTotal * Math.sqrt(10)) continue;
      const key = `${rin}/${rf}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const gain = g(rin, rf);
      out.push({ rin, rf, gain, error: gain / target - 1 });
    }
  }
  const off = (p: GainPair) => Math.abs(Math.log((p.rin + p.rf) / rTotal));
  out.sort((a, b) => Math.abs(a.error) - Math.abs(b.error) || off(a) - off(b));
  return out.slice(0, count);
}

/** Nearest standard value for the bias-compensation resistor. */
export const compStandard = (r: number, s: ESeries) => (r > 0 ? eNearest(r, s) : 0);
