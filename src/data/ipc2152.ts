// Curve fits to the IPC-2152 (2009) trace current / temperature-rise data, published by
// Douglas G. Brooks (UltraCAD) with Dr. Johannes Adam (ADAM Research) in
// "Trace Currents and Temperatures Revisited" (April 2015, edited 7/20/15), Eq. 3-2,
// Table 3-1 and Appendix 6.
//
// These are the authors' own regression equations. They are not IPC's copyrighted charts,
// and no IPC chart data is reproduced here.
//
//   ΔT = K · I^a · W^b · Th^c
//   ΔT in °C (rise above ambient), I in A, W (trace width) in mil, Th (thickness) in mil.
//
// Units: the paper does not print units next to Eq. 3-2. Mils for W and Th were confirmed by
// reading the paper's own plots:
//   3 oz (≈4.2 mil), 100 mil, 20 A → ΔT ≈ 100 °C (Fig. 3-5): 215.3·400·100^-1.15 / 4.2 = 103 °C.
//   1 oz (≈1.35 mil), 50 mil, 7.5 A → ΔT ≈ 100 °C (Fig. 3-6).
// Thickness in oz/ft² (as some secondary articles say) does NOT reproduce these plots.
//
// Accuracy and validity, as stated by the authors
// - External: one equation fits the 2 oz and 3 oz external IPC-2152 data ("the fits are
//   obviously extremely good"). There is no separate 1 oz external data set in IPC-2152.
//   The plotted comparisons cover W = 5–200 mil, I up to 20 A and ΔT up to about 100 °C.
//   No numeric error bound is given. In Fig. 3-4 the fit reads a few °C high for the
//   150 and 200 mil curves at ΔT > 60 °C (about 5–10 %).
// - Internal and vacuum: the fitted constants differ by copper weight, and by width in some
//   cases. The authors suspect control problems in the underlying test data.
// - Conditions are those of the IPC-2152 test (IPC-TM-650 2.5.4.1A): a single isolated trace
//   in still air on a board without copper planes. The IPC curves are described as roughly
//   "worst case". Planes, nearby copper and board thickness lower the real temperature.
//   The paper's conclusion is that "trace current/temperature relationships are too complex
//   to represent with equations or graphs; thermal simulation models are required."
// - Printing errors in the paper: Table 3-1 prints the vacuum Th exponent as +1.52, and
//   Appendix 6 prints one 0.5 oz internal entry (≤20 mil) as +1.52. Every other internal and
//   vacuum entry is −1.52, so −1.52 is used for all of them.

import type { DataSource } from './source';

export interface Ipc2152Fit {
  id: string;
  environment: 'external' | 'internal' | 'vacuum';
  /** Copper weight the fit was derived for (oz/ft²); undefined = all thicknesses. */
  copperOz?: number;
  /** Width range (mil) this constant applies to, when the paper gives a width-specific constant. */
  widthMil?: { min?: number; max?: number };
  K: number;
  /** Exponent of current. */
  a: number;
  /** Exponent of width. */
  b: number;
  /** Exponent of thickness. */
  c: number;
  note?: string;
}

/** The single external equation (Eq. 3-2): ΔT = 215.3 · I² · W^-1.15 · Th^-1.0. */
export const IPC2152_EXTERNAL: Ipc2152Fit = {
  id: 'external',
  environment: 'external',
  K: 215.3,
  a: 2,
  b: -1.15,
  c: -1.0,
  note: 'Fits the IPC-2152 2 oz and 3 oz external data with one equation (Brooks & Adam Eq. 3-2).',
};

