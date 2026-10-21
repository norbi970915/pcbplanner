// Current capacity and DC voltage drop of a power net of a KiCad board, from its real copper.
//
// Copper model. On each copper layer the net's zone fills and pads are rasterised into square cells; two
// neighbouring copper cells are joined by the sheet conductance t/ρ (a square of copper has the same
// resistance at any size) times the part of the cells that is copper, so a thermal spoke or a neck narrower
// than a cell keeps its resistance. Every track is a resistor of its own, ρ·L/(W·t), between the nodes at its two
// ends. A pad is one node on each of its layers, joined strongly to the cells it covers; a track that ends
// inside a pad ends on that node. A via, and a plated through-hole pad, is a barrel resistor
// ρ·Δz/(π/4·((d+2p)² − d²)) between its nodes on neighbouring copper layers. t is the copper thickness of the
// layer from the stackup, ρ copper's resistivity at the copper temperature, p the barrel plating.
//
// Quick check: every track and via is checked as if the whole net current flowed through it (worst case, no
// solve). DC drop: the source part's pads are held at the reference, each load part draws its current
// through its pads, and the network is solved (conjugate gradients with a multigrid preconditioner) for the drop at
// every node, the current in every track and via and the current density in the copper areas (sparseSolve.ts).
// Temperature rise uses the IPC-2221 curve fit of the Trace Width and Via tools (ipc2221.ts), applied to a
// track's cross-section and, as the Via tool does, to a via barrel with the external-layer constant.
import { copperTemperatureError, rhoCu } from './copper';
import { areaMil2, IPC2221, tempRiseFor } from './ipc2221';
import { padPolygon, type BoardDrawing, type DrawPad } from './kicadDrawing';
import { buildGrid, cellAt, cellsInBox, forEachCellNode, gridEdges, type CopperGrid } from './copperGrid';
import { solveSpd } from './sparseSolve';
import { isGroundName, netLeaf, trackLength } from './kicadRouting';
import { MM_PER_MIL } from './units';

/** The copper of one net, from a board drawing; `i` is the index of the item in the drawing. */
export interface NetCopper {
  net: string;
  copper: string[];
  tracks: { i: number; layer: string; w: number; x1: number; y1: number; x2: number; y2: number; len: number }[];
  vias: { i: number; x: number; y: number; layers: [string, string]; drill: number; size: number }[];
  fills: { layer: string; xy: Float64Array }[];
  pads: (DrawPad & { i: number })[];
}

export interface PowerSettings {
  thickness: Record<string, number>; // copper thickness per layer, mm
  layerZ: Record<string, number>; // centre of each copper layer from the top, mm (via barrel lengths)
  platingMm: number; // via barrel plating
  tempC: number; // copper temperature for the resistivity
  dTC: number; // temperature rise allowed by the checks
}

export interface TrackLoad {
  i: number;
  layer: string;
  w: number;
  len: number;
  amps: number;
  dT: number; // IPC-2221 rise at that current
  ok: boolean;
  x: number; // middle of the track
  y: number;
}

export interface ViaLoad {
  i: number;
  x: number;
  y: number;
  amps: number;
  dT: number;
  ok: boolean;
}

const MM2_PER_MIL2 = MM_PER_MIL * MM_PER_MIL;
const isOuter = (layer: string, copper: string[]) => layer === copper[0] || layer === copper[copper.length - 1];
const kOf = (layer: string, copper: string[]) => (isOuter(layer, copper) ? IPC2221.kExternal : IPC2221.kInternal);
const barrelArea = (drill: number, plating: number) => (Math.PI / 4) * ((drill + 2 * plating) ** 2 - drill * drill); // mm²

/** The net's copper from a board drawing. */
export function netCopper(d: BoardDrawing, net: string): NetCopper {
  const tracks: NetCopper['tracks'] = [];
  d.tracks.forEach((t, i) => {
    if (t.net === net) tracks.push({ i, layer: t.layer, w: t.w, x1: t.x1, y1: t.y1, x2: t.x2, y2: t.y2, len: trackLength(t) });
  });
  const vias: NetCopper['vias'] = [];
  d.vias.forEach((v, i) => {
    if (v.net !== net) return;
    const span = v.layers.filter((l) => d.copper.includes(l)).sort((a, b) => d.copper.indexOf(a) - d.copper.indexOf(b));
    const layers: [string, string] = span.length >= 2 ? [span[0], span[span.length - 1]] : [d.copper[0], d.copper[d.copper.length - 1]];
    vias.push({ i, x: v.x, y: v.y, layers, drill: v.drill ?? 0.3, size: v.size ?? (v.drill ?? 0.3) + 0.2 });
  });
  const pads: NetCopper['pads'] = [];
  d.pads.forEach((p, i) => {
    if (p.net === net) pads.push({ ...p, i });
  });
  return { net, copper: d.copper, tracks, vias, fills: d.fills.filter((f) => f.net === net).map((f) => ({ layer: f.layer, xy: f.xy })), pads };
}

