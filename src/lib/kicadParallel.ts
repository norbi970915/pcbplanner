// Where two nets of a KiCad board run in parallel on one copper layer: the coupled length, the
// edge-to-edge spacing and each net's width there, for the Crosstalk Calculator's "From KiCad Project".
//
// The geometry is the routing check's gap measurement (kicadRouting.ts, measureCoupling and gapRuns):
// segments and arcs (arcs cut into chords of at most COUPLING.arcStepDeg, each chord scaled back to arc
// length) become straight pieces in a uniform grid. For every piece of one net, each piece of the other
// net that is parallel within PARALLEL.parallelDeg is projected onto it (the overlap of the two, as in
// KiCad's diff-pair DRC, commonParallelProjection), the centre distance is taken at the middle of the
// overlap and the half widths are taken off. Where several pieces overlap the same stretch, the nearest
// one counts. Overlapping copper is not a parallel run. The measurement runs along both nets and the
// coupled length is the mean of the two.
//
// What differs from a differential pair: two unrelated nets have no "dominant gap" to stay close to, so
// a stretch counts as coupled wherever the edge spacing is at most PARALLEL.gapWidths times the wider of
// the two nets' widths on the layer, and never less than PARALLEL.gapMin.
import { arcOf, COUPLING, trackLength, type RawTrack } from './kicadRouting';

export const PARALLEL = {
  /** Two pieces are parallel when their directions differ by at most this angle (the routing check's rule). */
  parallelDeg: COUPLING.parallelDeg,
  /** A stretch is coupled when the edge spacing is at most this multiple of the wider trace … */
  gapWidths: 5,
  /** … or this much (mm), whichever is larger. */
  gapMin: 0.5,
  /** Spacing values are binned to this resolution (mm) to find the dominant spacing. */
  bin: COUPLING.bin,
  /** Spacing values carrying less than this share of the coupled length are left out of the range (min–max). */
  rangeShare: 0.02,
  /** Nets listed as nearest neighbours of an aggressor. */
  neighbours: 8,
};

/** Largest edge spacing (mm) counted as coupled for two traces of these widths. */
export const maxCoupledGap = (wA: number, wB: number) => Math.max(PARALLEL.gapWidths * Math.max(wA, wB), PARALLEL.gapMin);

/* ------------------------------------------------------------------ pieces and the grid (as kicadRouting.ts) */

interface Piece {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  len: number;
  ux: number;
  uy: number;
  w: number;
  scale: number; // chord length → arc length
  net: number;
}

function piecesOf(tracks: RawTrack[], net: number, out: Piece[] = []): Piece[] {
  const push = (x1: number, y1: number, x2: number, y2: number, w: number, scale: number) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 1e-6) return;
    out.push({ x1, y1, x2, y2, len, ux: (x2 - x1) / len, uy: (y2 - y1) / len, w, scale, net });
  };
  for (const t of tracks) {
    const a = t.mx !== undefined && t.my !== undefined ? arcOf(t.x1, t.y1, t.mx, t.my, t.x2, t.y2) : null;
    if (!a) {
      push(t.x1, t.y1, t.x2, t.y2, t.w, 1);
      continue;
    }
    const n = Math.max(1, Math.ceil(Math.abs(a.da) / ((COUPLING.arcStepDeg * Math.PI) / 180)));
    const step = a.da / n;
    const chord = 2 * a.r * Math.sin(Math.abs(step) / 2);
    const scale = chord > 0 ? (a.r * Math.abs(step)) / chord : 1;
    let px = t.x1;
    let py = t.y1;
    for (let i = 1; i <= n; i++) {
      const ang = a.a0 + step * i;
      const qx = i === n ? t.x2 : a.cx + a.r * Math.cos(ang);
      const qy = i === n ? t.y2 : a.cy + a.r * Math.sin(ang);
      push(px, py, qx, qy, t.w, scale);
      px = qx;
      py = qy;
    }
  }
  return out;
}

