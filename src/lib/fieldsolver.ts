// 2D electrostatic field solver for PCB transmission-line cross-sections.
//
// Method: finite-volume discretisation of ∇·(ε∇φ) = 0 on a graded rectilinear
// mesh, solved with Jacobi-preconditioned conjugate gradients. Capacitance per
// unit length comes from the stored field energy (C = 2W/V²), which is
// variational and therefore more accurate than integrating surface charge.
// Z0 = 1 / (c·√(C·C_air)),  εeff = C / C_air.
//
// The structure is always symmetric about x = 0, so only the right half is
// solved: a Neumann (magnetic-wall) boundary gives the single-ended / even
// mode, a Dirichlet (electric-wall) boundary gives the odd mode.
//
// All lengths are in millimetres. The bottom ground plane is y = 0.
import { ETA0 } from './units';

export interface Slab {
  y0: number;
  y1: number;
  er: number;
}

export interface Geometry {
  w: number; // trace bottom width
  wTop?: number; // trace top width (trapezoidal etch); defaults to w
  t: number; // trace thickness
  yTrace: number; // height of the trace bottom above the bottom ground plane
  diff: boolean;
  s?: number; // edge-to-edge spacing of a differential pair
  slabs: Slab[]; // dielectric slabs; everything else is air (εr = 1)
  topPlane?: number; // y of a top ground plane (stripline); undefined = open above
  mask?: { surfaceY: number; overSubstrate: number; overTrace: number; er: number };
  coplanarGap?: number; // coplanar ground on the trace layer, gap from the trace edge
}

export type Accuracy = 'fast' | 'normal' | 'high';

/**
 * Share of the stored field energy per dielectric region, normalised to the air-filled
 * line: εeff = air + Σ slabs[i]·εr,i + mask·εr,mask (an exact identity of the solution).
 * Gives the effective loss tangent Σ εr,i·tanδi·p_i / εeff and, to first order, how εeff
 * moves when the εr of a region changes with frequency.
 */
export interface EnergyParts {
  air: number;
  slabs: number[];
  mask: number;
}

export interface ModeResult {
  z: number;
  eeff: number;
  parts?: EnergyParts;
}

export interface FieldMap {
  x: number[];
  y: number[];
  phi: number[];
  nx: number;
  ny: number;
  mode: 'se' | 'odd';
  xHalf: boolean;
}

export interface SolveResult {
  se?: ModeResult;
  odd?: ModeResult;
  even?: ModeResult;
  zdiff?: number;
  zcomm?: number;
  field?: FieldMap;
  nodes: number;
  iterations: number;
}

const ACC = {
  fast: { n: 4, growth: 1.35 },
  normal: { n: 7, growth: 1.2 },
  high: { n: 12, growth: 1.1 },
} as const;

type Key = [pos: number, fine: number];

/** Mesh limits: keep every solve interactive and never let absurd inputs freeze the page. */
const MAX_LINES = 4000;
const MAX_NODES = 400_000;
const TOO_LARGE = 'The geometry spans too large a range of sizes to mesh (e.g. a spacing or height thousands of times the trace thickness). Check the inputs.';

/** Build a graded 1-D mesh that contains every key position. */
export function gradedMesh(keys: Key[], growth: number, maxCell: number): number[] {
  const sorted = [...keys].sort((a, b) => a[0] - b[0]);
  const k: Key[] = [];
  for (const key of sorted) {
    const last = k[k.length - 1];
    if (last && Math.abs(key[0] - last[0]) < 1e-9) last[1] = Math.min(last[1], key[1]);
    else k.push([key[0], key[1]]);
  }
  const out = [k[0][0]];
  for (let n = 0; n < k.length - 1; n++) {
    const [a, fa] = k[n];
    const [b, fb] = k[n + 1];
    const left: number[] = [];
    const right: number[] = [];
    let xl = a;
    let xr = b;
    let sl = Math.min(fa, maxCell);
    let sr = Math.min(fb, maxCell);
    while (xr - xl > sl + sr) {
      if (left.length + right.length + out.length > MAX_LINES) throw new GeometryError(TOO_LARGE);
      if (sl <= sr) {
        xl += sl;
        left.push(xl);
        sl = Math.min(sl * growth, maxCell);
      } else {
        xr -= sr;
        right.push(xr);
        sr = Math.min(sr * growth, maxCell);
      }
    }
    const gap = xr - xl;
    if (gap > Math.max(sl, sr)) left.push(xl + gap / 2);
    else if (gap < 0.3 * Math.min(sl, sr)) {
      if (right.length) right.pop();
      else if (left.length) left.pop();
    }
    out.push(...left, ...right.reverse(), b);
  }
  return out;
}

