// An estimate of the copper of zones saved without their fill, for the Power and Thermal views of the KiCad
// project page. KiCad writes a zone's copper into the file only when the zones are filled; a board saved
// without that has only the zone outlines. This is not KiCad's filler, only an approximation of what it does:
//
//   1. the zone outline (less its cut-outs), inside the board outline, less the rule areas that keep pours out;
//   2. less everything of another net on the layer (tracks, vias, pads, other fills, the zones of other nets
//      filled before it), grown by the zone clearance, and the board edge by the same clearance;
//   3. less a thermal gap around the pads of its own net (the zone's pad connection), then the spokes back;
//   4. less copper narrower than the zone's minimum width (an opening: shrink by half of it, grow back);
//   5. less the islands that touch no pad, track or via of its net (the zone's island removal).
//
// The clearance to another item is the larger of the zone's and the net-class clearances of both nets (a
// clearance set on a pad or its footprint in place of its net class's), and to
// the board edge the larger of the zone's and the board's copper-to-edge rule (from the .kicad_pro; KiCad's
// default 0.5 mm without one), and around the drilled holes of other nets the board's hole clearance. Zones go by KiCad priority, the higher first; a zone of another net filled before cuts the later ones. Each
// zone and layer is worked out on a raster (cell centres, a fraction of the clearance) with exact Euclidean
// distance transforms (Felzenszwalb and Huttenlocher, Distance Transforms of Sampled Functions, Theory of
// Computing 8, 2012), and the cells are traced back into polygons. Its edges are therefore stepped by one cell,
// and custom rules, pads left off unused layers and KiCad's spoke rules are not modelled.
import { padPolygon, type BoardDrawing, type DrawFill } from './kicadDrawing';
import type { ZoneGeom } from './kicadPlanes';
import { arcOf } from './kicadRouting';

type Drawing = Pick<BoardDrawing, 'copper' | 'outline' | 'tracks' | 'vias' | 'pads' | 'fills' | 'zones'>;

export interface EstimatedFill {
  fills: DrawFill[];
  /** Zones of the chosen nets that were estimated, and the layers of them. */
  zones: number;
  layers: number;
}

/** Design rules from the project: the net-class clearance of each net and the copper-to-edge clearance, mm. */
export interface FillRules {
  netClearance?: Record<string, number>;
  edgeClearance?: number;
  holeClearance?: number;
}

/** KiCad's default minimum copper to board edge clearance, mm (board setup, Constraints). */
const EDGE_DEFAULT = 0.5;

/** Cells per zone and layer at most; a large zone gets coarser cells. */
const MAX_CELLS = 3_000_000;

interface Grid {
  x0: number; // centre of cell 0
  y0: number;
  res: number;
  nx: number;
  ny: number;
}

/* ------------------------------------------------------------------ rasterising */

/** Cells whose centre is inside the polygons (flat x y lists), even-odd across all of them. */
function scanFill(g: Grid, polys: ArrayLike<number>[], out: Uint8Array, value = 1) {
  const rows: number[][] = Array.from({ length: g.ny }, () => []);
  let any = false;
  for (const p of polys) {
    const n = p.length >> 1;
    for (let i = 0; i < n; i++) {
      const ax = p[2 * i];
      const ay = p[2 * i + 1];
      const j = (i + 1) % n;
      const bx = p[2 * j];
      const by = p[2 * j + 1];
      if (ay === by) continue;
      const lo = Math.min(ay, by);
      const hi = Math.max(ay, by);
      // rows whose centre y is in [lo, hi)
      const r0 = Math.max(0, Math.ceil((lo - g.y0) / g.res));
      const r1 = Math.min(g.ny - 1, Math.ceil((hi - g.y0) / g.res) - 1);
      for (let r = r0; r <= r1; r++) {
        const y = g.y0 + r * g.res;
        rows[r].push(ax + ((y - ay) * (bx - ax)) / (by - ay));
        any = true;
      }
    }
  }
  if (!any) return;
  for (let r = 0; r < g.ny; r++) {
    const xs = rows[r];
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((xs[k] - g.x0) / g.res));
      const c1 = Math.min(g.nx - 1, Math.ceil((xs[k + 1] - g.x0) / g.res) - 1);
      for (let c = c0; c <= c1; c++) out[r * g.nx + c] = value;
    }
  }
}

