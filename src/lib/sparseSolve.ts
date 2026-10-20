// A symmetric positive definite sparse solve for resistor networks: conjugate gradients preconditioned by one
// V-cycle of aggregation multigrid. Each level groups every node with its strongly coupled neighbours
// (Vaněk, Mandel and Brezina, "Algebraic multigrid by smoothed aggregation", Computing 56, 1996; here
// unsmoothed), the coarse matrix is PᵀAP, and a symmetric Gauss–Seidel sweep before (forward) and after
// (backward) the coarse correction keeps the preconditioner symmetric, as conjugate gradients needs.
// The coarsest level is solved exactly by a dense Cholesky factorisation.

/** A square sparse matrix: the off-diagonal entries of row i are col/val[start[i] … start[i+1]). */
export interface Csr {
  n: number;
  start: Int32Array;
  col: Int32Array;
  val: Float64Array;
  diag: Float64Array;
}

interface Level {
  m: Csr;
  agg?: Int32Array; // fine node → coarse node
  chol?: Float64Array; // coarsest: dense Cholesky factor, row-major lower triangle
  r: Float64Array;
  x: Float64Array;
  b: Float64Array;
  // the coarse correction's vectors (size of the next level)
  rc?: Float64Array;
  ec?: Float64Array;
  v1?: Float64Array;
  w1?: Float64Array;
  v2?: Float64Array;
  w2?: Float64Array;
}

const COARSEST = 300;
export const timing = { setup: 0, solve: 0, levels: '' };

function aggregate(m: Csr): { agg: Int32Array; nc: number } {
  const { n, start, col, val } = m;
  const agg = new Int32Array(n).fill(-1);
  const strong = (i: number) => {
    let mx = 0;
    for (let k = start[i]; k < start[i + 1]; k++) mx = Math.max(mx, -val[k]);
    return 0.25 * mx;
  };
  const th = new Float64Array(n);
  for (let i = 0; i < n; i++) th[i] = strong(i);
  let nc = 0;
  // a node whose strong neighbours are all free starts an aggregate with them
  for (let i = 0; i < n; i++) {
    if (agg[i] >= 0) continue;
    let free = true;
    for (let k = start[i]; k < start[i + 1] && free; k++) if (-val[k] >= th[i] && agg[col[k]] >= 0) free = false;
    if (!free) continue;
    agg[i] = nc;
    for (let k = start[i]; k < start[i + 1]; k++) if (-val[k] >= th[i]) agg[col[k]] = nc;
    nc++;
  }
  // the rest join the aggregate they are most strongly coupled to
  for (let i = 0; i < n; i++) {
    if (agg[i] >= 0) continue;
    let best = -1;
    let bv = 0;
    for (let k = start[i]; k < start[i + 1]; k++)
      if (agg[col[k]] >= 0 && -val[k] > bv) {
        bv = -val[k];
        best = agg[col[k]];
      }
    agg[i] = best >= 0 ? best : nc++;
  }
  return { agg, nc };
}

function galerkin(m: Csr, agg: Int32Array, nc: number): Csr {
  const count = new Int32Array(nc + 1);
  for (let i = 0; i < m.n; i++) count[agg[i] + 1]++;
  for (let a = 0; a < nc; a++) count[a + 1] += count[a];
  const members = new Int32Array(m.n);
  const pos = count.slice(0, nc);
  for (let i = 0; i < m.n; i++) members[pos[agg[i]]++] = i;
  const acc = new Float64Array(nc);
  const mark = new Int32Array(nc).fill(-1);
  const start = new Int32Array(nc + 1);
  const cols: number[] = [];
  const vals: number[] = [];
  const diag = new Float64Array(nc);
  const touched: number[] = [];
  for (let a = 0; a < nc; a++) {
    let d = 0;
    touched.length = 0;
    for (let q = count[a]; q < count[a + 1]; q++) {
      const i = members[q];
      d += m.diag[i];
      for (let k = m.start[i]; k < m.start[i + 1]; k++) {
        const c = agg[m.col[k]];
        if (c === a) d += m.val[k];
        else {
          if (mark[c] !== a) {
            mark[c] = a;
            acc[c] = 0;
            touched.push(c);
          }
          acc[c] += m.val[k];
        }
      }
    }
    diag[a] = d;
    for (const c of touched) {
      cols.push(c);
      vals.push(acc[c]);
    }
    start[a + 1] = cols.length;
  }
  return { n: nc, start, col: Int32Array.from(cols), val: Float64Array.from(vals), diag };
}

