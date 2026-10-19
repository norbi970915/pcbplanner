// Reads the physical stackup, copper layers, board outline, zones and track lengths from a
// KiCad .kicad_pcb file (KiCad 6 to 10), and turns it into a PCBPlanner Stackup.
//
// The grammar follows KiCad's own writer and reader:
//   BOARD_STACKUP::FormatBoardStackup  (pcbnew/board_stackup_manager/board_stackup.cpp)
//   PCB_IO_KICAD_SEXPR_PARSER::parseBoardStackup  (pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr_parser.cpp)
// A stackup item is (layer "<name>" (type "<type>") <sublayer> [addsublayer <sublayer>]…), where a
// sublayer is a run of (color …) (thickness <mm> [locked]) (material …) (epsilon_r …) (loss_tangent …)
// (spec_frequency <Hz>) (dielectric_model …). "addsublayer" is a bare token between sublayers.
//
// A board file can be tens of MB. Only the top-level items that matter are looked at: one pass of a
// balanced-parenthesis scanner finds them, and only (general), (layers), (setup), Edge.Cuts graphics
// and the header and outline of each zone are parsed into small trees. Tracks are read with a regex.
import { MASK_DF, type CopperRole, type Layer, type Stackup } from './stackups';

/* ------------------------------------------------------------------ s-expressions */

export type SNode = string | SNode[];

/** Parse the s-expressions in text[start, end) into nodes. Quoted atoms lose their quotes and escapes. */
export function parseSexpr(text: string, start = 0, end = text.length): SNode[] {
  const root: SNode[] = [];
  const stack: SNode[][] = [root];
  let i = start;
  while (i < end) {
    const c = text.charCodeAt(i);
    if (c === 40) {
      const n: SNode[] = [];
      stack[stack.length - 1].push(n);
      stack.push(n);
      i++;
    } else if (c === 41) {
      if (stack.length > 1) stack.pop();
      i++;
    } else if (c === 34) {
      let j = i + 1;
      let seg = j;
      let out = '';
      while (j < end) {
        const d = text.charCodeAt(j);
        if (d === 92) {
          out += text.slice(seg, j);
          const e = text[j + 1];
          out += e === 'n' ? '\n' : e === 'r' ? '\r' : e === 't' ? '\t' : (e ?? '');
          j += 2;
          seg = j;
        } else if (d === 34) break;
        else j++;
      }
      out += text.slice(seg, Math.min(j, end));
      stack[stack.length - 1].push(out);
      i = j + 1;
    } else if (c <= 32) i++;
    else {
      let j = i;
      while (j < end) {
        const d = text.charCodeAt(j);
        if (d <= 32 || d === 40 || d === 41 || d === 34) break;
        j++;
      }
      stack[stack.length - 1].push(text.slice(i, j));
      i = j;
    }
  }
  return root;
}

/** Index just after the list that opens at text[i] === '('. */
export function listEnd(text: string, i: number, limit = text.length): number {
  let depth = 0;
  for (let j = i; j < limit; j++) {
    const c = text.charCodeAt(j);
    if (c === 34) {
      for (j++; j < limit; j++) {
        const d = text.charCodeAt(j);
        if (d === 92) j++;
        else if (d === 34) break;
      }
    } else if (c === 40) depth++;
    else if (c === 41 && --depth === 0) return j + 1;
  }
  throw new Error('The file ends inside an unclosed list: it is truncated or not a KiCad board file.');
}

/**
 * Visit every direct child list of the root list (one pass, strings and escapes respected).
 * Returns the index of the root's closing parenthesis.
 */
