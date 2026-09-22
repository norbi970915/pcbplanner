// General electronics calculators: Ohm's law, reactance and resonance, crystal
// load capacitors and ppm, E-series values, resistor networks and attenuator pads.

const TAU = 2 * Math.PI;

/* ---------------------------------------------------------------- Ohm's law */

export type OhmPair = 'VI' | 'VR' | 'VP' | 'IR' | 'IP' | 'RP';
export interface Ohm {
  V: number;
  I: number;
  R: number;
  P: number;
}

/** Complete V, I, R, P from the two quantities named in `pair` (the other two are ignored). */
export function ohmsLaw(pair: OhmPair, k: Ohm): Ohm {
  const { V, I, R, P } = k;
  switch (pair) {
    case 'VI':
      return { V, I, R: V / I, P: V * I };
    case 'VR':
      return { V, I: V / R, R, P: (V * V) / R };
    case 'VP':
      return { V, I: P / V, R: (V * V) / P, P };
    case 'IR':
      return { V: I * R, I, R, P: I * I * R };
    case 'IP':
      return { V: P / I, I, R: P / (I * I), P };
    case 'RP':
      return { V: Math.sqrt(P * R), I: Math.sqrt(P / R), R, P };
  }
}

/* ---------------------------------------------------- reactance / resonance */

export const xC = (f: number, C: number) => 1 / (TAU * f * C);
export const xL = (f: number, L: number) => TAU * f * L;
export const resonantFreq = (L: number, C: number) => 1 / (TAU * Math.sqrt(L * C));
/** L that resonates with C at f. */
export const lForResonance = (f: number, C: number) => 1 / ((TAU * f) ** 2 * C);
/** C that resonates with L at f. */
export const cForResonance = (f: number, L: number) => 1 / ((TAU * f) ** 2 * L);

/**
 * Impedance magnitude of a series RLC (R = series loss, 0 = ideal) and of a
 * parallel RLC (R = parallel loss, 0 or Infinity = ideal tank) at f.
 */
export function lcImpedance(f: number, L: number, C: number, rSeries = 0, rParallel = 0) {
  const XL = xL(f, L);
  const XC = xC(f, C);
  const X = XL - XC; // net series reactance, + inductive
  const series = Math.hypot(rSeries, X);
  const B = 1 / XC - 1 / XL; // net parallel susceptance, + capacitive
  const g = rParallel > 0 && Number.isFinite(rParallel) ? 1 / rParallel : 0;
  const parallel = 1 / Math.hypot(g, B);
  const z0 = Math.sqrt(L / C); // characteristic impedance of the resonator
  return {
    XL,
    XC,
    series,
    seriesPhaseDeg: (Math.atan2(X, rSeries) * 180) / Math.PI,
    parallel,
    parallelPhaseDeg: (Math.atan2(-B, g) * 180) / Math.PI,
    z0,
    qSeries: rSeries > 0 ? z0 / rSeries : Infinity,
    qParallel: g > 0 ? rParallel / z0 : Infinity,
  };
}

/* ------------------------------------------------------------------- crystal */

/** Equal load capacitors for a crystal: CL = C/2 + Cstray, so C = 2(CL − Cstray). */
export const crystalLoadCap = (cl: number, cStray: number) => 2 * (cl - cStray);
/** Effective load capacitance seen by the crystal. */
export const crystalCL = (c1: number, c2: number, cStray: number) => (c1 * c2) / (c1 + c2) + cStray;
/**
 * Frequency shift in ppm when the crystal sees CLactual instead of the CLspec it
 * was calibrated for (fL ≈ fs·(1 + Cm / (2(C0 + CL)))). Cm = motional capacitance.
 */
export const crystalPullPpm = (cm: number, c0: number, clActual: number, clSpec: number) => (cm / 2) * (1 / (c0 + clActual) - 1 / (c0 + clSpec)) * 1e6;

