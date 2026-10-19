// Plane pairs of a KiCad board for the PDN Impedance Calculator: where a power net and a ground net
// have zones on adjacent copper layers, the area over which the two zone outlines overlap inside the
// board outline, the dielectric between the two layers, and the parallel-plate capacitance of that pair.
//
// The parsed board (kicadImport.ts) keeps only the zone area per layer and net, so the zone and outline
// polygons are read again here from the board text, with the s-expression scanner kicadImport exports.
//
// Areas are exact for polygons (arcs are split into chords of at most 5°): a sweep cuts the plane into
// horizontal strips at every vertex and at every crossing of two edges. Inside such a strip no edge ends
// and no two edges cross, so the covered length is a linear function of y and its value at mid-height
// times the strip height is the strip's area, without a grid and without a resolution to choose.
import { isCopperName, listEnd, parseSexpr, scanTopLevel, type SNode } from './kicadImport';
import { EPS0 } from './pdn';
import type { Stackup } from './stackups';

export type Pt = [number, number];
export type Box = [number, number, number, number]; // x0, y0, x1, y1

/** A zone outline: the first ring is the outline, any further rings are cut-outs (KiCad's ZONE::AddPolygon). */
export interface ZoneGeom {
  net: string;
  layers: string[]; // copper layers, '*.Cu' and 'F&B.Cu' expanded when the layer list is known
  priority: number; // KiCad zone priority: a higher number fills first and cuts lower ones of other nets
  rings: Pt[][];
  keepout: boolean; // a rule area that does not allow copper pours
}

export interface BoardGeometry {
  zones: ZoneGeom[];
  outline: Pt[][]; // closed Edge.Cuts loops (even-odd: a loop inside another is a cut-out); empty when none
  outlineSource: 'outline' | 'bbox' | 'none';
}

/* ------------------------------------------------------------------ reading the board text */

const isList = (n: SNode | undefined): n is SNode[] => Array.isArray(n);
const head = (n: SNode | undefined) => (isList(n) && typeof n[0] === 'string' ? n[0] : undefined);
const child = (n: SNode[], name: string) => n.find((c): c is SNode[] => head(c) === name);
const atom = (n: SNode[] | undefined, i = 1) => (n && typeof n[i] === 'string' ? (n[i] as string) : undefined);
const num = (n: SNode[] | undefined, i = 1) => {
  const v = Number.parseFloat(atom(n, i) ?? '');
  return Number.isFinite(v) ? v : undefined;
};
const xy = (n: SNode[] | undefined): Pt | undefined => {
  const x = num(n, 1);
  const y = num(n, 2);
  return x === undefined || y === undefined ? undefined : [x, y];
};

const ARC_STEP = (5 * Math.PI) / 180;

/** Points of the arc through s, m and e, from s to e, in chords of at most 5°. Collinear points give the chord. */
export function arcPoints(s: Pt, m: Pt, e: Pt): Pt[] {
  const ax = m[0] - s[0], ay = m[1] - s[1], bx = e[0] - s[0], by = e[1] - s[1];
  const d = 2 * (ax * by - ay * bx);
  if (Math.abs(d) < 1e-12) return [s, e];
  const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by;
  const cx = s[0] + (by * a2 - ay * b2) / d;
  const cy = s[1] + (ax * b2 - bx * a2) / d;
  const r = Math.hypot(s[0] - cx, s[1] - cy);
  const ang = (p: Pt) => Math.atan2(p[1] - cy, p[0] - cx);
  const norm = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const a0 = ang(s);
  const ccw = norm(ang(e) - a0);
  const sweep = norm(ang(m) - a0) < ccw ? ccw : ccw - 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(sweep) / ARC_STEP - 1e-9));
  const out: Pt[] = [s];
  for (let i = 1; i < n; i++) out.push([cx + r * Math.cos(a0 + (sweep * i) / n), cy + r * Math.sin(a0 + (sweep * i) / n)]);
  out.push(e);
  return out;
}