export function scanTopLevel(text: string, rootStart: number, visit: (name: string, start: number, end: number) => void): number {
  let depth = 0;
  let itemStart = -1;
  const n = text.length;
  for (let i = rootStart; i < n; i++) {
    const c = text.charCodeAt(i);
    if (c === 34) {
      for (i++; i < n; i++) {
        const d = text.charCodeAt(i);
        if (d === 92) i++;
        else if (d === 34) break;
      }
    } else if (c === 40) {
      depth++;
      if (depth === 2) itemStart = i;
    } else if (c === 41) {
      if (depth === 2) {
        let j = itemStart + 1;
        while (j < i && text.charCodeAt(j) > 32 && text.charCodeAt(j) !== 40 && text.charCodeAt(j) !== 41) j++;
        visit(text.slice(itemStart + 1, j), itemStart, i + 1);
      }
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error('The file ends inside an unclosed list: it is truncated or not a KiCad board file.');
}

const isList = (n: SNode | undefined): n is SNode[] => Array.isArray(n);
const head = (n: SNode | undefined) => (isList(n) && typeof n[0] === 'string' ? n[0] : undefined);
const child = (n: SNode[], name: string) => n.find((c): c is SNode[] => head(c) === name);
const atom = (n: SNode[] | undefined, i = 1) => (n && typeof n[i] === 'string' ? (n[i] as string) : undefined);
const num = (n: SNode[] | undefined, i = 1) => {
  const a = atom(n, i);
  const v = a === undefined ? NaN : Number.parseFloat(a);
  return Number.isFinite(v) ? v : undefined;
};

/* ------------------------------------------------------------------ board model */

export interface KicadSublayer {
  t?: number; // mm
  locked?: boolean;
  material?: string;
  er?: number;
  df?: number;
  fHz?: number; // spec_frequency (KiCad 10 and later)
  model?: string; // dielectric_model
  color?: string;
}

export interface KicadStackupItem {
  name: string; // "F.Mask", "F.Cu", "dielectric 1", …
  type: string; // "Top Solder Mask", "copper", "core", "prepreg", …
  subs: KicadSublayer[];
}

export interface KicadCopperLayer {
  name: string; // canonical name: F.Cu, In1.Cu … B.Cu
  number: number; // layer number in the file
  type: string; // signal, power, mixed, jumper
  userName?: string;
  zoneArea: number; // mm², zone outlines on this layer clipped to the board, summed over the three largest nets
  nets: { net: string; area: number }[]; // zone area per net, largest first (at most 6)
  zones: number;
  routedMm: number; // track length on this layer
}

export interface KicadBoard {
  version: number; // file format date, e.g. 20240108
  generator?: string;
  generatorVersion?: string;
  kicad: string; // "8.0", "5 or older", …
  thickness?: number; // (general (thickness …)), mm
  copperFinish?: string;
  copper: KicadCopperLayer[]; // top to bottom
  stackup: KicadStackupItem[] | null;
  board: { area: number; bbox: [number, number, number, number] | null; source: 'outline' | 'bbox' | 'zones' | 'none' };
  stats: { bytes: number; zones: number; tracks: number; ms: number };
}

/** KiCad's defaults for a new dielectric and solder mask (BOARD_STACKUP_ITEM constructor, stackup_predefined_prms.h). */
export const KICAD_DEFAULTS = { dielectricEr: 4.5, dielectricDf: 0.02, dielectricMaterial: 'FR4', maskEr: 3.3, maskT: 0.01, copperT: 0.035 };

/** Plane detection thresholds (see the Method section of the KiCad impedance page). */
export const PLANE_RULE = { coverage: 0.5, nets: 3, trackShare: 0.2 };

const copperOrder = (name: string) => {
  if (name === 'F.Cu') return 0;
  if (name === 'B.Cu') return 1000;
  const m = /^In(\d+)\.Cu$/.exec(name);
  return m ? Number(m[1]) : -1;
};
export const isCopperName = (name: string) => copperOrder(name) >= 0;

/** KiCad release that writes a file format version (pcb_io_kicad_sexpr.h). */
export function kicadRelease(version: number, generatorVersion?: string): string {
  if (generatorVersion && /^\d+(\.\d+)?$/.test(generatorVersion)) return Number(generatorVersion) >= 9.99 && Number(generatorVersion) < 10 ? '10 (development)' : generatorVersion;
  if (version >= 20240108) return '8.0';
  if (version >= 20221018) return '7.0';
  if (version >= 20211014) return '6.0';
  if (version >= 20200000) return '6 (development)';
  return '5 or older';
}

/** "20240108" → "2024-01-08". */
export const versionDate = (v: number) => {
  const s = String(v);
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : s;
};

type Pt = [number, number];

const shoelace = (p: Pt[]) => {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]);
  return Math.abs(a / 2);
};