/** Cells whose centre is within r of the segment (x1, y1)–(x2, y2). */
function capsule(g: Grid, x1: number, y1: number, x2: number, y2: number, r: number, out: Uint8Array) {
  const c0 = Math.max(0, Math.floor((Math.min(x1, x2) - r - g.x0) / g.res));
  const c1 = Math.min(g.nx - 1, Math.ceil((Math.max(x1, x2) + r - g.x0) / g.res));
  const r0 = Math.max(0, Math.floor((Math.min(y1, y2) - r - g.y0) / g.res));
  const r1 = Math.min(g.ny - 1, Math.ceil((Math.max(y1, y2) + r - g.y0) / g.res));
  if (c0 > c1 || r0 > r1) return;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  const r2 = r * r;
  for (let row = r0; row <= r1; row++) {
    const y = g.y0 + row * g.res;
    for (let c = c0; c <= c1; c++) {
      const x = g.x0 + c * g.res;
      const u = l2 > 0 ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / l2)) : 0;
      const ex = x1 + u * dx - x;
      const ey = y1 + u * dy - y;
      if (ex * ex + ey * ey <= r2) out[row * g.nx + c] = 1;
    }
  }
}

/** A track, an arc split into chords. */
function track(g: Grid, t: BoardDrawing['tracks'][number], r: number, out: Uint8Array) {
  const arc = t.mx !== undefined && t.my !== undefined ? arcOf(t.x1, t.y1, t.mx, t.my, t.x2, t.y2) : null;
  if (!arc) return capsule(g, t.x1, t.y1, t.x2, t.y2, r, out);
  const n = Math.max(2, Math.ceil(Math.abs(arc.da) / ((5 * Math.PI) / 180)));
  let px = t.x1;
  let py = t.y1;
  for (let i = 1; i <= n; i++) {
    const a = arc.a0 + (arc.da * i) / n;
    const x = i === n ? t.x2 : arc.cx + arc.r * Math.cos(a);
    const y = i === n ? t.y2 : arc.cy + arc.r * Math.sin(a);
    capsule(g, px, py, x, y, r, out);
    px = x;
    py = y;
  }
}

const flat = (pts: [number, number][]) => {
  const a = new Float64Array(pts.length * 2);
  pts.forEach(([x, y], i) => {
    a[2 * i] = x;
    a[2 * i + 1] = y;
  });
  return a;
};

/* ------------------------------------------------------------------ distance transform */

/** Squared distance, in cells, from every cell to the nearest set cell of the mask (Infinity when none). */
function edt(mask: Uint8Array, nx: number, ny: number): Float32Array {
  const INF = 1e20;
  const out = new Float32Array(nx * ny);
  for (let i = 0; i < out.length; i++) out[i] = mask[i] ? 0 : INF;
  const n = Math.max(nx, ny);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const pass = (len: number) => {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
  };
  for (let c = 0; c < nx; c++) {
    for (let r = 0; r < ny; r++) f[r] = out[r * nx + c];
    pass(ny);
    for (let r = 0; r < ny; r++) out[r * nx + c] = d[r];
  }
  for (let r = 0; r < ny; r++) {
    const o = r * nx;
    for (let c = 0; c < nx; c++) f[c] = out[o + c];
    pass(nx);
    for (let c = 0; c < nx; c++) out[o + c] = d[c];
  }
  return out;
}

/* ------------------------------------------------------------------ cells back to polygons */

/**
 * The outlines of the set cells, traced along the cell edges: outer outlines one way round, holes the other,
 * joined into one flat polygon by going out to each loop and back the same way (the two passes cancel, so
 * the polygon fills even-odd and non-zero alike).
 */
