// Crosstalk between two coupled lines from their even/odd-mode solution.
import type { Geometry, SolveResult } from './fieldsolver';
import { buildImpedanceGeometry, IMPEDANCE_DEFAULTS } from './impedanceGeometry';
import { nextCoefficient } from './signal';
import { C0 } from './units';

/**
 * NEXT and FEXT for a coupled length `lenMm`, 10–90 % rise time `trPs` and aggressor swing `v`.
 * Mode decomposition: each mode carries V/2; the far-end victim voltage is
 * V/2·[ramp(t−TDe) − ramp(t−TDo)], whose peak is V/2·min(|ΔTD|, tr)/tr (never above V/2).
 * NEXT rises until the round trip 2·TD equals tr, then saturates at Kb·V.
 */
export function xtalk(r: SolveResult, lenMm: number, trPs: number, v: number) {
  const ze = r.even!.z;
  const zo = r.odd!.z;
  const kb = nextCoefficient(ze, zo);
  const tdE = (lenMm * 1e-3 * Math.sqrt(r.even!.eeff)) / C0;
  const tdO = (lenMm * 1e-3 * Math.sqrt(r.odd!.eeff)) / C0;
  const td = (tdE + tdO) / 2;
  const tr = trPs * 1e-12;
  const next = kb * v * Math.min(1, (2 * td) / tr);
  const dT = tdE - tdO;
  const fext = (v * Math.sign(dT) * Math.min(Math.abs(dT), tr)) / (2 * tr);
  return { kb, next, fext, td, dT, saturated: 2 * td >= tr, fextSaturated: Math.abs(dT) >= tr, satLenMm: (tr / 2 / td) * lenMm };
}

/**
 * Inputs of the Crosstalk Calculator (its URL fields). The cross-section fields mean what they mean in
 * the Impedance Calculator: type, H/εr below, H2/εr2 above (stripline) or the cover (embedded
 * microstrip), solder mask C1/C2/εr, stacked plies dl/dl2 ("t:dk,…") and etch (top narrower by).
 */
export const CROSSTALK_DEFAULTS = {
  type: 'microstrip',
  mask: true,
  w: 0.15,
  t: 0.035,
  s: 0.15,
  h: 0.1,
  er: 4.1,
  h2: 0.2,
  er2: 4.2,
  c1: 0.0305,
  c2: 0.0152,
  erm: 3.8,
  etch: 0,
  dl: '',
  dl2: '',
  len: 50,
  tr: 100,
  v: 3.3,
};
export type CrosstalkInputs = typeof CROSSTALK_DEFAULTS;

/** The coupled pair's cross-section at edge spacing `s`, built as the Impedance Calculator builds a differential pair. */
export function crosstalkGeometry(p: CrosstalkInputs, s: number): { geom: Geometry | null; errors: string[] } {
  const type = p.type === 'stripline' || p.type === 'embedded' ? p.type : 'microstrip';
  return buildImpedanceGeometry({
    ...IMPEDANCE_DEFAULTS,
    type,
    mode: 'diff',
    coupling: 'edge',
    cpw: false,
    resin: false,
    mat: 'custom',
    mat2: 'custom',
    mask: p.mask,
    w: p.w,
    etch: p.etch,
    t: p.t,
    s,
    h: p.h,
    er: p.er,
    h2: p.h2,
    er2: p.er2,
    c1: p.c1,
    c2: p.c2,
    erm: p.erm,
    dl: p.dl,
    dl2: p.dl2,
  });
}
