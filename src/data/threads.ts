// Screw threads: ISO metric coarse (M1–M12) and Unified UNC/UNF (#0–3/8").
//
// Provenance
// - Metric coarse pitches: ISO 261/262 (via Wikipedia's ISO 262 table), cross-checked with
//   J C Gupta & Sons and Optimas tap charts. All agree.
// - Metric clearance holes: ISO 273:1979 table (fine / medium / coarse series). Read directly
//   from ISO's official preview of the standard. ISO 273 was later reissued as ISO 20273;
//   EN 20273 / DIN EN 20273 is the same table.
//   Note: some vendor charts (e.g. Optimas) print M12 as 13 / 14 / 15. The ISO 273 table says
//   13 / 13.5 / 14.5, which is used here.
// - Metric common tap drill: the usual DIN 336 / ISO 2306 values. Each value agrees in at
//   least two of: J C Gupta & Sons chart, TR Fastenings, maschinenbaurechner.de, Optimas,
//   Little Machine Shop (75 % column). Known outliers: Little Machine Shop lists 10.3 mm
//   for M12 (75 % thread); TR lists 2.0 mm for M2.5 and 1.4 mm for M1.8. The majority value
//   is used.
// - Unified: major diameter = nominal (ASME B1.1). Tap drill (75 % thread in aluminium, brass
//   and plastics) and close/free clearance drills from the Little Machine Shop chart. Every
//   value for the sizes below matches the TR Fastenings unified table exactly.
//
// Units: metric in mm; unified in inches (plus drill names).

import type { DataSource } from './source';

export interface MetricThread {
  /** Designation, e.g. 'M3'. */
  name: string;
  /** Nominal (major) diameter D, mm. */
  d: number;
  /** Coarse pitch P, mm (ISO 261/262). */
  pitch: number;
  /** ISO 262 choice series: R10 = 1st choice, R20 = 2nd choice. */
  series: 'R10' | 'R20';
  /** D − P rule-of-thumb tap drill, mm (computed). */
  tapDrillDminusP: number;
  /** Common (DIN 336) tap drill, mm. */
  tapDrill: number;
  /** ISO 273 clearance holes, mm. */
  clearance: { fine: number; medium: number; coarse: number };
}

type MetricRaw = [name: string, d: number, pitch: number, series: 'R10' | 'R20', tap: number, fine: number, medium: number, coarse: number];

const METRIC_RAW: readonly MetricRaw[] = [
  ['M1', 1, 0.25, 'R10', 0.75, 1.1, 1.2, 1.3],
  ['M1.2', 1.2, 0.25, 'R10', 0.95, 1.3, 1.4, 1.5],
  ['M1.4', 1.4, 0.3, 'R20', 1.1, 1.5, 1.6, 1.8],
  ['M1.6', 1.6, 0.35, 'R10', 1.25, 1.7, 1.8, 2],
  ['M1.8', 1.8, 0.35, 'R20', 1.45, 2, 2.1, 2.2],
  ['M2', 2, 0.4, 'R10', 1.6, 2.2, 2.4, 2.6],
  ['M2.5', 2.5, 0.45, 'R10', 2.05, 2.7, 2.9, 3.1],
  ['M3', 3, 0.5, 'R10', 2.5, 3.2, 3.4, 3.6],
  ['M3.5', 3.5, 0.6, 'R20', 2.9, 3.7, 3.9, 4.2],
  ['M4', 4, 0.7, 'R10', 3.3, 4.3, 4.5, 4.8],
  ['M5', 5, 0.8, 'R10', 4.2, 5.3, 5.5, 5.8],
  ['M6', 6, 1, 'R10', 5, 6.4, 6.6, 7],
  ['M7', 7, 1, 'R20', 6, 7.4, 7.6, 8],
  ['M8', 8, 1.25, 'R10', 6.8, 8.4, 9, 10],
  ['M10', 10, 1.5, 'R10', 8.5, 10.5, 11, 12],
  ['M12', 12, 1.75, 'R10', 10.2, 13, 13.5, 14.5],
];

export const METRIC_COARSE: readonly MetricThread[] = METRIC_RAW.map(([name, d, pitch, series, tap, fine, medium, coarse]) => ({
  name,
  d,
  pitch,
  series,
  tapDrillDminusP: Math.round((d - pitch) * 1000) / 1000,
  tapDrill: tap,
  clearance: { fine, medium, coarse },
}));

export interface UnifiedThread {
  /** Designation, e.g. '#4-40', '1/4-20'. */
  name: string;
  series: 'UNC' | 'UNF';
  /** Basic major diameter, inches. */
  major: number;
  /** Threads per inch. */
  tpi: number;
  /** Tap drill for ~75 % thread: drill name and diameter (in). */
  tapDrill: { name: string; inch: number };
  /** Close-fit clearance drill. */
  close: { name: string; inch: number };
  /** Free-fit clearance drill. */
  free: { name: string; inch: number };
}

