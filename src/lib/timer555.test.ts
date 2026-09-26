import { describe, expect, it } from 'vitest';
import { astable, designAstable, monostable, monostableR } from './timer555';

const near = (a: number, b: number, rel = 1e-12) => expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.abs(b) * rel);

describe('555 astable', () => {
  it('matches the TI datasheet example (RA 5 kΩ, RB 3 kΩ, 0.15 µF)', () => {
    const a = astable(5e3, 3e3, 0.15e-6);
    near(a.tHigh, Math.LN2 * 8e3 * 0.15e-6);
    near(a.tLow, Math.LN2 * 3e3 * 0.15e-6);
    near(a.duty, 8 / 11);
    // TI's rounded form f ≈ 1.44 / ((RA + 2 RB) C)
    near(a.freq, 1.44 / (11e3 * 0.15e-6), 2e-3);
  });

  it('with a diode across RB sets the high time with RA alone', () => {
    const a = astable(10e3, 10e3, 10e-9, true);
    near(a.duty, 0.5);
    near(a.tHigh, Math.LN2 * 10e3 * 10e-9);
  });
});

describe('555 monostable', () => {
  it('uses ln 3 · R · C ≈ 1.1 R C', () => {
    near(monostable(10e3, 1e-6), Math.log(3) * 10e-3);
    near(monostable(10e3, 1e-6), 1.1 * 10e-3, 2e-3);
    near(monostableR(monostable(47e3, 220e-9), 220e-9), 47e3);
  });
});

describe('555 astable design', () => {
  it('finds RA and RB for a frequency and duty above 50 %', () => {
    const d = designAstable(1e3, 0.6, 100e-9, 'E24')!;
    expect(d.diode).toBe(false);
    near(d.exact.freq, 1e3, 1e-9);
    near(d.exact.duty, 0.6, 1e-9);
    expect(d.std.ra).toBeGreaterThan(0);
    near(d.std.timing.freq, 1e3, 0.1);
  });

  it('uses the diode circuit at 50 % and below', () => {
    const d = designAstable(1e3, 0.25, 100e-9, 'E24')!;
    expect(d.diode).toBe(true);
    near(d.exact.duty, 0.25, 1e-9);
    expect(designAstable(1e3, 0.5, 100e-9, 'E24')!.diode).toBe(true);
  });

  it('rejects impossible inputs', () => {
    expect(designAstable(0, 0.5, 1e-9, 'E24')).toBeNull();
    expect(designAstable(1e3, 1, 1e-9, 'E24')).toBeNull();
  });
});