/** Sutherland–Hodgman clip of a polygon to an axis-aligned rectangle. */
export function clipToBox(poly: Pt[], [x0, y0, x1, y1]: [number, number, number, number]): Pt[] {
  let out = poly;
  const edges: [(p: Pt) => boolean, (a: Pt, b: Pt) => Pt][] = [
    [(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]],
    [(p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]],
  ];
  for (const [inside, cut] of edges) {
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[(i + src.length - 1) % src.length];
      const b = src[i];
      if (inside(b)) {
        if (!inside(a)) out.push(cut(a, b));
        out.push(b);
      } else if (inside(a)) out.push(cut(a, b));
    }
    if (!out.length) break;
  }
  return out;
}

const xy = (n: SNode[] | undefined): Pt | undefined => {
  const x = num(n, 1);
  const y = num(n, 2);
  return x === undefined || y === undefined ? undefined : [x, y];
};

/** Points of a (pts …) list; an arc contributes its start, mid and end points. */
function ptsOf(pts: SNode[] | undefined): Pt[] {
  const out: Pt[] = [];
  for (const c of pts ?? []) {
    if (head(c) === 'xy') {
      const p = xy(c as SNode[]);
      if (p) out.push(p);
    } else if (head(c) === 'arc') {
      for (const k of ['start', 'mid', 'end']) {
        const p = xy(child(c as SNode[], k));
        if (p) out.push(p);
      }
    }
  }
  return out;
}

/** Board outline from Edge.Cuts graphics: the largest closed shape, else the bounding box. */
function outlineFrom(items: SNode[][]): KicadBoard['board'] {
  const closed: number[] = [];
  const edges: Pt[][] = [];
  let bbox: [number, number, number, number] | null = null;
  const grow = (p: Pt) => {
    bbox = bbox ? [Math.min(bbox[0], p[0]), Math.min(bbox[1], p[1]), Math.max(bbox[2], p[0]), Math.max(bbox[3], p[1])] : [p[0], p[1], p[0], p[1]];
  };
  for (const it of items) {
    const kind = head(it);
    const s = xy(child(it, 'start'));
    const e = xy(child(it, 'end'));
    if (kind === 'gr_line' && s && e) edges.push([s, e]);
    else if (kind === 'gr_arc' && s && e) {
      const m = xy(child(it, 'mid'));
      edges.push(m ? [s, m, e] : [s, e]);
    } else if (kind === 'gr_rect' && s && e) {
      const r: Pt[] = [s, [e[0], s[1]], e, [s[0], e[1]]];
      r.forEach(grow);
      closed.push(shoelace(r));
    } else if (kind === 'gr_circle') {
      const c = xy(child(it, 'center'));
      if (c && e) {
        const r = Math.hypot(e[0] - c[0], e[1] - c[1]);
        grow([c[0] - r, c[1] - r]);
        grow([c[0] + r, c[1] + r]);
        closed.push(Math.PI * r * r);
      }
    } else if (kind === 'gr_poly') {
      const p = ptsOf(child(it, 'pts'));
      p.forEach(grow);
      if (p.length > 2) closed.push(shoelace(p));
    } else if (kind === 'gr_curve') ptsOf(child(it, 'pts')).forEach(grow);
  }
  for (const e of edges) e.forEach(grow);
  // chain the line and arc segments into loops
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
    let ok = false;
    for (let guard = 0; guard < edges.length; guard++) {
      const endKey = key(loop[loop.length - 1]);
      if (endKey === startKey && loop.length > 2) {
        ok = true;
        break;
      }
      const next = (at.get(endKey) ?? []).find((j) => !used.has(j));
      if (next === undefined) break;
      used.add(next);
      const e = edges[next];
      const fwd = key(e[0]) === endKey;
      loop.push(...(fwd ? e.slice(1) : [...e].reverse().slice(1)));
    }
    if (ok) closed.push(shoelace(loop));
  }
  const b = bbox as [number, number, number, number] | null;
  if (closed.length) return { area: Math.max(...closed), bbox: b, source: 'outline' };
  if (b && (b[2] - b[0]) * (b[3] - b[1]) > 0) return { area: (b[2] - b[0]) * (b[3] - b[1]), bbox: b, source: 'bbox' };
  return { area: 0, bbox: null, source: 'none' };
}

