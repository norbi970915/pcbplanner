import { describe, expect, it } from 'vitest';
import { closedFormWidth, findWidth, spacingFor, toSolverGeometry } from './design';
import { microstripHJ } from './closedform';
import { solve } from './fieldsolver';
import { geometryForLayer, PRESETS, type Layer, type Stackup } from './stackups';
import { nominalThickness, rankAdvice } from './advisor';

const mk = (layers: Omit<Layer, 'id'>[]): Stackup => ({ id: 's', name: 's', layers: layers.map((l, i) => ({ ...l, id: `x${i}` })) });

describe('audit: geometryForLayer', () => {
  it('JLC 4-layer 1080/7628 preset: L1 microstrip over L2 with both prepregs and the mask', () => {
    const s = PRESETS.find((p) => p.id === 'jlc-jlc04081h-1080a')!;
    const g = geometryForLayer(s, s.layers.find((l) => l.name === 'L1')!.id)!;
    expect(g.type).toBe('microstrip');
    expect(g.h).toBeCloseTo(0.084 + 0.2104, 9); // prepreg 1080 + prepreg 7628 (jlcStackups.ts)
    expect(g.mask).toEqual({ c1: 0.0305, c2: 0.01525, er: 3.8 });
    expect(nominalThickness(s)).toBe(0.8);
  });

  it('stripline between two planes', () => {
    const s = mk([
      { kind: 'copper', name: 'P1', t: 0.035, role: 'plane' },
      { kind: 'dielectric', name: 'd', t: 0.1, er: 4 },
      { kind: 'copper', name: 'S', t: 0.018, role: 'signal' },
      { kind: 'dielectric', name: 'd', t: 0.2, er: 3.5 },
      { kind: 'copper', name: 'P2', t: 0.035, role: 'plane' },
    ]);
    const g = geometryForLayer(s, 'x2')!;
    expect(g).toMatchObject({ type: 'stripline', h: 0.2, er: 3.5, h2: 0.1, er2: 4, t: 0.018 });
    const sg = toSolverGeometry(g, 0.1, false, undefined, 0);
    expect(sg.topPlane).toBeCloseTo(0.2 + 0.018 + 0.1, 12);
  });

  // BUG: when an unreferenced signal layer sits between the trace and its plane,
  // scan() skips the copper layer but drops its thickness, so H (and H2) are too
  // small by that copper thickness. stackups.ts:117 (`continue;`). Fix: push the
  // skipped copper into the run as a dielectric of its thickness (e.g. with the εr
  // of the adjacent dielectric), or add l.t to the accumulated height.
  it('an intermediate signal layer counts toward the height to the plane (fixed)', () => {
    const s = mk([
      { kind: 'mask', name: 'm', t: 0.0305, er: 3.8 },
      { kind: 'copper', name: 'L1', t: 0.035, role: 'signal' },
      { kind: 'dielectric', name: 'd1', t: 0.1, er: 4 },
      { kind: 'copper', name: 'L2', t: 0.035, role: 'signal' },
      { kind: 'dielectric', name: 'd2', t: 0.1, er: 4 },
      { kind: 'copper', name: 'L3', t: 0.035, role: 'plane' },
    ]);
    // physical distance from the L1 trace bottom to the L3 plane = 0.1 + 0.035 + 0.1
    expect(geometryForLayer(s, 'x1')!.h).toBeCloseTo(0.235, 9);
  });

  it('collapsing stacked prepregs into one εr (thickness-weighted) costs < 1 % in Z', () => {
    // Documented approximation: layered 7628 (4.4) + 1080 (3.91) under a 0.5 mm trace:
    // two-slab field solution vs single-slab arithmetic mean εr.
    const w = 0.5, t = 0.035, h = 0.2944;
    const two = solve({ w, t, yTrace: h, diff: false, slabs: [{ y0: 0, y1: 0.2104, er: 4.4 }, { y0: 0.2104, y1: h, er: 3.91 }] }).se!.z;
    const one = solve({ w, t, yTrace: h, diff: false, slabs: [{ y0: 0, y1: h, er: (0.2104 * 4.4 + 0.084 * 3.91) / h }] }).se!.z;
    expect(Math.abs(one / two - 1)).toBeLessThan(0.01);
  }, 60000);
});

describe('audit: design helpers', () => {
  it('spacing rules', () => {
    expect(spacingFor(0.1, { mode: 'ratio', s: 0, ratio: 2, minS: 0.1 })).toBeCloseTo(0.2, 12);
    expect(spacingFor(0.1, { mode: 'fixed', s: 0.05, ratio: 2, minS: 0.1 })).toBe(0.1);
  });
  it('findWidth converges on a monotonic Z(W)', () => {
    const w = findWidth((x) => 60 / Math.sqrt(x), 50, 0.3);
    expect(60 / Math.sqrt(w)).toBeCloseTo(50, 1);
  });
  it('closedFormWidth inverts Hammerstad–Jensen', () => {
    const sg = { type: 'microstrip' as const, h: 0.1, er: 4.1, t: 0.035, outer: true, note: '' };
    const w = closedFormWidth(sg, 50);
    expect(microstripHJ(w, 0.1, 0.035, 4.1).z0).toBeCloseTo(50, 3);
  });
  it('rankAdvice flags a width below the minimum', () => {
    const s = PRESETS[0];
    const plan = { stackup: s, layers: [{ layerId: 'a', name: 'L1', outer: true, sg: {} as never }], jobs: [{ reqId: 'r', layerId: 'a', key: 'k' }] };
    const c = { layersMin: 2, layersMax: 12, thickMin: 0, thickMax: 5, signalMin: 1, minW: 0.1, minS: 0.1, maxW: 1, etch: 0, priority: 'cost' as const };
    const r = rankAdvice([plan], [{ id: 'r', label: 'SE', kind: 'se', z: 50, spacing: 'fixed', s: 0, ratio: 0, where: 'all' }], c, new Map([['k', { w: 0.05, z: 50 }]]));
    expect(r[0].ok).toBe(false);
  });
});