/** Appendix 6 internal and vacuum fits (less consistent; see the file header). */
export const IPC2152_OTHER_FITS: readonly Ipc2152Fit[] = [
  { id: 'int-0.5-wide', environment: 'internal', copperOz: 0.5, widthMil: { min: 100 }, K: 110, a: 2, b: -1.1, c: -1.52 },
  { id: 'int-0.5-50', environment: 'internal', copperOz: 0.5, widthMil: { min: 50, max: 50 }, K: 125, a: 2, b: -1.1, c: -1.52 },
  { id: 'int-0.5-narrow', environment: 'internal', copperOz: 0.5, widthMil: { max: 20 }, K: 130, a: 2, b: -1.1, c: -1.52, note: 'Paper prints Th^ as +1.52 here (typo).' },
  { id: 'int-1', environment: 'internal', copperOz: 1, K: 200, a: 1.9, b: -1.1, c: -1.52 },
  { id: 'int-2', environment: 'internal', copperOz: 2, K: 300.3, a: 2, b: -1.15, c: -1.52 },
  { id: 'int-3-wide', environment: 'internal', copperOz: 3, widthMil: { min: 50, max: 150 }, K: 300, a: 1.9, b: -1.15, c: -1.52 },
  { id: 'int-3-5', environment: 'internal', copperOz: 3, widthMil: { min: 5, max: 5 }, K: 200, a: 1.9, b: -1.15, c: -1.52 },
  { id: 'int-3-10', environment: 'internal', copperOz: 3, widthMil: { min: 10, max: 10 }, K: 225, a: 1.9, b: -1.15, c: -1.52 },
  { id: 'int-3-15', environment: 'internal', copperOz: 3, widthMil: { min: 15, max: 15 }, K: 240, a: 1.9, b: -1.15, c: -1.52 },
  { id: 'int-3-20', environment: 'internal', copperOz: 3, widthMil: { min: 20, max: 20 }, K: 235, a: 1.9, b: -1.15, c: -1.52 },
  { id: 'vac-0.5-narrow', environment: 'vacuum', copperOz: 0.5, widthMil: { max: 100 }, K: 210, a: 1.9, b: -1.1, c: -1.52 },
  { id: 'vac-0.5-150', environment: 'vacuum', copperOz: 0.5, widthMil: { min: 150, max: 150 }, K: 215, a: 1.9, b: -1.1, c: -1.52 },
  { id: 'vac-0.5-200', environment: 'vacuum', copperOz: 0.5, widthMil: { min: 200, max: 200 }, K: 225, a: 1.9, b: -1.1, c: -1.52 },
  { id: 'vac-0.5-500', environment: 'vacuum', copperOz: 0.5, widthMil: { min: 500, max: 500 }, K: 235, a: 1.9, b: -1.1, c: -1.52 },
  { id: 'vac-2', environment: 'vacuum', copperOz: 2, K: 480, a: 1.9, b: -1.1, c: -1.52 },
  { id: 'vac-3', environment: 'vacuum', copperOz: 3, K: 460, a: 1.95, b: -1.1, c: -1.52 },
];

/** Range over which the external fit was compared with IPC-2152 data in the paper. */
export const IPC2152_EXTERNAL_VALIDITY = {
  widthMil: { min: 5, max: 200 },
  currentA: { max: 20 },
  deltaTC: { max: 100 },
  copperOz: [2, 3] as const,
} as const;

/** Temperature rise (°C) predicted by a fit. */
export function ipc2152DeltaT(fit: Ipc2152Fit, currentA: number, widthMil: number, thicknessMil: number): number {
  return fit.K * Math.pow(currentA, fit.a) * Math.pow(widthMil, fit.b) * Math.pow(thicknessMil, fit.c);
}

/** Current (A) for a given temperature rise, by inverting the fit. */
export function ipc2152Current(fit: Ipc2152Fit, deltaTC: number, widthMil: number, thicknessMil: number): number {
  return Math.pow(deltaTC / (fit.K * Math.pow(widthMil, fit.b) * Math.pow(thicknessMil, fit.c)), 1 / fit.a);
}

/** Width (mil) for a given current and temperature rise, by inverting the fit. */
export function ipc2152Width(fit: Ipc2152Fit, currentA: number, deltaTC: number, thicknessMil: number): number {
  return Math.pow(deltaTC / (fit.K * Math.pow(currentA, fit.a) * Math.pow(thicknessMil, fit.c)), 1 / fit.b);
}

export const SOURCES: readonly DataSource[] = [
  {
    title: 'D. G. Brooks with J. Adam, "Trace Currents and Temperatures Revisited", UltraCAD Design, April 2015 (ed. 7/20/15)',
    url: 'https://www.mathscinotes.com/wp-content/uploads/2016/06/pcbtempr.pdf',
    note: 'Eq. 3-2, Table 3-1, Appendix 6, Figs. 3-4 to 3-6 (fit vs IPC-2152 data). Mirror of the paper originally hosted at ultracad.com.',
  },
  {
    title: 'D. Brooks, J. Adam, "PCB Trace and Via Currents and Temperatures: The Complete Analysis" (book, 2nd ed.)',
    url: 'https://books.google.com/books/about/PCB_Trace_and_Via_Currents_and_Temperatu.html?id=w6bTDAEACAAJ',
    note: 'Book-length treatment by the same authors. Not used for coefficients.',
  },
  {
    title: 'IPC-2152 Standard for Determining Current Carrying Capacity in Printed Board Design (2009)',
    url: 'https://www.electronics.org/TOC/IPC-2152.pdf',
    note: 'The underlying data (copyrighted charts). Not reproduced.',
  },
];
