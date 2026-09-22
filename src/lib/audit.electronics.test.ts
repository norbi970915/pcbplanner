import { describe, expect, it } from 'vitest';
import {
  analyzePad,
  bridgedTPad,
  combine,
  crystalCL,
  crystalLoadCap,
  crystalPullPpm,
  divider,
  driftSecondsPerDay,
  E_SERIES,
  eNearest,
  eNeighbors,
  eValuesInRange,
  lcImpedance,
  ledResistor,
  ohmsLaw,
  padBranches,
  parseValue,
  piPad,
  powerRating,
  resonantFreq,
  tPad,
} from './electronics';

describe('audit: attenuator pads', () => {
  // Standard 50 Ω attenuator tables (e.g. microwaves101.com "Attenuators";
  // Reference Data for Engineers, 9th ed., ch. 11):
  //  3 dB Pi: shunt 292.4, series 17.61   T: series 8.550, shunt 141.9
  // 10 dB Pi: shunt 96.25, series 71.15   T: series 25.97, shunt 35.14
  it('Pi pad', () => {
    expect(piPad(3, 50).shunt).toBeCloseTo(292.4, 1);
    expect(piPad(3, 50).series).toBeCloseTo(17.61, 2);
    expect(piPad(10, 50).shunt).toBeCloseTo(96.25, 2);
    expect(piPad(10, 50).series).toBeCloseTo(71.15, 2);
  });
  it('T pad', () => {
    expect(tPad(3, 50).series).toBeCloseTo(8.55, 2);
    expect(tPad(3, 50).shunt).toBeCloseTo(141.9, 1);
    expect(tPad(10, 50).series).toBeCloseTo(25.97, 2);
    expect(tPad(10, 50).shunt).toBeCloseTo(35.14, 2);
  });
  it('bridged T: Rbridge·Rshunt = Z0² (matching condition)', () => {
    const b = bridgedTPad(6, 50);
    expect(b.bridge * b.shunt).toBeCloseTo(2500, 9);
  });
  it.each(['pi', 't', 'bt'] as const)('%s: nodal analysis of exact values gives the design loss and a perfect match', (topo) => {
    const v = topo === 'pi' ? [piPad(6, 50).shunt, piPad(6, 50).series, piPad(6, 50).shunt] : topo === 't' ? [tPad(6, 50).series, tPad(6, 50).shunt, tPad(6, 50).series] : [50, 50, bridgedTPad(6, 50).bridge, bridgedTPad(6, 50).shunt];
    const a = analyzePad(padBranches(topo, v), 50);
    expect(a.loss).toBeCloseTo(6, 9);
    expect(a.zin).toBeCloseTo(50, 9);
    // dissipated fraction = 1 − 10^(−A/10)
    expect(a.dissipation.reduce((s, x) => s + x, 0)).toBeCloseTo(1 - 10 ** -0.6, 9);
  });
});

describe('audit: E-series (IEC 60063:2015)', () => {
  it('series lengths and E24/E12 lists', () => {
    expect(E_SERIES.E12.length).toBe(12);
    expect(E_SERIES.E24.length).toBe(24);
    expect(E_SERIES.E96.length).toBe(96);
    // IEC 60063 E24: 1.0 1.1 1.2 1.3 1.5 1.6 1.8 2.0 2.2 2.4 2.7 3.0 3.3 3.6 3.9 4.3 4.7 5.1 5.6 6.2 6.8 7.5 8.2 9.1
    expect(E_SERIES.E24).toEqual([100, 110, 120, 130, 150, 160, 180, 200, 220, 240, 270, 300, 330, 360, 390, 430, 470, 510, 560, 620, 680, 750, 820, 910]);
    expect(E_SERIES.E12).toEqual(E_SERIES.E24.filter((_, i) => i % 2 === 0));
  });
  it('E96 equals round(100·10^(i/96)) for every entry (IEC 60063 E96 has no historical exceptions)', () => {
    E_SERIES.E96.forEach((v, i) => expect(v).toBe(Math.round(100 * 10 ** (i / 96))));
  });
  it('neighbours and nearest across decades', () => {
    expect(eNeighbors(4.8, 'E12')).toEqual({ below: 4.7, above: 5.6 });
    expect(eNeighbors(0.047, 'E12')).toEqual({ below: 0.047, above: 0.047 });
    expect(eNeighbors(9.5e3, 'E12')).toEqual({ below: 8200, above: 10000 });
    expect(eNearest(28, 'E12')).toBe(27);
    expect(eNearest(10.2e3, 'E96')).toBe(10.2e3);
    expect(eValuesInRange(90, 130, 'E12')).toEqual([100, 120]);
  });
});

