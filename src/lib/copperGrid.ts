// The copper areas of one layer as a grid of square cells for a resistive solve (kicadPower.ts).
//
// Each cell holds the part of it that is copper (cell coverage); neighbouring cells are joined by the sheet
// conductance times the smaller coverage, which is exact for a strip of copper along the grid and keeps a
// neck or a thermal spoke narrower than a cell at its own resistance. Around chosen areas (the pads current is
// forced through) the cells are split f × f into fine cells, so the copper there, whose features can be
// a tenth of a millimetre, is resolved without a fine grid over the whole board. A fine cell next to a
// coarse one is joined across the shared face: h wide, (H + h)/2 long.

/** Polygon edges of one layer bucketed by bands of y, for scanlines at any y. */
class EdgeIndex {
  private ax: number[] = [];
  private ay: number[] = [];
  private bx: number[] = [];
  private by: number[] = [];
  private poly: number[] = [];
  private start: Int32Array;
  private items: Int32Array;
  private y0: number;
  private band: number;
  private nb: number;

  constructor(polys: ArrayLike<number>[], y0: number, y1: number, band: number) {
    this.y0 = y0;
    this.band = band;
    this.nb = Math.max(1, Math.ceil((y1 - y0) / band) + 1);
    polys.forEach((xy, p) => {
      const n = xy.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        if (xy[2 * i + 1] === xy[2 * j + 1]) continue;
        this.ax.push(xy[2 * i]);
        this.ay.push(xy[2 * i + 1]);
        this.bx.push(xy[2 * j]);
        this.by.push(xy[2 * j + 1]);
        this.poly.push(p);
      }
    });
    const bandOf = (y: number) => Math.min(this.nb - 1, Math.max(0, Math.floor((y - y0) / band)));
    const count = new Int32Array(this.nb + 1);
    const span = (e: number) => [bandOf(Math.min(this.ay[e], this.by[e])), bandOf(Math.max(this.ay[e], this.by[e]))];
    for (let e = 0; e < this.ax.length; e++) {
      const [b0, b1] = span(e);
      for (let b = b0; b <= b1; b++) count[b + 1]++;
    }
    for (let b = 0; b < this.nb; b++) count[b + 1] += count[b];
    this.start = count;
    this.items = new Int32Array(count[this.nb]);
    const pos = count.slice(0, this.nb);
    for (let e = 0; e < this.ax.length; e++) {
      const [b0, b1] = span(e);
      for (let b = b0; b <= b1; b++) this.items[pos[b]++] = e;
    }
  }

  /** Where the line y = yc crosses the edges: polygon index and x, appended to the two lists. */
  cross(yc: number, polys: number[], xs: number[]) {
    const b = Math.floor((yc - this.y0) / this.band);
    if (b < 0 || b >= this.nb) return;
    for (let k = this.start[b]; k < this.start[b + 1]; k++) {
      const e = this.items[k];
      const ay = this.ay[e];
      const by = this.by[e];
      if ((yc < ay) === (yc < by)) continue;
      polys.push(this.poly[e]);
      xs.push(this.ax[e] + ((yc - ay) * (this.bx[e] - this.ax[e])) / (by - ay));
    }
  }
}

const SUB = 4; // scanlines per cell row

/** Add to each cell of a grid (cell (c, r) centred on (x0 + c·res, y0 + r·res)) the part the polygons cover. */
function cover(idx: EdgeIndex, cov: Float32Array, nx: number, ny: number, x0: number, y0: number, res: number) {
  const polys: number[] = [];
  const xs: number[] = [];
  const order: number[] = [];
  const add = (row: number, fa: number, fb: number) => {
    fa = Math.max(0, fa);
    fb = Math.min(nx, fb);
    if (fb <= fa) return;
    const ca = Math.floor(fa);
    const cb = Math.min(nx - 1, Math.floor(fb));
    if (ca === cb) {
      cov[row + ca] += (fb - fa) / SUB;
      return;
    }
    cov[row + ca] += (ca + 1 - fa) / SUB;
    for (let c = ca + 1; c < cb; c++) cov[row + c] += 1 / SUB;
    cov[row + cb] += (fb - cb) / SUB;
  };
  for (let r = 0; r < ny; r++)
    for (let q = 0; q < SUB; q++) {
      polys.length = 0;
      xs.length = 0;
      idx.cross(y0 + (r - 0.5 + (q + 0.5) / SUB) * res, polys, xs);
      if (xs.length < 2) continue;
      order.length = 0;
      for (let i = 0; i < xs.length; i++) order.push(i);
      order.sort((a, b) => polys[a] - polys[b] || xs[a] - xs[b]);
      // even-odd within each polygon; overlapping polygons add up (clamped by the caller)
      for (let k = 0; k + 1 < order.length; ) {
        if (polys[order[k]] !== polys[order[k + 1]]) {
          k++;
          continue;
        }
        add(r * nx, (xs[order[k]] - x0) / res + 0.5, (xs[order[k + 1]] - x0) / res + 0.5);
        k += 2;
      }
    }
  for (let i = 0; i < cov.length; i++) if (cov[i] > 1) cov[i] = 1;
}

