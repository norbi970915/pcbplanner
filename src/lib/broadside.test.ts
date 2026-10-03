import { describe, expect, it } from 'vitest';
import { solve, type Geometry } from './fieldsolver';
import { resizeBroadside } from './broadside';
import { solveTarget } from './impedanceTarget';
import { impedanceToleranceCorners } from './impedanceTolerance';

function pair(w = 0.15, h = 0.1, s = 0.15, t = 0.035, er = 4.1): Geometry {
  const height = 2*h + 2*t + s;
  return { w, t, yTrace: h, s, diff: true, coupling: 'broadside', topPlane: height,
    slabs: [{ y0: 0, y1: height, er }] };
}
const relative = (a: number, b: number) => Math.abs(a/b - 1);

describe('balanced broadside differential pairs', () => {
  it('odd mode agrees with the independent electric-wall half-height stripline', () => {
    const g = { ...pair(), wTop: 0.1373 };
    const r = solve(g, { field: true });
    const middle = g.topPlane! / 2;
    const half = solve({ w: g.w, wTop: g.wTop, t: g.t, yTrace: g.yTrace, diff: false,
      topPlane: middle, slabs: [{ y0: 0, y1: middle, er: 4.1 }] });
    expect(relative(r.odd!.z, half.se!.z)).toBeLessThan(0.01);
    expect(r.zdiff).toBeCloseTo(2*r.odd!.z, 10);
    expect(r.zcomm).toBeCloseTo(r.even!.z/2, 10);
    expect(r.odd!.z).toBeLessThan(r.even!.z);
    expect(r.field!.oddMirror).toBe(false);
    const f = r.field!;
    const lower = f.y.findIndex(y => Math.abs(y-g.yTrace) < 1e-9);
    const upper = f.y.findIndex(y => Math.abs(y-(g.yTrace+g.t+g.s!+g.t)) < 1e-9);
    expect(f.phi[lower*f.nx]).toBe(1);
    expect(f.phi[upper*f.nx]).toBe(-1);
    // The odd field is antisymmetric vertically, not horizontally.
    for (let j = 0; j < f.ny; j++) {
      const reflected = f.y.findIndex(y => Math.abs(y-(g.topPlane!-f.y[j])) < 1e-8);
      if (reflected >= 0) expect(Math.abs(f.phi[j*f.nx]+f.phi[reflected*f.nx])).toBeLessThan(1e-5);
    }
  });

  it('both modes approach the analytic wide-trace parallel-plate limits', () => {
    const g = pair(40, 0.1, 0.2, 0.01, 3);
    const r = solve(g, { accuracy: 'fast' });
    const eta = 376.730313668 / Math.sqrt(3);
    const odd = eta / (g.w * (1/g.yTrace + 2/g.s!));
    const even = eta * g.yTrace / g.w;
    expect(relative(r.odd!.z, odd)).toBeLessThan(0.03);
    expect(relative(r.even!.z, even)).toBeLessThan(0.03);
  }, 60000);

  it('obeys homogeneous dielectric scaling and converges as the mesh is refined', () => {
    const air = solve(pair(0.2, 0.15, 0.12, 0.018, 1));
    const g = pair(0.2, 0.15, 0.12, 0.018, 4);
    const normal = solve(g);
    const high = solve(g, { accuracy: 'high' });
    for (const mode of ['odd', 'even'] as const) {
      expect(normal[mode]!.eeff).toBeCloseTo(4, 6);
      expect(relative(normal[mode]!.z, air[mode]!.z/2)).toBeLessThan(1e-6);
      expect(relative(normal[mode]!.z, high[mode]!.z)).toBeLessThan(0.015);
    }
  }, 60000);

  it('supports mirrored outer plies and a different central Dk with conserved energy', () => {
    const g = pair();
    g.slabs = [{ y0: 0, y1: 0.04, er: 3 }, { y0: 0.04, y1: 0.1, er: 4 },
      { y0: 0.1, y1: g.topPlane!-0.1, er: 5 },
      { y0: g.topPlane!-0.1, y1: g.topPlane!-0.04, er: 4 },
      { y0: g.topPlane!-0.04, y1: g.topPlane!, er: 3 }];
    const r = solve(g, { parts: true });
    for (const mode of ['odd','even'] as const) {
      const m = r[mode]!;
      expect(m.eeff).toBeGreaterThanOrEqual(3);
      expect(m.eeff).toBeLessThanOrEqual(5);
      expect(m.parts!.slabs.reduce((sum,p,i)=>sum+p*g.slabs[i].er, m.parts!.air)).toBeCloseTo(m.eeff, 6);
    }
  });

  it('rejects unsupported unbalanced or incomplete geometries', () => {
    const g = pair();
    expect(()=>solve({...g, diff: false})).toThrow(/Broadside/);
    expect(()=>solve({...g, s: 0})).toThrow(/gap/);
    expect(()=>solve({...g, topPlane: undefined})).toThrow(/planes/);
    expect(()=>solve({...g, topPlane: g.topPlane!+0.01})).toThrow(/clearances/);
    expect(()=>solve({...g, coplanarGap: 0.1})).toThrow(/coplanar/);
    expect(()=>solve({...g, slabs: [{y0:0,y1:0.1,er:3}, {y0:0.1,y1:g.topPlane!,er:4}]})).toThrow(/mirrored/);
  });

  it('width and vertical-spacing targeting reach the requested impedance', () => {
    const g = pair();
    for (const param of ['w','s'] as const) {
      const changed = param === 'w' ? { ...g, w: 0.2 } : resizeBroadside(g, 1, 0.23);
      const target = solve(changed, { accuracy: 'fast', even: false }).zdiff!;
      const found = solveTarget(g, { accuracy: 'fast', even: false }, param, target);
      expect(Math.abs(found.result.zdiff!-target)).toBeLessThan(0.01);
      expect(relative(found.value, param === 'w' ? 0.2 : 0.23)).toBeLessThan(0.002);
    }
    const target = solve(g, { accuracy: 'fast', even: false }).zdiff!;
    expect(solveTarget(g, {accuracy:'fast'}, 's', target).value).toBe(g.s);
    expect(()=>solveTarget(g, {}, 'w', 0)).toThrow(/positive/);
  }, 60000);

  it('width targeting preserves mirrored etch and never silently narrows the etch allowance', () => {
    const g = { ...pair(), wTop: 0.1373 };
    const wanted = { ...g, w: 0.1, wTop: 0.0873 };
    const target = solve(wanted, {accuracy:'fast',even:false}).zdiff!;
    const found = solveTarget(g, {accuracy:'fast',even:false}, 'w', target);
    expect(relative(found.value,0.1)).toBeLessThan(0.002);
    expect(()=>solveTarget(g, {accuracy:'fast',even:false}, 'w',1000)).toThrow(/No width/);
  }, 60000);

  it('retains single-ended width solving and edge-coupled spacing solving', () => {
    const g: Geometry = {w:0.15,wTop:0.1373,t:0.035,yTrace:0.1,diff:false,slabs:[{y0:0,y1:0.1,er:4.1}]};
    const width = solveTarget(g, {accuracy:'fast'}, 'w',50);
    expect(Math.abs(width.result.se!.z-50)).toBeLessThan(0.01);
    const edge = {...g,diff:true,s:0.1};
    const target = solve({...edge,s:0.2},{accuracy:'fast',even:false}).zdiff!;
    const spacing = solveTarget(edge, {accuracy:'fast',even:false}, 's',target);
    expect(relative(spacing.value,0.2)).toBeLessThan(0.002);
    expect(()=>solveTarget(g,{},'s',100)).toThrow(/differential/);
  }, 60000);

  it('fabrication corners preserve both copper thicknesses and vertical balance', () => {
    const g = { ...pair(), wTop: 0.1373 };
    const corners = impedanceToleranceCorners(g, { widthMm: 0.01, heightPct: 5, dkPct: 5, spacingMm: 0.01 });
    expect(corners).toHaveLength(16);
    const values = corners.map(corner => {
      expect(corner.topPlane!-corner.yTrace-2*corner.t-corner.s!).toBeCloseTo(corner.yTrace, 10);
      expect(corner.w-corner.wTop!).toBeCloseTo(g.w-g.wTop!);
      return solve(corner, {accuracy:'fast',even:false}).zdiff!;
    });
    const nominal = solve(g, {accuracy:'fast',even:false}).zdiff!;
    expect(Math.min(...values)).toBeLessThan(nominal);
    expect(Math.max(...values)).toBeGreaterThan(nominal);
    expect(()=>impedanceToleranceCorners(g, {widthMm:0,heightPct:50,dkPct:0,spacingMm:0.08})).toThrow(/spacing/);
  }, 60000);
});