export const ppmFromFreq = (fNominal: number, fActual: number) => ((fActual - fNominal) / fNominal) * 1e6;
export const freqErrorFromPpm = (fNominal: number, ppm: number) => fNominal * ppm * 1e-6;
/** Clock drift in seconds per day for a frequency error in ppm. */
export const driftSecondsPerDay = (ppm: number) => ppm * 1e-6 * 86400;

/* ------------------------------------------------------------------ E-series */

export type ESeries = 'E12' | 'E24' | 'E96';

/** IEC 60063 preferred numbers, as integers for the decade 100…999. */
export const E_SERIES: Record<ESeries, readonly number[]> = {
  E12: [100, 120, 150, 180, 220, 270, 330, 390, 470, 560, 680, 820],
  E24: [100, 110, 120, 130, 150, 160, 180, 200, 220, 240, 270, 300, 330, 360, 390, 430, 470, 510, 560, 620, 680, 750, 820, 910],
  E96: [
    100, 102, 105, 107, 110, 113, 115, 118, 121, 124, 127, 130, 133, 137, 140, 143, 147, 150, 154, 158, 162, 165, 169, 174, 178, 182, 187, 191, 196, 200, 205, 210, 215, 221, 226,
    232, 237, 243, 249, 255, 261, 267, 274, 280, 287, 294, 301, 309, 316, 324, 332, 340, 348, 357, 365, 374, 383, 392, 402, 412, 422, 432, 442, 453, 464, 475, 487, 499, 511, 523,
    536, 549, 562, 576, 590, 604, 619, 634, 649, 665, 681, 698, 715, 732, 750, 768, 787, 806, 825, 845, 866, 887, 909, 931, 953, 976,
  ],
};

/** n (100…999) scaled to decade d: value = n · 10^(d−2), computed without float drift. */
const scale = (n: number, d: number) => (d >= 2 ? n * 10 ** (d - 2) : n / 10 ** (2 - d));

