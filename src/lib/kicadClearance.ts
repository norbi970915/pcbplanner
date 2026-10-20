// Electrical clearance of high-voltage nets on a KiCad board against IPC-2221 Table 6-1.
//
// Every piece of copper on a layer becomes thick segments: a track is its centre line with half its width, a
// via a point with half its diameter, a round pad a point with its radius, any other pad and every zone fill
// the edges of its outline. The gap between two pieces is the distance between their segments less the two
// half widths, measured exactly. For each net given a voltage, the closest copper of every other net on the
// same layer is found and compared with the spacing Table 6-1 asks for the voltage between the two nets
// (nets given no voltage are at 0 V): column B1 on inner layers, B2 (uncoated) or B4 (permanent polymer
// coating) on the outer ones. Spacing through the laminate between layers is not checked.
import { ipc2221Spacing, type SpacingColumn } from '../data/ipc2221Spacing';
import { padPolygon, type BoardDrawing } from './kicadDrawing';
import { arcOf } from './kicadRouting';

export type OuterCoating = 'B2' | 'B4';

export interface ClearanceRequest {
  d: Pick<BoardDrawing, 'copper' | 'tracks' | 'vias' | 'pads' | 'fills'>;
  volts: { net: string; v: number }[]; // peak voltage of each high-voltage net, to the 0 V of the nets left out
  outer: OuterCoating;
}

export interface ClearanceFinding {
  net: string;
  other: string; // '' for copper on no net
  layer: string;
  column: SpacingColumn;
  dv: number; // peak voltage between the two nets
  required: number; // mm
  gap: number; // mm, the closest found
  x1: number; // closest points, on the net and on the other
  y1: number;
  x2: number;
  y2: number;
}

export interface ClearanceResult {
  /** The closest approach of each high-voltage net to each other net on each layer (within the search). */
  pairs: ClearanceFinding[];
  /** The pairs closer than the table allows, the worst margin first. */
  violations: ClearanceFinding[];
  /** Per high-voltage net and layer, its closest approach to any other net. */
  closest: ClearanceFinding[];
  checked: number; // pieces of high-voltage copper checked
}

interface Seg {
  net: string;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  r: number;
}

