// Runs the routing check of the KiCad impedance page: the measured width and gap of every pair and
// checked net on every layer are analysed with the field solver on the solver worker pool (the same
// cross-section the page's width table designs on), then the loss at the target's frequency, and each
// item is checked against its target.
import { useEffect, useMemo, useState } from 'react';
import { INTERFACES } from '../data/interfaces';
import { analyseRequest, lossRequest, type ImpedanceSettings, type LayerPlan } from './kicadImpedance';
import {
  buildGroups,
  checkItem,
  itemLayers,
  netClassResolver,
  pairCoupled,
  solveWidth,
  targetById,
  type Fmt,
  type ItemResult,
  type KicadProject,
  type LayerSolve,
  type RouteGroup,
  type RouteItem,
  type RoutingSummary,
  type Target,
} from './kicadRouting';
import { runPooled } from './solverClient';
import type { SolverResponse } from './solver.worker';
import type { Stackup } from './stackups';

// solved lines and losses, shared by the width table and the routing check for this visit
export type SolveReq = Parameters<typeof runPooled>[0];
const cache = new Map<string, Promise<SolverResponse>>();
export function cachedSolve(req: SolveReq): Promise<SolverResponse> {
  const key = JSON.stringify(req);
  let p = cache.get(key);
  if (!p) {
    if (cache.size > 4000) cache.clear();
    p = runPooled(req);
    cache.set(key, p);
  }
  return p;
}

export interface CheckedItem {
  group: RouteGroup;
  item: RouteItem;
  target: Target | null;
  res: ItemResult;
}

/** Loss frequency for a target: the interface's Nyquist frequency, else the page's loss frequency. */
export const lossGHz = (t: Target | null, fallback: number) => (t ? (INTERFACES.find((s) => s.id === t.id)?.nyquistGHz ?? fallback) : fallback);

const r6 = (v: number) => Number(v.toFixed(6));
const zKey = (layer: string, w: number, s?: number) => `${layer}|${r6(w)}|${s === undefined ? '' : r6(s)}`;
const lKey = (layer: string, w: number, s: number | undefined, f: number) => `${zKey(layer, w, s)}|${f}`;

