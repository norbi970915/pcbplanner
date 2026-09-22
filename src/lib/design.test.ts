import { describe, expect, it } from 'vitest';
import { planAdvice, rankAdvice, type Constraints, type Requirement } from './advisor';
import { designLine } from './design';
import { copperCount, geometryForLayer, PRESETS, type StackupGeometry } from './stackups';

const mil = 0.0254;

describe('line design', () => {
  it('finds the 85 Ω pair on JLC 1080 prepreg (reference W 0.113 mm @ S 0.114 mm)', () => {
    const sg: StackupGeometry = {
      type: 'microstrip',
      h: 0.0764,
      er: 3.91,
      t: 1.6 * mil,
      mask: { c1: 1.2 * mil, c2: 0.6 * mil, er: 3.8 },
      outer: true,
      note: '',
    };
    const r = designLine({ sg, kind: 'diff', target: 85, etch: 0.5 * mil, rule: { mode: 'fixed', s: 0.114, ratio: 1, minS: 0.09 }, accuracy: 'normal' });
    expect(Math.abs(r.w - 0.113) / 0.113).toBeLessThan(0.03);
    expect(Math.abs(r.z - 85)).toBeLessThan(0.2);
  });

  it('finds a 50 Ω stripline width', () => {
    const sg: StackupGeometry = { type: 'stripline', h: 0.2, er: 4.2, h2: 0.2, er2: 4.2, t: 0.0152, outer: false, note: '' };
    const r = designLine({ sg, kind: 'se', target: 50, etch: 0, accuracy: 'normal' });
    expect(Math.abs(r.z - 50)).toBeLessThan(0.2);
    expect(r.w).toBeGreaterThan(0.05);
    expect(r.w).toBeLessThan(0.3);
  });
});

describe('stackup library', () => {
  it('contains 2- to 12-layer stackups with plausible thickness', () => {
    const counts = new Set(PRESETS.map(copperCount));
    for (const n of [2, 4, 6, 8, 10, 12]) expect(counts.has(n)).toBe(true);
    for (const s of PRESETS) {
      const t = s.layers.filter((l) => l.kind !== 'mask').reduce((a, l) => a + l.t, 0);
      expect(Math.abs(t - (s.nominal ?? t)) / (s.nominal ?? t)).toBeLessThan(0.16); // JLC templates deviate up to ~15 % (2-layer 2.0 mm uses a 1.7 mm core)
    }
  });
  it('every signal layer of every preset has a reference plane', () => {
    for (const s of PRESETS) for (const l of s.layers) if (l.kind === 'copper' && l.role !== 'plane') expect(geometryForLayer(s, l.id)).not.toBeNull();
  });
});

describe('advisor planning', () => {
  const reqs: Requirement[] = [
    { id: 'a', label: '50 Ω SE', kind: 'se', z: 50, spacing: 'ratio', s: 0.1, ratio: 1, where: 'all' },
    { id: 'b', label: '100 Ω diff', kind: 'diff', z: 100, spacing: 'ratio', s: 0.1, ratio: 1, where: 'outer' },
  ];
  const c: Constraints = { layersMin: 6, layersMax: 6, thickMin: 1.6, thickMax: 1.6, signalMin: 3, minW: 0.09, minS: 0.09, maxW: 0.4, etch: 0.0127, priority: 'cost' };
  it('only plans 6-layer 1.6 mm boards and dedupes identical jobs', () => {
    const { plans, jobs } = planAdvice(PRESETS, reqs, c, 'fast');
    expect(plans.length).toBeGreaterThan(5);
    for (const p of plans) expect(copperCount(p.stackup)).toBe(6);
    const total = plans.reduce((a, p) => a + p.jobs.length, 0);
    expect(jobs.size).toBeLessThan(total);
  });
  it('ranks feasible stackups first', () => {
    const { plans } = planAdvice(PRESETS, reqs, c, 'fast');
    const results = new Map();
    plans.forEach((p, i) => p.jobs.forEach((j) => results.set(j.key, { w: i % 2 ? 0.05 : 0.15, s: 0.15, z: 50 })));
    const ranked = rankAdvice(plans, reqs, c, results);
    expect(ranked[0].ok).toBe(true);
    expect(ranked[ranked.length - 1].ok).toBe(false);
  });
});

