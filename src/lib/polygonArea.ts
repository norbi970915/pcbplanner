// Exact area of boolean combinations of polygons (zone outlines, board outlines, cut-outs).
//
// A sweep cuts the plane into horizontal strips at every vertex and at every crossing of two edges.
// Inside such a strip no edge ends and no two edges cross, so the covered length is a linear function
// of y and its value at mid-height times the strip height is the strip's area, without a grid and
// without a resolution to choose.

export type Pt = [number, number];
export type Box = [number, number, number, number]; // x0, y0, x1, y1

/**
 * Area (mm²) and bounding box of the set where `inside` holds. `shapes` are ring sets, each filled
 * even-odd; `inside` receives, for every shape, 1 where the point is inside it and 0 where not. The
 * sweep is exact for polygons: strips are cut at every vertex and edge crossing, so the covered length
 * is linear in y within each strip and the mid-height value gives the strip's area exactly.
 */
export function sweepArea(shapes: Pt[][][], inside: (odd: Uint8Array) => boolean): { area: number; bbox: Box | null } {
  const ex0: number[] = [], ey0: number[] = [], ey1: number[] = [], eslope: number[] = [], eshape: number[] = [];
  const yset: number[] = [];
  shapes.forEach((rings, s) => {
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i];
        const q = ring[(i + 1) % ring.length];
        yset.push(p[1]);
        if (p[1] === q[1]) continue;
        const [a, b] = p[1] < q[1] ? [p, q] : [q, p];
        ex0.push(a[0]);
        ey0.push(a[1]);
        ey1.push(b[1]);
        eslope.push((b[0] - a[0]) / (b[1] - a[1]));
        eshape.push(s);
      }
    }
  });
  const ne = ex0.length;
  if (!ne) return { area: 0, bbox: null };
  const ys = Float64Array.from(yset).sort();
  const order = Array.from({ length: ne }, (_, i) => i).sort((a, b) => ey0[a] - ey0[b]);
  const xAt = (e: number, y: number) => ex0[e] + (y - ey0[e]) * eslope[e];
  const odd = new Uint8Array(shapes.length);
  let area = 0;
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  let active: number[] = [];
  let next = 0;
  for (let k = 0; k + 1 < ys.length; k++) {
    const y0 = ys[k], y1 = ys[k + 1];
    if (!(y1 > y0)) continue;
    active = active.filter((e) => ey1[e] > y0);
    while (next < ne && ey0[order[next]] <= y0) {
      if (ey1[order[next]] > y0) active.push(order[next]);
      next++;
    }
    if (!active.length) continue;
    // crossings inside the strip: where two edges change order between the bottom and the top
    const na = active.length;
    const xb = active.map((e) => xAt(e, y0));
    const xt = active.map((e) => xAt(e, y1));
    const byBottom = Array.from({ length: na }, (_, i) => i).sort((a, b) => xb[a] - xb[b] || xt[a] - xt[b]);
    const cuts: number[] = [0, 1];
    if (byBottom.some((v, i) => i > 0 && xt[v] < xt[byBottom[i - 1]])) {
      for (let i = 0; i < na; i++)
        for (let j = i + 1; j < na; j++) {
          const d0 = xb[i] - xb[j], d1 = xt[i] - xt[j];
          if ((d0 < 0 && d1 > 0) || (d0 > 0 && d1 < 0)) cuts.push(d0 / (d0 - d1));
        }
      cuts.sort((a, b) => a - b);
    }
    for (let c = 0; c + 1 < cuts.length; c++) {
      const ya = y0 + (y1 - y0) * cuts[c], yb = y0 + (y1 - y0) * cuts[c + 1];
      const h = yb - ya;
      if (!(h > 0)) continue;
      const ym = (ya + yb) / 2;
      const xm = active.map((e) => xAt(e, ym));
      const idx = Array.from({ length: na }, (_, i) => i).sort((a, b) => xm[a] - xm[b]);
      odd.fill(0);
      let len = 0;
      for (let i = 0; i < na; i++) {
        const e = active[idx[i]];
        odd[eshape[e]] ^= 1;
        if (i + 1 === na) break;
        const w = xm[idx[i + 1]] - xm[idx[i]];
        if (w > 0 && inside(odd)) {
          len += w;
          const f = active[idx[i + 1]];
          bx0 = Math.min(bx0, xAt(e, ya), xAt(e, yb));
          bx1 = Math.max(bx1, xAt(f, ya), xAt(f, yb));
          by0 = Math.min(by0, ya);
          by1 = Math.max(by1, yb);
        }
      }
      area += len * h;
    }
  }
  return { area, bbox: area > 0 ? [bx0, by0, bx1, by1] : null };
}

/** Area of the intersection of regions; each region is a union of shapes, each shape a ring set filled even-odd. */
export function intersectionArea(regions: Pt[][][][]): { area: number; bbox: Box | null } {
  const shapes: Pt[][][] = [];
  const groups = regions.map((r) => r.map((s) => shapes.push(s) - 1));
  return sweepArea(shapes, (odd) => groups.every((g) => g.some((i) => odd[i])));
}

/** Area of one polygon (shoelace), for checks. */
export function shoelace(p: Pt[]): number {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]);
  return Math.abs(a / 2);
}
