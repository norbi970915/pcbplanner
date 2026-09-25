import { describe, expect, it } from 'vitest';
import { solve, type Geometry } from './fieldsolver';
import { impedanceToleranceCorners } from './impedanceTolerance';

const base: Geometry = {
  w: 0.15, wTop: 0.1373, t: 0.035, yTrace: 0.1, diff: false,
  slabs: [{ y0: 0, y1: 0.1, er: 4.1 }],
  mask: { surfaceY: 0.1, overSubstrate: 0.03, overTrace: 0.015, er: 3.8 },
};

describe('impedance fabrication corners', () => {
  it('keeps etch and mask thickness fixed while varying width, dielectric height and Dk', () => {
    const corners = impedanceToleranceCorners(base, { widthMm: 0.01, heightPct: 10, dkPct: 5, spacingMm: 0 });
    expect(corners).toHaveLength(8);
    for (const corner of corners) {
      expect(corner.w - corner.wTop!).toBeCloseTo(base.w - base.wTop!);
      expect(corner.mask!.surfaceY).toBeCloseTo(corner.yTrace);
      expect(corner.mask!.overTrace).toBe(base.mask!.overTrace);
    }
    const zs = corners.map((corner) => solve(corner, { accuracy: 'fast', field: false, even: false }).se!.z);
    const nominal = solve(base, { accuracy: 'fast', field: false, even: false }).se!.z;
    expect(Math.min(...zs)).toBeLessThan(nominal);
    expect(Math.max(...zs)).toBeGreaterThan(nominal);
  });

  it('scales dielectric on both sides of a stripline without scaling copper', () => {
    const g: Geometry = { ...base, mask: undefined, diff: true, s: 0.12, topPlane: 0.235, slabs: [
      { y0: 0, y1: 0.1, er: 4 }, { y0: 0.1, y1: 0.235, er: 4 },
    ] };
    const corners = impedanceToleranceCorners(g, { widthMm: 0, heightPct: 10, dkPct: 0, spacingMm: 0.01 });
    expect(corners).toHaveLength(4);
    const high = corners.find((corner) => corner.yTrace > g.yTrace)!;
    expect(high.yTrace).toBeCloseTo(0.11);
    expect(high.topPlane).toBeCloseTo(0.255);
    expect(high.topPlane! - high.yTrace - g.t).toBeCloseTo(0.11);
  });

  it('rejects corners with a vanished etched top or pair gap', () => {
    expect(() => impedanceToleranceCorners(base, { widthMm: 0.14, heightPct: 0, dkPct: 0, spacingMm: 0 })).toThrow(/minimum width/);
    expect(() => impedanceToleranceCorners({ ...base, diff: true, s: 0.1 }, { widthMm: 0, heightPct: 0, dkPct: 0, spacingMm: 0.1 })).toThrow(/spacing/);
  });
});
