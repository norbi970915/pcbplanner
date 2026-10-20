// What the board view of the KiCad project page draws: the board outline, the tracks, vias and zone fills of
// every copper layer, and the pads of every footprint, read from the .kicad_pcb text in one pass.
//
// Tracks, vias and fills come from the same readers as the import (kicadImport.ts), the outline from the
// plane reader (kicadPlanes.ts). Pads are read from each (footprint …): a pad's (at x y) is in the
// footprint's frame and is turned by the footprint's angle; the pad's own angle in the file is already
// absolute (KiCad 6 and later write the footprint angle into it). Angles are KiCad's: degrees,
// counter-clockwise as seen on screen, with y pointing down.
import { isCopperName, listEnd, parseSexpr, readFills, readTrack, readVia, scanTopLevel, type SNode } from './kicadImport';
import { outlineLoops, type Pt } from './kicadPlanes';
import type { RawTrack, RawVia } from './kicadRouting';
import type { FillPoly } from './kicadVoids';

export type PadShape = 'circle' | 'rect' | 'oval' | 'roundrect' | 'trapezoid' | 'custom';

export interface DrawPad {
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number; // absolute, degrees
  shape: PadShape;
  rr?: number; // roundrect corner radius as a fraction of the smaller side
  layers: string[]; // copper layers ('*.Cu' expanded)
  net: string;
  drill?: number;
  ref: string; // footprint reference
  num: string; // pad number
}

export interface DrawFill extends FillPoly {
  net: string;
}

export interface BoardDrawing {
  copper: string[]; // copper layers top to bottom
  outline: Pt[][];
  tracks: RawTrack[];
  vias: RawVia[];
  fills: DrawFill[];
  pads: DrawPad[];
  /** Footprint references and positions, for labels. */
  parts: { ref: string; x: number; y: number; back: boolean }[];
  /** Items read, so a caller can tell the text is the board that is loaded (as KicadBoard.stats.tracks). */
  read: number;
}

const isList = (n: SNode | undefined): n is SNode[] => Array.isArray(n);
const head = (n: SNode | undefined) => (isList(n) && typeof n[0] === 'string' ? n[0] : undefined);
const child = (n: SNode[], name: string) => n.find((c): c is SNode[] => head(c) === name);
const atom = (n: SNode[] | undefined, i = 1) => (n && typeof n[i] === 'string' ? (n[i] as string) : undefined);
const num = (n: SNode[] | undefined, i = 1) => {
  const v = Number.parseFloat(atom(n, i) ?? '');
  return Number.isFinite(v) ? v : undefined;
};

const RE_NETDECL = /^\(net\s+(\d+)\s+(?:"((?:[^"\\]|\\.)*)"|([^\s()"]+))/;
const RE_LAYER = /\(layer\s+"?([^"\s)]+)"?/;
const unescape = (s: string) => s.replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c === 'r' ? '\r' : c === 't' ? '\t' : c));

