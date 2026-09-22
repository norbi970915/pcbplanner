// Stitching-via and via-fence spacing, plane-pair cavity resonances and aperture leakage.
import { C0 } from './units';

/** Wavelength in a dielectric, mm. */
export const wavelengthMm = (fHz: number, er: number) => (C0 / (fHz * Math.sqrt(er))) * 1e3;

/**
 * Resonances of a rectangular plane pair a × b (mm) with open edges (magnetic walls, the
 * cavity model of an unstitched board): f_mn = c/(2√εr) · √((m/a)² + (n/b)²), m, n ≥ 0, not both 0.
 */
export function cavityModes(aMm: number, bMm: number, er: number, fMax: number, limit = 12): { m: number; n: number; f: number }[] {
  const k = C0 / (2 * Math.sqrt(er));
  const out: { m: number; n: number; f: number }[] = [];
  const mMax = Math.ceil((fMax / k) * aMm * 1e-3) + 1;
  const nMax = Math.ceil((fMax / k) * bMm * 1e-3) + 1;
  for (let m = 0; m <= mMax; m++)
    for (let n = 0; n <= nMax; n++) {
      if (m === 0 && n === 0) continue;
      const f = k * Math.hypot(m / (aMm * 1e-3), n / (bMm * 1e-3));
      if (f <= fMax) out.push({ m, n, f });
    }
  return out.sort((x, y) => x.f - y.f).slice(0, limit);
}

/**
 * Lowest resonance of a square cell of a stitching-via grid with pitch s (mm), treating the via
 * rows as shorting walls: the TM11 mode, f = c·√2 / (2 s √εr). Real via rows are leaky walls,
 * so the true resonance is somewhat lower; keep the result well above the highest frequency.
 */
export const gridCellResonance = (sMm: number, er: number) => (C0 * Math.SQRT2) / (2 * sMm * 1e-3 * Math.sqrt(er));

/**
 * Shielding effectiveness of a slot of length L (mm) at frequency f (Ott):
 * SE ≈ 20·log10(λ / (2L)), meaningful for L < λ/2 (0 dB at L = λ/2).
 */
export function apertureSE(lMm: number, fHz: number, er = 1): number {
  const lambda = wavelengthMm(fHz, er);
  return Math.max(0, 20 * Math.log10(lambda / (2 * lMm)));
}
