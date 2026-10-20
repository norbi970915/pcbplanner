import { describe, expect, it } from 'vitest';
import type { DrawPad } from './kicadDrawing';
import { checkClearance, decodeVolts, encodeVolts, segSeg, type ClearanceRequest } from './kicadClearance';

const COPPER = ['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu'];
const track = (net: string, layer: string, x1: number, y1: number, x2: number, y2: number, w: number) => ({ net, layer, w, x1, y1, x2, y2 });
const board = (over: Partial<ClearanceRequest['d']>): ClearanceRequest['d'] => ({ copper: COPPER, tracks: [], vias: [], pads: [], fills: [], ...over });
const circlePad = (net: string, x: number, y: number, dia: number, layers = ['F.Cu']): DrawPad => ({ x, y, w: dia, h: dia, angle: 0, shape: 'circle', layers, net, ref: 'J1', num: '1' });

describe('segment distance', () => {
  it('parallel, crossing and end-to-end', () => {
    expect(segSeg(0, 0, 10, 0, 0, 3, 10, 3).d).toBeCloseTo(3, 12);
    expect(segSeg(0, 0, 10, 0, 5, -1, 5, 1).d).toBeCloseTo(0, 12);
    expect(segSeg(0, 0, 1, 0, 4, 4, 4, 4).d).toBeCloseTo(5, 12);
  });
});

describe('IPC-2221 Table 6-1 clearance', () => {
  // two parallel 0.5 mm tracks with their centres 2 mm apart: 1.5 mm of gap
  const pair = (layer: string) => board({ tracks: [track('/AC_L', layer, 0, 0, 20, 0, 0.5), track('/GPIO', layer, 0, 2, 20, 2, 0.5)] });

  it('an outer layer, uncoated: 325 V needs 2.5 mm (B2), so 1.5 mm is too close', () => {
    const r = checkClearance({ d: pair('F.Cu'), volts: [{ net: '/AC_L', v: 325 }], outer: 'B2' });
    expect(r.violations).toHaveLength(1);
    const v = r.violations[0];
    expect(v.gap).toBeCloseTo(1.5, 9);
    expect(v.required).toBe(2.5);
    expect(v.column).toBe('B2');
    expect(v.other).toBe('/GPIO');
    // the marked points are on the copper edges
    expect(Math.abs(v.y2 - v.y1)).toBeCloseTo(1.5, 9);
  });

  it('the same gap passes with a permanent polymer coating (B4, 0.8 mm) and on an inner layer (B1, 0.25 mm)', () => {
    expect(checkClearance({ d: pair('F.Cu'), volts: [{ net: '/AC_L', v: 325 }], outer: 'B4' }).violations).toHaveLength(0);
    const inner = checkClearance({ d: pair('In1.Cu'), volts: [{ net: '/AC_L', v: 325 }], outer: 'B2' });
    expect(inner.violations).toHaveLength(0);
    expect(inner.closest[0].column).toBe('B1');
    expect(inner.closest[0].required).toBe(0.25);
  });

  it('two high-voltage nets use the voltage between them: +400 V to −400 V is 800 V, 2.5 + 300 × 0.005 = 4 mm on B2', () => {
    const d = board({ tracks: [track('HV+', 'B.Cu', 0, 0, 10, 0, 1), track('HV-', 'B.Cu', 0, 4, 10, 4, 1)] });
    const r = checkClearance({ d, volts: [{ net: 'HV+', v: 400 }, { net: 'HV-', v: -400 }], outer: 'B2' });
    expect(r.pairs).toHaveLength(1); // the pair counted once
    expect(r.violations[0].dv).toBe(800);
    expect(r.violations[0].required).toBeCloseTo(4, 9);
    expect(r.violations[0].gap).toBeCloseTo(3, 9);
  });

  it('a round pad against a zone fill of another net is measured to the zone edge', () => {
    // pad of 2 mm at (0, 0); a ground zone whose edge runs at x = 3: a gap of 2 mm
    const fill = { layer: 'F.Cu', net: 'GND', xy: Float64Array.from([3, -10, 20, -10, 20, 10, 3, 10]) };
    const d = board({ pads: [circlePad('/MAINS', 0, 0, 2)], fills: [fill] as never });
    const r = checkClearance({ d, volts: [{ net: '/MAINS', v: 230 * Math.SQRT2 }], outer: 'B2' });
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].gap).toBeCloseTo(2, 9);
    expect(r.violations[0].required).toBe(2.5); // 325 V
    expect(r.violations[0].other).toBe('GND');
  });

  it('copper of the same net and copper beyond reach are not findings', () => {
    const d = board({ tracks: [track('HV', 'F.Cu', 0, 0, 10, 0, 0.5), track('HV', 'F.Cu', 0, 0.6, 10, 0.6, 0.5), track('X', 'F.Cu', 0, 50, 10, 50, 0.5)] });
    const r = checkClearance({ d, volts: [{ net: 'HV', v: 100 }], outer: 'B2' });
    expect(r.pairs).toHaveLength(0);
    expect(r.violations).toHaveLength(0);
  });

  it('keeps the nets and voltages in the address', () => {
    const list = [{ net: '/AC:L', v: 325 }, { net: 'HV-', v: -400 }];
    expect(decodeVolts(encodeVolts(list))).toEqual(list);
  });
});

describe('above 500 V', () => {
  it('matches the worked rows of the free reproduction of Table 6-1 (smpspowersupply.com): 1000 V and 2000 V', () => {
    const at = (v: number, layer: string, outer: 'B2' | 'B4') =>
      checkClearance({ d: board({ tracks: [track('HV', layer, 0, 0, 30, 0, 0.5), track('X', layer, 0, 1, 30, 1, 0.5)] }), volts: [{ net: 'HV', v }], outer }).violations[0].required;
    expect(at(1000, 'In1.Cu', 'B2')).toBeCloseTo(1.5, 6);
    expect(at(1000, 'F.Cu', 'B2')).toBeCloseTo(5, 6);
    expect(at(1000, 'F.Cu', 'B4')).toBeCloseTo(2.33, 2);
    expect(at(2000, 'In1.Cu', 'B2')).toBeCloseTo(4, 6);
    expect(at(2000, 'F.Cu', 'B2')).toBeCloseTo(10, 6);
    expect(at(2000, 'F.Cu', 'B4')).toBeCloseTo(5.38, 2);
  });
});
