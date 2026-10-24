import { describe, expect, it } from 'vitest';
import { bandwidthFromRise, delayPsPerMm, kneeFrequency, lineLC, lineVerdict, nextCoefficient, serpentine, velocityFactor, wavelength } from './signal';

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

describe('rise time against the trace, and serpentine tuning', () => {
  it('a trace is lumped up to 1/6 of the rise time, borderline to 1/3, a transmission line beyond', () => {
    expect(lineVerdict(10e-12, 100e-12).ratio).toBeCloseTo(0.1, 12);
    expect(lineVerdict(10e-12, 100e-12).kind).toBe('lumped');
    expect(lineVerdict(25e-12, 100e-12).kind).toBe('borderline');
    expect(lineVerdict(50e-12, 100e-12).kind).toBe('line');
    // the boundaries belong to the shorter class
    expect(lineVerdict(100e-12 / 6, 100e-12).kind).toBe('lumped');
    expect(lineVerdict(100e-12 / 3, 100e-12).kind).toBe('borderline');
  });

  it('square corners: each bump adds twice its height; the bumps cover the length to add', () => {
    const s = serpentine(5, 1, 0.1, 0.5, 0);
    expect(s.perBump).toBeCloseTo(2, 12);
    expect(s.bumps).toBe(3); // 5 mm needs 3 bumps of 2 mm
    expect(s.added).toBeCloseTo(6, 12);
    expect(s.pitch).toBeCloseTo(1.2, 12); // 2 · (0.5 + 0.1)
    expect(s.sectionLength).toBeCloseTo(3.6, 12);
    expect(serpentine(4, 1, 0.1, 0.5, 0).bumps).toBe(2); // exactly 4 mm: no extra bump
    expect(serpentine(0, 1, 0.1, 0.5).bumps).toBe(0);
  });

  it('45° corners take (√2 − 1)·d each from the bump: a chamfered corner against the square one', () => {
    // a 90° corner with runs of m each (2m of path) becomes a diagonal of √2·m: it loses (2 − √2)·m = (√2 − 1)·d
    const d = 0.15;
    const s = serpentine(10, 1, 0.1, 0.5, d);
    expect(s.perBump).toBeCloseTo(2 - 4 * (Math.SQRT2 - 1) * d, 12);
    expect(s.perBump).toBeCloseTo(1.75147, 5);
    expect(s.bumps).toBe(6);
  });

  it('checks the spacing rule and that the corners fit', () => {
    expect(serpentine(1, 1, 0.1, 0.5).gapOk).toBe(true); // 5 w
    expect(serpentine(1, 1, 0.1, 0.3).gapOk).toBe(false);
    // the default diagonal 1.5 w = 0.15 takes 0.106 from each run: a 0.1 mm high bump has no room for it
    expect(serpentine(1, 0.1, 0.1, 0.5).fits).toBe(false);
    expect(serpentine(1, 1, 0.1, 0.5).fits).toBe(true);
  });
});
