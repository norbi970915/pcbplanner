// Routing check for a KiCad board: nets, net classes, differential pairs and the measured width,
// gap, coupled length, length and skew of every routed net, and the checks against an impedance
// target or an interface's routing rules.
//
// KiCad's own rules are followed where KiCad has one:
//   differential pairs   BOARD::MatchDpSuffix / DRC_ENGINE::MatchDpSuffix (pcbnew/board.cpp, pcbnew/drc/drc_engine.cpp)
//   net classes          NET_SETTINGS (common/project/net_settings.cpp) and its JSON schema migrations
//   class patterns       EDA_COMBINED_MATCHER with CTX_NETCLASS (common/eda_pattern_match.cpp)
// Everything here is plain data in, plain data out, so it runs in the import worker and in tests.
import { INTERFACES, type InterfaceSpec } from '../data/interfaces';
import { psPerMm, type Status } from './interfaceRules';

/* ------------------------------------------------------------------ raw items from the board */

/** A track segment or arc on a copper layer. Arcs carry their mid point. */
export interface RawTrack {
  net: string;
  layer: string;
  w: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  mx?: number;
  my?: number;
}

export interface RawVia {
  net: string;
  x: number;
  y: number;
  layers: string[];
  size?: number; // pad diameter, mm
  drill?: number;
  kind?: 'through' | 'blind' | 'micro';
  backdrill?: boolean; // KiCad 10 back-drilling or post-machining on the via
}

/** A via of a signal net (kicadVias.ts). */
export interface ViaUse {
  x: number;
  y: number;
  span: [string, string]; // first and last copper layer of the via
  used: string[]; // copper layers where the net's tracks end on the via, in stackup order
  kind?: 'blind' | 'micro';
  backdrill?: boolean;
  stub?: number; // longest unused barrel, mm; absent when back-drilled, reached from one layer only, or without a stackup
  ret?: number; // centre distance to the nearest via of a plane net, mm
  retNet?: string;
  rx?: number; // where that via is
  ry?: number;
}

/** Last part of a hierarchical net name. */
export const netLeaf = (n: string) => n.slice(n.lastIndexOf('/') + 1) || n;

/** A ground net by its name. */
export const isGroundName = (net: string) => /gnd|ground|vss|earth/i.test(netLeaf(net)) || /^0v$/i.test(netLeaf(net));

/* ------------------------------------------------------------------ summary sent to the page */

export interface NetLayerStat {
  layer: string;
  len: number; // mm
  w: number; // length-weighted dominant width, mm
  wMin: number;
  wMax: number;
  /** Stretches over no copper on another layer's zone fills (kicadVoids.ts), only where one reaches VOID.report. */
  voids?: VoidStat[];
  /**
   * Spacing to other nets' tracks on this layer (kicadSpacing.ts, differential-pair nets only): the sampled
   * length (mm) in SPACING.bin steps of edge-to-edge spacing, for neighbours of another pair and for other
   * signals, and the nearest neighbour.
   */
  space?: { pair: number[]; other: number[]; near: { d: number; net: string; x: number; y: number } };
}

/** The longest and the total stretch of a net's routing on one layer that runs over no copper on `layer`, mm. */
export interface VoidStat {
  layer: string;
  longest: number;
  total: number;
  /** Where the longest stretch is, in the board's coordinates (as KiCad's PCB editor shows them), mm. */
  x: number;
  y: number;
}

export interface NetStat {
  name: string;
  len: number; // mm, segments plus arcs
  vias: number;
  layers: NetLayerStat[]; // most length first
  /** Each via of the net with its layers, stub and nearest return via (signal nets only). */
  viaUse?: ViaUse[];
}

export interface PairLayerStat {
  layer: string;
  lenP: number;
  lenN: number;
  coupled: number; // mm, mean of the coupled length measured along P and along N
  gap?: number; // dominant edge-to-edge gap of the coupled sections, mm
  gapMin?: number;
  gapMax?: number;
}

export interface PairStat {
  base: string;
  p: string;
  n: string;
  layers: PairLayerStat[];
}

export interface RoutingSummary {
  nets: NetStat[];
  pairs: PairStat[];
  tracks: number;
  arcs: number;
  vias: number;
  ms: number;
  /** Copper layers with zone fills in the file: on these the reference-plane gaps were measured. */
  filled?: string[];
}

/** Reference-plane gaps (stated in the Method section; measured in kicadVoids.ts). */
export const VOID = {
  /** A stretch over no copper at least this long (mm) is recorded … */
  report: 0.5,
  /** … and one at least this long makes the layer a warning. */
  warn: 1,
  /** Raster resolution of the zone fills (mm), and the most pixels a layer may take. */
  res: 0.05,
  maxPixels: 16e6,
};

/** Spacing measurement (kicadSpacing.ts, stated in the Method section). */
export const SPACING = {
  /** Sample step along a trace, mm. */
  step: 0.1,
  /** Histogram resolution and range of the edge-to-edge spacing, mm. */
  bin: 0.01,
  bins: 200,
  max: 2,
  /** Samples within this distance of a pad or via (a free end of the net's routing) are breakout and not checked, mm. */
  breakout: 2.5,
  /** A pair closer than its limit over at least this length (mm, per trace) is a warning. */
  warn: 2,
};

/** Coupling rules (stated in the Method section). */
export const COUPLING = {
  /** Two traces count as parallel when their directions differ by at most this angle. */
  parallelDeg: 10,
  /** A coupled section is one where the gap is at most this multiple of the dominant gap … */
  gapFactor: 3,
  /** … and at least the dominant gap plus this much (mm), so a very tight pair still tolerates small steps. */
  gapSlack: 0.025,
  /** Search distance, centre to centre: the larger of this (mm) … */
  searchMin: 1.5,
  /** … and this multiple of the trace width. */
  searchWidths: 10,
  /** Arcs are cut into chords of at most this angle for the gap measurement. */
  arcStepDeg: 2,
  /** A layer needs at least this much coupled length (mm) to be checked; shorter sections are breakout near pads. */
  minCoupled: 3,
  /** A layer with less coupled length than this (mm) over more than `apartLen` of routing: the traces run apart. */
  apartCoupled: 1,
  apartLen: 5,
  /** Gap values are binned to this resolution (mm) to find the dominant gap. */
  bin: 0.001,
};

/* ------------------------------------------------------------------ geometry */

interface Arc {
  cx: number;
  cy: number;
  r: number;
  a0: number; // start angle
  da: number; // signed sweep
}

/** Circle through start, mid and end, or null when the points are (nearly) on a line. */
export function arcOf(x1: number, y1: number, mx: number, my: number, x2: number, y2: number): Arc | null {
  const ax = mx - x1;
  const ay = my - y1;
  const bx = x2 - x1;
  const by = y2 - y1;
  const d = 2 * (ax * by - ay * bx);
  const scale = Math.max(Math.hypot(ax, ay), Math.hypot(bx, by));
  if (!(scale > 0) || Math.abs(d) < 1e-9 * scale * scale) return null;
  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const ux = (by * a2 - ay * b2) / d;
  const uy = (ax * b2 - bx * a2) / d;
  const cx = x1 + ux;
  const cy = y1 + uy;
  const r = Math.hypot(ux, uy);
  const ang = (x: number, y: number) => Math.atan2(y - cy, x - cx);
  const a0 = ang(x1, y1);
  const am = ang(mx, my);
  const a1 = ang(x2, y2);
  const norm = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  // sweep from start to end through the mid point
  const ccw = norm(a1 - a0);
  const mid = norm(am - a0);
  const da = mid <= ccw ? ccw : ccw - 2 * Math.PI;
  return { cx, cy, r, a0, da };
}

/** Length of a track: a straight segment, or the true arc length through the mid point. */
export function trackLength(t: Pick<RawTrack, 'x1' | 'y1' | 'x2' | 'y2' | 'mx' | 'my'>): number {
  if (t.mx === undefined || t.my === undefined) return Math.hypot(t.x2 - t.x1, t.y2 - t.y1);
  const a = arcOf(t.x1, t.y1, t.mx, t.my, t.x2, t.y2);
  if (!a) return Math.hypot(t.mx - t.x1, t.my - t.y1) + Math.hypot(t.x2 - t.mx, t.y2 - t.my);
  return a.r * Math.abs(a.da);
}

