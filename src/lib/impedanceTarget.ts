import { solve, type Geometry, type SolveOptions, type SolveResult } from './fieldsolver';
import { resizeBroadside } from './broadside';

const zOf = (r: SolveResult) => r.zdiff ?? r.se?.z ?? NaN;

function withParam(geom: Geometry, param: 'w' | 's', v: number): Geometry {
  if (param === 's') return geom.coupling === 'broadside' ? resizeBroadside(geom, 1, v) : { ...geom, s: v };
  const etch = geom.wTop !== undefined ? geom.w - geom.wTop : 0;
  return { ...geom, w: v, wTop: geom.wTop !== undefined ? v - etch : undefined };
}

/** Width (or spacing) for a target impedance. Z falls with W and rises with S. */
export function solveTarget(geom: Geometry, opts: SolveOptions, param: 'w' | 's', target: number) {
  if (!Number.isFinite(target) || target <= 0) throw new Error('Target impedance must be positive.');
  if (param === 's' && !geom.diff) throw new Error('Spacing solving requires a differential pair.');
  const quick: SolveOptions = { ...opts, field: false, even: false };
  const f = (v: number) => zOf(solve(withParam(geom, param, v), quick)) - target;
  const etch = geom.wTop === undefined ? 0 : geom.w - geom.wTop;
  const minimum = param === 'w' ? Math.min(geom.w, Math.max(1e-4, etch + 1e-6)) : 1e-4;
  const step = (value: number) => grow ? value * 1.4 : Math.max(minimum, value / 1.4);
  let a = param === 'w' ? geom.w : (geom.s as number);
  let fa = f(a);
  if (Math.abs(fa) < 0.005) return { value: a, result: solve(withParam(geom, param, a), opts) };
  const grow = (fa > 0) === (param === 'w');
  let b = step(a);
  let fb = f(b);
  for (let n = 0; n < 25 && Math.sign(fa) === Math.sign(fb); n++) {
    a = b;
    fa = fb;
    const next = step(b);
    if (next === b) throw new Error('No width/spacing reaches this impedance with the entered etch and stackup.');
    b = next;
    if (b < 1e-4 || b > 1e3) throw new Error('No width/spacing reaches this impedance for the given stackup.');
    fb = f(b);
  }
  if (Math.sign(fa) === Math.sign(fb)) throw new Error('No width/spacing reaches this impedance for the given stackup.');
  let la = Math.log(a);
  let lb = Math.log(b);
  for (let n = 0; n < 40; n++) {
    const lc = lb - (fb * (lb - la)) / (fb - fa);
    const fc = f(Math.exp(lc));
    if (fc * fb < 0) {
      la = lb;
      fa = fb;
    } else fa /= 2;
    lb = lc;
    fb = fc;
    if (Math.abs(fc) < 0.005 || Math.abs(lb - la) < 1e-7) break;
  }
  const value = Math.exp(lb);
  return { value, result: solve(withParam(geom, param, value), opts) };
}