/** A pad's position on the board from its position in the footprint, the footprint's position and angle. */
export function padToBoard(fx: number, fy: number, fa: number, x: number, y: number): Pt {
  const a = (fa * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [fx + x * c + y * s, fy - x * s + y * c];
}

const SHAPES: PadShape[] = ['circle', 'rect', 'oval', 'roundrect', 'trapezoid', 'custom'];

/** The pads and reference of one (footprint …) list; net codes are left as '#code' for the caller. */
function readFootprint(node: SNode[], copper: string[]): { pads: DrawPad[]; part?: BoardDrawing['parts'][number] } {
  const at = child(node, 'at');
  const fx = num(at, 1) ?? 0;
  const fy = num(at, 2) ?? 0;
  const fa = num(at, 3) ?? 0;
  const back = atom(child(node, 'layer')) === 'B.Cu';
  let ref = '';
  for (const c of node) {
    if (head(c) === 'property' && atom(c as SNode[]) === 'Reference') ref = atom(c as SNode[], 2) ?? '';
    else if (head(c) === 'fp_text' && atom(c as SNode[]) === 'reference') ref = atom(c as SNode[], 2) ?? ''; // KiCad 6 and older
  }
  const pads: DrawPad[] = [];
  for (const c of node) {
    if (head(c) !== 'pad') continue;
    const p = c as SNode[];
    const type = atom(p, 2) ?? '';
    const shape = atom(p, 3) as PadShape;
    const pat = child(p, 'at');
    const size = child(p, 'size');
    const w = num(size, 1);
    const h = num(size, 2);
    if (w === undefined || h === undefined || !SHAPES.includes(shape)) continue;
    const lay = (child(p, 'layers')?.slice(1).filter((a): a is string => typeof a === 'string') ?? []).flatMap((l) =>
      l === '*.Cu' ? copper : l === 'F&B.Cu' ? ['F.Cu', 'B.Cu'] : isCopperName(l) ? [l] : [],
    );
    if (!lay.length) continue; // paste or mask only
    const [x, y] = padToBoard(fx, fy, fa, num(pat, 1) ?? 0, num(pat, 2) ?? 0);
    const netNode = child(p, 'net');
    const netCode = atom(netNode, 1);
    const netName = atom(netNode, 2);
    // (net 5 "name") in KiCad 6 to 9, (net "name") from KiCad 10
    const net = netName !== undefined ? netName : netCode !== undefined && !/^\d+$/.test(netCode) ? netCode : netCode !== undefined ? `#${netCode}` : '';
    const drill = num(child(p, 'drill'), 1) ?? (atom(child(p, 'drill'), 1) === 'oval' ? num(child(p, 'drill'), 2) : undefined);
    const pad: DrawPad = { x, y, w, h, angle: num(pat, 3) ?? fa, shape, layers: lay, net, ref, num: atom(p, 1) ?? '' };
    if (shape === 'roundrect') pad.rr = num(child(p, 'roundrect_rratio')) ?? 0.25;
    if (drill !== undefined && type !== 'smd' && type !== 'connect') pad.drill = drill;
    pads.push(pad);
  }
  return { pads, part: ref ? { ref, x: fx, y: fy, back } : undefined };
}

/** Everything the board view draws, from the text of a .kicad_pcb. */
export function readBoardDrawing(text: string): BoardDrawing {
  let rootStart = 0;
  while (rootStart < text.length && (text.charCodeAt(rootStart) <= 32 || text.charCodeAt(rootStart) === 0xfeff)) rootStart++;
  if (!text.startsWith('(kicad_pcb', rootStart)) throw new Error('This is not a KiCad board file.');
  const netNames = new Map<string, string>();
  const tracks: RawTrack[] = [];
  const vias: RawVia[] = [];
  const fills: DrawFill[] = [];
  const footprints: [number, number][] = [];
  const edgeItems: SNode[][] = [];
  let copper: string[] = [];
  let read = 0;
  scanTopLevel(text, rootStart, (name, start, end) => {
    switch (name) {
      case 'layers': {
        const node = parseSexpr(text, start, end)[0] as SNode[];
        copper = node
          .slice(1)
          .filter(isList)
          .map((l) => atom(l))
          .filter((l): l is string => !!l && isCopperName(l));
        break;
      }
      case 'net': {
        const m = RE_NETDECL.exec(text.slice(start, Math.min(end, start + 2000)));
        if (m) netNames.set(`#${m[1]}`, m[2] !== undefined ? unescape(m[2]) : (m[3] ?? ''));
        break;
      }
      case 'segment':
      case 'arc': {
        const t = readTrack(text, start, end, name === 'arc');
        if (t) {
          read++;
          if (isCopperName(t.layer)) tracks.push(t);
        }
        break;
      }
      case 'via': {
        const v = readVia(text, start, end);
        if (v) vias.push(v);
        break;
      }
      case 'zone': {
        const filled = text.indexOf('(filled_polygon', start);
        if (filled < 0 || filled >= end) break;
        const hdr = text.slice(start, filled);
        if (/\(keepout/.test(hdr)) break;
        const netName = /\(net_name\s+"((?:[^"\\]|\\.)*)"/.exec(hdr)?.[1];
        const netAtom = /\(net\s+(?:(\d+)|"((?:[^"\\]|\\.)*)")\s*\)/.exec(hdr);
        const net = netName !== undefined ? unescape(netName) : netAtom?.[2] !== undefined ? unescape(netAtom[2]) : netAtom?.[1] !== undefined ? `#${netAtom[1]}` : '';
        const layer0 = RE_LAYER.exec(hdr)?.[1];
        for (const f of readFills(text, filled, end, layer0)) if (isCopperName(f.layer)) fills.push({ ...f, net });
        break;
      }
      case 'footprint':
      case 'module': // KiCad 5
        footprints.push([start, end]);
        break;
      default:
        if (/^gr_(line|arc|rect|circle|poly|curve)$/.test(name)) {
          const s = text.slice(start, Math.min(end, start + 4000));
          if (/\(layer\s+"?Edge\.Cuts"?\s*\)/.test(s) || (end - start > 4000 && text.slice(start, end).includes('Edge.Cuts'))) edgeItems.push(parseSexpr(text, start, end)[0] as SNode[]);
        }
    }
  });
  if (!copper.length) copper = ['F.Cu', 'B.Cu'];
  const pads: DrawPad[] = [];
  const parts: BoardDrawing['parts'] = [];
  for (const [start, end] of footprints) {
    const node = parseSexpr(text, start, listEnd(text, start, end))[0];
    if (!isList(node)) continue;
    const r = readFootprint(node, copper);
    pads.push(...r.pads);
    if (r.part) parts.push(r.part);
  }
  const netOf = (k: string) => (k.startsWith('#') ? (netNames.get(k) ?? '') : k);
  for (const t of tracks) t.net = netOf(t.net);
  for (const v of vias) v.net = netOf(v.net);
  for (const f of fills) f.net = netOf(f.net);
  for (const p of pads) p.net = netOf(p.net);
  return { copper, outline: outlineLoops(edgeItems), tracks, vias, fills, pads, parts, read };
}

