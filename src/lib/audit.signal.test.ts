import { describe, expect, it } from 'vitest';
import { bandwidthFromRise, delayPsPerMm, kneeFrequency, lineLC, nextCoefficient, velocityFactor, wavelength } from './signal';

describe('audit: signal relations', () => {
  it('delay per length', () => {
    // 1/c = 3.3356 ps/mm (c = 299 792 458 m/s). In εeff = 4, 6.671 ps/mm (≈ 170 ps/in, Johnson & Graham ch. 5).
    expect(delayPsPerMm(1)).toBeCloseTo(3.33564, 5);
    expect(delayPsPerMm(4)).toBeCloseTo(6.67128, 5);
    expect(velocityFactor(4)).toBe(0.5);
  });

  it('rise time relations (Johnson & Graham, High-Speed Digital Design, §1.1: fknee = 0.5/tr; single pole 0.35/tr)', () => {
    expect(bandwidthFromRise(1e-9)).toBeCloseTo(350e6, 0);
    expect(kneeFrequency(100e-12)).toBeCloseTo(5e9, 0);
  });

  it('wavelength: 1 GHz in free space = 299.79 mm; in εeff 4 half of that', () => {
    expect(wavelength(1e9, 1)).toBeCloseTo(0.299792458, 12);
    expect(wavelength(1e9, 4)).toBeCloseTo(0.149896229, 12);
  });

  it('L and C per length: Z0 = √(L/C), v = 1/√(LC)', () => {
    // 50 Ω, εeff 4: L = Z0·√εeff/c = 333.6 nH/m, C = √εeff/(Z0·c) = 133.4 pF/m
    const { lPerM, cPerM } = lineLC(50, 4);
    expect(lPerM * 1e9).toBeCloseTo(333.564, 2);
    expect(cPerM * 1e12).toBeCloseTo(133.426, 2);
    expect(Math.sqrt(lPerM / cPerM)).toBeCloseTo(50, 9);
  });

  it('backward coupling coefficient Kb = ¼(Cm/C + Lm/L) (Bogatin, SI&PI Simplified, ch. 10)', () => {
    // Homogeneous line: Ze = v(L+Lm), Zo = v(L−Lm) ⇒ Lm/L = Cm/C = (Ze−Zo)/(Ze+Zo),
    // so Kb = ½·(Ze−Zo)/(Ze+Zo). For Lm/L = 0.1: Kb = 0.05.
    const L = 1, Lm = 0.1, v = 1;
    expect(nextCoefficient(v * (L + Lm), v * (L - Lm))).toBeCloseTo(0.05, 12);
  });
});
