import { describe, expect, it } from 'vitest';
import {
  analyzePad,
  bridgedTPad,
  cForResonance,
  combine,
  crystalCL,
  crystalLoadCap,
  crystalPullPpm,
  divider,
  dividerPairs,
  driftSecondsPerDay,
  E_SERIES,
  eNearest,
  eNeighbors,
  eValuesInRange,
  freqErrorFromPpm,
  lcImpedance,
  ledResistor,
  lForResonance,
  ohmsLaw,
  padBranches,
  parseList,
  parseValue,
  piPad,
  powerRating,
  ppmFromFreq,
  resonantFreq,
  tPad,
  xC,
  xL,
} from './electronics';

const ALL = { V: 0, I: 0, R: 0, P: 0 };

describe("Ohm's law", () => {
  it('every pair gives 12 V, 2 A, 6 Ω, 24 W', () => {
    const ref = { V: 12, I: 2, R: 6, P: 24 };
    for (const pair of ['VI', 'VR', 'VP', 'IR', 'IP', 'RP'] as const) {
      const r = ohmsLaw(pair, { ...ALL, [pair[0]]: ref[pair[0] as 'V'], [pair[1]]: ref[pair[1] as 'V'] });
      expect(r.V).toBeCloseTo(12, 10);
      expect(r.I).toBeCloseTo(2, 10);
      expect(r.R).toBeCloseTo(6, 10);
      expect(r.P).toBeCloseTo(24, 10);
    }
  });
  it('100 Ω at 0.25 W → 5 V, 50 mA', () => {
    const r = ohmsLaw('RP', { ...ALL, R: 100, P: 0.25 });
    expect(r.V).toBeCloseTo(5, 10);
    expect(r.I).toBeCloseTo(0.05, 10);
  });
});

describe('reactance and resonance', () => {
  it('XC of 100 nF at 1 MHz ≈ 1.592 Ω, XL of 10 µH at 1 MHz ≈ 62.83 Ω', () => {
    expect(xC(1e6, 100e-9)).toBeCloseTo(1.59155, 4);
    expect(xL(1e6, 10e-6)).toBeCloseTo(62.8319, 3);
  });
  it('10 µH with 100 pF resonates at ≈ 5.033 MHz', () => {
    expect(resonantFreq(10e-6, 100e-12) / 1e6).toBeCloseTo(5.0329, 3);
  });
  it('25.33 µH needs ≈ 1 nF for 1 MHz; L and C solutions invert resonantFreq', () => {
    expect(cForResonance(1e6, 25.33e-6) * 1e9).toBeCloseTo(1.0, 3);
    expect(resonantFreq(lForResonance(10.7e6, 82e-12), 82e-12)).toBeCloseTo(10.7e6, 0);
    expect(resonantFreq(3.3e-6, cForResonance(7e6, 3.3e-6))).toBeCloseTo(7e6, 0);
  });
  it('at resonance: series |Z| = Rs, parallel |Z| = Rp, Q = √(L/C)/Rs', () => {
    const L = 10e-6, C = 100e-12;
    const z = lcImpedance(resonantFreq(L, C), L, C, 2, 10e3);
    expect(z.series).toBeCloseTo(2, 6);
    expect(z.parallel).toBeCloseTo(10e3, 3);
    expect(z.z0).toBeCloseTo(316.228, 2);
    expect(z.qSeries).toBeCloseTo(158.11, 1);
    expect(z.qParallel).toBeCloseTo(31.623, 2);
  });
  it('off resonance, ideal: series |Z| = |XL − XC|, parallel = XL·XC/|XL − XC|', () => {
    const z = lcImpedance(1e6, 10e-6, 100e-12); // XL = 62.83, XC = 1591.5
    expect(z.series).toBeCloseTo(1591.549 - 62.832, 2);
    expect(z.parallel).toBeCloseTo((62.832 * 1591.549) / (1591.549 - 62.832), 2);
    expect(z.parallelPhaseDeg).toBeCloseTo(90, 6); // below resonance a tank is inductive
    expect(z.seriesPhaseDeg).toBeCloseTo(-90, 6);
  });
});

describe('crystal', () => {
  it('C1 = C2 = 2·(CL − Cs): 18 pF with 5 pF stray → 26 pF', () => {
    expect(crystalLoadCap(18e-12, 5e-12)).toBeCloseTo(26e-12, 20);
    expect(crystalCL(26e-12, 26e-12, 5e-12)).toBeCloseTo(18e-12, 20);
    expect(crystalCL(22e-12, 22e-12, 5e-12)).toBeCloseTo(16e-12, 20);
  });
  it('pulling: lower CL raises frequency', () => {
    // Cm = 5 fF, C0 = 2 pF: 5e-15/2 · (1/18p − 1/20p) = 13.89 ppm
    expect(crystalPullPpm(5e-15, 2e-12, 16e-12, 18e-12)).toBeCloseTo(13.889, 2);
    expect(crystalPullPpm(5e-15, 2e-12, 18e-12, 18e-12)).toBe(0);
  });
  it('ppm: 25 MHz reading 25.0005 MHz is +20 ppm = 1.728 s/day', () => {
    expect(ppmFromFreq(25e6, 25.0005e6)).toBeCloseTo(20, 6);
    expect(freqErrorFromPpm(32768, 20)).toBeCloseTo(0.65536, 8);
    expect(driftSecondsPerDay(20)).toBeCloseTo(1.728, 10);
  });
});