/** Closest points of segments p1→p2 and q1→q2 (Ericson, Real-Time Collision Detection, 5.1.9). */
export function segSeg(p1x: number, p1y: number, p2x: number, p2y: number, q1x: number, q1y: number, q2x: number, q2y: number) {
  const d1x = p2x - p1x;
  const d1y = p2y - p1y;
  const d2x = q2x - q1x;
  const d2y = q2y - q1y;
  const rx = p1x - q1x;
  const ry = p1y - q1y;
  const a = d1x * d1x + d1y * d1y;
  const e = d2x * d2x + d2y * d2y;
  const f = d2x * rx + d2y * ry;
  let s: number;
  let t: number;
  const EPS = 1e-12;
  if (a <= EPS && e <= EPS) {
    s = 0;
    t = 0;
  } else if (a <= EPS) {
    s = 0;
    t = Math.min(1, Math.max(0, f / e));
  } else {
    const c = d1x * rx + d1y * ry;
    if (e <= EPS) {
      t = 0;
      s = Math.min(1, Math.max(0, -c / a));
    } else {
      const b = d1x * d2x + d1y * d2y;
      const den = a * e - b * b;
      s = den > EPS ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.min(1, Math.max(0, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.min(1, Math.max(0, (b - c) / a));
      }
    }
  }
  const cx = p1x + d1x * s;
  const cy = p1y + d1y * s;
  const dx = q1x + d2x * t;
  const dy = q1y + d2y * t;
  return { d: Math.hypot(cx - dx, cy - dy), cx, cy, dx, dy };
}

/** The copper of each layer as thick segments. */
function layerSegments(d: ClearanceRequest['d']): Map<string, Seg[]> {
  const out = new Map<string, Seg[]>(d.copper.map((l) => [l, []]));
  const poly = (list: Seg[] | undefined, net: string, xy: ArrayLike<number>) => {
    if (!list) return;
    const n = xy.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      list.push({ net, ax: xy[2 * i], ay: xy[2 * i + 1], bx: xy[2 * j], by: xy[2 * j + 1], r: 0 });
    }
  };
  for (const t of d.tracks) {
    const list = out.get(t.layer);
    if (!list) continue;
    const a = t.mx !== undefined && t.my !== undefined ? arcOf(t.x1, t.y1, t.mx, t.my, t.x2, t.y2) : null;
    if (!a) {
      list.push({ net: t.net, ax: t.x1, ay: t.y1, bx: t.x2, by: t.y2, r: t.w / 2 });
      continue;
    }
    // an arc as chords: the chord sags inside the arc by r(1 − cos(θ/2)), kept under 1 µm
    const n = Math.max(2, Math.ceil(Math.abs(a.da) / (2 * Math.acos(Math.max(-1, 1 - 0.001 / Math.max(a.r, 1e-6))))));
    for (let i = 0; i < n; i++) {
      const u0 = a.a0 + (a.da * i) / n;
      const u1 = a.a0 + (a.da * (i + 1)) / n;
      list.push({ net: t.net, ax: a.cx + a.r * Math.cos(u0), ay: a.cy + a.r * Math.sin(u0), bx: a.cx + a.r * Math.cos(u1), by: a.cy + a.r * Math.sin(u1), r: t.w / 2 });
    }
  }
  for (const v of d.vias) {
    const idx = v.layers.map((l) => d.copper.indexOf(l)).filter((i) => i >= 0);
    const [i0, i1] = idx.length >= 2 ? [Math.min(...idx), Math.max(...idx)] : [0, d.copper.length - 1];
    for (let i = i0; i <= i1; i++) out.get(d.copper[i])?.push({ net: v.net, ax: v.x, ay: v.y, bx: v.x, by: v.y, r: (v.size ?? 0.6) / 2 });
  }
  for (const p of d.pads) {
    for (const l of p.layers) {
      if (p.shape === 'circle') out.get(l)?.push({ net: p.net, ax: p.x, ay: p.y, bx: p.x, by: p.y, r: p.w / 2 });
      else poly(out.get(l), p.net, padPolygon(p).flat());
    }
  }
  for (const f of d.fills) poly(out.get(f.layer), f.net, f.xy);
  return out;
}

const outerOf = (copper: string[], layer: string) => layer === copper[0] || layer === copper[copper.length - 1];

