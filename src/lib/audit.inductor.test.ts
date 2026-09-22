import { describe, expect, it } from 'vitest';
import { CURRENT_SHEET, innerFromOuter, perimeterFactor, spiral, WHEELER } from './inductor';

describe('audit: Mohan et al. planar spiral (IEEE JSSC 34(10), 1999)', () => {
  it('coefficients equal Tables I and II of the paper', () => {
    // web.stanford.edu/~boyd/papers/pdf/inductance_expressions.pdf, p. 1421
    expect(WHEELER).toEqual({ square: { k1: 2.34, k2: 2.75 }, hexagonal: { k1: 2.33, k2: 3.82 }, octagonal: { k1: 2.25, k2: 3.55 } });
    expect(CURRENT_SHEET).toEqual({
      square: { c1: 1.27, c2: 2.07, c3: 0.18, c4: 0.13 },
      hexagonal: { c1: 1.09, c2: 2.23, c3: 0.0, c4: 0.17 },
      octagonal: { c1: 1.07, c2: 2.29, c3: 0.0, c4: 0.19 },
      circular: { c1: 1.0, c2: 2.46, c3: 0.0, c4: 0.2 },
    });
  });

  // Table IV of the paper, measured inductors (µm, nH) and the reported errors of the
  // modified-Wheeler (e_whe) and current-sheet (e_gmd) expressions, error = (Lmeas − Lexpr)/Lmeas.
  it.each([
    // #, n, dout, w, s, Lmeas, e_whe %, e_gmd %
    [1, 2.75, 344, 29.7, 1.9, 3.2, 5.2, 6.4],
    [2, 3.75, 292, 13.0, 1.9, 6.0, -1.2, -0.7],
  ])('Table IV inductor #%s reproduces the published expression values within 1 %%', (_i, n, dout, w, s, lm, ew, eg) => {
    const r = spiral({ shape: 'square', n, wMm: w * 1e-3, sMm: s * 1e-3, dOutMm: dout * 1e-3, tMm: 0.001, freqHz: 1e6 });
    expect(Math.abs(r.lWheeler * 1e9 / (lm * (1 - ew / 100)) - 1)).toBeLessThan(0.01);
    expect(Math.abs(r.lSheet * 1e9 / (lm * (1 - eg / 100)) - 1)).toBeLessThan(0.01);
  });

  it('geometry helpers', () => {
    expect(innerFromOuter(10, 5, 0.2, 0.2)).toBeCloseTo(6.4, 12);
    expect(perimeterFactor('square')).toBeCloseTo(4, 12);
    expect(perimeterFactor('octagonal')).toBeCloseTo(8 * Math.tan(Math.PI / 8), 12);
    expect(perimeterFactor('circular')).toBe(Math.PI);
  });
});
