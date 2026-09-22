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

/** Saturated backward (near-end) crosstalk coefficient from even/odd impedances. */
export const nextCoefficient = (zEven: number, zOdd: number) => (zEven - zOdd) / (2 * (zEven + zOdd));
