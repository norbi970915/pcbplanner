// Steady temperature of a KiCad board: the heat of the parts spreads through the copper and the laminate and
// leaves both faces of the board to the air.
//
// Model. The board inside its outline is cut into square cells, the same on every copper layer. A cell of a
// layer stands for its copper and half of the laminate on each side of it. Neighbouring cells of a layer are
// joined by k_Cu·t·c (t the copper thickness, c the smaller part of the two cells that is copper: zones, tracks,
// pads and via pads of every net) plus k_xy·d (d the laminate the cell stands for); a cell is joined to the
// same cell of the next layer by k_z·A/h (A the cell area, h the laminate between the layers), and by
// k_Cu·a/h for every via and plated hole there (a the barrel's copper ring). The outer layers lose heat to
// the air by (h_c + h_r)·A: natural convection from the plate correlations of the heat-spreading tool
// (spreading.ts), or an entered coefficient for moving air, plus linearised radiation εσ(Ts² + Ta²)(Ts + Ta).
// Both depend on the rise; because all the heat leaves through the faces, the mean rise of the faces is
// P / ((h_top + h_bottom + 2 h_r)·A_board), and the coefficients are iterated on it before the one solve.
// A part's power enters the board through its pads on its own side; heat leaving the package top to the
// air is not counted, which is conservative.
import { coverage } from './copperGrid';
import { padPolygon, type BoardDrawing } from './kicadDrawing';
import { insidePad } from './kicadPower';
import { arcOf } from './kicadRouting';
import { laplacian, solveSpd } from './sparseSolve';
import { naturalConvection, radiationH, type Orientation } from './spreading';

/** Thermal conductivity of the copper of a printed board, W/(m·K): Graebner measured 385 ± 15 (pure annealed copper is 401). */
export const K_CU_BOARD = 385;

export type Air = { mode: 'natural'; orient: Orientation } | { mode: 'forced'; h: number };

export interface ThermalRequest {
  d: Pick<BoardDrawing, 'copper' | 'outline' | 'tracks' | 'vias' | 'fills' | 'pads' | 'parts'>;
  thickness: Record<string, number>; // copper thickness per layer, mm
  layerZ: Record<string, number>; // centre of each copper layer from the top, mm
  boardThickness: number; // mm
  sources: { ref: string; watts: number }[];
  ambientC: number;
  air: Air;
  emissivity: number;
  kXY: number; // laminate in-plane conductivity, W/(m·K)
  kZ: number; // through-plane
  platingMm: number;
  maxCells?: number; // all layers together
  res?: number;
}

export interface ThermalLayerMap {
  layer: string;
  x0: number;
  y0: number;
  res: number;
  nx: number;
  ny: number;
  temp: Float32Array; // °C, NaN outside the board
}

export type ThermalResult =
  | {
      ok: true;
      res: number;
      nodes: number;
      iterations: number;
      layers: ThermalLayerMap[];
      parts: { ref: string; watts: number; meanC: number; maxC: number; back: boolean; placed: boolean }[];
      hottest: { c: number; x: number; y: number; layer: string };
      meanRise: number; // mean rise of the faces
      hTop: number; // convection, W/m²·K
      hBottom: number;
      hRad: number;
      powerW: number;
      boardAreaMm2: number;
      balanceW: number;
      /** 'copper' when the file has no closed outline around the copper and its extent was used instead. */
      outlineUsed: 'outline' | 'copper'; // heat leaving the faces in the solution (equals powerW when solved)
    }
  | { ok: false; error: string };

/** A track as a polygon: a rectangle with round ends (an arc as its chords). */
function trackPolys(t: BoardDrawing['tracks'][number]): number[][] {
  const pts: [number, number][] = [];
  const a = t.mx !== undefined && t.my !== undefined ? arcOf(t.x1, t.y1, t.mx, t.my, t.x2, t.y2) : null;
  if (a) for (let i = 0; i <= 8; i++) pts.push([a.cx + a.r * Math.cos(a.a0 + (a.da * i) / 8), a.cy + a.r * Math.sin(a.a0 + (a.da * i) / 8)]);
  else pts.push([t.x1, t.y1], [t.x2, t.y2]);
  const out: number[][] = [];
  const r = t.w / 2;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const p: number[] = [];
    for (let k = 0; k <= 6; k++) {
      const u = ang - Math.PI / 2 + (Math.PI * k) / 6;
      p.push(x2 + r * Math.cos(u), y2 + r * Math.sin(u));
    }
    for (let k = 0; k <= 6; k++) {
      const u = ang + Math.PI / 2 + (Math.PI * k) / 6;
      p.push(x1 + r * Math.cos(u), y1 + r * Math.sin(u));
    }
    out.push(p);
  }
  return out;
}

