// Track geometry of a KiCad board: every (segment …) and (arc …) on a copper layer, with its net name,
// for measurements that need the routed copper itself rather than the routing summary the import
// worker keeps (kicadRouting.ts RoutingSummary has lengths, widths and pair gaps, but no coordinates).
//
// The reading follows parseKicadBoard (kicadImport.ts) item for item: the same top-level scan, the
// same (start)/(mid)/(end)/(width)/(layer)/(net) fields, net codes resolved through the (net N "name")
// declarations (KiCad 6 to 9) or names written on the item (KiCad 10), and KiCad 5 user layer names
// mapped to F.Cu / InN.Cu / B.Cu by their number. `read` counts the items exactly as KicadBoard.stats.tracks
// does, so a caller can tell that the text is the board that was loaded.
import { isCopperName, parseSexpr, scanTopLevel, type SNode } from './kicadImport';
import type { RawTrack } from './kicadRouting';

const RE_START = /\(start\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s*\)/;
const RE_MID = /\(mid\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s*\)/;
const RE_END = /\(end\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s*\)/;
const RE_LAYER = /\(layer\s+"?([^"\s)]+)"?/;
const RE_LAYERS = /\(layers\s+([^)]*)\)/;
const RE_WIDTH = /\(width\s+([\d.eE+-]+)\s*\)/;
const RE_NET = /\(net\s+(?:(\d+)|"((?:[^"\\]|\\.)*)"|([^\s()"]+))\s*\)/;
const RE_NETDECL = /^\(net\s+(\d+)\s+(?:"((?:[^"\\]|\\.)*)"|([^\s()"]+))/;

const unescape = (s: string) => s.replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c === 'r' ? '\r' : c === 't' ? '\t' : c));
const netKey = (m: RegExpExecArray | null) => (!m ? '' : m[1] !== undefined ? `#${m[1]}` : m[2] !== undefined ? unescape(m[2]) : (m[3] ?? ''));
const layerList = (s: string | undefined) => (s ? [...s.matchAll(/"((?:[^"\\]|\\.)*)"|([^\s"]+)/g)].map((m) => (m[1] !== undefined ? unescape(m[1]) : m[2])) : []);

function readTrack(s: string, arc: boolean): RawTrack | null {
  const a = RE_START.exec(s);
  const b = RE_END.exec(s);
  const l = RE_LAYER.exec(s);
  const layer = l ? l[1] : layerList(RE_LAYERS.exec(s)?.[1]).find(isCopperName);
  if (!a || !b || !layer) return null;
  const t: RawTrack = { net: netKey(RE_NET.exec(s)), layer, w: Number(RE_WIDTH.exec(s)?.[1] ?? 0), x1: Number(a[1]), y1: Number(a[2]), x2: Number(b[1]), y2: Number(b[2]) };
  const m = arc ? RE_MID.exec(s) : null;
  if (m) {
    t.mx = Number(m[1]);
    t.my = Number(m[2]);
  }
  return Number.isFinite(t.x1 + t.y1 + t.x2 + t.y2 + (t.mx ?? 0) + (t.my ?? 0)) && Number.isFinite(t.w) ? t : null;
}

/** Copper tracks of a .kicad_pcb text (`tracks`) and the number of segments and arcs read (`read`, as KicadBoard.stats.tracks). */
export function extractTracks(text: string): { tracks: RawTrack[]; read: number } {
  let rootStart = 0;
  while (rootStart < text.length && (text.charCodeAt(rootStart) <= 32 || text.charCodeAt(rootStart) === 0xfeff)) rootStart++;
  if (!/^\(kicad_pcb[\s)]/.test(text.slice(rootStart, rootStart + 12))) throw new Error('This is not a KiCad board file.');
  let version = 0;
  let layersNode: SNode[] | undefined;
  const raw: RawTrack[] = [];
  const netNames = new Map<string, string>();
  scanTopLevel(text, rootStart, (name, start, end) => {
    if (name === 'segment' || name === 'arc') {
      const t = readTrack(text.slice(start, end), name === 'arc');
      if (t) raw.push(t);
    } else if (name === 'net') {
      const m = RE_NETDECL.exec(text.slice(start, Math.min(end, start + 2000)));
      if (m) netNames.set(`#${m[1]}`, m[2] !== undefined ? unescape(m[2]) : (m[3] ?? ''));
    } else if (name === 'version') {
      const v = Number(/\(version\s+(\d+)/.exec(text.slice(start, end))?.[1]);
      if (Number.isFinite(v)) version = v;
    } else if (name === 'layers') layersNode = parseSexpr(text, start, end)[0] as SNode[];
  });
  // KiCad 5 may name a copper layer by its user name ("(1 GND_layer signal)"): the number decides, as in parseKicadBoard
  const alias = new Map<string, string>();
  for (const l of layersNode?.slice(1) ?? []) {
    if (!Array.isArray(l) || typeof l[1] !== 'string') continue;
    const rawName = l[1];
    const number = Number.parseFloat(typeof l[0] === 'string' ? l[0] : '');
    if (isCopperName(rawName)) alias.set(rawName, rawName);
    else if (version < 20200000 && Number.isInteger(number) && number >= 0 && number <= 31 && l[2] !== 'user') alias.set(rawName, number === 0 ? 'F.Cu' : number === 31 ? 'B.Cu' : `In${number}.Cu`);
  }
  const tracks: RawTrack[] = [];
  for (const t of raw) {
    const layer = alias.get(t.layer) ?? t.layer;
    if (!isCopperName(layer)) continue;
    t.layer = layer;
    t.net = t.net.startsWith('#') ? (netNames.get(t.net) ?? '') : t.net;
    tracks.push(t);
  }
  return { tracks, read: raw.length };
}

/* ------------------------------------------------------------------ compact form for the worker */

/** Tracks as one Float64Array (net index, layer index, w, x1, y1, x2, y2, mx, my; NaN mid for a segment) and the two name tables. */
export interface PackedTracks {
  nets: string[];
  layers: string[];
  data: Float64Array;
  read: number;
}

const STRIDE = 9;

export function packTracks(tracks: RawTrack[], read: number): PackedTracks {
  const nets: string[] = [];
  const layers: string[] = [];
  const ni = new Map<string, number>();
  const li = new Map<string, number>();
  const idx = (m: Map<string, number>, list: string[], k: string) => {
    let i = m.get(k);
    if (i === undefined) {
      i = list.length;
      list.push(k);
      m.set(k, i);
    }
    return i;
  };
  const data = new Float64Array(tracks.length * STRIDE);
  tracks.forEach((t, i) => {
    data.set([idx(ni, nets, t.net), idx(li, layers, t.layer), t.w, t.x1, t.y1, t.x2, t.y2, t.mx ?? NaN, t.my ?? NaN], i * STRIDE);
  });
  return { nets, layers, data, read };
}

export function unpackTracks(p: PackedTracks): RawTrack[] {
  const out: RawTrack[] = [];
  const d = p.data;
  for (let o = 0; o + STRIDE <= d.length; o += STRIDE) {
    const t: RawTrack = { net: p.nets[d[o]], layer: p.layers[d[o + 1]], w: d[o + 2], x1: d[o + 3], y1: d[o + 4], x2: d[o + 5], y2: d[o + 6] };
    if (!Number.isNaN(d[o + 7])) {
      t.mx = d[o + 7];
      t.my = d[o + 8];
    }
    out.push(t);
  }
  return out;
}
