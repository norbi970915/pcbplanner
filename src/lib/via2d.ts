// 2D field solver for a differential via pair inside a reference plane.
//
// Cross-section perpendicular to the via axis: two round barrels (diameter d,
// centre pitch p) inside the plane clearance (antipad). Everything outside the
// antipad is plane metal at 0 V. The solution uses the two symmetry planes, so
// only one quadrant is meshed (uniform square grid):
//   y = 0 : mirror (Neumann); x = 0 : electric wall (odd mode) or mirror (even mode).
// Curved conductor boundaries are handled with the embedded-boundary method:
// a grid edge that crosses a boundary at fraction t of its length gets
// conductance 1/t to the boundary potential, which keeps the system symmetric
// and removes the staircase error.
// With a homogeneous dielectric Z = η0 / (k·S·√εr), where S is the field-energy
// sum over the quadrant (edges on a mirror line carry half weight).
import { ETA0 } from './units';

export type AntipadShape = 'round' | 'oblong';

export interface ViaPairGeom {
  d: number; // barrel outer diameter, mm
  pitch: number; // centre-to-centre spacing, mm
  antipad: number; // antipad diameter (round) or width of the oblong slot, mm
  shape: AntipadShape;
  er: number;
}

const FREE = 0;
const COND = 1; // conductor at 1 V
const GND = 2; // plane at 0 V

interface Problem {
  n: number;
  m: number;
  h: number;
  classify: (x: number, y: number) => number;
  oddWall: boolean; // x = 0 held at 0 V
}

/** Solve and return the quadrant energy sum S. */
function solve(pr: Problem): number {
  const { n, m, h, classify, oddWall } = pr;
  const N = n * m;
  const kind = new Uint8Array(N);
  const val = new Float64Array(N);
  for (let j = 0; j < m; j++)
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      let c = classify(i * h, j * h);
      if (c === FREE && (i === n - 1 || j === m - 1)) c = GND;
      if (c === FREE && oddWall && i === 0) c = 3; // wall node (exactly on the line)
      kind[k] = c;
      val[k] = c === COND ? 1 : 0;
    }
  // boundary crossing fraction from free node (x0,y0) toward (x1,y1)
  const frac = (x0: number, y0: number, x1: number, y1: number) => {
    let lo = 0;
    let hi = 1;
    for (let it = 0; it < 24; it++) {
      const mid = (lo + hi) / 2;
      if (classify(x0 + (x1 - x0) * mid, y0 + (y1 - y0) * mid) === FREE) lo = mid;
      else hi = mid;
    }
    return Math.max(0.05, (lo + hi) / 2);
  };
  // edge conductances (mirror lines: half weight)
  const gE = new Float64Array(N); // edge k — k+1
  const gN = new Float64Array(N); // edge k — k+n
  for (let j = 0; j < m; j++)
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      if (i < n - 1) {
        let g = j === 0 ? 0.5 : 1;
        const a = kind[k];
        const b = kind[k + 1];
        if ((a === FREE) !== (b === FREE)) {
          const fixedKind = a === FREE ? b : a;
          if (fixedKind === COND || fixedKind === GND) {
            const t = a === FREE ? frac(i * h, j * h, (i + 1) * h, j * h) : frac((i + 1) * h, j * h, i * h, j * h);
            if (classify(a === FREE ? (i + 1) * h : i * h, j * h) !== FREE) g /= t;
          }
        }
        gE[k] = g;
      }
      if (j < m - 1) {
        let g = i === 0 ? 0.5 : 1;
        const a = kind[k];
        const b = kind[k + n];
        if ((a === FREE) !== (b === FREE)) {
          const fixedKind = a === FREE ? b : a;
          if (fixedKind === COND || fixedKind === GND) {
            const t = a === FREE ? frac(i * h, j * h, i * h, (j + 1) * h) : frac(i * h, (j + 1) * h, i * h, j * h);
            if (classify(i * h, a === FREE ? (j + 1) * h : j * h) !== FREE) g /= t;
          }
        }
        gN[k] = g;
      }
    }

  const fixed = (k: number) => kind[k] !== FREE;
  const diag = new Float64Array(N);
  const b = new Float64Array(N);
  for (let j = 0; j < m; j++)
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      if (fixed(k)) continue;
      const nb: [number, number][] = [];
      if (i < n - 1) nb.push([k + 1, gE[k]]);
      if (i > 0) nb.push([k - 1, gE[k - 1]]);
      if (j < m - 1) nb.push([k + n, gN[k]]);
      if (j > 0) nb.push([k - n, gN[k - n]]);
      for (const [q, g] of nb) {
        diag[k] += g;
        if (fixed(q)) b[k] += g * val[q];
      }
    }
  const A = (p: Float64Array, out: Float64Array) => {
    for (let j = 0; j < m; j++)
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        if (fixed(k)) {
          out[k] = 0;
          continue;
        }
        let v = diag[k] * p[k];
        if (i < n - 1 && !fixed(k + 1)) v -= gE[k] * p[k + 1];
        if (i > 0 && !fixed(k - 1)) v -= gE[k - 1] * p[k - 1];
        if (j < m - 1 && !fixed(k + n)) v -= gN[k] * p[k + n];
        if (j > 0 && !fixed(k - n)) v -= gN[k - n] * p[k - n];
        out[k] = v;
      }
  };
  const x = new Float64Array(N);
  const r = Float64Array.from(b);
  const z = new Float64Array(N);
  const p = new Float64Array(N);
  const Ap = new Float64Array(N);
  let rz = 0;
  let bn = 0;
  for (let k = 0; k < N; k++) {
    if (fixed(k)) continue;
    z[k] = r[k] / diag[k];
    p[k] = z[k];
    rz += r[k] * z[k];
    bn += b[k] * b[k];
  }
  bn = Math.sqrt(bn) || 1;
  for (let it = 0; it < 30000; it++) {
    A(p, Ap);
    let pAp = 0;
    for (let k = 0; k < N; k++) pAp += p[k] * Ap[k];
    if (pAp <= 0) break;
    const a = rz / pAp;
    let rr = 0;
    for (let k = 0; k < N; k++) {
      if (fixed(k)) continue;
      x[k] += a * p[k];
      r[k] -= a * Ap[k];
      rr += r[k] * r[k];
    }
    if (Math.sqrt(rr) / bn < 1e-11) break;
    let rzn = 0;
    for (let k = 0; k < N; k++) {
      if (fixed(k)) continue;
      z[k] = r[k] / diag[k];
      rzn += r[k] * z[k];
    }
    const beta = rzn / rz;
    rz = rzn;
    for (let k = 0; k < N; k++) if (!fixed(k)) p[k] = z[k] + beta * p[k];
  }
  const phi = Float64Array.from(val);
  for (let k = 0; k < N; k++) if (!fixed(k)) phi[k] = x[k];
  let S = 0;
  for (let j = 0; j < m; j++)
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      if (i < n - 1) S += gE[k] * (phi[k] - phi[k + 1]) ** 2;
      if (j < m - 1) S += gN[k] * (phi[k] - phi[k + n]) ** 2;
    }
  return S;
}

