// Where a routed trace runs over no copper on another layer: the reference-plane part of the routing check.
//
// KiCad saves the copper of every filled zone in the board file as (filled_polygon …): the zone outline
// less its cut-outs, the clearances to other nets, the antipads and the removed islands. The fills of each
// copper layer are rasterised (VOID.res, coarser on a large board) and every track is sampled at that
// spacing against every other layer that has fills. A stretch with no copper under it is a void run.
// Runs are joined across the corners of a trace; a run that reaches a free end of the net's routing on
// its layer (a pad or a via) is left out, because the antipad around a via and the voiding under a
// connector pad are there by design. What remains is a trace crossing a split, a slot or a gap.
import { arcOf, VOID, type NetLayerStat, type RawTrack, type RoutingSummary, type VoidStat } from './kicadRouting';

/** One fill polygon of a zone on one copper layer, as x0 y0 x1 y1 … in mm. */
export interface FillPoly {
  layer: string;
  xy: Float64Array;
}

type Box = [number, number, number, number];

interface Raster {
  x0: number;
  y0: number;
  res: number;
  nx: number;
  ny: number;
  bits: Uint8Array;
}

/** Pixels whose centre is inside any of the polygons (each filled even-odd). */
function rasterize(polys: Float64Array[], box: Box): Raster {
  const w = box[2] - box[0];
  const h = box[3] - box[1];
  const res = Math.max(VOID.res, Math.sqrt((w * h) / VOID.maxPixels));
  const nx = Math.max(1, Math.ceil(w / res));
  const ny = Math.max(1, Math.ceil(h / res));
  const bits = new Uint8Array(nx * ny);
  const [x0, y0] = box;
  for (const p of polys) {
    const n = p.length / 2;
    const ya: number[] = [], yb: number[] = [], xa: number[] = [], k: number[] = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      let ax = p[2 * i], ay = p[2 * i + 1], bx = p[2 * j], by = p[2 * j + 1];
      if (ay === by) continue;
      if (ay > by) [ax, ay, bx, by] = [bx, by, ax, ay];
      ya.push(ay);
      yb.push(by);
      xa.push(ax);
      k.push((bx - ax) / (by - ay));
    }
    if (!ya.length) continue;
    const order = ya.map((_, i) => i).sort((a, b) => ya[a] - ya[b]);
    const top = Math.max(...yb);
    const r0 = Math.max(0, Math.ceil((ya[order[0]] - y0) / res - 0.5));
    const r1 = Math.min(ny - 1, Math.floor((top - y0) / res - 0.5));
    let active: number[] = [];
    let next = 0;
    const xs: number[] = [];
    for (let r = r0; r <= r1; r++) {
      const yc = y0 + (r + 0.5) * res;
      while (next < order.length && ya[order[next]] <= yc) active.push(order[next++]);
      active = active.filter((e) => yb[e] > yc);
      xs.length = 0;
      for (const e of active) xs.push(xa[e] + (yc - ya[e]) * k[e]);
      xs.sort((a, b) => a - b);
      const row = r * nx;
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const c0 = Math.max(0, Math.ceil((xs[i] - x0) / res - 0.5));
        const c1 = Math.min(nx - 1, Math.floor((xs[i + 1] - x0) / res - 0.5));
        if (c1 >= c0) bits.fill(1, row + c0, row + c1 + 1);
      }
    }
  }
  return { x0, y0, res, nx, ny, bits };
}