/** A straight piece for the gap measurement; `scale` turns chord length into arc length. */
interface Piece {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  len: number;
  ux: number;
  uy: number;
  w: number;
  scale: number;
}

function piecesOf(tracks: RawTrack[]): Piece[] {
  const out: Piece[] = [];
  const push = (x1: number, y1: number, x2: number, y2: number, w: number, scale: number) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 1e-6) return;
    out.push({ x1, y1, x2, y2, len, ux: (x2 - x1) / len, uy: (y2 - y1) / len, w, scale });
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

/** Uniform grid of pieces (the spatial index for the gap measurement). */
class Grid {
  private cells = new Map<number, number[]>();
  private stamp: Int32Array;
  private tick = 0;
  private pieces: Piece[];
  private cell: number;
  constructor(pieces: Piece[], cell: number) {
    this.pieces = pieces;
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
  /** Indices of the pieces whose cells meet the box (each once). */
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
  get items() {
    return this.pieces;
  }
}

/**
 * Edge-to-edge gap along every piece of `from` to the nearest parallel piece of `to`, as
 * [gap, length] runs. For each candidate the overlap of its projection on the piece is found (as in
 * KiCad's diff-pair DRC, commonParallelProjection) and the centre distance is taken at the middle of
 * the overlap; where several candidates overlap, the nearest one counts.
 */
function gapRuns(from: Piece[], grid: Grid, search: number, out: [number, number][]) {
  const cosTol = Math.cos((COUPLING.parallelDeg * Math.PI) / 180);
  const to = grid.items;
  const ivs: { lo: number; hi: number; g: number }[] = [];
  for (const p of from) {
    ivs.length = 0;
    const cand = grid.near(Math.min(p.x1, p.x2) - search, Math.min(p.y1, p.y2) - search, Math.max(p.x1, p.x2) + search, Math.max(p.y1, p.y2) + search);
    for (const k of cand) {
      const q = to[k];
      if (Math.abs(p.ux * q.ux + p.uy * q.uy) < cosTol) continue;
      const ta = (q.x1 - p.x1) * p.ux + (q.y1 - p.y1) * p.uy;
      const tb = (q.x2 - p.x1) * p.ux + (q.y2 - p.y1) * p.uy;
      const lo = Math.max(0, Math.min(ta, tb));
      const hi = Math.min(p.len, Math.max(ta, tb));
      if (hi - lo < 1e-6) continue;
      const tm = (lo + hi) / 2;
      const mx = p.x1 + p.ux * tm;
      const my = p.y1 + p.uy * tm;
      const d = Math.abs(q.ux * (my - q.y1) - q.uy * (mx - q.x1));
      if (d > search) continue;
      const g = d - (p.w + q.w) / 2;
      if (g < -1e-6) continue; // overlapping copper: not a pair section
      ivs.push({ lo, hi, g: Math.max(0, g) });
    }
    if (!ivs.length) continue;
    // lower envelope over the elementary intervals
    const cuts = [...new Set(ivs.flatMap((v) => [v.lo, v.hi]))].sort((a, b) => a - b);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = cuts[i];
      const b = cuts[i + 1];
      const m = (a + b) / 2;
      let best = Infinity;
      for (const v of ivs) if (v.lo <= m && m <= v.hi && v.g < best) best = v.g;
      if (best < Infinity) out.push([best, (b - a) * p.scale]);
    }
  }
}

/** Gap statistics of a pair on one layer. */
export function measureCoupling(tp: RawTrack[], tn: RawTrack[]): { coupled: number; gap?: number; gapMin?: number; gapMax?: number } {
  const pp = piecesOf(tp);
  const pn = piecesOf(tn);
  if (!pp.length || !pn.length) return { coupled: 0 };
  const wMax = Math.max(...pp.map((p) => p.w), ...pn.map((p) => p.w));
  const search = Math.max(COUPLING.searchMin, COUPLING.searchWidths * wMax);
  const runs: [number, number][] = [];
  gapRuns(pp, new Grid(pn, search), search, runs);
  gapRuns(pn, new Grid(pp, search), search, runs);
  if (!runs.length) return { coupled: 0 };
  const hist = new Map<number, number>();
  for (const [g, l] of runs) {
    const k = Math.round(g / COUPLING.bin);
    hist.set(k, (hist.get(k) ?? 0) + l);
  }
  let mode = 0;
  let best = -1;
  for (const [k, l] of hist) if (l > best + 1e-12 || (Math.abs(l - best) <= 1e-12 && k < mode)) [mode, best] = [k, l];
  const g0 = mode * COUPLING.bin;
  const limit = Math.max(COUPLING.gapFactor * g0, g0 + COUPLING.gapSlack);
  let coupled = 0;
  const kept: [number, number][] = [];
  for (const [g, l] of runs) {
    if (g > limit) continue;
    coupled += l;
    kept.push([g, l]);
  }
  // range over gap values that carry a noticeable share of the coupled length
  const share = new Map<number, number>();
  for (const [g, l] of kept) share.set(Math.round(g / COUPLING.bin), (share.get(Math.round(g / COUPLING.bin)) ?? 0) + l);
  const big = [...share.entries()].filter(([, l]) => l >= 0.02 * coupled).map(([k]) => k * COUPLING.bin);
  return { coupled: coupled / 2, gap: g0, gapMin: Math.min(...big), gapMax: Math.max(...big) };
}

/* ------------------------------------------------------------------ differential pairs */

/**
 * KiCad's differential-pair rule (BOARD::MatchDpSuffix): walking back from the end of the name,
 * digits and underscores are skipped; the first other character decides. '+' or 'P' is the positive
 * net and '-' or 'N' the negative one; the partner has that character swapped. Anything else is not a
 * pair. Case matters: 'p' and 'n' do not count.
 */
export function matchDpSuffix(name: string): { polarity: 1 | -1; complement: string; base: string } | null {
  let rv: 0 | 1 | -1 = 0;
  let count = 0;
  let comp = '';
  for (let i = name.length - 1; i >= 0 && rv === 0; i--, count++) {
    const ch = name[i];
    if ((ch >= '0' && ch <= '9') || ch === '_') continue;
    else if (ch === '+') [comp, rv] = ['-', 1];
    else if (ch === '-') [comp, rv] = ['+', -1];
    else if (ch === 'N') [comp, rv] = ['P', -1];
    else if (ch === 'P') [comp, rv] = ['N', 1];
    else break;
  }
  if (rv === 0 || count < 1) return null;
  const base = name.slice(0, name.length - count);
  return { polarity: rv, base, complement: base + comp + name.slice(name.length - count + 1) };
}

/* ------------------------------------------------------------------ analysis of all routing */

const bestKey = (m: Map<number, number>) => {
  let k0 = 0;
  let l0 = -1;
  for (const [k, l] of m) if (l > l0 + 1e-12 || (Math.abs(l - l0) <= 1e-12 && k < k0)) [k0, l0] = [k, l];
  return k0;
};

/**
 * Lengths, widths and via counts per net and layer, and the coupling of every differential pair
 * (pairs found with KiCad's suffix rule among all net names, `declared` included).
 */
