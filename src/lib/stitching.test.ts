import { describe, expect, it } from 'vitest';
import { apertureSE, cavityModes, gridCellResonance, wavelengthMm } from './stitching';

describe('stitching', () => {
  it('wavelength: 1 GHz in air = 299.79 mm; εr = 4 halves it', () => {
    expect(wavelengthMm(1e9, 1)).toBeCloseTo(299.792458, 6);
    expect(wavelengthMm(1e9, 4)).toBeCloseTo(149.896229, 6);
  });
  it('cavity: lowest mode of a 100 × 50 mm board in FR-4 (εr 4) is f10 = c/(2a√εr) = 749.5 MHz', () => {
    const modes = cavityModes(100, 50, 4, 3e9);
    expect(modes[0]).toMatchObject({ m: 1, n: 0 });
    expect(modes[0].f).toBeCloseTo(299792458 / (2 * 0.1 * 2), 0);
    expect(modes[1]).toMatchObject({ m: 0, n: 1 });
    expect(modes[1].f).toBeCloseTo(2 * modes[0].f, 3);
    for (let i = 1; i < modes.length; i++) expect(modes[i].f).toBeGreaterThanOrEqual(modes[i - 1].f);
  });
  it('grid cell TM11: at resonance the pitch is λ/√2', () => {
    const f = gridCellResonance(10, 4);
    expect(wavelengthMm(f, 4) / Math.SQRT2).toBeCloseTo(10, 9);
    expect(f).toBeCloseTo((299792458 * Math.SQRT2) / (2 * 0.01 * 2), 0);
  });
  it('aperture: 0 dB at L = λ/2, +20 dB per decade shorter', () => {
    const l = wavelengthMm(1e9, 1) / 2;
    expect(apertureSE(l, 1e9)).toBeCloseTo(0, 9);
    expect(apertureSE(l / 10, 1e9)).toBeCloseTo(20, 9);
  });
});
