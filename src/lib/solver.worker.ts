/// <reference lib="webworker" />
import { designLine, type DesignRequest, type DesignResult } from './design';
import { djordjevicSarkar, type DielectricSpec } from './dielectric';
import { solve, type Geometry, type SolveOptions, type SolveResult } from './fieldsolver';
import { lineLoss, type LossInput, type LossResult } from './loss';

/** Loss request with serialisable material specs (models are built in the worker). */
export type LossRequest = Omit<LossInput, 'slabModels' | 'maskModel'> & { slabSpecs: DielectricSpec[]; maskSpec?: DielectricSpec };

export type SolverRequest =
  | { id: number; type: 'solve'; geom: Geometry; opts: SolveOptions }
  | { id: number; type: 'target'; geom: Geometry; opts: SolveOptions; param: 'w' | 's'; target: number }
  | { id: number; type: 'design'; req: DesignRequest }
  | { id: number; type: 'loss'; req: LossRequest };

export type SolverResponse =
  | { id: number; ok: true; result?: SolveResult; value?: number; design?: DesignResult; loss?: LossResult }
  | { id: number; ok: false; error: string };

export function runLoss(req: LossRequest): LossResult {
  const { slabSpecs, maskSpec, ...rest } = req;
  return lineLoss({ ...rest, slabModels: slabSpecs.map(djordjevicSarkar), maskModel: maskSpec ? djordjevicSarkar(maskSpec) : undefined });
}

const zOf = (r: SolveResult) => r.zdiff ?? r.se?.z ?? NaN;

function withParam(geom: Geometry, param: 'w' | 's', v: number): Geometry {
  if (param === 's') return { ...geom, s: v };
  const etch = geom.wTop !== undefined ? geom.w - geom.wTop : 0;
  return { ...geom, w: v, wTop: geom.wTop !== undefined ? Math.max(v - etch, v * 0.1) : undefined };
}

/** Width (or spacing) for a target impedance. Z falls with W and rises with S. */
function solveTarget(geom: Geometry, opts: SolveOptions, param: 'w' | 's', target: number) {
  const quick: SolveOptions = { ...opts, field: false, even: false };
  const f = (v: number) => zOf(solve(withParam(geom, param, v), quick)) - target;
  let a = param === 'w' ? geom.w : (geom.s as number);
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

const post = (m: SolverResponse) => (self as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = (e: MessageEvent<SolverRequest>) => {
  const req = e.data;
  try {
    if (req.type === 'solve') post({ id: req.id, ok: true, result: solve(req.geom, req.opts) });
    else if (req.type === 'target') {
      const { value, result } = solveTarget(req.geom, req.opts, req.param, req.target);
      post({ id: req.id, ok: true, result, value });
    } else if (req.type === 'loss') post({ id: req.id, ok: true, loss: runLoss(req.req) });
    else post({ id: req.id, ok: true, design: designLine(req.req) });
  } catch (err) {
    post({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
