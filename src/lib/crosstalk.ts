// Crosstalk between two coupled lines from their even/odd-mode solution.
import type { SolveResult } from './fieldsolver';
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
