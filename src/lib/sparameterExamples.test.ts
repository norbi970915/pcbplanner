import { describe, expect, it } from 'vitest';
import { sparameterExampleText } from './sparameterExamples';
import { parseTouchstone } from './touchstone';
import { mixedIndex, toMixedMode } from './mixedMode';
import { groupDelay, term, valueAt } from './sparamTrace';
import { impedanceFromRho, lowPassStep } from './tdr';

describe('synthetic Touchstone teaching examples', () => {
  it('imports the two-port fixture and agrees with its loss, delay, mismatch and TDR notes', () => {
    const n = parseTouchstone(sparameterExampleText('two-port'), { ports: 2 });
    expect(n.ports).toBe(2);
    expect(n.freq.length).toBe(201);
    expect(n.freq[0]).toBe(0);
    expect(n.freq[200]).toBe(10e9);
    expect(n.referenceOhms).toEqual([50, 50]);
    const transmission = term(n, 1, 0), reflection = term(n, 0, 0);
    for (const f of [0, 4e9, 10e9]) {
      expect(valueAt(n.freq, transmission, f)!.db).toBeCloseTo(20 * Math.log10(0.8), 10);
      expect(valueAt(n.freq, reflection, f)!.db).toBeCloseTo(-20, 10);
    }
    for (const delay of groupDelay(n.freq, transmission, 2)) expect(delay).toBeCloseTo(100e-12, 19);
    const step = lowPassStep(n.freq, reflection.re, reflection.im, 6);
    if ('error' in step) throw new Error(step.error);
    const k = Array.from(step.t).findIndex(t => t >= 1e-9);
    expect(impedanceFromRho(step.rho[k], 50)).toBeCloseTo(50 * 1.1 / 0.9, 1);
  });

  it('imports the four-port fixture with the documented paths and predicts skew conversion', () => {
    const n = parseTouchstone(sparameterExampleText('differential'), { ports: 4 });
    for (const [row, col, delay] of [[2, 0, 150e-12], [3, 1, 180e-12]] as const) {
      const t = term(n, row, col), reciprocal = term(n, col, row);
      expect(t).toEqual(reciprocal);
      for (const d of groupDelay(n.freq, t, 2)) expect(d).toBeCloseTo(delay, 19);
    }
    const m = toMixedMode(n, '13');
    const tx = term(m, ...mixedIndex('dd21')!), conversion = term(m, ...mixedIndex('cd21')!), rx = term(m, ...mixedIndex('dd11')!);
    for (const f of [1e9, 4e9, 10e9]) {
      const angle = 2 * Math.PI * f * 15e-12;
      expect(valueAt(n.freq, tx, f)!.db).toBeCloseTo(20 * Math.log10(0.8 * Math.cos(angle)), 10);
      expect(valueAt(n.freq, conversion, f)!.db).toBeCloseTo(20 * Math.log10(0.8 * Math.sin(angle)), 10);
      expect(valueAt(n.freq, rx, f)!.db).toBeCloseTo(-20, 10);
    }
    for (const d of groupDelay(n.freq, tx, 2)) expect(d).toBeCloseTo(165e-12, 19);
    expect(impedanceFromRho(rx.re[0], 100)).toBeCloseTo(122.222222222, 8);
    const wrong = toMixedMode(n, '12');
    expect(valueAt(n.freq, term(wrong, ...mixedIndex('dd21')!), 4e9)!.db).toBe(-Infinity);
    // Every row has at most 0.1 reflection + 0.8 transmission; the reciprocal matrix
    // therefore has spectral norm <= sqrt(||S||1 ||S||∞) = 0.9, below passive limit 1.
    for (let k = 0; k < n.freq.length; k++) for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let col = 0; col < 4; col++) { const i = k * 16 + row * 4 + col; sum += Math.hypot(n.re[i], n.im[i]); }
      expect(sum).toBeLessThanOrEqual(0.900000000001);
    }
  });
});