describe('E-series (IEC 60063)', () => {
  it('has 12, 24 and 96 ascending values; E12 ⊂ E24', () => {
    expect(E_SERIES.E12).toHaveLength(12);
    expect(E_SERIES.E24).toHaveLength(24);
    expect(E_SERIES.E96).toHaveLength(96);
    for (const s of Object.values(E_SERIES)) for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThan(s[i - 1]);
    for (const v of E_SERIES.E12) expect(E_SERIES.E24).toContain(v);
  });
  it('E96 equals round(100·10^(i/96)) for every value', () => {
    E_SERIES.E96.forEach((v, i) => expect(v).toBe(Math.round(100 * 10 ** (i / 96))));
  });
  it('E24 deviates from the rounded geometric series only at the historical values', () => {
    const odd = E_SERIES.E24.filter((v, i) => v !== Math.round(10 * 10 ** (i / 24)) * 10);
    expect(odd).toEqual([270, 300, 330, 360, 390, 430, 470, 820]);
  });
  it('nearest value on a log scale', () => {
    expect(eNearest(5000, 'E12')).toBe(4700); // 5000/4700 = 1.064 < 5600/5000 = 1.12
    expect(eNearest(5200, 'E12')).toBe(5600);
    expect(eNearest(0.0047, 'E12')).toBe(0.0047);
    expect(eNearest(10050, 'E96')).toBe(10000);
    expect(eNearest(9.9, 'E24')).toBe(10);
    expect(eNearest(26e-12, 'E12')).toBeCloseTo(27e-12, 20);
    expect(eNearest(26e-12, 'E24')).toBeCloseTo(27e-12, 20);
    expect(eNeighbors(1000, 'E12')).toEqual({ below: 1000, above: 1000 });
    expect(eNeighbors(950, 'E12')).toEqual({ below: 820, above: 1000 });
  });
  it('values in range', () => {
    expect(eValuesInRange(1000, 10000, 'E12')).toEqual([1000, 1200, 1500, 1800, 2200, 2700, 3300, 3900, 4700, 5600, 6800, 8200, 10000]);
  });
});