const key = (x: number, y: number) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`;

interface Run {
  len: number;
  at: [number, number]; // middle of the run
  from?: string; // endpoint key the run starts at
  to?: string; // endpoint key the run ends at
}

/** Void runs along one track: sampled at the raster spacing, ends tagged with the track's endpoint keys. */
function runsOf(t: RawTrack, r: Raster, out: Run[]) {
  const arc = t.mx !== undefined && t.my !== undefined ? arcOf(t.x1, t.y1, t.mx, t.my, t.x2, t.y2) : null;
  const len = arc ? arc.r * Math.abs(arc.da) : Math.hypot(t.x2 - t.x1, t.y2 - t.y1);
  if (!(len > 0)) return;
  const n = Math.max(1, Math.ceil(len / r.res));
  const step = len / n;
  const pos = (i: number): [number, number] => {
    const u = (i + 0.5) / n;
    return arc ? [arc.cx + arc.r * Math.cos(arc.a0 + arc.da * u), arc.cy + arc.r * Math.sin(arc.a0 + arc.da * u)] : [t.x1 + (t.x2 - t.x1) * u, t.y1 + (t.y2 - t.y1) * u];
  };
  let run = 0;
  let fromStart = false;
  for (let i = 0; i < n; i++) {
    const [x, y] = pos(i);
    const c = Math.floor((x - r.x0) / r.res);
    const w = Math.floor((y - r.y0) / r.res);
    const covered = c >= 0 && w >= 0 && c < r.nx && w < r.ny && r.bits[w * r.nx + c] === 1;
    if (!covered) {
      if (run === 0) fromStart = i === 0;
      run++;
    } else if (run) {
      out.push({ len: run * step, at: pos(i - Math.ceil(run / 2)), from: fromStart ? key(t.x1, t.y1) : undefined });
      run = 0;
    }
  }
  if (run) out.push({ len: run * step, at: pos(n - Math.ceil(run / 2)), from: fromStart ? key(t.x1, t.y1) : undefined, to: key(t.x2, t.y2) });
}

/** Longest and total void run of one net's tracks on one layer over the copper of a raster. */
function netVoids(tracks: RawTrack[], r: Raster): { longest: number; total: number; at: [number, number] } {
  const degree = new Map<string, number>();
  for (const t of tracks) for (const k of [key(t.x1, t.y1), key(t.x2, t.y2)]) degree.set(k, (degree.get(k) ?? 0) + 1);
  const runs: Run[] = [];
  for (const t of tracks) runsOf(t, r, runs);
  if (!runs.length) return { longest: 0, total: 0, at: [0, 0] };
  // join runs that meet at a corner of the trace (union-find over shared endpoint keys)
  const parent = runs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const byKey = new Map<string, number>();
  runs.forEach((run, i) => {
    for (const k of [run.from, run.to]) {
      if (k === undefined) continue;
      const j = byKey.get(k);
      if (j === undefined) byKey.set(k, i);
      else parent[find(i)] = find(j);
    }
  });
  const groups = new Map<number, { len: number; free: boolean; at: [number, number]; part: number }>();
  runs.forEach((run, i) => {
    const g = groups.get(find(i)) ?? { len: 0, free: false, at: run.at, part: 0 };
    g.len += run.len;
    if (run.len > g.part) {
      g.part = run.len;
      g.at = run.at;
    }
    if ([run.from, run.to].some((k) => k !== undefined && degree.get(k) === 1)) g.free = true;
    groups.set(find(i), g);
  });
  let longest = 0;
  let total = 0;
  let at: [number, number] = [0, 0];
  for (const g of groups.values()) {
    if (g.free || g.len < VOID.report) continue;
    if (g.len > longest) {
      longest = g.len;
      at = g.at;
    }
    total += g.len;
  }
  return { longest, total, at };
}

/**
 * Add the void runs of every net on every layer, against the fills of every other copper layer, to the
 * routing summary (NetLayerStat.voids), and list the layers that have fills (RoutingSummary.filled).
 */
export function addVoids(routing: RoutingSummary, tracks: RawTrack[], fills: FillPoly[], board: Box | null) {
  const byLayer = new Map<string, Float64Array[]>();
  for (const f of fills) if (f.xy.length >= 6) byLayer.set(f.layer, [...(byLayer.get(f.layer) ?? []), f.xy]);
  routing.filled = [...byLayer.keys()];
  if (!byLayer.size) return;
  let box = board;
  if (!box) {
    box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const polys of byLayer.values())
      for (const p of polys)
        for (let i = 0; i < p.length; i += 2) box = [Math.min(box[0], p[i]), Math.min(box[1], p[i + 1]), Math.max(box[2], p[i]), Math.max(box[3], p[i + 1])];
  }
  if (!(box[2] > box[0] && box[3] > box[1])) return;
  const groups = new Map<string, RawTrack[]>(); // net \u0000 layer
  for (const t of tracks) {
    if (!t.net) continue;
    const k = `${t.net}\u0000${t.layer}`;
    const g = groups.get(k);
    if (g) g.push(t);
    else groups.set(k, [t]);
  }
  const stats = new Map<string, NetLayerStat>(routing.nets.flatMap((n) => n.layers.map((l) => [`${n.name}\u0000${l.layer}`, l] as const)));
  for (const [ref, polys] of byLayer) {
    const r = rasterize(polys, box);
    for (const [k, ts] of groups) {
      if (ts[0].layer === ref) continue;
      const v = netVoids(ts, r);
      if (v.longest < VOID.report) continue;
      const s = stats.get(k);
      if (!s) continue;
      const stat: VoidStat = { layer: ref, longest: v.longest, total: v.total, x: Math.round(v.at[0] * 100) / 100, y: Math.round(v.at[1] * 100) / 100 };
      s.voids = [...(s.voids ?? []), stat];
    }
  }
}