interface RawZone {
  net: string;
  layers: string[];
  polys: Pt[][];
}

/** Header (net, layers, keepout) and outline polygons of one top-level zone. Fill polygons are skipped. */
function readZone(text: string, start: number, end: number): RawZone | null {
  const filled = text.indexOf('(filled_polygon', start);
  const stop = filled >= 0 && filled < end ? filled : end - 1;
  const polyStarts: number[] = [];
  for (let i = text.indexOf('(polygon', start); i >= 0 && i < stop; i = text.indexOf('(polygon', i + 8)) polyStarts.push(i);
  const headerEnd = polyStarts.length ? polyStarts[0] : stop;
  const hdr = parseSexpr(text, start + 1, headerEnd);
  if (child(hdr, 'keepout') || hdr.some((c) => head(c) === 'attr' && child(c as SNode[], 'teardrop'))) return null;
  const netNode = child(hdr, 'net');
  const netAtom = atom(netNode);
  const netName = atom(child(hdr, 'net_name'));
  const net = netName ?? (netAtom !== undefined && !/^\d+$/.test(netAtom) ? netAtom : '') ?? '';
  const layerNode = child(hdr, 'layers') ?? child(hdr, 'layer');
  const layers = (layerNode?.slice(1).filter((a): a is string => typeof a === 'string') ?? []).flatMap((l) => (l === 'F&B.Cu' ? ['F.Cu', 'B.Cu'] : [l]));
  const polys: Pt[][] = [];
  for (const p of polyStarts) {
    const pe = listEnd(text, p, end);
    const node = parseSexpr(text, p, pe)[0];
    if (isList(node)) {
      const pts = ptsOf(child(node, 'pts'));
      if (pts.length > 2) polys.push(pts);
    }
  }
  return { net: net || '(no net)', layers, polys };
}

const RE_START = /\(start\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s*\)/;
const RE_MID = /\(mid\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s*\)/;
const RE_END = /\(end\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s*\)/;
const RE_LAYER = /\(layer\s+"?([^"\s)]+)"?/;

/** Length and layer of a top-level (segment …) or (arc …). */
function readTrack(text: string, start: number, end: number, arc: boolean): { layer: string; len: number } | null {
  const s = text.slice(start, end);
  const a = RE_START.exec(s);
  const b = RE_END.exec(s);
  const l = RE_LAYER.exec(s);
  if (!a || !b || !l) return null;
  const p = [Number(a[1]), Number(a[2])];
  const q = [Number(b[1]), Number(b[2])];
  const m = arc ? RE_MID.exec(s) : null;
  const len = m ? Math.hypot(Number(m[1]) - p[0], Number(m[2]) - p[1]) + Math.hypot(q[0] - Number(m[1]), q[1] - Number(m[2])) : Math.hypot(q[0] - p[0], q[1] - p[1]);
  return Number.isFinite(len) ? { layer: l[1], len } : null;
}

/** Stackup items from the (stackup …) list of (setup …). */
export function readStackup(node: SNode[]): { items: KicadStackupItem[]; copperFinish?: string } {
  const items: KicadStackupItem[] = [];
  let copperFinish: string | undefined;
  for (const c of node.slice(1)) {
    if (!isList(c)) continue;
    const h = head(c);
    if (h === 'copper_finish') copperFinish = atom(c);
    if (h !== 'layer') continue;
    const name = atom(c);
    if (!name) continue;
    const item: KicadStackupItem = { name, type: '', subs: [{}] };
    let sub = item.subs[0];
    const readProp = (p: SNode[], into: KicadSublayer) => {
      switch (head(p)) {
        case 'type':
          item.type = atom(p) ?? '';
          break;
        case 'thickness':
          into.t = num(p);
          if (p.slice(2).includes('locked')) into.locked = true;
          break;
        case 'material':
          into.material = atom(p);
          break;
        case 'epsilon_r':
          into.er = num(p);
          break;
        case 'loss_tangent':
          into.df = num(p);
          break;
        case 'spec_frequency':
          into.fHz = num(p);
          break;
        case 'dielectric_model':
          into.model = atom(p);
          break;
        case 'color':
          into.color = atom(p);
          break;
      }
    };
    for (const p of c.slice(2)) {
      if (p === 'addsublayer') {
        sub = {};
        item.subs.push(sub);
      } else if (isList(p) && head(p) === 'addsublayer') {
        // tolerate a list form (addsublayer (thickness …) …) as well
        const s: KicadSublayer = {};
        for (const q of p.slice(1)) if (isList(q)) readProp(q, s);
        item.subs.push(s);
      } else if (isList(p)) readProp(p, sub);
    }
    items.push(item);
  }
  return { items, copperFinish };
}

