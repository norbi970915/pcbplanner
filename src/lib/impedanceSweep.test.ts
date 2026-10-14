import { describe, expect, it } from 'vitest';
import { solve, type Geometry } from './fieldsolver';
import { niceTicks, sweepDef, sweepGeometry, sweepParams, type SweepParam } from './impedanceSweep';

const micro: Geometry = { w: 0.171, wTop: 0.171 - 0.0127, t: 0.035, yTrace: 0.1, diff: false, slabs: [{ y0: 0, y1: 0.1, er: 4.2 }] };
const masked: Geometry = { ...micro, mask: { surfaceY: 0.1, overSubstrate: 0.0305, overTrace: 0.0152, er: 3.8 } };
const cpw: Geometry = { ...micro, coplanarGap: 0.25 };
const pair: Geometry = { ...micro, diff: true, s: 0.15 };
const strip: Geometry = { w: 0.12, t: 0.018, yTrace: 0.15, diff: false, topPlane: 0.15 + 0.018 + 0.2, slabs: [{ y0: 0, y1: 0.15, er: 4.0 }, { y0: 0.15, y1: 0.368, er: 4.3 }] };

const z = (g: Geometry) => {
  const r = solve(g, { accuracy: 'fast' });
  return (g.diff ? r.zdiff : r.se?.z) as number;
};
const zs = (g: Geometry, p: SweepParam) => sweepDef(g, p).values.map((v) => z(sweepGeometry(g, p, v)));
const decreasing = (a: number[]) => a.every((v, i) => i === 0 || v < a[i - 1]);
const increasing = (a: number[]) => a.every((v, i) => i === 0 || v > a[i - 1]);

describe('sweep parameters', () => {
  it('offers only what the geometry has', () => {
    expect(sweepParams(micro)).toEqual(['w', 'h', 'er']);
    expect(sweepParams(masked)).toEqual(['w', 'h', 'er', 'mask']);
    expect(sweepParams(cpw)).toEqual(['w', 'h', 'er', 'gap']);
    expect(sweepParams(pair)).toEqual(['w', 'h', 'er', 's']);
  });

  it('reproduces the original geometry at the current value', () => {
    for (const [g, ps] of [[masked, ['w', 'h', 'mask']], [cpw, ['gap']], [pair, ['s']], [strip, ['h']]] as const)
      for (const p of ps) {
        const d = sweepDef(g, p);
        expect(sweepGeometry(g, p, d.current)).toEqual({ ...g, topPlane: g.topPlane, mask: g.mask });
      }
    expect(sweepGeometry(micro, 'er', 0).slabs).toEqual(micro.slabs);
  });

  it('keeps the etch allowance and the mask ratio', () => {
    const g = sweepGeometry(micro, 'w', 0.3);
    expect(g.w - g.wTop!).toBeCloseTo(0.0127, 12);
    expect(sweepDef(micro, 'w').values[0]).toBeGreaterThan(0.0127);
    const m = sweepGeometry(masked, 'mask', 0.0304).mask!;
    expect(m.overSubstrate / m.overTrace).toBeCloseTo(0.0305 / 0.0152, 12);
    expect(sweepGeometry(masked, 'mask', 0).mask).toBeUndefined();
  });

  it('scales every dielectric of a stripline with the height', () => {
    const g = sweepGeometry(strip, 'h', 0.3);
    expect(g.yTrace).toBeCloseTo(0.3, 12);
    expect(g.topPlane! - g.yTrace - g.t).toBeCloseTo(0.4, 12);
    expect(g.slabs.map((s) => s.er)).toEqual([4.0, 4.3]);
  });
});

describe('sweep physics (field solver)', () => {
  it('lower impedance for a wider trace, a thinner dielectric and a higher Dk', () => {
    expect(decreasing(zs(micro, 'w'))).toBe(true);
    expect(increasing(zs(micro, 'h'))).toBe(true);
    expect(decreasing(zs(micro, 'er'))).toBe(true);
  });

  it('coplanar ground pulls the impedance down as it comes closer', () => {
    const v = zs(cpw, 'gap');
    // the far end is flat; allow the fast mesh its ~0.001 Ω noise there
    expect(v.every((x, i) => i === 0 || x > v[i - 1] - 0.01)).toBe(true);
    expect(v[v.length - 1] - v[0]).toBeGreaterThan(5);
    expect(Math.abs(v[v.length - 1] / z(micro) - 1)).toBeLessThan(0.01);
  });

  it('a thicker solder mask lowers the impedance, and no mask equals bare copper', () => {
    const v = zs(masked, 'mask');
    expect(decreasing(v)).toBe(true);
    expect(v[0]).toBeCloseTo(z(micro), 6);
  });

  it('a wider pair spacing raises Zdiff', () => {
    expect(increasing(zs(pair, 's'))).toBe(true);
  });
});

describe('axis ticks', () => {
  it('uses round steps and stays bounded', () => {
    expect(niceTicks(0, 1)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(niceTicks(43.2, 56.9)).toEqual([45, 50, 55]);
    expect(niceTicks(-20, 20)).toEqual([-20, -10, 0, 10, 20]);
    expect(niceTicks(0, 1e9).length).toBeLessThanOrEqual(12);
    expect(niceTicks(5, 5)).toEqual([5]);
  });
});
