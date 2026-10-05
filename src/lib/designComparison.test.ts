import { describe, expect, it } from 'vitest';
import { comparisonDelta, comparisonRow as row, comparisonRows, decodeComparison, sameComparisonValue, snapshotDesign } from './designComparison';

describe('design comparison', () => {
  it('freezes the saved inputs and results independently of the live design', () => {
    const current = { state: { width: .15 }, inputs: [row('w', 'Width', .15, 'mm')], results: [row('z', 'Impedance', 50, 'ohm')] };
    const saved = snapshotDesign(current);
    current.state.width = .2; current.inputs[0].value = .2; current.results[0].value = 45;
    expect(saved.state.width).toBe(.15);
    expect(comparisonDelta(saved.results[0], current.results[0])).toBe(-5);
    expect(saved.inputs[0].value).toBe(.15);
  });
  it('handles zero baselines and signed changes without dividing by zero', () => {
    expect(comparisonDelta(row('x', 'Noise', 0, 'mV'), row('x', 'Noise', 2, 'mV'))).toBe(2);
    expect(comparisonDelta(row('t', 'Temperature', -5, 'C'), row('t', 'Temperature', 10, 'C'))).toBe(15);
    expect(comparisonDelta(row('x', 'Unavailable', null), row('x', 'Unavailable', 2))).toBeNull();
  });
  it('keeps different quantities, modes and units separate', () => {
    const rows = comparisonRows([row('z0', 'Z0', 50, 'ohm')], [row('zdiff', 'Zdiff', 100, 'ohm')]);
    expect(rows).toHaveLength(2);
    expect(rows.every(r => comparisonDelta(r.a, r.b) === null)).toBe(true);
    expect(comparisonDelta(row('x', 'Width', 1, 'mm'), row('x', 'Width', 1, 'mil'))).toBeNull();
    expect(sameComparisonValue(row('x', 'Width', 1, 'mm'), row('x', 'Width', 1 + 1e-12, 'mm'))).toBe(true);
  });
  it('rejects malformed or outdated browser snapshots and restores valid ones', () => {
    const d = { state: { width: .15, mask: true }, inputs: [row('w', 'Width', .15, 'mm')], results: [row('z', 'Z0', 50, 'ohm')] };
    expect(decodeComparison(JSON.stringify({ version: 1, design: d }), d.state)).toEqual(d);
    expect(decodeComparison('broken', d.state)).toBeNull();
    expect(decodeComparison(JSON.stringify({ version: 2, design: d }), d.state)).toBeNull();
    expect(decodeComparison(JSON.stringify({ version: 1, design: { ...d, state: { width: 'wrong', mask: true } } }), d.state)).toBeNull();
    expect(decodeComparison(JSON.stringify({ version: 1, design: { ...d, results: [d.results[0], d.results[0]] } }), d.state)).toBeNull();
  });
});
