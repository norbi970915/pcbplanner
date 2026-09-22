// IEC 60664-1 insulation coordination tables (Ed. 2.0 2007; values unchanged in the Ed. 3.0 2020
// committee draft apart from an added 1500 V DC row in F.1). Verified cell by cell against the
// standard text and an independent full reproduction (WAGO, after DIN EN 60664-1 / VDE 0110-1).
import type { DataSource } from './source';

export const IEC60664_SOURCES: DataSource[] = [
  {
    title: 'IEC 60664-1:2007 Ed. 2.0, Insulation coordination for equipment within low-voltage systems, Part 1',
    url: 'https://webstore.iec.ch/en/publication/2522',
    note: 'Tables F.1, F.2, F.4 and A.2; material groups (4.8.1.3); reinforced insulation (5.1.6, 5.2.4). Ed. 3.0 (2020) renumbers F.4 as F.5 with the same values.',
  },
  {
    title: 'WAGO technical appendix: clearances and creepage distances per DIN EN 60664-1 / VDE 0110-1',
    url: 'https://media.distributordatasolutions.com/wago/2019q2/016905c2a43da4cbff81f875da9b4ecd40b69767.pdf',
    note: 'Independent full reproduction of Tables F.1, F.2, F.4 and A.2 used for the cell-by-cell cross-check.',
  },
  {
    title: 'IEC TC109 committee draft 109/166/CD for IEC 60664-1 Ed. 3',
    url: 'https://www.beama.org.uk/static/c1c7dfdf-7e2b-4d9d-9340e9962f25c83c/Insulation-coordination-for-equipment-within-low-voltage-supply-systems-Part-1-Principlesrequirements-and-tests-Proposed-horizontal-standard.pdf',
    note: 'Ed. 3 draft: Tables F.2, F.5 and A.2 identical to Ed. 2; F.1 adds a 1500 V DC row.',
  },
  {
    title: 'Texas Instruments SLUP421, isolation and creepage/clearance seminar',
    url: 'https://www.ti.com/lit/pdf/SLUP421',
    note: 'Partial cross-check of F.1, F.2, F.4 and A.2.',
  },
];

/** Table F.1: rated impulse voltage (V) by line-to-neutral voltage (≤ V) and overvoltage category I…IV. */
export const F1: { v: number; systems: string; ovc: [number, number, number, number] }[] = [
  { v: 50, systems: '', ovc: [330, 500, 800, 1500] },
  { v: 100, systems: '', ovc: [500, 800, 1500, 2500] },
  { v: 150, systems: '120–240 V single-phase', ovc: [800, 1500, 2500, 4000] },
  { v: 300, systems: '230/400 V, 277/480 V', ovc: [1500, 2500, 4000, 6000] },
  { v: 600, systems: '400/690 V', ovc: [2500, 4000, 6000, 8000] },
  { v: 1000, systems: '1000 V', ovc: [4000, 6000, 8000, 12000] },
];

/** Preferred series of impulse withstand voltages (4.2.3), V. */
export const PREFERRED_IMPULSE = [330, 500, 800, 1500, 2500, 4000, 6000, 8000, 12000];

/**
 * Table F.2: minimum clearance in air (mm) up to 2000 m by required impulse withstand voltage (kV).
 * Columns: case A (inhomogeneous) PD1, PD2, PD3; case B (homogeneous) PD1, PD2, PD3.
 * `floorA2` / `floorB2` mark the rows where the PD2 value is the merged 0.2 mm minimum (footnote 3:
 * for printed wiring material the PD1 value applies there instead, but not less than 0.04 mm).
 */
