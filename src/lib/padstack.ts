// Through-hole padstack sizing after IPC-2221 (land = a + 2b + c, Tables 9-1/9-2),
// IPC-2222 (hole-over-lead allowance, thermal web width) and the IPC-7251 padstack
// charts published by PCB Matrix / PCB Libraries (thermal ID/OD, plane clearance).

export type DensityLevel = 'A' | 'B' | 'C';
export type FabBasis = 'ipc7251' | 'ipc2221';

/** Minimum hole = maximum lead + allowance (IPC-2222 / IPC-7251 density levels), mm. */
export const HOLE_OVER_LEAD: Record<DensityLevel, number> = { A: 0.25, B: 0.2, C: 0.15 };

/** Minimum fabrication allowance used by IPC-7251 land patterns, mm. */
export const FAB_ALLOWANCE_7251: Record<DensityLevel, number> = { A: 0.6, B: 0.5, C: 0.4 };

/** IPC-2221 Table 9-1, minimum standard fabrication allowance (producibility levels), mm. */
export const FAB_ALLOWANCE_2221: Record<DensityLevel, number> = { A: 0.4, B: 0.25, C: 0.2 };

/** IPC-2221 Table 9-2 minimum annular rings (supported holes), mm. */
export const ANNULAR_RING = { external: 0.05, internal: 0.03 };

/** Thermal relief ID over finished hole (IPC-7251 padstack chart, PCB Matrix), mm. */
export const THERMAL_ID_OVER_HOLE: Record<DensityLevel, number> = { A: 0.6, B: 0.4, C: 0.3 };
/** Thermal relief OD over finished hole = plane clearance (same source), mm. */
export const THERMAL_OD_OVER_HOLE: Record<DensityLevel, number> = { A: 1.0, B: 0.7, C: 0.5 };

/** Round up to a grid step (e.g. 0.05 mm), tolerant of floating-point noise. */
export function roundUp(v: number, step: number): number {
  return Math.ceil(v / step - 1e-9) * step;
}

/** Effective diameter of a rectangular lead: its diagonal √(w² + t²). */
export function leadDiagonal(w: number, t: number): number {
  return Math.hypot(w, t);
}

/** IPC-2221 fabrication allowance with the Table 9-1 notes: +0.05 mm per oz above 1 oz, +0.05 mm above 8 layers. */
export function fabAllowance2221(level: DensityLevel, copperOz: number, layers: number): number {
  return FAB_ALLOWANCE_2221[level] + 0.05 * Math.max(0, copperOz - 1) + (layers > 8 ? 0.05 : 0);
}

export interface PadstackInput {
  leadMm: number; // maximum lead diameter (or diagonal)
  level: DensityLevel;
  basis: FabBasis;
  holeTolMm: number; // + tolerance of the finished hole (max hole = hole + tol)
  drillOversizeMm: number; // drilled − finished hole (plating allowance)
  copperOz: number;
  layers: number;
  spokes: number;
  planes: number; // plane layers connected with a thermal relief
  round: boolean; // round hole, pads and thermal to 0.05 mm
  arExtMm?: number; // overrides
  arIntMm?: number;
  faMm?: number;
  antipadOverHoleMm?: number;
}

export function padstack(i: PadstackInput) {
  const r = (v: number) => (i.round ? roundUp(v, 0.05) : v);
  const allowance = HOLE_OVER_LEAD[i.level];
  const hole = r(i.leadMm + allowance);
  const maxHole = hole + i.holeTolMm;
  const drill = hole + i.drillOversizeMm;
  const maxDrill = drill + i.holeTolMm;

  const faDefault = i.basis === 'ipc7251' ? FAB_ALLOWANCE_7251[i.level] : fabAllowance2221(i.level, i.copperOz, i.layers);
  const fa = i.faMm ?? faDefault;
  const arExt = i.arExtMm ?? ANNULAR_RING.external;
  const arInt = i.arIntMm ?? ANNULAR_RING.internal;

  // IPC-2221 §9.1.1: land = a + 2b + c, a = maximum finished (external) or drilled (internal) hole.
  const padOuter = r(maxHole + 2 * arExt + fa);
  const padInnerMin = r(maxDrill + 2 * arInt + fa);
  // IPC-7251 padstack default: inner-layer land equals the outer land.
  const padInner = Math.max(padOuter, padInnerMin);

  const thermalId = r(hole + THERMAL_ID_OVER_HOLE[i.level]);
  const thermalOd = r(hole + THERMAL_OD_OVER_HOLE[i.level]);
  const antipad = i.antipadOverHoleMm !== undefined ? r(hole + i.antipadOverHoleMm) : thermalOd;
  // IPC-2222 §9.1.2: total web width = 60 % of the land diameter, split over the spokes.
  const spokeWidth = roundUp((0.6 * padOuter) / i.spokes, 0.05);
  const webTotal = spokeWidth * i.spokes * i.planes;
  const webLimit = 4.0 / i.copperOz; // 4.0 mm at 1 oz, 2.0 mm at 2 oz

  return {
    allowance,
    hole,
    maxHole,
    drill,
    fa,
    arExt,
    arInt,
    padOuter,
    padInner,
    padInnerMin,
    thermalId,
    thermalOd,
    antipad,
    spokeWidth,
    webTotal,
    webLimit,
    ringExtNominal: (padOuter - hole) / 2,
    ringExtWorst: (padOuter - maxHole - fa) / 2,
    ringIntNominal: (padInner - drill) / 2,
    ringIntWorst: (padInner - maxDrill - fa) / 2,
    planeGap: (antipad - drill) / 2,
  };
}
