// NTC thermistor presets. Every value below was read from the manufacturer's own document
// (links in `source` of each part, checked against the rendered PDF pages, 2026-10-01):
//
// - Vishay NTCLE100E3103: datasheet doc. 29049, rev. 07-May-2025. Page 1: R25 10 kΩ with ±2/3/5 %
//   (suffix G/H/J), B25/85 = 3977 K ±0.75 %, dissipation factor δ = 7 mW/K ("for information only";
//   8.5 mW/K applies only to R25 ≤ 680 Ω), thermal time constant 15 s, −40…+125 °C continuous.
//   Page 10: resistance table of NTCLE100E3103 from −40 to +150 °C (column "NTCLE100E3103***").
// - TDK (EPCOS) B57861S0103F040: datasheet "Miniature sensors with bendable wires, B57861S",
//   January 2018. Page 3: R25 10 kΩ ±1 % (F), R/T characteristic 8016, B25/100 = 3988 K ±1 %.
//   Note: TDK states B25/100, not B25/85. Page 2: δth ≈ 1.5 mW/K in air (50 mm leads),
//   P25 = 60 mW, climatic category 55/155/56. Page 6: R/T 8016 as RT/R25 from −55 to +155 °C.
// - Murata NCP18XH103F03RB: Murata "Product Search Data Sheet" (2015-12-04): R25 10 kΩ ±1 %,
//   B25/50 = 3380 K ±1 %, B25/80 3428 K, B25/85 3434 K, B25/100 3455 K (reference values),
//   typical dissipation constant 1 mW/°C, rated power 100 mW, −40…+125 °C.
//   Resistance table: Murata catalog R44E (Aug. 3, 2018), p. 15, column "NC□□□XH103" (10 kΩ, 3380 K,
//   centre values) from −40 to +125 °C.
//
// The generic 10 kΩ / 3950 K entry is not a datasheet part: it only sets R25 and B, so it carries
// no tolerance, dissipation constant or table.

import type { DataSource } from './source';

export interface NtcPart {
  id: string;
  name: string;
  /** Resistance at 25 °C, Ω. */
  r25: number;
  /** Datasheet B value, K, and the temperature pair (°C) it is defined for. */
  beta: number;
  betaPair: [number, number] | null;
  /** Tolerances, % (null = not part of the preset). */
  rTol: number | null;
  bTol: number | null;
  /** Dissipation constant, mW/K (null = not given). */
  delta: number | null;
  deltaNote?: string;
  /** Operating range from the datasheet, °C. */
  range: [number, number] | null;
  /** Datasheet R/T table: [°C, Ω]. */
  table: readonly (readonly [number, number])[] | null;
  /** Default Steinhart–Hart calibration temperatures (°C, all present in `table`). */
  fit: [number, number, number];
  note: string;
  source: DataSource | null;
}

const VISHAY_10K: readonly (readonly [number, number])[] = [
  [-40, 332094], [-35, 239900], [-30, 175200], [-25, 129287], [-20, 96358], [-15, 72500], [-10, 55046], [-5, 42157],
  [0, 32554], [5, 25339], [10, 19872], [15, 15698], [20, 12488], [25, 10000], [30, 8059], [35, 6535], [40, 5330],
  [45, 4372], [50, 3605], [55, 2989], [60, 2490], [65, 2084], [70, 1753], [75, 1481], [80, 1256], [85, 1070],
  [90, 915.4], [95, 786.0], [100, 677.3], [105, 585.7], [110, 508.3], [115, 442.6], [120, 386.6], [125, 338.7],
  [130, 297.7], [135, 262.4], [140, 231.9], [145, 205.5], [150, 182.6],
];

/** TDK R/T characteristic 8016 as RT/R25, scaled to R25 = 10 kΩ below. */
const TDK_8016_RATIO: readonly (readonly [number, number])[] = [
  [-55, 96.3], [-50, 67.01], [-45, 47.17], [-40, 33.65], [-35, 24.26], [-30, 17.7], [-25, 13.04], [-20, 9.707],
  [-15, 7.293], [-10, 5.533], [-5, 4.232], [0, 3.265], [5, 2.539], [10, 1.99], [15, 1.571], [20, 1.249], [25, 1.0],
  [30, 0.8057], [35, 0.6531], [40, 0.5327], [45, 0.4369], [50, 0.3603], [55, 0.2986], [60, 0.2488], [65, 0.2083],
  [70, 0.1752], [75, 0.1481], [80, 0.1258], [85, 0.1072], [90, 0.09177], [95, 0.07885], [100, 0.068], [105, 0.05886],
  [110, 0.05112], [115, 0.04454], [120, 0.03893], [125, 0.03417], [130, 0.03009], [135, 0.02654], [140, 0.02348],
  [145, 0.02083], [150, 0.01853], [155, 0.01653],
];

