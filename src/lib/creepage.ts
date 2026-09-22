// Clearance and creepage per IEC 60664-1 (tables in src/data/iec60664.ts).
import { A2, F1, F2, F4, PREFERRED_IMPULSE, type MaterialGroup } from '../data/iec60664';

export type Pollution = 1 | 2 | 3 | 4;
export type Field = 'A' | 'B';

/** Table F.1: rated impulse voltage (V) for a line-to-neutral voltage and overvoltage category 1…4. */
export function ratedImpulse(vLN: number, ovc: 1 | 2 | 3 | 4): { v: number; row: number } | null {
  const row = F1.find((r) => vLN <= r.v + 1e-9);
  return row ? { v: row.ovc[ovc - 1], row: row.v } : null;
}

/**
 * Impulse voltage for reinforced insulation (5.1.6): one step higher in the preferred series, or 160 %
 * of the basic value when it is not a preferred value.
 */
export function reinforcedImpulse(v: number): number {
  const i = PREFERRED_IMPULSE.findIndex((p) => Math.abs(p - v) < 1e-6);
  if (i >= 0) return i + 1 < PREFERRED_IMPULSE.length ? PREFERRED_IMPULSE[i + 1] : 1.6 * v;
  return 1.6 * v;
}

function f2Cell(row: (typeof F2)[number], field: Field, pd: Pollution, pwb: boolean): number {
  const cols = field === 'A' ? row.a : row.b;
  if (pd === 4) return Math.max(cols[2], 1.6); // footnote 6: PD4 as PD3, at least 1.6 mm
  if (pd === 2 && pwb && (field === 'A' ? row.floorA2 : row.floorB2)) return Math.max(cols[0], 0.04);
  return cols[pd - 1];
}

export interface ClearanceResult {
  mm: number;
  rowKv: number; // table row used (or the upper row when interpolating)
  interpolated: boolean;
  outOfRange: boolean;
}

/** Table F.2 minimum clearance (mm, ≤ 2000 m) for an impulse withstand voltage in kV. */
export function clearance(kv: number, field: Field, pd: Pollution, pwb: boolean, interpolate: boolean): ClearanceResult {
  const last = F2[F2.length - 1];
  if (kv > last.kv + 1e-9) return { mm: NaN, rowKv: last.kv, interpolated: false, outOfRange: true };
  const iHi = F2.findIndex((r) => r.kv >= kv - 1e-9);
  const hi = F2[iHi];
  if (!interpolate || iHi === 0 || Math.abs(hi.kv - kv) < 1e-9) return { mm: f2Cell(hi, field, pd, pwb), rowKv: hi.kv, interpolated: false, outOfRange: false };
  const lo = F2[iHi - 1];
  const t = (kv - lo.kv) / (hi.kv - lo.kv);
  const a = f2Cell(lo, field, pd, pwb);
  const b = f2Cell(hi, field, pd, pwb);
  return { mm: a + t * (b - a), rowKv: hi.kv, interpolated: true, outOfRange: false };
}

/** Table A.2 factor for the altitude (next higher tabulated altitude, conservative). */
export function altitudeFactor(m: number): { k: number; row: number } | null {
  if (m <= 2000) return { k: 1, row: 2000 };
  const row = A2.find((r) => r.m >= m - 1e-9);
  return row ? { k: row.k, row: row.m } : null;
}

export interface CreepageResult {
  mm: number;
  rowV: number;
  interpolated: boolean;
  column: string;
  provisional: boolean;
  outOfRange: boolean;
  ribUsed: boolean;
}

type Row = (typeof F4)[number];

function f4Cell(r: Row, pd: Pollution, mg: MaterialGroup, pwb: boolean, rib: boolean): { v: number | null; column: string; ribUsed: boolean } {
  const gi = mg === 'I' ? 0 : mg === 'II' ? 1 : 2;
  if (pwb && pd === 1) return { v: r.pwb1, column: 'printed wiring material, PD1', ribUsed: false };
  if (pwb && pd === 2 && mg !== 'IIIb') return { v: r.pwb2, column: 'printed wiring material, PD2', ribUsed: false };
  if (pd === 1) return { v: r.pd1, column: 'PD1, all material groups', ribUsed: false };
  if (pd === 2) return { v: r.pd2[gi], column: `PD2, material group ${gi === 2 ? 'III' : mg}`, ribUsed: false };
  if (pd === 3) {
    if (!r.pd3) return { v: null, column: 'PD3', ribUsed: false };
    const ribV = rib ? r.pd3rib?.[gi] : null;
    if (ribV != null) return { v: ribV, column: `PD3, material group ${gi === 2 ? 'III' : mg}, with rib`, ribUsed: true };
    return { v: r.pd3[gi], column: `PD3, material group ${gi === 2 ? 'III' : mg}`, ribUsed: false };
  }
  return { v: null, column: 'PD4', ribUsed: false };
}

/**
 * Table F.4 creepage (mm) for an RMS voltage. Voltages below the first row use the 10 V row; linear
 * interpolation between rows is permitted by the standard. For printed wiring material the dedicated
 * columns apply only where the table has values (up to 1000 V); above that the general columns apply.
 */
export function creepage(vrms: number, pd: Pollution, mg: MaterialGroup, pwb: boolean, rib: boolean, interpolate: boolean): CreepageResult {
  const v = Math.max(vrms, F4[0].v);
  const last = F4[F4.length - 1];
  const empty = (column: string, outOfRange = true): CreepageResult => ({ mm: NaN, rowV: last.v, interpolated: false, column, provisional: false, outOfRange, ribUsed: false });
  if (pd === 4) return empty('PD4 is not covered by the creepage table', false);
  if (v > last.v + 1e-9) return empty('above the table');
  const iHi = F4.findIndex((r) => r.v >= v - 1e-9);
  const hi = F4[iHi];
  // printed-wiring columns end at 1000 V: fall back to the general columns for the whole lookup
  const usePwb = pwb && hi.pwb1 !== null && (iHi === 0 || F4[iHi - 1].pwb1 !== null);
  const cHi = f4Cell(hi, pd, mg, usePwb, rib);
  if (cHi.v === null) return empty(`${cHi.column}: no value at ${hi.v} V`);
  if (!interpolate || iHi === 0 || Math.abs(hi.v - v) < 1e-9) {
    return { mm: cHi.v, rowV: hi.v, interpolated: false, column: cHi.column, provisional: !!hi.provisional, outOfRange: false, ribUsed: cHi.ribUsed };
  }
  const lo = F4[iHi - 1];
  const cLo = f4Cell(lo, pd, mg, usePwb, rib && cHi.ribUsed);
  // a rib value exists only from some rows on: interpolate like-for-like, else use the upper row
  const loV = cLo.v ?? cHi.v;
  const t = (v - lo.v) / (hi.v - lo.v);
  return { mm: loV + t * (cHi.v - loV), rowV: hi.v, interpolated: true, column: cHi.column, provisional: !!hi.provisional, outOfRange: false, ribUsed: cHi.ribUsed };
}
