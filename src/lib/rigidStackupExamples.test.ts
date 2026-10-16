import { describe, expect, it } from 'vitest';
import { DEFAULT_STACKUP_ID, RIGID_EXAMPLE_COUNT } from '../data/rigidStackupRules';
import { planAdvice, type Constraints } from './advisor';
import { createRigidExamples } from './rigidStackupExamples';
import { isStackup, parseStackupFile, serialiseStackup } from './stackupFile';
import { stackupIssues } from './stackupRegions';
import { boardThickness, copperCount, geometryForLayer, PRESETS, totalThickness } from './stackups';

describe('original rigid examples', () => {
  it('has unique versioned IDs and a selectable default', () => {
    expect(PRESETS).toHaveLength(RIGID_EXAMPLE_COUNT);
    expect(PRESETS).toHaveLength(37);
    expect(new Set(PRESETS.map(s => s.id)).size).toBe(PRESETS.length);
    expect(PRESETS.every(s => s.id.startsWith('pcbplanner-v1-'))).toBe(true);
    expect(PRESETS.some(s => s.id === DEFAULT_STACKUP_ID)).toBe(true);
    expect(new Set(PRESETS.map(copperCount))).toEqual(new Set([2, 4, 6, 8, 10, 12]));
  });
  it('closes the thickness budget and mirrors physical layers in every example', () => {
    for (const s of PRESETS) {
      expect(stackupIssues(s)).toEqual([]);
      expect(isStackup(s)).toBe(true);
      expect(boardThickness(s)).toBeCloseTo(s.nominal!, 12);
      expect(totalThickness(s) - boardThickness(s)).toBeCloseTo(0.04, 12);
      expect(new Set(s.layers.map(l => l.id)).size).toBe(s.layers.length);
      for (let i = 0; i < s.layers.length; i++) {
        const a = s.layers[i], b = s.layers[s.layers.length - 1 - i];
        expect(a.t).toBeGreaterThan(0);
        expect(a.t).toBeCloseTo(b.t, 12);
        expect(a.kind).toBe(b.kind);
        expect(a.er).toBe(b.er);
        expect(a.df).toBe(b.df);
        if (a.kind === 'copper' && a.role === 'signal') expect(geometryForLayer(s, a.id)).not.toBeNull();
        if (a.kind === 'dielectric') expect(a.t).toBeGreaterThanOrEqual(0.1);
      }
    }
  });
  it('keeps the published v1 six-layer construction stable', () => {
    const s = PRESETS.find(s => s.id === DEFAULT_STACKUP_ID)!;
    expect(s.layers.filter(l => l.kind === 'copper').map(l => l.t)).toEqual([0.035, 0.018, 0.018, 0.018, 0.018, 0.035]);
    const gaps = s.layers.filter(l => l.kind === 'dielectric');
    expect(gaps.map(l => +l.t.toFixed(9))).toEqual([0.1, 0.419333333, 0.419333333, 0.419333333, 0.1]);
    expect(gaps.every(l => l.er === 4 && l.df === 0.015 && l.fGHz === undefined)).toBe(true);
    expect(s.origin).toBe('pcbplanner-example-v1');
    expect(s.vendor).toBeUndefined();
  });
  it('creates independent copies and preserves custom geometry through a JSON backup', () => {
    const a = createRigidExamples(), b = createRigidExamples();
    a[0].layers[1].t = 0.05;
    expect(b[0].layers[1].t).toBe(0.035);
    const saved = { ...a[0], builtin: false, nominal: undefined, id: 'custom-owned-build' };
    expect(parseStackupFile(serialiseStackup(saved)).layers).toEqual(saved.layers);
  });
  it('offers both six-layer profiles to the regular advisor', () => {
    const c: Constraints = { layersMin: 6, layersMax: 6, thickMin: 1.6, thickMax: 1.6, signalMin: 0,
      minW: 0.09, minS: 0.09, maxW: 0.4, etch: 0, priority: 'cost' };
    const result = planAdvice(PRESETS, [], c, 'fast');
    expect(result.plans.map(p => p.stackup.id)).toEqual(['pcbplanner-v1-6l-1600-equal', DEFAULT_STACKUP_ID]);
    expect(result.jobs.size).toBe(0);
  });
});
