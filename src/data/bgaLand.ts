// IPC-7351 BGA land approximations.
//
// Provenance
// - Collapsing (collapsible) balls: IPC-7351A Table 14-5 "Land Approximation (mm) for
//   Collapsible Solder Balls". Reproduced identically in two independent documents:
//   (1) Tom Hausherr's IPC Midwest 2007 paper hosted by IPC (all 13 rows) and
//   (2) TI application report SPRACA4, Table 1 "IPC-7351A for NSMD pads" (0.75–0.20 mm rows).
//   IPC-7351B (2010) keeps a table with the same title as Table 14-5 (per IPC's official TOC).
// - Density-level percentages: IPC-7351A Table 3-18 as reproduced in the same Hausherr paper.
//   Collapsing balls: 25 % / 20 % / 15 % land REDUCTION below the nominal ball diameter for
//   density levels A / B / C. Non-collapsing balls or columns: 15 % / 10 % / 5 % land
//   INCREASE above nominal for levels A / B / C. Round to the nearest 0.05 mm ("two-place
//   decimal, i.e. 1.00, 1.05, 1.10").
//   Note: in Table 14-5 the level (and so the percentage) is tied to the BALL SIZE
//   (0.55–0.75 mm → A, 0.25–0.50 mm → B, 0.15–0.20 mm → C), not chosen freely.
// - Non-collapsing per-ball table (IPC-7351B Table 14-6): only ONE secondary source was
//   found (Altium article). Its nominal lands equal ball × (1 + 15/10/5 %) by the same ball
//   size tiers and rounded to 0.01 mm, which agrees with the primary percentage rule. It is
//   flagged `singleSource` and should be shown with that caveat.
// - Ball diameter vs pitch: IPC/EIA J-STD-032 (Oct 2000 interim final draft), Table 1.
//
// Units: millimetres.

import type { DataSource } from './source';

export type DensityLevel = 'A' | 'B' | 'C';

export interface BgaLandRow {
  /** Nominal ball diameter, mm. */
  ball: number;
  /** Reduction (collapsing) or increase (non-collapsing), percent. */
  percent: number;
  level: DensityLevel;
  /** Nominal land diameter, mm. */
  land: number;
  /** Land variation (max, min), mm, as printed. */
  landMax: number;
  landMin: number;
}

/** IPC-7351A Table 14-5, collapsible solder balls (sorted by ball diameter, descending as printed). */
export const BGA_COLLAPSING: readonly BgaLandRow[] = [
  { ball: 0.75, percent: 25, level: 'A', land: 0.55, landMax: 0.6, landMin: 0.5 },
  { ball: 0.65, percent: 25, level: 'A', land: 0.5, landMax: 0.55, landMin: 0.45 },
  { ball: 0.6, percent: 25, level: 'A', land: 0.45, landMax: 0.5, landMin: 0.4 },
  { ball: 0.55, percent: 25, level: 'A', land: 0.4, landMax: 0.45, landMin: 0.35 },
  { ball: 0.5, percent: 20, level: 'B', land: 0.4, landMax: 0.45, landMin: 0.35 },
  { ball: 0.45, percent: 20, level: 'B', land: 0.35, landMax: 0.4, landMin: 0.3 },
  { ball: 0.4, percent: 20, level: 'B', land: 0.3, landMax: 0.35, landMin: 0.25 },
  { ball: 0.35, percent: 20, level: 'B', land: 0.3, landMax: 0.35, landMin: 0.25 },
  { ball: 0.3, percent: 20, level: 'B', land: 0.25, landMax: 0.25, landMin: 0.2 },
  { ball: 0.25, percent: 20, level: 'B', land: 0.2, landMax: 0.2, landMin: 0.17 },
  { ball: 0.2, percent: 15, level: 'C', land: 0.17, landMax: 0.2, landMin: 0.14 },
  { ball: 0.17, percent: 15, level: 'C', land: 0.15, landMax: 0.18, landMin: 0.12 },
  { ball: 0.15, percent: 15, level: 'C', land: 0.13, landMax: 0.15, landMin: 0.1 },
];

