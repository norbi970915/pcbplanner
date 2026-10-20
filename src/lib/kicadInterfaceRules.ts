// The Interface Design Rules page and the active KiCad project: which interface, stackup and layer
// "From KiCad Project" selects, and the routed pair checked against the interface the page shows
// ("Your routing"). Tested in kicadInterfaceRules.test.ts.
//
// Nothing is measured or solved differently from the routing check of /kicad-project: the pair is the
// routing check's own item (routeGroups), each layer is solved with the same requests (analyseRequest,
// lossRequest with the routing check's default settings: solder mask from the pick, ED copper, loss at
// the interface's Nyquist frequency) through the same solve cache, and judged by checkItem. Only the
// target differs when the user picks another interface on the page.
import { INTERFACES } from '../data/interfaces';
import { FOILS } from '../data/laminates';
import { analyseRequest, lossRequest, type ImpedanceSettings, type LayerPlan } from './kicadImpedance';
import { projectCalc, projectPlans, routeGroups, type KicadPickValues, type KicadProjectData } from './kicadProjectQueries';
import { checkItem, familyOf, itemLayers, pairCoupled, solveWidth, suggestTarget, targetById, type Fmt, type ItemResult, type LayerSolve, type RouteItem, type Target } from './kicadRouting';
import type { LossRequest, SolverResponse } from './solver.worker';
import type { Stackup } from './stackups';

/** The routing check's settings when /kicad-project is left at its defaults (KICAD_ANALYSIS_DEFAULTS: fixed gap 0.127 mm, 4 GHz, ED foil). */
export const ROUTING_CHECK_SETTINGS: ImpedanceSettings = { gapRule: 'fixed', gap: 0.127, fGHz: 4, rqUm: (FOILS.find((f) => f.id === 'ed') ?? FOILS[0]).rq };

const isInterface = (id: string | undefined) => !!id && INTERFACES.some((s) => s.id === id);

/**
 * The interface for a picked pair or net class: the routing check's suggested target for the pair when
 * it is an interface, else the interface named by the class (and, for a pair, its net names), else a
 * single-ended interface named by the class (DDR4, RGMII, …). Null when none is recognised.
 */
export function interfaceForPick(v: KicadPickValues): { id: string; why: string } | null {
  const p = v.pair;
  if (p?.suggested && isInterface(p.suggested.id)) return { id: p.suggested.id, why: `the routing check's target for ${p.name}` };
  const cls = v.netClass?.name ?? p?.cls.name;
  const named = cls && cls !== 'Default' ? cls : '';
  const fam = familyOf(named, ...(p ? [p.p, p.n] : []));
  const pairT = suggestTarget('pair', named || 'Default', fam);
  if (isInterface(pairT.id)) return { id: pairT.id, why: pairT.why };
  if (named && !p) {
    const se = suggestTarget('se', named, undefined);
    if (isInterface(se.id)) return { id: se.id, why: se.why };
  }
  return null;
}

/** The project stackup as the page solves it: with solder mask (default) or without. Null when the board has no usable stackup. */
export const projectStackupFor = (d: KicadProjectData, mask = true): Stackup | null => projectCalc(d, mask);

/** True when a saved stackup is the project's (the comparison saveImportedStackup makes before saving again). */
export function isProjectStackup(s: Stackup | undefined, d: KicadProjectData | null, mask = true): boolean {
  const p = d ? projectStackupFor(d, mask) : null;
  return !!s && !!p && JSON.stringify([s.name, s.layers]) === JSON.stringify([p.name, p.layers]);
}

