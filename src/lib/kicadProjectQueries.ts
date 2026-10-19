// Questions a tool can ask of the active KiCad project (src/state/kicadProjectStore.ts): its signal
// layers and their cross-sections, copper thickness, net classes, nets, differential pairs, and the
// measured width, gap, length and skew of a net or pair. Plain data in, plain data out (tested in
// kicadProjectQueries.test.ts).
//
// Nothing is measured or modelled again here: the layer cross-section is the one /kicad-impedance
// solves (kicadStackup → calcStackup → planLayers, the Layer Stack Manager's geometry), and net and
// pair figures come from the routing summary the import worker built (kicadRouting.ts), read the way
// the routing check reads them (itemLayers, solveWidth, pairCoupled, buildGroups).
import type { Accuracy } from './fieldsolver';
import { guessRoles, kicadStackup, type ConvertNote, type KicadBoard, type RoleGuess } from './kicadImport';
import { ACCURACY, calcStackup, ETCH, planLayers, type LayerPlan, type LineKind } from './kicadImpedance';
import {
  buildGroups,
  itemLayers,
  netClassResolver,
  pairCoupled,
  solveWidth,
  targetById,
  type KicadProject,
  type NetClassDef,
  type NetLayerStat,
  type ResolvedClass,
  type RouteGroup,
  type RouteItem,
} from './kicadRouting';
import { formatPlies } from './plies';
import type { CopperRole, Stackup, StackupGeometry } from './stackups';

/** The parsed active project: what the store holds once a board is read. Treat it as immutable. */
export interface KicadProjectData {
  boardName: string; // file name of the .kicad_pcb
  board: KicadBoard;
  project: KicadProject | null; // net classes from the .kicad_pro, when one was loaded
  projectName?: string;
  projectError?: string; // the .kicad_pro could not be read
  otherBoards: string[]; // other .kicad_pcb files found in a dropped folder (not read)
  roleOverrides: Record<string, CopperRole>; // layer roles the user changed (layer name → role)
}

/** File name without the extension. */
export const projectTitle = (d: Pick<KicadProjectData, 'boardName'>) => d.boardName.replace(/\.kicad_pcb$/i, '');

// derived values are cached per data object (a new object is made whenever anything changes)
const memo = <K extends object, V>(f: (k: K) => V) => {
  const cache = new WeakMap<K, V>();
  return (k: K): V => {
    if (cache.has(k)) return cache.get(k) as V;
    const v = f(k);
    cache.set(k, v);
    return v;
  };
};

const guessesOf = memo((b: KicadBoard) => guessRoles(b));

/** Detected role of every copper layer, and the role in use (the user's override, else the detected one). */
export function layerRoles(d: KicadProjectData): { roles: Record<string, CopperRole>; guesses: Record<string, RoleGuess> } {
  const guesses = guessesOf(d.board);
  const roles: Record<string, CopperRole> = {};
  for (const [k, g] of Object.entries(guesses)) roles[k] = d.roleOverrides[k] ?? g.role;
  return { roles, guesses };
}

export type ProjectStackup = { stackup: Stackup; notes: ConvertNote[] } | { error: string } | null;

