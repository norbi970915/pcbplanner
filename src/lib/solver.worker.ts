/// <reference lib="webworker" />
import { solve, type Geometry, type SolveOptions, type SolveResult } from './fieldsolver';

export type SolverRequest =
  | { id: number; type: 'solve'; geom: Geometry; opts: SolveOptions }
  | { id: number; type: 'target'; geom: Geometry; opts: SolveOptions; param: 'w' | 's'; target: number };

export type SolverResponse =
  | { id: number; ok: true; result: SolveResult; value?: number }
  | { id: number; ok: false; error: string };

const zOf = (r: SolveResult) => (r.zdiff ?? r.se?.z ?? NaN);

function withParam(geom: Geometry, param: 'w' | 's', v: number): Geometry {
  if (param === 's') return { ...geom, s: v };
  const etch = geom.wTop !== undefined ? geom.w - geom.wTop : 0;
  return { ...geom, w: v, wTop: geom.wTop !== undefined ? Math.max(v - etch, v * 0.1) : undefined };
}

/** Find the width (or spacing) that gives the target impedance. Z falls with W and rises with S. */
function solveTarget(geom: Geometry, opts: SolveOptions, param: 'w' | 's', target: number) {
  const quick: SolveOptions = { ...opts, field: false, even: false };
  const f = (v: number) => zOf(solve(withParam(geom, param, v), quick)) - target;
  const start = param === 'w' ? geom.w : (geom.s as number);
  let a = start;
  let fa = f(a);
  const grow = (fa > 0) === (param === 'w');
  let b = grow ? a * 1.4 : a / 1.4;
  let fb = f(b);
  for (let n = 0; n < 25 && Math.sign(fa) === Math.sign(fb); n++) {
    a = b;
    fa = fb;
    b = grow ? b * 1.4 : b / 1.4;
    if (b < 1e-4 || b > 1e3) throw new Error('No width/spacing reaches this impedance for the given stackup.');
    fb = f(b);
  }
  // Illinois regula falsi in log space: the root stays bracketed by (la, lb).
  let la = Math.log(a);
  let lb = Math.log(b);
  for (let n = 0; n < 40; n++) {
    const lc = lb - (fb * (lb - la)) / (fb - fa);
    const fc = f(Math.exp(lc));
    if (fc * fb < 0) {
      la = lb;
      fa = fb;
    } else {
      fa /= 2;
    }
    lb = lc;
    fb = fc;
    if (Math.abs(fc) < 0.005 || Math.abs(lb - la) < 1e-7) break;
  }
  const value = Math.exp(lb);
  return { value, result: solve(withParam(geom, param, value), opts) };
}

self.onmessage = (e: MessageEvent<SolverRequest>) => {
  const req = e.data;
  try {
    if (req.type === 'solve') {
      const result = solve(req.geom, req.opts);
      (self as DedicatedWorkerGlobalScope).postMessage({ id: req.id, ok: true, result } satisfies SolverResponse);
    } else {
      const { value, result } = solveTarget(req.geom, req.opts, req.param, req.target);
      (self as DedicatedWorkerGlobalScope).postMessage({ id: req.id, ok: true, result, value } satisfies SolverResponse);
    }
  } catch (err) {
    (self as DedicatedWorkerGlobalScope).postMessage({
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    } satisfies SolverResponse);
  }
};