/** Points of a (pts …) list, arcs split into chords. */
function ptsOf(pts: SNode[] | undefined): Pt[] {
  const out: Pt[] = [];
  for (const c of pts ?? []) {
    if (head(c) === 'xy') {
      const p = xy(c as SNode[]);
      if (p) out.push(p);
    } else if (head(c) === 'arc') {
      const [s, m, e] = ['start', 'mid', 'end'].map((k) => xy(child(c as SNode[], k)));
      if (s && m && e) out.push(...arcPoints(s, m, e));
      else for (const p of [s, e]) if (p) out.push(p);
    }
  }
  return out;
}

/** Outline, cut-outs, layers, net, priority and keepout flag of one top-level zone (fill polygons are not read). */
function readZone(text: string, start: number, end: number, copper: string[]): ZoneGeom | null {
  const filled = text.indexOf('(filled_polygon', start);
  const stop = filled >= 0 && filled < end ? filled : end - 1;
  const polyStarts: number[] = [];
  for (let i = text.indexOf('(polygon', start); i >= 0 && i < stop; i = text.indexOf('(polygon', i + 8)) polyStarts.push(i);
  const hdr = parseSexpr(text, start + 1, polyStarts.length ? polyStarts[0] : stop);
  if (hdr.some((c) => head(c) === 'attr' && child(c as SNode[], 'teardrop'))) return null;
  const ko = child(hdr, 'keepout');
  if (ko && atom(child(ko, 'copperpour')) !== 'not_allowed') return null; // a rule area that allows pours does not cut them
  const netAtom = atom(child(hdr, 'net'));
  const net = atom(child(hdr, 'net_name')) ?? (netAtom !== undefined && !/^\d+$/.test(netAtom) ? netAtom : '');
  const layerNode = child(hdr, 'layers') ?? child(hdr, 'layer');
  const raw = layerNode?.slice(1).filter((a): a is string => typeof a === 'string') ?? [];
  const layers = raw.flatMap((l) => (l === 'F&B.Cu' ? ['F.Cu', 'B.Cu'] : l === '*.Cu' ? (copper.length ? copper : [l]) : [l])).filter((l) => isCopperName(l) || l === '*.Cu');
  const rings: Pt[][] = [];
  for (const p of polyStarts) {
    const node = parseSexpr(text, p, listEnd(text, p, end))[0];
    if (isList(node)) {
      const pts = ptsOf(child(node, 'pts'));
      if (pts.length > 2) rings.push(pts);
    }
  }
  if (!rings.length || !layers.length) return null;
  return { net: ko ? '' : net || '(no net)', layers, priority: num(child(hdr, 'priority')) ?? 0, rings, keepout: !!ko };
}

