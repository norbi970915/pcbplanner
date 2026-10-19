// Inputs of the Trace Loss calculator (/trace-loss, src/tools/TraceLoss.tsx) and the loss request it
// sends to the solver worker. Kept apart from the page so the KiCad mapping (kicadLossTiming.ts) can
// be tested against the routing check without rendering anything.
import { laminateById, maskById } from '../data/laminates';
import { djordjevicSarkar, type DielectricSpec } from './dielectric';
import type { Accuracy, Geometry } from './fieldsolver';
import type { RoughnessModel } from './loss';
import { logSpace } from './pdn';
import { parsePlies, pliesThickness, slabsAbove, slabsBelow } from './plies';
import type { LossRequest } from './solver.worker';

export type TraceLossLineType = 'microstrip' | 'embedded' | 'stripline';

export const TRACE_LOSS_DEFAULTS = {
  type: 'microstrip',
  mode: 'diff',
  mask: true,
  w: 0.12,
  etch: 0.0127,
  t: 0.035,
  s: 0.2,
  h: 0.1,
  h2: 0.1,
  mat: 's1141-2116',
  er: 4.2,
  df: 0.02,
  f0: 1,
  mat2: 's1141-2116',
  er2: 4.2,
  df2: 0.02,
  f02: 1,
  c1: 0.0305,
  c2: 0.0152,
  mmat: 'psr4000bn',
  erm: 3.8,
  dfm: 0.025,
  fm: 1,
  rough: 'hammerstad',
  foil: 'ed',
  rq: 3.2,
  hr: 0.6651,
  sr: 4.887,
  dl: '', // stacked dielectric below the trace: "t:dk:df,…" from the plane up to the trace
  dl2: '', // stacked dielectric above the trace, from the trace outward
  temp: 20,
  len: 254,
  f: 4,
  fmax: 20,
  acc: 'normal',
};
export type TraceLossInputs = typeof TRACE_LOSS_DEFAULTS;

function specOf(mat: string, er: number, df: number, f0: number, lookup: typeof laminateById): DielectricSpec {
  const l = mat !== 'custom' ? lookup(mat) : undefined;
  return l ? { dk: l.dk, df: l.df, f0: l.fGHz * 1e9 } : { dk: er, df, f0: f0 * 1e9 };
}

