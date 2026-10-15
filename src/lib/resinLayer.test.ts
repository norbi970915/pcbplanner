import { describe, expect, it } from 'vitest';
import { solve, type Geometry } from './fieldsolver';
import { withResinLayer } from './resinLayer';
import { buildImpedanceGeometry, IMPEDANCE_DEFAULTS as defaults } from './impedanceGeometry';
import { sweepGeometry } from './impedanceSweep';
import { impedanceToleranceCorners } from './impedanceTolerance';
import { solveTarget } from './impedanceTarget';
import { ETA0 } from './units';

const params = { ...defaults, type: 'stripline', mode: 'diff', etch: 0, er: 4, er2: 4, h: 0.1, h2: 0.1, w: 0.15, t: 0.035, s: 0.15 };
const base = () => buildImpedanceGeometry(params).geom!;
const resin = (above = 0.015, dk = 3.2) => withResinLayer(base(), { above, dk });
const at = (g: Geometry, y: number) => g.slabs.find(s => y >= s.y0 && y < s.y1)?.er;

describe('planar resin-layer geometry', () => {
  it('keeps existing URL defaults and the legacy microstrip geometry', () => {
    const result = buildImpedanceGeometry(defaults);
    expect(result.errors).toEqual([]);
    expect(result.geom).toMatchObject({ w: 0.15, t: 0.035, yTrace: 0.1, diff: false, slabs: [{ y0: 0, y1: 0.1, er: 4.1 }], mask: { er: 3.8 } });
    expect(buildImpedanceGeometry({ ...params, resinDk: NaN, resinAbove: -1 }).geom).toEqual(base());
  });
  it('replaces material beside and above copper without moving the planes or trace', () => {
    const g = resin();
    expect(g.yTrace).toBe(base().yTrace); expect(g.topPlane).toBe(base().topPlane); expect(g.t).toBe(base().t);
    expect(at(g, 0.09)).toBe(4); expect(at(g, 0.12)).toBe(3.2); expect(at(g, 0.145)).toBe(3.2); expect(at(g, 0.16)).toBe(4);
    expect(base().slabs).toHaveLength(2);
  });
  it('zero extra thickness keeps resin beside the copper, and full cover leaves no upper composite', () => {
    expect(at(resin(0), 0.12)).toBe(3.2); expect(at(resin(0), 0.136)).toBe(4);
    expect(at(resin(0.1), 0.234)).toBe(3.2);
  });
  it('splits multiple upper plies without erasing the remaining layers', () => {
    const original = buildImpedanceGeometry({ ...params, dl: '0.04:4.4,0.06:4', dl2: '0.01:3.8,0.09:4.2' }).geom!;
    const g = withResinLayer(original, { above: 0.025, dk: 3 });
    expect(at(g, 0.02)).toBe(4.4); expect(at(g, 0.08)).toBe(4);
    expect(at(g, 0.15)).toBe(3); expect(at(g, 0.17)).toBe(4.2);
    for (let i=1;i<g.slabs.length;i++) expect(g.slabs[i].y0).toBeCloseTo(g.slabs[i-1].y1, 12);
  });
  it.each([[NaN, 0.01], [0, 0.01], [1001, 0.01], [3.2, -0.01], [3.2, Infinity], [3.2, 0.101]])('rejects invalid Dk %s / thickness %s', (dk, above) => {
    expect(()=>withResinLayer(base(), { dk, above })).toThrow(RangeError);
  });
  it('rejects unsupported surface and broadside requests rather than silently ignoring them', () => {
    expect(buildImpedanceGeometry({ ...defaults, resin: true, resinDk: 3.2 }).geom).toBeNull();
    expect(buildImpedanceGeometry({ ...params, coupling: 'broadside', resin: true, resinDk: 3.2 }).geom).toBeNull();
    expect(buildImpedanceGeometry({ ...params, type: 'embedded', resin: true, resinDk: 3.2, resinAbove: 0.015 }).geom?.topPlane).toBeUndefined();
  });
  it('height sweeps and fabrication corners scale the extra resin thickness with H2', () => {
    const g=resin();
    const scaled=sweepGeometry(g, 'h', 0.2);
    expect(at(scaled, 0.26)).toBe(3.2); expect(at(scaled, 0.27)).toBe(4);
    const corners=impedanceToleranceCorners(g, { widthMm:0, heightPct:10, dkPct:0, spacingMm:0 });
    expect(corners[1].topPlane).toBeCloseTo(0.255, 10);
    expect(at(corners[1], 0.16)).toBe(3.2); expect(at(corners[1], 0.17)).toBe(4);
    const dk=sweepGeometry(g, 'er', 10);
    expect(at(dk, 0.12)).toBeCloseTo(3.52); expect(at(dk, 0.2)).toBeCloseTo(4.4);
  });
});

describe('resin-layer numerical checks', () => {
  it.each([[false, 0, 64.0677], [true, 0, 65.0005], [true, 0.02, 66.1242]])('reproduces the guide example: enabled %s, R %s', (enabled, above, expected) => {
    const g=buildImpedanceGeometry({ ...params, resin: enabled, resinDk: 3.2, resinAbove: above }).geom!;
    expect(solve(g, {accuracy:'high'}).zdiff!).toBeCloseTo(expected, 3);
  });
  it('equal resin and composite Dk recovers the homogeneous result', () => {
    const original=solve(base(), {accuracy:'high'});
    const equal=solve(resin(0.015, 4), {accuracy:'high'});
    expect(equal.zdiff! / original.zdiff!).toBeCloseTo(1, 4);
    expect(equal.odd!.eeff).toBeCloseTo(4, 6);
  });
  it('lower Dk raises differential impedance and a thin band converges with mesh refinement', () => {
    const g=resin(0.001);
    const normal=solve(g, {accuracy:'normal'}), high=solve(g, {accuracy:'high'});
    expect(high.zdiff!).toBeGreaterThan(solve(base(), {accuracy:'high'}).zdiff!);
    expect(Math.abs(normal.zdiff!/high.zdiff!-1)).toBeLessThan(0.01);
  });
  it('agrees with the independently derived wide-strip limit of series/parallel capacitors', () => {
    // Wide copper: the lower path is a homogeneous capacitor; the upper path has
    // resin and composite in series. Those two paths add in parallel. All lengths mm.
    const g=withResinLayer({...base(), w:20, diff:false, s:undefined}, {above:0.02, dk:3});
    const dielectric = 4/0.1 + 1/(0.02/3 + 0.08/4);
    const air = 1/0.1 + 1/0.1;
    const expected = ETA0/(20*Math.sqrt(dielectric*air));
    const result=solve(g, {accuracy:'high'}).se!;
    expect(Math.abs(result.z/expected-1)).toBeLessThan(0.01);
  });
  it('width and spacing targeting retain the resin geometry and recover their targets', () => {
    const g=resin();
    const target=solve(g, {accuracy:'normal', even:false}).zdiff!;
    const width=solveTarget({...g,w:0.17}, {accuracy:'normal',even:false}, 'w', target);
    const spacing=solveTarget({...g,s:0.18}, {accuracy:'normal',even:false}, 's', target);
    expect(width.value).toBeCloseTo(0.15, 3); expect(spacing.value).toBeCloseTo(0.15, 3);
    expect(width.result.zdiff!).toBeCloseTo(target, 1); expect(spacing.result.zdiff!).toBeCloseTo(target, 1);
  });
});