/** Read a .kicad_pcb file. Throws with a plain message when the file is not a KiCad board. */
export function parseKicadBoard(text: string): KicadBoard {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let rootStart = 0;
  while (rootStart < text.length && (text.charCodeAt(rootStart) <= 32 || text.charCodeAt(rootStart) === 0xfeff)) rootStart++;
  if (text.startsWith('PCBNEW-BOARD', rootStart)) throw new Error('This is a legacy KiCad .brd file (KiCad 4 or older). Open it in KiCad 6 or later and save it as .kicad_pcb.');
  if (!/^\(kicad_pcb[\s)]/.test(text.slice(rootStart, rootStart + 12))) throw new Error('This is not a KiCad board file: a .kicad_pcb file starts with “(kicad_pcb”.');

  let version = 0;
  let generator: string | undefined;
  let generatorVersion: string | undefined;
  let thickness: number | undefined;
  let layerList: SNode[] | undefined;
  let stackupNode: SNode[] | undefined;
  const edgeItems: SNode[][] = [];
  const zones: RawZone[] = [];
  const routed = new Map<string, number>();
  let tracks = 0;

  scanTopLevel(text, rootStart, (name, start, end) => {
    switch (name) {
      case 'version':
      case 'generator':
      case 'generator_version':
      case 'host':
      case 'general':
      case 'layers':
      case 'setup': {
        const node = parseSexpr(text, start, end)[0] as SNode[];
        if (name === 'version') version = num(node) ?? 0;
        else if (name === 'generator') generator = atom(node);
        else if (name === 'generator_version') generatorVersion = atom(node);
        else if (name === 'host') {
          generator = atom(node);
          generatorVersion = atom(node, 2)?.replace(/^\(|\).*$/g, '');
        } else if (name === 'general') thickness = num(child(node, 'thickness'));
        else if (name === 'layers') layerList = node;
        else stackupNode = child(node, 'stackup');
        break;
      }
      case 'gr_line':
      case 'gr_arc':
      case 'gr_rect':
      case 'gr_circle':
      case 'gr_poly':
      case 'gr_curve': {
        // cheap pre-check before parsing: only board-outline graphics matter
        const s = text.slice(start, Math.min(end, start + 4000));
        if (!/\(layer\s+"?Edge\.Cuts"?\s*\)/.test(s) && !(end - start > 4000 && text.slice(start, end).includes('Edge.Cuts'))) break;
        edgeItems.push(parseSexpr(text, start, end)[0] as SNode[]);
        break;
      }
      case 'zone': {
        const z = readZone(text, start, end);
        if (z) zones.push(z);
        break;
      }
      case 'segment':
      case 'arc': {
        const r = readTrack(text, start, end, name === 'arc');
        if (r) {
          tracks++;
          routed.set(r.layer, (routed.get(r.layer) ?? 0) + r.len);
        }
        break;
      }
    }
  });

  const copper: KicadCopperLayer[] = [];
  // KiCad 5 files may name a copper layer by its user name ("(1 GND_layer signal)"): there the number decides
  const alias = new Map<string, string>();
  for (const l of layerList?.slice(1) ?? []) {
    if (!isList(l)) continue;
    const raw = atom(l);
    const number = num(l, 0) ?? -1;
    if (!raw) continue;
    let name = raw;
    let userName = atom(l, 3);
    if (!isCopperName(raw)) {
      if (!(version < 20200000 && Number.isInteger(number) && number >= 0 && number <= 31 && (atom(l, 2) ?? '') !== 'user')) continue;
      name = number === 0 ? 'F.Cu' : number === 31 ? 'B.Cu' : `In${number}.Cu`;
      userName = raw;
    }
    alias.set(raw, name);
    copper.push({ name, number, type: atom(l, 2) ?? 'signal', userName, zoneArea: 0, nets: [], zones: 0, routedMm: routed.get(raw) ?? 0 });
  }
  copper.sort((a, b) => copperOrder(a.name) - copperOrder(b.name));

  let board = outlineFrom(edgeItems);
  if (board.source === 'none' && zones.length) {
    // no outline: measure against the extent of all zones (reported as a note)
    const all = zones.flatMap((z) => z.polys.flat());
    const xs = all.map((p) => p[0]);
    const ys = all.map((p) => p[1]);
    const bb: [number, number, number, number] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    board = { area: (bb[2] - bb[0]) * (bb[3] - bb[1]), bbox: bb, source: 'zones' };
  }

  // zone area per layer and net, clipped to the board's bounding box and capped at the board area
  const perLayer = new Map<string, Map<string, number>>();
  for (const z of zones) {
    const area = z.polys.reduce((a, p) => a + shoelace(board.bbox ? clipToBox(p, board.bbox) : p), 0);
    const targets = z.layers.includes('*.Cu') ? copper.map((c) => c.name) : z.layers.map((l) => alias.get(l) ?? l).filter(isCopperName);
    for (const layer of targets) {
      const m = perLayer.get(layer) ?? new Map<string, number>();
      m.set(z.net, (m.get(z.net) ?? 0) + area);
      perLayer.set(layer, m);
      const c = copper.find((x) => x.name === layer);
      if (c) c.zones++;
    }
  }
  for (const c of copper) {
    const nets = [...(perLayer.get(c.name) ?? new Map<string, number>()).entries()]
      .map(([net, area]) => ({ net, area: board.area > 0 ? Math.min(area, board.area) : area }))
      .sort((a, b) => b.area - a.area);
    c.nets = nets.slice(0, 6);
    const top = nets.slice(0, PLANE_RULE.nets).reduce((a, n) => a + n.area, 0);
    c.zoneArea = board.area > 0 ? Math.min(top, board.area) : top;
  }

  const st = stackupNode ? readStackup(stackupNode) : null;
  const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  return {
    version,
    generator,
    generatorVersion,
    kicad: kicadRelease(version, generatorVersion),
    thickness,
    copperFinish: st?.copperFinish,
    copper,
    stackup: st && st.items.length ? st.items : null,
    board,
    stats: { bytes: text.length, zones: zones.length, tracks, ms },
  };
}