const circle = (x: number, y: number, r: number) => {
  const p: number[] = [];
  for (let k = 0; k < 12; k++) p.push(x + r * Math.cos((k * Math.PI) / 6), y + r * Math.sin((k * Math.PI) / 6));
  return p;
};

/** Mean rise of the faces and the coefficients at it, from the heat balance P = (h_top + h_bottom + 2h_r)·A·ΔT. */
export function faceCoefficients(powerW: number, areaM2: number, ambientC: number, air: Air, emissivity: number) {
  let dT = powerW > 0 ? 10 : 0;
  let hTop = 0;
  let hBottom = 0;
  let hRad = 0;
  const side = Math.sqrt(areaM2);
  for (let i = 0; i < 60; i++) {
    const hc = air.mode === 'natural' ? naturalConvection(side, Math.max(dT, 1e-3), ambientC, air.orient) : { top: air.h, bottom: air.h };
    hTop = hc.top;
    hBottom = hc.bottom;
    hRad = radiationH(emissivity, ambientC + dT, ambientC);
    const next = powerW / ((hTop + hBottom + 2 * hRad) * areaM2);
    if (Math.abs(next - dT) < 1e-6 * Math.max(1, next)) {
      dT = next;
      break;
    }
    dT = 0.5 * dT + 0.5 * next;
  }
  return { dT, hTop, hBottom, hRad };
}

