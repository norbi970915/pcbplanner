import { useEffect, useRef, useState } from 'react';
import type { Geometry, SolveOptions, SolveResult } from './fieldsolver';
import type { SolverRequest, SolverResponse } from './solver.worker';

type Req = SolverRequest extends infer R ? (R extends SolverRequest ? Omit<R, 'id'> : never) : never;

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (r: SolverResponse) => void>();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<SolverResponse>) => {
      const cb = pending.get(e.data.id);
      pending.delete(e.data.id);
      cb?.(e.data);
    };
  }
  return worker;
}

export function runSolver(req: Req): Promise<SolverResponse> {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    getWorker().postMessage({ ...req, id });
  });
}

export interface SolveState {
  result: SolveResult | null;
  error: string | null;
  busy: boolean;
}

/** Re-solve whenever the geometry changes (debounced); stale answers are dropped. */
export function useFieldSolve(geom: Geometry | null, opts: SolveOptions): SolveState {
  const [state, setState] = useState<SolveState>({ result: null, error: null, busy: false });
  const seq = useRef(0);
  const key = JSON.stringify([geom, opts]);
  useEffect(() => {
    if (!geom) return;
    const mySeq = ++seq.current;
    setState((s) => ({ ...s, busy: true }));
    const t = setTimeout(() => {
      runSolver({ type: 'solve', geom, opts }).then((r) => {
        if (mySeq !== seq.current) return;
        setState(r.ok ? { result: r.result, error: null, busy: false } : { result: null, error: r.error, busy: false });
      });
    }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}
