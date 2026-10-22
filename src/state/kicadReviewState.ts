import { useCallback, useSyncExternalStore, type SetStateAction } from 'react';
import type { DcResult, quickCheck } from '../lib/kicadPower';
import type { ThermalResult } from '../lib/kicadThermal';
import type { ClearanceResult } from '../lib/kicadClearance';
import type { KicadAnalysisInputs } from '../components/kicad/useKicadAnalysis';

export interface PowerReviewState { board: object; key: string; result?: DcResult; error?: string; returnRequired?: boolean }
export interface ThermalReviewState { board: object; key: string; ambient: number; result?: ThermalResult; error?: string; solving?: boolean }
export interface ClearanceReviewState { board: object; key: string; result?: ClearanceResult; error?: string }
interface Values {
  supply: PowerReviewState;
  return: PowerReviewState;
  quick: { net: string; result: ReturnType<typeof quickCheck> };
  thermal: ThermalReviewState;
  clearance: ClearanceReviewState;
}
export type ReviewKind = 'power' | 'thermal' | 'clearance';
export type KicadReviewSnapshot = { [K in keyof Values]: { inputs: string; value: Values[K] } | null };
const EMPTY: KicadReviewSnapshot = { supply: null, return: null, quick: null, thermal: null, clearance: null };
interface Store { snapshot: KicadReviewSnapshot; listeners: Set<() => void> }
// Results belong to the exact imported board object, never a filename or another tab's project.
const stores = new WeakMap<object, Store>();
function storeFor(board: object): Store {
  let store = stores.get(board);
  if (!store) { store = { snapshot: EMPTY, listeners: new Set() }; stores.set(board, store); }
  return store;
}

export function reviewInputKey(kind: ReviewKind, p: KicadAnalysisInputs): string {
  const dc = [p.pnet, p.psrc, p.ploads, p.pret, p.pdt, p.pamb, p.zfill];
  if (kind === 'power') return JSON.stringify(p.pmode === 'dc' ? ['dc', ...dc] : ['quick', p.pnet, p.pi, p.pdt, p.pamb, p.zfill]);
  if (kind === 'clearance') return JSON.stringify([p.hvnets, p.hvouter]);
  return JSON.stringify([p.tsrc, p.tamb, p.tair, p.th, p.teps, p.tkxy, p.tkz, p.tloss, p.zfill, ...(p.tloss ? dc : [])]);
}

export function useKicadReviewSnapshot(board: object) {
  const store = storeFor(board);
  const subscribe = useCallback((listener: () => void) => {
    store.listeners.add(listener); return () => { store.listeners.delete(listener); };
  }, [store]);
  return useSyncExternalStore(subscribe, () => store.snapshot, () => EMPTY);
}

/** Keep solved maps while switching views, without mounting hidden controls or rerunning Thermal. */
export function useKicadReviewState<K extends keyof Values>(board: object, slot: K, inputs: string) {
  const snapshot = useKicadReviewSnapshot(board);
  const set = useCallback((action: SetStateAction<Values[K] | null>) => {
    const store = storeFor(board), previous = store.snapshot[slot]?.value ?? null;
    const next = typeof action === 'function' ? (action as (p: Values[K] | null) => Values[K] | null)(previous) : action;
    if (Object.is(previous, next)) return;
    store.snapshot = { ...store.snapshot, [slot]: next === null ? null : { inputs, value: next } };
    for (const listener of store.listeners) listener();
  }, [board, slot, inputs]);
  return [snapshot[slot]?.value ?? null, set, snapshot[slot]?.inputs === inputs] as const;
}
