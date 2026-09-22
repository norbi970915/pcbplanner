// IPC-2221 Table 6-1 "Electrical Conductor Spacing".
//
// Provenance
// - IPC-2221 (Feb 1998): read directly from the standard's PDF (page 39).
// - IPC-2221A (May 2003): read directly from a scan of the standard (page 43).
//   Every numeric value is identical to the 1998 edition. The only change in the table is
//   the A6 legend, which now reads "... uncoated, sea level to 3050 m [10,007 feet]"
//   (1998: "... uncoated", with no altitude limit).
// - IPC-2221B (Nov 2012): no primary copy was available. Columns B1, B2 and B4 (all rows
//   and the >500 V per-volt values) match two independent secondary sources that
//   explicitly cite IPC-2221B. B3, A5, A6 and A7 could not be checked against a 2221B
//   source. We found no evidence that 2221B changed any value, but that is not proven
//   for those four columns.
// - IPC-2221C (Dec 2023) reworked the columns (clearer solder-mask/coating definitions
//   and new vacuum/altitude categories). It is NOT covered here.
//
// Units: millimetres. Voltage is DC or AC peak between conductors.

import type { DataSource } from './source';

export type SpacingColumn = 'B1' | 'B2' | 'B3' | 'B4' | 'A5' | 'A6' | 'A7';

export const SPACING_COLUMNS: readonly SpacingColumn[] = ['B1', 'B2', 'B3', 'B4', 'A5', 'A6', 'A7'];

/** Column legends as printed under the table (IPC-2221A wording). */
export const SPACING_COLUMN_LABELS: Record<SpacingColumn, string> = {
  B1: 'Bare board: internal conductors',
  B2: 'Bare board: external conductors, uncoated, sea level to 3050 m',
  B3: 'Bare board: external conductors, uncoated, over 3050 m',
  B4: 'Bare board: external conductors, with permanent polymer coating (any elevation)',
  A5: 'Assembly: external conductors, with conformal coating over assembly (any elevation)',
  A6: 'Assembly: external component lead/termination, uncoated, sea level to 3050 m',
  A7: 'Assembly: external component lead/termination, with conformal coating (any elevation)',
};

export interface SpacingBand {
  /** Lower bound of the band, volts (inclusive, as printed). */
  vMin: number;
  /** Upper bound of the band, volts (inclusive, as printed). */
  vMax: number;
  /** Minimum spacing in mm per column. */
  mm: Record<SpacingColumn, number>;
}

/** Table 6-1 rows for 0–500 V. Identical in IPC-2221 (1998) and IPC-2221A (2003). */
export const IPC2221_SPACING_BANDS: readonly SpacingBand[] = [
  { vMin: 0, vMax: 15, mm: { B1: 0.05, B2: 0.1, B3: 0.1, B4: 0.05, A5: 0.13, A6: 0.13, A7: 0.13 } },
  { vMin: 16, vMax: 30, mm: { B1: 0.05, B2: 0.1, B3: 0.1, B4: 0.05, A5: 0.13, A6: 0.25, A7: 0.13 } },
  { vMin: 31, vMax: 50, mm: { B1: 0.1, B2: 0.6, B3: 0.6, B4: 0.13, A5: 0.13, A6: 0.4, A7: 0.13 } },
  { vMin: 51, vMax: 100, mm: { B1: 0.1, B2: 0.6, B3: 1.5, B4: 0.13, A5: 0.13, A6: 0.5, A7: 0.13 } },
  { vMin: 101, vMax: 150, mm: { B1: 0.2, B2: 0.6, B3: 3.2, B4: 0.4, A5: 0.4, A6: 0.8, A7: 0.4 } },
  { vMin: 151, vMax: 170, mm: { B1: 0.2, B2: 1.25, B3: 3.2, B4: 0.4, A5: 0.4, A6: 0.8, A7: 0.4 } },
  { vMin: 171, vMax: 250, mm: { B1: 0.2, B2: 1.25, B3: 6.4, B4: 0.4, A5: 0.4, A6: 0.8, A7: 0.4 } },
  { vMin: 251, vMax: 300, mm: { B1: 0.2, B2: 1.25, B3: 12.5, B4: 0.4, A5: 0.4, A6: 0.8, A7: 0.8 } },
  { vMin: 301, vMax: 500, mm: { B1: 0.25, B2: 2.5, B3: 12.5, B4: 0.8, A5: 0.8, A6: 1.5, A7: 0.8 } },
];

