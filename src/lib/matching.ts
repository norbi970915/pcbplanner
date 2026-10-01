// Two-element (L-section) lumped matching networks, after Pozar, Microwave Engineering, 4th ed., §5.1,
// generalised from a real Z0 to a complex source: the network must present the conjugate of the source
// impedance, Zin = Zs*, at the design frequency (maximum power transfer). SI units: Ω, S, H, F, Hz.
import { eNeighbors, type ESeries } from './electronics';

/* ------------------------------------------------------------------ complex arithmetic */

export interface Cx {
  re: number;
  im: number;
}
export const cx = (re: number, im = 0): Cx => ({ re, im });
export const cAdd = (a: Cx, b: Cx): Cx => ({ re: a.re + b.re, im: a.im + b.im });
export const cSub = (a: Cx, b: Cx): Cx => ({ re: a.re - b.re, im: a.im - b.im });
export const cMul = (a: Cx, b: Cx): Cx => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
export const cDiv = (a: Cx, b: Cx): Cx => {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};
export const cInv = (a: Cx): Cx => cDiv(cx(1), a);
export const cConj = (a: Cx): Cx => ({ re: a.re, im: -a.im });
export const cAbs = (a: Cx): number => Math.hypot(a.re, a.im);
export const cScale = (a: Cx, k: number): Cx => ({ re: a.re * k, im: a.im * k });

const TAU = 2 * Math.PI;

/* ------------------------------------------------------------------ terminations */

/**
 * Impedance at frequency f of a termination entered as R + jX at f0, modelled as R in series with the
 * inductor (X > 0) or capacitor (X < 0) that has reactance X at f0.
 */
export function termAt(z0: Cx, f0: number, f: number): Cx {
  if (z0.im === 0) return cx(z0.re);
  return cx(z0.re, z0.im > 0 ? (z0.im * f) / f0 : (z0.im * f0) / f);
}

/**
 * Power-wave reflection coefficient (Kurokawa, 1965) of an impedance Z driven from a source Zs:
 * Γ = (Z − Zs*) / (Z + Zs). |Γ|² = 1 − delivered / available power; for a real Zs this is the usual Γ.
 */
export const powerGamma = (z: Cx, zs: Cx): Cx => cDiv(cSub(z, cConj(zs)), cAdd(z, zs));

/** Return loss in dB, −20 log₁₀|Γ| (Infinity for a perfect match). */
export const returnLoss = (g: Cx | number): number => -20 * Math.log10(typeof g === 'number' ? Math.abs(g) : cAbs(g));

/* ------------------------------------------------------------------ elements */

export type Kind = 'L' | 'C' | 'none';
export interface Part {
  kind: Kind;
  /** H for L, F for C, 0 for none */
  value: number;
}

/** Part with series reactance X at angular frequency w. */
export function seriesPart(x: number, w: number): Part {
  if (x === 0) return { kind: 'none', value: 0 };
  return x > 0 ? { kind: 'L', value: x / w } : { kind: 'C', value: -1 / (w * x) };
}
/** Part with shunt susceptance B at angular frequency w. */
export function shuntPart(b: number, w: number): Part {
  if (b === 0) return { kind: 'none', value: 0 };
  return b > 0 ? { kind: 'C', value: b / w } : { kind: 'L', value: -1 / (w * b) };
}
/** Impedance of a series part at f (a missing series part is a short). */
export function partZ(p: Part, f: number): Cx {
  const w = TAU * f;
  return p.kind === 'L' ? cx(0, w * p.value) : p.kind === 'C' ? cx(0, -1 / (w * p.value)) : cx(0);
}
/** Admittance of a shunt part at f (a missing shunt part is an open). */
export function partY(p: Part, f: number): Cx {
  const w = TAU * f;
  return p.kind === 'C' ? cx(0, w * p.value) : p.kind === 'L' ? cx(0, -1 / (w * p.value)) : cx(0);
}

/* ------------------------------------------------------------------ L-network synthesis */

/**
 * 'shunt-load': shunt element across the load, series element towards the source (Pozar Fig. 5.2a).
 * 'series-load': series element next to the load, shunt element across the source side (Pozar Fig. 5.2b).
 */
export type Topology = 'shunt-load' | 'series-load';

export interface Network {
  topology: Topology;
  series: Part;
  shunt: Part;
}

export interface LSolution extends Network {
  /** series reactance X and shunt susceptance B at f0 */
  x: number;
  b: number;
  /** impedance at the node between the two elements, looking towards the load */
  zMid: Cx;
  /** largest |X|/R of the load, the middle node and the input (= Zs*) */
  qNode: number;
  /** |X|/R of the middle node alone */
  qMid: number;
}

export interface LResult {
  solutions: LSolution[];
  /** why there is no solution, when there is none */
  reason?: string;
  /** the load already equals Zs* */
  matched: boolean;
}

