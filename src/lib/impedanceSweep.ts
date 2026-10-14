// One-parameter sweeps of an impedance geometry: the same cross-section with a single input varied
// over a range around its current value. The field solver then gives Z0 (or Zdiff) at each point.
import { resizeBroadside } from './broadside';
import type { Geometry } from './fieldsolver';

export type SweepParam = 'w' | 'h' | 'er' | 's' | 'gap' | 'mask';

export interface SweepDef {
  param: SweepParam;
  label: string;
  /** x values in the units the plot shows: mm for lengths, % change for Dk */
  values: number[];
  current: number;
  kind: 'length' | 'percent';
}

const POINTS = 13;
const linspace = (a: number, b: number, n = POINTS) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));

/** The parameters that exist for this geometry, in display order. */
export function sweepParams(g: Geometry): SweepParam[] {
  return [
    'w',
    'h',
    'er',
    ...(g.diff ? (['s'] as const) : []),
    ...(g.coplanarGap !== undefined ? (['gap'] as const) : []),
    ...(g.mask && g.mask.overTrace > 0 ? (['mask'] as const) : []),
  ];
}

const etchOf = (g: Geometry) => (g.wTop === undefined ? 0 : g.w - g.wTop);

/** Range and labels of a sweep around the geometry's current value. */
export function sweepDef(g: Geometry, param: SweepParam): SweepDef {
  switch (param) {
    case 'w': {
      // keep the narrowest point clearly wider than the etch allowance
      const lo = Math.max(0.5 * g.w, etchOf(g) + 0.05 * g.w);
      return { param, label: 'Trace width W', values: linspace(lo, 1.5 * g.w), current: g.w, kind: 'length' };
    }
    case 'h':
      return { param, label: g.coupling === 'broadside' || g.topPlane !== undefined ? 'Dielectric height H (all dielectrics scaled)' : 'Dielectric height H', values: linspace(0.5 * g.yTrace, 1.5 * g.yTrace), current: g.yTrace, kind: 'length' };
    case 'er':
      return { param, label: 'Dielectric Dk change', values: linspace(-20, 20), current: 0, kind: 'percent' };
    case 's':
      return { param, label: g.coupling === 'broadside' ? 'Inter-layer gap S' : 'Pair spacing S', values: linspace(0.5 * g.s!, 2 * g.s!), current: g.s!, kind: 'length' };
    case 'gap':
      return { param, label: 'Gap to coplanar ground G', values: linspace(0.25 * g.coplanarGap!, 4 * g.coplanarGap!), current: g.coplanarGap!, kind: 'length' };
    case 'mask':
      return { param, label: 'Solder mask thickness over the trace', values: linspace(0, 2 * g.mask!.overTrace), current: g.mask!.overTrace, kind: 'length' };
  }
}

/** The geometry with one parameter set to `value` (mm, or % change for Dk). */
export function sweepGeometry(g: Geometry, param: SweepParam, value: number): Geometry {
  switch (param) {
    case 'w': {
      const etch = etchOf(g);
      return { ...g, w: value, wTop: g.wTop === undefined ? undefined : value - etch };
    }
    case 'h': {
      const scale = value / g.yTrace;
      if (g.coupling === 'broadside') return resizeBroadside(g, scale, g.s! * scale);
      const yTrace = g.yTrace * scale;
      const scaleY = (y: number) => (y <= g.yTrace ? y * scale : yTrace + g.t + (y - g.yTrace - g.t) * scale);
      return {
        ...g,
        yTrace,
        slabs: g.slabs.map((s) => ({ ...s, y0: scaleY(s.y0), y1: scaleY(s.y1) })),
        topPlane: g.topPlane === undefined ? undefined : scaleY(g.topPlane),
        mask: g.mask ? { ...g.mask, surfaceY: yTrace } : undefined,
      };
    }
    case 'er': {
      const k = 1 + value / 100;
      return { ...g, slabs: g.slabs.map((s) => ({ ...s, er: Math.max(1, s.er * k) })) };
    }
    case 's':
      return g.coupling === 'broadside' ? resizeBroadside(g, 1, value) : { ...g, s: value };
    case 'gap':
      return { ...g, coplanarGap: value };
    case 'mask': {
      if (!g.mask || !(value > 0)) return { ...g, mask: undefined };
      // the coating between traces scales with the coating over the trace
      return { ...g, mask: { ...g.mask, overTrace: value, overSubstrate: g.mask.overSubstrate * (value / g.mask.overTrace) } };
    }
  }
}

/** Round axis ticks: about `count` steps of 1, 2 or 5 × 10ⁿ, never more than 12 ticks. */
export function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!(Number.isFinite(lo) && Number.isFinite(hi)) || hi <= lo) return [lo];
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9 && out.length < 12; v += step) out.push(+v.toPrecision(12));
  return out;
}