/* ------------------------------------------------------------------ plane detection */

export interface RoleGuess {
  role: CopperRole;
  coverage: number; // 0…1, zone area of the three largest nets against the board area
  reason: string;
}

/**
 * KiCad does not mark plane layers. A copper layer is taken as a plane when it is declared a
 * "power" layer in the layer setup, or when zones of at most three nets cover at least half of the
 * board and the layer carries less than a fifth of the routing of the most-routed layer. On a two-layer
 * board, the side poured over at least half of the board is the plane when the other side is not.
 */
export function guessRoles(b: KicadBoard): Record<string, RoleGuess> {
  const maxRouted = Math.max(0, ...b.copper.map((c) => c.routedMm));
  const out: Record<string, RoleGuess> = {};
  for (const c of b.copper) {
    const coverage = b.board.area > 0 ? Math.min(1, c.zoneArea / b.board.area) : 0;
    const nets = c.nets.slice(0, PLANE_RULE.nets).filter((n) => n.area > 0);
    const netText = nets.map((n) => `${n.net} ${Math.round((100 * n.area) / Math.max(b.board.area, 1e-9))} %`).join(', ');
    const lightlyRouted = maxRouted === 0 || c.routedMm <= PLANE_RULE.trackShare * maxRouted;
    // on a two-layer board a poured side is the reference for the other side even when it carries tracks
    const twoLayerPour = b.copper.length === 2 && coverage >= PLANE_RULE.coverage && b.copper.every((o) => o === c || o.zoneArea < PLANE_RULE.coverage * b.board.area);
    if (c.type === 'power') out[c.name] = { role: 'plane', coverage, reason: `declared a power (plane) layer in KiCad${netText ? `; zones ${netText}` : ''}` };
    else if (coverage >= PLANE_RULE.coverage && lightlyRouted) out[c.name] = { role: 'plane', coverage, reason: `zones cover ${Math.round(coverage * 100)} % of the board (${netText})` };
    else if (twoLayerPour) out[c.name] = { role: 'plane', coverage, reason: `two-layer board: zones cover ${Math.round(coverage * 100)} % of this side (${netText}) and less than half of the other` };
    else if (coverage >= PLANE_RULE.coverage) out[c.name] = { role: 'signal', coverage, reason: `zones cover ${Math.round(coverage * 100)} % (${netText}), but the layer carries ${Math.round((100 * c.routedMm) / maxRouted)} % of the routing of the busiest layer` };
    else out[c.name] = { role: 'signal', coverage, reason: coverage > 0 ? `zones cover ${Math.round(coverage * 100)} % of the board` : 'no zones on this layer' };
  }
  return out;
}

