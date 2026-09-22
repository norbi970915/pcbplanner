// Power distribution network (PDN): target impedance, plane-pair capacitance and
// decoupling-capacitor impedance. First-order lumped model after E. Bogatin,
// "Signal and Power Integrity – Simplified", and L. D. Smith / I. Novak PDN papers.

/** Vacuum permittivity, F/m (CODATA 2018). */
export const EPS0 = 8.8541878128e-12;

/** Target impedance Z = V · ripple / ΔI, ohm. ripplePct in %, V in volts, ΔI in amperes. */
export function targetImpedance(volts: number, ripplePct: number, stepA: number): number {
  return (volts * (ripplePct / 100)) / stepA;
}

/** Parallel-plate capacitance C = ε0·εr·A/d, farad. Area in mm², separation in mm. */
export function planeCapacitance(areaMm2: number, dielectricMm: number, er: number): number {
  return (EPS0 * er * areaMm2 * 1e-6) / (dielectricMm * 1e-3);
}

/** Plane-pair capacitance per cm² of overlap, farad/cm². */
export function planeCapPerCm2(dielectricMm: number, er: number): number {
  return planeCapacitance(100, dielectricMm, er);
}

/** Series-RLC model of one mounted capacitor. SI units (F, Ω, H). */
export interface CapModel {
  c: number;
  esr: number;
  esl: number;
}

/** Series resonance frequency 1/(2π√(LC)), Hz. */
export function srf(cap: CapModel): number {
  return 1 / (2 * Math.PI * Math.sqrt(cap.esl * cap.c));
}

/** Reactance ωL − 1/(ωC) of one capacitor at f, ohm. */
export function capReactance(cap: CapModel, f: number): number {
  const w = 2 * Math.PI * f;
  return w * cap.esl - 1 / (w * cap.c);
}

/** |Z| of one capacitor at f: √(ESR² + X²), ohm. */
export function capImpedance(cap: CapModel, f: number): number {
  return Math.hypot(cap.esr, capReactance(cap, f));
}

/** Number of identical capacitors in parallel needed so that |Z|/N ≤ Ztarget at f. */
export function capsNeeded(cap: CapModel, f: number, zTarget: number): number {
  return Math.max(1, Math.ceil(capImpedance(cap, f) / zTarget - 1e-9));
}

/**
 * Frequency band in which N identical capacitors in parallel stay at or below
 * Ztarget: |ESR + jX|/N ≤ Zt ⇔ |X| ≤ √((N·Zt)² − ESR²). Solving ωL − 1/(ωC) = ±Xmax
 * for ω gives the two band edges. Returns null if ESR/N alone exceeds Zt.
 */
export function capBand(cap: CapModel, n: number, zTarget: number): { fLow: number; fHigh: number } | null {
  const lim = n * zTarget;
  if (cap.esr >= lim) return null;
  const xMax = Math.sqrt(lim * lim - cap.esr * cap.esr);
  const L = cap.esl, C = cap.c;
  const omega = (x: number) => (x + Math.sqrt(x * x + (4 * L) / C)) / (2 * L);
  return { fLow: omega(-xMax) / (2 * Math.PI), fHigh: omega(xMax) / (2 * Math.PI) };
}

/**
 * |Z| of N identical capacitors in parallel with an ideal plane capacitance:
 * Y = N/(ESR + jX) + jωCplane, |Z| = 1/|Y|. n = 0 gives the plane alone.
 */
export function pdnImpedance(cap: CapModel, n: number, planeC: number, f: number): number {
  const w = 2 * Math.PI * f;
  const x = capReactance(cap, f);
  const d = cap.esr * cap.esr + x * x;
  const g = n > 0 ? (n * cap.esr) / d : 0;
  const b = (n > 0 ? (-n * x) / d : 0) + w * planeC;
  return 1 / Math.hypot(g, b);
}

/** Logarithmically spaced frequencies from f0 to f1 (inclusive). */
export function logSpace(f0: number, f1: number, points: number): number[] {
  const a = Math.log10(f0), b = Math.log10(f1);
  return Array.from({ length: points }, (_, i) => 10 ** (a + ((b - a) * i) / (points - 1)));
}