/** Every track and via checked with the whole net current flowing through it (worst case). */
export function quickCheck(nc: NetCopper, amps: number, s: PowerSettings): { tracks: TrackLoad[]; vias: ViaLoad[] } {
  const tracks = nc.tracks.map((t) => {
    const area = (t.w * (s.thickness[t.layer] ?? 0.035)) / MM2_PER_MIL2;
    const dT = tempRiseFor(amps, area, kOf(t.layer, nc.copper));
    return { i: t.i, layer: t.layer, w: t.w, len: t.len, amps, dT, ok: dT <= s.dTC, x: (t.x1 + t.x2) / 2, y: (t.y1 + t.y2) / 2 };
  });
  const vias = nc.vias.map((v) => {
    const dT = tempRiseFor(amps, barrelArea(v.drill, s.platingMm) / MM2_PER_MIL2, IPC2221.kExternal);
    return { i: v.i, x: v.x, y: v.y, amps, dT, ok: dT <= s.dTC };
  });
  return { tracks, vias };
}

/* ------------------------------------------------------------------ DC drop */

export interface DcRequest {
  nc: NetCopper;
  source: string; // reference of the part whose pads feed the net
  loads: { ref: string; amps: number }[];
  s: PowerSettings;
  /** Most copper cells over all layers (the grid is coarsened to stay under it). */
  maxCells?: number;
  /** Cell size, mm; chosen from maxCells when left out. */
  res?: number;
  /** Also return where the copper loses its power (for the thermal solve). */
  losses?: boolean;
}

/** Power lost in the copper around a point of a layer: the I²R of the network gathered on a 0.5 mm grid. */
export interface CopperLoss {
  layer: string;
  x: number;
  y: number;
  w: number; // watts
}
const LOSS_BIN = 0.5; // mm

export interface DcLayerMap {
  layer: string;
  x0: number;
  y0: number;
  res: number;
  nx: number;
  ny: number;
  drop: Float32Array; // mV below the source, NaN where there is no copper of the net
  density: Float32Array; // sheet current density, A per mm of width
}

export type DcResult =
  | {
      ok: true;
      res: number;
      nodes: number;
      iterations: number;
      residual: number;
      /** onNet: the part has pads on the net; connected: the copper joins every one of them to the source. */
      loads: { ref: string; amps: number; dropMv: number; maxMv: number; connected: boolean; onNet: boolean }[];
      tracks: TrackLoad[];
      vias: ViaLoad[];
      layers: DcLayerMap[];
      maxDropMv: number;
      powerW: number;
      losses?: CopperLoss[];
    }
  | { ok: false; error: string };

const REFINE_MARGIN = 0.8; // mm of copper around a forced pad resolved finely: thermal spokes and gaps
const FINE_RES = 0.03; // mm
const MAX_FINE = 600_000;

const bbox = (xy: ArrayLike<number>): [number, number, number, number] => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < xy.length; i += 2) {
    x0 = Math.min(x0, xy[i]);
    y0 = Math.min(y0, xy[i + 1]);
    x1 = Math.max(x1, xy[i]);
    y1 = Math.max(y1, xy[i + 1]);
  }
  return [x0, y0, x1, y1];
};

const polyArea = (xy: ArrayLike<number>) => {
  let a = 0;
  const n = xy.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) a += (xy[2 * j] + xy[2 * i]) * (xy[2 * j + 1] - xy[2 * i + 1]);
  return Math.abs(a / 2);
};

