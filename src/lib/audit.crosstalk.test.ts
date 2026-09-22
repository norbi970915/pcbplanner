import { describe, expect, it } from 'vitest';
import { xtalk } from './crosstalk';
import { solve } from './fieldsolver';
import { C0 } from './units';

// Tool defaults (Crosstalk.tsx:11): W 0.15, T 0.035, S 0.15, H 0.1, εr 4.1, no mask here.
const r = solve({ w: 0.15, t: 0.035, yTrace: 0.1, diff: true, s: 0.15, slabs: [{ y0: 0, y1: 0.1, er: 4.1 }] });

describe('audit: crosstalk formulas (Crosstalk.tsx)', () => {
  it('NEXT grows linearly below the saturation length and saturates at Kb·V (Bogatin, SI&PI Simplified ch. 10)', () => {
    const short = xtalk(r, 5, 100, 1);
    const long = xtalk(r, 500, 100, 1);
    expect(long.saturated).toBe(true);
    expect(long.next).toBeCloseTo(long.kb, 12);
    expect(short.next).toBeCloseTo(short.kb * (2 * short.td) / 100e-12, 12);
    // Lsat = tr·v/2
    expect(short.satLenMm).toBeCloseTo((100e-12 * C0) / Math.sqrt((r.even!.eeff + r.odd!.eeff) / 2) / 2 * 1e3, -0.3);
  });

  it('FEXT for weak coupling = V·ΔTD/(2·tr) (mode decomposition, hand-derived)', () => {
    // Even and odd modes each carry V/2; at the victim far end they subtract:
    // v(t) = V/2·[ramp(t−TDe) − ramp(t−TDo)], peak V/2·|ΔTD|/tr while |ΔTD| < tr.
    const x = xtalk(r, 50, 100, 1);
    expect(x.fext).toBeGreaterThan(0);
    // 50 mm, 100 ps: ΔTD = 27.3 ps → 13.7 % (weak-coupling regime, ΔTD < tr)
    expect(x.fext).toBeCloseTo(((50e-3 / C0) * (Math.sqrt(r.even!.eeff) - Math.sqrt(r.odd!.eeff))) / (2 * 100e-12), 12);
    expect(x.fext).toBeLessThan(0.5);
  });

  // BUG: FEXT is not limited when the modal delay difference exceeds the rise time.
  // From the same mode decomposition, |V_FEXT| ≤ V/2 (it saturates at V/2·min(|ΔTD|, tr)/tr).
  // With the tool's default geometry, 300 mm coupled and a 30 ps edge, ΔTD ≈ 164 ps and
  // the tool reports FEXT ≈ 2.7·V (273 % of the aggressor, 9 V on a 3.3 V swing).
  // Fix in Crosstalk.tsx:35: fext = v·Math.sign(dT)·Math.min(Math.abs(dT), tr)/(2·tr), dT = tdE − tdO,
  // and flag "FEXT saturated" in the UI.
  it('FEXT never exceeds half the aggressor swing (fixed: saturates at V/2)', () => {
    const x = xtalk(r, 300, 30, 1);
    expect(Math.abs(x.fext)).toBeLessThanOrEqual(0.5);
  });
});
