import { describe, expect, it } from 'vitest';
import {
  biasCompR,
  closedLoopAt,
  closedLoopBw,
  closedLoopBwSinglePole,
  finiteGain,
  fullPowerBw,
  gainPairs,
  gains,
  K_BOLTZMANN,
  noiseBandwidth,
  noiseSources,
  outputOffset,
  outputRange,
  plusInputRange,
  rss,
  tolerance,
  type Circuit,
} from './opamp';

const near = (a: number, b: number, rel = 1e-12) => expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.abs(b) * rel + 1e-18);
const C = (p: Partial<Circuit>): Circuit => ({ topology: 'inverting', r1: 1e3, r2: 10e3, r3: 1e3, r4: 10e3, rs: 0, rcomp: 0, ...p });

describe('gains and noise gain (MT-033 eq. 2–4)', () => {
  it('inverting and non-inverting share the noise gain 1 + R2/R1', () => {
    const inv = gains(C({}));
    const non = gains(C({ topology: 'noninverting' }));
    near(inv.signal, -10);
    near(non.signal, 11);
    near(inv.noise, 11);
    near(non.noise, 11);
  });

  it('voltage follower: Rf = 0 gives unity gain and noise gain', () => {
    const g = gains(C({ topology: 'noninverting', r2: 0 }));
    near(g.signal, 1);
    near(g.noise, 1);
  });

  it('summing amplifier: noise gain uses the parallel input resistance', () => {
    const g = gains(C({ topology: 'summing', r1: 10e3, r2: 10e3, r3: 10e3, r4: 10e3 }));
    near(g.noise, 4);
    expect(g.terms.map((t) => t.k)).toEqual([-1, -1, -1]);
    expect(gains(C({ topology: 'summing', r1: 10e3, r2: 10e3, r3: 20e3, r4: 0 })).terms.length).toBe(2);
  });

  it('difference amplifier with matched ratios rejects common mode exactly', () => {
    const g = gains(C({ topology: 'difference', r1: 10e3, r2: 47e3, r3: 10e3, r4: 47e3 }));
    near(g.signal, 4.7);
    expect(Math.abs(g.terms[1].k)).toBeLessThan(1e-15);
    near(g.kRef, 1);
    near(g.rPlus, (10e3 * 47e3) / 57e3);
  });
});

describe('finite open-loop gain and bandwidth', () => {
  it('MT-033: gain 10 with 100 kHz bandwidth needs 1 MHz GBW', () => {
    near(closedLoopBw(1e6, 10), 100e3);
  });

  it('MT-033 eq. 1: G = NG / (1 + NG/A)', () => {
    near(finiteGain(11, 11, 1e5), 11 / (1 + 11e-5));
    near(finiteGain(-10, 11, 1e5), -10 / (1 + 11e-5));
  });

  it('single-pole model: |G| falls by √2 at GBW/NG + GBW/A0', () => {
    const aol = 1e5;
    const gbw = 3e6;
    const f3 = closedLoopBwSinglePole(gbw, 11, aol);
    const dc = closedLoopAt(-10, 11, aol, gbw, 0).closed;
    near(dc, finiteGain(10, 11, aol));
    near(closedLoopAt(-10, 11, aol, gbw, f3).closed, dc / Math.SQRT2, 1e-12);
    near(closedLoopAt(-10, 11, aol, gbw, gbw).open, aol / Math.hypot(1, aol), 1e-12); // ≈ 1 at f = GBW
  });

  it('TI SLOA088: 5 Vpp at 100 kHz needs 1.57 V/µs, so 1.57 V/µs gives 100 kHz at 2.5 V peak', () => {
    near(fullPowerBw(Math.PI * 5 * 100e3, 2.5), 100e3);
  });
});

describe('DC offset (MT-037, MT-038)', () => {
  it('MT-037: offset is amplified by the noise gain (1001 with 10 Ω / 10 kΩ)', () => {
    const g = gains(C({ topology: 'noninverting', r1: 10, r2: 10e3 }));
    near(outputOffset(g, 25e-6, 0, 0).total, 25e-6 * 1001);
  });

  it('MT-038 figure 3: with R3 = R1 ∥ R2 the bias error is R2 · Ios', () => {
    const r3 = biasCompR(1e3, 10e3);
    const g = gains(C({ rcomp: r3 }));
    const o = outputOffset(g, 0, 100e-9, 10e-9);
    expect(o.fromIb).toBeLessThan(1e-15);
    near(o.fromIos, 10e3 * 10e-9);
  });

  it('without compensation the bias current flows in Rf', () => {
    const o = outputOffset(gains(C({})), 0, 100e-9, 0);
    near(o.total, 100e-9 * 10e3);
  });
});