export function solveDc(req: DcRequest): DcResult {
  const { nc, s } = req;
  const temperatureError = copperTemperatureError(s.tempC);
  if (temperatureError) return { ok: false, error: temperatureError };
  const rho = rhoCu(s.tempC) * 1e3; // Ω·mm
  const thick = (l: string) => s.thickness[l] ?? 0.035;
  const maxCells = req.maxCells ?? 250_000;

  // copper areas per layer: fills and pads, as flat polygons
  const areaPolys = new Map<string, Float64Array[]>();
  const add = (l: string, xy: Float64Array) => {
    const list = areaPolys.get(l);
    if (list) list.push(xy);
    else areaPolys.set(l, [xy]);
  };
  for (const f of nc.fills) add(f.layer, f.xy);
  const padPolys = nc.pads.map((p) => Float64Array.from(padPolygon(p).flat()));
  // a grid only on layers with zone fills; pads alone are single nodes
  const gridLayers = [...new Set(nc.fills.map((f) => f.layer))];
  nc.pads.forEach((p, k) => {
    for (const l of p.layers) if (gridLayers.includes(l)) add(l, padPolys[k]);
  });
  let copperArea = 0;
  for (const l of gridLayers) for (const xy of areaPolys.get(l) ?? []) copperArea += polyArea(xy);
  const res = req.res ?? Math.min(1, Math.max(0.08, Math.sqrt(copperArea / maxCells)));

  // grids: refined around the pads the current is forced through (the source's and the loads')
  const forced = new Set([req.source, ...req.loads.filter((l) => l.amps > 0).map((l) => l.ref)]);
  const grids = new Map<string, CopperGrid>();
  let nodes = 0;
  // where each node is (for the losses): a cell's centre, a pad's centre, a junction's point
  const posX: number[] = [];
  const posY: number[] = [];
  const posL: string[] = [];
  const place = (n: number, x: number, y: number, layer: string) => {
    posX[n] = x;
    posY[n] = y;
    posL[n] = layer;
  };
  for (const l of gridLayers) {
    const boxes: [number, number, number, number][] = [];
    nc.pads.forEach((p, k) => {
      if (!forced.has(p.ref) || !p.layers.includes(l)) return;
      const b = bbox(padPolys[k]);
      boxes.push([b[0] - REFINE_MARGIN, b[1] - REFINE_MARGIN, b[2] + REFINE_MARGIN, b[3] + REFINE_MARGIN]);
    });
    const built = buildGrid(l, areaPolys.get(l) ?? [], res, boxes, FINE_RES, MAX_FINE / gridLayers.length, nodes);
    if (!built) continue;
    grids.set(l, built.grid);
    nodes = built.next;
    forEachCellNode(built.grid, (n, x, y) => place(n, x, y, l));
  }
  // overlapping fills make more cells than the area promised: coarsen once
  if (req.res === undefined && nodes > maxCells * 1.5 + MAX_FINE) return solveDc({ ...req, res: res * Math.sqrt(nodes / maxCells) });

  // edges
  const ea: number[] = [];
  const eb: number[] = [];
  const eg: number[] = [];
  const edge = (a: number, b: number, g: number) => {
    if (a === b || !(g > 0)) return;
    ea.push(a);
    eb.push(b);
    eg.push(g);
  };
  for (const g of grids.values()) gridEdges(g, thick(g.layer) / rho, edge);
  const joinAll = (n: number, layer: string, cells: Set<number>, x: number, y: number) => {
    const g = grids.get(layer)!;
    if (!cells.size) {
      const c = cellAt(g, x, y);
      if (c >= 0) cells.add(c);
    }
    const strong = (10 * thick(layer)) / rho;
    for (const c of cells) edge(n, c, strong);
  };

  // pads: one node per layer, joined to the cells they cover (a pad is close to equipotential)
  const padNode = new Map<string, number>(); // `${pad}|${layer}`
  const padsOn = new Map<string, number[]>(); // layer → pad indices
  nc.pads.forEach((p, k) => {
    for (const l of p.layers) {
      const n = nodes++;
      place(n, p.x, p.y, l);
      padNode.set(`${k}|${l}`, n);
      const on = padsOn.get(l);
      if (on) on.push(k);
      else padsOn.set(l, [k]);
      const g = grids.get(l);
      if (g) {
        const cells = new Set<number>();
        const b = bbox(padPolys[k]);
        cellsInBox(g, b[0], b[1], b[2], b[3], (x, y) => insidePad(p, x, y), cells);
        joinAll(n, l, cells, p.x, p.y);
      }
    }
    // a plated hole joins the pad's layers like a via barrel
    if (p.drill && p.layers.length > 1) {
      const ls = [...p.layers].sort((a, b) => nc.copper.indexOf(a) - nc.copper.indexOf(b));
      for (let j = 0; j + 1 < ls.length; j++) {
        const dz = Math.abs((s.layerZ[ls[j + 1]] ?? 0) - (s.layerZ[ls[j]] ?? 0)) || 0.2;
        edge(padNode.get(`${k}|${ls[j]}`)!, padNode.get(`${k}|${ls[j + 1]}`)!, barrelArea(p.drill, s.platingMm) / (rho * dz));
      }
    }
  });

  // a point on a layer: a pad it is inside, else a junction of tracks and vias, joined to the copper cells
  // under its copper (radius r: half the track width, the via's ring) so that current enters a plane over the
  // real contact and not at one cell (a point contact's spreading resistance grows without bound as the cell
  // shrinks)
  const junction = new Map<string, { n: number; r: number; cells: Set<number> }>();
  const nodeAt = (layer: string, x: number, y: number, r: number) => {
    for (const k of padsOn.get(layer) ?? []) if (insidePad(nc.pads[k], x, y)) return padNode.get(`${k}|${layer}`)!;
    const key = `${layer}|${Math.round(x * 1000)},${Math.round(y * 1000)}`;
    let j = junction.get(key);
    if (!j) {
      junction.set(key, (j = { n: nodes++, r: -1, cells: new Set() }));
      place(j.n, x, y, layer);
    }
    const g = grids.get(layer);
    if (g && r > j.r) {
      const more = new Set<number>();
      cellsInBox(g, x - r, y - r, x + r, y + r, (px, py) => Math.hypot(px - x, py - y) <= r, more);
      for (const c of j.cells) more.delete(c);
      if (j.r < 0 || more.size) joinAll(j.n, layer, more, x, y);
      for (const c of more) j.cells.add(c);
      j.r = r;
    }
    return j.n;
  };

  // tracks: an end inside a via's ring is on the via, ends whose copper overlaps are one point (KiCad
  // connects by overlap, not by equal coordinates), and a track that another track's end or a via touches
  // along its length is split there (a T-junction)
  const viasOn = new Map<string, NetCopper['vias']>();
  for (const v of nc.vias)
    for (const l of nc.copper.slice(nc.copper.indexOf(v.layers[0]), nc.copper.indexOf(v.layers[1]) + 1)) {
      const on = viasOn.get(l);
      if (on) on.push(v);
      else viasOn.set(l, [v]);
    }
  const snap = (layer: string, x: number, y: number): [number, number] => {
    for (const v of viasOn.get(layer) ?? []) if (Math.hypot(v.x - x, v.y - y) <= v.size / 2) return [v.x, v.y];
    return [x, y];
  };
  const ends = nc.tracks.map((t) => [snap(t.layer, t.x1, t.y1), snap(t.layer, t.x2, t.y2)]);
  {
    const parent = ends.flatMap((_, j) => [2 * j, 2 * j + 1]);
    const root = (a: number): number => (parent[a] === a ? a : (parent[a] = root(parent[a])));
    const pt = (a: number) => ends[a >> 1][a & 1];
    const bucket = new Map<string, number[]>();
    const keyOf = (l: string, x: number, y: number) => `${l}|${Math.floor(x)},${Math.floor(y)}`;
    for (let a = 0; a < parent.length; a++) {
      const t = nc.tracks[a >> 1];
      const [x, y] = pt(a);
      for (let gx = Math.floor(x) - 1; gx <= Math.floor(x) + 1; gx++)
        for (let gy = Math.floor(y) - 1; gy <= Math.floor(y) + 1; gy++)
          for (const b of bucket.get(`${t.layer}|${gx},${gy}`) ?? []) {
            const [bx, by] = pt(b);
            if (Math.hypot(bx - x, by - y) <= Math.max(t.w, nc.tracks[b >> 1].w) / 2) parent[root(a)] = root(b);
          }
      const k = keyOf(t.layer, x, y);
      const list = bucket.get(k);
      if (list) list.push(a);
      else bucket.set(k, [a]);
    }
    // a group that holds a via keeps the via's point
    const atVia = (a: number) => (viasOn.get(nc.tracks[a >> 1].layer) ?? []).some((v) => v.x === pt(a)[0] && v.y === pt(a)[1]);
    const rep = new Map<number, [number, number]>();
    for (let a = 0; a < parent.length; a++) if (!rep.has(root(a)) || atVia(a)) rep.set(root(a), pt(a));
    for (let a = 0; a < parent.length; a++) ends[a >> 1][a & 1] = rep.get(root(a))!;
  }
  const trackEdge: { a: number; b: number; g: number }[][] = [];
  nc.tracks.forEach((t, j) => {
    const [[x1, y1], [x2, y2]] = ends[j];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    const stops: [number, number, number][] = []; // along the track (0…1), x, y
    const touch = (x: number, y: number) => {
      if (!l2) return;
      const u = ((x - x1) * dx + (y - y1) * dy) / l2;
      if (u > 1e-4 && u < 1 - 1e-4 && Math.hypot(x1 + u * dx - x, y1 + u * dy - y) <= t.w / 2) stops.push([u, x, y]);
    };
    const bx0 = Math.min(x1, x2) - t.w;
    const bx1 = Math.max(x1, x2) + t.w;
    const by0 = Math.min(y1, y2) - t.w;
    const by1 = Math.max(y1, y2) + t.w;
    const near = (x: number, y: number) => x >= bx0 && x <= bx1 && y >= by0 && y <= by1;
    nc.tracks.forEach((o, k) => {
      if (k === j || o.layer !== t.layer) return;
      for (const [x, y] of ends[k]) if (near(x, y)) touch(x, y);
    });
    for (const v of viasOn.get(t.layer) ?? []) if (near(v.x, v.y)) touch(v.x, v.y);
    stops.sort((a, b) => a[0] - b[0]);
    const g = (t.w * thick(t.layer)) / (rho * Math.max(t.len, 1e-6));
    const pieces: { a: number; b: number; g: number }[] = [];
    let u0 = 0;
    let n0 = nodeAt(t.layer, x1, y1, t.w / 2);
    for (const [u, x, y] of [...stops, [1, x2, y2] as [number, number, number]]) {
      const n1 = nodeAt(t.layer, x, y, t.w / 2);
      if (n1 !== n0) {
        const piece = { a: n0, b: n1, g: g / Math.max(u - u0, 1e-6) };
        pieces.push(piece);
        edge(piece.a, piece.b, piece.g);
      }
      u0 = u;
      n0 = n1;
    }
    trackEdge.push(pieces);
  });
  // vias
  const viaEdges: { a: number; b: number; g: number }[][] = [];
  for (const v of nc.vias) {
    const span = nc.copper.slice(nc.copper.indexOf(v.layers[0]), nc.copper.indexOf(v.layers[1]) + 1);
    const segs: { a: number; b: number; g: number }[] = [];
    for (let j = 0; j + 1 < span.length; j++) {
      const a = nodeAt(span[j], v.x, v.y, v.size / 2);
      const b = nodeAt(span[j + 1], v.x, v.y, v.size / 2);
      const dz = Math.abs((s.layerZ[span[j + 1]] ?? 0) - (s.layerZ[span[j]] ?? 0)) || 0.2;
      const g = barrelArea(v.drill, s.platingMm) / (rho * dz);
      segs.push({ a, b, g });
      edge(a, b, g);
    }
    viaEdges.push(segs);
  }

  // sources and loads
  const partNodes = (ref: string) => {
    const out: number[] = [];
    nc.pads.forEach((p, k) => {
      if (p.ref === ref) for (const l of p.layers) out.push(padNode.get(`${k}|${l}`)!);
    });
    return out;
  };
  const src = partNodes(req.source);
  if (!src.length) return { ok: false, error: `${req.source} has no pad on ${nc.net}.` };
  const fixed = new Uint8Array(nodes);
  for (const n of src) fixed[n] = 1;
  const inject = new Float64Array(nodes);
  for (const ld of req.loads) {
    if (!(ld.amps > 0)) continue;
    const ns = partNodes(ld.ref);
    for (const n of ns) inject[n] += ld.amps / ns.length;
  }

  // adjacency (CSR), and the nodes the source reaches
  const deg = new Int32Array(nodes);
  for (let e = 0; e < ea.length; e++) {
    deg[ea[e]]++;
    deg[eb[e]]++;
  }
  const start = new Int32Array(nodes + 1);
  for (let n = 0; n < nodes; n++) start[n + 1] = start[n] + deg[n];
  const nbr = new Int32Array(start[nodes]);
  const ng = new Float64Array(start[nodes]);
  const fillPos = start.slice(0, nodes);
  for (let e = 0; e < ea.length; e++) {
    nbr[fillPos[ea[e]]] = eb[e];
    ng[fillPos[ea[e]]++] = eg[e];
    nbr[fillPos[eb[e]]] = ea[e];
    ng[fillPos[eb[e]]++] = eg[e];
  }
  const reach = new Uint8Array(nodes);
  const queue: number[] = [...src];
  for (const n of src) reach[n] = 1;
  while (queue.length) {
    const n = queue.pop()!;
    for (let k = start[n]; k < start[n + 1]; k++)
      if (!reach[nbr[k]]) {
        reach[nbr[k]] = 1;
        queue.push(nbr[k]);
      }
  }

  // the free reachable nodes: L·u = i with u = 0 at the source
  const idx = new Int32Array(nodes).fill(-1);
  let nf = 0;
  for (let n = 0; n < nodes; n++) if (reach[n] && !fixed[n]) idx[n] = nf++;
  const mStart = new Int32Array(nf + 1);
  const mDiag = new Float64Array(nf);
  const rhs = new Float64Array(nf);
  let nnz = 0;
  for (let n = 0; n < nodes; n++) {
    if (idx[n] < 0) continue;
    for (let k = start[n]; k < start[n + 1]; k++) {
      mDiag[idx[n]] += ng[k];
      if (idx[nbr[k]] >= 0) nnz++;
    }
    mStart[idx[n] + 1] = nnz;
    rhs[idx[n]] = inject[n];
  }
  const mCol = new Int32Array(nnz);
  const mVal = new Float64Array(nnz);
  for (let n = 0, q = 0; n < nodes; n++) {
    if (idx[n] < 0) continue;
    for (let k = start[n]; k < start[n + 1]; k++)
      if (idx[nbr[k]] >= 0) {
        mCol[q] = idx[nbr[k]];
        mVal[q++] = -ng[k];
      }
  }
  const sol = solveSpd({ n: nf, start: mStart, col: mCol, val: mVal, diag: mDiag }, rhs, 1e-7, 400);
  const u = new Float64Array(nodes);
  for (let n = 0; n < nodes; n++) if (idx[n] >= 0) u[n] = sol.x[idx[n]];
  const it = sol.iterations;
  const rnorm = sol.residual;
  const bnorm = 1;
  const val = (n: number) => (reach[n] ? u[n] : NaN);

  // results
  const mv = (v: number) => v * 1000;
  const loads = req.loads.map((ld) => {
    const ns = partNodes(ld.ref);
    const vs = ns.map(val).filter(Number.isFinite);
    const connected = vs.length > 0 && ns.every((n) => reach[n]);
    return { ref: ld.ref, amps: ld.amps, dropMv: vs.length ? mv(vs.reduce((a, b) => a + b, 0) / vs.length) : NaN, maxMv: vs.length ? mv(Math.max(...vs)) : NaN, connected, onNet: ns.length > 0 };
  });
  const tracks: TrackLoad[] = nc.tracks.map((t, j) => {
    let amps = 0;
    for (const e of trackEdge[j]) if (Number.isFinite(val(e.a)) && Number.isFinite(val(e.b))) amps = Math.max(amps, Math.abs(val(e.a) - val(e.b)) * e.g);
    const area = (t.w * thick(t.layer)) / MM2_PER_MIL2;
    const dT = amps > 0 ? tempRiseFor(amps, area, kOf(t.layer, nc.copper)) : 0;
    return { i: t.i, layer: t.layer, w: t.w, len: t.len, amps, dT, ok: dT <= s.dTC, x: (t.x1 + t.x2) / 2, y: (t.y1 + t.y2) / 2 };
  });
  const vias: ViaLoad[] = nc.vias.map((v, j) => {
    let amps = 0;
    for (const e of viaEdges[j]) if (Number.isFinite(val(e.a)) && Number.isFinite(val(e.b))) amps = Math.max(amps, Math.abs(val(e.a) - val(e.b)) * e.g);
    const dT = amps > 0 ? tempRiseFor(amps, barrelArea(v.drill, s.platingMm) / MM2_PER_MIL2, IPC2221.kExternal) : 0;
    return { i: v.i, x: v.x, y: v.y, amps, dT, ok: dT <= s.dTC };
  });
  const layers: DcLayerMap[] = [];
  const potential = (g: CopperGrid, x: number, y: number) => {
    const n = cellAt(g, x, y);
    return n >= 0 && reach[n] ? u[n] : NaN;
  };
  const sheetDensity = (g: CopperGrid, x: number, y: number, d: number, v: number) => {
    const slope = (a: number, b: number) =>
      Number.isFinite(a) && Number.isFinite(b) ? (a - b) / (2 * d) : Number.isFinite(a) ? (a - v) / d : Number.isFinite(b) ? (v - b) / d : 0;
    const gx = slope(potential(g, x + d, y), potential(g, x - d, y));
    const gy = slope(potential(g, x, y + d), potential(g, x, y - d));
    return (thick(g.layer) / rho) * Math.hypot(gx, gy); // A per mm of width
  };
  for (const g of grids.values()) {
    const drop = new Float32Array(g.nx * g.ny).fill(NaN);
    const density = new Float32Array(g.nx * g.ny).fill(NaN);
    for (let rr = 0; rr < g.ny; rr++)
      for (let c = 0; c < g.nx; c++) {
        const k = rr * g.nx + c;
        const x = g.x0 + c * g.res;
        const y = g.y0 + rr * g.res;
        if (g.fine[k] < 0) {
          const n = g.node[k];
          if (n < 0 || !reach[n]) continue;
          drop[k] = mv(u[n]);
          density[k] = sheetDensity(g, x, y, g.res, u[n]);
          continue;
        }
        // a split cell: the mean drop of its fine cells and their highest density
        let sum = 0;
        let cnt = 0;
        let top = 0;
        for (let sy = 0; sy < g.f; sy++)
          for (let sx = 0; sx < g.f; sx++) {
            const n = g.fNode[g.fine[k] + sy * g.f + sx];
            if (n < 0 || !reach[n]) continue;
            sum += u[n];
            cnt++;
            const fx = x - g.res / 2 + (sx + 0.5) * g.h;
            const fy = y - g.res / 2 + (sy + 0.5) * g.h;
            top = Math.max(top, sheetDensity(g, fx, fy, g.h, u[n]));
          }
        if (cnt) {
          drop[k] = mv(sum / cnt);
          density[k] = top;
        }
      }
    layers.push({ layer: g.layer, x0: g.x0, y0: g.y0, res, nx: g.nx, ny: g.ny, drop, density });
  }
  let powerW = 0;
  const bins = req.losses ? new Map<string, CopperLoss>() : null;
  const addLoss = (layer: string, x: number, y: number, w: number) => {
    const ix = Math.round(x / LOSS_BIN);
    const iy = Math.round(y / LOSS_BIN);
    const key = `${layer}|${ix},${iy}`;
    const b = bins!.get(key);
    if (b) b.w += w;
    else bins!.set(key, { layer, x: ix * LOSS_BIN, y: iy * LOSS_BIN, w });
  };
  for (let e = 0; e < ea.length; e++) {
    const va = val(ea[e]);
    const vb = val(eb[e]);
    if (!Number.isFinite(va) || !Number.isFinite(vb)) continue;
    const w = eg[e] * (va - vb) ** 2;
    powerW += w;
    if (!bins || !(w > 0)) continue;
    const a = ea[e];
    const b = eb[e];
    // a track or a sheet edge: between its ends on the layer; a barrel: half on each of its layers
    if (posL[a] === posL[b]) addLoss(posL[a], (posX[a] + posX[b]) / 2, (posY[a] + posY[b]) / 2, w);
    else {
      addLoss(posL[a], posX[a], posY[a], w / 2);
      addLoss(posL[b], posX[b], posY[b], w / 2);
    }
  }
  const allDrops = [...loads.map((l) => l.maxMv)].filter(Number.isFinite);
  return { ok: true, res, nodes, iterations: it, residual: rnorm / bnorm, loads, tracks, vias, layers, maxDropMv: allDrops.length ? Math.max(...allDrops) : 0, powerW, ...(bins ? { losses: [...bins.values()] } : {}) };
}