interface Mesh {
  x: number[];
  y: number[];
  nx: number;
  ny: number;
  cellEr: Float64Array; // (nx-1)*(ny-1)
  cellRegion: Int16Array; // per cell: -1 air, slab index, or slabs.length for the solder mask
  cond: Int8Array; // per node: 0 free, 1 trace (V), 2 grounded conductor
}

function buildMesh(g: Geometry, acc: Accuracy): Mesh {
  const { n: N, growth } = ACC[acc];
  const w = g.w;
  const wTop = g.wTop ?? g.w;
  const t = g.t;
  const s = g.diff ? g.s ?? 0 : 0;
  const yb = g.yTrace;
  const ytop = g.yTrace + t;
  const hBelow = yb;
  const hAbove = g.topPlane !== undefined ? g.topPlane - ytop : Infinity;
  const hRef = Math.min(hBelow, hAbove);

  const x0 = g.diff ? s / 2 : 0; // trace left edge (half domain)
  const x1 = g.diff ? s / 2 + w : w / 2; // trace right edge
  const dt = (w - wTop) / 2;
  const xt0 = g.diff ? x0 + dt : 0;
  const xt1 = x1 - dt;

  const feat = [t, g.diff ? w : w / 2, hRef];
  if (g.diff && s > 0) feat.push(s / 2);
  if (g.coplanarGap) feat.push(g.coplanarGap);
  if (g.mask) feat.push(g.mask.overSubstrate, g.mask.overTrace);
  const fine = Math.max(Math.min(...feat.filter((v) => v > 0)) / N, 1e-5);

  const open = g.topPlane === undefined;
  const span = open ? Math.max(20 * hRef, 2 * w) : 8 * (g.topPlane as number);
  const X = x1 + (g.coplanarGap ? g.coplanarGap : 0) + span;
  const surface = Math.max(ytop, ...g.slabs.map((sl) => sl.y1), g.mask ? g.mask.surfaceY + g.mask.overSubstrate : 0);
  const Y = open ? surface + Math.max(20 * hRef, 2 * w) : (g.topPlane as number);
  // Far from edges the field varies on the scale of the dielectric height, so
  // cells may grow to that size along x; along y the planes must stay resolved.
  const maxCellX = Math.max(fine * 2, open ? Math.min(X, Y) / 10 : Y / 2);
  const maxCellY = Math.max(fine * 2, open ? Math.min(X, Y) / 10 : Y / 8);
  const maxCell = maxCellX;

  const xKeys: Key[] = [
    [0, fine],
    [x0, fine],
    [x1, fine],
    [xt0, fine],
    [xt1, fine],
    [X, maxCell],
  ];
  if (g.coplanarGap) xKeys.push([x1 + g.coplanarGap, fine]);
  const yKeys: Key[] = [
    [0, fine * 2],
    [yb, fine],
    [ytop, fine],
    [Y, open ? maxCellY : fine * 2],
  ];
  for (const sl of g.slabs) yKeys.push([sl.y0, fine * 2], [sl.y1, fine * 2]);
  if (g.mask) {
    yKeys.push([g.mask.surfaceY + g.mask.overSubstrate, fine]);
    yKeys.push([ytop + g.mask.overTrace, fine]);
  }
  const x = gradedMesh(xKeys.filter((k) => k[0] >= 0 && k[0] <= X), growth, maxCell);
  const y = gradedMesh(yKeys.filter((k) => k[0] >= 0 && k[0] <= Y), growth, maxCellY);
  const nx = x.length;
  const ny = y.length;
  if (nx * ny > MAX_NODES) throw new GeometryError(TOO_LARGE);

  const eps = 1e-9;
  const xg = g.coplanarGap ? x1 + g.coplanarGap : Infinity;

  // conductors (node classification)
  const cond = new Int8Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    const yy = y[j];
    if (yy < yb - eps || yy > ytop + eps) continue;
    const f = t > 0 ? (yy - yb) / t : 0;
    const left = g.diff ? x0 + dt * f : 0;
    const right = x1 - dt * f;
    for (let i = 0; i < nx; i++) {
      const xx = x[i];
      if (xx >= left - eps && xx <= right + eps) cond[j * nx + i] = 1;
      else if (xx >= xg - eps) cond[j * nx + i] = 2;
    }
  }

  // cell permittivities
  const cellEr = new Float64Array((nx - 1) * (ny - 1));
  const cellRegion = new Int16Array((nx - 1) * (ny - 1));
  const mask = g.mask;
  const inCopperBox = (xc: number, yc: number, pad: number) =>
    (yc >= yb - pad && yc <= ytop + pad && xc >= (g.diff ? x0 : -Infinity) - pad && xc <= x1 + pad) ||
    (yc >= yb - pad && yc <= ytop + pad && xc >= xg - pad);
  for (let j = 0; j < ny - 1; j++) {
    const yc = (y[j] + y[j + 1]) / 2;
    let slabEr = 1;
    let slabIdx = -1;
    for (let s = 0; s < g.slabs.length; s++) {
      const sl = g.slabs[s];
      if (yc >= sl.y0 && yc < sl.y1) {
        slabEr = sl.er;
        slabIdx = s;
        break;
      }
    }
    for (let i = 0; i < nx - 1; i++) {
      const xc = (x[i] + x[i + 1]) / 2;
      let er = slabEr;
      let region = slabIdx;
      if (mask && slabIdx < 0 && yc >= mask.surfaceY) {
        if (yc <= mask.surfaceY + mask.overSubstrate || inCopperBox(xc, yc, mask.overTrace)) {
          er = mask.er;
          region = g.slabs.length;
        }
      }
      cellEr[j * (nx - 1) + i] = er;
      cellRegion[j * (nx - 1) + i] = region;
    }
  }
  return { x, y, nx, ny, cellEr, cellRegion, cond };
}