/** The loss request for the inputs (the sweep, then the frequency of interest last), or the input errors. */
export function buildTraceLossRequest(p: TraceLossInputs): { req: LossRequest | null; errors: string[] } {
  const errors: string[] = [];
  const type = p.type as TraceLossLineType;
  const diff = p.mode === 'diff';
  const pos = (v: number, name: string) => {
    if (!(v > 0)) errors.push(`${name} must be greater than 0.`);
  };
  pos(p.w, 'Width W');
  pos(p.t, 'Thickness T');
  if (!p.dl.trim()) pos(p.h, 'Height H');
  if (type !== 'microstrip' && !p.dl2.trim()) pos(p.h2, 'Height H2');
  if (diff) pos(p.s, 'Spacing S');
  pos(p.len, 'Length');
  pos(p.f, 'Frequency');
  if (!(p.fmax > 0.01 && p.fmax <= 200)) errors.push('Sweep limit must be between 0.01 and 200 GHz.');
  if (p.f > 200) errors.push('Frequency must be at most 200 GHz.');
  if (p.etch < 0 || p.etch >= p.w) errors.push('Etch must be between 0 and the trace width.');
  const checkMat = (mat: string, er: number, df: number, f0: number, what: string) => {
    if (mat !== 'custom') return;
    if (!(er >= 1 && er <= 100)) errors.push(`${what} Dk must be between 1 and 100.`);
    if (!(df >= 0 && df < 1)) errors.push(`${what} Df must be between 0 and 1.`);
    if (!(f0 > 0 && f0 <= 200)) errors.push(`${what} datasheet frequency must be between 0 and 200 GHz.`);
  };
  checkMat(p.mat, p.er, p.df, p.f0, 'Dielectric');
  if (type !== 'microstrip') checkMat(p.mat2, p.er2, p.df2, p.f02, 'Upper dielectric');
  const hasMask = type === 'microstrip' && p.mask && (p.c1 > 0 || p.c2 > 0);
  if (hasMask) checkMat(p.mmat, p.erm, p.dfm, p.fm, 'Mask');
  if (type === 'microstrip' && p.mask && !(p.c1 >= 0 && p.c2 >= 0)) errors.push('Mask thickness cannot be negative.');
  if (p.rough === 'hammerstad' || p.rough === 'groiss') {
    if (!(p.rq >= 0 && p.rq <= 20)) errors.push('RMS roughness must be between 0 and 20 µm.');
  }
  if (p.rough === 'huray') {
    if (!(p.hr > 0 && p.hr <= 10)) errors.push('Sphere radius must be between 0 and 10 µm.');
    if (!(p.sr >= 0 && p.sr <= 20)) errors.push('Surface ratio must be between 0 and 20.');
  }
  const below = parsePlies(p.dl);
  const above = parsePlies(p.dl2);
  if (below === null) errors.push('Check the dielectric plies below the trace: each needs a thickness, a Dk of at least 1 and a Df below 1.');
  if (above === null) errors.push('Check the dielectric plies above the trace: each needs a thickness, a Dk of at least 1 and a Df below 1.');
  if (errors.length || !below || !above) return { req: null, errors };

  const fRef = p.f * 1e9;
  const s1 = specOf(p.mat, p.er, p.df, p.f0, laminateById);
  const s2 = specOf(p.mat2, p.er2, p.df2, p.f02, laminateById);
  const sm = specOf(p.mmat, p.erm, p.dfm, p.fm, maskById);
  const dkAt = (s: DielectricSpec) => djordjevicSarkar(s).dk(fRef);

  // stacked plies: every prepreg / core gets its own Dk, Df and slab
  const plySpec = (x: { dk: number; df?: number; mat?: string; fGHz?: number }, f0: number): DielectricSpec =>
    x.mat ? specOf(x.mat, x.dk, x.df ?? 0, f0, laminateById) : { dk: x.dk, df: x.df ?? 0, f0: (x.fGHz ?? f0) * 1e9 };
  const hBelow = below.length ? pliesThickness(below) : p.h;
  const hAbove = above.length ? pliesThickness(above) : p.h2;
  const belowSpecs = below.length ? below.map((x) => plySpec(x, p.f0)) : [s1];
  const aboveSpecs = above.length ? above.map((x) => plySpec(x, p.f02)) : [s2];
  const geom: Geometry = {
    w: p.w,
    wTop: p.etch > 0 ? p.w - p.etch : undefined,
    t: p.t,
    yTrace: hBelow,
    diff,
    s: diff ? p.s : undefined,
    slabs: below.length ? slabsBelow(below).map((sl, i) => ({ ...sl, er: dkAt(belowSpecs[i]) })) : [{ y0: 0, y1: hBelow, er: dkAt(s1) }],
  };
  const slabSpecs = [...belowSpecs];
  if (type === 'microstrip') {
    if (hasMask) geom.mask = { surfaceY: hBelow, overSubstrate: p.c1, overTrace: p.c2, er: dkAt(sm) };
  } else {
    if (above.length) geom.slabs.push(...slabsAbove(above, hBelow, p.t).map((sl, i) => ({ ...sl, er: dkAt(aboveSpecs[i]) })));
    else geom.slabs.push({ y0: hBelow, y1: hBelow + p.t + hAbove, er: dkAt(s2) });
    slabSpecs.push(...aboveSpecs);
    if (type === 'stripline') geom.topPlane = hBelow + p.t + hAbove;
  }
  const freqs = [...logSpace(1e7, p.fmax * 1e9, 81), fRef];
  return {
    req: {
      geom,
      slabSpecs,
      maskSpec: geom.mask ? sm : undefined,
      fRef,
      freqs,
      rough: { model: p.rough as RoughnessModel, rq: p.rq, radius: p.hr, sr: p.sr },
      tempC: p.temp,
      accuracy: p.acc as Accuracy,
    },
    errors,
  };
}