function trace(g: Grid, m: Uint8Array): Float64Array | null {
  const { nx, ny } = g;
  const W = nx + 1;
  // directed cell edges with the cell on the same side: per corner, up to two outgoing edges
  const out = new Map<number, number[]>();
  const add = (a: number, b: number) => {
    const l = out.get(a);
    if (l) l.push(b);
    else out.set(a, [b]);
  };
  const on = (c: number, r: number) => c >= 0 && r >= 0 && c < nx && r < ny && m[r * nx + c] === 1;
  for (let r = 0; r < ny; r++)
    for (let c = 0; c < nx; c++) {
      if (!m[r * nx + c]) continue;
      const tl = r * W + c;
      const tr = tl + 1;
      const bl = tl + W;
      const br = bl + 1;
      if (!on(c, r - 1)) add(tl, tr);
      if (!on(c + 1, r)) add(tr, br);
      if (!on(c, r + 1)) add(br, bl);
      if (!on(c - 1, r)) add(bl, tl);
    }
  if (!out.size) return null;
  const loops: number[][] = [];
  for (const [start, list] of out) {
    while (list.length) {
      const loop: number[] = [start];
      let at = list.pop()!;
      for (let guard = 0; at !== start && guard < 1e8; guard++) {
        loop.push(at);
        const next = out.get(at);
        if (!next?.length) break;
        at = next.pop()!;
      }
      // drop the corners where the outline goes straight on
      const kept: number[] = [];
      for (let i = 0; i < loop.length; i++) {
        const a = loop[(i + loop.length - 1) % loop.length];
        const b = loop[i];
        const c = loop[(i + 1) % loop.length];
        const d1 = b - a;
        const d2 = c - b;
        if (d1 !== d2) kept.push(b);
      }
      if (kept.length >= 3) loops.push(kept);
    }
  }
  if (!loops.length) return null;
  const pt = (k: number): [number, number] => [g.x0 + ((k % W) - 0.5) * g.res, g.y0 + (Math.floor(k / W) - 0.5) * g.res];
  const xy: number[] = [];
  const anchor = pt(loops[0][0]);
  for (let li = 0; li < loops.length; li++) {
    const l = loops[li];
    for (const k of l) xy.push(...pt(k));
    xy.push(...pt(l[0])); // close this loop
    if (li > 0) xy.push(...anchor); // and go back to the first loop the way it came
    if (li + 1 < loops.length) xy.push(...anchor);
  }
  return new Float64Array(xy);
}

/* ------------------------------------------------------------------ one zone on one layer */

const viaOn = (v: BoardDrawing['vias'][number], layer: string, copper: string[]) => {
  if (v.layers.length < 2 || (v.kind ?? 'through') === 'through') return true;
  const a = copper.indexOf(v.layers[0]);
  const b = copper.indexOf(v.layers[v.layers.length - 1]);
  const i = copper.indexOf(layer);
  return a < 0 || b < 0 || i < 0 || (i >= Math.min(a, b) && i <= Math.max(a, b));
};

function polyBox(xy: ArrayLike<number>): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < xy.length; i += 2) {
    x0 = Math.min(x0, xy[i]);
    x1 = Math.max(x1, xy[i]);
    y0 = Math.min(y0, xy[i + 1]);
    y1 = Math.max(y1, xy[i + 1]);
  }
  return [x0, y0, x1, y1];
}

