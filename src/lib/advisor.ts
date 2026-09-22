// Stackup advisor: filter candidate stackups by requirements, plan the unique
// line-design jobs, and rank the results.
import type { Accuracy } from './fieldsolver';
import type { DesignRequest, DesignResult, SpacingRule } from './design';
import { copperCount, geometryForLayer, type Stackup, type StackupGeometry } from './stackups';

export interface Requirement {
  id: string;
  label: string;
  kind: 'se' | 'diff';
  z: number;
  spacing: 'fixed' | 'ratio';
  s: number; // mm, for fixed spacing
  ratio: number; // S/W for ratio spacing
  where: 'outer' | 'inner' | 'all';
}

export interface Constraints {
  layersMin: number;
  layersMax: number;
  thickMin: number;
  thickMax: number;
  signalMin: number;
  minW: number;
  minS: number;
  maxW: number;
  etch: number;
  priority: 'cost' | 'margin';
}

export interface PlannedLayer {
  layerId: string;
  name: string;
  outer: boolean;
  sg: StackupGeometry;
}

export interface Plan {
  stackup: Stackup;
  layers: PlannedLayer[];
  jobs: { reqId: string; layerId: string; key: string }[];
}

export const nominalThickness = (s: Stackup) => s.nominal ?? s.layers.filter((l) => l.kind !== 'mask').reduce((a, l) => a + l.t, 0);

const r5 = (v: number | undefined) => (v === undefined ? undefined : Math.round(v * 1e5) / 1e5);

export function ruleFor(req: Requirement, c: Constraints): SpacingRule | undefined {
  if (req.kind !== 'diff') return undefined;
  return { mode: req.spacing, s: req.s, ratio: req.ratio, minS: c.minS };
}

export function planAdvice(stackups: Stackup[], reqs: Requirement[], c: Constraints, accuracy: Accuracy) {
  const plans: Plan[] = [];
  const rejected: { stackup: Stackup; reason: string }[] = [];
  const jobs = new Map<string, DesignRequest>();

  for (const s of stackups) {
    const n = copperCount(s);
    const t = nominalThickness(s);
    if (n < c.layersMin || n > c.layersMax) continue;
    if (t < c.thickMin - 1e-6 || t > c.thickMax + 1e-6) continue;

    const layers: PlannedLayer[] = [];
    for (const l of s.layers) {
      if (l.kind !== 'copper' || l.role === 'plane') continue;
      const sg = geometryForLayer(s, l.id);
      if (sg) layers.push({ layerId: l.id, name: l.name, outer: sg.outer, sg });
    }
    if (layers.length < c.signalMin) {
      rejected.push({ stackup: s, reason: `${layers.length} referenced signal layers, ${c.signalMin} needed` });
      continue;
    }
    const plan: Plan = { stackup: s, layers, jobs: [] };
    let bad = '';
    for (const req of reqs) {
      const use = layers.filter((l) => req.where === 'all' || (req.where === 'outer') === l.outer);
      if (!use.length) {
        bad = `no ${req.where} signal layer for ${req.label}`;
        break;
      }
      for (const l of use) {
        const g = l.sg;
        const sg: StackupGeometry = {
          ...g,
          h: r5(g.h)!,
          er: r5(g.er)!,
          h2: r5(g.h2),
          er2: r5(g.er2),
          t: r5(g.t)!,
          note: '',
        };
        const dreq: DesignRequest = { sg, kind: req.kind, target: req.z, etch: c.etch, rule: ruleFor(req, c), accuracy };
        const key = JSON.stringify([sg.type, sg.h, sg.er, sg.h2, sg.er2, sg.t, sg.mask, req.kind, req.z, dreq.rule, c.etch, accuracy]);
        jobs.set(key, dreq);
        plan.jobs.push({ reqId: req.id, layerId: l.layerId, key });
      }
    }
    if (bad) rejected.push({ stackup: s, reason: bad });
    else plans.push(plan);
  }
  return { plans, rejected, jobs };
}

export interface Cell {
  layer: string;
  result?: DesignResult;
  error?: string;
  ok: boolean;
  why?: string;
}

export interface Ranked {
  plan: Plan;
  ok: boolean;
  margin: number; // min W/minW over all feasible lines
  reasons: string[];
  cells: Record<string, Cell[]>;
}

export function rankAdvice(plans: Plan[], reqs: Requirement[], c: Constraints, results: Map<string, DesignResult | string>): Ranked[] {
  const ranked: Ranked[] = plans.map((plan) => {
    const cells: Record<string, Cell[]> = {};
    const reasons: string[] = [];
    let margin = Infinity;
    for (const job of plan.jobs) {
      const layer = plan.layers.find((l) => l.layerId === job.layerId)!;
      const res = results.get(job.key);
      const cell: Cell = { layer: layer.name, ok: false };
      if (res === undefined) cell.why = 'not solved';
      else if (typeof res === 'string') cell.error = cell.why = res;
      else {
        cell.result = res;
        if (res.w < c.minW) cell.why = `W ${res.w.toFixed(3)} mm below the ${c.minW} mm minimum`;
        else if (res.w > c.maxW) cell.why = `W ${res.w.toFixed(3)} mm above the ${c.maxW} mm routing maximum`;
        else if (res.s !== undefined && res.s < c.minS - 1e-9) cell.why = `S below the ${c.minS} mm minimum`;
        else {
          cell.ok = true;
          margin = Math.min(margin, res.w / c.minW);
        }
      }
      (cells[job.reqId] ??= []).push(cell);
      if (!cell.ok) {
        const req = reqs.find((r) => r.id === job.reqId);
        reasons.push(`${req?.label ?? job.reqId} on ${layer.name}: ${cell.why}`);
      }
    }
    return { plan, ok: reasons.length === 0, margin: Number.isFinite(margin) ? margin : 0, reasons, cells };
  });
  const layers = (r: Ranked) => copperCount(r.plan.stackup);
  ranked.sort((a, b) => {
    if (a.ok !== b.ok) return a.ok ? -1 : 1;
    if (c.priority === 'cost' && layers(a) !== layers(b)) return layers(a) - layers(b);
    if (Math.abs(a.margin - b.margin) > 1e-9) return b.margin - a.margin;
    return layers(a) - layers(b);
  });
  return ranked;
}