interface Coeffs {
  aE: Float64Array;
  aN: Float64Array;
}

function coefficients(m: Mesh, air: boolean): Coeffs {
  const { x, y, nx, ny, cellEr } = m;
  const aE = new Float64Array(nx * ny);
  const aN = new Float64Array(nx * ny);
  const er = (i: number, j: number) => (air ? 1 : cellEr[j * (nx - 1) + i]);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx - 1; i++) {
      let s = 0;
      if (j > 0) s += (er(i, j - 1) * (y[j] - y[j - 1])) / 2;
      if (j < ny - 1) s += (er(i, j) * (y[j + 1] - y[j])) / 2;
      aE[j * nx + i] = s / (x[i + 1] - x[i]);
    }
  }
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx; i++) {
      let s = 0;
      if (i > 0) s += (er(i - 1, j) * (x[i] - x[i - 1])) / 2;
      if (i < nx - 1) s += (er(i, j) * (x[i + 1] - x[i])) / 2;
      aN[j * nx + i] = s / (y[j + 1] - y[j]);
    }
  }
  return { aE, aN };
}

/** Solve with fixed potentials; returns φ and the iteration count. */
function solveLaplace(m: Mesh, c: Coeffs, fixed: Uint8Array, phi: Float64Array, tol = 1e-10, maxIt = 50000) {
  const { nx, ny } = m;
  const { aE, aN } = c;
  const n = nx * ny;
  const diag = new Float64Array(n);
  const b = new Float64Array(n);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      let d = 0;
      let rhs = 0;
      if (i < nx - 1) {
        d += aE[k];
        if (fixed[k + 1]) rhs += aE[k] * phi[k + 1];
      }
      if (i > 0) {
        d += aE[k - 1];
        if (fixed[k - 1]) rhs += aE[k - 1] * phi[k - 1];
      }
      if (j < ny - 1) {
        d += aN[k];
        if (fixed[k + nx]) rhs += aN[k] * phi[k + nx];
      }
      if (j > 0) {
        d += aN[k - nx];
        if (fixed[k - nx]) rhs += aN[k - nx] * phi[k - nx];
      }
      diag[k] = d;
      b[k] = fixed[k] ? 0 : rhs;
    }
  }
  const matvec = (p: Float64Array, out: Float64Array) => {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (fixed[k]) {
          out[k] = 0;
          continue;
        }
        let v = diag[k] * p[k];
        if (i < nx - 1 && !fixed[k + 1]) v -= aE[k] * p[k + 1];
        if (i > 0 && !fixed[k - 1]) v -= aE[k - 1] * p[k - 1];
        if (j < ny - 1 && !fixed[k + nx]) v -= aN[k] * p[k + nx];
        if (j > 0 && !fixed[k - nx]) v -= aN[k - nx] * p[k - nx];
        out[k] = v;
      }
    }
  };
  // x = free part of phi (initial guess may be non-zero)
  const xv = new Float64Array(n);
  for (let k = 0; k < n; k++) if (!fixed[k]) xv[k] = phi[k];
  const r = new Float64Array(n);
  const Ap = new Float64Array(n);
  matvec(xv, Ap);
  let bnorm = 0;
  for (let k = 0; k < n; k++) {
    r[k] = fixed[k] ? 0 : b[k] - Ap[k];
    bnorm += b[k] * b[k];
  }
  bnorm = Math.sqrt(bnorm) || 1;
  const z = new Float64Array(n);
  const p = new Float64Array(n);
  let rz = 0;
  for (let k = 0; k < n; k++) {
    if (fixed[k]) continue;
    z[k] = r[k] / diag[k];
    p[k] = z[k];
    rz += r[k] * z[k];
  }
  let it = 0;
  for (; it < maxIt; it++) {
    matvec(p, Ap);
    let pAp = 0;
    for (let k = 0; k < n; k++) pAp += p[k] * Ap[k];
    if (pAp <= 0) break;
    const alpha = rz / pAp;
    let rr = 0;
    for (let k = 0; k < n; k++) {
      if (fixed[k]) continue;
      xv[k] += alpha * p[k];
      r[k] -= alpha * Ap[k];
      rr += r[k] * r[k];
    }
    if (Math.sqrt(rr) / bnorm < tol) {
      it++;
      break;
    }
    let rzNew = 0;
    for (let k = 0; k < n; k++) {
      if (fixed[k]) continue;
      z[k] = r[k] / diag[k];
      rzNew += r[k] * z[k];
    }
    const beta = rzNew / rz;
    rz = rzNew;
    for (let k = 0; k < n; k++) if (!fixed[k]) p[k] = z[k] + beta * p[k];
  }
  for (let k = 0; k < n; k++) if (!fixed[k]) phi[k] = xv[k];
  return it;
}

