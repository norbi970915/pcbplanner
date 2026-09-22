// Planar spiral inductor: DC inductance after S. S. Mohan, M. del Mar Hershenson,
// S. P. Boyd, T. H. Lee, "Simple Accurate Expressions for Planar Spiral
// Inductances", IEEE JSSC 34(10), pp. 1419–1424, Oct. 1999.
import { MU0, rhoCu } from './copper';

export type SpiralShape = 'square' | 'hexagonal' | 'octagonal' | 'circular';

/** Table I of Mohan et al.: modified Wheeler coefficients (no entry for the circle). */
export const WHEELER: Record<Exclude<SpiralShape, 'circular'>, { k1: number; k2: number }> = {
  square: { k1: 2.34, k2: 2.75 },
  hexagonal: { k1: 2.33, k2: 3.82 },
  octagonal: { k1: 2.25, k2: 3.55 },
};

/** Table II of Mohan et al.: current-sheet coefficients. */
export const CURRENT_SHEET: Record<SpiralShape, { c1: number; c2: number; c3: number; c4: number }> = {
  square: { c1: 1.27, c2: 2.07, c3: 0.18, c4: 0.13 },
  hexagonal: { c1: 1.09, c2: 2.23, c3: 0.0, c4: 0.17 },
  octagonal: { c1: 1.07, c2: 2.29, c3: 0.0, c4: 0.19 },
  circular: { c1: 1.0, c2: 2.46, c3: 0.0, c4: 0.2 },
};

/** Number of polygon sides (Infinity for a circle). */
export const SIDES: Record<SpiralShape, number> = { square: 4, hexagonal: 6, octagonal: 8, circular: Infinity };

/** Inner diameter from the outer one: d_in = d_out − 2n·w − 2(n−1)·s. */
export function innerFromOuter(dOut: number, n: number, w: number, s: number): number {
  return dOut - 2 * n * w - 2 * (n - 1) * s;
}

/** Outer diameter from the inner one: d_out = d_in + 2n·w + 2(n−1)·s. */
export function outerFromInner(dIn: number, n: number, w: number, s: number): number {
  return dIn + 2 * n * w + 2 * (n - 1) * s;
}

/**
 * Perimeter of the shape per unit "diameter". The diameter of a polygon is taken
 * across flats (as drawn in Fig. 1 of Mohan et al.), so P = N·d·tan(π/N):
 * 4 for a square, 3.464 for a hexagon, 3.314 for an octagon, π for a circle.
 */
export function perimeterFactor(shape: SpiralShape): number {
  const N = SIDES[shape];
  return Number.isFinite(N) ? N * Math.tan(Math.PI / N) : Math.PI;
}

export interface SpiralInput {
  shape: SpiralShape;
  n: number; // turns
  wMm: number; // trace width
  sMm: number; // spacing
  dOutMm: number; // outer diameter
  tMm: number; // copper thickness
  freqHz: number; // frequency for the Q estimate
  tempC?: number;
}

export function spiral(i: SpiralInput) {
  const dIn = innerFromOuter(i.dOutMm, i.n, i.wMm, i.sMm);
  const dAvg = (i.dOutMm + dIn) / 2;
  const rho = (i.dOutMm - dIn) / (i.dOutMm + dIn); // fill ratio
  const dAvgM = dAvg * 1e-3;

  const wh = i.shape === 'circular' ? null : WHEELER[i.shape];
  const lWheeler = wh ? (wh.k1 * MU0 * i.n * i.n * dAvgM) / (1 + wh.k2 * rho) : NaN;

  const c = CURRENT_SHEET[i.shape];
  const lSheet = ((MU0 * i.n * i.n * dAvgM * c.c1) / 2) * (Math.log(c.c2 / rho) + c.c3 * rho + c.c4 * rho * rho);

  // Concentric-ring approximation: turn k has centreline diameter d_out − w − 2k(w+s);
  // the mean over k = 0…n−1 is exactly d_avg, so the total length is n·P·d_avg.
  const lengthMm = i.n * perimeterFactor(i.shape) * dAvg;
  const rDc = (rhoCu(i.tempC ?? 20) * lengthMm * 1e-3) / (i.wMm * 1e-3 * i.tMm * 1e-3);
  const L = Number.isFinite(lWheeler) ? lWheeler : lSheet;
  const q = (2 * Math.PI * i.freqHz * L) / rDc;
  const qSheet = (2 * Math.PI * i.freqHz * lSheet) / rDc;

  return { dIn, dAvg, rho, lWheeler, lSheet, lengthMm, rDc, q, qSheet, spacingRatio: i.sMm / i.wMm };
}
