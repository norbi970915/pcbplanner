import { useEffect, useRef, useState } from 'react';
import type { Geometry, SolveOptions, SolveResult } from './fieldsolver';
import type { SolverRequest, SolverResponse } from './solver.worker';

type Req = SolverRequest extends infer R ? (R extends SolverRequest ? Omit<R, 'id'> : never) : never;

let nextId = 1;
const pending = new Map<number, (r: SolverResponse) => void>();

function makeWorker() {
  const w = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e: MessageEvent<SolverResponse>) => {
    const cb = pending.get(e.data.id);
    pending.delete(e.data.id);
    cb?.(e.data);
  };
  return w;
}

// one worker for interactive solves
let main: Worker | null = null;
export function runSolver(req: Req): Promise<SolverResponse> {
  if (!main) main = makeWorker();
  const id = nextId++;
  const w = main;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    w.postMessage({ ...req, id });
  });
}

// a pool for batch work (stackup advisor, layer stack manager)
const POOL_SIZE = Math.max(2, Math.min(8, (typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4) - 1));
let pool: { w: Worker; busy: number }[] = [];
export function runPooled(req: Req): Promise<SolverResponse> {
  if (!pool.length) pool = Array.from({ length: POOL_SIZE }, () => ({ w: makeWorker(), busy: 0 }));
  const slot = pool.reduce((a, b) => (b.busy < a.busy ? b : a));
  slot.busy++;
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, (r) => {
      slot.busy--;
      resolve(r);
    });
    slot.w.postMessage({ ...req, id });
  });
}
/** Abort all batch work (terminates the pool workers). */
export function cancelPool() {
  for (const s of pool) s.w.terminate();
  pool = [];
}
export const poolSize = () => POOL_SIZE;

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
        setState(r.ok && r.result ? { result: r.result, error: null, busy: false } : { result: null, error: r.ok ? 'No result' : r.error, busy: false });
      });
    }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}