/** Input impedance of the network terminated in zl at frequency f. */
export function networkZin(n: Network, zl: Cx, f: number): Cx {
  const zs = partZ(n.series, f);
  const ysh = partY(n.shunt, f);
  if (n.topology === 'shunt-load') return cAdd(zs, cInv(cAdd(ysh, cInv(zl))));
  return cInv(cAdd(ysh, cInv(cAdd(zs, zl))));
}

const nodeQ = (z: Cx) => (z.re > 0 ? Math.abs(z.im) / z.re : Infinity);

/**
 * All two-element lossless networks that transform zl into zs* at f (up to four).
 * Shunt next to the load needs Re(1/ZL)·Rs ≤ 1; series next to the load needs RL·Re(1/Zs*) ≤ 1
 * (with Zs = Z0 real these are Pozar's "zL inside / outside the 1 + jx circle" cases).
 * Degenerate results (one or no element) are kept, duplicates removed.
 */
export function lNetworks(f: number, zs: Cx, zl: Cx): LResult {
  const none: LResult = { solutions: [], matched: false };
  if (!(f > 0) || !(zs.re > 0) || !Number.isFinite(zs.im) || !Number.isFinite(zl.re) || !Number.isFinite(zl.im)) return { ...none, reason: 'Check the inputs.' };
  if (!(zl.re > 0)) return { ...none, reason: 'The load has no resistance. A lossless network cannot deliver power to a purely reactive load, so it cannot be matched.' };
  const w = TAU * f;
  const target = cConj(zs); // Zin required
  const scale = Math.max(zs.re, Math.abs(zs.im), cAbs(zl));
  const zeroX = (v: number) => (Math.abs(v) <= 1e-12 * scale ? 0 : v);
  const zeroB = (v: number) => (Math.abs(v) * scale <= 1e-12 ? 0 : v);
  const sols: LSolution[] = [];

  const push = (topology: Topology, x: number, b: number) => {
    x = zeroX(x);
    b = zeroB(b);
    const zMid = topology === 'shunt-load' ? cInv(cAdd(cInv(zl), cx(0, b))) : cAdd(zl, cx(0, x));
    const qMid = nodeQ(zMid);
    const s: LSolution = { topology, series: seriesPart(x, w), shunt: shuntPart(b, w), x, b, zMid, qMid, qNode: Math.max(qMid, nodeQ(zl), nodeQ(target)) };
    // a network with no elements, or with only one, can come out of both topologies
    const sig = (n: LSolution) => `${n.series.kind}${n.series.kind === 'none' ? '' : n.series.value.toPrecision(9)}|${n.shunt.kind}${n.shunt.kind === 'none' ? '' : n.shunt.value.toPrecision(9)}|${n.series.kind === 'none' || n.shunt.kind === 'none' ? '' : n.topology}`;
    if (!sols.some((o) => sig(o) === sig(s))) sols.push(s);
  };

  // shunt B across the load, series X towards the source: Re{1/(YL + jB)} = Rs
  const yl = cInv(zl);
  const disc1 = yl.re / target.re - yl.re * yl.re;
  if (disc1 >= -1e-12 * yl.re * yl.re) {
    const r = Math.sqrt(Math.max(0, disc1));
    for (const sgn of r === 0 ? [1] : [1, -1]) {
      const bt = sgn * r; // total node susceptance BL + B
      const b = bt - yl.im;
      const zm = cInv(cx(yl.re, bt));
      push('shunt-load', target.im - zm.im, b);
    }
  }

  // series X next to the load, shunt B towards the source: Re{1/(ZL + jX)} = Re(1/Zs*)
  const yt = cInv(target);
  const disc2 = zl.re / yt.re - zl.re * zl.re;
  if (disc2 >= -1e-12 * zl.re * zl.re) {
    const r = Math.sqrt(Math.max(0, disc2));
    for (const sgn of r === 0 ? [1] : [1, -1]) {
      const xt = sgn * r; // total series reactance XL + X
      const x = xt - zl.im;
      const ym = cInv(cx(zl.re, xt));
      push('series-load', x, yt.im - ym.im);
    }
  }

  const matched = cAbs(cSub(zl, target)) <= 1e-9 * scale;
  return { solutions: sols, matched };
}

/** Short name of a network: low-pass (series L, shunt C), high-pass (series C, shunt L) or the parts. */
export function networkName(n: Network): string {
  const s = n.series.kind, p = n.shunt.kind;
  if (s === 'none' && p === 'none') return 'No network';
  if (s === 'none') return `Shunt ${p} only`;
  if (p === 'none') return `Series ${s} only`;
  if (s === 'L' && p === 'C') return 'Low-pass (series L, shunt C)';
  if (s === 'C' && p === 'L') return 'High-pass (series C, shunt L)';
  return `Series ${s}, shunt ${p}`;
}