export interface CopperGrid {
  layer: string;
  x0: number; // centre of cell (0, 0)
  y0: number;
  res: number;
  nx: number;
  ny: number;
  node: Int32Array; // node per coarse cell, −1 where there is no copper or the cell is split
  cov: Float32Array;
  f: number; // fine cells per coarse cell side (1: none)
  h: number; // fine cell size
  fine: Int32Array; // per coarse cell: first of its f² fine cells, −1 where not split
  fNode: Int32Array;
  fCov: Float32Array;
}

const MIN_COVER = 0.02; // a sliver of copper below this part of a cell is left out

/**
 * The grid of one layer. `refine` are the areas whose cells are split (x0, y0, x1, y1); `maxFine` caps the
 * number of fine cells (f is lowered to stay under it). Nodes are numbered from `first`.
 */
export function buildGrid(
  layer: string,
  polys: ArrayLike<number>[],
  res: number,
  refine: [number, number, number, number][],
  fineRes: number,
  maxFine: number,
  first: number,
): { grid: CopperGrid; next: number } | null {
  let bx0 = Infinity;
  let by0 = Infinity;
  let bx1 = -Infinity;
  let by1 = -Infinity;
  for (const xy of polys)
    for (let i = 0; i < xy.length; i += 2) {
      bx0 = Math.min(bx0, xy[i]);
      by0 = Math.min(by0, xy[i + 1]);
      bx1 = Math.max(bx1, xy[i]);
      by1 = Math.max(by1, xy[i + 1]);
    }
  if (!Number.isFinite(bx0)) return null;
  const nx = Math.max(1, Math.ceil((bx1 - bx0) / res) + 1);
  const ny = Math.max(1, Math.ceil((by1 - by0) / res) + 1);
  const idx = new EdgeIndex(polys, by0 - res, by1 + res, res);
  const cov = new Float32Array(nx * ny);
  cover(idx, cov, nx, ny, bx0, by0, res);

  // the cells to split
  const cellsIn = (b: [number, number, number, number]) => [
    Math.max(0, Math.floor((b[0] - bx0) / res + 0.5)),
    Math.max(0, Math.floor((b[1] - by0) / res + 0.5)),
    Math.min(nx - 1, Math.floor((b[2] - bx0) / res + 0.5)),
    Math.min(ny - 1, Math.floor((b[3] - by0) / res + 0.5)),
  ];
  const split = new Uint8Array(nx * ny);
  let nSplit = 0;
  for (const b of refine) {
    const [c0, r0, c1, r1] = cellsIn(b);
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c < c1 + 1; c++)
        if (!split[r * nx + c] && cov[r * nx + c] > 0) {
          split[r * nx + c] = 1;
          nSplit++;
        }
  }
  let f = Math.round(res / fineRes);
  if (nSplit) f = Math.min(f, Math.floor(Math.sqrt(maxFine / nSplit)));
  if (f < 2) {
    f = 1;
    split.fill(0);
    nSplit = 0;
  }
  const h = res / f;
  const fine = new Int32Array(nx * ny).fill(-1);
  let q = 0;
  for (let k = 0; k < split.length; k++) if (split[k]) (fine[k] = q), (q += f * f);
  const fCov = new Float32Array(q);
  if (nSplit) {
    for (const b of refine) {
      const [c0, r0, c1, r1] = cellsIn(b);
      const fnx = (c1 - c0 + 1) * f;
      const fny = (r1 - r0 + 1) * f;
      if (fnx <= 0 || fny <= 0) continue;
      const sub = new Float32Array(fnx * fny);
      cover(idx, sub, fnx, fny, bx0 + (c0 - 0.5) * res + h / 2, by0 + (r0 - 0.5) * res + h / 2, h);
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) {
          const base = fine[r * nx + c];
          if (base < 0) continue;
          for (let sy = 0; sy < f; sy++)
            for (let sx = 0; sx < f; sx++) fCov[base + sy * f + sx] = sub[((r - r0) * f + sy) * fnx + (c - c0) * f + sx];
        }
    }
  }
  let next = first;
  const node = new Int32Array(nx * ny).fill(-1);
  for (let k = 0; k < cov.length; k++) if (!split[k] && cov[k] > MIN_COVER) node[k] = next++;
  const fNode = new Int32Array(q).fill(-1);
  for (let i = 0; i < q; i++) if (fCov[i] > MIN_COVER) fNode[i] = next++;
  return { grid: { layer, x0: bx0, y0: by0, res, nx, ny, node, cov, f, h, fine, fNode, fCov }, next };
}