function fillZoneLayer(d: Drawing, z: ZoneGeom, layer: string, done: DrawFill[], outline: Float64Array[], rules: FillRules): Float64Array | null {
  const s = z.fill!;
  const cls = (n: string) => rules.netClearance?.[n] ?? 0;
  const clr = Math.max(0, s.clearance, cls(z.net));
  const edgeClr = Math.max(clr, rules.edgeClearance ?? EDGE_DEFAULT);
  // the copper of other nets, one mask per clearance
  const byClr = new Map<number, Uint8Array>();
  const foreignOf = (n: string, at?: number) => {
    const c = at ?? Math.max(clr, cls(n));
    let m = byClr.get(c);
    if (!m) byClr.set(c, (m = new Uint8Array(N)));
    return m;
  };
  const rings = z.rings.map((r) => flat(r));
  const zb = rings.map(polyBox).reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
  const margin = Math.max(clr, edgeClr) + Math.max(s.thermalGap, s.minThickness) + 0.5;
  const fine = Math.min(clr > 0 ? clr : 0.2, s.minThickness > 0 ? s.minThickness : 0.2, s.thermalBridge > 0 ? s.thermalBridge : 0.2) / 3;
  const area = (zb[2] - zb[0] + 2 * margin) * (zb[3] - zb[1] + 2 * margin);
  const res = Math.max(0.01, fine, Math.sqrt(area / MAX_CELLS));
  const g: Grid = { x0: zb[0] - margin, y0: zb[1] - margin, res, nx: Math.ceil((zb[2] - zb[0] + 2 * margin) / res) + 1, ny: Math.ceil((zb[3] - zb[1] + 2 * margin) / res) + 1 };
  const N = g.nx * g.ny;
  const box = [g.x0 - res, g.y0 - res, g.x0 + g.nx * res, g.y0 + g.ny * res];
  const near = (x0: number, y0: number, x1: number, y1: number) => x1 >= box[0] && x0 <= box[2] && y1 >= box[1] && y0 <= box[3];

  // 1. the zone inside the board, less the rule areas
  const inside = new Uint8Array(N);
  scanFill(g, rings, inside);
  if (outline.length) {
    const board = new Uint8Array(N);
    scanFill(g, outline, board);
    for (let i = 0; i < N; i++) if (!board[i]) inside[i] = 0;
  }
  for (const k of d.zones ?? []) if (k.keepout && k.layers.includes(layer)) scanFill(g, k.rings.map((r) => flat(r)), inside, 0);

  // 2. other nets (and the board edge) grown by the clearance; the pads of the zone's net by the thermal gap
  const ownPads = new Uint8Array(N); // pads of the net connected by thermal reliefs
  const own = new Uint8Array(N); // copper of the net on this layer, for the islands
  const thermal: BoardDrawing['pads'] = [];
  const net = z.net;
  for (const t of d.tracks) {
    if (t.layer !== layer) continue;
    const r = t.w / 2;
    if (!near(Math.min(t.x1, t.x2) - r, Math.min(t.y1, t.y2) - r, Math.max(t.x1, t.x2) + r, Math.max(t.y1, t.y2) + r)) continue;
    track(g, t, r, t.net === net ? own : foreignOf(t.net));
  }
  for (const v of d.vias) {
    if (!viaOn(v, layer, d.copper)) continue;
    const r = (v.size ?? 0.6) / 2;
    if (!near(v.x - r, v.y - r, v.x + r, v.y + r)) continue;
    capsule(g, v.x, v.y, v.x, v.y, r, v.net === net ? own : foreignOf(v.net));
    if (v.net !== net && v.drill && rules.holeClearance) capsule(g, v.x, v.y, v.x, v.y, v.drill / 2, foreignOf(v.net, rules.holeClearance));
  }
  for (const p of d.pads) {
    if (!p.layers.includes(layer)) continue;
    const r = Math.max(p.w, p.h) / 2;
    if (!near(p.x - r, p.y - r, p.x + r, p.y + r)) continue;
    const poly = flat(padPolygon(p));
    // the pad's own zone connection wins over the zone's
    const th = p.drill !== undefined;
    const mode = p.zoneConnect === 'thtThermal' ? (th ? 'thermal' : 'solid') : (p.zoneConnect ?? (s.connect === 'thtSolid' ? (th ? 'solid' : 'thermal') : s.connect));
    if (p.net !== net || !net || mode === 'none') {
      scanFill(g, [poly], foreignOf(p.net, p.clearance !== undefined ? Math.max(clr, p.clearance) : undefined));
      if (p.drill && rules.holeClearance) capsule(g, p.x, p.y, p.x, p.y, p.drill / 2, foreignOf(p.net, rules.holeClearance));
      continue;
    }
    scanFill(g, [poly], own);
    if (mode === 'thermal') {
      scanFill(g, [poly], ownPads);
      thermal.push(p);
    }
  }
  for (const f of [...d.fills, ...done]) {
    if (f.layer !== layer) continue;
    const b = polyBox(f.xy);
    if (!near(b[0], b[1], b[2], b[3])) continue;
    scanFill(g, [f.xy], f.net === net && net ? own : foreignOf(f.net));
  }
  if (outline.length) {
    // the board edge: everything outside the outline, at the edge clearance
    const board = new Uint8Array(N);
    scanFill(g, outline, board);
    const edge = new Uint8Array(N);
    for (let i = 0; i < N; i++) edge[i] = board[i] ? 0 : 1;
    const m = byClr.get(edgeClr);
    if (m) for (let i = 0; i < N; i++) m[i] |= edge[i];
    else byClr.set(edgeClr, edge);
  }
  const lim = (mm: number) => (mm / res + 0.5) ** 2; // squared cells, measured to the edge of a set cell
  const allowed = inside.slice();
  for (const [c, m] of byClr) {
    const dF = edt(m, g.nx, g.ny);
    const l = lim(c);
    for (let i = 0; i < N; i++) if (dF[i] <= l) allowed[i] = 0;
  }
  let fill = allowed.slice();
  if (thermal.length) {
    const dP = edt(ownPads, g.nx, g.ny);
    const gap = lim(s.thermalGap);
    for (let i = 0; i < N; i++) if (dP[i] <= gap) fill[i] = 0;
  }

  // 4. copper narrower than the minimum width goes: shrink by half of it, then grow back
  const half = s.minThickness / 2;
  if (half > res / 2) {
    const empty = new Uint8Array(N);
    for (let i = 0; i < N; i++) empty[i] = fill[i] ? 0 : 1;
    const dE = edt(empty, g.nx, g.ny);
    const core = new Uint8Array(N);
    const h2 = (half / res) ** 2;
    for (let i = 0; i < N; i++) core[i] = dE[i] > h2 ? 1 : 0;
    const dC = edt(core, g.nx, g.ny);
    const opened = new Uint8Array(N);
    for (let i = 0; i < N; i++) opened[i] = fill[i] && dC[i] <= lim(half) ? 1 : 0;
    fill = opened;
  }

  // 3. the spokes of the thermal reliefs: four per pad along its axes (45° on a round pad), kept when they reach the fill
  const bw = s.thermalBridge / 2;
  const spokes = new Uint8Array(thermal.length ? N : 0);
  for (const p of thermal) {
    const a = ((p.angle + (p.shape === 'circle' ? 45 : 0)) * Math.PI) / 180;
    for (let k = 0; k < 4; k++) {
      const t = a + (k * Math.PI) / 2;
      const ux = Math.cos(t);
      const uy = -Math.sin(t);
      // from the pad centre out past the gap: the pad's extent along the spoke, the gap and a minimum width
      const pa = (p.angle * Math.PI) / 180;
      const ext = (Math.abs(ux * Math.cos(pa) - uy * Math.sin(pa)) * p.w) / 2 + (Math.abs(ux * Math.sin(pa) + uy * Math.cos(pa)) * p.h) / 2;
      const len = ext + s.thermalGap + Math.max(s.minThickness, res * 2);
      const ex = p.x + ux * len;
      const ey = p.y + uy * len;
      const c = Math.round((ex - g.x0) / res);
      const r = Math.round((ey - g.y0) / res);
      if (c < 0 || r < 0 || c >= g.nx || r >= g.ny || !fill[r * g.nx + c]) continue;
      capsule(g, p.x, p.y, ex, ey, bw, spokes);
    }
  }
  if (thermal.length) for (let i = 0; i < N; i++) if (spokes[i] && allowed[i]) fill[i] = 1;

  // 5. islands that touch none of the net's copper on this layer
  if (s.islands !== 'keep') {
    const label = new Int32Array(N).fill(-1);
    const stack: number[] = [];
    const minCells = s.islands === 'belowArea' ? s.islandMin / (res * res) : Infinity;
    for (let i = 0; i < N; i++) {
      if (!fill[i] || label[i] >= 0) continue;
      const cells: number[] = [];
      let touches = false;
      label[i] = i;
      stack.push(i);
      while (stack.length) {
        const k = stack.pop()!;
        cells.push(k);
        if (own[k]) touches = true;
        const c = k % g.nx;
        const nb = [c > 0 ? k - 1 : -1, c + 1 < g.nx ? k + 1 : -1, k - g.nx, k + g.nx];
        for (const q of nb) {
          if (q < 0 || q >= N || !fill[q] || label[q] >= 0) continue;
          label[q] = i;
          stack.push(q);
        }
      }
      if (!touches && cells.length < minCells) for (const k of cells) fill[k] = 0;
    }
  }
  return trace(g, fill);
}

