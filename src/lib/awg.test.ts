import { describe, expect, it } from 'vitest';
import {
  AWG,
  IACS_RESISTIVITY_20C_OHM_CMIL_PER_FT,
  SOURCES,
  awgDiameterInch,
  awgDiameterInchRounded,
  copperOhmPerMetre,
} from '../data/awg';

describe('AWG data', () => {
  it('covers 0000 … 40 in order', () => {
    expect(AWG).toHaveLength(44);
    expect(AWG[0].name).toBe('0000');
    expect(AWG[3].name).toBe('0');
    expect(AWG[43].name).toBe('40');
    for (let i = 1; i < AWG.length; i++) expect(AWG[i].inch).toBeLessThan(AWG[i - 1].inch);
  });

  it('every tabulated diameter equals the B258 formula rounded to 0.0001 in', () => {
    for (const s of AWG) expect(awgDiameterInchRounded(s.n)).toBeCloseTo(s.inch, 10);
  });

  it('defining points of the formula are exact', () => {
    expect(awgDiameterInch(-3)).toBeCloseTo(0.46, 12);
    expect(awgDiameterInch(36)).toBeCloseTo(0.005, 12);
  });

  it('spot values (NBS Handbook 100 Table 5)', () => {
    const g = (n: string) => AWG.find((s) => s.name === n)!;
    expect(g('0000').inch).toBe(0.46);
    expect(g('10').inch).toBe(0.1019);
    expect(g('24').inch).toBe(0.0201);
    expect(g('40').inch).toBe(0.0031);
    expect(g('12').mm).toBeCloseTo(2.05232, 5);
  });

  it('resistance matches NBS HB100 Table 5 (Ω/1000 ft at 20 °C) within rounding', () => {
    const g = (n: string) => AWG.find((s) => s.name === n)!;
    const ohmPerKft = (name: string) => (IACS_RESISTIVITY_20C_OHM_CMIL_PER_FT / g(name).cmil) * 1000;
    expect(ohmPerKft('10')).toBeCloseTo(0.9988, 3);
    expect(ohmPerKft('0000')).toBeCloseTo(0.04901, 4);
    expect(ohmPerKft('30')).toBeCloseTo(104, 0);
    // SI path agrees with the cmil path to 0.01 %
    const perM = copperOhmPerMetre(g('10'));
    expect(perM * 304.8).toBeCloseTo(ohmPerKft('10'), 3);
  });

  it('lists sources with URLs', () => {
    for (const s of SOURCES) expect(s.url).toMatch(/^https:\/\//);
  });
});