class Grid {
  private cells = new Map<number, number[]>();
  private stamp: Int32Array;
  private tick = 0;
  readonly items: Piece[];
  private cell: number;
  constructor(pieces: Piece[], cell: number) {
    this.items = pieces;
    this.cell = cell;
    this.stamp = new Int32Array(pieces.length);
    pieces.forEach((p, i) => {
      this.cover(Math.min(p.x1, p.x2), Math.min(p.y1, p.y2), Math.max(p.x1, p.x2), Math.max(p.y1, p.y2), (k) => {
        const l = this.cells.get(k);
        if (l) l.push(i);
        else this.cells.set(k, [i]);
      });
    });
  }
  private cover(x0: number, y0: number, x1: number, y1: number, f: (k: number) => void) {
    const c = this.cell;
    const i0 = Math.floor(x0 / c);
    const i1 = Math.floor(x1 / c);
    const j0 = Math.floor(y0 / c);
    const j1 = Math.floor(y1 / c);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) f((i + 50000) * 100000 + (j + 50000));
  }
  near(x0: number, y0: number, x1: number, y1: number): number[] {
    const out: number[] = [];
    const t = ++this.tick;
    this.cover(x0, y0, x1, y1, (k) => {
      for (const i of this.cells.get(k) ?? []) {
        if (this.stamp[i] === t) continue;
        this.stamp[i] = t;
        out.push(i);
      }
    });
    return out;
  }
}

type Emit = (net: number, gap: number, len: number, wFrom: number, wTo: number) => void;

/**
 * Edge spacing along every piece of `from` to the nearest parallel piece of each net in the grid, as
 * runs (net, spacing, length along `from`, width of `from`, width of the other). `maxGap(q)` is the
 * largest spacing counted for a candidate piece; `search` bounds the centre distance.
 */
function runsAlong(from: Piece[], grid: Grid, search: number, maxGap: (q: Piece) => number, emit: Emit) {
  const cosTol = Math.cos((PARALLEL.parallelDeg * Math.PI) / 180);
  const to = grid.items;
  const ivs: { net: number; lo: number; hi: number; g: number; w: number }[] = [];
  for (const p of from) {
    ivs.length = 0;
    for (const k of grid.near(Math.min(p.x1, p.x2) - search, Math.min(p.y1, p.y2) - search, Math.max(p.x1, p.x2) + search, Math.max(p.y1, p.y2) + search)) {
      const q = to[k];
      if (Math.abs(p.ux * q.ux + p.uy * q.uy) < cosTol) continue;
      const ta = (q.x1 - p.x1) * p.ux + (q.y1 - p.y1) * p.uy;
      const tb = (q.x2 - p.x1) * p.ux + (q.y2 - p.y1) * p.uy;
      const lo = Math.max(0, Math.min(ta, tb));
      const hi = Math.min(p.len, Math.max(ta, tb));
      if (hi - lo < 1e-6) continue;
      const tm = (lo + hi) / 2;
      const d = Math.abs(q.ux * (p.y1 + p.uy * tm - q.y1) - q.uy * (p.x1 + p.ux * tm - q.x1));
      if (d > search) continue;
      const g = d - (p.w + q.w) / 2;
      if (g < -1e-6 || g > maxGap(q)) continue; // overlapping copper, or too far apart to count
      ivs.push({ net: q.net, lo, hi, g: Math.max(0, g), w: q.w });
    }
    if (!ivs.length) continue;
    if (ivs.length > 1) ivs.sort((a, b) => a.net - b.net);
    // lower envelope over the elementary intervals, per net
    for (let s = 0; s < ivs.length; ) {
      let e = s;
      while (e < ivs.length && ivs[e].net === ivs[s].net) e++;
      const group = ivs.slice(s, e);
      const cuts = [...new Set(group.flatMap((v) => [v.lo, v.hi]))].sort((a, b) => a - b);
      for (let i = 0; i + 1 < cuts.length; i++) {
        const m = (cuts[i] + cuts[i + 1]) / 2;
        let best: (typeof group)[number] | null = null;
        for (const v of group) if (v.lo <= m && m <= v.hi && (!best || v.g < best.g)) best = v;
        if (best) emit(best.net, best.g, (cuts[i + 1] - cuts[i]) * p.scale, p.w, best.w);
      }
      s = e;
    }
  }
}

