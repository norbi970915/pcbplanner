import { describe, expect, it } from 'vitest';
import { microstripHJ, striplineWheeler } from './closedform';
import { solve, type Geometry } from './fieldsolver';

const pct = (a: number, b: number) => (100 * (a - b)) / b;

function microstrip(w: number, h: number, t: number, er: number): Geometry {
  return { w, t, yTrace: h, diff: false, slabs: [{ y0: 0, y1: h, er }] };
}

describe('field solver vs closed-form', () => {
  it.each([
    [0.3, 0.2, 0.035, 4.3],
    [0.15, 0.1, 0.035, 4.1],
    [3.0, 1.6, 0.035, 4.4],
    [0.5, 0.2, 0.018, 3.5],
  ])('surface microstrip w=%s h=%s t=%s er=%s agrees with Hammerstad-Jensen within 2%%', (w, h, t, er) => {
    const hj = microstripHJ(w, h, t, er);
    const fs = solve(microstrip(w, h, t, er)).se!;
    expect(Math.abs(pct(fs.z, hj.z0))).toBeLessThan(2);
    expect(Math.abs(pct(fs.eeff, hj.eeff))).toBeLessThan(2);
  });

  it.each([
    [0.15, 0.5, 0.017, 4.0],
    [0.1, 0.3, 0.035, 3.7],
    [0.3, 0.6, 0.035, 4.3],
  ])('symmetric stripline w=%s b=%s t=%s er=%s agrees with Wheeler within 2%%', (w, b, t, er) => {
    const wh = striplineWheeler(w, b, t, er);
    const h1 = (b - t) / 2;
    const fs = solve({ w, t, yTrace: h1, diff: false, slabs: [{ y0: 0, y1: b, er }], topPlane: b }).se!;
    expect(Math.abs(pct(fs.z, wh.z0))).toBeLessThan(2);
    expect(fs.eeff).toBeCloseTo(er, 3);
  });
});

// Reference values from a Polar SI9000-based impedance calculator,
// coated microstrip: T = 1.6 mil, top width = W − 0.5 mil, soldermask
// 1.2 mil over laminate / 0.6 mil over copper, εr(mask) = 3.8.
function coated(h: number, er: number, w: number, s?: number): Geometry {
  const t = 1.6 * 0.0254;
  return {
    w,
    wTop: w - 0.5 * 0.0254,
    t,
    yTrace: h,
    diff: s !== undefined,
    s,
    slabs: [{ y0: 0, y1: h, er }],
    mask: { surfaceY: h, overSubstrate: 1.2 * 0.0254, overTrace: 0.6 * 0.0254, er: 3.8 },
  };
}

describe('field solver vs commercial solver (coated microstrip)', () => {
  it.each([
    ['3313 SE', 0.0994, 4.1, 0.157, undefined, 50],
    ['3313 diff 85', 0.0994, 4.1, 0.145, 0.127, 85],
    ['3313 diff 100', 0.0994, 4.1, 0.122, 0.203, 100],
    ['1080 SE', 0.0764, 3.91, 0.116, undefined, 50],
    ['1080 diff 85', 0.0764, 3.91, 0.113, 0.114, 85],
    ['1080 diff 100', 0.0764, 3.91, 0.097, 0.203, 100],
  ])('%s', (_name, h, er, w, s, target) => {
    const r = solve(coated(h, er, w, s));
    const z = s === undefined ? r.se!.z : r.zdiff!;
    expect(Math.abs(pct(z, target))).toBeLessThan(3);
  });
});

describe('field solver sanity', () => {
  it('parallel-plate limit: very wide stripline approaches η·h/W', () => {
    const w = 40, b = 0.2, t = 0.01; // 4000:1 aspect, within the solver's 2e4 feature-ratio limit
    const fs = solve({ w, t, yTrace: (b - t) / 2, diff: false, slabs: [{ y0: 0, y1: b, er: 1 }], topPlane: b }, { accuracy: 'fast' }).se!;
    // two plates in parallel (above and below): Z ≈ η0·(b/2)/(2W)
    const ideal = (376.73 * ((b - t) / 2)) / (2 * w);
    expect(Math.abs(pct(fs.z, ideal))).toBeLessThan(5);
  });

  it('differential pair: Zdiff < 2·Z0 and Zodd < Z0 < Zeven', () => {
    const base = microstrip(0.12, 0.1, 0.035, 4.2);
    const se = solve(base).se!.z;
    const d = solve({ ...base, diff: true, s: 0.12 });
    expect(d.odd!.z).toBeLessThan(se);
    expect(d.even!.z).toBeGreaterThan(se);
    expect(d.zdiff!).toBeLessThan(2 * se);
  });

  it('coplanar ground lowers impedance', () => {
    const base = microstrip(0.2, 0.2, 0.035, 4.2);
    const z = solve(base).se!.z;
    const zc = solve({ ...base, coplanarGap: 0.15 }).se!.z;
    expect(zc).toBeLessThan(z);
  });
});