export function analyseRouting(tracks: RawTrack[], vias: RawVia[], declared: Iterable<string> = []): RoutingSummary {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const byNet = new Map<string, Map<string, { len: number; widths: Map<number, number>; tracks: RawTrack[] }>>();
  let arcs = 0;
  for (const t of tracks) {
    if (!t.net) continue;
    if (t.mx !== undefined) arcs++;
    let m = byNet.get(t.net);
    if (!m) byNet.set(t.net, (m = new Map()));
    let l = m.get(t.layer);
    if (!l) m.set(t.layer, (l = { len: 0, widths: new Map(), tracks: [] }));
    const len = trackLength(t);
    l.len += len;
    const k = Math.round(t.w * 1e4);
    l.widths.set(k, (l.widths.get(k) ?? 0) + len);
    l.tracks.push(t);
  }
  const viaCount = new Map<string, number>();
  for (const v of vias) if (v.net) viaCount.set(v.net, (viaCount.get(v.net) ?? 0) + 1);

  const nets: NetStat[] = [];
  for (const [name, m] of byNet) {
    const layers: NetLayerStat[] = [...m.entries()]
      .map(([layer, l]) => {
        const ks = [...l.widths.keys()];
        return { layer, len: l.len, w: bestKey(l.widths) / 1e4, wMin: Math.min(...ks) / 1e4, wMax: Math.max(...ks) / 1e4 };
      })
      .sort((a, b) => b.len - a.len);
    nets.push({ name, len: layers.reduce((a, l) => a + l.len, 0), vias: viaCount.get(name) ?? 0, layers });
  }
  nets.sort((a, b) => a.name.localeCompare(b.name));

  const names = new Set<string>([...declared, ...byNet.keys(), ...viaCount.keys()]);
  const pairs: PairStat[] = [];
  for (const name of names) {
    const m = matchDpSuffix(name);
    if (!m || m.polarity !== 1 || !names.has(m.complement)) continue;
    const p = byNet.get(name);
    const n = byNet.get(m.complement);
    if (!p && !n) continue;
    const layers: PairLayerStat[] = [];
    for (const layer of new Set([...(p?.keys() ?? []), ...(n?.keys() ?? [])])) {
      const lp = p?.get(layer);
      const ln = n?.get(layer);
      const c = lp && ln ? measureCoupling(lp.tracks, ln.tracks) : { coupled: 0 };
      layers.push({ layer, lenP: lp?.len ?? 0, lenN: ln?.len ?? 0, ...c });
    }
    layers.sort((a, b) => b.lenP + b.lenN - (a.lenP + a.lenN));
    pairs.push({ base: m.base, p: name, n: m.complement, layers });
  }
  pairs.sort((a, b) => a.p.localeCompare(b.p));
  const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  return { nets, pairs, tracks: tracks.length - arcs, arcs, vias: vias.length, ms };
}

/* ------------------------------------------------------------------ KiCad project: net classes */

export interface NetClassDef {
  name: string;
  priority: number; // lower is stronger (KiCad 9 and later); Default is the weakest
  trackWidth?: number; // mm
  dpWidth?: number;
  dpGap?: number;
  clearance?: number; // mm
}

export interface KicadProject {
  name: string;
  schema: number; // net_settings.meta.version
  kicad: string; // KiCad release the schema belongs to
  classes: NetClassDef[];
  patterns: { pattern: string; netclass: string }[];
  assignments: Record<string, string[]>; // explicit net → class (netclass_assignments)
  members: Record<string, string>; // KiCad 6: classes[].nets, exact net names
  /** Board design rules: the minimum copper to board edge clearance, mm. */
  edgeClearance?: number;
  /** Board design rules: the minimum copper to hole clearance, mm. */
  holeClearance?: number;
}

/** KiCad release that writes a net_settings schema version (net_settings.cpp at each release tag). */
export function netSchemaRelease(v: number): string {
  if (v >= 5) return '10';
  if (v === 4) return '9';
  if (v === 3) return '7 or 8';
  return '6';
}

const DEFAULT_CLASS = 'Default';
const INT_MAX = 2147483647;
const numOr = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Read the net classes and their assignment from a .kicad_pro file (JSON). */
export function parseKicadProject(text: string, name: string): KicadProject {
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(`${name} is not a KiCad project file (it is not valid JSON).`);
  }
  const ns = (j && typeof j === 'object' ? (j as Record<string, unknown>).net_settings : undefined) as Record<string, unknown> | undefined;
  const meta = ns?.meta as Record<string, unknown> | undefined;
  const schema = numOr(meta?.version) ?? 0;
  const classes: NetClassDef[] = [];
  const members: Record<string, string> = {};
  const rawClasses = Array.isArray(ns?.classes) ? (ns.classes as Record<string, unknown>[]) : [];
  rawClasses.forEach((c, i) => {
    if (!c || typeof c !== 'object' || typeof c.name !== 'string') return;
    const isDefault = c.name === DEFAULT_CLASS;
    // before schema 4 there was no priority: KiCad's migration numbers the classes in file order
    const priority = numOr(c.priority) ?? (isDefault ? INT_MAX : i);
    classes.push({ name: c.name, priority: isDefault ? INT_MAX : priority, trackWidth: numOr(c.track_width), dpWidth: numOr(c.diff_pair_width), dpGap: numOr(c.diff_pair_gap), clearance: numOr(c.clearance) });
    if (Array.isArray(c.nets)) for (const n of c.nets) if (typeof n === 'string') members[n] = c.name;
  });
  const patterns: KicadProject['patterns'] = [];
  if (Array.isArray(ns?.netclass_patterns))
    for (const e of ns.netclass_patterns as Record<string, unknown>[]) if (e && typeof e.pattern === 'string' && typeof e.netclass === 'string') patterns.push({ pattern: e.pattern, netclass: e.netclass });
  const assignments: Record<string, string[]> = {};
  const ra = ns?.netclass_assignments;
  if (ra && typeof ra === 'object' && !Array.isArray(ra))
    for (const [net, v] of Object.entries(ra as Record<string, unknown>)) {
      const list = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : typeof v === 'string' && v !== '' ? [v] : [];
      if (list.length) assignments[net] = list;
    }
  const board = (j as Record<string, unknown>).board as Record<string, unknown> | undefined;
  const rules = (board?.design_settings as Record<string, unknown> | undefined)?.rules as Record<string, unknown> | undefined;
  const edge = numOr(rules?.min_copper_edge_clearance);
  const hole = numOr(rules?.min_hole_clearance);
  return { name, schema, kicad: netSchemaRelease(schema), classes, patterns, assignments, members, ...(edge !== undefined ? { edgeClearance: edge } : {}), ...(hole !== undefined ? { holeClearance: hole } : {}) };
}

/** Expand a KiCad vector bus pattern NAME[0..7] into its member patterns (other patterns as they are). */
export function busMembers(pattern: string): string[] {
  const m = /^(.*)\[(\d+)\.\.(\d+)\](.*)$/.exec(pattern);
  if (!m) return [pattern];
  const a = Number(m[2]);
  const b = Number(m[3]);
  if (Math.abs(b - a) > 1024) return [pattern];
  const out: string[] = [];
  for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.push(`${m[1]}${i}${m[4]}`);
  return out;
}

/**
 * KiCad's net-class pattern matcher (EDA_COMBINED_MATCHER, CTX_NETCLASS): a net matches when the
 * pattern, read as an anchored regular expression, matches the whole name, or when the pattern, read
 * as a wildcard (* any run, ? one character, everything else literal), matches the whole name.
 * Case-sensitive.
 */