/** Largest series value ≤ x and smallest ≥ x. */
export function eNeighbors(x: number, s: ESeries) {
  const list = E_SERIES[s];
  let d = Math.floor(Math.log10(x));
  // guard against log10 rounding at exact decades
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

/** Nearest series value to x on a logarithmic scale (ratio error). */
export function eNearest(x: number, s: ESeries): number {
  const { below, above } = eNeighbors(x, s);
  return x / below <= above / x ? below : above;
}

/** All series values in [lo, hi]. */
export function eValuesInRange(lo: number, hi: number, s: ESeries): number[] {
  const out: number[] = [];
  for (let d = Math.floor(Math.log10(lo)) - 1; d <= Math.ceil(Math.log10(hi)); d++) {
    for (const n of E_SERIES[s]) {
      const v = scale(n, d);
      if (v >= lo && v <= hi) out.push(v);
    }
  }
  return out;
}

/* --------------------------------------------------------- resistor networks */

export function divider(vin: number, r1: number, r2: number, rLoad = 0) {
  const r2e = rLoad > 0 ? (r2 * rLoad) / (r2 + rLoad) : r2;
  const ratio = r2e / (r1 + r2e);
  const vout = vin * ratio;
  const current = vin / (r1 + r2e);
  return { ratio, vout, current, pR1: current * current * r1, pR2: (vout * vout) / r2, rOut: (r1 * r2e) / (r1 + r2e), unloaded: (vin * r2) / (r1 + r2) };
}

export interface DividerPair {
  r1: number;
  r2: number;
  ratio: number;
  error: number; // relative ratio error (actual/target − 1)
}

/**
 * Best standard R1/R2 pairs (Vout/Vin = R2/(R1+R2)) for a target ratio, with
 * R1 + R2 kept within √10 of `rTotal`. Sorted by ratio error.
 */
export function dividerPairs(target: number, rTotal: number, s: ESeries, count = 8): DividerPair[] {
  const r2Ideal = target * rTotal;
  const seen = new Set<string>();
  const out: DividerPair[] = [];
  for (const r2 of eValuesInRange(r2Ideal / Math.sqrt(10), r2Ideal * Math.sqrt(10) * 0.99999, s)) {
    const { below, above } = eNeighbors((r2 * (1 - target)) / target, s);
    for (const r1 of [below, above]) {
      const key = `${r1}/${r2}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const ratio = r2 / (r1 + r2);
      out.push({ r1, r2, ratio, error: ratio / target - 1 });
    }
  }
  const off = (p: DividerPair) => Math.abs(Math.log(p.r1 + p.r2) - Math.log(rTotal));
  out.sort((a, b) => Math.abs(a.error) - Math.abs(b.error) || off(a) - off(b));
  return out.slice(0, count);
}

/** Series resistor for `n` LEDs in series at forward current `iF`. */
export function ledResistor(vs: number, vf: number, iF: number, n = 1) {
  const vR = vs - n * vf;
  const r = vR / iF;
  const at = (R: number) => {
    const i = vR / R;
    return { r: R, current: i, pR: i * i * R, pLed: i * vf * n };
  };
  return { vR, r, ideal: at(r), at };
}

/** Standard power ratings (W). */
export const POWER_RATINGS = [0.0625, 0.1, 0.125, 0.25, 0.5, 0.75, 1, 2, 3, 5, 10];
/** Smallest standard rating with at least `derate`× margin over p. */
export const powerRating = (p: number, derate = 2) => POWER_RATINGS.find((w) => w >= p * derate) ?? NaN;

export const seriesSum = (v: number[]) => v.reduce((a, b) => a + b, 0);
export const reciprocalSum = (v: number[]) => 1 / v.reduce((a, b) => a + 1 / b, 0);

/** Series and parallel combination: R and L add in series; C adds in parallel. */
export function combine(kind: 'R' | 'C' | 'L', values: number[]) {
  return kind === 'C' ? { series: reciprocalSum(values), parallel: seriesSum(values) } : { series: seriesSum(values), parallel: reciprocalSum(values) };
}

const PREFIX: Record<string, number> = { f: 1e-15, p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, μ: 1e-6, m: 1e-3, R: 1, r: 1, k: 1e3, K: 1e3, M: 1e6, G: 1e9 };

/**
 * Parse a component value: "4.7k", "10 kΩ", "100n", "2.2uF", "1e-9", and RKM
 * code as printed on parts ("4k7", "4R7", "2n2"). Returns NaN if unreadable.
 */
export function parseValue(text: string): number {
  // strip a unit: Ω/ohm in any case; F and H only as capitals (lower-case f is the femto prefix)
  const t = text.trim().replace(/\s+/g, '').replace(/(Ω|ohms?)$/i, '').replace(/(?<=.)(F|H)$/, '');
  let m = /^(\d+)([fpnuµμmRrkKMG])(\d+)$/.exec(t);
  if (m) return Number(`${m[1]}.${m[3]}`) * PREFIX[m[2]];
  m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([fpnuµμmRrkKMG]?)$/i.exec(t);
  if (!m) return NaN;
  return Number(m[1]) * (m[2] ? PREFIX[m[2]] : 1);
}

/** Split a list of values on commas, semicolons or whitespace. */
export const parseList = (text: string) =>
  text
    .split(/[,;\s]+/)
    .filter(Boolean)
    .map((s) => ({ text: s, value: parseValue(s) }));

/* --------------------------------------------------------- attenuator pads */

/** Matched Pi pad (equal impedances): shunt arms and series arm. */
export function piPad(db: number, z0: number) {
  const K = 10 ** (db / 20);
  return { shunt: (z0 * (K + 1)) / (K - 1), series: (z0 * (K * K - 1)) / (2 * K) };
}

/** Matched T pad: series arms and shunt arm. */
export function tPad(db: number, z0: number) {
  const K = 10 ** (db / 20);
  return { series: (z0 * (K - 1)) / (K + 1), shunt: (z0 * 2 * K) / (K * K - 1) };
}

/** Matched bridged-T pad: two Z0 arms, bridge resistor and shunt resistor. */
export function bridgedTPad(db: number, z0: number) {
  const K = 10 ** (db / 20);
  return { arm: z0, bridge: z0 * (K - 1), shunt: z0 / (K - 1) };
}

export type PadTopology = 'pi' | 't' | 'bt';
/** Resistor between two nodes; 0 = ground, 1 = input, 2 = output, 3 = internal. */
export type Branch = { name: string; a: number; b: number; r: number };

export function padBranches(topo: PadTopology, v: number[]): Branch[] {
  if (topo === 'pi')
    return [
      { name: 'R1 (shunt, input)', a: 1, b: 0, r: v[0] },
      { name: 'R2 (series)', a: 1, b: 2, r: v[1] },
      { name: 'R3 (shunt, output)', a: 2, b: 0, r: v[2] },
    ];
  if (topo === 't')
    return [
      { name: 'R1 (series, input)', a: 1, b: 3, r: v[0] },
      { name: 'R2 (shunt)', a: 3, b: 0, r: v[1] },
      { name: 'R3 (series, output)', a: 3, b: 2, r: v[2] },
    ];
  return [
    { name: 'R1 (arm, input)', a: 1, b: 3, r: v[0] },
    { name: 'R2 (arm, output)', a: 3, b: 2, r: v[1] },
    { name: 'R3 (bridge)', a: 1, b: 2, r: v[2] },
    { name: 'R4 (shunt)', a: 3, b: 0, r: v[3] },
  ];
}

/**
 * Nodal analysis of a resistive pad between a Z0 source and a Z0 load.
 * Returns insertion loss, input impedance, return loss and the fraction of the
 * input power dissipated in each branch.
 */
export function analyzePad(branches: Branch[], z0: number) {
  const N = 3; // nodes 1..3
  const G = Array.from({ length: N }, () => new Array<number>(N + 1).fill(0));
  const stamp = (a: number, b: number, g: number) => {
    if (a) G[a - 1][a - 1] += g;
    if (b) G[b - 1][b - 1] += g;
    if (a && b) {
      G[a - 1][b - 1] -= g;
      G[b - 1][a - 1] -= g;
    }
  };
  for (const br of branches) stamp(br.a, br.b, 1 / br.r);
  // Norton source: Vs = 2 V behind Z0, so a matched load would see 1 V.
  stamp(1, 0, 1 / z0);
  G[0][N] = 2 / z0;
  stamp(2, 0, 1 / z0);
  if (!branches.some((b) => b.a === 3 || b.b === 3)) G[2][2] = 1; // unused internal node
  // Gaussian elimination with partial pivoting
  for (let c = 0; c < N; c++) {
    let p = c;
    for (let r = c + 1; r < N; r++) if (Math.abs(G[r][c]) > Math.abs(G[p][c])) p = r;
    [G[c], G[p]] = [G[p], G[c]];
    for (let r = 0; r < N; r++) {
      if (r === c) continue;
      const f = G[r][c] / G[c][c];
      for (let k = c; k <= N; k++) G[r][k] -= f * G[c][k];
    }
  }
  const v = [0, ...G.map((row, i) => row[N] / row[i])];
  const iIn = (2 - v[1]) / z0;
  const zin = v[1] / iIn;
  const pIn = v[1] * iIn;
  const gamma = (zin - z0) / (zin + z0);
  return {
    loss: -20 * Math.log10(Math.abs(v[2])),
    zin,
    returnLoss: -20 * Math.log10(Math.abs(gamma)),
    dissipation: branches.map((br) => ((v[br.a] - v[br.b]) ** 2 / br.r) / pIn),
  };
}
