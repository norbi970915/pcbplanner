// The vias of every signal net: which copper layers the net's tracks use at each via, the unused part of
// the barrel (the stub) from the stackup, and the distance to the nearest via of a plane net (the return
// via a pair needs where it changes reference plane). Plain data in, plain data out (import worker, tests).
//
// A via spans the copper layers in its (layers …) list (F.Cu to B.Cu for a through via). The signal uses
// the layers where one of its tracks ends on the via. The barrel beyond the outermost used layers is the
// stub: from the far face of that copper to the outer face of the via's last copper layer, through the
// dielectrics and copper between, with the thicknesses of the board's stackup. "Remove unused layers"
// takes away the copper rings, not the plated barrel, so it does not shorten the stub. A back-drilled via
// is reported as such and its stub is not measured; neither is that of a via the net reaches from only
// one layer of tracks (it continues through a pad or a zone, which are not read).
import type { KicadStackupItem } from './kicadImport';
import type { RawTrack, RawVia, RoutingSummary, ViaUse } from './kicadRouting';

/** Copper layers and their top and bottom faces (mm from the top of the stackup), in stackup order. */
export function copperFaces(items: KicadStackupItem[] | null): Map<string, { top: number; bottom: number }> | null {
  if (!items?.length) return null;
  const out = new Map<string, { top: number; bottom: number }>();
  let z = 0;
  for (const it of items) {
    const isCopper = it.type === 'copper';
    const isDielectric = /core|prepreg|dielectric/i.test(it.type) || /^dielectric/i.test(it.name);
    if (!isCopper && !isDielectric) continue; // mask, paste and silkscreen sit outside the barrel
    const t = it.subs.reduce((a, s) => a + (s.t ?? 0), 0) || (isCopper ? 0.035 : 0);
    if (isCopper) out.set(it.name, { top: z, bottom: z + t });
    z += t;
  }
  return out.size >= 2 ? out : null;
}

/** Longest unused barrel of a via, mm, or undefined when the stackup does not give it. */
export function stubLength(span: [string, string], used: string[], faces: Map<string, { top: number; bottom: number }>): number | undefined {
  const a = faces.get(span[0]);
  const b = faces.get(span[1]);
  const u = used.map((l) => faces.get(l)).filter((f): f is { top: number; bottom: number } => !!f);
  if (!a || !b || u.length !== used.length || !u.length) return undefined;
  const [vt, vb] = a.top <= b.top ? [a, b] : [b, a];
  const usedTop = Math.min(...u.map((f) => f.top));
  const usedBottom = Math.max(...u.map((f) => f.bottom));
  return Math.max(0, usedTop - vt.top, vb.bottom - usedBottom);
}

const cell = 2; // mm, grid of track ends and plane vias

/**
 * Add the vias of every net that is not a plane net to the routing summary (NetStat.viaUse). `planeNets`
 * are the nets a return via may belong to (the large zone nets and ground-named nets).
 */
export function addVias(routing: RoutingSummary, tracks: RawTrack[], vias: RawVia[], copper: string[], stackup: KicadStackupItem[] | null, planeNets: Set<string>) {
  const faces = copperFaces(stackup);
  const order = new Map(copper.map((c, i) => [c, i]));
  // track ends by net, in a grid
  const ends = new Map<string, Map<string, { x: number; y: number; layer: string }[]>>();
  const gkey = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  for (const t of tracks) {
    if (!t.net) continue;
    let g = ends.get(t.net);
    if (!g) ends.set(t.net, (g = new Map()));
    for (const [x, y] of [
      [t.x1, t.y1],
      [t.x2, t.y2],
    ]) {
      const k = gkey(x, y);
      const l = g.get(k);
      if (l) l.push({ x, y, layer: t.layer });
      else g.set(k, [{ x, y, layer: t.layer }]);
    }
  }
  // vias of plane nets, in a grid, for the nearest return via
  const ret = new Map<string, RawVia[]>();
  for (const v of vias)
    if (v.net && planeNets.has(v.net)) {
      const k = gkey(v.x, v.y);
      const l = ret.get(k);
      if (l) l.push(v);
      else ret.set(k, [v]);
    }
  const nearestReturn = (x: number, y: number): { d: number; net: string; x: number; y: number } | undefined => {
    let best: { d: number; net: string; x: number; y: number } | undefined;
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    for (let r = 0; r <= 8; r++) {
      for (let i = cx - r; i <= cx + r; i++)
        for (let j = cy - r; j <= cy + r; j++) {
          if (Math.max(Math.abs(i - cx), Math.abs(j - cy)) !== r) continue;
          for (const v of ret.get(`${i},${j}`) ?? []) {
            const d = Math.hypot(v.x - x, v.y - y);
            if (!best || d < best.d) best = { d, net: v.net, x: v.x, y: v.y };
          }
        }
      if (best && best.d <= r * cell) break; // nothing in a farther ring can be nearer
    }
    return best;
  };

  const byNet = new Map(routing.nets.map((n) => [n.name, n]));
  for (const v of vias) {
    if (!v.net || planeNets.has(v.net)) continue;
    const n = byNet.get(v.net);
    if (!n) continue;
    const span = v.layers.filter((l) => order.has(l)).sort((p, q) => order.get(p)! - order.get(q)!);
    const spanPair: [string, string] | undefined = v.layers.includes('*.Cu') || span.length < 2 ? (copper.length >= 2 ? [copper[0], copper[copper.length - 1]] : undefined) : [span[0], span[span.length - 1]];
    if (!spanPair) continue;
    const tol = Math.max((v.size ?? 0) / 2, 0.01);
    const used = new Set<string>();
    const g = ends.get(v.net);
    const cx = Math.floor(v.x / cell);
    const cy = Math.floor(v.y / cell);
    for (let i = cx - 1; i <= cx + 1; i++) for (let j = cy - 1; j <= cy + 1; j++) for (const e of g?.get(`${i},${j}`) ?? []) if (Math.hypot(e.x - v.x, e.y - v.y) <= tol) used.add(e.layer);
    const usedList = [...used].sort((p, q) => (order.get(p) ?? 0) - (order.get(q) ?? 0));
    const use: ViaUse = { x: v.x, y: v.y, span: spanPair, used: usedList };
    if (v.kind && v.kind !== 'through') use.kind = v.kind;
    if (v.backdrill) use.backdrill = true;
    else if (faces && usedList.length >= 2) {
      const s = stubLength(spanPair, usedList, faces);
      if (s !== undefined) use.stub = Math.round(s * 1e4) / 1e4;
    }
    const r = nearestReturn(v.x, v.y);
    if (r) {
      use.ret = Math.round(r.d * 1e4) / 1e4;
      use.retNet = r.net;
      use.rx = r.x;
      use.ry = r.y;
    }
    n.viaUse = [...(n.viaUse ?? []), use];
  }
}
