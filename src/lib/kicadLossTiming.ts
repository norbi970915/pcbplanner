// What "From KiCad Project → Apply" sets in the Trace Loss calculator (/trace-loss) and in the delay
// and timing tool (/timing), built from the values the picker resolved (kicadProjectQueries.ts).
//
// Both mappings follow the routing check of /kicad-impedance so the numbers agree (tested in
// kicadLossTiming.test.ts):
//   trace loss  the cross-section and each ply's Dk, Df and reference frequency are taken from the
//               routing check's own loss request (kicadImpedance.lossRequest), the width (and gap)
//               are the ones it solves (solveWidth, the measured gap), and the frequency is the
//               Nyquist frequency of the item's suggested interface target (kicadRoutingSolve.lossGHz).
//   timing      εeff is the field-solver εeff of the measured line on the chosen layer
//               (kicadImpedance.analyseRequest: odd mode for a pair, as the routing check uses for
//               the skew in ps), the lengths are the routed lengths of the two nets.
import { INTERFACES } from '../data/interfaces';
import { FOILS } from '../data/laminates';
import { ACCURACY, analyseRequest, ETCH, lossRequest } from './kicadImpedance';
import { projectCalc, projectPlans, type KicadProjectData, type KicadPickValues, type TargetRef } from './kicadProjectQueries';
import { targetById } from './kicadRouting';
import { formatPlies } from './plies';
import { delayPsPerMm } from './signal';
import { fmt } from './units';
import type { TraceLossInputs } from './traceLossRequest';

const r6 = (v: number) => Number(v.toFixed(6));
type Fmt = (mm: number) => string;

/** Copper model of the routing check with the /kicad-impedance defaults (ED foil, Hammerstad, 20 °C; KICAD_ANALYSIS_DEFAULTS). */
export const ROUTING_CHECK_FOIL = 'ed';
export const ROUTING_CHECK_RQ = FOILS.find((f) => f.id === ROUTING_CHECK_FOIL)?.rq ?? 3.2;
/** Loss frequency of /kicad-impedance when the target names no interface (its default). */
export const ROUTING_CHECK_FGHZ = 4;

const specOf = (t: TargetRef | null | undefined) => (t ? (targetById(t.id)?.spec ?? INTERFACES.find((s) => s.id === t.id)) : undefined);

/* ------------------------------------------------------------------ trace loss */

/** Which length goes into the Trace Loss calculator: the routed length on the chosen layer, or the whole route. */
export type LossLength = 'layer' | 'route';

/**
 * Trace Loss inputs for picked values: the layer's cross-section with every ply's Dk/Df/reference
 * frequency, solder mask, etch and accuracy as the routing check solves it; W (and S) as routed on
 * that layer (else from the net class); the length on that layer or of the whole route; the Nyquist
 * frequency of the item's interface. A pair takes precedence over a net. Roughness and temperature
 * stay the user's; the note says when they differ from the routing check's.
 */