/* ------------------------------------------------------------------ response */

/** Power-wave reflection at the source at frequency f; source and load follow `termAt`. */
export function networkGamma(n: Network, zs0: Cx, zl0: Cx, f0: number, f: number): Cx {
  return powerGamma(networkZin(n, termAt(zl0, f0, f), f), termAt(zs0, f0, f));
}

export interface Band {
  /** band edges where the return loss falls to the threshold; null = beyond the search range (f0/100 … 100 f0) */
  lo: number | null;
  hi: number | null;
}

/**
 * Contiguous band around f0 where rl(f) ≥ threshold (dB), found by stepping outwards from f0 in
 * geometrically growing steps and refining each crossing by bisection. Null when rl(f0) < threshold.
 */
export function bandAround(rl: (f: number) => number, f0: number, threshold: number): Band | null {
  if (!(rl(f0) >= threshold)) return null;
  const edge = (dir: 1 | -1): number | null => {
    const at = (d: number) => (dir > 0 ? f0 * (1 + d) : f0 / (1 + d));
    let dPrev = 0;
    for (let d = 1e-7; d <= 99; d *= 1.08) {
      if (!(rl(at(d)) >= threshold)) {
        let a = dPrev, c = d;
        for (let i = 0; i < 80; i++) {
          const m = (a + c) / 2;
          if (rl(at(m)) >= threshold) a = m;
          else c = m;
        }
        return at((a + c) / 2);
      }
      dPrev = d;
    }
    return null;
  };
  return { lo: edge(-1), hi: edge(1) };
}

/* ------------------------------------------------------------------ standard values */

export interface StdNetwork extends Network {
  /** return loss at f0 with these parts, dB */
  rl: number;
}

/**
 * Standard-value version of a network: each part is rounded down or up to the series, and the
 * combination with the highest return loss at f0 is kept (at most four combinations).
 */
export function standardNetwork(n: Network, series: ESeries, zs0: Cx, zl0: Cx, f0: number): StdNetwork {
  const opts = (p: Part): Part[] => {
    if (p.kind === 'none') return [p];
    const { below, above } = eNeighbors(p.value, series);
    return below === above ? [{ kind: p.kind, value: below }] : [{ kind: p.kind, value: below }, { kind: p.kind, value: above }];
  };
  let best: StdNetwork | null = null;
  for (const s of opts(n.series)) {
    for (const p of opts(n.shunt)) {
      const cand: Network = { topology: n.topology, series: s, shunt: p };
      const rl = returnLoss(networkGamma(cand, zs0, zl0, f0, f0));
      if (!best || rl > best.rl) best = { ...cand, rl };
    }
  }
  return best as StdNetwork;
}

/* ------------------------------------------------------------------ Smith chart path */

const gammaZ = (z: Cx): Cx => (Number.isFinite(z.re) && Number.isFinite(z.im) ? cDiv(cSub(z, cx(1)), cAdd(z, cx(1))) : cx(1));
const gammaY = (y: Cx): Cx => cDiv(cSub(cx(1), y), cAdd(cx(1), y));

/** Reflection coefficient of impedance z normalised to the real reference zRef. */
export const smithPoint = (z: Cx, zRef: number): Cx => gammaZ(cScale(z, 1 / zRef));

/**
 * Points (as Γ, normalised to the real zRef) along the path from the load to the input at f0: a series
 * element moves along a constant-resistance circle, a shunt element along a constant-conductance circle.
 * Returns the two arcs separately.
 */
export function smithPath(s: LSolution, zl: Cx, zRef: number, steps = 48): [Cx[], Cx[]] {
  const z = cScale(zl, 1 / zRef);
  const x = s.x / zRef, b = s.b * zRef;
  const zMid = cScale(s.zMid, 1 / zRef);
  const series = (from: Cx) => Array.from({ length: steps + 1 }, (_, i) => gammaZ(cAdd(from, cx(0, (x * i) / steps))));
  const shunt = (from: Cx) => {
    const y = cInv(from);
    return Array.from({ length: steps + 1 }, (_, i) => gammaY(cAdd(y, cx(0, (b * i) / steps))));
  };
  return s.topology === 'shunt-load' ? [shunt(z), series(zMid)] : [series(z), shunt(zMid)];
}

/** n points spaced logarithmically from a to b, with f0 inserted when it falls inside. */
export function logSweep(a: number, b: number, n: number, f0?: number): number[] {
  const la = Math.log10(a), lb = Math.log10(b);
  const out = Array.from({ length: n }, (_, i) => 10 ** (la + ((lb - la) * i) / (n - 1)));
  if (f0 !== undefined && f0 > a && f0 < b && !out.includes(f0)) {
    out.push(f0);
    out.sort((p, q) => p - q);
  }
  return out;
}