/** Σ a·Δφ² over all mesh edges (= 2·energy/ε0 for the half domain). */
function energySum(m: Mesh, c: Coeffs, phi: Float64Array): number {
  const { nx, ny } = m;
  let s = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const k = j * nx + i;
      const d = phi[k] - phi[k + 1];
      s += c.aE[k] * d * d;
    }
  }
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const d = phi[k] - phi[k + nx];
      s += c.aN[k] * d * d;
    }
  }
  return s;
}

/**
 * Split the dielectric energy sum by region. Each edge coefficient is the sum of the
 * halves of its neighbouring cells (see `coefficients`), so every cell owns an exact share:
 * Σ over regions of er·parts = energySum(cDiel).
 */
function regionSums(m: Mesh, phi: Float64Array, regions: number): { air: number; region: Float64Array } {
  const { x, y, nx, ny, cellRegion } = m;
  const region = new Float64Array(regions);
  let air = 0;
  for (let j = 0; j < ny - 1; j++) {
    const dy = y[j + 1] - y[j];
    for (let i = 0; i < nx - 1; i++) {
      const dx = x[i + 1] - x[i];
      const k = j * nx + i;
      const dS = phi[k] - phi[k + 1]; // bottom edge
      const dN = phi[k + nx] - phi[k + nx + 1]; // top edge
      const dW = phi[k] - phi[k + nx]; // left edge
      const dE = phi[k + 1] - phi[k + nx + 1]; // right edge
      const g = ((dy / 2 / dx) * (dS * dS + dN * dN) + (dx / 2 / dy) * (dW * dW + dE * dE));
      const r = cellRegion[j * (nx - 1) + i];
      if (r < 0) air += g;
      else region[r] += g;
    }
  }
  return { air, region };
}

function boundary(m: Mesh, odd: boolean) {
  const { nx, ny, cond } = m;
  const fixed = new Uint8Array(nx * ny);
  const phi = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (cond[k] === 1) {
        fixed[k] = 1;
        phi[k] = 1;
      } else if (cond[k] === 2 || j === 0 || j === ny - 1 || i === nx - 1 || (odd && i === 0)) {
        fixed[k] = 1;
        phi[k] = 0;
      }
    }
  }
  return { fixed, phi };
}

interface ModeRun {
  sDiel: number;
  sAir: number;
  phi: Float64Array;
  iterations: number;
}