export function traceLossPatch(
  d: KicadProjectData,
  v: KicadPickValues,
  cur: TraceLossInputs,
  o: { length: LossLength; L: Fmt },
): { patch: Partial<TraceLossInputs>; note: string } | { error: string } {
  if (!v.layer) return { error: 'That layer has no reference plane in the KiCad project.' };
  const { L } = o;
  const g = v.layer;
  const name = g.layer;
  const calc = projectCalc(d, g.mask);
  const plan = projectPlans(d, g.mask).find((p) => p.layer.name === name);
  if (!calc || !plan?.sg) return { error: 'That layer has no reference plane in the KiCad project.' };
  const sg = plan.sg;

  const from: string[] = [];
  let diff = cur.mode === 'diff';
  let w = cur.w;
  let s = cur.s;
  let len: number | undefined;
  const item = v.pair ?? v.net;
  if (v.pair && v.net) from.push(`${v.net.name} left out: the pair is used`);
  if (v.pair) {
    const p = v.pair;
    const pl = v.pairLayer;
    diff = true;
    if (pl && pl.gap !== undefined) {
      w = pl.wSolve;
      s = pl.gap;
      from.push(`W ${L(w)} and S ${L(s)} as routed: ${p.name} on ${name}${pl.checked ? '' : ' (a short section near the pads, which the routing check leaves out)'}`);
    } else {
      if (p.cls.dpWidth !== undefined) w = p.cls.dpWidth;
      if (p.cls.dpGap !== undefined) s = p.cls.dpGap;
      from.push(`${p.name} is not routed as a pair on ${name}; W and S from net class ${p.cls.name}`);
    }
    const route = (p.lenP + p.lenN) / 2;
    if (o.length === 'layer' && pl) {
      len = pl.len;
      from.push(`length ${L(len)} on ${name} (mean of the two traces)`);
    } else {
      len = route;
      from.push(`length ${L(len)}: the whole route, mean of the two traces${p.layers.length > 1 ? `, over ${p.layers.map((x) => x.layer).join(' and ')}, all with the ${name} cross-section` : ''}`);
    }
  } else if (v.net) {
    const n = v.net;
    const nl = v.netLayer;
    diff = false;
    if (nl) {
      w = nl.w;
      from.push(`W ${L(w)} as routed: ${n.name} on ${name}`);
    } else {
      if (n.cls.trackWidth !== undefined) w = n.cls.trackWidth;
      from.push(`${n.name} is not routed on ${name}; W from net class ${n.cls.name}`);
    }
    if (o.length === 'layer' && nl) {
      len = nl.len;
      from.push(`length ${L(len)} on ${name}`);
    } else {
      len = n.len;
      from.push(`length ${L(len)}: the whole route${n.layers.length > 1 ? ` over ${n.layersUsed.join(' and ')}, all with the ${name} cross-section` : ''}`);
    }
  }

  const spec = specOf(item?.suggested);
  const f = spec ? spec.nyquistGHz : cur.f;
  const req = lossRequest(calc, plan, w, diff ? s : undefined, diff, { gapRule: 'fixed', gap: s, fGHz: f, rqUm: ROUTING_CHECK_RQ });
  const specs = req.slabSpecs;
  const below = sg.below?.length ? sg.below : [{ t: sg.h, er: sg.er }];
  const nb = below.length;
  const plies = (ps: { t: number }[], sp: typeof specs) => (ps.length > 1 ? formatPlies(ps.map((x, i) => ({ t: x.t, dk: sp[i].dk, df: sp[i].df, fGHz: sp[i].f0 / 1e9 }))) : '');
  const b0 = specs[0];
  const patch: Partial<TraceLossInputs> = {
    type: sg.type,
    h: r6(sg.h),
    t: r6(sg.t),
    etch: ETCH,
    acc: ACCURACY,
    mat: 'custom',
    er: r6(b0.dk),
    df: r6(b0.df),
    f0: r6(b0.f0 / 1e9),
    dl: plies(below, specs),
    mode: diff ? 'diff' : 'se',
    w: r6(w),
    ...(diff ? { s: r6(s) } : {}),
    ...(len !== undefined ? { len: r6(len) } : {}),
    f,
    ...(f > cur.fmax ? { fmax: Math.min(200, Math.ceil(f * 2.5)) } : {}),
  };
  if (sg.type === 'microstrip') {
    patch.dl2 = '';
    patch.mask = !!sg.mask;
    if (sg.mask && req.maskSpec) Object.assign(patch, { c1: r6(sg.mask.c1), c2: r6(sg.mask.c2), mmat: 'custom', erm: r6(req.maskSpec.dk), dfm: r6(req.maskSpec.df), fm: r6(req.maskSpec.f0 / 1e9) });
  } else {
    const above = sg.above?.length ? sg.above : [{ t: sg.h2 ?? 0, er: sg.er2 ?? sg.er }];
    const as = specs.slice(nb);
    Object.assign(patch, { dl2: plies(above, as), h2: r6(sg.h2 ?? above.reduce((a, x) => a + x.t, 0)), mat2: 'custom', er2: r6(as[0].dk), df2: r6(as[0].df), f02: r6(as[0].f0 / 1e9) });
  }

  const fText = spec ? `Loss at ${f} GHz, the Nyquist frequency of ${spec.name}` : `Frequency kept at ${f} GHz${item ? ` (${item.name} has no interface target; the routing check uses the loss frequency of /kicad-impedance)` : ''}`;
  const model =
    cur.rough !== 'hammerstad' || cur.rq !== ROUTING_CHECK_RQ || cur.temp !== 20
      ? ` Your copper settings differ from the routing check's default (Hammerstad, Rq ${ROUTING_CHECK_RQ} µm, 20 °C), so the loss will too.`
      : '';
  const note = `${name}: ${g.kind}${g.refs.length ? ` over ${g.refs.join(' / ')}` : ''}, Dk and Df of each ply from ${v.boardName}.${from.length ? ` ${from.map((x) => x[0].toUpperCase() + x.slice(1)).join('. ')}.` : ''} ${fText}.${model}`;
  return { patch, note };
}