export const F2: { kv: number; a: [number, number, number]; b: [number, number, number]; floorA2: boolean; floorB2: boolean }[] = [
  { kv: 0.33, a: [0.01, 0.2, 0.8], b: [0.01, 0.2, 0.8], floorA2: true, floorB2: true },
  { kv: 0.4, a: [0.02, 0.2, 0.8], b: [0.02, 0.2, 0.8], floorA2: true, floorB2: true },
  { kv: 0.5, a: [0.04, 0.2, 0.8], b: [0.04, 0.2, 0.8], floorA2: true, floorB2: true },
  { kv: 0.6, a: [0.06, 0.2, 0.8], b: [0.06, 0.2, 0.8], floorA2: true, floorB2: true },
  { kv: 0.8, a: [0.1, 0.2, 0.8], b: [0.1, 0.2, 0.8], floorA2: true, floorB2: true },
  { kv: 1.0, a: [0.15, 0.2, 0.8], b: [0.15, 0.2, 0.8], floorA2: true, floorB2: true },
  { kv: 1.2, a: [0.25, 0.25, 0.8], b: [0.2, 0.2, 0.8], floorA2: false, floorB2: true },
  { kv: 1.5, a: [0.5, 0.5, 0.8], b: [0.3, 0.3, 0.8], floorA2: false, floorB2: false },
  { kv: 2.0, a: [1.0, 1.0, 1.0], b: [0.45, 0.45, 0.8], floorA2: false, floorB2: false },
  { kv: 2.5, a: [1.5, 1.5, 1.5], b: [0.6, 0.6, 0.8], floorA2: false, floorB2: false },
  { kv: 3.0, a: [2.0, 2.0, 2.0], b: [0.8, 0.8, 0.8], floorA2: false, floorB2: false },
  { kv: 4.0, a: [3.0, 3.0, 3.0], b: [1.2, 1.2, 1.2], floorA2: false, floorB2: false },
  { kv: 5.0, a: [4.0, 4.0, 4.0], b: [1.5, 1.5, 1.5], floorA2: false, floorB2: false },
  { kv: 6.0, a: [5.5, 5.5, 5.5], b: [2.0, 2.0, 2.0], floorA2: false, floorB2: false },
  { kv: 8.0, a: [8.0, 8.0, 8.0], b: [3.0, 3.0, 3.0], floorA2: false, floorB2: false },
  { kv: 10, a: [11, 11, 11], b: [3.5, 3.5, 3.5], floorA2: false, floorB2: false },
  { kv: 12, a: [14, 14, 14], b: [4.5, 4.5, 4.5], floorA2: false, floorB2: false },
  { kv: 15, a: [18, 18, 18], b: [5.5, 5.5, 5.5], floorA2: false, floorB2: false },
  { kv: 20, a: [25, 25, 25], b: [8.0, 8.0, 8.0], floorA2: false, floorB2: false },
  { kv: 25, a: [33, 33, 33], b: [10, 10, 10], floorA2: false, floorB2: false },
  { kv: 30, a: [40, 40, 40], b: [12.5, 12.5, 12.5], floorA2: false, floorB2: false },
  { kv: 40, a: [60, 60, 60], b: [17, 17, 17], floorA2: false, floorB2: false },
  { kv: 50, a: [75, 75, 75], b: [22, 22, 22], floorA2: false, floorB2: false },
  { kv: 60, a: [90, 90, 90], b: [27, 27, 27], floorA2: false, floorB2: false },
  { kv: 80, a: [130, 130, 130], b: [35, 35, 35], floorA2: false, floorB2: false },
  { kv: 100, a: [170, 170, 170], b: [45, 45, 45], floorA2: false, floorB2: false },
];

/**
 * Table F.4 (Ed. 2) / F.5 (Ed. 3): creepage (mm) to avoid failure by tracking, by RMS voltage.
 * pwb1: printed wiring material PD1 (all groups); pwb2: printed wiring material PD2 (all groups except IIIb);
 * pd1: all material groups; pd2/pd3: material groups [I, II, III]; pd3rib: bracketed values with a rib
 * (footnote 4), where given. null = no value in the table.
 */
export interface F4Row {
  v: number;
  pwb1: number | null;
  pwb2: number | null;
  pd1: number;
  pd2: [number, number, number];
  pd3: [number, number, number] | null;
  pd3rib?: [number | null, number | null, number | null];
  provisional?: boolean; // footnote 3: extrapolated
}

