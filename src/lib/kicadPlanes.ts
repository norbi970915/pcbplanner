// Plane pairs of a KiCad board for the PDN Impedance Calculator: where a power net and a ground net
// have zones on adjacent copper layers, the area over which the two zone outlines overlap inside the
// board outline, the dielectric between the two layers, and the parallel-plate capacitance of that pair.
//
// The parsed board (kicadImport.ts) keeps only the zone area per layer and net, so the zone and outline
// polygons are read again here from the board text, with the s-expression scanner kicadImport exports.
//
// Areas are exact for polygons (arcs are split into chords of at most 5°), from the sweep in polygonArea.ts.
import { isCopperName, listEnd, parseSexpr, scanTopLevel, type SNode } from './kicadImport';
import { EPS0 } from './pdn';
import { isGroundName, netLeaf } from './kicadRouting';
import { intersectionArea, shoelace, sweepArea, type Box, type Pt } from './polygonArea';
import type { Stackup } from './stackups';

export { intersectionArea, isGroundName, netLeaf, shoelace, sweepArea, type Box, type Pt };

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
export function outlineLoops(items: SNode[][]): Pt[][] {
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
 * The Edge.Cuts graphics inside one footprint (fp_line, fp_arc, fp_rect, fp_circle, fp_poly, fp_curve) as the
 * board graphics they stand for (gr_…), turned into board coordinates like the pads: x' = fx + x·cos a + y·sin a,
 * y' = fy − x·sin a + y·cos a (KiCad's angle, counter-clockwise on screen, y down). Boards often carry their
 * outline in a mechanical footprint. A rectangle becomes a polygon, since it may be turned.
 */
export function footprintEdges(node: SNode[]): SNode[][] {
  const at = child(node, 'at');
  const fx = num(at, 1) ?? 0;
  const fy = num(at, 2) ?? 0;
  const a = ((num(at, 3) ?? 0) * Math.PI) / 180;
  const c = Math.cos(a);
  const sn = Math.sin(a);
  const pt = (n: SNode[]): SNode[] => {
    const x = num(n, 1);
    const y = num(n, 2);
    return x === undefined || y === undefined ? n : [n[0], String(fx + x * c + y * sn), String(fy - x * sn + y * c)];
  };
  const out: SNode[][] = [];
  for (const it of node) {
    const kind = head(it);
    if (!kind?.startsWith('fp_') || atom(child(it as SNode[], 'layer')) !== 'Edge.Cuts') continue;
    const g = it as SNode[];
    if (kind === 'fp_rect') {
      const s0 = xy(child(g, 'start'));
      const e0 = xy(child(g, 'end'));
      if (!s0 || !e0) continue;
      const corners = [s0, [e0[0], s0[1]], e0, [s0[0], e0[1]]].map(([x, y]) => pt(['xy', String(x), String(y)]));
      out.push(['gr_poly', ['pts', ...corners], ['layer', 'Edge.Cuts']]);
      continue;
    }
    out.push([
      'gr_' + kind.slice(3),
      ...g.slice(1).map((ch) => {
        const h = head(ch);
        if (h === 'start' || h === 'end' || h === 'mid' || h === 'center') return pt(ch as SNode[]);
        if (h === 'pts') return ['pts', ...(ch as SNode[]).slice(1).map((p) => (head(p) === 'xy' ? pt(p as SNode[]) : p))];
        return ch;
      }),
    ]);
  }
  return out;
}

/** The Edge.Cuts graphics of a top-level footprint item of the board text, or none (a cheap test first). */
export function footprintEdgesAt(text: string, start: number, end: number): SNode[][] {
  if (!text.slice(start, end).includes('Edge.Cuts')) return [];
  const node = parseSexpr(text, start, listEnd(text, start, end))[0];
  return isList(node) ? footprintEdges(node) : [];
}

const loopBox = (l: Pt[]): Box => [Math.min(...l.map((p) => p[0])), Math.min(...l.map((p) => p[1])), Math.max(...l.map((p) => p[0])), Math.max(...l.map((p) => p[1]))];

/**
 * The board among the closed Edge.Cuts loops: the largest is the board, the loops inside it are cut-outs
 * (filled even-odd), loops outside it (another board of a panel, a stray drawing) are left out. When the
 * extent of the copper is given and the largest loop covers less than half of it (a slot or a cut-out was the
 * only closed shape, the real outline left open), there is no usable outline: null.
 */
export function boardLoops(loops: Pt[][], copper?: Box | null): { loops: Pt[][]; area: number; bbox: Box } | null {
  const closed = loops.filter((l) => l.length >= 3);
  if (!closed.length) return null;
  const largest = closed.reduce((m, l) => (Math.abs(shoelace(l)) > Math.abs(shoelace(m)) ? l : m));
  const bb = loopBox(largest);
  if (copper && copper[2] > copper[0] && copper[3] > copper[1]) {
    const ov = Math.max(0, Math.min(bb[2], copper[2]) - Math.max(bb[0], copper[0])) * Math.max(0, Math.min(bb[3], copper[3]) - Math.max(bb[1], copper[1]));
    if (ov < 0.5 * (copper[2] - copper[0]) * (copper[3] - copper[1])) return null;
  }
  const inside = (l: Pt[]) => l.every(([x, y]) => x >= bb[0] && x <= bb[2] && y >= bb[1] && y <= bb[3]);
  return { loops: closed.filter((l) => l === largest || inside(l)), area: Math.abs(shoelace(largest)), bbox: bb };
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
    } else if (name === 'footprint' || name === 'module') {
      edgeItems.push(...footprintEdgesAt(text, start, end));
    } else if (/^gr_(line|arc|rect|circle|poly|curve)$/.test(name)) {
      const s = text.slice(start, Math.min(end, start + 4000));
      if (!/\(layer\s+"?Edge\.Cuts"?\s*\)/.test(s) && !(end - start > 4000 && text.slice(start, end).includes('Edge.Cuts'))) return;
      edgeItems.push(parseSexpr(text, start, end)[0] as SNode[]);
    }
  });
  // `bbox` is the board the import settled on (kicadImport.ts, measured against the tracks): an outline that
  // leaves most of it out is a slot or a cut-out, not the board
  const board = boardLoops(outlineLoops(edgeItems), opts.bbox);
  if (board) return { zones, outline: board.loops, outlineSource: 'outline' };
  const b = opts.bbox;
  if (b && b[2] > b[0] && b[3] > b[1]) return { zones, outline: [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]]], outlineSource: 'bbox' };
  return { zones, outline: [], outlineSource: 'none' };
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

/** A net name that reads as ground: GND, AGND, GND_PWR, GROUND, VSS, EARTH, 0V. */

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