/* ------------------------------------------------------------------ the chosen nets */

/** The unfilled zones of the board, by net, with the copper layers they cover. */
export function unfilledNets(d: Pick<BoardDrawing, 'zones'>): { net: string; zones: number }[] {
  const m = new Map<string, number>();
  for (const z of d.zones ?? []) if (!z.keepout && !z.filled && z.net && z.net !== '(no net)') m.set(z.net, (m.get(z.net) ?? 0) + 1);
  return [...m].map(([net, zones]) => ({ net, zones })).sort((a, b) => b.zones - a.zones || a.net.localeCompare(b.net));
}

/** Estimated fills of the unfilled zones of the given nets, the zones of higher priority first. */
export function estimateFills(d: Drawing, nets: string[], rules: FillRules = {}): EstimatedFill {
  const want = new Set(nets);
  const zones = (d.zones ?? []).filter((z) => !z.keepout && !z.filled && z.fill && want.has(z.net)).sort((a, b) => b.priority - a.priority);
  const outline = d.outline.filter((l) => l.length >= 3).map((l) => flat(l));
  const fills: DrawFill[] = [];
  let layers = 0;
  for (const z of zones)
    for (const layer of z.layers) {
      if (!d.copper.includes(layer)) continue;
      const xy = fillZoneLayer(d, z, layer, fills, outline, rules);
      layers++;
      if (xy) fills.push({ layer, xy, net: z.net, estimated: true });
    }
  return { fills, zones: zones.length, layers };
}