/**
 * Non-collapsible solder balls (IPC-7351B Table 14-6 as reproduced by Altium).
 * SINGLE SECONDARY SOURCE: consistent with the primary +15/+10/+5 % rule, but the table
 * itself was not seen in an IPC document. The 0.45 mm row was printed as "0.55–0.40",
 * which breaks the ±0.05 mm pattern of every other A/B row; it is stored here as
 * 0.55–0.45 and flagged.
 */
export const BGA_NON_COLLAPSING: readonly (BgaLandRow & { singleSource: true; note?: string })[] = [
  { ball: 0.75, percent: 15, level: 'A', land: 0.86, landMax: 0.91, landMin: 0.81, singleSource: true },
  { ball: 0.65, percent: 15, level: 'A', land: 0.75, landMax: 0.8, landMin: 0.7, singleSource: true },
  { ball: 0.6, percent: 15, level: 'A', land: 0.69, landMax: 0.74, landMin: 0.64, singleSource: true },
  { ball: 0.55, percent: 15, level: 'A', land: 0.63, landMax: 0.68, landMin: 0.58, singleSource: true },
  { ball: 0.5, percent: 10, level: 'B', land: 0.55, landMax: 0.6, landMin: 0.5, singleSource: true },
  {
    ball: 0.45, percent: 10, level: 'B', land: 0.5, landMax: 0.55, landMin: 0.45, singleSource: true,
    note: 'Source prints 0.55–0.40; corrected to 0.55–0.45 (±0.05 pattern). Unverified.',
  },
  { ball: 0.4, percent: 10, level: 'B', land: 0.44, landMax: 0.49, landMin: 0.39, singleSource: true },
  { ball: 0.35, percent: 10, level: 'B', land: 0.38, landMax: 0.43, landMin: 0.33, singleSource: true },
  { ball: 0.3, percent: 10, level: 'B', land: 0.33, landMax: 0.38, landMin: 0.28, singleSource: true },
  { ball: 0.25, percent: 10, level: 'B', land: 0.27, landMax: 0.32, landMin: 0.22, singleSource: true },
  { ball: 0.2, percent: 5, level: 'C', land: 0.21, landMax: 0.24, landMin: 0.18, singleSource: true },
  { ball: 0.17, percent: 5, level: 'C', land: 0.18, landMax: 0.21, landMin: 0.15, singleSource: true },
  { ball: 0.15, percent: 5, level: 'C', land: 0.16, landMax: 0.19, landMin: 0.13, singleSource: true },
];

/** IPC-7351A Table 3-18: land size change vs. nominal ball diameter per density level, percent. */
export const BGA_DENSITY_PERCENT: Record<'collapsing' | 'nonCollapsing', Record<DensityLevel, number>> = {
  collapsing: { A: -25, B: -20, C: -15 },
  nonCollapsing: { A: 15, B: 10, C: 5 },
};

/** IPC-7351A Table 3-18 courtyard excess, mm, per density level. */
export const BGA_COURTYARD_EXCESS: Record<DensityLevel, number> = { A: 2.0, B: 1.0, C: 0.5 };

/** Density level Table 14-5 assigns to a ball size: 0.55–0.75 → A, 0.25–0.50 → B, below → C. */
export function bgaLevelForBall(ballMm: number): DensityLevel {
  if (ballMm >= 0.55 - 1e-9) return 'A';
  if (ballMm >= 0.25 - 1e-9) return 'B';
  return 'C';
}

/**
 * Land diameter by the IPC-7351A Table 3-18 percentage rule, rounded to the nearest 0.05 mm
 * (the "round-off factor"). For a tabulated ball size, prefer the table rows above: Table 14-5
 * matches this rule for balls ≥ 0.25 mm, but its level-C rows use 0.01 mm rounding
 * (0.20 → 0.17, 0.15 → 0.13, where this rule gives 0.15).
 */