describe('noise (MT-049)', () => {
  it('1 kΩ gives about 4 nV/√Hz at 25 °C', () => {
    expect(Math.sqrt(4 * K_BOLTZMANN * 298.15 * 1e3) * 1e9).toBeCloseTo(4.06, 2);
  });

  it('matches the MT-049 figure 1 RTI expression times the noise gain', () => {
    const R1 = 1e3;
    const R2 = 9e3;
    const R3 = 500;
    const en = 8e-9;
    const inn = 1e-12;
    const T = 25;
    const g = gains(C({ topology: 'noninverting', r1: R1, r2: R2, rs: R3 }));
    const kT4 = 4 * K_BOLTZMANN * (T + 273.15);
    const rti2 = en ** 2 + kT4 * R3 + kT4 * R1 * (R2 / (R1 + R2)) ** 2 + kT4 * R2 * (R1 / (R1 + R2)) ** 2 + inn ** 2 * R3 ** 2 + inn ** 2 * ((R1 * R2) / (R1 + R2)) ** 2;
    near(rss(noiseSources(g, en, inn, T).map((s) => s.out)), Math.sqrt(rti2) * 10, 1e-12);
  });

  it('noise bandwidth of a single pole is π/2 · f−3dB (1.57 fCL)', () => {
    expect(noiseBandwidth(1000)).toBeCloseTo(1570.8, 1);
  });
});

describe('resistor tolerance and difference-amplifier CMRR (MT-068)', () => {
  it('MT-068 eq. 1: four 1 % resistors at unity gain give about 34 dB', () => {
    const t = tolerance(C({ topology: 'difference', r1: 10e3, r2: 10e3, r3: 10e3, r4: 10e3 }), 0.01);
    expect(t.cmrrMt068).toBeCloseTo(33.98, 2);
    // the exact worst corner agrees to first order in the tolerance
    expect(Math.abs(t.cmrrWorst! - t.cmrrMt068!)).toBeLessThan(0.2);
  });

  it('exact worst corner tracks eq. 1 at higher gain', () => {
    const t = tolerance(C({ topology: 'difference', r1: 1e3, r2: 100e3, r3: 1e3, r4: 100e3 }), 0.001);
    expect(t.cmrrMt068).toBeCloseTo(20 * Math.log10(101 / 0.004), 9);
    expect(Math.abs(t.cmrrWorst! - t.cmrrMt068!)).toBeLessThan(0.05);
  });

  it('inverting gain range is Rf(1 ± t)/Rin(1 ∓ t)', () => {
    const t = tolerance(C({}), 0.01);
    near(t.gain.lo, (-10 * 1.01) / 0.99);
    near(t.gain.hi, (-10 * 0.99) / 1.01);
  });

  it('zero tolerance leaves the gain unchanged', () => {
    const t = tolerance(C({ topology: 'noninverting' }), 0);
    near(t.gain.lo, 11);
    near(t.gain.hi, 11);
  });
});

describe('signal ranges', () => {
  it('inverting with + input at Vref: Vout = NG·Vref − G·Vin', () => {
    const r = outputRange(C({}), { vin: { lo: -0.1, hi: 0.2 }, vcm: { lo: 0, hi: 0 }, vref: 1 });
    near(r.lo, 11 - 2);
    near(r.hi, 11 + 1);
    expect(plusInputRange(C({}), { vin: { lo: -1, hi: 1 }, vcm: { lo: 0, hi: 0 }, vref: 1 })).toEqual({ lo: 1, hi: 1 });
  });

  it('difference amplifier + input follows R2′/(R1′ + R2′) of V2', () => {
    const c = C({ topology: 'difference', r1: 10e3, r2: 30e3, r3: 10e3, r4: 30e3 });
    const s = { vin: { lo: -0.1, hi: 0.1 }, vcm: { lo: 10, hi: 12 }, vref: 2 };
    const p = plusInputRange(c, s);
    near(p.lo, 0.75 * (10 - 0.05) + 0.25 * 2);
    near(p.hi, 0.75 * (12 + 0.05) + 0.25 * 2);
    const o = outputRange(c, s);
    near(o.lo, 2 - 0.3, 1e-12);
    near(o.hi, 2 + 0.3, 1e-12);
  });
});

describe('standard-value gain pairs', () => {
  it('finds exact E24 pairs', () => {
    const p = gainPairs('inverting', 10, 110e3, 'E24')[0];
    expect(p.error).toBe(0);
    expect(p.rf / p.rin).toBe(10);
    const n = gainPairs('noninverting', 2, 20e3, 'E24')[0];
    expect(n.rf).toBe(n.rin);
  });

  it('ranks by gain error and keeps the total near the target', () => {
    const list = gainPairs('noninverting', 3.3, 100e3, 'E96');
    for (let i = 1; i < list.length; i++) expect(Math.abs(list[i].error)).toBeGreaterThanOrEqual(Math.abs(list[i - 1].error));
    for (const p of list) {
      expect(p.rin + p.rf).toBeLessThanOrEqual(100e3 * Math.sqrt(10));
      expect(p.rin + p.rf).toBeGreaterThanOrEqual(100e3 / Math.sqrt(10));
    }
    expect(Math.abs(list[0].error)).toBeLessThan(0.005);
  });

  it('returns nothing for impossible targets', () => {
    expect(gainPairs('noninverting', 1, 10e3, 'E24')).toEqual([]);
    expect(gainPairs('inverting', 0, 10e3, 'E24')).toEqual([]);
  });
});
