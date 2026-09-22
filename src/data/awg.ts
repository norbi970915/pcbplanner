// American Wire Gauge (AWG) diameters, 0000 (4/0) … 40.
//
// Provenance
// - ASTM B258 defines d(n) = 0.005 in × 92^((36 − n)/39), with 0000 → n = −3, 000 → −2,
//   00 → −1, 0 → 0. Tabulated diameters are rounded to at most 4 significant figures and no
//   finer than 0.0001 in for sizes up to 44 AWG (B258-02, as summarised by Wikipedia).
//   In the 0000–40 range both rules give the same result: round to the nearest 0.0001 in.
// - The table below is from NBS Handbook 100 "Copper Wire Tables" (1966), Table 5
//   (diameter in mils at 20 °C), a primary U.S. government source. It agrees with the formula
//   rounded to 0.0001 in for every size 0000–40 (checked in awg.test.ts) and with the
//   Wikipedia AWG table.
//
// Ampacity: deliberately NOT tabulated. See AMPACITY_NOTES.

import type { DataSource } from './source';

export const MM_PER_INCH = 25.4;

export interface AwgSize {
  /** Display name: '0000', '000', '00', '0', '1', … '40'. */
  name: string;
  /** Gauge index n used in the formula: 0000 = −3, 000 = −2, 00 = −1, 0 = 0, 1 = 1, … */
  n: number;
  /** Nominal diameter, inches (ASTM B258 / NBS HB100 table value). */
  inch: number;
  /** Nominal diameter, mm (inch × 25.4). */
  mm: number;
  /** Cross-section, circular mils (diameter in mils squared). */
  cmil: number;
  /** Cross-section, mm² (π/4·d²). */
  mm2: number;
}

/** NBS Handbook 100 Table 5 diameters in mils, index 0 = 0000 (n = −3) … index 43 = 40. */
const DIAMETER_MILS: readonly number[] = [
  460.0, 409.6, 364.8, 324.9, // 0000, 000, 00, 0
  289.3, 257.6, 229.4, 204.3, 181.9, 162.0, 144.3, 128.5, 114.4, 101.9, // 1–10
  90.7, 80.8, 72.0, 64.1, 57.1, 50.8, 45.3, 40.3, 35.9, 32.0, // 11–20
  28.5, 25.3, 22.6, 20.1, 17.9, 15.9, 14.2, 12.6, 11.3, 10.0, // 21–30
  8.9, 8.0, 7.1, 6.3, 5.6, 5.0, 4.5, 4.0, 3.5, 3.1, // 31–40
];

function awgName(n: number): string {
  return n < 0 ? '0'.repeat(1 - n) : String(n);
}

export const AWG: readonly AwgSize[] = DIAMETER_MILS.map((mils, i) => {
  const n = i - 3;
  const inch = mils / 1000;
  const mm = inch * MM_PER_INCH;
  return { name: awgName(n), n, inch, mm, cmil: mils * mils, mm2: (Math.PI / 4) * mm * mm };
});

/** Exact ASTM B258 defining formula (unrounded), inches. */
export function awgDiameterInch(n: number): number {
  return 0.005 * Math.pow(92, (36 - n) / 39);
}

/** Formula value rounded as tabulated in B258 for 0000–44 AWG (nearest 0.0001 in). */
export function awgDiameterInchRounded(n: number): number {
  return Math.round(awgDiameterInch(n) * 10000) / 10000;
}

/**
 * Annealed copper constants (International Annealed Copper Standard, IEC 1913),
 * from NBS Handbook 100 Appendix: resistivity at 20 °C = 1/58 Ω·mm²/m (0.017241…),
 * = 10.371 Ω·cmil/ft; temperature coefficient of resistance at 20 °C α20 = 0.00393 /°C.
 */
export const IACS_RESISTIVITY_20C_OHM_MM2_PER_M = 1 / 58;
export const IACS_RESISTIVITY_20C_OHM_CMIL_PER_FT = 10.371;
export const IACS_ALPHA_20C = 0.00393;

