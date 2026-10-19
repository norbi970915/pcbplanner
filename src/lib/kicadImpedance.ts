// Per-layer impedance plan for an imported board stackup: which line each signal layer forms, the
// design requests for the impedance targets (the same requests the Layer Stack Manager sends to the
// solver pool) and the loss request built from the stackup's own Dk/Df per ply.
import { toSolverGeometry, type DesignRequest, type SpacingRule } from './design';
import { djordjevicSarkar, type DielectricSpec } from './dielectric';
import type { Accuracy, Geometry, SolveOptions } from './fieldsolver';
import type { LossRequest } from './solver.worker';
import { impedanceQuery } from './stackupRegions';
import { DEFAULT_DF, MASK_DF, geometryForLayer, type Layer, type Ply, type Stackup, type StackupGeometry } from './stackups';

export type TargetId = 'se50' | 'd90' | 'd100' | 'd85';

export interface Target {
  id: TargetId;
  kind: 'se' | 'diff';
  z: number;
  label: string;
}

export const TARGETS: Target[] = [
  { id: 'se50', kind: 'se', z: 50, label: '50 Ω SE' },
  { id: 'd90', kind: 'diff', z: 90, label: '90 Ω diff' },
  { id: 'd100', kind: 'diff', z: 100, label: '100 Ω diff' },
  { id: 'd85', kind: 'diff', z: 85, label: '85 Ω diff' },
];

/** Trapezoid etch and solver accuracy of the Layer Stack Manager's impedance view, so both pages agree. */
export const ETCH = 0.0127;
export const ACCURACY: Accuracy = 'normal';
/** Reference frequency assumed for Dk/Df when the file gives none (KiCad's default spec_frequency is 1 GHz). */
export const DEFAULT_F0_GHZ = 1;

export interface ImpedanceSettings {
  gapRule: 'fixed' | 'width';
  gap: number; // mm, for the fixed rule
  fGHz: number; // loss frequency
  rqUm: number; // copper RMS roughness (Hammerstad)
}

export type LineKind = 'microstrip' | 'coated microstrip' | 'embedded microstrip' | 'stripline' | 'dual stripline';

export interface LayerPlan {
  layer: Layer;
  sg: StackupGeometry | null;
  kind?: LineKind;
  refs: string[]; // reference plane names, nearest above first
}

/** The stackup used for the calculation: without solder mask when the mask is switched off. */
export const calcStackup = (s: Stackup, mask: boolean): Stackup => (mask ? s : { ...s, layers: s.layers.filter((l) => l.kind !== 'mask') });

/** Nearest plane in one direction and the signal layers passed on the way. */
function scan(s: Stackup, idx: number, dir: 1 | -1) {
  let crossed = 0;
  for (let i = idx + dir; i >= 0 && i < s.layers.length; i += dir) {
    const l = s.layers[i];
    if (l.kind !== 'copper') continue;
    if (l.role === 'plane') return { plane: l, crossed };
    crossed++;
  }
  return { plane: undefined, crossed };
}

/** Every signal copper layer with its cross-section, line type and reference planes. */
export function planLayers(s: Stackup): LayerPlan[] {
  return s.layers.flatMap((layer, idx) => {
    if (layer.kind !== 'copper' || layer.role === 'plane') return [];
    const sg = geometryForLayer(s, layer.id);
    const up = scan(s, idx, -1);
    const down = scan(s, idx, 1);
    const refs = [up.plane?.name, down.plane?.name].filter((x): x is string => !!x);
    let kind: LineKind | undefined;
    if (sg?.type === 'microstrip') kind = sg.mask ? 'coated microstrip' : 'microstrip';
    else if (sg?.type === 'embedded') kind = 'embedded microstrip';
    else if (sg?.type === 'stripline') kind = up.crossed || down.crossed ? 'dual stripline' : 'stripline';
    return [{ layer, sg, kind, refs }];
  });
}

export function spacingRule(o: ImpedanceSettings): SpacingRule {
  return o.gapRule === 'width' ? { mode: 'ratio', s: o.gap, ratio: 1, minS: 0 } : { mode: 'fixed', s: o.gap, ratio: 1, minS: 0 };
}

/** The design request for one target: identical to the Layer Stack Manager's for the same layer. */
export function designRequest(sg: StackupGeometry, t: Target, o: ImpedanceSettings): DesignRequest {
  const base = { sg, etch: ETCH, accuracy: ACCURACY };
  return t.kind === 'se' ? { ...base, kind: 'se', target: t.z } : { ...base, kind: 'diff', target: t.z, rule: spacingRule(o) };
}