/** The node of the cell at a point, −1 where there is no copper. */
export function cellAt(g: CopperGrid, x: number, y: number): number {
  const u = (x - g.x0) / g.res + 0.5;
  const v = (y - g.y0) / g.res + 0.5;
  const c = Math.floor(u);
  const r = Math.floor(v);
  if (c < 0 || r < 0 || c >= g.nx || r >= g.ny) return -1;
  const k = r * g.nx + c;
  if (g.fine[k] < 0) return g.node[k];
  const sx = Math.min(g.f - 1, Math.floor((u - c) * g.f));
  const sy = Math.min(g.f - 1, Math.floor((v - r) * g.f));
  return g.fNode[g.fine[k] + sy * g.f + sx];
}

/** Every pair of neighbouring copper cells with its conductance (sheet: conductance of a square, S). */
export function gridEdges(g: CopperGrid, sheet: number, edge: (a: number, b: number, s: number) => void) {
  const { nx, ny, node, cov, f, fine, fNode, fCov } = g;
  const across = (g.h / ((g.res + g.h) / 2)) * sheet; // a fine cell's face onto a coarse cell
  // a fine cell of split cell k at (sx, sy), or −1
  const fn = (k: number, sx: number, sy: number) => fNode[fine[k] + sy * f + sx];
  const fc = (k: number, sx: number, sy: number) => fCov[fine[k] + sy * f + sx];
  for (let r = 0; r < ny; r++)
    for (let c = 0; c < nx; c++) {
      const k = r * nx + c;
      if (fine[k] < 0) {
        const a = node[k];
        if (a < 0) continue;
        if (c + 1 < nx && fine[k + 1] < 0 && node[k + 1] >= 0) edge(a, node[k + 1], sheet * Math.min(cov[k], cov[k + 1]));
        if (r + 1 < ny && fine[k + nx] < 0 && node[k + nx] >= 0) edge(a, node[k + nx], sheet * Math.min(cov[k], cov[k + nx]));
        continue;
      }
      for (let sy = 0; sy < f; sy++)
        for (let sx = 0; sx < f; sx++) {
          const a = fn(k, sx, sy);
          if (a < 0) continue;
          const ca = fc(k, sx, sy);
          // right
          if (sx + 1 < f) {
            const b = fn(k, sx + 1, sy);
            if (b >= 0) edge(a, b, sheet * Math.min(ca, fc(k, sx + 1, sy)));
          } else if (c + 1 < nx) {
            if (fine[k + 1] >= 0) {
              const b = fn(k + 1, 0, sy);
              if (b >= 0) edge(a, b, sheet * Math.min(ca, fc(k + 1, 0, sy)));
            } else if (node[k + 1] >= 0) edge(a, node[k + 1], across * Math.min(ca, cov[k + 1]));
          }
          // down
          if (sy + 1 < f) {
            const b = fn(k, sx, sy + 1);
            if (b >= 0) edge(a, b, sheet * Math.min(ca, fc(k, sx, sy + 1)));
          } else if (r + 1 < ny) {
            if (fine[k + nx] >= 0) {
              const b = fn(k + nx, sx, 0);
              if (b >= 0) edge(a, b, sheet * Math.min(ca, fc(k + nx, sx, 0)));
            } else if (node[k + nx] >= 0) edge(a, node[k + nx], across * Math.min(ca, cov[k + nx]));
          }
          // left and up onto coarse cells (fine neighbours there are joined from their own side)
          if (sx === 0 && c > 0 && fine[k - 1] < 0 && node[k - 1] >= 0) edge(a, node[k - 1], across * Math.min(ca, cov[k - 1]));
          if (sy === 0 && r > 0 && fine[k - nx] < 0 && node[k - nx] >= 0) edge(a, node[k - nx], across * Math.min(ca, cov[k - nx]));
        }
    }
}

/** The copper cells whose centre passes `inside`, within a box; sampled at the finest cell size there. */
export function cellsInBox(g: CopperGrid, x0: number, y0: number, x1: number, y1: number, inside: (x: number, y: number) => boolean, out: Set<number>) {
  const step = g.f > 1 ? g.h : g.res;
  const n = Math.ceil((x1 - x0) / step) * Math.ceil((y1 - y0) / step);
  const s = n > 4e5 ? step * Math.sqrt(n / 4e5) : step; // a huge pad: coarser sampling is enough
  for (let y = y0 + s / 2; y <= y1; y += s)
    for (let x = x0 + s / 2; x <= x1; x += s) {
      if (!inside(x, y)) continue;
      const node = cellAt(g, x, y);
      if (node >= 0) out.add(node);
    }
}