function cholesky(m: Csr): Float64Array {
  const n = m.n;
  const a = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    a[i * n + i] = m.diag[i];
    for (let k = m.start[i]; k < m.start[i + 1]; k++) a[i * n + m.col[k]] += m.val[k];
  }
  for (let j = 0; j < n; j++) {
    let s = a[j * n + j];
    for (let k = 0; k < j; k++) s -= a[j * n + k] ** 2;
    const d = Math.sqrt(Math.max(s, 1e-300));
    a[j * n + j] = d;
    for (let i = j + 1; i < n; i++) {
      let t = a[i * n + j];
      for (let k = 0; k < j; k++) t -= a[i * n + k] * a[j * n + k];
      a[i * n + j] = t / d;
    }
  }
  return a;
}

function cholSolve(l: Float64Array, n: number, b: Float64Array, x: Float64Array) {
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= l[i * n + k] * x[k];
    x[i] = s / l[i * n + i];
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i];
    for (let k = i + 1; k < n; k++) s -= l[k * n + i] * x[k];
    x[i] = s / l[i * n + i];
  }
}

function hierarchy(m: Csr): Level[] {
  const levels: Level[] = [];
  let cur = m;
  for (;;) {
    const lv: Level = { m: cur, r: new Float64Array(cur.n), x: new Float64Array(cur.n), b: new Float64Array(cur.n) };
    levels.push(lv);
    if (cur.n <= COARSEST) {
      lv.chol = cholesky(cur);
      break;
    }
    const { agg, nc } = aggregate(cur);
    if (nc > cur.n * 0.85) break; // no longer coarsens: smoothing alone on this level
    lv.agg = agg;
    for (const k of ['rc', 'ec', 'v1', 'w1', 'v2', 'w2'] as const) lv[k] = new Float64Array(nc);
    cur = galerkin(cur, agg, nc);
  }
  return levels;
}

function gaussSeidel(m: Csr, x: Float64Array, b: Float64Array, forward: boolean) {
  const { n, start, col, val, diag } = m;
  for (let q = 0; q < n; q++) {
    const i = forward ? q : n - 1 - q;
    let s = b[i];
    for (let k = start[i]; k < start[i + 1]; k++) s -= val[k] * x[col[k]];
    x[i] = s / diag[i];
  }
}

/**
 * x = one cycle on level l applied to b (the level's own arrays). The coarse correction is two steps of
 * flexible conjugate gradients on the coarse level, each preconditioned by the next cycle (the K-cycle of Notay and Vassilevski,
 * "Recursive Krylov-based multigrid cycles", Numer. Linear Algebra Appl. 15, 2008): it keeps the number of
 * iterations from growing with the number of levels, as plain aggregation V-cycles do.
 */