export function checkClearance(req: ClearanceRequest): ClearanceResult {
  const { d } = req;
  const volts = new Map(req.volts.filter((x) => Number.isFinite(x.v)).map((x) => [x.net, x.v]));
  const vOf = (net: string) => volts.get(net) ?? 0;
  const pairs = new Map<string, ClearanceFinding>();
  let checked = 0;
  const segs = layerSegments(d);
  for (const [layer, list] of segs) {
    const column: SpacingColumn = outerOf(d.copper, layer) ? req.outer : 'B1';
    const hv = list.filter((s) => volts.has(s.net));
    if (!hv.length) continue;
    // the widest gap the table could ask of this layer: the largest voltage difference to anything
    const vs = [...volts.values(), 0];
    const reach = ipc2221Spacing(Math.max(...vs) - Math.min(...vs), column) + 2; // and 2 mm more, to report the closest copper
    // a grid of the other pieces near the high-voltage copper
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const s of hv) {
      x0 = Math.min(x0, s.ax - s.r, s.bx - s.r);
      y0 = Math.min(y0, s.ay - s.r, s.by - s.r);
      x1 = Math.max(x1, s.ax + s.r, s.bx + s.r);
      y1 = Math.max(y1, s.ay + s.r, s.by + s.r);
    }
    x0 -= reach;
    y0 -= reach;
    x1 += reach;
    y1 += reach;
    const cell = Math.max(reach, 0.5);
    const nx = Math.max(1, Math.ceil((x1 - x0) / cell));
    const ny = Math.max(1, Math.ceil((y1 - y0) / cell));
    const grid = new Map<number, number[]>();
    const span = (s: Seg) => [
      Math.max(0, Math.floor((Math.min(s.ax, s.bx) - s.r - x0) / cell)),
      Math.max(0, Math.floor((Math.min(s.ay, s.by) - s.r - y0) / cell)),
      Math.min(nx - 1, Math.floor((Math.max(s.ax, s.bx) + s.r - x0) / cell)),
      Math.min(ny - 1, Math.floor((Math.max(s.ay, s.by) + s.r - y0) / cell)),
    ];
    list.forEach((s, k) => {
      if (Math.max(s.ax, s.bx) + s.r < x0 || Math.min(s.ax, s.bx) - s.r > x1 || Math.max(s.ay, s.by) + s.r < y0 || Math.min(s.ay, s.by) - s.r > y1) return;
      const [c0, r0, c1, r1] = span(s);
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) {
          const key = r * nx + c;
          const cellList = grid.get(key);
          if (cellList) cellList.push(k);
          else grid.set(key, [k]);
        }
    });
    for (const s of hv) {
      checked++;
      const va = vOf(s.net);
      const [c0, r0, c1, r1] = span(s);
      const seen = new Set<number>();
      for (let r = Math.max(0, r0 - 1); r <= Math.min(ny - 1, r1 + 1); r++)
        for (let c = Math.max(0, c0 - 1); c <= Math.min(nx - 1, c1 + 1); c++)
          for (const k of grid.get(r * nx + c) ?? []) {
            if (seen.has(k)) continue;
            seen.add(k);
            const o = list[k];
            if (o.net === s.net && o.net !== '') continue;
            // two high-voltage nets: each pair once
            if (volts.has(o.net) && o.net < s.net) continue;
            const q = segSeg(s.ax, s.ay, s.bx, s.by, o.ax, o.ay, o.bx, o.by);
            const gap = q.d - s.r - o.r;
            if (gap > reach) continue;
            const key = `${s.net}\u0000${o.net}\u0000${layer}`;
            const best = pairs.get(key);
            if (best && best.gap <= gap) continue;
            // the closest points on the copper edges, not the centre lines
            const len = q.d || 1;
            const ux = (q.dx - q.cx) / len;
            const uy = (q.dy - q.cy) / len;
            const dv = Math.abs(va - vOf(o.net));
            pairs.set(key, {
              net: s.net,
              other: o.net,
              layer,
              column,
              dv,
              required: ipc2221Spacing(dv, column),
              gap,
              x1: q.cx + ux * s.r,
              y1: q.cy + uy * s.r,
              x2: q.dx - ux * o.r,
              y2: q.dy - uy * o.r,
            });
          }
    }
  }
  const all = [...pairs.values()];
  const violations = all.filter((p) => p.gap < p.required - 1e-6).sort((a, b) => a.gap - a.required - (b.gap - b.required));
  const closestMap = new Map<string, ClearanceFinding>();
  for (const p of all) {
    for (const net of volts.has(p.other) ? [p.net, p.other] : [p.net]) {
      const k = `${net}\u0000${p.layer}`;
      const cur = closestMap.get(k);
      if (!cur || p.gap - p.required < cur.gap - cur.required) closestMap.set(k, p);
    }
  }
  return { pairs: all, violations, closest: [...closestMap.values()], checked };
}

/** High-voltage nets in the page address: "/AC_L:325,/HV+:400". */
export function decodeVolts(s: string): { net: string; v: number }[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const i = x.lastIndexOf(':');
      return { net: i > 0 ? decodeURIComponent(x.slice(0, i)) : '', v: i > 0 ? Number(x.slice(i + 1)) : NaN };
    })
    .filter((x) => x.net && Number.isFinite(x.v));
}
export const encodeVolts = (list: { net: string; v: number }[]) => list.map((x) => `${encodeURIComponent(x.net)}:${+x.v.toPrecision(6)}`).join(',');