export function bgaLandByRule(ballMm: number, kind: 'collapsing' | 'nonCollapsing', level?: DensityLevel): number {
  const lv = level ?? bgaLevelForBall(ballMm);
  const raw = ballMm * (1 + BGA_DENSITY_PERCENT[kind][lv] / 100);
  return Math.round(raw / 0.05 + 1e-9) * 0.05;
}

export interface BallPitchRow {
  ball: number;
  /** Ball tolerance variation (max, min), mm. */
  ballMax: number;
  ballMin: number;
  /** Pitches this ball size is used at, mm. */
  pitches: readonly number[];
}

/** J-STD-032 (Oct 2000 draft) Table 1 "Current and Future Ball Diameter Sizes". */
export const BGA_BALL_VS_PITCH: readonly BallPitchRow[] = [
  { ball: 0.75, ballMax: 0.9, ballMin: 0.65, pitches: [1.5, 1.27] },
  { ball: 0.6, ballMax: 0.7, ballMin: 0.5, pitches: [1.0] },
  { ball: 0.5, ballMax: 0.55, ballMin: 0.45, pitches: [1.0, 0.8] },
  { ball: 0.45, ballMax: 0.5, ballMin: 0.4, pitches: [1.0, 0.8, 0.75] },
  { ball: 0.4, ballMax: 0.45, ballMin: 0.35, pitches: [0.8, 0.75, 0.65] },
  { ball: 0.3, ballMax: 0.35, ballMin: 0.25, pitches: [0.8, 0.75, 0.65, 0.5] },
  { ball: 0.25, ballMax: 0.28, ballMin: 0.22, pitches: [0.4] },
  { ball: 0.2, ballMax: 0.22, ballMin: 0.18, pitches: [0.3] },
  { ball: 0.15, ballMax: 0.17, ballMin: 0.13, pitches: [0.25] },
];

export const SOURCES: readonly DataSource[] = [
  {
    title: 'T. Hausherr, "Solving the Metric Pitch BGA & Micro BGA Dilemma", IPC Midwest 2007 (hosted by IPC)',
    url: 'https://www.electronics.org/system/files/technical_resource/E14&S03-04.pdf',
    note: 'Reproduces IPC-7351A Table 14-5 (collapsible, all 13 rows) and Table 3-18 (±% per density level, 0.05 mm round-off, courtyard).',
  },
  {
    title: 'Texas Instruments SPRACA4, "AM57xx BGA PCB Design" (Aug 2017), Table 1',
    url: 'https://www.ti.com/lit/an/spraca4/spraca4.pdf',
    note: 'Independent reproduction of IPC-7351A collapsible-ball table, rows 0.75–0.20 mm; identical to Hausherr.',
  },
  {
    title: 'IPC-7351B table of contents (IPC)',
    url: 'https://www.electronics.org/TOC/IPC-7351B.pdf',
    note: '7351B keeps Table 14-5 (collapsible) and adds Table 14-6 (non-collapsible) land approximations and Table 14-4 ball diameter sizes.',
  },
  {
    title: 'Altium, "What\'s In Your BGA Land Pattern and Footprint" (Z. Peterson)',
    url: 'https://resources.altium.com/p/whats-your-bga-land-pattern-and-footprint',
    note: 'Only source found for the per-ball non-collapsing table; values match the +15/+10/+5 % rule. Its collapsing table matches the IPC/TI copies.',
  },
  {
    title: 'PCB Libraries Footprint Expert user guide: Terminal Options',
    url: 'https://www.pcblibraries.com/Products/FPX/UserGuide/Terminal%20Options/',
    note: 'Confirms the ball-size tiers: 0.55–0.75 → A/25 %, 0.25–0.50 → B/20 %, 0.15–0.20 → C/15 %, ±0.05 land tolerance.',
  },
  {
    title: 'IPC/EIA J-STD-032 Performance Standard for Ball Grid Array Balls (Oct 2000 interim final draft), Table 1',
    url: 'https://thor.inemi.org/webdownload/standards/J-STD-032.pdf',
    note: 'Ball diameter, tolerance and pitch table. Draft document; the published standard may differ.',
  },
];
