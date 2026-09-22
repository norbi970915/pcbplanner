import { describe, expect, it } from 'vitest';
import { E_SERIES } from './electronics';
import { boost, buck, feedbackPairs, ldo } from './power';

describe('buck (TI SLVA477B)', () => {
  // 12 V → 3.3 V, 2 A, 500 kHz, η 90 %, ripple 30 %
  const r = buck({ vinMin: 10, vinNom: 12, vinMax: 14, vout: 3.3, iout: 2, fs: 500e3, eff: 0.9, rippleRatio: 0.3, dvout: 0.02, esr: 0.005, ilim: 3, dvin: 0.1, vf: 0.4 });
  it('eq. 1: D = Vout / (Vin,max · η)', () => expect(r.dMaxVin).toBeCloseTo(3.3 / (14 * 0.9), 12));
  it('eq. 5: L = Vout(Vin − Vout) / (ΔIL · fs · Vin)', () => expect(r.lCalc).toBeCloseTo((3.3 * (12 - 3.3)) / (0.6 * 500e3 * 12), 15));
  it('eq. 2: ΔIL = (Vin,max − Vout)·D / (fs·L)', () => expect(r.dIl).toBeCloseTo(((14 - 3.3) * r.dMaxVin) / (500e3 * r.lCalc), 12));
  it('eq. 3 and 4', () => {
    expect(r.iMaxOut).toBeCloseTo(3 - r.dIl / 2, 12);
    expect(r.iSwMax).toBeCloseTo(2 + r.dIl / 2, 12);
  });
  it('eq. 12 and 13', () => {
    expect(r.coutMin).toBeCloseTo(r.dIl / (8 * 500e3 * 0.02), 12);
    expect(r.dvEsr).toBeCloseTo(0.005 * r.dIl, 12);
  });
  it('eq. 7 and 8: diode current Iout·(1 − D) and loss', () => {
    expect(r.iDiode).toBeCloseTo(2 * (1 - r.dMaxVin), 12);
    expect(r.pDiode).toBeCloseTo(r.iDiode * 0.4, 12);
  });
  it('input capacitor: Iout·√(D(1−D)) at the D closest to 0.5', () => {
    // D spans 0.262 … 0.367 → worst case is the largest (Vin,min)
    expect(r.icinRms).toBeCloseTo(2 * Math.sqrt(r.dMinVin * (1 - r.dMinVin)), 12);
    expect(r.cinMin).toBeCloseTo((2 * r.dMinVin * (1 - r.dMinVin)) / (500e3 * 0.1), 12);
  });
  it('uses 0.5 when the input range crosses D = 0.5', () => {
    const s = buck({ vinMin: 5, vinNom: 8, vinMax: 12, vout: 3.3, iout: 1, fs: 1e6, eff: 1, rippleRatio: 0.3, dvout: 0.01, esr: 0, dvin: 0.1 });
    expect(s.icinRms).toBeCloseTo(0.5, 12);
  });
  it('a given inductor overrides the estimate', () => {
    const s = buck({ vinMin: 10, vinNom: 12, vinMax: 14, vout: 3.3, iout: 2, fs: 500e3, eff: 0.9, rippleRatio: 0.3, l: 10e-6, dvout: 0.02, esr: 0, dvin: 0.1 });
    expect(s.l).toBe(10e-6);
    expect(s.dIl).toBeCloseTo(((14 - 3.3) * s.dMaxVin) / (500e3 * 10e-6), 12);
  });
});

describe('boost (TI SLVA372D)', () => {
  // 3.3 V → 12 V, 0.5 A, 1 MHz, η 85 %
  const r = boost({ vinMin: 3, vinNom: 3.3, vout: 12, iout: 0.5, fs: 1e6, eff: 0.85, rippleRatio: 0.3, dvout: 0.05, esr: 0.01, ilim: 3, vf: 0.35 });
  it('eq. 1: D = 1 − Vin,min·η / Vout', () => expect(r.d).toBeCloseTo(1 - (3 * 0.85) / 12, 12));
  it('eq. 5/6: L from ΔIL = 0.3·Iout·Vout/Vin', () => {
    const dIl = 0.3 * 0.5 * (12 / 3.3);
    expect(r.lCalc).toBeCloseTo((3.3 * (12 - 3.3)) / (dIl * 1e6 * 12), 15);
  });
  it('eq. 2, 3, 4', () => {
    expect(r.dIl).toBeCloseTo((3 * r.d) / (1e6 * r.lCalc), 12);
    expect(r.iMaxOut).toBeCloseTo((3 - r.dIl / 2) * (1 - r.d), 12);
    expect(r.iSwMax).toBeCloseTo(r.dIl / 2 + 0.5 / (1 - r.d), 12);
  });
  it('eq. 12 and 13 (rev. B: Iout·D)', () => {
    expect(r.coutMin).toBeCloseTo((0.5 * r.d) / (1e6 * 0.05), 12);
    expect(r.dvEsr).toBeCloseTo(0.01 * (0.5 / (1 - r.d) + r.dIl / 2), 12);
  });
  it('eq. 7 and 8', () => {
    expect(r.iDiode).toBe(0.5);
    expect(r.pDiode).toBeCloseTo(0.175, 12);
  });
});

describe('LDO', () => {
  const r = ldo({ vin: 5, vout: 3.3, iout: 0.5, iq: 0.001, thetaJA: 50, ta: 40, tjMax: 125, vDropout: 0.3 });
  it('dissipation includes the ground current', () => expect(r.pd).toBeCloseTo(1.7 * 0.5 + 5 * 0.001, 12));
  it('junction temperature and limits', () => {
    expect(r.tj).toBeCloseTo(40 + r.pd * 50, 12);
    expect(r.ioutMax).toBeCloseTo((85 / 50 - 0.005) / 1.7, 12);
    expect(r.thetaNeeded).toBeCloseTo(85 / r.pd, 12);
    expect(r.dropoutOk).toBe(true);
  });
  it('efficiency', () => expect(r.efficiency).toBeCloseTo((3.3 * 0.5) / (5 * 0.501), 12));
});

describe('feedback divider', () => {
  it('Vout = VFB·(1 + R1/R2), best pair first, divider current near the target', () => {
    const p = feedbackPairs(0.8, 3.3, 100e-6, 'E96');
    expect(p.length).toBeGreaterThan(3);
    for (const x of p) expect(x.vout).toBeCloseTo(0.8 * (1 + x.r1 / x.r2), 12);
    expect(Math.abs(p[0].error)).toBeLessThanOrEqual(Math.abs(p[p.length - 1].error));
    // exhaustive search over one decade of E96 R2 values: nothing beats the first pair
    let best = Infinity;
    for (const n2 of E_SERIES.E96)
      for (const d1 of [3, 4, 5])
        for (const n1 of E_SERIES.E96) {
          const r2 = n2 * 100, r1 = n1 * 10 ** (d1 - 2);
          best = Math.min(best, Math.abs(0.8 * (1 + r1 / r2) / 3.3 - 1));
        }
    expect(Math.abs(p[0].error)).toBeCloseTo(best, 9);
  });
  it('the FB bias current shifts Vout by IFB·R1', () => {
    const a = feedbackPairs(1.25, 5, 50e-6, 'E24', 0)[0];
    const b = feedbackPairs(1.25, 5, 50e-6, 'E24', 1e-6).find((x) => x.r1 === a.r1 && x.r2 === a.r2)!;
    expect(b.vout - a.vout).toBeCloseTo(1e-6 * a.r1, 12);
  });
});