/** DC resistance of solid annealed copper, Ω per metre, at temperature tC (linear α model). */
export function copperOhmPerMetre(size: AwgSize, tC = 20): number {
  return (IACS_RESISTIVITY_20C_OHM_MM2_PER_M / size.mm2) * (1 + IACS_ALPHA_20C * (tC - 20));
}

/**
 * Why there is no ampacity table here. These conventions exist, with this provenance:
 *
 * 1. NEC (NFPA 70) Table 310.16 (numbered 310.15(B)(16) in the 2011–2017 editions): allowable
 *    ampacity of insulated building wire, not more than three current-carrying conductors in
 *    raceway, cable or earth, 30 °C ambient, with 60 / 75 / 90 °C insulation columns. It is
 *    authoritative for premises wiring only, is copyrighted by NFPA, and its values have
 *    changed between editions. Example: the 2002 edition lists 14 AWG Cu at 20 / 20 / 25 A,
 *    and the 2014 edition (as quoted by Wikipedia) lists 15 / 20 / 25 A. It is further limited
 *    by NEC 240.4(D) for 14–10 AWG. It does not apply to wire inside equipment or on a PCB.
 * 2. "Chassis wiring" and "power transmission" columns (PowerStream's AWG table, which is
 *    copied widely). PowerStream attributes them to the "Handbook of Electronic Tables and
 *    Formulas for American Wire Gauge". It says power transmission uses the "700 circular mils
 *    per amp rule" ("very very conservative") and that chassis wiring is for a single wire in
 *    air, not bundled. Wikipedia cites small-gauge chassis ratings to "Reference Data for
 *    Engineers" 7th ed., Table 11. Neither column states a temperature rise or a test basis,
 *    so they are not included.
 * 3. MIL-W-5088 / SAE AS50881 (aerospace wiring) curves, which depend on bundle size, altitude
 *    and insulation rating. They are too condition-dependent for one table.
 *
 * Recommended approach: compute conductor resistance from the diameter and IACS constants
 * above, then get the temperature rise from a heat balance, ΔT = I²R′ / (h·π·D_outer) per
 * unit length, where h is a user-chosen heat transfer coefficient. Or have the user state the
 * limit as a current density or a voltage drop and compute directly. Premises wiring must use
 * the edition of the NEC (or local code) that applies.
 */
export const AMPACITY_NOTES = 'No ampacity table: see the comment on AMPACITY_NOTES in src/data/awg.ts for provenance and the recommended formula approach.';

export const SOURCES: readonly DataSource[] = [
  {
    title: 'NBS Handbook 100, Copper Wire Tables (1966), Table 5 and Appendix',
    url: 'https://nvlpubs.nist.gov/nistpubs/Legacy/hb/nbshandbook100.pdf',
    note: 'Primary. AWG 0000–40 diameters in mils at 20 °C; IACS 1/58 Ω·mm²/m, 10.371 Ω·cmil/ft, α20 = 0.00393.',
  },
  {
    title: 'ASTM B258 Standard Specification for Standard Nominal Diameters and Cross-Sectional Areas of AWG Sizes',
    url: 'https://store.astm.org/b0258-18r26.html',
    note: 'Defining standard (paywalled). Formula and rounding rule as summarised by Wikipedia.',
  },
  {
    title: 'Wikipedia: American wire gauge',
    url: 'https://en.wikipedia.org/wiki/American_wire_gauge',
    note: 'Formula, B258-02 rounding rule (≤4 significant figures, 0.0001 in resolution through 44 AWG), table cross-check, ampacity provenance.',
  },
  {
    title: 'PowerStream: American Wire Gauge table and AWG electrical current load limits',
    url: 'https://www.powerstream.com/Wire_Size.htm',
    note: 'Origin of the widely copied "chassis wiring" / "power transmission" columns; states the 700 cmil/A rule. Not used for data.',
  },
  {
    title: 'Thomas & Betts / Ocal reprint of NEC 2002 Table 310.16',
    url: 'https://media.distributordatasolutions.com/ThomasAndBetts/v2/part2/files/File_7437_emAlbumalbumsOcal20(USA)oc_1_g_nec31016pdfClickHerea.pdf',
    note: 'Shows that NEC ampacity values depend on the edition (e.g. 14 AWG 60 °C = 20 A in 2002 vs 15 A later).',
  },
];