export const UNIFIED: readonly UnifiedThread[] = [
  { name: '#0-80', series: 'UNF', major: 0.06, tpi: 80, tapDrill: { name: '3/64', inch: 0.0469 }, close: { name: '#52', inch: 0.0635 }, free: { name: '#50', inch: 0.07 } },
  { name: '#2-56', series: 'UNC', major: 0.086, tpi: 56, tapDrill: { name: '#50', inch: 0.07 }, close: { name: '#43', inch: 0.089 }, free: { name: '#41', inch: 0.096 } },
  { name: '#4-40', series: 'UNC', major: 0.112, tpi: 40, tapDrill: { name: '#43', inch: 0.089 }, close: { name: '#32', inch: 0.116 }, free: { name: '#30', inch: 0.1285 } },
  { name: '#6-32', series: 'UNC', major: 0.138, tpi: 32, tapDrill: { name: '#36', inch: 0.1065 }, close: { name: '#27', inch: 0.144 }, free: { name: '#25', inch: 0.1495 } },
  { name: '#8-32', series: 'UNC', major: 0.164, tpi: 32, tapDrill: { name: '#29', inch: 0.136 }, close: { name: '#18', inch: 0.1695 }, free: { name: '#16', inch: 0.177 } },
  { name: '#10-24', series: 'UNC', major: 0.19, tpi: 24, tapDrill: { name: '#25', inch: 0.1495 }, close: { name: '#9', inch: 0.196 }, free: { name: '#7', inch: 0.201 } },
  { name: '#10-32', series: 'UNF', major: 0.19, tpi: 32, tapDrill: { name: '#21', inch: 0.159 }, close: { name: '#9', inch: 0.196 }, free: { name: '#7', inch: 0.201 } },
  { name: '1/4-20', series: 'UNC', major: 0.25, tpi: 20, tapDrill: { name: '#7', inch: 0.201 }, close: { name: 'F', inch: 0.257 }, free: { name: 'H', inch: 0.266 } },
  { name: '1/4-28', series: 'UNF', major: 0.25, tpi: 28, tapDrill: { name: '#3', inch: 0.213 }, close: { name: 'F', inch: 0.257 }, free: { name: 'H', inch: 0.266 } },
  { name: '5/16-18', series: 'UNC', major: 0.3125, tpi: 18, tapDrill: { name: 'F', inch: 0.257 }, close: { name: 'P', inch: 0.323 }, free: { name: 'Q', inch: 0.332 } },
  { name: '3/8-16', series: 'UNC', major: 0.375, tpi: 16, tapDrill: { name: '5/16', inch: 0.3125 }, close: { name: 'W', inch: 0.386 }, free: { name: 'X', inch: 0.397 } },
];

export const SOURCES: readonly DataSource[] = [
  {
    title: 'ISO 273:1979 Fasteners — Clearance holes for bolts and screws (official preview, iTeh)',
    url: 'https://cdn.standards.iteh.ai/samples/4183/1a8db2e6de054d2e9bed7d40be64d6e1/ISO-273-1979.pdf',
    note: 'Primary. Complete fine/medium/coarse table M1–M150 is on page 2 of the preview.',
  },
  {
    title: 'Wikipedia: ISO metric screw thread (ISO 262 selected sizes)',
    url: 'https://en.wikipedia.org/wiki/ISO_metric_screw_thread',
    note: 'Coarse pitches and R10/R20 choice series, citing ISO 261/262.',
  },
  {
    title: 'J C Gupta & Sons, Metric Thread Drill & Tap Chart',
    url: 'https://www.jcfasteners.com/wp-content/uploads/2019/02/Tap-Drill-Chart-Metric.pdf',
    note: 'Pitches and tap drills M1–M12 (DIN 336 values); all match.',
  },
  {
    title: 'TR Fastenings, Tapping sizes and clearance holes',
    url: 'https://www.trfastenings.com/Knowledge-Base/Engineering-Data/tapping-sizes-and-clearance-holes',
    note: 'Metric tap drills (M1, M1.2, M1.4 confirmation) and the full unified table (tap/close/free), which matches Little Machine Shop.',
  },
  {
    title: 'maschinenbaurechner.de, Tapping drill & clearance hole chart',
    url: 'https://maschinenbaurechner.de/en/tapping-drill-calculator',
    note: 'M1.6–M12 tap drills and ISO 273 clearance holes; matches ISO 273 including M12 13/13.5/14.5.',
  },
  {
    title: 'Little Machine Shop, Tap & Clearance Drill Sizes (PDF)',
    url: 'https://littlemachineshop.com/reference/TapDrillSizes.pdf',
    note: 'Unified major diameter, TPI, 75 % tap drill, close and free clearance drills.',
  },
];