/* ------------------------------------------------------------------ delay and timing */

export interface TimingSource {
  req: ReturnType<typeof analyseRequest>;
  diff: boolean;
  layer: string;
  w: number;
  s?: number;
  what: string; // the line solved, in a few words
}

/** The field-solver run that gives εeff for picked values: the pair (odd mode) or the net on the chosen layer. */
export function timingSource(v: KicadPickValues, L: Fmt): TimingSource | { error: string } {
  if (!v.layer) return { error: 'That layer has no reference plane in the KiCad project.' };
  const layer = v.layer.layer;
  const sg = v.layer.sg;
  if (v.pair) {
    const pl = v.pairLayer;
    if (pl && pl.gap !== undefined) return { req: analyseRequest(sg, pl.wSolve, pl.gap), diff: true, layer, w: pl.wSolve, s: pl.gap, what: `${v.pair.name} on ${layer}, odd mode at W ${L(pl.wSolve)}, S ${L(pl.gap)} as routed` };
    const { dpWidth, dpGap, name } = v.pair.cls;
    if (dpWidth === undefined || dpGap === undefined) return { error: `${v.pair.name} is not routed as a pair on ${layer} and net class ${name} has no diff-pair width and gap. Choose the layer it is routed on.` };
    return { req: analyseRequest(sg, dpWidth, dpGap), diff: true, layer, w: dpWidth, s: dpGap, what: `odd mode on ${layer} at the diff-pair width and gap of net class ${name} (${v.pair.name} is not routed as a pair there)` };
  }
  if (v.net) {
    const nl = v.netLayer;
    const w = nl?.w ?? v.net.cls.trackWidth;
    if (w === undefined) return { error: `${v.net.name} is not routed on ${layer} and net class ${v.net.cls.name} has no track width. Choose the layer it is routed on.` };
    return { req: analyseRequest(sg, w), diff: false, layer, w, what: nl ? `${v.net.name} on ${layer} at W ${L(w)} as routed` : `${layer} at the track width of net class ${v.net.cls.name} (${v.net.name} is not routed there)` };
  }
  return { error: 'Choose a pair or a net.' };
}

/**
 * Timing inputs once εeff is solved: εeff entered directly; a pair fills both lengths (P and N), a
 * net alone the first length, a pair and a net the pair's longer net and the net (pair against a
 * clock). The allowed skew becomes the intra-pair limit of the pair's interface, in ps on this layer.
 */
export function timingPatch(v: KicadPickValues, src: TimingSource, eeff: number, L: Fmt): { patch: { src: 'direct'; eeff: number; len?: number; lenB?: number; skew?: number }; note: string } {
  const patch: { src: 'direct'; eeff: number; len?: number; lenB?: number; skew?: number } = { src: 'direct', eeff: r6(eeff) };
  const parts: string[] = [`εeff ${eeff.toFixed(4)} from the field solver: ${src.what}`];
  const pm = delayPsPerMm(eeff);
  if (v.pair && v.net) {
    patch.len = v.pair.len;
    patch.lenB = v.net.len;
    parts.push(`Trace length ${L(v.pair.len)} (the longer net of ${v.pair.name}), second trace ${L(v.net.len)} (${v.net.name})`);
  } else if (v.pair) {
    patch.len = v.pair.lenP; // unrounded, so the skew is the routing check's to the last digit
    patch.lenB = v.pair.lenN;
    parts.push(`Lengths ${L(v.pair.lenP)} (${v.pair.p}) and ${L(v.pair.lenN)} (${v.pair.n}), skew ${fmt(v.pair.skewMm * pm, 3)} ps`);
    const spec = specOf(v.pair.suggested);
    if (spec?.intraPairPs !== undefined) {
      patch.skew = spec.intraPairPs;
      parts.push(`Allowed skew: the ${spec.intraPairPs} ps intra-pair limit of ${spec.name}`);
    } else if (spec?.intraPairMm !== undefined) {
      patch.skew = Number((spec.intraPairMm * pm).toFixed(4));
      parts.push(`Allowed skew: the ${L(spec.intraPairMm)} intra-pair limit of ${spec.name}, ${patch.skew} ps on ${src.layer}`);
    }
    if (v.pair.mainLayer && v.pair.mainLayer !== src.layer) parts.push(`The routing check takes the delay of ${v.pair.mainLayer}, where most of the pair runs`);
  } else if (v.net) {
    patch.len = v.net.len;
    parts.push(`Trace length ${L(v.net.len)} (${v.net.name})`);
  }
  return { patch, note: `${parts.join('. ')}.` };
}