/** Murata R44E, NC□□□XH103 column, kΩ. */
const MURATA_XH103_K: readonly (readonly [number, number])[] = [
  [-40, 195.652], [-35, 148.171], [-30, 113.347], [-25, 87.559], [-20, 68.237], [-15, 53.65], [-10, 42.506], [-5, 33.892],
  [0, 27.219], [5, 22.021], [10, 17.926], [15, 14.674], [20, 12.081], [25, 10.0], [30, 8.315], [35, 6.948], [40, 5.834],
  [45, 4.917], [50, 4.161], [55, 3.535], [60, 3.014], [65, 2.586], [70, 2.228], [75, 1.925], [80, 1.669], [85, 1.452],
  [90, 1.268], [95, 1.11], [100, 0.974], [105, 0.858], [110, 0.758], [115, 0.672], [120, 0.596], [125, 0.531],
];

export const NTC_PARTS: readonly NtcPart[] = [
  {
    id: 'vishay',
    name: 'Vishay NTCLE100E3103JB0',
    r25: 10e3,
    beta: 3977,
    betaPair: [25, 85],
    rTol: 5,
    bTol: 0.75,
    delta: 7,
    deltaNote: 'Vishay: dissipation factor 7 mW/K, for information only (leaded part in air).',
    range: [-40, 125],
    table: VISHAY_10K,
    fit: [-40, 25, 125],
    note: 'Radial leaded, R25 ±5 % (J; also ±3 % H and ±2 % G), B25/85 = 3977 K ±0.75 %.',
    source: {
      title: 'Vishay BCcomponents NTCLE100E3 datasheet, doc. 29049, rev. 07-May-2025',
      url: 'https://www.vishay.com/docs/29049/ntcle100.pdf',
      note: 'Pages 1–2: R25, B25/85 = 3977 K ±0.75 %, R25 tolerance codes, δ = 7 mW/K, operating range. Page 10: R/T table of NTCLE100E3103 (−40 to +150 °C).',
    },
  },
  {
    id: 'tdk',
    name: 'TDK B57861S0103F040',
    r25: 10e3,
    beta: 3988,
    betaPair: [25, 100],
    rTol: 1,
    bTol: 1,
    delta: 1.5,
    deltaNote: 'TDK: dissipation factor approx. 1.5 mW/K in air (50 mm leads).',
    range: [-55, 155],
    table: TDK_8016_RATIO.map(([t, k]) => [t, Number((k * 10e3).toPrecision(6))] as const),
    fit: [-40, 25, 125],
    note: 'Epoxy miniature sensor, R25 ±1 % (F), R/T characteristic 8016, B25/100 = 3988 K ±1 %. TDK specifies B25/100, not B25/85.',
    source: {
      title: 'TDK (EPCOS) NTC thermistors, miniature sensors with bendable wires, B57861S, January 2018',
      url: 'https://www.tdk-electronics.tdk.com/inf/50/db/ntc/NTC_Mini_sensors_S861.pdf',
      note: 'Page 2: δth ≈ 1.5 mW/K, P25 = 60 mW, 55/155/56. Page 3: B57861S0103+040, R/T 8016, B25/100 = 3988 K ±1 %. Page 6: R/T 8016 as RT/R25.',
    },
  },
  {
    id: 'murata',
    name: 'Murata NCP18XH103F03RB',
    r25: 10e3,
    beta: 3380,
    betaPair: [25, 50],
    rTol: 1,
    bTol: 1,
    delta: 1,
    deltaNote: 'Murata: typical dissipation constant 1 mW/°C at 25 °C (0603 chip).',
    range: [-40, 125],
    table: MURATA_XH103_K.map(([t, k]) => [t, Number((k * 1e3).toPrecision(6))] as const),
    fit: [-40, 25, 125],
    note: '0603 chip, R25 ±1 %, B25/50 = 3380 K ±1 % (reference: B25/85 = 3434 K, B25/100 = 3455 K).',
    source: {
      title: 'Murata NCP18XH103F03RB product data sheet and NTC thermistor catalog R44E (Aug. 3, 2018)',
      url: 'https://www.farnell.com/datasheets/2048079.pdf',
      note: 'Murata Product Search Data Sheet (2015-12-04, distributor copy): R25, tolerances, B25/50 = 3380 K, reference B values, 1 mW/°C, 100 mW. R/T centre values from catalog R44E p. 15, column NC□□□XH103 (copy: datasheet.octopart.com/NCP18XV103J03RB-Murata-datasheet-115026483.pdf).',
    },
  },
  {
    id: 'generic',
    name: 'Generic 10 kΩ, B = 3950 K',
    r25: 10e3,
    beta: 3950,
    betaPair: null,
    rTol: null,
    bTol: null,
    delta: null,
    range: null,
    table: null,
    fit: [-40, 25, 125],
    note: 'Sets R25 and B only. Without a datasheet table the Steinhart–Hart points are generated from the Beta model, so both models agree.',
    source: null,
  },
];

export const partById = (id: string) => NTC_PARTS.find((p) => p.id === id);

/** Resistance from a part's table at an exact table temperature, or undefined. */
export const tableR = (part: NtcPart | undefined, tC: number) => part?.table?.find(([t]) => Math.abs(t - tC) < 1e-9)?.[1];