/** Outline of a pad in board coordinates. */
export function padPolygon(p: DrawPad): [number, number][] {
  const pts: [number, number][] = [];
  const hw = p.w / 2;
  const hh = p.h / 2;
  const push = (u: number, v: number) => {
    // pad frame to board: the inverse of the rotation by the pad angle (KiCad: CCW on screen, y down)
    const a = (p.angle * Math.PI) / 180;
    pts.push([p.x + u * Math.cos(a) + v * Math.sin(a), p.y - u * Math.sin(a) + v * Math.cos(a)]);
  };
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number) => {
    const n = 8;
    for (let i = 0; i <= n; i++) {
      const t = a0 + ((a1 - a0) * i) / n;
      push(cx + r * Math.cos(t), cy + r * Math.sin(t));
    }
  };
  if (p.shape === 'circle') {
    arc(0, 0, hw, 0, 2 * Math.PI);
    return pts;
  }
  const r = p.shape === 'oval' ? Math.min(hw, hh) : p.shape === 'roundrect' ? Math.min(hw, hh) * 2 * (p.rr ?? 0.25) : 0;
  if (r <= 0) {
    push(-hw, -hh);
    push(hw, -hh);
    push(hw, hh);
    push(-hw, hh);
    return pts;
  }
  arc(hw - r, hh - r, r, 0, Math.PI / 2);
  arc(-hw + r, hh - r, r, Math.PI / 2, Math.PI);
  arc(-hw + r, -hh + r, r, Math.PI, 1.5 * Math.PI);
  arc(hw - r, -hh + r, r, 1.5 * Math.PI, 2 * Math.PI);
  return pts;
}