function kcycle(levels: Level[], l: number) {
  const lv = levels[l];
  const { m, x, b, r } = lv;
  if (lv.chol) {
    cholSolve(lv.chol, m.n, b, x);
    return;
  }
  x.fill(0);
  if (!lv.agg) {
    for (let s = 0; s < 10; s++) {
      gaussSeidel(m, x, b, true);
      gaussSeidel(m, x, b, false);
    }
    return;
  }
  gaussSeidel(m, x, b, true);
  for (let i = 0; i < m.n; i++) {
    let s = b[i] - m.diag[i] * x[i];
    for (let k = m.start[i]; k < m.start[i + 1]; k++) s -= m.val[k] * x[m.col[k]];
    r[i] = s;
  }
  const nx = levels[l + 1];
  const rc = lv.rc!;
  rc.fill(0);
  for (let i = 0; i < m.n; i++) rc[lv.agg[i]] += r[i];
  const ec = lv.ec!;
  if (nx.chol) {
    nx.b.set(rc);
    kcycle(levels, l + 1);
    ec.set(nx.x);
  } else {
    const { v1, w1, v2, w2 } = lv;
    nx.b.set(rc);
    kcycle(levels, l + 1);
    v1!.set(nx.x);
    multiply(nx.m, v1!, w1!);
    const rho1 = dot(v1!, w1!);
    const a1 = dot(v1!, rc);
    if (!(rho1 > 0)) ec.fill(0);
    else {
      const c1 = a1 / rho1;
      let rr = 0;
      let r0 = 0;
      for (let i = 0; i < rc.length; i++) {
        r0 += rc[i] * rc[i];
        nx.b[i] = rc[i] - c1 * w1![i];
        rr += nx.b[i] * nx.b[i];
      }
      if (rr <= 0.0625 * r0) for (let i = 0; i < rc.length; i++) ec[i] = c1 * v1![i];
      else {
        const r2 = Float64Array.from(nx.b);
        kcycle(levels, l + 1);
        v2!.set(nx.x);
        multiply(nx.m, v2!, w2!);
        const gamma = dot(v2!, w1!);
        const beta = dot(v2!, w2!);
        const a2 = dot(v2!, r2);
        const rho2 = beta - (gamma * gamma) / rho1;
        if (!(rho2 > 0)) for (let i = 0; i < rc.length; i++) ec[i] = c1 * v1![i];
        else {
          const k1 = c1 - (gamma * a2) / (rho1 * rho2);
          const k2 = a2 / rho2;
          for (let i = 0; i < rc.length; i++) ec[i] = k1 * v1![i] + k2 * v2![i];
        }
      }
    }
  }
  for (let i = 0; i < m.n; i++) x[i] += ec[lv.agg[i]];
  gaussSeidel(m, x, b, false);
}

function multiply(m: Csr, p: Float64Array, out: Float64Array) {
  for (let i = 0; i < m.n; i++) {
    let s = m.diag[i] * p[i];
    for (let k = m.start[i]; k < m.start[i + 1]; k++) s += m.val[k] * p[m.col[k]];
    out[i] = s;
  }
}

const dot = (a: Float64Array, b: Float64Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

/** Solve A·x = b for a symmetric positive definite A; stops at a relative residual of `tol`. */
export function solveSpd(m: Csr, b: Float64Array, tol = 1e-9, maxIt = 500): { x: Float64Array; iterations: number; residual: number } {
  const n = m.n;
  const x = new Float64Array(n);
  const bn = Math.sqrt(dot(b, b));
  if (!n || bn === 0) return { x, iterations: 0, residual: 0 };
  const t0 = performance.now();
  const levels = hierarchy(m);
  timing.setup = performance.now() - t0;
  timing.levels = levels.map((l) => l.m.n).join('>');
  const r = Float64Array.from(b);
  const z = new Float64Array(n);
  const p = new Float64Array(n);
  const ap = new Float64Array(n);
  const rOld = new Float64Array(n);
  const precond = () => {
    levels[0].b.set(r);
    kcycle(levels, 0);
    z.set(levels[0].x);
  };
  precond();
  p.set(z);
  let rz = dot(r, z);
  let it = 0;
  let res = 1;
  while (it < maxIt) {
    multiply(m, p, ap);
    const pap = dot(p, ap);
    if (!(pap > 0)) break;
    const alpha = rz / pap;
    for (let i = 0; i < n; i++) {
      x[i] += alpha * p[i];
      rOld[i] = r[i];
      r[i] -= alpha * ap[i];
    }
    it++;
    res = Math.sqrt(dot(r, r)) / bn;
    if (res <= tol) break;
    precond();
    // the cycle is not a fixed linear operator: flexible CG (Polak–Ribière β)
    const rzNew = dot(r, z);
    const beta = (rzNew - dot(rOld, z)) / rz;
    rz = rzNew;
    for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i];
  }
  timing.solve = performance.now() - t0 - timing.setup;
  return { x, iterations: it, residual: res };
}