/* ------------------------------------------------------------------ statistics */

const bestKey = (m: Map<number, number>) => {
  let k0 = 0;
  let l0 = -1;
  for (const [k, l] of m) if (l > l0 + 1e-12 || (Math.abs(l - l0) <= 1e-12 && k < k0)) [k0, l0] = [k, l];
  return k0;
};
const add = (m: Map<number, number>, k: number, l: number) => m.set(k, (m.get(k) ?? 0) + l);

/** Length-weighted dominant width of tracks (0.1 µm bins, as the routing summary); 0 for none. */
export function dominantWidth(tracks: RawTrack[]): number {
  if (!tracks.length) return 0;
  const m = new Map<number, number>();
  for (const t of tracks) add(m, Math.round(t.w * 1e4), trackLength(t));
  return bestKey(m) / 1e4;
}

class GapStats {
  len = 0;
  gaps = new Map<number, number>();
  widthsFrom = new Map<number, number>();
  push(g: number, l: number, w: number) {
    this.len += l;
    add(this.gaps, Math.round(g / PARALLEL.bin), l);
    add(this.widthsFrom, Math.round(w * 1e4), l);
  }
}

export interface ParallelMeasure {
  /** Coupled length, mm: the mean of the length measured along each net. 0 when the nets never run in parallel. */
  coupled: number;
  coupledA: number;
  coupledB: number;
  /** Length-weighted dominant edge-to-edge spacing of the coupled stretches, mm. */
  gap?: number;
  /** Smallest and largest spacing that carries at least PARALLEL.rangeShare of the coupled length. */
  gapMin?: number;
  gapMax?: number;
  /** Dominant width of each net over its coupled stretches, mm. */
  wA?: number;
  wB?: number;
  /** The largest spacing that counted as coupled, mm. */
  maxGap: number;
}

/**
 * Parallel runs of net A (tracks `ta`) and net B (`tb`) on one layer. `maxGap` overrides the coupled
 * spacing limit (default: maxCoupledGap of the two nets' dominant widths).
 */
export function measureParallel(ta: RawTrack[], tb: RawTrack[], opts: { maxGap?: number } = {}): ParallelMeasure {
  const maxGap = opts.maxGap ?? maxCoupledGap(dominantWidth(ta), dominantWidth(tb));
  const pa = piecesOf(ta, 0);
  const pb = piecesOf(tb, 1);
  if (!pa.length || !pb.length) return { coupled: 0, coupledA: 0, coupledB: 0, maxGap };
  let wMax = 0;
  for (const p of pa) wMax = Math.max(wMax, p.w);
  for (const p of pb) wMax = Math.max(wMax, p.w);
  const search = maxGap + wMax;
  const sa = new GapStats();
  const sb = new GapStats();
  runsAlong(pa, new Grid(pb, search), search, () => maxGap, (_n, g, l, w) => sa.push(g, l, w));
  runsAlong(pb, new Grid(pa, search), search, () => maxGap, (_n, g, l, w) => sb.push(g, l, w));
  const coupled = (sa.len + sb.len) / 2;
  if (!(coupled > 0)) return { coupled: 0, coupledA: 0, coupledB: 0, maxGap };
  const gaps = new Map(sa.gaps);
  for (const [k, l] of sb.gaps) add(gaps, k, l);
  const big = [...gaps.entries()].filter(([, l]) => l >= PARALLEL.rangeShare * 2 * coupled).map(([k]) => k);
  return {
    coupled,
    coupledA: sa.len,
    coupledB: sb.len,
    gap: bestKey(gaps) * PARALLEL.bin,
    gapMin: Math.min(...big) * PARALLEL.bin,
    gapMax: Math.max(...big) * PARALLEL.bin,
    ...(sa.len > 0 ? { wA: bestKey(sa.widthsFrom) / 1e4 } : {}),
    ...(sb.len > 0 ? { wB: bestKey(sb.widthsFrom) / 1e4 } : {}),
    maxGap,
  };
}

/* ------------------------------------------------------------------ a whole board */

/** Tracks by layer, then by net. */
export type TrackIndex = Map<string, Map<string, RawTrack[]>>;