/** Is (x, y) inside the pad, with its rotation? */
export function insidePad(p: DrawPad, x: number, y: number): boolean {
  const a = (p.angle * Math.PI) / 180;
  const dx = x - p.x;
  const dy = y - p.y;
  const u = dx * Math.cos(a) - dy * Math.sin(a);
  const v = dx * Math.sin(a) + dy * Math.cos(a);
  if (p.shape === 'circle') return Math.hypot(u, v) <= p.w / 2 + 1e-6;
  return Math.abs(u) <= p.w / 2 + 1e-6 && Math.abs(v) <= p.h / 2 + 1e-6;
}

/* ------------------------------------------------------------------ helpers for the page */

export type NetKind = 'power' | 'ground' | 'other';
const POWER_NAME = /^[+-]|^v(cc|dd|in|bus|bat|sys|out|pp|aa|ee|ref|io|core|ddq|5|3|1|12)|pwr|power|^\d+v\d*|^\d+(\.\d+)?v|[_-]\d+v\d*$|^p\d+v\d*/i;

/** Nets with pads, power nets first, then ground nets, each by the number of pads. */
export function powerNets(d: BoardDrawing): { net: string; kind: NetKind; pads: number }[] {
  const count = new Map<string, number>();
  for (const p of d.pads) if (p.net && !/^(unconnected-|Net-\()/i.test(p.net)) count.set(p.net, (count.get(p.net) ?? 0) + 1);
  const kindOf = (n: string): NetKind => (isGroundName(n) ? 'ground' : POWER_NAME.test(netLeaf(n)) ? 'power' : 'other');
  const rank = { power: 0, ground: 1, other: 2 };
  return [...count]
    .filter(([, n]) => n >= 2)
    .map(([net, pads]) => ({ net, kind: kindOf(net), pads }))
    .sort((a, b) => rank[a.kind] - rank[b.kind] || b.pads - a.pads || a.net.localeCompare(b.net));
}

/** The voltage in a net name (+3V3 → 3.3, 5V → 5, VCC_1V8 → 1.8, +12V → 12), or 0. */
export function netVoltage(net: string): number {
  const leaf = netLeaf(net);
  const m = /(\d+\.\d+)V/i.exec(leaf) ?? /(\d+)V(\d+)?(?![a-z])/i.exec(leaf);
  if (!m) return 0;
  const v = Number(m[2] !== undefined ? `${m[1]}.${m[2]}` : m[1]);
  return Number.isFinite(v) && v > 0 && v <= 1000 ? v : 0;
}

/** Loads in the page address: "U3:1.2,U5:0.4". */
export function decodeLoads(s: string): { ref: string; amps: number }[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const i = x.lastIndexOf(':');
      return { ref: i > 0 ? x.slice(0, i) : x, amps: i > 0 ? Number(x.slice(i + 1)) : NaN };
    })
    .filter((l) => l.ref && Number.isFinite(l.amps) && l.amps >= 0);
}
export const encodeLoads = (loads: { ref: string; amps: number }[]) => loads.map((l) => `${l.ref}:${+l.amps.toPrecision(6)}`).join(',');