/* ------------------------------------------------------------------ conversion */

export interface ConvertNote {
  kind: 'default' | 'missing' | 'info';
  text: string;
}

const dielectricName = (material: string | undefined, type: string) => {
  const m = material?.trim() || KICAD_DEFAULTS.dielectricMaterial;
  return /core|prepreg/i.test(m) ? m : `${m} ${type || 'dielectric'}`;
};

/** Short stable hash (FNV-1a, base 36) for stackup ids. */
export function hashText(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Turn the KiCad stackup into a PCBPlanner stackup: solder masks, copper and one dielectric layer per
 * (sub)layer, top to bottom. Silkscreen and paste are left out. Missing values take KiCad's defaults
 * and are listed in the notes. Returns null when the file has no stackup section.
 */
export function kicadStackup(b: KicadBoard, opts: { name: string; roles?: Record<string, CopperRole> }): { stackup: Stackup; notes: ConvertNote[] } | null {
  if (!b.stackup) return null;
  const groups = new Map<string, { kind: ConvertNote['kind']; names: string[]; text: (who: string) => string }>();
  const note = (key: string, kind: ConvertNote['kind'], name: string, text: (who: string) => string) => {
    const g = groups.get(key);
    if (g) g.names.push(name);
    else groups.set(key, { kind, names: [name], text });
  };
  const roles = opts.roles ?? Object.fromEntries(Object.entries(guessRoles(b)).map(([k, v]) => [k, v.role]));
  const layers: Layer[] = [];
  let n = 0;
  const id = () => `kc${n++}`;
  for (const item of b.stackup) {
    const type = item.type.toLowerCase();
    if (item.name === 'F.Mask' || item.name === 'B.Mask' || type.includes('solder mask')) {
      const s = item.subs[0];
      if (s.er === undefined) note('mask-er', 'missing', item.name, (who) => `${who}: no Dk in the file (no mask material is set), so KiCad's default ${KICAD_DEFAULTS.maskEr} is used.`);
      if (s.df === undefined) note('mask-df', 'missing', item.name, (who) => `${who}: no loss tangent in the file; ${MASK_DF} (a typical LPI solder mask) is used for the loss.`);
      layers.push({ id: id(), kind: 'mask', name: item.name, t: s.t ?? KICAD_DEFAULTS.maskT, er: s.er ?? KICAD_DEFAULTS.maskEr, df: s.df ?? MASK_DF, material: s.material ?? 'Solder mask' });
    } else if (type === 'copper' || isCopperName(item.name)) {
      const s = item.subs[0];
      if (s.t === undefined) note('cu-t', 'missing', item.name, (who) => `${who}: no copper thickness in the file; KiCad's default ${KICAD_DEFAULTS.copperT} mm is used.`);
      layers.push({ id: id(), kind: 'copper', name: item.name, t: s.t ?? KICAD_DEFAULTS.copperT, role: roles[item.name] ?? 'signal' });
    } else if (type === 'core' || type === 'prepreg' || item.name.startsWith('dielectric')) {
      item.subs.forEach((s, i) => {
        const label = item.subs.length > 1 ? `${item.name} (sublayer ${i + 1})` : item.name;
        if (!(s.t !== undefined && s.t > 0)) throw new Error(`${label} has no thickness in the file. Set it in KiCad's Board Setup → Physical Stackup and save the board again.`);
        if (s.er === undefined) note('d-er', 'missing', label, (who) => `${who}: no Dk in the file; KiCad's default ${KICAD_DEFAULTS.dielectricEr} is used.`);
        if (s.df === undefined) note('d-df', 'missing', label, (who) => `${who}: no loss tangent in the file; KiCad's default ${KICAD_DEFAULTS.dielectricDf} is used.`);
        else if (s.df === 0) note('d-df0', 'missing', label, (who) => `${who}: loss tangent 0 in the file, so no dielectric loss is counted there. Enter the laminate's Df if it was left blank.`);
        const er = s.er ?? KICAD_DEFAULTS.dielectricEr;
        const df = s.df ?? KICAD_DEFAULTS.dielectricDf;
        if (er === KICAD_DEFAULTS.dielectricEr && df === KICAD_DEFAULTS.dielectricDf)
          note('default', 'default', label, (who) => `${who}: Dk 4.5 and loss tangent 0.02 are KiCad's defaults for a new dielectric, probably not your laminate. Confirm the values with your fabricator and enter them in KiCad's Physical Stackup.`);
        layers.push({
          id: id(),
          kind: 'dielectric',
          name: dielectricName(s.material, type),
          t: s.t,
          er,
          df,
          material: s.material ?? KICAD_DEFAULTS.dielectricMaterial,
          ...(s.fHz !== undefined && s.fHz > 0 ? { fGHz: s.fHz / 1e9 } : {}),
        });
      });
    }
  }
  const list = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]);
  const notes: ConvertNote[] = [...groups.values()].map((g) => ({ kind: g.kind, text: g.text(list(g.names)) })).sort((a, b) => Number(b.kind === 'default') - Number(a.kind === 'default'));
  if (!layers.some((l) => l.kind === 'copper')) throw new Error('The stackup in this file has no copper layers.');
  const stackup: Stackup = {
    id: `custom-kicad-${hashText(JSON.stringify([opts.name, layers]))}`,
    name: opts.name,
    layers,
    builtin: false,
    construction: 'rigid',
    note: 'Imported from a KiCad board file.',
  };
  return { stackup, notes };
}