/** Closed loops of the Edge.Cuts graphics: rectangles, circles, polygons and chains of lines, arcs and curves. */
function outlineLoops(items: SNode[][]): Pt[][] {
  const loops: Pt[][] = [];
  const edges: Pt[][] = [];
  for (const it of items) {
    const kind = head(it);
    const s = xy(child(it, 'start'));
    const e = xy(child(it, 'end'));
    if (kind === 'gr_line' && s && e) edges.push([s, e]);
    else if (kind === 'gr_arc' && s && e) {
      const m = xy(child(it, 'mid'));
      edges.push(m ? arcPoints(s, m, e) : [s, e]);
    } else if (kind === 'gr_rect' && s && e) loops.push([s, [e[0], s[1]], e, [s[0], e[1]]]);
    else if (kind === 'gr_circle') {
      const c = xy(child(it, 'center'));
      if (c && e) {
        const r = Math.hypot(e[0] - c[0], e[1] - c[1]);
        const n = Math.round((2 * Math.PI) / ARC_STEP);
        loops.push(Array.from({ length: n }, (_, i): Pt => [c[0] + r * Math.cos((2 * Math.PI * i) / n), c[1] + r * Math.sin((2 * Math.PI * i) / n)]));
      }
    } else if (kind === 'gr_poly') {
      const p = ptsOf(child(it, 'pts'));
      if (p.length > 2) loops.push(p);
    } else if (kind === 'gr_curve') {
      const p = ptsOf(child(it, 'pts'));
      if (p.length === 4) {
        const bez = (t: number): Pt => {
          const u = 1 - t;
          const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
          return [w.reduce((a, k, i) => a + k * p[i][0], 0), w.reduce((a, k, i) => a + k * p[i][1], 0)];
        };
        edges.push(Array.from({ length: 17 }, (_, i) => bez(i / 16)));
      }
    }
  }
  // chain the open pieces into loops (ends matched to 1 µm, as kicadImport does)
  const key = (p: Pt) => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`;
  const at = new Map<string, number[]>();
  edges.forEach((e, i) => {
    for (const p of [e[0], e[e.length - 1]]) {
      const k = key(p);
      const l = at.get(k);
      if (l) l.push(i);
      else at.set(k, [i]);
    }
  });
  const used = new Set<number>();
  for (let i = 0; i < edges.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    const loop: Pt[] = [...edges[i]];
    const startKey = key(loop[0]);
    for (let guard = 0; guard < edges.length; guard++) {
      const endKey = key(loop[loop.length - 1]);
      if (endKey === startKey && loop.length > 2) {
        loop.pop();
        if (loop.length > 2) loops.push(loop);
        break;
      }
      const next = (at.get(endKey) ?? []).find((j) => !used.has(j));
      if (next === undefined) break;
      used.add(next);
      const e = edges[next];
      loop.push(...(key(e[0]) === endKey ? e.slice(1) : [...e].reverse().slice(1)));
    }
  }
  return loops;
}

/**
 * Zone outlines and the board outline from the text of a .kicad_pcb. `copper` lists the board's copper
 * layers (to expand '*.Cu'); `bbox` is used as the outline when Edge.Cuts has no closed loop.
 */
export function readBoardGeometry(text: string, opts: { copper?: string[]; bbox?: Box | null } = {}): BoardGeometry {
  let rootStart = 0;
  while (rootStart < text.length && (text.charCodeAt(rootStart) <= 32 || text.charCodeAt(rootStart) === 0xfeff)) rootStart++;
  if (!text.startsWith('(kicad_pcb', rootStart)) throw new Error('This is not a KiCad board file.');
  const copper = opts.copper ?? [];
  const zones: ZoneGeom[] = [];
  const edgeItems: SNode[][] = [];
  scanTopLevel(text, rootStart, (name, start, end) => {
    if (name === 'zone') {
      const z = readZone(text, start, end, copper);
      if (z) zones.push(z);
    } else if (/^gr_(line|arc|rect|circle|poly|curve)$/.test(name)) {
      const s = text.slice(start, Math.min(end, start + 4000));
      if (!/\(layer\s+"?Edge\.Cuts"?\s*\)/.test(s) && !(end - start > 4000 && text.slice(start, end).includes('Edge.Cuts'))) return;
      edgeItems.push(parseSexpr(text, start, end)[0] as SNode[]);
    }
  });
  const loops = outlineLoops(edgeItems);
  if (loops.length) return { zones, outline: loops, outlineSource: 'outline' };
  const b = opts.bbox;
  if (b && b[2] > b[0] && b[3] > b[1]) return { zones, outline: [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]]], outlineSource: 'bbox' };
  return { zones, outline: [], outlineSource: 'none' };
}

/* ------------------------------------------------------------------ exact area of a boolean combination */

/**
 * Area (mm²) and bounding box of the set where `inside` holds. `shapes` are ring sets, each filled
 * even-odd; `inside` receives, for every shape, 1 where the point is inside it and 0 where not. The
 * sweep is exact for polygons: strips are cut at every vertex and edge crossing, so the covered length
 * is linear in y within each strip and the mid-height value gives the strip's area exactly.
 */
export function sweepArea(shapes: Pt[][][], inside: (odd: Uint8Array) => boolean): { area: number; bbox: Box | null } {
  const ex0: number[] = [], ey0: number[] = [], ey1: number[] = [], eslope: number[] = [], eshape: number[] = [];
  const yset: number[] = [];
  shapes.forEach((rings, s) => {
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i];
        const q = ring[(i + 1) % ring.length];
        yset.push(p[1]);
        if (p[1] === q[1]) continue;
        const [a, b] = p[1] < q[1] ? [p, q] : [q, p];
        ex0.push(a[0]);
        ey0.push(a[1]);
        ey1.push(b[1]);
        eslope.push((b[0] - a[0]) / (b[1] - a[1]));
        eshape.push(s);
      }
    }
  });
  const ne = ex0.length;
  if (!ne) return { area: 0, bbox: null };
  const ys = Float64Array.from(yset).sort();
  const order = Array.from({ length: ne }, (_, i) => i).sort((a, b) => ey0[a] - ey0[b]);
  const xAt = (e: number, y: number) => ex0[e] + (y - ey0[e]) * eslope[e];
  const odd = new Uint8Array(shapes.length);
  let area = 0;
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  let active: number[] = [];
  let next = 0;
  for (let k = 0; k + 1 < ys.length; k++) {
    const y0 = ys[k], y1 = ys[k + 1];
    if (!(y1 > y0)) continue;
    active = active.filter((e) => ey1[e] > y0);
    while (next < ne && ey0[order[next]] <= y0) {
      if (ey1[order[next]] > y0) active.push(order[next]);
      next++;
    }
    if (!active.length) continue;
    // crossings inside the strip: where two edges change order between the bottom and the top
    const na = active.length;
    const xb = active.map((e) => xAt(e, y0));
    const xt = active.map((e) => xAt(e, y1));
    const byBottom = Array.from({ length: na }, (_, i) => i).sort((a, b) => xb[a] - xb[b] || xt[a] - xt[b]);
    const cuts: number[] = [0, 1];
    if (byBottom.some((v, i) => i > 0 && xt[v] < xt[byBottom[i - 1]])) {
      for (let i = 0; i < na; i++)
        for (let j = i + 1; j < na; j++) {
          const d0 = xb[i] - xb[j], d1 = xt[i] - xt[j];
          if ((d0 < 0 && d1 > 0) || (d0 > 0 && d1 < 0)) cuts.push(d0 / (d0 - d1));
        }
      cuts.sort((a, b) => a - b);
    }
    for (let c = 0; c + 1 < cuts.length; c++) {
      const ya = y0 + (y1 - y0) * cuts[c], yb = y0 + (y1 - y0) * cuts[c + 1];
      const h = yb - ya;
      if (!(h > 0)) continue;
      const ym = (ya + yb) / 2;
      const xm = active.map((e) => xAt(e, ym));
      const idx = Array.from({ length: na }, (_, i) => i).sort((a, b) => xm[a] - xm[b]);
      odd.fill(0);
      let len = 0;
      for (let i = 0; i < na; i++) {
        const e = active[idx[i]];
        odd[eshape[e]] ^= 1;
        if (i + 1 === na) break;
        const w = xm[idx[i + 1]] - xm[idx[i]];
        if (w > 0 && inside(odd)) {
          len += w;
          const f = active[idx[i + 1]];
          bx0 = Math.min(bx0, xAt(e, ya), xAt(e, yb));
          bx1 = Math.max(bx1, xAt(f, ya), xAt(f, yb));
          by0 = Math.min(by0, ya);
          by1 = Math.max(by1, yb);
        }
      }
      area += len * h;
    }
  }
  return { area, bbox: area > 0 ? [bx0, by0, bx1, by1] : null };
}

/** Area of the intersection of regions; each region is a union of shapes, each shape a ring set filled even-odd. */
export function intersectionArea(regions: Pt[][][][]): { area: number; bbox: Box | null } {
  const shapes: Pt[][][] = [];
  const groups = regions.map((r) => r.map((s) => shapes.push(s) - 1));
  return sweepArea(shapes, (odd) => groups.every((g) => g.some((i) => odd[i])));
}

/** Area of one polygon (shoelace), for checks. */
export function shoelace(p: Pt[]): number {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]);
  return Math.abs(a / 2);
}

/* ------------------------------------------------------------------ copper of a net on a layer */

interface Copper {
  shapes: Pt[][][];
  inside: (odd: Uint8Array) => boolean;
}

/**
 * Shapes and coverage test for "zone copper of `net` on `layer`, inside the board": the union of the
 * net's zone outlines (cut-outs removed), less the outlines of higher-priority zones of other nets and of
 * keepouts that forbid pours on that layer, clipped to the board outline. Outlines, not fills.
 */
function netCopper(g: BoardGeometry, layer: string, net: string, shapes: Pt[][][]): ((odd: Uint8Array) => boolean) | null {
  const on = g.zones.filter((z) => z.layers.includes(layer) || z.layers.includes('*.Cu'));
  const own = on.filter((z) => !z.keepout && z.net === net);
  if (!own.length) return null;
  const index = new Map<ZoneGeom, number>();
  const idx = (z: ZoneGeom) => {
    let i = index.get(z);
    if (i === undefined) {
      i = shapes.push(z.rings) - 1;
      index.set(z, i);
    }
    return i;
  };
  const parts = own.map((z) => ({ i: idx(z), cut: on.filter((w) => w.keepout || (w.net !== net && w.priority > z.priority)).map(idx) }));
  return (odd) => parts.some((p) => odd[p.i] === 1 && !p.cut.some((c) => odd[c] === 1));
}

function boardShape(g: BoardGeometry, shapes: Pt[][][]): (odd: Uint8Array) => boolean {
  if (!g.outline.length) return () => true;
  const i = shapes.push(g.outline) - 1;
  return (odd) => odd[i] === 1;
}

function copperOf(g: BoardGeometry, layer: string, net: string): Copper | null {
  const shapes: Pt[][][] = [];
  const board = boardShape(g, shapes);
  const c = netCopper(g, layer, net, shapes);
  return c ? { shapes, inside: (odd) => board(odd) && c(odd) } : null;
}

export interface ZoneNet {
  net: string;
  area: number; // zone area over all copper layers, inside the board, mm²
  layers: { layer: string; area: number }[]; // top to bottom
  ground: boolean; // its name looks like a ground net
}

/** Leaf of a hierarchical net name. */
export const netLeaf = (n: string) => n.slice(n.lastIndexOf('/') + 1) || n;

/** A net name that reads as ground: GND, AGND, GND_PWR, GROUND, VSS, EARTH, 0V. */
export const isGroundName = (net: string) => /gnd|ground|vss|earth/i.test(netLeaf(net)) || /^0v$/i.test(netLeaf(net));

/** Every net with zones, with its zone area per copper layer, largest first. `copper` is the layer order. */
export function zoneNets(g: BoardGeometry, copper: string[]): ZoneNet[] {
  const names = [...new Set(g.zones.filter((z) => !z.keepout && z.net !== '(no net)').map((z) => z.net))];
  const out: ZoneNet[] = [];
  for (const net of names) {
    const layers: ZoneNet['layers'] = [];
    for (const layer of copper) {
      const c = copperOf(g, layer, net);
      const a = c ? sweepArea(c.shapes, c.inside).area : 0;
      if (a > 0) layers.push({ layer, area: a });
    }
    if (layers.length) out.push({ net, area: layers.reduce((s, l) => s + l.area, 0), layers, ground: isGroundName(net) });
  }
  return out.sort((a, b) => b.area - a.area || a.net.localeCompare(b.net));
}

/** The ground net to start with: the largest ground-like zone net, else the largest zone net. */
export const defaultGroundNet = (nets: ZoneNet[]) => (nets.find((n) => n.ground) ?? nets[0])?.net;

/* ------------------------------------------------------------------ plane pairs */

export interface Ply {
  name: string;
  t: number; // mm
  er: number;
}

export interface AdjacentCopper {
  upper: string;
  lower: string;
  plies: Ply[]; // the dielectric (sub)layers between them, top to bottom; empty without a stackup
}

/** Neighbouring copper layers of a stackup and the dielectric plies between each pair, top to bottom. */
export function adjacentCoppers(s: Stackup): AdjacentCopper[] {
  const out: AdjacentCopper[] = [];
  let last: string | null = null;
  let plies: Ply[] = [];
  for (const l of s.layers) {
    if (l.kind === 'copper') {
      if (last !== null) out.push({ upper: last, lower: l.name, plies });
      last = l.name;
      plies = [];
    } else if (l.kind === 'dielectric' && last !== null) plies.push({ name: l.name, t: l.t, er: l.er ?? 4.5 });
  }
  return out;
}

/** Neighbouring layers by name only (no stackup: thickness and εr unknown). */
export const adjacentByName = (copper: string[]): AdjacentCopper[] => copper.slice(1).map((lower, i) => ({ upper: copper[i], lower, plies: [] }));

/**
 * εr of a stack of plies between two planes. The plies are capacitors in series, so the effective εr is
 * the thickness-weighted harmonic mean d / Σ(tᵢ/εrᵢ): with it, ε0·εr·A/d equals the series capacitance.
 */
export function seriesEr(plies: Ply[]): number {
  const d = plies.reduce((a, p) => a + p.t, 0);
  const s = plies.reduce((a, p) => a + p.t / p.er, 0);
  return d > 0 && s > 0 ? d / s : NaN;
}

export interface PlanePair {
  upper: string; // the upper of the two copper layers
  lower: string;
  powerLayer: string;
  groundLayer: string;
  area: number; // overlap of the two nets' zone outlines inside the board, mm²
  bbox: Box | null; // bounding box of the overlap
  plies: Ply[];
  d: number; // dielectric thickness, mm (sum of the plies; 0 without a stackup)
  er: number; // series εr of the plies (NaN without a stackup)
  c: number; // capacitance, F: ε0·A / Σ(tᵢ/εrᵢ), each ply a parallel-plate capacitor in series (NaN without a stackup)
  estimate?: boolean; // area from the zone areas alone (no geometry): the smaller of the two
}

const pairC = (area: number, plies: Ply[]) => {
  const s = plies.reduce((a, p) => a + (p.t * 1e-3) / p.er, 0);
  return s > 0 ? (EPS0 * area * 1e-6) / s : NaN;
};

const makePair = (a: AdjacentCopper, powerLayer: string, groundLayer: string, area: number, bbox: Box | null, estimate?: boolean): PlanePair => ({
  upper: a.upper,
  lower: a.lower,
  powerLayer,
  groundLayer,
  area,
  bbox,
  plies: a.plies,
  d: a.plies.reduce((s, p) => s + p.t, 0),
  er: seriesEr(a.plies),
  c: pairC(area, a.plies),
  ...(estimate ? { estimate } : {}),
});

/** Overlap of `power` copper on one layer and `ground` copper on another, inside the board. */
export function overlap(g: BoardGeometry, powerLayer: string, power: string, groundLayer: string, ground: string): { area: number; bbox: Box | null } {
  const shapes: Pt[][][] = [];
  const board = boardShape(g, shapes);
  const p = netCopper(g, powerLayer, power, shapes);
  const q = netCopper(g, groundLayer, ground, shapes);
  if (!p || !q) return { area: 0, bbox: null };
  return sweepArea(shapes, (odd) => board(odd) && p(odd) && q(odd));
}

/**
 * Plane pairs of a power net and a ground net: adjacent copper layers where one carries a zone of the
 * power net and the other a zone of the ground net, with an overlap inside the board. Both orders are
 * tried on each neighbouring pair (a split layer can hold both nets). Largest capacitance (else area) first.
 */
export function planePairs(g: BoardGeometry, adjacent: AdjacentCopper[], power: string, ground: string): PlanePair[] {
  if (!power || !ground || power === ground) return [];
  const out: PlanePair[] = [];
  for (const a of adjacent)
    for (const [pl, gl] of [[a.upper, a.lower], [a.lower, a.upper]]) {
      const o = overlap(g, pl, power, gl, ground);
      if (o.area > 1e-9) out.push(makePair(a, pl, gl, o.area, o.bbox));
    }
  return out.sort((x, y) => (Number.isFinite(y.c) && Number.isFinite(x.c) ? y.c - x.c : y.area - x.area));
}

/**
 * Without the zone geometry (only the zone area per layer and net that kicadImport keeps): a rough
 * estimate that takes the smaller of the two zone areas as the overlap.
 */
export function planePairsFromAreas(layerNets: { name: string; nets: { net: string; area: number }[] }[], adjacent: AdjacentCopper[], power: string, ground: string): PlanePair[] {
  if (!power || !ground || power === ground) return [];
  const areaOf = (layer: string, net: string) => layerNets.find((l) => l.name === layer)?.nets.find((n) => n.net === net)?.area ?? 0;
  const out: PlanePair[] = [];
  for (const a of adjacent)
    for (const [pl, gl] of [[a.upper, a.lower], [a.lower, a.upper]]) {
      const area = Math.min(areaOf(pl, power), areaOf(gl, ground));
      if (area > 1e-9) out.push(makePair(a, pl, gl, area, null, true));
    }
  return out.sort((x, y) => (Number.isFinite(y.c) && Number.isFinite(x.c) ? y.c - x.c : y.area - x.area));
}

/** Pairs that share one dielectric (same thickness and εr) can be summed into one plane-pair input. */
export const sameDielectric = (ps: PlanePair[]) => ps.length > 1 && ps.every((p) => Math.abs(p.d - ps[0].d) < 1e-9 && Math.abs(p.er - ps[0].er) < 1e-9 && Number.isFinite(p.er));

export interface PdnPlaneFields {
  pl: number; // mm
  pw: number; // mm
  pd?: number; // mm, absent without a stackup
  er?: number;
}

const round = (v: number, digits: number) => Number(v.toPrecision(digits));

/**
 * PDN Impedance Calculator plane inputs for one pair (or several pairs on the same dielectric, summed):
 * L is the x extent of the overlap and W the area divided by L, so L × W is the overlap area; d and εr
 * are the dielectric's (left out without a stackup). Values are rounded to 6 significant figures.
 */
export function pdnPlaneFields(ps: PlanePair[]): PdnPlaneFields | null {
  if (!ps.length) return null;
  const area = ps.reduce((a, p) => a + p.area, 0);
  const boxes = ps.map((p) => p.bbox).filter((b): b is Box => !!b);
  const span = boxes.length ? Math.max(...boxes.map((b) => b[2])) - Math.min(...boxes.map((b) => b[0])) : Math.sqrt(area);
  const pl = round(span > 0 ? span : Math.sqrt(area), 6);
  const known = ps.every((p) => p.d > 0 && Number.isFinite(p.er));
  return { pl, pw: round(area / pl, 6), ...(known ? { pd: round(ps[0].d, 6), er: round(ps[0].er, 6) } : {}) };
}

/** Why there is no plane pair to apply, in words; null when there is one. */
export function planePairMessage(nets: ZoneNet[], power: string | undefined, ground: string | undefined, pairs: PlanePair[]): string | null {
  if (!nets.length) return 'The board has no zones, so there is no plane pair to take. Enter the plane pair by hand.';
  if (!ground || !power) return 'The board has zones of one net only; a plane pair needs a power net and a ground net.';
  if (!pairs.length) return `No plane pair: ${netLeaf(power)} and ${netLeaf(ground)} have no zones on neighbouring copper layers that overlap inside the board.`;
  return null;
}
