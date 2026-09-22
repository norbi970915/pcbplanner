import { describe, expect, it } from 'vitest';
import { C0, cToF, ETA0, fmt, fromMm, fToC, MM_PER_MIL, MM_PER_OZ, plain, si, toMm } from './units';

describe('audit: units', () => {
  it('physical constants', () => {
    // SI definition (BIPM SI Brochure, 9th ed.): c = 299 792 458 m/s exactly.
    expect(C0).toBe(299_792_458);
    // CODATA 2018: Z0 = µ0·c ≈ 376.730 313 668 Ω.
    expect(ETA0).toBeCloseTo(376.730313668, 6);
  });

  it('length conversions', () => {
    // 1 in = 25.4 mm exactly (International yard and pound agreement, 1959); 1 mil = 0.001 in.
    expect(MM_PER_MIL).toBe(0.0254);
    expect(toMm(1, 'in')).toBe(25.4);
    expect(fromMm(25.4, 'mil')).toBeCloseTo(1000, 9);
    expect(toMm(1000, 'um')).toBeCloseTo(1, 12);
    // Industry convention used by IPC-2221 calculators (e.g. Advanced Circuits / 4pcb.com): 1 oz/ft² = 1.378 mil ≈ 35 µm.
    expect(MM_PER_OZ * 1000).toBeCloseTo(35.0, 1);
  });

  it('temperature', () => {
    // Definition of the Fahrenheit scale: 100 °C = 212 °F, −40 °C = −40 °F.
    expect(cToF(100)).toBeCloseTo(212, 12);
    expect(cToF(-40)).toBeCloseTo(-40, 12);
    expect(fToC(212)).toBeCloseTo(100, 12);
  });

  it('formatting', () => {
    expect(si(0.0123, 'Ω')).toBe('12.3 mΩ');
    expect(si(4700, 'Ω')).toBe('4.7 kΩ');
    expect(si(0, 'V')).toBe('0 V');
    expect(si(NaN, 'V')).toBe('—');
    expect(fmt(Infinity)).toBe('—');
    expect(fmt(1.5e-5)).toBe('1.50e-5');
    expect(plain(0.1 + 0.2)).toBe('0.3');
    expect(plain(NaN)).toBe('');
  });

  // BUG (cosmetic): a value that rounds up to the next decade at the requested
  // precision is printed with the smaller prefix, e.g. 999.96 Ω → "1,000 Ω"
  // instead of "1 kΩ" (and 0.99996 mA → "1,000 µA"). The prefix is chosen
  // before rounding.
  it('si() picks the prefix after rounding (fixed) (999.96 Ω → 1 kΩ)', () => {
    expect(si(999.96, 'Ω')).toBe('1 kΩ');
  });
});
