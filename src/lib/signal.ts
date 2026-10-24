// Signal timing and wave relations.
import { C0 } from './units';

/** Propagation delay in ps per mm for an effective dielectric constant. */
export const delayPsPerMm = (eeff: number) => (Math.sqrt(eeff) / C0) * 1e12 * 1e-3;

/** Velocity as a fraction of c. */
export const velocityFactor = (eeff: number) => 1 / Math.sqrt(eeff);

/** 10–90 % rise time → 3 dB bandwidth (single-pole), Hz. */
export const bandwidthFromRise = (trS: number) => 0.35 / trS;

/** 10–90 % rise time → knee frequency (Johnson), Hz. */
export const kneeFrequency = (trS: number) => 0.5 / trS;

/** Wavelength in a medium, metres. */
export const wavelength = (fHz: number, eeff: number) => C0 / (fHz * Math.sqrt(eeff));

/** Per-unit-length L and C of a line from Z0 and εeff (per metre). */
export function lineLC(z0: number, eeff: number) {
  const v = C0 / Math.sqrt(eeff);
  return { lPerM: z0 / v, cPerM: 1 / (z0 * v) };
}

/**
 * Where a trace stands against the rise time: its delay over the 10–90 % rise time, judged by the common
 * 1/3 rule and the conservative 1/6 rule (Siemens EDA, "Fundamentals of SI (Part 2) – Transmission lines").
 */
export function lineVerdict(delayS: number, trS: number): { ratio: number; kind: 'lumped' | 'borderline' | 'line' } {
  const ratio = delayS / trS;
  return { ratio, kind: ratio <= 1 / 6 + 1e-9 ? 'lumped' : ratio <= 1 / 3 + 1e-9 ? 'borderline' : 'line' };
}

/**
 * A serpentine (meander) that adds length to a trace: bumps of height h (the trace's excursion from its path,
 * centre line), legs a gap apart (edge to edge) of a trace w wide, every 90° corner made of two 45° bends with a
 * diagonal d (TI SPRACP4A Figure 2-16: bends of 135° or more, the diagonal at least 1.5 w; d = 0 for square
 * corners). One bump replaces 2(gap + w) of straight path with two legs and the top and bottom runs, so it adds
 * 2h, less (√2 − 1)·d at each of its four corners. All in mm.
 */
export function serpentine(add: number, h: number, w: number, gap: number, d = 1.5 * w) {
  const m = d / Math.SQRT2; // what each corner takes from each of its two straight runs
  const perBump = 2 * h - 4 * (Math.SQRT2 - 1) * d;
  const bumps = add > 0 && perBump > 0 ? Math.ceil(add / perBump - 1e-9) : 0;
  const pitch = 2 * (gap + w); // along the route, per bump
  return {
    perBump,
    bumps,
    added: bumps * perBump,
    sectionLength: bumps * pitch,
    pitch,
    /** TI SPRACP4A Figure 2-16: parallel runs at least 5 trace widths apart. */
    gapOk: gap >= 5 * w - 1e-9,
    /** The corners fit: a straight part is left on the legs and on the top and bottom runs. */
    fits: h - 2 * m >= -1e-9 && gap + w - 2 * m >= -1e-9,
  };
}

/** Saturated backward (near-end) crosstalk coefficient from even/odd impedances. */
export const nextCoefficient = (zEven: number, zOdd: number) => (zEven - zOdd) / (2 * (zEven + zOdd));