function runMode(m: Mesh, cDiel: Coeffs, cAir: Coeffs, odd: boolean): ModeRun {
  const bd = boundary(m, odd);
  const it1 = solveLaplace(m, cDiel, bd.fixed, bd.phi);
  const sDiel = energySum(m, cDiel, bd.phi);
  const phiAir = Float64Array.from(bd.phi); // good initial guess
  const it2 = solveLaplace(m, cAir, bd.fixed, phiAir);
  const sAir = energySum(m, cAir, phiAir);
  return { sDiel, sAir, phi: bd.phi, iterations: it1 + it2 };
}

export interface SolveOptions {
  accuracy?: Accuracy;
  field?: boolean;
  even?: boolean; // for differential pairs: also solve the even mode (Zcomm)
  parts?: boolean; // energy share per dielectric region (for dielectric loss and dispersion)
}

export function solve(g: Geometry, opts: SolveOptions = {}): SolveResult {
  validate(g);
  const m = buildMesh(g, opts.accuracy ?? 'normal');
  const cDiel = coefficients(m, false);
  const cAir = coefficients(m, true);
  const res: SolveResult = { nodes: m.nx * m.ny, iterations: 0 };
  const field = (phi: Float64Array, mode: 'se' | 'odd'): FieldMap => ({
    x: m.x,
    y: m.y,
    phi: Array.from(phi),
    nx: m.nx,
    ny: m.ny,
    mode,
    xHalf: true,
  });
  const nReg = g.slabs.length + (g.mask ? 1 : 0);
  const parts = (r: ModeRun): EnergyParts | undefined => {
    if (!opts.parts) return undefined;
    const s = regionSums(m, r.phi, nReg);
    return {
      air: s.air / r.sAir,
      slabs: g.slabs.map((_, i) => s.region[i] / r.sAir),
      mask: g.mask ? s.region[g.slabs.length] / r.sAir : 0,
    };
  };

  if (!g.diff) {
    const r = runMode(m, cDiel, cAir, false);
    res.iterations += r.iterations;
    // half domain: S_full = 2·S_half, C = ε0·S_full  →  Z = η0 / (2·√(Sd·Sa))
    res.se = { z: ETA0 / (2 * Math.sqrt(r.sDiel * r.sAir)), eeff: r.sDiel / r.sAir, parts: parts(r) };
    if (opts.field) res.field = field(r.phi, 'se');
  } else {
    const o = runMode(m, cDiel, cAir, true);
    res.iterations += o.iterations;
    // per-line mode capacitance C = ε0·S_full/2 = ε0·S_half  →  Z = η0 / √(Sd·Sa)
    res.odd = { z: ETA0 / Math.sqrt(o.sDiel * o.sAir), eeff: o.sDiel / o.sAir, parts: parts(o) };
    res.zdiff = 2 * res.odd.z;
    if (opts.even !== false) {
      const e = runMode(m, cDiel, cAir, false);
      res.iterations += e.iterations;
      res.even = { z: ETA0 / Math.sqrt(e.sDiel * e.sAir), eeff: e.sDiel / e.sAir, parts: parts(e) };
      res.zcomm = res.even.z / 2;
    }
    if (opts.field) res.field = field(o.phi, 'odd');
  }
  return res;
}

export class GeometryError extends Error {}

function validate(g: Geometry) {
  const bad = (msg: string) => {
    throw new GeometryError(msg);
  };
  if (!(g.w > 0)) bad('Trace width must be greater than 0.');
  if (!(g.t > 0)) bad('Trace thickness must be greater than 0.');
  if (!(g.yTrace > 0)) bad('Dielectric height must be greater than 0.');
  if (g.wTop !== undefined && !(g.wTop > 0 && g.wTop <= g.w)) bad('Top width must be between 0 and the bottom width.');
  if (g.diff && !(g.s !== undefined && g.s > 0)) bad('Spacing must be greater than 0.');
  if (g.topPlane !== undefined && !(g.topPlane > g.yTrace + g.t)) bad('The top plane must be above the trace.');
  if (g.coplanarGap !== undefined && !(g.coplanarGap > 0)) bad('Coplanar gap must be greater than 0.');
  for (const s of g.slabs) if (!(s.er >= 1 && s.er <= 1000)) bad('Dielectric constant must be between 1 and 1000.');
  const dims = [g.w, g.t, g.yTrace, g.s, g.coplanarGap, g.topPlane, g.mask?.overSubstrate || undefined, g.mask?.overTrace || undefined].filter(
    (v): v is number => v !== undefined,
  );
  if (dims.some((v) => !Number.isFinite(v) || v > 1000)) bad('Dimensions must be finite and below 1000 mm.');
  if (Math.max(...dims) / Math.min(...dims) > 2e4) bad(TOO_LARGE);
}
