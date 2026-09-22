// Line design on a stackup layer: geometry conversion, closed-form first guess
// and the field-solver root find used by the advisor and the stack manager.
import { microstripHJ, striplineAsym } from './closedform';
import { solve, type Accuracy, type Geometry } from './fieldsolver';
import type { StackupGeometry } from './stackups';

export interface SpacingRule {
  mode: 'fixed' | 'ratio';
  s: number; // fixed spacing, mm
  ratio: number; // S = ratio · W
  minS: number; // never below the fab minimum
}

export interface DesignRequest {
  sg: StackupGeometry;
  kind: 'se' | 'diff';
  target: number;
  etch: number;
  rule?: SpacingRule;
  accuracy: Accuracy;
}

export interface DesignResult {
  w: number;
  s?: number;
  z: number;
}

export function spacingFor(w: number, rule?: SpacingRule): number {
  if (!rule) return 0;
  const s = rule.mode === 'fixed' ? rule.s : rule.ratio * w;
  return Math.max(s, rule.minS);
}

export function toSolverGeometry(sg: StackupGeometry, w: number, diff: boolean, s: number | undefined, etch: number): Geometry {
  const g: Geometry = {
    w,
    wTop: etch > 0 ? Math.max(w - etch, w * 0.2) : undefined,
    t: sg.t,
    yTrace: sg.h,
    diff,
    s: diff ? s : undefined,
    slabs: [{ y0: 0, y1: sg.h, er: sg.er }],
  };
  if (sg.type === 'microstrip') {
    if (sg.mask) g.mask = { surfaceY: sg.h, overSubstrate: sg.mask.c1, overTrace: sg.mask.c2, er: sg.mask.er };
  } else {
    const top = sg.h + sg.t + (sg.h2 ?? 0);
    g.slabs.push({ y0: sg.h, y1: top, er: sg.er2 ?? sg.er });
    if (sg.type === 'stripline') g.topPlane = top;
  }
  return g;
}

/** Closed-form width estimate for a single-ended target (used as the solver's starting point). */
export function closedFormWidth(sg: StackupGeometry, z: number): number {
  const zOf = (w: number) =>
    sg.type === 'stripline' ? striplineAsym(w, sg.h, sg.h2 ?? sg.h, sg.t, sg.er).z0 : microstripHJ(w, sg.h, sg.t, sg.type === 'embedded' ? (sg.er + (sg.er2 ?? sg.er)) / 2 : sg.er).z0;
  let lo = 1e-3;
  let hi = 50;
  for (let i = 0; i < 60; i++) {
    const mid = Math.sqrt(lo * hi);
    if (zOf(mid) > z) lo = mid;
    else hi = mid;
  }
  return Math.sqrt(lo * hi);
}

/**
 * Root find on log-width with the field solver (Z falls monotonically with W).
 * `zAt` returns the impedance for a width.
 */
export function findWidth(zAt: (w: number) => number, target: number, start: number): number {
  let a = start;
  let fa = zAt(a) - target;
  const up = fa > 0; // impedance too high → widen
  let b = up ? a * 1.25 : a / 1.25;
  let fb = zAt(b) - target;
  for (let n = 0; n < 30 && Math.sign(fa) === Math.sign(fb); n++) {
    a = b;
    fa = fb;
    b = up ? b * 1.35 : b / 1.35;
    if (b < 5e-4 || b > 200) throw new Error('No trace width reaches this impedance on this layer.');
    fb = zAt(b);
    fb -= target;
  }
  let la = Math.log(a);
  let lb = Math.log(b);
  for (let n = 0; n < 40; n++) {
    const lc = lb - (fb * (lb - la)) / (fb - fa);
    const fc = zAt(Math.exp(lc)) - target;
    if (fc * fb < 0) {
      la = lb;
      fa = fb;
    } else fa /= 2;
    lb = lc;
    fb = fc;
    if (Math.abs(fc) < 0.01 || Math.abs(lb - la) < 1e-7) break;
  }
  return Math.exp(lb);
}

export function designLine(req: DesignRequest): DesignResult {
  const diff = req.kind === 'diff';
  const zAt = (w: number) => {
    const s = diff ? spacingFor(w, req.rule) : undefined;
    const r = solve(toSolverGeometry(req.sg, w, diff, s, req.etch), { accuracy: req.accuracy, even: false });
    return (diff ? r.zdiff : r.se?.z) ?? NaN;
  };
  // single-ended guess; a coupled pair needs a slightly narrower line than Zdiff/2 suggests
  const guess = closedFormWidth(req.sg, diff ? req.target / 2 : req.target) * (diff ? 0.9 : 1);
  const w = findWidth(zAt, req.target, guess);
  const s = diff ? spacingFor(w, req.rule) : undefined;
  return { w, s, z: zAt(w) };
}
