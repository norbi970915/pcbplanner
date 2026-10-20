// How close other signals run to the traces of every differential pair, on the same layer: the spacing
// part of the routing check. Plain data in, plain data out (import worker, tests).
//
// Each trace of a pair is sampled along its length. At each sample the nearest track of another net on
// the same layer is found, edge to edge (centre-line distance less half of each width). The pair's own
// partner and the plane nets (ground and the large zone nets, as guard traces or pours) do not count.
// Samples near a pad or a via (within SPACING.breakout of a free end of the net's routing on that layer)
// are left out: breakout routing between pins is always tight. The result is a histogram of the sampled
// length by spacing, separately for neighbours that belong to another pair and for other signals, so the
// page can apply each interface's own limits.
import { arcOf, SPACING, type NetLayerStat, type RawTrack, type RoutingSummary } from './kicadRouting';

interface Piece {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  w: number;
  net: string;
}

/** Straight pieces of a track: a segment as it is, an arc as chords of at most 5°. */
function pieces(t: RawTrack, out: Piece[]) {
  const a = t.mx !== undefined && t.my !== undefined ? arcOf(t.x1, t.y1, t.mx, t.my, t.x2, t.y2) : null;
  if (!a) {
    out.push({ x1: t.x1, y1: t.y1, x2: t.x2, y2: t.y2, w: t.w, net: t.net });
    return;
  }
  const n = Math.max(1, Math.ceil(Math.abs(a.da) / ((5 * Math.PI) / 180)));
  let px = t.x1;
  let py = t.y1;
  for (let i = 1; i <= n; i++) {
    const ang = a.a0 + (a.da * i) / n;
    const x = i === n ? t.x2 : a.cx + a.r * Math.cos(ang);
    const y = i === n ? t.y2 : a.cy + a.r * Math.sin(ang);
    out.push({ x1: px, y1: py, x2: x, y2: y, w: t.w, net: t.net });
    px = x;
    py = y;
  }
}

function distToPiece(x: number, y: number, p: Piece): number {
  const dx = p.x2 - p.x1;
  const dy = p.y2 - p.y1;
  const l2 = dx * dx + dy * dy;
  const u = l2 > 0 ? Math.max(0, Math.min(1, ((x - p.x1) * dx + (y - p.y1) * dy) / l2)) : 0;
  return Math.hypot(p.x1 + u * dx - x, p.y1 + u * dy - y);
}