/** The board's stackup in the site's model with the roles in use; null when the file has no stackup section. */
export const projectStackup = memo((d: KicadProjectData): ProjectStackup => {
  try {
    return kicadStackup(d.board, { name: `${projectTitle(d)} (KiCad)`, roles: layerRoles(d).roles });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
});

const okStackup = (d: KicadProjectData) => {
  const s = projectStackup(d);
  return s && 'stackup' in s ? s.stackup : null;
};

const calcCache = new WeakMap<KicadProjectData, { on: Stackup | null; off: Stackup | null; plansOn?: LayerPlan[]; plansOff?: LayerPlan[] }>();
function calcEntry(d: KicadProjectData) {
  let e = calcCache.get(d);
  if (!e) {
    const s = okStackup(d);
    e = { on: s ? calcStackup(s, true) : null, off: s ? calcStackup(s, false) : null };
    calcCache.set(d, e);
  }
  return e;
}

/** The stackup the solves use: with solder mask (default) or without. */
export const projectCalc = (d: KicadProjectData, mask = true): Stackup | null => (mask ? calcEntry(d).on : calcEntry(d).off);

/** Every signal layer's plan (cross-section, line type, reference planes), as /kicad-impedance builds it. */
export function projectPlans(d: KicadProjectData, mask = true): LayerPlan[] {
  const e = calcEntry(d);
  const calc = mask ? e.on : e.off;
  if (!calc) return [];
  if (mask) return (e.plansOn ??= planLayers(calc));
  return (e.plansOff ??= planLayers(calc));
}

export interface SignalLayer {
  name: string; // F.Cu, In1.Cu, …
  id: string; // layer id in the converted stackup
  kind?: LineKind; // undefined when there is no reference plane
  refs: string[]; // reference planes, nearest above first
  referenced: boolean; // has a reference plane, so an impedance can be given
  outer: boolean;
  thickness: number; // copper thickness, mm
  routedMm: number; // track length on this layer
}

/** Signal (non-plane) copper layers, top to bottom. Empty when the board has no usable stackup. */
export function signalLayers(d: KicadProjectData, opts: { mask?: boolean } = {}): SignalLayer[] {
  const plans = projectPlans(d, opts.mask ?? true);
  const calc = projectCalc(d, opts.mask ?? true);
  const coppers = calc ? calc.layers.filter((l) => l.kind === 'copper') : [];
  return plans.map((pl) => ({
    name: pl.layer.name,
    id: pl.layer.id,
    kind: pl.kind,
    refs: pl.refs,
    referenced: !!pl.sg,
    outer: coppers[0]?.id === pl.layer.id || coppers[coppers.length - 1]?.id === pl.layer.id,
    thickness: pl.layer.t,
    routedMm: d.board.copper.find((c) => c.name === pl.layer.name)?.routedMm ?? 0,
  }));
}

/**
 * The Impedance Calculator's inputs (its URL fields, src/lib/impedanceGeometry.ts IMPEDANCE_DEFAULTS)
 * for a layer's cross-section, set the way its own "From Stackup" section sets them. W, S, mode and
 * target are not included: they come from the net class or the routed pair.
 */
export interface ImpedanceFields {
  type: 'microstrip' | 'embedded' | 'stripline';
  coupling: 'edge';
  resin: false;
  cpw: false;
  h: number;
  er: number;
  dl: string; // plies below the trace when there are several ('' for one)
  dl2: string; // plies above the trace when there are several
  mat: 'custom';
  t: number;
  h2?: number;
  er2?: number;
  mat2?: 'custom';
  mask?: boolean; // microstrip only
  c1?: number;
  c2?: number;
  erm?: number;
  etch: number; // the 0.5 mil trapezoid of the Layer Stack Manager and /kicad-impedance
  acc: Accuracy;
}

export interface LayerGeometry {
  layer: string;
  kind: LineKind;
  refs: string[];
  mask: boolean; // the stackup was taken with solder mask
  /** The cross-section /kicad-impedance and the Layer Stack Manager solve on this layer. */
  sg: StackupGeometry;
  etch: number;
  accuracy: Accuracy;
  impedance: ImpedanceFields;
  note: string; // what the cross-section is, in a few words
}

const asPlies = (ps?: { t: number; er: number }[]) => (ps && ps.length > 1 ? formatPlies(ps.map((x) => ({ t: x.t, dk: x.er }))) : '');

/** Impedance Calculator fields for a stackup cross-section (the mapping of Impedance.tsx's applyLayer, plus etch and accuracy). */
export function impedanceFields(g: StackupGeometry): ImpedanceFields {
  return {
    type: g.type,
    coupling: 'edge',
    resin: false,
    cpw: false,
    h: g.h,
    er: g.er,
    dl: asPlies(g.below),
    dl2: asPlies(g.above),
    mat: 'custom',
    t: g.t,
    ...(g.h2 !== undefined ? { h2: g.h2, er2: g.er2 ?? g.er, mat2: 'custom' as const } : {}),
    ...(g.type === 'microstrip' ? { mask: !!g.mask, ...(g.mask ? { c1: g.mask.c1, c2: g.mask.c2, erm: g.mask.er } : {}) } : {}),
    etch: ETCH,
    acc: ACCURACY,
  };
}

/**
 * Cross-section of a signal layer, exactly as /kicad-impedance solves it, or null when the layer is
 * not a signal layer with a reference plane. `mask` (default true) takes the outer layers as
 * solder-mask coated microstrip, as the Solder Mask switch of /kicad-impedance does.
 */
export function layerGeometry(d: KicadProjectData, layer: string, opts: { mask?: boolean } = {}): LayerGeometry | null {
  const mask = opts.mask ?? true;
  const pl = projectPlans(d, mask).find((p) => p.layer.name === layer);
  if (!pl?.sg || !pl.kind) return null;
  return { layer, kind: pl.kind, refs: pl.refs, mask, sg: pl.sg, etch: ETCH, accuracy: ACCURACY, impedance: impedanceFields(pl.sg), note: pl.sg.note };
}

/** Copper thickness of a layer from the stackup (KiCad's 0.035 mm default when the file has none); undefined for an unknown layer. */
export function copperThickness(d: KicadProjectData, layer: string): number | undefined {
  const s = okStackup(d);
  const l = s?.layers.find((x) => x.kind === 'copper' && x.name === layer);
  if (l) return l.t;
  const item = d.board.stackup?.find((i) => i.name === layer);
  return item ? (item.subs[0]?.t ?? 0.035) : d.board.copper.some((c) => c.name === layer) ? 0.035 : undefined;
}

/* ------------------------------------------------------------------ nets, classes and pairs */

export interface TargetRef {
  id: string;
  label: string;
  kind: 'se' | 'diff';
  z: number;
  min: number;
  max: number;
}

const resolverOf = memo((d: KicadProjectData) => netClassResolver(d.project));
const groupsCache = new WeakMap<KicadBoard, { project: KicadProject | null; groups: RouteGroup[] }>();
/** The routing check's groups (pairs by class and interface, checked single-ended nets by class). */
export function routeGroups(d: KicadProjectData): RouteGroup[] {
  if (!d.board.routing) return [];
  const hit = groupsCache.get(d.board);
  if (hit && hit.project === d.project) return hit.groups;
  const groups = buildGroups(d.board.routing, netClassResolver(d.project));
  groupsCache.set(d.board, { project: d.project, groups });
  return groups;
}

const targetRef = (id: string | undefined): TargetRef | null => {
  const t = id ? targetById(id) : null;
  return t ? { id: t.id, label: t.label, kind: t.kind, z: t.z, min: t.min, max: t.max } : null;
};

/** Class that decides for a net (Default without a project file). */
export const netClassOf = (d: KicadProjectData, net: string): ResolvedClass => resolverOf(d)(net);

export interface NetClassSummary {
  name: string;
  priority: number;
  trackWidth?: number; // mm
  dpWidth?: number;
  dpGap?: number;
  nets: number; // routed nets whose deciding class this is
  pairs: number; // differential pairs (by their positive net)
  isDefault: boolean;
}

/** Net classes of the project file (Default first), with the routed nets and pairs in each. Without a project file: Default only. */
export function netClasses(d: KicadProjectData): NetClassSummary[] {
  const resolve = resolverOf(d);
  const nets = new Map<string, number>();
  for (const n of d.board.routing?.nets ?? []) {
    const c = resolve(n.name).name;
    nets.set(c, (nets.get(c) ?? 0) + 1);
  }
  const pairsBy = new Map<string, number>();
  for (const p of d.board.routing?.pairs ?? []) {
    const c = resolve(p.p).name;
    pairsBy.set(c, (pairsBy.get(c) ?? 0) + 1);
  }
  const defs: NetClassDef[] = d.project?.classes.length ? d.project.classes : [{ name: 'Default', priority: 2147483647 }];
  const out: NetClassSummary[] = defs.map((c) => ({
    name: c.name,
    priority: c.priority,
    trackWidth: c.trackWidth,
    dpWidth: c.dpWidth,
    dpGap: c.dpGap,
    nets: nets.get(c.name) ?? 0,
    pairs: pairsBy.get(c.name) ?? 0,
    isDefault: c.name === 'Default',
  }));
  if (!out.some((c) => c.isDefault)) out.push({ name: 'Default', priority: 2147483647, nets: nets.get('Default') ?? 0, pairs: pairsBy.get('Default') ?? 0, isDefault: true });
  return out.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
}

export interface NetInfo {
  name: string;
  cls: string;
  len: number; // mm
  vias: number;
  layers: string[]; // most length first
  pair?: string; // base name of the pair the net belongs to
}

/** Every routed net (with at least one track), by name. */
export function nets(d: KicadProjectData): NetInfo[] {
  const r = d.board.routing;
  if (!r) return [];
  const resolve = resolverOf(d);
  const pairOf = new Map<string, string>();
  for (const p of r.pairs) {
    pairOf.set(p.p, p.base);
    pairOf.set(p.n, p.base);
  }
  return r.nets.map((n) => ({ name: n.name, cls: resolve(n.name).name, len: n.len, vias: n.vias, layers: n.layers.map((l) => l.layer), ...(pairOf.has(n.name) ? { pair: pairOf.get(n.name) } : {}) }));
}

export interface PairInfo {
  name: string; // base name: the positive net without its +/P suffix
  p: string;
  n: string;
  cls: string;
  len: number; // longer of the two nets, mm
  layers: string[];
  suggested: TargetRef | null; // the routing check's suggested target
}

/** Differential pairs found with KiCad's suffix rule, by positive net. */
export function pairs(d: KicadProjectData): PairInfo[] {
  const r = d.board.routing;
  if (!r) return [];
  const resolve = resolverOf(d);
  const netBy = new Map(r.nets.map((n) => [n.name, n]));
  const suggest = suggestions(d);
  return r.pairs.map((p) => ({
    name: p.base,
    p: p.p,
    n: p.n,
    cls: resolve(p.p).name,
    len: Math.max(netBy.get(p.p)?.len ?? 0, netBy.get(p.n)?.len ?? 0),
    layers: p.layers.map((l) => l.layer),
    suggested: targetRef(suggest.get(`p:${p.p}`)),
  }));
}

const suggestions = memo((d: KicadProjectData) => {
  const m = new Map<string, string>();
  for (const g of routeGroups(d)) for (const it of g.items) m.set(it.kind === 'pair' ? `p:${it.pair!.p}` : `s:${it.name}`, g.suggest);
  return m;
});

export interface NetSummary {
  name: string;
  cls: ResolvedClass;
  len: number; // total routed length, mm (segments and arcs on all layers)
  vias: number;
  layers: NetLayerStat[]; // width (length-weighted dominant, with range) and length per layer, most length first
  layersUsed: string[];
  mainLayer?: string; // the layer with the most length
  pair?: string; // base name of its pair, when it is one
  suggested: TargetRef | null; // routing check's target for its class (single-ended nets of non-Default classes)
}

/** Width and length per layer, total length, via count and class of one net; null when the net has no tracks. */
export function netSummary(d: KicadProjectData, net: string): NetSummary | null {
  const n = d.board.routing?.nets.find((x) => x.name === net);
  if (!n) return null;
  const pair = d.board.routing!.pairs.find((p) => p.p === net || p.n === net);
  return {
    name: n.name,
    cls: resolverOf(d)(n.name),
    len: n.len,
    vias: n.vias,
    layers: n.layers,
    layersUsed: n.layers.map((l) => l.layer),
    mainLayer: n.layers[0]?.layer,
    ...(pair ? { pair: pair.base } : {}),
    suggested: targetRef(suggestions(d).get(`s:${n.name}`)),
  };
}

export interface PairLayerSummary {
  layer: string;
  len: number; // mean of the two traces on this layer, mm
  lenP: number;
  lenN: number;
  w: number; // width of the positive trace (length-weighted dominant)
  wN?: number; // width of the negative trace when it differs
  wSolve: number; // width the routing check solves with (the mean when the two differ)
  wMin: number;
  wMax: number;
  gap?: number; // dominant edge-to-edge gap of the coupled sections
  gapMin?: number;
  gapMax?: number;
  coupled: number; // coupled length, mm
  checked: boolean; // enough coupled length for the routing check to give an impedance
}

export interface PairSummary {
  name: string;
  p: string;
  n: string;
  cls: ResolvedClass;
  layers: PairLayerSummary[]; // most length first
  lenP: number; // total routed length of each net
  lenN: number;
  len: number; // the longer one
  skewMm: number; // |lenP − lenN|, the routing check's intra-pair skew (no via barrels or package lengths)
  vias: number; // both nets
  mainLayer?: string; // checked layer with the most length, else the layer with the most length
  suggested: TargetRef | null;
}

/** Per-layer width, gap and coupled length, lengths and skew of a pair (by base name or either net name); null when it is not a pair. */
export function pairSummary(d: KicadProjectData, pair: string): PairSummary | null {
  const r = d.board.routing;
  const ps = r?.pairs.find((p) => p.base === pair || p.p === pair || p.n === pair);
  if (!r || !ps) return null;
  const netBy = new Map(r.nets.map((n) => [n.name, n]));
  const item: RouteItem = { kind: 'pair', name: ps.base, cls: resolverOf(d)(ps.p), pair: ps, p: netBy.get(ps.p), n: netBy.get(ps.n) };
  const layers: PairLayerSummary[] = itemLayers(item).map((l, i) => ({
    layer: l.layer,
    len: l.len,
    lenP: ps.layers[i].lenP,
    lenN: ps.layers[i].lenN,
    w: l.w,
    ...(l.wN !== undefined ? { wN: l.wN } : {}),
    wSolve: solveWidth(l),
    wMin: l.wMin,
    wMax: l.wMax,
    ...(l.gap !== undefined ? { gap: l.gap, gapMin: l.gapMin, gapMax: l.gapMax } : {}),
    coupled: l.coupled ?? 0,
    checked: pairCoupled(l),
  }));
  const lenP = item.p?.len ?? 0;
  const lenN = item.n?.len ?? 0;
  return {
    name: ps.base,
    p: ps.p,
    n: ps.n,
    cls: item.cls,
    layers,
    lenP,
    lenN,
    len: Math.max(lenP, lenN),
    skewMm: Math.abs(lenP - lenN),
    vias: (item.p?.vias ?? 0) + (item.n?.vias ?? 0),
    mainLayer: (layers.find((l) => l.checked) ?? layers[0])?.layer,
    suggested: targetRef(suggestions(d).get(`p:${ps.p}`)),
  };
}

/* ------------------------------------------------------------------ the picker */

/** What a tool can ask the "From KiCad project" section for. 'net2' is a second net (an aggressor, a return path, …). */
export type KicadPickKind = 'layer' | 'netclass' | 'net' | 'pair' | 'net2';

export interface KicadPickSelection {
  layer?: string;
  netclass?: string;
  net?: string;
  net2?: string;
  pair?: string; // base name
  mask?: boolean; // solder mask on outer layers (default true)
}

/** Everything resolved for a selection; only the requested and chosen items are present. */
export interface KicadPickValues {
  boardName: string;
  projectName?: string;
  layer?: LayerGeometry; // the chosen signal layer's cross-section
  copperT?: number; // copper thickness of the chosen layer, mm
  netClass?: NetClassSummary;
  net?: NetSummary;
  net2?: NetSummary;
  pair?: PairSummary;
  /** The chosen pair and nets on the chosen layer (undefined when they are not routed there). */
  pairLayer?: PairLayerSummary;
  netLayer?: NetLayerStat;
  net2Layer?: NetLayerStat;
}

/** Resolve a picker selection against the project. Unknown names are left out rather than guessed. */
export function resolvePick(d: KicadProjectData, sel: KicadPickSelection): KicadPickValues {
  const v: KicadPickValues = { boardName: d.boardName, ...(d.projectName ? { projectName: d.projectName } : {}) };
  if (sel.layer) {
    const g = layerGeometry(d, sel.layer, { mask: sel.mask ?? true });
    if (g) v.layer = g;
    const t = copperThickness(d, sel.layer);
    if (t !== undefined) v.copperT = t;
  }
  if (sel.netclass) {
    const c = netClasses(d).find((x) => x.name === sel.netclass);
    if (c) v.netClass = c;
  }
  if (sel.net) {
    const n = netSummary(d, sel.net);
    if (n) {
      v.net = n;
      if (sel.layer) v.netLayer = n.layers.find((l) => l.layer === sel.layer);
    }
  }
  if (sel.net2) {
    const n = netSummary(d, sel.net2);
    if (n) {
      v.net2 = n;
      if (sel.layer) v.net2Layer = n.layers.find((l) => l.layer === sel.layer);
    }
  }
  if (sel.pair) {
    const p = pairSummary(d, sel.pair);
    if (p) {
      v.pair = p;
      if (sel.layer) v.pairLayer = p.layers.find((l) => l.layer === sel.layer);
    }
  }
  return v;
}

/* ------------------------------------------------------------------ Impedance Calculator */

type ImpedanceState = { mode: string; target: number };
export type ImpedancePatch = Partial<ImpedanceFields> & { mode?: 'se' | 'diff'; w?: number; s?: number; target?: number };

const r5 = (v: number) => Number(v.toFixed(5));

/**
 * Impedance Calculator inputs for picked values: the layer's cross-section, and W (and S) from the
 * routed pair on that layer (its measured width and gap, as the routing check solves them), else from
 * the routed net on that layer, else from the net class (diff-pair width and gap when the calculator
 * is in differential mode or a pair was chosen, else the track width). A pair switches to
 * differential mode, a single net to single-ended; the target becomes the routing check's suggestion
 * when there is one. Returns null without a layer. `note` says where W and S came from.
 */
export function impedancePatch(v: KicadPickValues, current: ImpedanceState): { patch: ImpedancePatch; note: string } | null {
  if (!v.layer) return null;
  const patch: ImpedancePatch = { ...v.layer.impedance };
  const L = v.layer.layer;
  const diff = v.pair ? true : v.net ? false : current.mode === 'diff';
  const from: string[] = [];
  const cls = v.netClass ?? (v.pair ? { name: v.pair.cls.name, trackWidth: v.pair.cls.trackWidth, dpWidth: v.pair.cls.dpWidth, dpGap: v.pair.cls.dpGap } : v.net ? { name: v.net.cls.name, trackWidth: v.net.cls.trackWidth, dpWidth: undefined, dpGap: undefined } : undefined);
  if (diff && v.pair && v.pairLayer && v.pairLayer.gap !== undefined) {
    patch.w = r5(v.pairLayer.wSolve);
    patch.s = r5(v.pairLayer.gap);
    from.push(`W and S as routed: ${v.pair.name} on ${L}${v.pairLayer.checked ? '' : ' (a short section near the pads)'}`);
  } else if (!diff && v.net && v.netLayer) {
    patch.w = r5(v.netLayer.w);
    from.push(`W as routed: ${v.net.name} on ${L}`);
  } else if (cls) {
    const w = diff ? cls.dpWidth : cls.trackWidth;
    if (w !== undefined) patch.w = r5(w);
    if (diff && cls.dpGap !== undefined) patch.s = r5(cls.dpGap);
    const what = diff ? 'diff-pair width and gap' : 'track width';
    const notOnLayer = v.pair ? `${v.pair.name} is not routed on ${L}; ` : v.net ? `${v.net.name} is not routed on ${L}; ` : '';
    if (w !== undefined) from.push(`${notOnLayer}W${diff && cls.dpGap !== undefined ? ' and S' : ''}: ${what} of net class ${cls.name}`);
    else from.push(`${notOnLayer}net class ${cls.name} has no ${what}; W kept`);
  }
  patch.mode = diff ? 'diff' : 'se';
  const sugg = (v.pair ?? v.net)?.suggested;
  if (sugg && sugg.kind === (diff ? 'diff' : 'se')) patch.target = sugg.z;
  else if (diff && current.mode !== 'diff' && current.target === 50) patch.target = 100;
  else if (!diff && current.mode === 'diff' && [85, 90, 100].includes(current.target)) patch.target = 50;
  const note = `${L}: ${v.layer.kind}${v.layer.refs.length ? ` over ${v.layer.refs.join(' / ')}` : ''}, from ${v.boardName}.${from.length ? ` ${from.join('. ')}.` : ''}${patch.target !== undefined && sugg ? ` Target ${sugg.z} Ω (${sugg.label}).` : ''}`;
  return { patch, note };
}