/**
 * ">500 V" row: mm per volt ABOVE 500 V, added to the 301–500 V value (clause 6.3).
 * Worked example in the standard: B1 at 600 V = 0.25 mm + 100 V × 0.0025 mm = 0.50 mm.
 */
export const IPC2221_SPACING_PER_VOLT_ABOVE_500: Record<SpacingColumn, number> = {
  B1: 0.0025,
  B2: 0.005,
  B3: 0.025,
  B4: 0.00305,
  A5: 0.00305,
  A6: 0.00305,
  A7: 0.00305,
};

/** Which columns have been checked against which revision. */
export const IPC2221_SPACING_REVISION_CHECK: Record<SpacingColumn, string> = {
  B1: 'IPC-2221 (1998) and 2221A (2003) primary; 2221B via 2 secondary sources',
  B2: 'IPC-2221 (1998) and 2221A (2003) primary; 2221B via 2 secondary sources',
  B3: 'IPC-2221 (1998) and 2221A (2003) primary; 2221B not independently verified',
  B4: 'IPC-2221 (1998) and 2221A (2003) primary; 2221B via 2 secondary sources',
  A5: 'IPC-2221 (1998) and 2221A (2003) primary; 2221B not independently verified',
  A6: 'IPC-2221 (1998) and 2221A (2003) primary; 2221B not independently verified',
  A7: 'IPC-2221 (1998) and 2221A (2003) primary; 2221B not independently verified',
};

/**
 * Minimum spacing (mm) for a peak voltage, following the table and clause 6.3.
 * The table uses integer-volt bands (0–15, 16–30, …). A non-integer voltage between two
 * bands (e.g. 15.5 V) goes to the higher band, which is the conservative choice.
 */
export function ipc2221Spacing(vPeak: number, column: SpacingColumn): number {
  const v = Math.abs(vPeak);
  if (!Number.isFinite(v)) return NaN;
  if (v > 500) {
    const base = IPC2221_SPACING_BANDS[IPC2221_SPACING_BANDS.length - 1].mm[column];
    return base + (v - 500) * IPC2221_SPACING_PER_VOLT_ABOVE_500[column];
  }
  for (const band of IPC2221_SPACING_BANDS) {
    if (v <= band.vMax) return band.mm[column];
  }
  return NaN; // unreachable
}

export const SOURCES: readonly DataSource[] = [
  {
    title: 'IPC-2221 Generic Standard on Printed Board Design (February 1998), Table 6-1',
    url: 'https://snebulos.mit.edu/projects/reference/commercial/ipc-2221-1998.pdf',
    note: 'Primary. All rows/columns and the >500 V per-volt row transcribed from p. 39; worked 600 V example in 6.3.',
  },
  {
    title: 'IPC-2221A Generic Standard on Printed Board Design (May 2003), Table 6-1',
    url: 'https://www.electronics.org/TOC/IPC-2221A.pdf',
    note: 'Primary, read from a scanned copy of the full standard (p. 43; the URL is IPC\'s official TOC). Numeric values identical to 1998; A6 legend adds "sea level to 3050 m".',
  },
  {
    title: 'smpspowersupply.com: IPC-2221B PCB trace spacing / clearance by voltage (L. Rozenblat)',
    url: 'https://www.smpspowersupply.com/ipc2221pcbclearance.html',
    note: 'Secondary; states it is adapted from IPC-2221B Table 6-1 columns B1, B2, B4. All nine bands match.',
  },
  {
    title: 'PCBSync: IPC-2221 explained (Table 6-1, IPC-2221B)',
    url: 'https://pcbsync.com/ipc-2221/',
    note: 'Secondary; B1/B2/B4 for all nine bands attributed to IPC-2221B match.',
  },
  {
    title: 'IPC-2221B table of contents (IPC)',
    url: 'https://www.electronics.org/TOC/IPC-2221B.pdf',
    note: 'Confirms 2221B keeps Table 6-1 with the same seven categories B1–B4, A5–A7 (TOC only, no values).',
  },
];
