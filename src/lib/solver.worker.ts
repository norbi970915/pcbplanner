/// <reference lib="webworker" />
import { solveTarget } from './impedanceTarget';
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
