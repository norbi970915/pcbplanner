// Twist drill sizes: number (#1–#80), letter (A–Z), fractional (1/64" steps to 1/2")
// and metric PCB drill sizes.
//
// Provenance
// - Number and letter sizes: the inch values used by ANSI/ASME B94.11M (jobber drills).
//   The standard itself is paywalled. The 106 values below were checked automatically for an
//   exact match against two independent references: Wikipedia "Drill bit sizes" (which cites
//   ASME B94.11M) and the ICS Cutting Tools drill-size conversion chart (a drill maker).
//   All 106 agree to 0.0001 in.
// - Fractional sizes: exact n/64 in, by definition (B94.11M gives fractional sizes in
//   1/64 in increments).
// - Metric: the ISO/DIN metric twist drill series has 0.1 mm steps in this range.
//   The 0.2–6.5 mm list is generated (exact decimals), not measured data.
//
// Units: inches (exact decimals as tabulated) and mm (inch × 25.4, exact).

import type { DataSource } from './source';

export const MM_PER_INCH = 25.4;

export interface DrillSize {
  /** Display name, e.g. '#43', 'F', '1/8"', '0.8 mm'. */
  name: string;
  kind: 'number' | 'letter' | 'fraction' | 'metric';
  inch: number;
  mm: number;
}

/** Number drills, index 0 = #1 … index 79 = #80 (inches). */
const NUMBER_INCH: readonly number[] = [
  0.228, 0.221, 0.213, 0.209, 0.2055, 0.204, 0.201, 0.199, 0.196, 0.1935, // #1–#10
  0.191, 0.189, 0.185, 0.182, 0.18, 0.177, 0.173, 0.1695, 0.166, 0.161, // #11–#20
  0.159, 0.157, 0.154, 0.152, 0.1495, 0.147, 0.144, 0.1405, 0.136, 0.1285, // #21–#30
  0.12, 0.116, 0.113, 0.111, 0.11, 0.1065, 0.104, 0.1015, 0.0995, 0.098, // #31–#40
  0.096, 0.0935, 0.089, 0.086, 0.082, 0.081, 0.0785, 0.076, 0.073, 0.07, // #41–#50
  0.067, 0.0635, 0.0595, 0.055, 0.052, 0.0465, 0.043, 0.042, 0.041, 0.04, // #51–#60
  0.039, 0.038, 0.037, 0.036, 0.035, 0.033, 0.032, 0.031, 0.0292, 0.028, // #61–#70
  0.026, 0.025, 0.024, 0.0225, 0.021, 0.02, 0.018, 0.016, 0.0145, 0.0135, // #71–#80
];

/** Letter drills A–Z (inches). */
const LETTER_INCH: readonly number[] = [
  0.234, 0.238, 0.242, 0.246, 0.25, 0.257, 0.261, 0.266, 0.272, 0.277, 0.281, 0.29, 0.295, // A–M
  0.302, 0.316, 0.323, 0.332, 0.339, 0.348, 0.358, 0.368, 0.377, 0.386, 0.397, 0.404, 0.413, // N–Z
];

const mmOf = (inch: number) => inch * MM_PER_INCH;

export const NUMBER_DRILLS: readonly DrillSize[] = NUMBER_INCH.map((inch, i) => ({
  name: `#${i + 1}`,
  kind: 'number' as const,
  inch,
  mm: mmOf(inch),
}));

export const LETTER_DRILLS: readonly DrillSize[] = LETTER_INCH.map((inch, i) => ({
  name: String.fromCharCode(65 + i),
  kind: 'letter' as const,
  inch,
  mm: mmOf(inch),
}));

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Fractional drills 1/64" … 32/64" (= 1/2"), reduced fractions, exact values. */
export const FRACTIONAL_DRILLS: readonly DrillSize[] = Array.from({ length: 32 }, (_, k) => {
  const n = k + 1;
  const g = gcd(n, 64);
  const inch = n / 64;
  return { name: `${n / g}/${64 / g}"`, kind: 'fraction' as const, inch, mm: mmOf(inch) };
});

/** Metric drills 0.2 … 6.5 mm in 0.1 mm steps (values rounded to 0.1 mm to avoid float drift). */
export const METRIC_DRILLS: readonly DrillSize[] = Array.from({ length: 64 }, (_, k) => {
  const mm = (k + 2) / 10;
  return { name: `${mm.toFixed(1)} mm`, kind: 'metric' as const, inch: mm / MM_PER_INCH, mm };
});

/** All inch-series drills (number, letter, fractional) sorted by diameter, ascending. */
export const INCH_DRILLS_SORTED: readonly DrillSize[] = [...NUMBER_DRILLS, ...LETTER_DRILLS, ...FRACTIONAL_DRILLS]
  .slice()
  .sort((a, b) => a.inch - b.inch);

/** Nearest drill in a list to a target diameter in mm. Ties go to the larger drill. */
export function nearestDrill(targetMm: number, list: readonly DrillSize[]): DrillSize | undefined {
  let best: DrillSize | undefined;
  for (const d of list) {
    if (!best) { best = d; continue; }
    const e = Math.abs(d.mm - targetMm);
    const eb = Math.abs(best.mm - targetMm);
    if (e < eb - 1e-12 || (Math.abs(e - eb) <= 1e-12 && d.mm > best.mm)) best = d;
  }
  return best;
}

export const SOURCES: readonly DataSource[] = [
  {
    title: 'Wikipedia: Drill bit sizes (number and letter gauge table)',
    url: 'https://en.wikipedia.org/wiki/Drill_bit_sizes',
    note: 'Cites ASME B94.11M. #1–#80 and A–Z inch values matched the ICS chart exactly (106/106).',
  },
  {
    title: 'ICS Cutting Tools, Drill Size Conversion Chart',
    url: 'https://www.icscuttingtools.com/pdfs/ICS-drill-chart.pdf',
    note: 'Drill manufacturer chart: number, letter and fractional sizes with decimal inch equivalents.',
  },
  {
    title: 'ASME B94.11M Twist Drills (standard, paywalled)',
    url: 'https://www.asme.org/codes-standards/find-codes-standards/b94-11m-twist-drills',
    note: 'Defining standard for the number/letter/fractional series. Not read directly.',
  },
];