/** The parts with pads on the net, with their pad area, largest first. */
export function netParts(nc: NetCopper): { ref: string; pads: number; area: number }[] {
  const m = new Map<string, { ref: string; pads: number; area: number }>();
  for (const p of nc.pads) {
    if (!p.ref) continue;
    const e = m.get(p.ref) ?? { ref: p.ref, pads: 0, area: 0 };
    e.pads++;
    e.area += (p.shape === 'circle' ? Math.PI / 4 : 1) * p.w * p.h;
    m.set(p.ref, e);
  }
  return [...m.values()].sort((a, b) => b.area - a.area || a.ref.localeCompare(b.ref, undefined, { numeric: true }));
}

/** IPC-2221 width for a current and a rise, mm, on a layer of copper thickness t (mm). */
export function requiredWidth(amps: number, dTC: number, t: number, outer: boolean): number {
  return (areaMil2(amps, dTC, outer ? IPC2221.kExternal : IPC2221.kInternal) * MM2_PER_MIL2) / t;
}

/**
 * The return net of a DC drop: none when asked for none or when the net is itself a ground net; the ground net
 * chosen when it exists; else the ground net that reaches the source and the most loads.
 */
export function autoReturnNet(d: BoardDrawing, nets: { net: string; kind: NetKind }[], net: string, source: string, loads: { ref: string }[], pret: string): string {
  if (pret === 'none' || nets.find((n) => n.net === net)?.kind === 'ground') return '';
  const grounds = nets.filter((n) => n.kind === 'ground' && n.net !== net).map((n) => n.net);
  if (grounds.includes(pret)) return pret;
  const score = (g: string) => {
    const refs = new Set(d.pads.filter((q) => q.net === g).map((q) => q.ref));
    return (refs.has(source) ? 1000 : 0) + loads.filter((l) => refs.has(l.ref)).length;
  };
  return grounds.sort((a, b) => score(b) - score(a))[0] ?? '';
}