export function useRoutingCheck(o: {
  routing: RoutingSummary | undefined;
  project: KicadProject | null;
  calc: Stackup | null;
  plans: LayerPlan[];
  settings: ImpedanceSettings;
  overrides: Record<string, string>;
  L: Fmt;
  unit: string;
  enabled: boolean;
}) {
  const { routing, project, calc, plans, settings, overrides, L, unit, enabled } = o;
  const groups = useMemo(() => (routing ? buildGroups(routing, netClassResolver(project)) : []), [routing, project]);
  const targetIdOf = (g: RouteGroup) => overrides[g.key] ?? g.suggest;
  const chosen = groups.map((g) => [g.key, targetIdOf(g)] as const);

  // what has to be solved: each pair layer with a coupled section, each layer of a checked single net
  const jobs = useMemo(() => {
    const z = new Map<string, { plan: LayerPlan; w: number; s?: number }>();
    const loss = new Map<string, { plan: LayerPlan; w: number; s?: number; f: number }>();
    if (!enabled || !calc) return { z, loss };
    const byLayer = new Map(plans.filter((pl) => pl.sg).map((pl) => [pl.layer.name, pl]));
    for (const g of groups) {
      const target = targetById(overrides[g.key] ?? g.suggest);
      if (g.kind === 'se' && !target) continue;
      const f = lossGHz(target, settings.fGHz);
      for (const item of g.items) {
        for (const l of itemLayers(item)) {
          const plan = byLayer.get(l.layer);
          if (!plan || (item.kind === 'pair' && !pairCoupled(l))) continue;
          const w = solveWidth(l);
          const s = item.kind === 'pair' ? l.gap : undefined;
          z.set(zKey(l.layer, w, s), { plan, w, s });
          if (target) loss.set(lKey(l.layer, w, s, f), { plan, w, s, f });
        }
      }
    }
    return { z, loss };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, JSON.stringify(chosen), calc, plans, settings.fGHz, enabled]);

  const [zs, setZs] = useState<Record<string, { z?: number; eeff?: number; err?: string }>>({});
  const [losses, setLosses] = useState<Record<string, { db?: number; err?: string }>>({});
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const runKey = JSON.stringify([[...jobs.z.keys()], [...jobs.loss.keys()], settings, calc?.id, calc?.layers]);
  useEffect(() => {
    let alive = true;
    setZs({});
    setLosses({});
    setProgress({ done: 0, total: jobs.z.size + jobs.loss.size });
    const tick = () => alive && setProgress((x) => ({ ...x, done: x.done + 1 }));
    for (const [key, j] of jobs.z) {
      void cachedSolve(analyseRequest(j.plan.sg!, j.w, j.s)).then((r) => {
        tick();
        if (!alive) return;
        const diff = j.s !== undefined;
        const v = r.ok && r.result ? (diff ? { z: r.result.zdiff, eeff: r.result.odd?.eeff } : { z: r.result.se?.z, eeff: r.result.se?.eeff }) : { err: r.ok ? 'no result' : r.error };
        setZs((m) => ({ ...m, [key]: v }));
      });
    }
    for (const [key, j] of jobs.loss) {
      let req: SolveReq;
      try {
        req = { type: 'loss', req: lossRequest(calc!, j.plan, j.w, j.s, j.s !== undefined, { ...settings, fGHz: j.f }) };
      } catch (e) {
        tick();
        setLosses((m) => ({ ...m, [key]: { err: e instanceof Error ? e.message : String(e) } }));
        continue;
      }
      void cachedSolve(req).then((r) => {
        tick();
        if (!alive) return;
        setLosses((m) => ({ ...m, [key]: r.ok && r.loss ? { db: (r.loss.points[0].alpha / 1000) * 25.4 } : { err: r.ok ? 'no result' : r.error } }));
      });
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey]);

  const checked: CheckedItem[] = useMemo(() => {
    if (!enabled) return [];
    const byLayer = new Map(plans.map((pl) => [pl.layer.name, pl]));
    const out: CheckedItem[] = [];
    for (const g of groups) {
      const target = targetById(overrides[g.key] ?? g.suggest);
      if (g.kind === 'se' && !target) continue;
      const f = lossGHz(target, settings.fGHz);
      for (const item of g.items) {
        const solves: Record<string, LayerSolve> = {};
        for (const l of itemLayers(item)) {
          const plan = byLayer.get(l.layer);
          if (!plan?.sg) {
            solves[l.layer] = { noRef: true };
            continue;
          }
          const w = solveWidth(l);
          const s = item.kind === 'pair' ? l.gap : undefined;
          const zr = zs[zKey(l.layer, w, s)];
          const lr = losses[lKey(l.layer, w, s, f)];
          const refs = plan.refs.filter((r) => routing?.filled?.includes(r));
          solves[l.layer] = zr ? { z: zr.z, eeff: zr.eeff, err: zr.err, dbPerIn: lr?.db, lossPending: !!target && !lr && !zr.err, refs } : { pending: true };
        }
        out.push({ group: g, item, target, res: checkItem(item, target, solves, L, unit) });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, JSON.stringify(chosen), zs, losses, plans, settings.fGHz, L, unit, enabled]);

  return { groups, checked, progress, targetIdOf };
}

/** Short label of a status for tables and exports. */
export const statusLabel = (s: ItemResult['overall']) => (s === 'ok' ? '✓ pass' : s === 'warn' ? '⚠ warning' : s === 'fail' ? '✗ fail' : s === 'pending' ? 'solving…' : '—');

/** Routing check as a table: one row per item and layer (item columns repeated), for Copy and CSV. */
export function routingRows(items: CheckedItem[], L: Fmt, unit: string): string[][] {
  const head = ['Pair / net', 'Positive net', 'Negative net', 'Class', 'Target', 'Layer', `Layer length (${unit})`, `Width (${unit})`, `Gap (${unit})`, 'Coupled (%)', 'Z (Ω)', 'Layer result', `Skew (${unit})`, 'Skew (ps)', `Length (${unit})`, 'Vias', 'Loss (dB)', 'Result', 'Reasons'];
  const rows = [head];
  for (const c of items) {
    const { item, res, target } = c;
    const reasons = [...res.layers.filter((l) => l.status === 'fail' || l.status === 'warn').map((l) => l.reason), ...[res.skew, res.length, res.loss].filter((x) => x && (x.status === 'fail' || x.status === 'warn')).map((x) => x!.reason), ...res.notes].join(' | ');
    const layers = res.layers.length ? res.layers : [undefined];
    for (const l of layers) {
      rows.push([
        item.name,
        item.pair?.p ?? item.net?.name ?? '',
        item.pair?.n ?? '',
        item.cls.name,
        target ? target.label : 'not checked',
        l?.layer ?? '',
        l ? L(l.len) : '',
        l ? `${L(l.w)}${l.wN !== undefined ? `+${L(l.wN)}` : ''}${l.wMax - l.wMin > 1e-6 ? ` (${L(l.wMin)}–${L(l.wMax)})` : ''}` : '',
        l?.gap !== undefined ? L(l.gap) : '',
        l?.coupled !== undefined && l.len > 0 ? String(Math.round((100 * l.coupled) / l.len)) : '',
        l?.solve.z !== undefined ? l.solve.z.toFixed(1) : '',
        l ? statusLabel(l.status) : '',
        res.skew ? L(res.skew.mm) : '',
        res.skew?.ps !== undefined ? res.skew.ps.toFixed(1) : '',
        L(res.len),
        String(res.vias),
        res.loss ? res.loss.db.toFixed(2) : '',
        statusLabel(res.overall),
        reasons,
      ]);
    }
  }
  return rows;
}