/** Interface Rules URL fields Apply sets. */
export interface InterfaceRulesPatch {
  ifid?: string;
  stk?: string;
  lay?: string;
  region?: string;
  len?: number;
  kpair?: string;
  kmask?: boolean;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * What Apply sets on the Interface Rules page: the interface (interfaceForPick, kept when none is
 * recognised), the project stackup saved once to My stackups (`save`, normally saveImportedStackup)
 * and the chosen layer in it, the route length (the longer net of the pair) and the pair to compare.
 * `note` says what was set and why.
 */
export function interfaceRulesPatch(d: KicadProjectData, v: KicadPickValues, current: { ifid: string }, save: (s: Stackup) => string): { patch: InterfaceRulesPatch; note: string } {
  const patch: InterfaceRulesPatch = {};
  const said: string[] = [];
  const itf = interfaceForPick(v);
  const name = (id: string) => INTERFACES.find((s) => s.id === id)?.name ?? id;
  if (itf) {
    patch.ifid = itf.id;
    said.push(`Interface ${name(itf.id)} (${itf.why})`);
  } else {
    const what = v.pair ? v.pair.name : v.netClass ? `net class ${v.netClass.name}` : '';
    said.push(what ? `No interface recognised for ${what}; ${name(current.ifid)} is kept` : `Interface ${name(current.ifid)} is kept`);
  }
  if (v.layer) {
    const mask = v.layer.mask;
    const stack = projectStackupFor(d, mask);
    const layer = stack?.layers.find((l) => l.kind === 'copper' && l.name === v.layer!.layer);
    if (stack && layer) {
      patch.stk = save(stack);
      patch.lay = layer.id;
      patch.region = '';
      patch.kmask = mask;
      said.push(`stackup of ${v.boardName}${mask ? '' : ' without solder mask'} on ${layer.name} (${v.layer.kind}${v.layer.refs.length ? ` over ${v.layer.refs.join(' / ')}` : ''})`);
    }
  } else said.push('the project has no signal layer with a stackup, so the stackup is kept');
  if (v.pair) {
    patch.kpair = v.pair.name;
    if (v.pair.len > 0) {
      patch.len = r3(v.pair.len);
      said.push(`route length ${r3(v.pair.len)} mm (the longer net of the pair)`);
    } else said.push(`${v.pair.name} has no routed tracks`);
  } else patch.kpair = '';
  return { patch, note: `${said.join(', ')}.` };
}

/* ------------------------------------------------------------------ the routed pair against the interface */

export type SolveReq = ReturnType<typeof analyseRequest> | { type: 'loss'; req: LossRequest };

/** Everything needed to check one routed pair: the routing check's item, the target and the solver requests per layer. */
export interface PairCheckPlan {
  item: RouteItem;
  target: Target | null;
  /** The pair is differential and the interface single-ended: no impedance target. */
  kindMismatch: boolean;
  plans: LayerPlan[];
  lossGHz: number;
  z: Map<string, SolveReq>; // by layer name
  loss: Map<string, SolveReq | { error: string }>;
  /** Copper layers whose zone fills are in the file (reference-plane gaps are checked on these). */
  filled: string[];
}

/** Loss frequency for a target, as the routing check takes it (kicadRoutingSolve.lossGHz). */
const lossGHzOf = (t: Target | null, fallback: number) => (t ? (INTERFACES.find((s) => s.id === t.id)?.nyquistGHz ?? fallback) : fallback);

/**
 * Plan the check of a pair (by base name) against an interface id, on the project stackup with or
 * without solder mask. Null when the project has no such pair. Layers without a coupled section, or
 * without a reference plane, get no request, as in the routing check.
 */
export function pairCheckPlan(d: KicadProjectData, pair: string, targetId: string, mask = true, settings: ImpedanceSettings = ROUTING_CHECK_SETTINGS): PairCheckPlan | null {
  const item = routeGroups(d)
    .flatMap((g) => g.items)
    .find((i) => i.kind === 'pair' && (i.name === pair || i.pair?.p === pair || i.pair?.n === pair));
  if (!item) return null;
  const t = targetById(targetId);
  const kindMismatch = !!t && t.kind !== 'diff';
  const target = kindMismatch ? null : t;
  const calc = projectCalc(d, mask);
  const plans = calc ? projectPlans(d, mask) : [];
  const f = lossGHzOf(target, settings.fGHz);
  const z = new Map<string, SolveReq>();
  const loss = new Map<string, SolveReq | { error: string }>();
  for (const l of itemLayers(item)) {
    const plan = plans.find((pl) => pl.layer.name === l.layer && pl.sg);
    if (!plan || !calc || !pairCoupled(l)) continue;
    const w = solveWidth(l);
    z.set(l.layer, analyseRequest(plan.sg!, w, l.gap));
    if (!target) continue;
    try {
      loss.set(l.layer, { type: 'loss', req: lossRequest(calc, plan, w, l.gap, true, { ...settings, fGHz: f }) });
    } catch (e) {
      loss.set(l.layer, { error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { item, target, kindMismatch, plans, lossGHz: f, z, loss, filled: d.board.routing?.filled ?? [] };
}

export type ZAnswer = { z?: number; eeff?: number; err?: string };
export type LossAnswer = { db?: number; err?: string };

/** A solver answer as the routing check reads it: Zdiff and the odd-mode εeff for a pair, else Z and εeff. */
export function readZ(r: SolverResponse, diff = true): ZAnswer {
  if (!r.ok || !r.result) return { err: r.ok ? 'no result' : r.error };
  return diff ? { z: r.result.zdiff, eeff: r.result.odd?.eeff } : { z: r.result.se?.z, eeff: r.result.se?.eeff };
}

/** A loss answer in dB/in at the request's frequency, as the routing check reads it. */
export const readLoss = (r: SolverResponse): LossAnswer => (r.ok && r.loss ? { db: (r.loss.points[0].alpha / 1000) * 25.4 } : { err: r.ok ? 'no result' : r.error });

/** The check of the pair with the answers so far (missing ones are pending), exactly as the routing check builds it. */
export function pairCheckResult(plan: PairCheckPlan, zs: Record<string, ZAnswer>, losses: Record<string, LossAnswer>, L: Fmt, unit = 'mm'): ItemResult {
  const byLayer = new Map(plan.plans.map((pl) => [pl.layer.name, pl]));
  const solves: Record<string, LayerSolve> = {};
  for (const l of itemLayers(plan.item)) {
    if (!byLayer.get(l.layer)?.sg) {
      solves[l.layer] = { noRef: true };
      continue;
    }
    const zr = zs[l.layer];
    const lr = losses[l.layer];
    const planes = byLayer.get(l.layer)!.refs;
    const refs = planes.filter((r) => plan.filled.includes(r));
    solves[l.layer] = zr ? { z: zr.z, eeff: zr.eeff, err: zr.err, dbPerIn: lr?.db, lossPending: !!plan.target && !lr && !zr.err, refs, planes } : { pending: true, planes };
  }
  return checkItem(plan.item, plan.target, solves, L, unit);
}

/** Run every request of a plan with `solve` and return the finished check (used by the tests; the page solves on the worker pool). */
export async function checkPair(plan: PairCheckPlan, solve: (req: SolveReq) => Promise<SolverResponse>, L: Fmt, unit = 'mm'): Promise<ItemResult> {
  const zs: Record<string, ZAnswer> = {};
  const losses: Record<string, LossAnswer> = {};
  await Promise.all([
    ...[...plan.z].map(async ([k, req]) => {
      zs[k] = readZ(await solve(req));
    }),
    ...[...plan.loss].map(async ([k, req]) => {
      losses[k] = 'error' in req ? { err: req.error } : readLoss(await solve(req));
    }),
  ]);
  return pairCheckResult(plan, zs, losses, L, unit);
}