describe('resistor networks', () => {
  it('divider: 10 k / 10 k from 5 V → 2.5 V, 250 µA, 5 kΩ source', () => {
    const d = divider(5, 10e3, 10e3);
    expect(d.vout).toBeCloseTo(2.5, 10);
    expect(d.current).toBeCloseTo(250e-6, 12);
    expect(d.rOut).toBeCloseTo(5000, 8);
    expect(divider(5, 10e3, 10e3, 10e3).vout).toBeCloseTo(5 / 3, 10);
  });
  it('divider synthesis: 1/3 in E24 is exact (R1 = 2·R2), 3.3 V from 5 V in E96', () => {
    const p = dividerPairs(1 / 3, 30e3, 'E24');
    expect(p[0].error).toBeCloseTo(0, 12);
    expect(p[0].r1 / p[0].r2).toBeCloseTo(2, 12);
    const q = dividerPairs(3.3 / 5, 10e3, 'E96');
    for (let i = 1; i < q.length; i++) expect(Math.abs(q[i].error)).toBeGreaterThanOrEqual(Math.abs(q[i - 1].error));
    // brute force over every E96 pair with R1 + R2 in the same window
    const vals = eValuesInRange(100, 1e5, 'E96');
    let best = Infinity;
    for (const r1 of vals)
      for (const r2 of vals) {
        const s = r1 + r2;
        if (s < 10e3 / Math.sqrt(10) || s > 10e3 * Math.sqrt(10)) continue;
        best = Math.min(best, Math.abs(r2 / s / 0.66 - 1));
      }
    expect(Math.abs(q[0].error)).toBeCloseTo(best, 12);
    expect(Math.abs(q[0].error)).toBeLessThan(2e-3);
    expect(q[0].r2 / (q[0].r1 + q[0].r2)).toBeCloseTo(q[0].ratio, 12);
  });
  it('LED: 5 V, 2 V, 20 mA → 150 Ω, 60 mW; two LEDs → 50 Ω', () => {
    const l = ledResistor(5, 2, 0.02);
    expect(l.r).toBeCloseTo(150, 10);
    expect(l.ideal.pR).toBeCloseTo(0.06, 10);
    expect(l.at(180).current).toBeCloseTo(3 / 180, 10);
    expect(ledResistor(5, 2, 0.02, 2).r).toBeCloseTo(50, 10);
    expect(powerRating(0.06)).toBe(0.125);
  });
  it('series / parallel', () => {
    expect(combine('R', [100, 100])).toEqual({ series: 200, parallel: 50 });
    const r = combine('R', [1e3, 2.2e3, 4.7e3]);
    expect(r.parallel).toBeCloseTo(1 / (1 / 1e3 + 1 / 2.2e3 + 1 / 4.7e3), 8);
    const c = combine('C', [1e-9, 1e-9]);
    expect(c.series).toBeCloseTo(0.5e-9, 20);
    expect(c.parallel).toBeCloseTo(2e-9, 20);
    expect(combine('L', [10e-6, 22e-6]).series).toBeCloseTo(32e-6, 15);
  });
  it('parses SI and RKM values', () => {
    expect(parseValue('4k7')).toBeCloseTo(4700, 9);
    expect(parseValue('4R7')).toBeCloseTo(4.7, 12);
    expect(parseValue('2n2')).toBeCloseTo(2.2e-9, 20);
    expect(parseValue('10kΩ')).toBeCloseTo(1e4, 9);
    expect(parseValue('10 k')).toBeCloseTo(1e4, 9);
    expect(parseValue('100n')).toBeCloseTo(1e-7, 20);
    expect(parseValue('2.2uF')).toBeCloseTo(2.2e-6, 20);
    expect(parseValue('2.2µH')).toBeCloseTo(2.2e-6, 20);
    expect(parseValue('1M')).toBe(1e6);
    expect(parseValue('1m')).toBe(1e-3);
    expect(parseValue('1e3')).toBe(1000);
    expect(parseValue('abc')).toBeNaN();
    expect(parseList('1k, 2k2; 330').map((v) => v.value)).toEqual([1000, 2200, 330]);
  });
});

describe('attenuator pads', () => {
  it('3 dB Pi at 50 Ω: shunt ≈ 292.4 Ω, series ≈ 17.61 Ω', () => {
    const p = piPad(3, 50);
    expect(p.shunt).toBeCloseTo(292.4, 1);
    expect(p.series).toBeCloseTo(17.61, 2);
  });
  it('10 dB Pi and T at 50 Ω match the handbook tables', () => {
    const p = piPad(10, 50);
    expect(p.shunt).toBeCloseTo(96.25, 2);
    expect(p.series).toBeCloseTo(71.15, 2);
    const t = tPad(10, 50);
    expect(t.series).toBeCloseTo(25.97, 2);
    expect(t.shunt).toBeCloseTo(35.14, 2);
  });
  it('3 dB T at 50 Ω: series ≈ 8.55 Ω, shunt ≈ 141.9 Ω', () => {
    const t = tPad(3, 50);
    expect(t.series).toBeCloseTo(8.55, 2);
    expect(t.shunt).toBeCloseTo(141.9, 1);
  });
  it('6 dB bridged-T at 50 Ω: bridge ≈ 49.76 Ω, shunt ≈ 50.24 Ω', () => {
    const b = bridgedTPad(6, 50);
    expect(b.bridge).toBeCloseTo(49.76, 2);
    expect(b.shunt).toBeCloseTo(50.24, 2);
  });
  it('nodal analysis of the ideal pads returns the design loss and Zin = Z0', () => {
    for (const db of [1, 3, 6, 10, 20, 40]) {
      const p = piPad(db, 75);
      const t = tPad(db, 75);
      const b = bridgedTPad(db, 75);
      for (const a of [
        analyzePad(padBranches('pi', [p.shunt, p.series, p.shunt]), 75),
        analyzePad(padBranches('t', [t.series, t.shunt, t.series]), 75),
        analyzePad(padBranches('bt', [b.arm, b.arm, b.bridge, b.shunt]), 75),
      ]) {
        expect(a.loss).toBeCloseTo(db, 8);
        expect(a.zin).toBeCloseTo(75, 8);
        expect(a.returnLoss).toBeGreaterThan(100);
        // power in the resistors + power delivered = input power
        expect(a.dissipation.reduce((x, y) => x + y, 0) + 10 ** (-db / 10)).toBeCloseTo(1, 10);
      }
    }
  });
  it('a 50 Ω pad with standard values: Pi 3 dB from 294 / 17.8 Ω', () => {
    const a = analyzePad(padBranches('pi', [294, 17.8, 294]), 50);
    expect(a.loss).toBeCloseTo(3.03, 1);
    expect(a.returnLoss).toBeGreaterThan(40);
  });
});