export const F4: F4Row[] = [
  { v: 10, pwb1: 0.025, pwb2: 0.04, pd1: 0.08, pd2: [0.4, 0.4, 0.4], pd3: [1.0, 1.0, 1.0] },
  { v: 12.5, pwb1: 0.025, pwb2: 0.04, pd1: 0.09, pd2: [0.42, 0.42, 0.42], pd3: [1.05, 1.05, 1.05] },
  { v: 16, pwb1: 0.025, pwb2: 0.04, pd1: 0.1, pd2: [0.45, 0.45, 0.45], pd3: [1.1, 1.1, 1.1] },
  { v: 20, pwb1: 0.025, pwb2: 0.04, pd1: 0.11, pd2: [0.48, 0.48, 0.48], pd3: [1.2, 1.2, 1.2] },
  { v: 25, pwb1: 0.025, pwb2: 0.04, pd1: 0.125, pd2: [0.5, 0.5, 0.5], pd3: [1.25, 1.25, 1.25] },
  { v: 32, pwb1: 0.025, pwb2: 0.04, pd1: 0.14, pd2: [0.53, 0.53, 0.53], pd3: [1.3, 1.3, 1.3] },
  { v: 40, pwb1: 0.025, pwb2: 0.04, pd1: 0.16, pd2: [0.56, 0.8, 1.1], pd3: [1.4, 1.6, 1.8] },
  { v: 50, pwb1: 0.025, pwb2: 0.04, pd1: 0.18, pd2: [0.6, 0.85, 1.2], pd3: [1.5, 1.7, 1.9] },
  { v: 63, pwb1: 0.04, pwb2: 0.063, pd1: 0.2, pd2: [0.63, 0.9, 1.25], pd3: [1.6, 1.8, 2.0] },
  { v: 80, pwb1: 0.063, pwb2: 0.1, pd1: 0.22, pd2: [0.67, 0.95, 1.3], pd3: [1.7, 1.9, 2.1] },
  { v: 100, pwb1: 0.1, pwb2: 0.16, pd1: 0.25, pd2: [0.71, 1.0, 1.4], pd3: [1.8, 2.0, 2.2] },
  { v: 125, pwb1: 0.16, pwb2: 0.25, pd1: 0.28, pd2: [0.75, 1.05, 1.5], pd3: [1.9, 2.1, 2.4] },
  { v: 160, pwb1: 0.25, pwb2: 0.4, pd1: 0.32, pd2: [0.8, 1.1, 1.6], pd3: [2.0, 2.2, 2.5] },
  { v: 200, pwb1: 0.4, pwb2: 0.63, pd1: 0.42, pd2: [1.0, 1.4, 2.0], pd3: [2.5, 2.8, 3.2] },
  { v: 250, pwb1: 0.56, pwb2: 1.0, pd1: 0.56, pd2: [1.25, 1.8, 2.5], pd3: [3.2, 3.6, 4.0] },
  { v: 320, pwb1: 0.75, pwb2: 1.6, pd1: 0.75, pd2: [1.6, 2.2, 3.2], pd3: [4.0, 4.5, 5.0] },
  { v: 400, pwb1: 1.0, pwb2: 2.0, pd1: 1.0, pd2: [2.0, 2.8, 4.0], pd3: [5.0, 5.6, 6.3] },
  { v: 500, pwb1: 1.3, pwb2: 2.5, pd1: 1.3, pd2: [2.5, 3.6, 5.0], pd3: [6.3, 7.1, 8.0], pd3rib: [null, null, 7.9] },
  { v: 630, pwb1: 1.8, pwb2: 3.2, pd1: 1.8, pd2: [3.2, 4.5, 6.3], pd3: [8.0, 9.0, 10.0], pd3rib: [7.9, 8.4, 9.0] },
  { v: 800, pwb1: 2.4, pwb2: 4.0, pd1: 2.4, pd2: [4.0, 5.6, 8.0], pd3: [10.0, 11.0, 12.5], pd3rib: [9.0, 9.6, 10.2] },
  { v: 1000, pwb1: 3.2, pwb2: 5.0, pd1: 3.2, pd2: [5.0, 7.1, 10.0], pd3: [12.5, 14.0, 16.0], pd3rib: [10.2, 11.2, 12.8] },
  { v: 1250, pwb1: null, pwb2: null, pd1: 4.2, pd2: [6.3, 9.0, 12.5], pd3: [16.0, 18.0, 20.0], pd3rib: [12.8, 14.4, 16.0] },
  { v: 1600, pwb1: null, pwb2: null, pd1: 5.6, pd2: [8.0, 11.0, 16.0], pd3: [20.0, 22.0, 25.0], pd3rib: [16.0, 17.6, 20.0] },
  { v: 2000, pwb1: null, pwb2: null, pd1: 7.5, pd2: [10.0, 14.0, 20.0], pd3: [25.0, 28.0, 32.0], pd3rib: [20.0, 22.4, 25.6] },
  { v: 2500, pwb1: null, pwb2: null, pd1: 10.0, pd2: [12.5, 18.0, 25.0], pd3: [32.0, 36.0, 40.0], pd3rib: [25.6, 28.8, 32.0] },
  { v: 3200, pwb1: null, pwb2: null, pd1: 12.5, pd2: [16.0, 22.0, 32.0], pd3: [40.0, 45.0, 50.0], pd3rib: [32.0, 36.0, 40.0] },
  { v: 4000, pwb1: null, pwb2: null, pd1: 16.0, pd2: [20.0, 28.0, 40.0], pd3: [50.0, 56.0, 63.0], pd3rib: [40.0, 44.8, 50.4] },
  { v: 5000, pwb1: null, pwb2: null, pd1: 20.0, pd2: [25.0, 36.0, 50.0], pd3: [63.0, 71.0, 80.0], pd3rib: [50.4, 56.8, 64.0] },
  { v: 6300, pwb1: null, pwb2: null, pd1: 25.0, pd2: [32.0, 45.0, 63.0], pd3: [80.0, 90.0, 100.0], pd3rib: [64.0, 72.0, 80.0] },
  { v: 8000, pwb1: null, pwb2: null, pd1: 32.0, pd2: [40.0, 56.0, 80.0], pd3: [100.0, 110.0, 125.0], pd3rib: [80.0, 88.0, 100.0] },
  { v: 10000, pwb1: null, pwb2: null, pd1: 40.0, pd2: [50.0, 71.0, 100.0], pd3: [125.0, 140.0, 160.0], pd3rib: [100.0, 112.0, 128.0] },
  { v: 12500, pwb1: null, pwb2: null, pd1: 50.0, pd2: [63.0, 90.0, 125.0], pd3: null, provisional: true },
  { v: 16000, pwb1: null, pwb2: null, pd1: 63.0, pd2: [80.0, 110.0, 160.0], pd3: null, provisional: true },
  { v: 20000, pwb1: null, pwb2: null, pd1: 80.0, pd2: [100.0, 140.0, 200.0], pd3: null, provisional: true },
  { v: 25000, pwb1: null, pwb2: null, pd1: 100.0, pd2: [125.0, 180.0, 250.0], pd3: null, provisional: true },
  { v: 32000, pwb1: null, pwb2: null, pd1: 125.0, pd2: [160.0, 220.0, 320.0], pd3: null, provisional: true },
  { v: 40000, pwb1: null, pwb2: null, pd1: 160.0, pd2: [200.0, 280.0, 400.0], pd3: null, provisional: true },
  { v: 50000, pwb1: null, pwb2: null, pd1: 200.0, pd2: [250.0, 360.0, 500.0], pd3: null, provisional: true },
  { v: 63000, pwb1: null, pwb2: null, pd1: 250.0, pd2: [320.0, 450.0, 600.0], pd3: null, provisional: true },
];