export function indexTracks(tracks: RawTrack[]): TrackIndex {
  const ix: TrackIndex = new Map();
  for (const t of tracks) {
    if (!t.net) continue; // tracks without a net couple to nothing that can be named
    let m = ix.get(t.layer);
    if (!m) ix.set(t.layer, (m = new Map()));
    const l = m.get(t.net);
    if (l) l.push(t);
    else m.set(t.net, [t]);
  }
  return ix;
}

export interface ParallelRun extends ParallelMeasure {
  layer: string;
  a: string;
  b: string;
  /** Routed length of each net on the layer, mm. */
  lenA: number;
  lenB: number;
}

const lengthOf = (ts: RawTrack[]) => ts.reduce((s, t) => s + trackLength(t), 0);

/** Parallel runs of nets `a` and `b` on `layer`; null when either is not routed there. */
export function parallelRun(ix: TrackIndex, layer: string, a: string, b: string): ParallelRun | null {
  const ta = ix.get(layer)?.get(a);
  const tb = ix.get(layer)?.get(b);
  if (!ta || !tb || a === b) return null;
  return { layer, a, b, lenA: lengthOf(ta), lenB: lengthOf(tb), ...measureParallel(ta, tb) };
}

/** The layers where `a` and `b` run in parallel, most coupled length first. */
export function parallelLayers(ix: TrackIndex, a: string, b: string): ParallelRun[] {
  const out: ParallelRun[] = [];
  for (const layer of ix.keys()) {
    const r = parallelRun(ix, layer, a, b);
    if (r && r.coupled > 0) out.push(r);
  }
  return out.sort((x, y) => y.coupled - x.coupled);
}

export interface Neighbour extends ParallelRun {
  /** The other net of `a`'s differential pair. */
  partner?: boolean;
}

// pieces, grid and widths of every net on a layer, for the neighbour search (built once per layer)
const layerCache = new WeakMap<Map<string, RawTrack[]>, { names: string[]; pieces: Piece[]; wDom: number[]; wMax: number }>();
function layerPieces(m: Map<string, RawTrack[]>) {
  let e = layerCache.get(m);
  if (!e) {
    const names = [...m.keys()];
    const pieces: Piece[] = [];
    const wDom = names.map((n, i) => {
      piecesOf(m.get(n)!, i, pieces);
      return dominantWidth(m.get(n)!);
    });
    let wMax = 0;
    for (const p of pieces) wMax = Math.max(wMax, p.w);
    e = { names, pieces, wDom, wMax };
    layerCache.set(m, e);
  }
  return e;
}

/**
 * The nets that run in parallel with `a` on `layer`, longest coupled length first (at most `limit`).
 * The candidates are found in one pass along `a` against every other net on the layer; the listed ones
 * are then measured with measureParallel, the same as parallelRun. `partnerOf` names the other net of a
 * differential pair, so it can be marked.
 */
export function neighbours(ix: TrackIndex, layer: string, a: string, limit = PARALLEL.neighbours, partnerOf?: (net: string) => string | undefined): Neighbour[] {
  const m = ix.get(layer);
  const ta = m?.get(a);
  if (!m || !ta) return [];
  const { names, pieces, wDom, wMax } = layerPieces(m);
  const self = names.indexOf(a);
  const others = pieces.filter((p) => p.net !== self);
  const wA = wDom[self];
  const search = maxCoupledGap(wA, wMax) + wMax;
  const along = new Map<number, number>();
  runsAlong(
    pieces.filter((p) => p.net === self),
    new Grid(others, search),
    search,
    (q) => maxCoupledGap(wA, wDom[q.net]),
    (n, _g, l) => add(along, n, l),
  );
  const partner = partnerOf?.(a);
  return [...along.entries()]
    .sort((x, y) => y[1] - x[1] || names[x[0]].localeCompare(names[y[0]]))
    .slice(0, limit)
    .map(([n]) => parallelRun(ix, layer, a, names[n])!)
    .filter((r) => r.coupled > 0)
    .sort((x, y) => y.coupled - x.coupled || x.b.localeCompare(y.b))
    .map((r) => (r.b === partner ? { ...r, partner: true } : r));
}