export function netclassMatcher(pattern: string): (net: string) => boolean {
  let re: RegExp | null = null;
  try {
    re = new RegExp(`${pattern.startsWith('^') ? '' : '^'}${pattern}${pattern.endsWith('$') ? '' : '$'}`);
  } catch {
    re = null; // not a valid regular expression: only the wildcard reading applies
  }
  const wild = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]/\\]/g, (c) => (c === '*' ? '.*' : c === '?' ? '.' : `\\${c}`))}$`);
  return (net) => {
    if (re) {
      const m = re.exec(net);
      if (m && m.index === 0) return true;
    }
    return wild.test(net);
  };
}

export interface ResolvedClass {
  name: string; // the class that decides (highest priority)
  all: string[]; // every class assigned or matched, strongest first
  trackWidth?: number;
  dpWidth?: number;
  dpGap?: number;
  clearance?: number;
}

/**
 * Net → net class, as KiCad resolves it for the schema version of the file:
 *  KiCad 6 (schema ≤ 2): exact net names listed in classes[].nets;
 *  KiCad 7 and 8 (schema 3): an explicit netclass_assignments entry, else the first matching
 *    netclass_patterns entry, else Default; an unknown class name falls back to Default;
 *  KiCad 9 and later (schema ≥ 4): every explicit and every matching class applies; the class with the
 *    lowest priority number decides (ties by name), and each missing value comes from the next class.
 */
export function netClassResolver(pro: KicadProject | null): (net: string) => ResolvedClass {
  const def: ResolvedClass = { name: DEFAULT_CLASS, all: [DEFAULT_CLASS] };
  if (!pro) return () => def;
  const byName = new Map(pro.classes.map((c) => [c.name, c]));
  const dflt = byName.get(DEFAULT_CLASS);
  const withParams = (names: string[]): ResolvedClass => {
    const defs = names.map((n) => byName.get(n) ?? { name: n, priority: n === DEFAULT_CLASS ? INT_MAX : INT_MAX - 1 });
    defs.sort((a, b) => a.priority - b.priority || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const chain = [...defs, ...(dflt && !defs.includes(dflt) ? [dflt] : [])];
    const pick = (k: 'trackWidth' | 'dpWidth' | 'dpGap' | 'clearance') => chain.find((c) => c[k] !== undefined)?.[k];
    return { name: defs[0].name, all: defs.map((d) => d.name), trackWidth: pick('trackWidth'), dpWidth: pick('dpWidth'), dpGap: pick('dpGap'), clearance: pick('clearance') };
  };
  const matchers = pro.patterns.flatMap((p) => busMembers(p.pattern).map((m) => ({ test: netclassMatcher(m), netclass: p.netclass })));
  const cache = new Map<string, ResolvedClass>();
  return (net: string) => {
    if (!net) return withParams([DEFAULT_CLASS]);
    const hit = cache.get(net);
    if (hit) return hit;
    let r: ResolvedClass;
    if (pro.schema <= 2 && !pro.patterns.length) {
      const c = pro.members[net];
      r = withParams([c && byName.has(c) ? c : DEFAULT_CLASS]);
    } else if (pro.schema <= 3) {
      const explicit = pro.assignments[net]?.[0];
      const name = explicit ?? matchers.find((m) => m.test(net))?.netclass;
      r = withParams([name && byName.has(name) ? name : DEFAULT_CLASS]);
    } else {
      const found = new Set<string>(pro.assignments[net] ?? []);
      for (const m of matchers) if (m.test(net)) found.add(m.netclass);
      r = withParams(found.size ? [...found] : [DEFAULT_CLASS]);
    }
    cache.set(net, r);
    return r;
  };
}

/* ------------------------------------------------------------------ project files */

export interface PickedFile<F> {
  board: F | null;
  project: F | null;
  ignored: number;
  otherBoards: string[];
}

/**
 * From the files of a dropped folder or a multi-file pick: the .kicad_pcb (the shallowest; with
 * several, the one with a .kicad_pro of the same name, else the largest) and its .kicad_pro (same
 * name, else the only one). Everything else is ignored, including backups.
 */
export function pickProjectFiles<F extends { name: string; size: number; path?: string }>(files: F[]): PickedFile<F> {
  const depth = (f: F) => (f.path ?? f.name).split('/').length;
  const stem = (n: string) => n.replace(/\.kicad_(pcb|pro)$/i, '');
  const inBackup = (f: F) => /(^|\/)[^/]*-backups\//i.test(f.path ?? '') || /^_autosave-|^~|\.lck$/i.test(f.name);
  const boards = files.filter((f) => /\.kicad_pcb$/i.test(f.name) && !inBackup(f));
  const pros = files.filter((f) => /\.kicad_pro$/i.test(f.name) && !inBackup(f));
  const ignored = files.length - boards.length - pros.length;
  if (!boards.length) return { board: null, project: pros[0] ?? null, ignored, otherBoards: [] };
  const top = Math.min(...boards.map(depth));
  const shallow = boards.filter((b) => depth(b) === top);
  const withPro = shallow.filter((b) => pros.some((p) => stem(p.name) === stem(b.name)));
  const board = (withPro.length ? withPro : shallow).reduce((a, b) => (b.size > a.size ? b : a));
  const project = pros.find((p) => stem(p.name) === stem(board.name)) ?? (pros.length === 1 ? pros[0] : null);
  return { board, project, ignored, otherBoards: boards.filter((b) => b !== board).map((b) => b.path ?? b.name) };
}

/* ------------------------------------------------------------------ targets */

export interface Target {
  id: string;
  label: string;
  kind: 'se' | 'diff';
  z: number;
  min: number;
  max: number;
  tol: string; // how the tolerance is stated
  spec?: InterfaceSpec;
}

/** Plain targets (±10 %) besides the interfaces; custom targets are 'cd<Ω>' and 'cs<Ω>'. */
export const PLAIN_TARGETS = [
  { id: 'se50', kind: 'se' as const, z: 50, label: '50 Ω single-ended' },
  { id: 'd85', kind: 'diff' as const, z: 85, label: '85 Ω differential' },
  { id: 'd90', kind: 'diff' as const, z: 90, label: '90 Ω differential' },
  { id: 'd100', kind: 'diff' as const, z: 100, label: '100 Ω differential' },
];
export const PLAIN_TOL = 0.1;

const r9 = (v: number) => Number(v.toFixed(9));
const plainTarget = (id: string, kind: 'se' | 'diff', z: number, label: string): Target => ({ id, kind, z, label, min: r9(z * (1 - PLAIN_TOL)), max: r9(z * (1 + PLAIN_TOL)), tol: '±10 %' });

/** The target for an id, or null for 'none' and unknown ids. */
export function targetById(id: string): Target | null {
  const plain = PLAIN_TARGETS.find((t) => t.id === id);
  if (plain) return plainTarget(plain.id, plain.kind, plain.z, plain.label);
  const custom = /^c([sd])(\d+(?:\.\d+)?)$/.exec(id);
  if (custom) {
    const z = Number(custom[2]);
    if (!(z >= 10 && z <= 200)) return null;
    const kind = custom[1] === 'd' ? 'diff' : 'se';
    return plainTarget(id, kind, z, `${z} Ω ${kind === 'diff' ? 'differential' : 'single-ended'} (custom)`);
  }
  const spec = INTERFACES.find((s) => s.id === id);
  if (!spec) return null;
  const z = spec.z;
  if (z.min !== undefined && z.max !== undefined) return { id, kind: z.kind, z: z.target, label: spec.name, min: z.min, max: z.max, tol: `${z.min}–${z.max} Ω` };
  return { ...plainTarget(id, z.kind, z.target, spec.name), spec, tol: '±10 %' };
}

/* ------------------------------------------------------------------ suggestions from names */

export type Family = 'usb3' | 'usb2' | 'pcie' | 'sata' | 'hdmi' | 'dp' | 'mipi' | 'sgmii' | 'eth' | 'lvds' | 'lowspeed';

/** Interface families recognised in class and net names, in the order they are tried. */
export const FAMILIES: { id: Family; label: string; re: RegExp; target: string }[] = [
  { id: 'usb3', label: 'USB 3', re: /USB_?3|USB_?SS|SS_?[TR]X|[TR]X_?SS|SSTX|SSRX|SUPERSPEED|USB.*[TR]X|[TR]X.*USB/, target: 'usb3-gen1' },
  { id: 'dp', label: 'DisplayPort', re: /DISPLAYPORT|(^|[/_])E?DP\d?_(ML|LANE|TX|AUX)|_ML_?\d/, target: 'dp-hbr2' },
  { id: 'usb2', label: 'USB 2.0', re: /USB|OTG|(^|[/_])D[PM]\d*$/, target: 'usb2-hs' },
  { id: 'pcie', label: 'PCIe', re: /PCIE|PCI_E|PEX\d|REFCLK/, target: 'pcie-gen3' },
  { id: 'sata', label: 'SATA', re: /SATA/, target: 'sata3' },
  { id: 'hdmi', label: 'HDMI', re: /HDMI|TMDS/, target: 'hdmi-20' },
  { id: 'mipi', label: 'MIPI D-PHY', re: /MIPI|CSI|DSI|D_?PHY|(^|[/_])CAM\d*_/, target: 'mipi-dphy' },
  { id: 'sgmii', label: 'SGMII', re: /SGMII/, target: 'sgmii' },
  { id: 'eth', label: 'Ethernet', re: /MDI|ETH|RJ45|TRX|TRD|(^|[/_])[TR]D\d?[+-]$/, target: 'eth-1000baset' },
  { id: 'lvds', label: 'LVDS', re: /LVDS/, target: 'd100' },
  { id: 'lowspeed', label: 'CAN / RS-485', re: /(^|[/_])CAN\d?_|RS_?485|RS_?422/, target: 'none' },
];

const SE_FAMILIES: { re: RegExp; target: string; label: string }[] = [
  { re: /(^|[^A-Z0-9])RGMII/, target: 'rgmii', label: 'RGMII' },
  { re: /(^|[^A-Z0-9G])RMII/, target: 'rmii', label: 'RMII' },
  { re: /LPDDR/, target: 'lpddr4', label: 'LPDDR4' },
  { re: /DDR/, target: 'ddr4', label: 'DDR4' },
  { re: /(^|[^0-9])50_?(R|OHMS?|Ω)(?![A-Z])|SE_?50|(^|[^A-Z])RF([^A-Z]|$)/, target: 'se50', label: '50 Ω' },
];

/**
 * Family of a pair: from the class name when it names one (the designer's grouping), else from the
 * net names, the last part of a hierarchical name before the sheet path.
 */
export function familyOf(cls: string, ...nets: string[]): Family | undefined {
  const leaf = (n: string) => n.slice(n.lastIndexOf('/') + 1);
  for (const n of [cls, ...nets.map(leaf), ...nets]) {
    if (!n) continue;
    const u = n.toUpperCase();
    const f = FAMILIES.find((x) => x.re.test(u));
    if (f) return f.id;
  }
  return undefined;
}

/** An impedance written in a class name: 85Ohm-diff_PCIE → 85, 90R → 90, 100ohm → 100. */
export function impedanceInName(name: string): number | undefined {
  const m = /(?:^|[^0-9.])(\d{2,3})\s*(?:R|OHMS?|Ω)(?![A-Z])/i.exec(name);
  const z = m ? Number(m[1]) : NaN;
  return z >= 25 && z <= 150 ? z : undefined;
}

/** Suggested target for a group, with the reason shown in the Properties panel. */
export function suggestTarget(kind: 'pair' | 'se', cls: string, family: Family | undefined): { id: string; why: string } {
  const zName = cls !== DEFAULT_CLASS ? impedanceInName(cls) : undefined;
  if (kind === 'se') {
    const u = cls.toUpperCase();
    const f = cls !== DEFAULT_CLASS ? SE_FAMILIES.find((x) => x.re.test(u)) : undefined;
    if (f) return { id: f.target, why: `${f.label} in the class name ${cls}` };
    // a single-ended line is 25–60 Ω; a larger value in the name is the class's differential impedance
    if (zName && zName <= 60) return { id: zName === 50 ? 'se50' : `cs${zName}`, why: `${zName} Ω in the class name ${cls}` };
    if (zName) return { id: 'none', why: `${zName} Ω in the class name is a differential impedance` };
    return { id: 'none', why: 'no interface recognised in the class name' };
  }
  const fam = family ? FAMILIES.find((f) => f.id === family) : undefined;
  // an impedance in the class name is the designer's target: the interface is kept when it agrees (within 10 % of its nominal)
  const t = fam && fam.target !== 'none' ? targetById(fam.target) : null;
  if (fam && t) {
    if (!zName || (zName >= t.min && zName <= t.max && Math.abs(zName - t.z) <= 0.1 * t.z)) return { id: fam.target, why: `${fam.label} in the net or class names${zName ? `; ${zName} Ω in the class name agrees` : ''}` };
  }
  if (zName) {
    const plain = PLAIN_TARGETS.find((p) => p.kind === 'diff' && p.z === zName);
    return { id: plain ? plain.id : `cd${zName}`, why: `${zName} Ω in the class name ${cls}${fam && t ? `, not the ${t.z} Ω of ${fam.label}` : ''}` };
  }
  if (fam) return { id: 'none', why: `${fam.label}: not an impedance-controlled interface` };
  return { id: 'none', why: 'no interface recognised in the names' };
}

/* ------------------------------------------------------------------ groups of pairs and nets */

export interface RouteItem {
  kind: 'pair' | 'se';
  name: string; // pair base name or net name
  cls: ResolvedClass;
  pair?: PairStat;
  p?: NetStat;
  n?: NetStat;
  net?: NetStat;
}

export interface RouteGroup {
  key: string; // 'p:<class>|<family>' or 's:<class>'
  kind: 'pair' | 'se';
  cls: string;
  family?: Family;
  label: string;
  items: RouteItem[];
  suggest: string;
  why: string;
}

/**
 * Pairs grouped by net class and interface family; single-ended routed nets of every class except
 * Default grouped by class. A pair whose two nets resolve to different classes takes the class of
 * its positive net.
 */
export function buildGroups(r: RoutingSummary, resolve: (net: string) => ResolvedClass): RouteGroup[] {
  const netBy = new Map(r.nets.map((n) => [n.name, n]));
  const inPair = new Set<string>();
  const groups = new Map<string, RouteGroup>();
  const add = (key: string, make: () => RouteGroup, item: RouteItem) => {
    let g = groups.get(key);
    if (!g) groups.set(key, (g = make()));
    g.items.push(item);
  };
  for (const pair of r.pairs) {
    inPair.add(pair.p);
    inPair.add(pair.n);
    const cls = resolve(pair.p);
    const family = familyOf(cls.name !== DEFAULT_CLASS ? cls.name : '', pair.p, pair.n);
    const key = `p:${cls.name}|${family ?? ''}`;
    add(
      key,
      () => {
        const s = suggestTarget('pair', cls.name, family);
        const fl = FAMILIES.find((f) => f.id === family)?.label;
        return { key, kind: 'pair', cls: cls.name, family, label: `${cls.name}${fl ? ` · ${fl}` : ''}`, items: [], suggest: s.id, why: s.why };
      },
      { kind: 'pair', name: pair.base, cls, pair, p: netBy.get(pair.p), n: netBy.get(pair.n) },
    );
  }
  for (const net of r.nets) {
    if (inPair.has(net.name) || !(net.len > 0)) continue;
    const cls = resolve(net.name);
    if (cls.name === DEFAULT_CLASS) continue;
    const key = `s:${cls.name}`;
    add(
      key,
      () => {
        const s = suggestTarget('se', cls.name, undefined);
        return { key, kind: 'se', cls: cls.name, label: `${cls.name} (single-ended)`, items: [], suggest: s.id, why: s.why };
      },
      { kind: 'se', name: net.name, cls, net },
    );
  }
  const out = [...groups.values()];
  for (const g of out) {
    g.items.sort((a, b) => a.name.localeCompare(b.name));
    g.label += ` · ${g.items.length} ${g.kind === 'pair' ? (g.items.length === 1 ? 'pair' : 'pairs') : g.items.length === 1 ? 'net' : 'nets'}`;
  }
  // targeted groups first, then pairs before single nets, then by name
  return out.sort((a, b) => Number(a.suggest === 'none') - Number(b.suggest === 'none') || Number(a.kind === 'se') - Number(b.kind === 'se') || a.label.localeCompare(b.label));
}

/** Target overrides for the URL: key=target pairs, comma-separated; only %, comma and = are escaped (the URL encodes the rest). */
const esc = (v: string) => v.replace(/[%,=]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
export function encodeTargets(m: Record<string, string>): string {
  return Object.entries(m)
    .map(([k, v]) => `${esc(k)}=${esc(v)}`)
    .join(',');
}
export function decodeTargets(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of s.split(',')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    try {
      out[decodeURIComponent(part.slice(0, i))] = decodeURIComponent(part.slice(i + 1));
    } catch {
      /* a damaged entry is skipped */
    }
  }
  return out;
}

/* ------------------------------------------------------------------ checks */

/** What the field solver found for a measured line on one layer. */
export interface LayerSolve {
  z?: number;
  eeff?: number;
  dbPerIn?: number; // at the target's loss frequency
  err?: string;
  noRef?: boolean; // the layer has no reference plane in the stackup
  refs?: string[]; // reference planes of the layer whose zone fills are in the file
  planes?: string[]; // all reference planes of the layer (for the return-via check)
  pending?: boolean; // impedance not solved yet
  lossPending?: boolean; // loss not solved yet
}

export interface LayerResult {
  layer: string;
  len: number; // mm (mean of P and N for a pair)
  w: number;
  wN?: number; // width of the negative trace when it differs
  wMin: number;
  wMax: number;
  gap?: number;
  gapMin?: number;
  gapMax?: number;
  coupled?: number;
  solve: LayerSolve;
  status: Status | 'pending';
  reason: string;
  tag: string; // a few words for a table cell
  change?: boolean; // impedance differs from another layer of the same net
  /** The places on the board that made this layer a warning (gaps in the reference plane). */
  points?: CheckPoint[];
}

export interface ItemResult {
  layers: LayerResult[];
  len: number; // mm (longer net for a pair)
  lenP?: number;
  lenN?: number;
  vias: number;
  skew?: { mm: number; ps?: number; limitMm?: number; status: Status | 'pending'; reason: string };
  length?: { status: Status; reason: string };
  loss?: { db: number; status: Status | 'pending'; reason: string };
  /** The interface's layout guidelines: via stubs, return vias, via count, spacing (warnings, never fails). */
  checks?: SubCheck[];
  overall: Status | 'pending';
  notes: string[];
}

/** Where on the board a check found something, for the board view: a point, or a point and the point it relates to. */
export interface CheckPoint {
  x: number;
  y: number;
  x2?: number; // e.g. the nearest return via
  y2?: number;
  layer?: string;
  note: string;
}

export interface SubCheck {
  key: 'stub' | 'return' | 'vias' | 'space' | 'lane';
  status: Status;
  reason: string;
  /** The places on the board that made it a warning or a failure. */
  points?: CheckPoint[];
}

export type Fmt = (mm: number) => string;

/** Why an item is not a plain pass: the reasons of its warnings and failures, then its notes. */
export function itemReasons(res: ItemResult): string[] {
  return [
    ...res.layers.filter((l) => l.status === 'fail' || l.status === 'warn').map((l) => l.reason),
    ...[res.skew, res.length, res.loss, ...(res.checks ?? [])].filter((x) => x && (x.status === 'fail' || x.status === 'warn')).map((x) => x!.reason),
    ...res.notes,
  ];
}

/** Short name of a source, as cited in a reason ("TI SLLA414A"). */
const srcName = (spec: InterfaceSpec, src: number) => (spec.sources[src]?.title ?? '').split(' —')[0].split(' (')[0];

/**
 * The link a pair belongs to, by its name: the pair's base name without the lane at its end (D0, D1, CLK,
 * CK, C, TX0, TXC, LANE2 …), so HDMI_D0 and HDMI_CLK, or DPHY0.D1 and DPHY0.C, share a link.
 */
export const laneLink = (base: string) => base.replace(/[_.]+$/, '').replace(/(?:TX|D|DATA|LANE|ML|CH)?(?:\d+|CLK|CK|C)$/i, '');

/**
 * Lane-to-lane matching inside each link of an interface that has a lane-skew guideline: every lane is
 * compared with the shortest lane of its link. Over the guideline is a warning; beyond the skew the
 * specification allows, a fail. `items` are the checked pairs with the key of their routing group.
 */
export function addLaneChecks(items: { groupKey: string; item: RouteItem; target: Target | null; res: ItemResult }[], L: Fmt, unit = 'mm') {
  const links = new Map<string, typeof items>();
  for (const c of items) {
    const spec = c.target ? INTERFACES.find((s) => s.id === c.target!.id) : undefined;
    if (!spec?.layout || (!spec.layout.laneSkewMm && !spec.layout.laneSkewPs) || c.item.kind !== 'pair') continue;
    const k = `${c.groupKey}\u0000${laneLink(c.item.name)}`;
    links.set(k, [...(links.get(k) ?? []), c]);
  }
  for (const lanes of links.values()) {
    if (lanes.length < 2) continue;
    const spec = INTERFACES.find((s) => s.id === lanes[0].target!.id)!;
    const g = spec.layout!;
    // delay per mm from the pairs' own skew (the solver's εeff of the layer that carries most of each pair)
    const pms = lanes.map((c) => (c.res.skew?.ps !== undefined && c.res.skew.mm > 0 ? c.res.skew.ps / c.res.skew.mm : undefined)).filter((v): v is number => v !== undefined);
    const pm = pms.length ? pms.reduce((a, b) => a + b, 0) / pms.length : undefined;
    const shortest = lanes.reduce((a, b) => (b.res.len < a.res.len ? b : a));
    const name = (c: (typeof lanes)[number]) => netLeaf(c.item.name).replace(/[_.]+$/, '');
    for (const c of lanes) {
      const d = c.res.len - shortest.res.len;
      const ps = pm !== undefined ? d * pm : undefined;
      const psText = ps !== undefined ? ` (${ps.toFixed(ps < 10 ? 1 : 0)} ps)` : '';
      const overMm = g.laneSkewMm && d > g.laneSkewMm.value + 1e-9;
      const overPs = g.laneSkewPs && ps !== undefined && ps > g.laneSkewPs.value + 1e-9;
      const overBudget = g.laneSkewBudgetPs && ps !== undefined && ps > g.laneSkewBudgetPs.value + 1e-9;
      const lim = g.laneSkewMm ? `${L(g.laneSkewMm.value)} ${unit}${cite(spec, g.laneSkewMm.src)}` : `${g.laneSkewPs!.value} ps${cite(spec, g.laneSkewPs!.src)}`;
      const budget = g.laneSkewBudgetPs ? `; ${spec.name} allows ${g.laneSkewBudgetPs.value} ps${cite(spec, g.laneSkewBudgetPs.src)}` : '';
      const status: Status = overBudget ? 'fail' : overMm || overPs ? 'warn' : 'ok';
      const reason =
        c === shortest
          ? `lane-to-lane: the shortest of ${lanes.length} lanes (${lanes.map(name).join(', ')}), guideline ${lim}`
          : `lane-to-lane: ${L(d)} ${unit}${psText} longer than ${name(shortest)}, the shortest lane; guideline ${lim}${budget}${g.laneSkewPs && ps === undefined ? '; the time limit needs the delay of a solved layer' : ''}`;
      c.res.checks = [...(c.res.checks ?? []).filter((x) => x.key !== 'lane'), { key: 'lane', status, reason }];
      if (c.target) c.res.overall = worst([...c.res.layers.map((l) => l.status), c.res.skew?.status, c.res.length?.status, c.res.loss?.status, ...c.res.checks.map((x) => x.status)]);
    }
  }
}

const cite = (spec: InterfaceSpec, src: number) => ` (${srcName(spec, src)})`;

/** The via checks of a pair against the interface's layout guidelines. */
function viaChecks(item: RouteItem, spec: InterfaceSpec, solves: Record<string, LayerSolve>, L: Fmt, unit: string): SubCheck[] {
  const g = spec.layout;
  if (!g || item.kind !== 'pair') return [];
  const nets = [item.p, item.n].filter((n): n is NetStat => !!n);
  const vias = nets.flatMap((n) => (n.viaUse ?? []).map((v) => ({ ...v, net: n.name })));
  const out: SubCheck[] = [];
  const at = (v: { x: number; y: number }) => `x ${Number(v.x.toFixed(2))}, y ${Number(v.y.toFixed(2))} mm`;
  const cite = (src: number) => ` (${srcName(spec, src)})`;

  if (g.viaStubMm && vias.length) {
    const lim = g.viaStubMm.value;
    const measured = vias.filter((v) => v.stub !== undefined);
    const over = measured.filter((v) => v.stub! > lim + 1e-9).sort((a, b) => b.stub! - a.stub!);
    const unmeasured = vias.length - measured.length;
    const tail = unmeasured ? `; ${unmeasured} ${unmeasured === 1 ? 'via was' : 'vias were'} not measured (back-drilled, or reached from one layer of tracks only)` : '';
    if (over.length) {
      const w = over[0];
      out.push({
        key: 'stub',
        status: 'warn',
        reason: `via stubs: ${over.length} of ${vias.length} vias over ${L(lim)} ${unit}${cite(g.viaStubMm.src)}, the longest ${L(w.stub!)} ${unit} at ${at(w)} (signal on ${w.used.join(' and ')}, via ${w.span.join(' to ')}); back-drill them or use blind vias${tail}`,
        points: over.map((v) => ({ x: v.x, y: v.y, note: `via stub ${L(v.stub!)} ${unit} (signal on ${v.used.join(' and ')})` })),
      });
    } else if (measured.length) out.push({ key: 'stub', status: 'ok', reason: `via stubs: all ${measured.length} measured vias within ${L(lim)} ${unit}${tail}` });
  }

  if (g.returnViaMm) {
    const lim = g.returnViaMm.value;
    const planes = (l: string) => solves[l]?.planes;
    // a layer change that leaves every reference plane behind needs a return via near it
    const changes = vias.filter((v) => {
      if (v.used.length < 2) return false;
      const a = planes(v.used[0]);
      const b = planes(v.used[v.used.length - 1]);
      return !!a?.length && !!b?.length && !a.some((p) => b.includes(p));
    });
    const far = changes.filter((v) => v.ret === undefined || v.ret > lim + 1e-9).sort((p, q) => (q.ret ?? Infinity) - (p.ret ?? Infinity));
    if (far.length) {
      const w = far[0];
      out.push({
        key: 'return',
        status: 'warn',
        reason: `return vias: ${far.length} of ${changes.length} vias that change the reference plane have no ground via within ${L(lim)} ${unit}${cite(g.returnViaMm.src)}; at ${at(w)} (${w.used[0]} to ${w.used[w.used.length - 1]}) the nearest is ${w.ret === undefined ? 'not found' : `${L(w.ret)} ${unit} away (${netLeaf(w.retNet ?? '')})`}`,
        points: far.map((v) => ({ x: v.x, y: v.y, x2: v.rx, y2: v.ry, note: v.ret === undefined ? 'no ground via nearby' : `nearest ground via ${L(v.ret)} ${unit} away` })),
      });
    } else if (changes.length) out.push({ key: 'return', status: 'ok', reason: `return vias: a ground via within ${L(lim)} ${unit} of all ${changes.length} vias that change the reference plane` });
  }

  // spacing to other signals and other pairs on the same layer, outside breakout
  const tOther = g.spaceMm?.value;
  const space = item.pair!.layers
    .map((pl) => {
      const w = Math.max(...nets.map((n) => n.layers.find((l) => l.layer === pl.layer)?.w ?? 0));
      const tPair = g.pairSpaceMm?.value ?? (g.pairSpaceW ? g.pairSpaceW.value * w : tOther);
      let close = 0;
      let near: { d: number; net: string; x: number; y: number } | undefined;
      // length in the bins wholly below the limit (a bin that straddles it is not counted)
      const sum = (h: number[], t: number | undefined) => (t === undefined ? 0 : h.reduce((a, v, i) => a + ((i + 1) * SPACING.bin <= t + 1e-9 ? v : 0), 0));
      for (const n of nets) {
        const s = n.layers.find((l) => l.layer === pl.layer)?.space;
        if (!s) continue;
        close += sum(s.pair, tPair) + sum(s.other, tOther);
        if (!near || s.near.d < near.d) near = s.near;
      }
      return { layer: pl.layer, tPair, close, near };
    })
    .filter((x) => x.tPair !== undefined || tOther !== undefined);
  if (space.length) {
    const bad = space.filter((x) => x.close / 2 >= SPACING.warn).sort((a, b) => b.close - a.close);
    const limits = [tOther !== undefined ? `${L(tOther)} ${unit} to other signals${cite(g.spaceMm!.src)}` : '', g.pairSpaceMm ? `${L(g.pairSpaceMm.value)} ${unit} to other pairs${cite(g.pairSpaceMm.src)}` : g.pairSpaceW ? `${g.pairSpaceW.value}W to other pairs${cite(g.pairSpaceW.src)}` : '']
      .filter(Boolean)
      .join(' and ');
    if (bad.length) {
      const b = bad[0];
      out.push({
        key: 'space',
        status: 'warn',
        reason: `spacing: ${bad.map((x) => `${L(x.close / 2)} ${unit} on ${x.layer}`).join(', ')} closer than ${limits}, outside ${SPACING.breakout} mm of pads and vias; nearest ${L(b.near!.d)} ${unit} to ${netLeaf(b.near!.net)} at x ${b.near!.x}, y ${b.near!.y} mm`,
        points: bad.filter((x) => x.near).map((x) => ({ x: x.near!.x, y: x.near!.y, layer: x.layer, note: `${L(x.near!.d)} ${unit} to ${netLeaf(x.near!.net)} on ${x.layer}` })),
      });
    } else out.push({ key: 'space', status: 'ok', reason: `spacing: ${limits} kept outside ${SPACING.breakout} mm of pads and vias` });
  }

  const counts = nets.map((n) => n.vias);
  const viaWarn: string[] = [];
  if (g.viasPerTrace && Math.max(...counts) > g.viasPerTrace.value) viaWarn.push(`${nets.map((n) => `${netLeaf(n.name)} ${n.vias}`).join(', ')}, more than ${g.viasPerTrace.value} per trace${cite(g.viasPerTrace.src)}`);
  if (g.equalVias && nets.length === 2 && counts[0] !== counts[1]) viaWarn.push(`the two traces have ${counts[0]} and ${counts[1]} vias, not the same number${cite(g.equalVias.src)}`);
  if (viaWarn.length) out.push({ key: 'vias', status: 'warn', reason: `via count: ${viaWarn.join('; ')}` });
  else if (g.viasPerTrace || g.equalVias) out.push({ key: 'vias', status: 'ok', reason: `via count: ${counts.join(' and ')}` });
  return out;
}

const worst = (s: (Status | 'pending' | undefined)[]): Status | 'pending' => {
  if (s.includes('fail')) return 'fail';
  if (s.includes('pending')) return 'pending';
  if (s.includes('warn')) return 'warn';
  if (s.includes('ok')) return 'ok';
  return 'info';
};

/** The geometry measured for an item on each of its layers (what the solver is asked to analyse). */
export function itemLayers(item: RouteItem): Omit<LayerResult, 'solve' | 'status' | 'reason' | 'tag'>[] {
  if (item.kind === 'se') return (item.net?.layers ?? []).map((l) => ({ layer: l.layer, len: l.len, w: l.w, wMin: l.wMin, wMax: l.wMax }));
  const pair = item.pair!;
  return pair.layers.map((pl) => {
    const a = item.p?.layers.find((l) => l.layer === pl.layer);
    const b = item.n?.layers.find((l) => l.layer === pl.layer);
    const w = a?.w ?? b?.w ?? 0;
    const wN = b && a && Math.abs(b.w - a.w) > 1e-6 ? b.w : undefined;
    return {
      layer: pl.layer,
      len: (pl.lenP + pl.lenN) / 2,
      w,
      wN,
      wMin: Math.min(a?.wMin ?? Infinity, b?.wMin ?? Infinity),
      wMax: Math.max(a?.wMax ?? 0, b?.wMax ?? 0),
      gap: pl.gap,
      gapMin: pl.gapMin,
      gapMax: pl.gapMax,
      coupled: pl.coupled,
    };
  });
}

/** Width the solver uses for a pair whose two traces differ: their mean. */
export const solveWidth = (l: { w: number; wN?: number }) => (l.wN !== undefined ? (l.w + l.wN) / 2 : l.w);

/** True when a layer of a pair has enough coupled length to be checked. */
export const pairCoupled = (l: { coupled?: number; gap?: number }) => l.gap !== undefined && (l.coupled ?? 0) >= COUPLING.minCoupled;

/** The worst stretch of an item on a layer over no copper on one of its reference planes, when it reaches VOID.warn. */
function refGap(item: RouteItem, layer: string, refs: string[] | undefined): { worst: VoidStat; all: VoidStat[] } | undefined {
  if (!refs?.length) return undefined;
  const nets = item.kind === 'pair' ? [item.p, item.n] : [item.net];
  const all: VoidStat[] = [];
  for (const n of nets) for (const v of n?.layers.find((x) => x.layer === layer)?.voids ?? []) if (refs.includes(v.layer) && v.longest >= VOID.warn) all.push(v);
  if (!all.length) return undefined;
  return { worst: all.reduce((a, b) => (b.longest > a.longest ? b : a)), all };
}

/**
 * Check an item against its target. `solves` gives the field-solver answer per layer (keyed by
 * layer name). Impedance is checked per layer, skew and length per net, loss over all layers.
 */
export function checkItem(item: RouteItem, target: Target | null, solves: Record<string, LayerSolve>, L: Fmt, unit = 'mm'): ItemResult {
  const diff = item.kind === 'pair';
  const notes: string[] = [];
  const zText = (z: number) => `${z.toFixed(z >= 100 ? 0 : 1)} Ω`;
  const want = target ? `target ${target.tol === '±10 %' ? `${target.z} Ω ±10 %` : `${target.tol} (${target.label})`}` : 'no target';
  const geo = (l: Omit<LayerResult, 'solve' | 'status' | 'reason' | 'tag'>) => `${L(l.w)}${l.wN !== undefined ? `+${L(l.wN)}` : ''}${diff && l.gap !== undefined ? `/${L(l.gap)}` : ''} ${unit}`;
  const measured = itemLayers(item);
  const coupledOk = (l: { coupled?: number; gap?: number }) => !diff || pairCoupled(l);
  const layers: LayerResult[] = measured.map((l) => {
    const solve = solves[l.layer] ?? { pending: true };
    let status: LayerResult['status'] = 'info';
    let reason = '';
    let tag = '';
    if (!coupledOk(l)) {
      const apart = (l.coupled ?? 0) < COUPLING.apartCoupled && l.len > COUPLING.apartLen;
      status = apart ? 'warn' : 'info';
      tag = apart ? 'traces apart' : 'breakout';
      reason = apart ? `${l.layer}: ${L(l.len)} ${unit} with no coupled section, the two traces run apart` : `${l.layer}: ${L(l.len)} ${unit}, short section near the pads, not checked`;
    } else if (solve.noRef) {
      status = target ? 'warn' : 'info';
      tag = 'no reference plane';
      reason = `${l.layer}: no reference plane in the stackup, so no impedance`;
    } else if (solve.err) {
      status = target ? 'warn' : 'info';
      tag = 'no solution';
      reason = `${l.layer} ${geo(l)}: ${solve.err}`;
    } else if (solve.pending || solve.z === undefined) {
      status = 'pending';
      reason = `${l.layer} ${geo(l)}: solving…`;
    } else {
      const z = solve.z;
      reason = `${l.layer} ${geo(l)} → ${zText(z)}, ${want}`;
      if (target) {
        status = z >= target.min && z <= target.max ? 'ok' : 'fail';
        tag = status === 'ok' ? 'in range' : z < target.min ? `below ${target.min} Ω` : `above ${target.max} Ω`;
        if (status === 'ok' && diff && l.coupled !== undefined && l.len - l.coupled > Math.max(2, 0.25 * l.len)) {
          status = 'warn';
          tag = 'partly uncoupled';
          reason += `; ${L(l.len - l.coupled)} of ${L(l.len)} ${unit} not coupled`;
        }
      }
    }
    // a stretch over a gap, slot or split in the reference plane
    const found = status === 'pending' || !coupledOk(l) ? undefined : refGap(item, l.layer, solve.refs);
    let points: CheckPoint[] | undefined;
    if (found) {
      const gap = found.worst;
      reason += `${reason ? '; ' : ''}${L(gap.total)} ${unit} over no copper on ${gap.layer}, the longest ${L(gap.longest)} ${unit} at x ${gap.x}, y ${gap.y} mm`;
      if (target && status !== 'fail') {
        status = 'warn';
        tag = `over a gap in ${gap.layer}`;
      }
      points = found.all.map((v) => ({ x: v.x, y: v.y, layer: l.layer, note: `${L(v.longest)} ${unit} over no copper on ${v.layer}` }));
    }
    return { ...l, solve, status, reason, tag, ...(points ? { points } : {}) };
  });

  // a layer change where the impedance changes: the classic mistake
  const solved = layers.filter((l) => l.solve.z !== undefined && coupledOk(l));
  if (solved.length > 1) {
    const zs = solved.map((l) => l.solve.z as number);
    const lo = Math.min(...zs);
    const hi = Math.max(...zs);
    const mixed = target && solved.some((l) => l.status === 'fail') && solved.some((l) => l.status !== 'fail');
    if (hi > 1.1 * lo || mixed) {
      for (const l of solved) l.change = true;
      notes.push(`Impedance changes with the layer: ${solved.map((l) => `${l.layer} ${zText(l.solve.z as number)}`).join(', ')}. Each layer needs its own width${diff ? ' and gap' : ''}.`);
    }
  }

  const lenP = diff ? (item.p?.len ?? 0) : undefined;
  const lenN = diff ? (item.n?.len ?? 0) : undefined;
  const len = diff ? Math.max(lenP!, lenN!) : (item.net?.len ?? 0);
  const vias = diff ? (item.p?.vias ?? 0) + (item.n?.vias ?? 0) : (item.net?.vias ?? 0);
  const res: ItemResult = { layers, len, lenP, lenN, vias, overall: 'info', notes };

  // delay of the layer that carries most of the route, for the skew in ps
  const main = layers.find((l) => l.solve.eeff !== undefined && coupledOk(l));
  const pm = main?.solve.eeff !== undefined ? psPerMm(main.solve.eeff) : undefined;

  if (diff) {
    const mm = Math.abs(lenP! - lenN!);
    const spec = target?.spec ?? (target ? INTERFACES.find((s) => s.id === target.id) : undefined);
    const limitMm = spec?.intraPairMm ?? (spec?.intraPairPs !== undefined && pm ? spec.intraPairPs / pm : undefined);
    const ps = pm ? mm * pm : undefined;
    const psText = ps !== undefined ? ` (${ps.toFixed(ps < 10 ? 1 : 0)} ps)` : '';
    if (limitMm !== undefined) {
      const lim = spec?.intraPairMm !== undefined ? `${L(limitMm)} ${unit}` : `${spec!.intraPairPs} ps = ${L(limitMm)} ${unit} on ${main!.layer}`;
      const budget = spec!.intraPairBudgetPs;
      // a vendor guideline is tighter than the specification: over it is a warning, a fail only beyond the specification's own budget
      if (spec!.intraPairGuideline || budget !== undefined) {
        const status: Status = mm <= limitMm ? 'ok' : budget !== undefined && ps !== undefined && ps > budget ? 'fail' : 'warn';
        const specText = budget !== undefined ? `${spec!.name} allows ${budget} ps` : `${spec!.name} sets no board limit`;
        res.skew = { mm, ps, limitMm, status, reason: `skew ${L(Math.round(mm * 1000) / 1000)} ${unit}${psText}, layout guideline ${lim}; ${specText}` };
      } else res.skew = { mm, ps, limitMm, status: mm <= limitMm ? 'ok' : 'fail', reason: `skew ${L(Math.round(mm * 1000) / 1000)} ${unit}${psText}, limit ${lim}` };
    } else if (spec?.intraPairPs !== undefined)
      res.skew = { mm, ps, status: layers.some((l) => l.status === 'pending') ? 'pending' : 'warn', reason: `skew ${L(Math.round(mm * 1000) / 1000)} ${unit}; the ${spec.intraPairPs} ps limit needs the delay of a layer with a reference plane` };
    else res.skew = { mm, ps, status: 'info', reason: `skew ${L(Math.round(mm * 1000) / 1000)} ${unit}${psText}${target ? ', no skew limit for this target' : ''}` };
  }

  const spec = target ? INTERFACES.find((s) => s.id === target.id) : undefined;
  // the published length limits are vendor guidelines (often for one chip): over one is a warning
  if (spec?.maxLenMm !== undefined) res.length = { status: len <= spec.maxLenMm ? 'ok' : 'warn', reason: `length ${L(len)} ${unit}, guideline ${L(spec.maxLenMm)} ${unit} (${spec.name})` };

  // loss over all layers at the target's frequency
  if (target) {
    let db = 0;
    let pending = false;
    let missing = false;
    for (const l of layers) {
      if (!coupledOk(l)) continue; // short breakout: no pair impedance, its loss is left out
      if (l.solve.dbPerIn !== undefined) db += (l.solve.dbPerIn * l.len) / 25.4;
      else if (l.solve.pending || l.solve.lossPending) pending = true;
      else missing = true;
    }
    const budget = spec?.lossBudgetDb;
    if (pending) res.loss = { db, status: 'pending', reason: 'loss: solving…' };
    else if (budget !== undefined) {
      // the published budgets are informative or vendor figures, so even over one the pair only warns
      const status: Status = db > 0.8 * budget ? 'warn' : 'ok';
      res.loss = { db, status, reason: `loss ${db.toFixed(2)} dB, budget ${budget} dB${missing ? ' (layers that could not be solved are not counted)' : ''}` };
    } else res.loss = { db, status: 'info', reason: `loss ${db.toFixed(2)} dB${missing ? ' (layers that could not be solved are not counted)' : ''}` };
  }

  if (spec) {
    const checks = viaChecks(item, spec, solves, L, unit);
    if (checks.length) res.checks = checks;
  }

  res.overall = target ? worst([...layers.map((l) => l.status), res.skew?.status, res.length?.status, res.loss?.status, ...(res.checks ?? []).map((c) => c.status)]) : layers.some((l) => l.status === 'pending') ? 'pending' : 'info';
  return res;
}