/**
 * Field-solver run that analyses a measured line (the opposite of a design request): the same
 * cross-section, etch and accuracy as designLine uses for each width it tries, so a width designed for
 * a target and then analysed gives the target back. A pair is solved when `sp` is given.
 */
export function analyseRequest(sg: StackupGeometry, w: number, sp?: number): { type: 'solve'; geom: Geometry; opts: SolveOptions } {
  const diff = sp !== undefined;
  return { type: 'solve', geom: toSolverGeometry(sg, w, diff, sp, ETCH), opts: { accuracy: ACCURACY, even: false } };
}

/** Loss tangent and Dk/Df reference frequency of each ply; an intermediate copper layer takes the run's average Df. */
function plySpecs(plies: Ply[] | undefined): DielectricSpec[] {
  const known = (plies ?? []).filter((p) => p.df !== undefined);
  const avg = known.length ? known.reduce((a, p) => a + p.t * (p.df as number), 0) / known.reduce((a, p) => a + p.t, 0) : DEFAULT_DF;
  return (plies ?? []).map((p) => ({ dk: p.er, df: p.df ?? avg, f0: (p.fGHz ?? DEFAULT_F0_GHZ) * 1e9 }));
}

/**
 * Loss run for a designed line. Every ply keeps its own Dk and Df from the stackup; each Dk is moved
 * to the loss frequency with the wideband Debye (Djordjevic–Sarkar) model before the field is solved,
 * as the Interface Rules page does.
 */
export function lossRequest(s: Stackup, plan: LayerPlan, w: number, sp: number | undefined, diff: boolean, o: ImpedanceSettings): LossRequest {
  const sg = plan.sg!;
  const geom = toSolverGeometry(sg, w, diff, sp, ETCH);
  const specs = [...plySpecs(sg.below?.length ? sg.below : [{ t: sg.h, er: sg.er }]), ...(sg.type === 'microstrip' ? [] : plySpecs(sg.above?.length ? sg.above : [{ t: sg.h2 ?? 0, er: sg.er2 ?? sg.er }]))];
  if (specs.length !== geom.slabs.length) throw new Error('Internal error: ply and slab counts differ.');
  const fHz = o.fGHz * 1e9;
  geom.slabs = geom.slabs.map((sl, i) => ({ ...sl, er: djordjevicSarkar(specs[i]).dk(fHz) }));
  let maskSpec: DielectricSpec | undefined;
  if (geom.mask) {
    const coppers = s.layers.filter((l) => l.kind === 'copper');
    const top = coppers[0]?.id === plan.layer.id;
    const i = s.layers.findIndex((l) => l.id === plan.layer.id);
    const mask = (top ? s.layers.slice(0, i).reverse() : s.layers.slice(i + 1)).find((l) => l.kind === 'mask');
    maskSpec = { dk: geom.mask.er, df: mask?.df ?? MASK_DF, f0: (mask?.fGHz ?? DEFAULT_F0_GHZ) * 1e9 };
    geom.mask = { ...geom.mask, er: djordjevicSarkar(maskSpec).dk(fHz) };
  }
  return { geom, slabSpecs: specs, maskSpec, fRef: fHz, freqs: [fHz], rough: { model: 'hammerstad', rq: o.rqUm }, tempC: 20, accuracy: ACCURACY };
}

/** Link to the Impedance Calculator with this layer's cross-section and the designed line. */
export function impedanceLink(sg: StackupGeometry, t: Target, w: number, sp?: number): string {
  const extra: Record<string, string> = { w: String(Number(w.toFixed(5))), etch: String(ETCH), acc: ACCURACY, target: String(t.z) };
  if (t.kind === 'diff') {
    extra.mode = 'diff';
    extra.s = String(Number((sp ?? w).toFixed(5)));
  }
  return `/impedance?${impedanceQuery(sg, extra).toString()}`;
}

/** A CSV cell, quoted when needed. */
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export const toCsv = (rows: string[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

/** Plain-text table with aligned columns. */
export function toText(rows: string[][]): string {
  const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => (r[c] ?? '').length)));
  return rows.map((r) => r.map((v, c) => v.padEnd(widths[c])).join('  ').trimEnd()).join('\n') + '\n';
}
