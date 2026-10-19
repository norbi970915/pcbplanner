// Solves the pair that "Your routing" on the Interface Design Rules page compares (InterfaceRouting.tsx):
// the plan of src/lib/kicadInterfaceRules.ts, run on the worker pool through the routing check's solve
// cache, so a pair the routing check has already solved this visit comes back at once.
import { useEffect, useMemo, useState } from 'react';
import { pairCheckPlan, pairCheckResult, readLoss, readZ, type LossAnswer, type ZAnswer } from '../../lib/kicadInterfaceRules';
import type { KicadProjectData } from '../../lib/kicadProjectQueries';
import type { Fmt } from '../../lib/kicadRouting';
import { cachedSolve } from '../../lib/kicadRoutingSolve';

/** The pair's check against an interface, solved on the worker pool through the routing check's cache. */
export function useInterfacePairCheck(data: KicadProjectData | null, pair: string, targetId: string, mask: boolean, L: Fmt, unit: string) {
  const plan = useMemo(() => (data && pair ? pairCheckPlan(data, pair, targetId, mask) : null), [data, pair, targetId, mask]);
  const runKey = plan ? JSON.stringify([[...plan.z], [...plan.loss]]) : '';
  // answers are kept with the requests they belong to, so a changed plan never shows the last plan's answers
  const [got, setGot] = useState<{ key: string; zs: Record<string, ZAnswer>; losses: Record<string, LossAnswer> }>({ key: '', zs: {}, losses: {} });
  useEffect(() => {
    let alive = true;
    setGot({ key: runKey, zs: {}, losses: {} });
    if (!plan) return;
    const put = (kind: 'zs' | 'losses', layer: string, v: ZAnswer | LossAnswer) => alive && setGot((g) => (g.key === runKey ? { ...g, [kind]: { ...g[kind], [layer]: v } } : g));
    for (const [layer, req] of plan.z) void cachedSolve(req).then((r) => put('zs', layer, readZ(r)));
    for (const [layer, req] of plan.loss) {
      if ('error' in req) put('losses', layer, { err: req.error });
      else void cachedSolve(req).then((r) => put('losses', layer, readLoss(r)));
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey]);
  const res = useMemo(() => {
    if (!plan) return null;
    const mine = got.key === runKey;
    return pairCheckResult(plan, mine ? got.zs : {}, mine ? got.losses : {}, L, unit);
  }, [plan, got, runKey, L, unit]);
  return { plan, res };
}