const cell = 1; // mm
const key = (x: number, y: number) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`;

/**
 * Add the spacing histograms of every differential-pair net on every layer to the routing summary
 * (NetLayerStat.space). `planeNets` are left out as neighbours.
 */
export function addSpacing(routing: RoutingSummary, tracks: RawTrack[], planeNets: Set<string>) {
  const partner = new Map<string, string>();
  for (const p of routing.pairs) {
    partner.set(p.p, p.n);
    partner.set(p.n, p.p);
  }
  if (!partner.size) return;
  const byLayer = new Map<string, Piece[]>();
  for (const t of tracks) {
    if (!t.net || planeNets.has(t.net)) continue;
    const l = byLayer.get(t.layer) ?? [];
    pieces(t, l);
    byLayer.set(t.layer, l);
  }
  const stats = new Map<string, NetLayerStat>(routing.nets.flatMap((n) => n.layers.map((l) => [`${n.name}\u0000${l.layer}`, l] as const)));
  const reach = SPACING.max;
  const gk = (gx: number, gy: number) => gx * 1048576 + gy; // numeric grid key (boards are far under a million cells across)
  for (const [layer, all] of byLayer) {
    // grid of every piece on the layer
    const grid = new Map<number, number[]>();
    let wMax = 0;
    all.forEach((p, i) => {
      wMax = Math.max(wMax, p.w);
      const x0 = Math.floor(Math.min(p.x1, p.x2) / cell), x1 = Math.floor(Math.max(p.x1, p.x2) / cell);
      const y0 = Math.floor(Math.min(p.y1, p.y2) / cell), y1 = Math.floor(Math.max(p.y1, p.y2) / cell);
      for (let gx = x0; gx <= x1; gx++)
        for (let gy = y0; gy <= y1; gy++) {
          const k = gk(gx, gy);
          const c = grid.get(k);
          if (c) c.push(i);
          else grid.set(k, [i]);
        }
    });
    const byNet = new Map<string, Piece[]>();
    for (const p of all)
      if (partner.has(p.net)) {
        const l = byNet.get(p.net);
        if (l) l.push(p);
        else byNet.set(p.net, [p]);
      }
    const stamp = new Int32Array(all.length);
    let tick = 0;
    const rMax = Math.ceil((reach + wMax) / cell);
    for (const [net, own] of byNet) {
      const mate = partner.get(net)!;
      // free ends of the net's routing on this layer (pads and vias), in a grid of breakout-sized cells
      const degree = new Map<string, number>();
      for (const p of own) for (const k of [key(p.x1, p.y1), key(p.x2, p.y2)]) degree.set(k, (degree.get(k) ?? 0) + 1);
      const bc = SPACING.breakout;
      const freeGrid = new Map<number, [number, number][]>();
      for (const p of own)
        for (const [x, y] of [
          [p.x1, p.y1],
          [p.x2, p.y2],
        ] as [number, number][])
          if (degree.get(key(x, y)) === 1) {
            const k = gk(Math.floor(x / bc), Math.floor(y / bc));
            const l = freeGrid.get(k);
            if (l) l.push([x, y]);
            else freeGrid.set(k, [[x, y]]);
          }
      const nearFree = (x: number, y: number) => {
        const cx = Math.floor(x / bc), cy = Math.floor(y / bc);
        for (let i = cx - 1; i <= cx + 1; i++) for (let j = cy - 1; j <= cy + 1; j++) for (const [fx, fy] of freeGrid.get(gk(i, j)) ?? []) if (Math.hypot(fx - x, fy - y) < bc) return true;
        return false;
      };
      const pair = new Float64Array(SPACING.bins);
      const other = new Float64Array(SPACING.bins);
      let near: NonNullable<NetLayerStat['space']>['near'] | undefined = undefined;
      for (const p of own) {
        const len = Math.hypot(p.x2 - p.x1, p.y2 - p.y1);
        if (!(len > 0)) continue;
        const n = Math.max(1, Math.ceil(len / SPACING.step));
        const step = len / n;
        for (let i = 0; i < n; i++) {
          const u = (i + 0.5) / n;
          const x = p.x1 + (p.x2 - p.x1) * u;
          const y = p.y1 + (p.y2 - p.y1) * u;
          if (nearFree(x, y)) continue;
          let best = Infinity;
          let bestNet = '';
          const gx = Math.floor(x / cell);
          const gy = Math.floor(y / cell);
          tick++;
          // rings of cells outward; a piece in ring r + 1 is at least r cells from the sample
          for (let r = 0; r <= rMax; r++) {
            for (let a = gx - r; a <= gx + r; a++)
              for (let b = gy - r; b <= gy + r; b++) {
                if (Math.max(Math.abs(a - gx), Math.abs(b - gy)) !== r) continue;
                for (const j of grid.get(gk(a, b)) ?? []) {
                  if (stamp[j] === tick) continue;
                  stamp[j] = tick;
                  const q = all[j];
                  if (q.net === net || q.net === mate) continue;
                  const d = distToPiece(x, y, q) - p.w / 2 - q.w / 2;
                  if (d < best) {
                    best = d;
                    bestNet = q.net;
                  }
                }
              }
            if (best + p.w / 2 + wMax / 2 <= r * cell) break;
          }
          if (best >= reach) continue;
          const bin = Math.max(0, Math.min(SPACING.bins - 1, Math.floor(best / SPACING.bin)));
          (partner.has(bestNet) ? pair : other)[bin] += step;
          if (!near || best < near.d) near = { d: Math.round(Math.max(0, best) * 1e4) / 1e4, net: bestNet, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
        }
      }
      const s = stats.get(`${net}\u0000${layer}`);
      if (!s || !near) continue;
      const trim = (h: Float64Array) => {
        let e = h.length;
        while (e > 0 && h[e - 1] === 0) e--;
        return Array.from(h.subarray(0, e), (v) => Math.round(v * 1000) / 1000);
      };
      s.space = { pair: trim(pair), other: trim(other), near };
    }
  }
}