function pairProblem(g: ViaPairGeom, odd: boolean, cellsPerD: number): Problem {
  const h = Math.min(g.d, g.antipad - g.d, g.pitch - g.d) / cellsPerD;
  const cx = g.pitch / 2;
  const ra = g.antipad / 2;
  const rv = g.d / 2;
  const inAntipad = (x: number, y: number) => {
    if (g.shape === 'oblong') return x <= cx ? y <= ra : (x - cx) ** 2 + y * y <= ra * ra;
    return (x - cx) ** 2 + y * y <= ra * ra || (x + cx) ** 2 + y * y <= ra * ra;
  };
  const classify = (x: number, y: number) => ((x - cx) ** 2 + y * y <= rv * rv ? COND : inAntipad(x, y) ? FREE : GND);
  return { n: Math.ceil((cx + ra) / h) + 3, m: Math.ceil(ra / h) + 3, h, classify, oddWall: odd };
}

export function validateViaPair(g: ViaPairGeom): string[] {
  const e: string[] = [];
  if (!(g.d > 0)) e.push('Barrel diameter must be greater than 0.');
  if (!(g.pitch > g.d)) e.push('Pitch must be larger than the barrel diameter (the vias would touch).');
  if (!(g.antipad > g.d)) e.push('Antipad must be larger than the barrel.');
  if (!(g.er >= 1)) e.push('εr must be at least 1.');
  if (g.antipad > 40 * Math.min(g.d, g.pitch - g.d)) e.push('Antipad is very large compared with the barrel and gap; reduce it (the mesh would be too large).');
  return e;
}

/** Differential, odd, even and common-mode impedance of the via pair in the antipad region. */
export function viaPairImpedance(g: ViaPairGeom, cellsPerD = 20) {
  const sOdd = solve(pairProblem(g, true, cellsPerD));
  const sEven = solve(pairProblem(g, false, cellsPerD));
  const k = Math.sqrt(g.er);
  // per-via mode capacitance = ε0·S_full/2 = 2·ε0·S_quadrant  →  Z = η0 / (2·S·√εr)
  const zOdd = ETA0 / (2 * sOdd * k);
  const zEven = ETA0 / (2 * sEven * k);
  return { zOdd, zEven, zDiff: 2 * zOdd, zComm: zEven / 2 };
}

/** Single via centred in a round antipad on the same solver (used for validation). */
export function coaxViaImpedance(d: number, antipad: number, er: number, cellsPerD = 20) {
  const h = Math.min(d, antipad - d) / cellsPerD;
  const ra = antipad / 2;
  const rv = d / 2;
  const classify = (x: number, y: number) => (x * x + y * y <= rv * rv ? COND : x * x + y * y <= ra * ra ? FREE : GND);
  const n = Math.ceil(ra / h) + 3;
  const S = solve({ n, m: n, h, classify, oddWall: false });
  // single conductor: C = ε0·S_full = 4·ε0·S_quadrant
  return ETA0 / (4 * S * Math.sqrt(er));
}

/** Analytic references. */
export const coaxZ = (d: number, D: number, er: number) => (ETA0 / (2 * Math.PI * Math.sqrt(er))) * Math.log(D / d);
export const twinLeadZ = (d: number, p: number, er: number) => (ETA0 / (Math.PI * Math.sqrt(er))) * Math.acosh(p / d);