/** Table A.2: altitude correction factor for clearances above 2000 m. */
export const A2: { m: number; kPa: number; k: number }[] = [
  { m: 2000, kPa: 80.0, k: 1.0 },
  { m: 3000, kPa: 70.0, k: 1.14 },
  { m: 4000, kPa: 62.0, k: 1.29 },
  { m: 5000, kPa: 54.0, k: 1.48 },
  { m: 6000, kPa: 47.0, k: 1.7 },
  { m: 7000, kPa: 41.0, k: 1.95 },
  { m: 8000, kPa: 35.5, k: 2.25 },
  { m: 9000, kPa: 30.5, k: 2.62 },
  { m: 10000, kPa: 26.5, k: 3.02 },
  { m: 15000, kPa: 12.0, k: 6.67 },
  { m: 20000, kPa: 5.5, k: 14.5 },
];

/** Material groups by comparative tracking index (IEC 60112, solution A). */
export const MATERIAL_GROUPS = [
  { id: 'I', cti: 'CTI ≥ 600' },
  { id: 'II', cti: '400 ≤ CTI < 600' },
  { id: 'IIIa', cti: '175 ≤ CTI < 400' },
  { id: 'IIIb', cti: '100 ≤ CTI < 175' },
] as const;
export type MaterialGroup = (typeof MATERIAL_GROUPS)[number]['id'];