/** Sum of every stackup item with a thickness (what KiCad reports as the stackup thickness). */
export const stackupItemThickness = (b: KicadBoard) => (b.stackup ?? []).reduce((a, it) => a + it.subs.reduce((x, s) => x + (s.t ?? 0), 0), 0);

/** Board-level notes: missing stackup, layer list and stackup out of step, no outline. */
export function boardNotes(b: KicadBoard): string[] {
  const notes: string[] = [];
  const stackCopper = (b.stackup ?? []).filter((i) => i.type.toLowerCase() === 'copper').map((i) => i.name);
  if (b.stackup && stackCopper.join() !== b.copper.map((c) => c.name).join())
    notes.push(`The stackup lists ${stackCopper.length} copper layers but the layer setup has ${b.copper.length}. The stackup section is used; open Board Setup in KiCad and save to bring them in step.`);
  const sum = stackupItemThickness(b);
  if (b.stackup && b.thickness !== undefined && Math.abs(sum - b.thickness) > 0.005)
    notes.push(`The board thickness in the file (${b.thickness} mm) differs from the sum of the stackup layers (${Number(sum.toFixed(4))} mm). Impedance uses the stackup layers.`);
  if (b.board.source === 'none') notes.push('No board outline (Edge.Cuts) and no zones were found, so plane layers could not be detected from zones. Set the layer roles by hand.');
  else if (b.board.source === 'zones') notes.push('No board outline (Edge.Cuts) was found; zone coverage is measured against the extent of all zones.');
  return notes;
}