describe('audit: misc electronics', () => {
  it("Ohm's law", () => {
    expect(ohmsLaw('RP', { V: 0, I: 0, R: 100, P: 1 })).toEqual({ V: 10, I: 0.1, R: 100, P: 1 });
    expect(ohmsLaw('VP', { V: 12, I: 0, R: 0, P: 6 })).toEqual({ V: 12, I: 0.5, R: 24, P: 6 });
  });
  it('LC resonance: 10 µH, 100 pF → 5.033 MHz', () => {
    expect(resonantFreq(10e-6, 100e-12) / 1e6).toBeCloseTo(5.0329, 3);
    const z = lcImpedance(1e6, 10e-6, 100e-12, 1, 0);
    // below resonance the series LC is capacitive and the parallel tank inductive
    expect(z.seriesPhaseDeg).toBeLessThan(0);
    expect(z.parallelPhaseDeg).toBeGreaterThan(0);
    expect(z.parallel).toBeCloseTo(1 / Math.abs(2 * Math.PI * 1e6 * 100e-12 - 1 / (2 * Math.PI * 1e6 * 10e-6)), 6);
  });
  it('crystal load capacitors (ST AN2867 §: CL = C1·C2/(C1+C2) + Cstray)', () => {
    expect(crystalLoadCap(18, 4)).toBe(28);
    expect(crystalCL(28, 28, 4)).toBe(18);
    // lower CL → higher frequency
    expect(crystalPullPpm(5e-3, 2, 16, 18)).toBeGreaterThan(0);
    // Cm/2·(1/18 − 1/20)·1e6 with Cm = 5 fF = 0.005 pF → 13.89 ppm
    expect(crystalPullPpm(0.005, 2, 16, 18)).toBeCloseTo(13.889, 2);
  });
  it('20 ppm drift = 1.728 s/day', () => expect(driftSecondsPerDay(20)).toBeCloseTo(1.728, 9));
  it('divider, LED, combinations, ratings', () => {
    const d = divider(5, 10e3, 10e3, 10e3);
    expect(d.vout).toBeCloseTo(5 / 3, 9);
    expect(d.unloaded).toBeCloseTo(2.5, 9);
    expect(ledResistor(5, 2, 0.02).r).toBeCloseTo(150, 9);
    expect(combine('C', [1e-9, 1e-9]).series).toBeCloseTo(0.5e-9, 18);
    expect(combine('R', [100, 100]).parallel).toBeCloseTo(50, 12);
    expect(powerRating(0.1)).toBe(0.25);
    expect(Number.isNaN(powerRating(20))).toBe(true);
  });
  it('parseValue', () => {
    expect(parseValue('4k7')).toBe(4700);
    expect(parseValue('4R7')).toBeCloseTo(4.7, 12);
    expect(parseValue('2n2')).toBeCloseTo(2.2e-9, 20);
    expect(parseValue('10 kΩ')).toBe(10000);
    expect(parseValue('2.2uF')).toBeCloseTo(2.2e-6, 18);
    expect(parseValue('1M')).toBe(1e6);
    expect(parseValue('1m')).toBe(1e-3);
    expect(parseValue('abc')).toBeNaN();
  });
  // BUG: the unit-suffix strip /(Ω|ohms?|F|H)$/i is case-insensitive, so a bare
  // femto prefix "f" is removed as if it were the unit "F": "10f" parses as 10
  // (ten farads) instead of 10 fF. electronics.ts:215. "10fF" works.
  it('parseValue("10f") is 10 femto, not 10 (fixed)', () => {
    expect(parseValue('10f')).toBeCloseTo(10e-15, 25);
  });
});