export function solveThermal(req: ThermalRequest): ThermalResult {
  const { d } = req;
  const L = d.copper.length;
  if (!L) return { ok: false, error: 'The board has no copper layers.' };
  const powerW = req.sources.reduce((a, s) => a + (s.watts > 0 ? s.watts : 0), 0);

  // the board: its outline, else the extent of its copper. An outline that leaves most of the copper out
  // (a slot or a cut-out read as the only closed shape, the real outline left open) is not the board.
  // The largest closed shape is the board; the shapes inside it are cut-outs (even-odd), shapes outside it
  // (a second board of a panel, a stray drawing) are left out.
  const loops = d.outline.filter((l) => l.length >= 3);
  const loopArea = (l: [number, number][]) => Math.abs(l.reduce((a, [x, y], i) => a + x * l[(i + 1) % l.length][1] - l[(i + 1) % l.length][0] * y, 0)) / 2;
  const largest = loops.reduce<[number, number][] | null>((m, l) => (!m || loopArea(l) > loopArea(m) ? l : m), null);
  const inBox = (l: [number, number][], m: [number, number][]) => {
    const xs = m.map((p) => p[0]);
    const ys = m.map((p) => p[1]);
    return l.every(([x, y]) => x >= Math.min(...xs) && x <= Math.max(...xs) && y >= Math.min(...ys) && y <= Math.max(...ys));
  };
  let outline = largest ? loops.filter((l) => l === largest || inBox(l, largest)).map((l) => l.flat()) : [];
  const box = () => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  const grow = (b: ReturnType<typeof box>, x: number, y: number) => {
    b.x0 = Math.min(b.x0, x);
    b.y0 = Math.min(b.y0, y);
    b.x1 = Math.max(b.x1, x);
    b.y1 = Math.max(b.y1, y);
  };
  const cu = box();
  for (const t of d.tracks) (grow(cu, t.x1, t.y1), grow(cu, t.x2, t.y2));
  for (const p of d.pads) grow(cu, p.x, p.y);
  for (const f of d.fills) for (let i = 0; i < f.xy.length; i += 2) grow(cu, f.xy[i], f.xy[i + 1]);
  const ol = box();
  for (const l of outline) for (let i = 0; i < l.length; i += 2) grow(ol, l[i], l[i + 1]);
  const overlap = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const cuArea = (cu.x1 - cu.x0) * (cu.y1 - cu.y0);
  let outlineUsed: 'outline' | 'copper' = 'outline';
  if (!outline.length || (cuArea > 0 && overlap(ol, cu) < 0.5 * cuArea)) {
    if (!Number.isFinite(cu.x0)) return { ok: false, error: 'The board has no outline and no copper.' };
    outline = [[cu.x0, cu.y0, cu.x1, cu.y0, cu.x1, cu.y1, cu.x0, cu.y1]];
    outlineUsed = 'copper';
  }
  const b = outlineUsed === 'copper' ? cu : ol;
  const [bx0, by0, bx1, by1] = [b.x0, b.y0, b.x1, b.y1];
  const area = (bx1 - bx0) * (by1 - by0);
  const res = req.res ?? Math.min(2, Math.max(0.2, Math.sqrt((area * L) / (req.maxCells ?? 400_000))));
  const nx = Math.max(1, Math.ceil((bx1 - bx0) / res) + 1);
  const ny = Math.max(1, Math.ceil((by1 - by0) / res) + 1);
  const inside = coverage(outline, nx, ny, bx0, by0, res, true);
  const cellOf = new Int32Array(nx * ny).fill(-1);
  let nb = 0;
  let boardArea = 0; // mm²
  for (let k = 0; k < inside.length; k++)
    if (inside[k] > 0.3) {
      cellOf[k] = nb++;
      boardArea += inside[k] * res * res;
    }
  if (!nb) return { ok: false, error: 'The board outline encloses no area.' };
  const cellAt = (x: number, y: number) => {
    const c = Math.floor((x - bx0) / res + 0.5);
    const r = Math.floor((y - by0) / res + 0.5);
    return c < 0 || r < 0 || c >= nx || r >= ny ? -1 : cellOf[r * nx + c];
  };

  // copper of every net on each layer
  const polys = new Map<string, ArrayLike<number>[]>(d.copper.map((l) => [l, []]));
  for (const f of d.fills) polys.get(f.layer)?.push(f.xy);
  for (const t of d.tracks) {
    const list = polys.get(t.layer);
    if (list) for (const p of trackPolys(t)) list.push(p);
  }
  for (const p of d.pads) {
    const o = padPolygon(p).flat();
    for (const l of p.layers) polys.get(l)?.push(o);
  }
  const span = (layers: string[]) => {
    const idx = layers.map((l) => d.copper.indexOf(l)).filter((i) => i >= 0);
    return idx.length ? [Math.min(...idx), Math.max(...idx)] : [0, L - 1];
  };
  for (const v of d.vias) {
    const [a, b] = v.layers.length >= 2 ? span(v.layers) : [0, L - 1];
    const o = circle(v.x, v.y, (v.size ?? 0.6) / 2);
    for (let i = a; i <= b; i++) polys.get(d.copper[i])!.push(o);
  }
  const cov = d.copper.map((l) => coverage(polys.get(l)!, nx, ny, bx0, by0, res));

  // laminate thickness between neighbouring layers, m
  const mm = 1e-3;
  const tCu = d.copper.map((l) => (req.thickness[l] ?? 0.035) * mm);
  const z = d.copper.map((l, i) => req.layerZ[l] ?? (L > 1 ? (i * req.boardThickness) / (L - 1) : 0));
  const gap = d.copper.slice(1).map((_, i) => Math.max(0.02, Math.abs(z[i + 1] - z[i]) - ((req.thickness[d.copper[i]] ?? 0.035) + (req.thickness[d.copper[i + 1]] ?? 0.035)) / 2) * mm);
  // the laminate a layer's cells stand for: half the gap on each side (the outer layers: one side)
  const dLam = d.copper.map((_, i) => ((i > 0 ? gap[i - 1] : 0) + (i < L - 1 ? gap[i] : 0)) / 2);

  // network
  const n = nb * L;
  const node = (layer: number, cell: number) => layer * nb + cell;
  const ea: number[] = [];
  const eb: number[] = [];
  const eg: number[] = [];
  const edge = (a: number, b: number, g: number) => {
    if (a === b || !(g > 0)) return;
    ea.push(a);
    eb.push(b);
    eg.push(g);
  };
  const aCell = (res * mm) ** 2;
  for (let li = 0; li < L; li++) {
    const c = cov[li];
    const lam = req.kXY * dLam[li];
    const cu = K_CU_BOARD * tCu[li];
    for (let r = 0; r < ny; r++)
      for (let col = 0; col < nx; col++) {
        const k = r * nx + col;
        const a = cellOf[k];
        if (a < 0) continue;
        if (col + 1 < nx && cellOf[k + 1] >= 0) edge(node(li, a), node(li, cellOf[k + 1]), cu * Math.min(c[k], c[k + 1]) + lam);
        if (r + 1 < ny && cellOf[k + nx] >= 0) edge(node(li, a), node(li, cellOf[k + nx]), cu * Math.min(c[k], c[k + nx]) + lam);
        if (li + 1 < L) edge(node(li, a), node(li + 1, a), (req.kZ * aCell * Math.min(1, inside[k])) / gap[li]);
      }
  }
  // barrels: vias and plated holes
  const barrel = (drill: number) => (Math.PI / 4) * ((drill + 2 * req.platingMm) ** 2 - drill * drill) * mm * mm;
  const addBarrel = (x: number, y: number, a: number, b: number, drill: number) => {
    const cell = cellAt(x, y);
    if (cell < 0) return;
    for (let i = a; i < b; i++) edge(node(i, cell), node(i + 1, cell), (K_CU_BOARD * barrel(drill)) / Math.max(Math.abs(z[i + 1] - z[i]) * mm, 1e-5));
  };
  for (const v of d.vias) {
    const [a, b] = v.layers.length >= 2 ? span(v.layers) : [0, L - 1];
    addBarrel(v.x, v.y, a, b, v.drill ?? 0.3);
  }
  for (const p of d.pads) if (p.drill && p.layers.length > 1) addBarrel(p.x, p.y, ...(span(p.layers) as [number, number]), p.drill);

  // the faces
  const faces = faceCoefficients(powerW, boardArea * mm * mm, req.ambientC, req.air, req.emissivity);
  const ground = new Float64Array(n);
  for (let k = 0; k < inside.length; k++) {
    const a = cellOf[k];
    if (a < 0) continue;
    const share = Math.min(1, inside[k]) * aCell;
    ground[node(0, a)] += (faces.hTop + faces.hRad) * share;
    ground[node(L - 1, a)] += (faces.hBottom + faces.hRad) * share;
  }

  // the parts' heat, through their pads on their own side
  const q = new Float64Array(n);
  const parts = req.sources
    .filter((s) => s.watts > 0)
    .map((s) => {
      const part = d.parts.find((p) => p.ref === s.ref);
      const back = part?.back ?? false;
      const li = back ? L - 1 : 0;
      const side = d.copper[li];
      const cells = new Set<number>();
      for (const p of d.pads) {
        if (p.ref !== s.ref || !p.layers.includes(side)) continue;
        const o = padPolygon(p);
        const xs = o.map((v) => v[0]);
        const ys = o.map((v) => v[1]);
        const step = res / 2;
        for (let y = Math.min(...ys) + step / 2; y <= Math.max(...ys); y += step)
          for (let x = Math.min(...xs) + step / 2; x <= Math.max(...xs); x += step) if (insidePad(p, x, y)) cells.add(cellAt(x, y));
        cells.add(cellAt(p.x, p.y));
      }
      cells.delete(-1);
      const placed = cells.size > 0;
      if (!placed && part) {
        const c = cellAt(part.x, part.y);
        if (c >= 0) cells.add(c);
      }
      for (const c of cells) q[node(li, c)] += s.watts / cells.size;
      return { ref: s.ref, watts: s.watts, li, cells: [...cells], back, placed };
    });

  const m = laplacian(n, ea, eb, eg, ground);
  const sol = solveSpd(m, q, 1e-8, 400);
  const rise = sol.x;

  // results
  const layers: ThermalLayerMap[] = d.copper.map((layer, li) => {
    const temp = new Float32Array(nx * ny).fill(NaN);
    for (let k = 0; k < temp.length; k++) if (cellOf[k] >= 0) temp[k] = req.ambientC + rise[node(li, cellOf[k])];
    return { layer, x0: bx0, y0: by0, res, nx, ny, temp };
  });
  let hot = { c: -Infinity, x: 0, y: 0, layer: d.copper[0] };
  layers.forEach((m2) => {
    for (let k = 0; k < m2.temp.length; k++)
      if (m2.temp[k] > hot.c) hot = { c: m2.temp[k], x: bx0 + (k % nx) * res, y: by0 + Math.floor(k / nx) * res, layer: m2.layer };
  });
  let balanceW = 0;
  for (let i = 0; i < n; i++) balanceW += ground[i] * rise[i];
  return {
    ok: true,
    res,
    nodes: n,
    iterations: sol.iterations,
    layers,
    parts: parts.map((p) => {
      const ts = p.cells.map((c) => req.ambientC + rise[node(p.li, c)]);
      return { ref: p.ref, watts: p.watts, back: p.back, placed: p.placed, meanC: ts.length ? ts.reduce((a, b) => a + b, 0) / ts.length : NaN, maxC: ts.length ? Math.max(...ts) : NaN };
    }),
    hottest: hot,
    meanRise: faces.dT,
    hTop: faces.hTop,
    hBottom: faces.hBottom,
    hRad: faces.hRad,
    powerW,
    boardAreaMm2: boardArea,
    balanceW,
    outlineUsed,
  };
}

/** Heat sources in the page address: "U3:1.2:12" (W, and ψJB in °C/W when given). */
export function decodeSources(s: string): { ref: string; watts: number; psi?: number }[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const [ref, w, psi] = x.split(':');
      return { ref, watts: Number(w), psi: psi !== undefined && psi !== '' ? Number(psi) : undefined };
    })
    .filter((v) => v.ref && Number.isFinite(v.watts) && v.watts >= 0 && (v.psi === undefined || (Number.isFinite(v.psi) && v.psi >= 0)));
}
export const encodeSources = (list: { ref: string; watts: number; psi?: number }[]) =>
  list.map((v) => `${v.ref}:${+v.watts.toPrecision(6)}${v.psi !== undefined ? `:${+v.psi.toPrecision(6)}` : ''}`).join(',');