/**
 * The DC drop the Power tab sets up from its page inputs (net, source, loads, return net), with the same
 * defaults: the supply net and, when there is one, the return net with the loads that have pads on it.
 */
export function dcScenario(d: BoardDrawing, p: { pnet: string; psrc: string; ploads: string; pret: string }) {
  const nets = powerNets(d);
  const net = nets.some((n) => n.net === p.pnet) ? p.pnet : (nets.find((n) => n.kind === 'power')?.net ?? nets[0]?.net ?? '');
  const nc = net ? netCopper(d, net) : null;
  const parts = nc ? netParts(nc) : [];
  const source = parts.some((x) => x.ref === p.psrc) ? p.psrc : (parts[0]?.ref ?? '');
  const loads = decodeLoads(p.ploads).filter((l) => l.ref !== source && parts.some((x) => x.ref === l.ref));
  const returnNet = nc ? autoReturnNet(d, nets, net, source, loads, p.pret) : '';
  const retNc = returnNet ? netCopper(d, returnNet) : null;
  const retRefs = new Set(retNc?.pads.map((q) => q.ref) ?? []);
  return { net, nc, source, loads, returnNet, retNc, retLoads: loads.filter((l) => retRefs.has(l.ref)), retSourceOk: retRefs.has(source) };
}
