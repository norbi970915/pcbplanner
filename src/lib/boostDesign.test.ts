import { describe, expect, it } from 'vitest';
import { analyseBoost, boostCharge, boostPoint, validateBoost, type BoostDesign } from './boostDesign';

const base: BoostDesign = {
  vinMin: 3, vinNom: 3.7, vinMax: 4.2, vout: 5, iout: 1, fs: 1e6, fsMax: 1.1e6, eff: 0.85,
  rippleRatio: 0.3, l: 2.2e-6, dvout: 0.03, esr: 0.005, ilim: 3, vf: 0.3,
  lTol: 0.2, isat: 3, irms: 3, dcr: 0.05, cout: 47e-6, cTol: 0.1, cBias: 0.8, cRating: 2, cVoltage: 10, dvTotal: 0.03,
  cin: 22e-6, cinTol: 0.1, cinBias: 0.8, cinEsr: 0.005, dvin: 0.03, cinDataMin: 10e-6, cinRating: 1, cinVoltage: 10,
  maxDuty: 0.8, minOn: 100e-9, minOff: 100e-9, switchVoltage: 10, diodeVoltage: 10,
};
const close = (a: number, b: number, tolerance = 1e-8) => expect(Math.abs(a - b)).toBeLessThan(tolerance * Math.max(1e-12, Math.abs(b)));

describe('boost component analysis', () => {
  it('retains TI default sizing and power balance', () => {
    const r = analyseBoost({ ...base, l: 0 });
    close(r.l, 2.372933333333333e-6);
    close(r.lMin, r.l * 0.8);
    close(r.pout, 5);
    close(r.pin, 5 / 0.85);
    close(r.loss, 5 / 0.85 - 5);
    close(r.coutEffective, 33.84e-6);
    close(r.cinEffective, 15.84e-6);
    expect(r.ccm).toBe(true);
  });
  it('rejects the previously unflagged 0.1 uH example and withholds dependent passes', () => {
    const r = analyseBoost({ ...base, l: 0.1e-6, lTol: 0 });
    close(r.points[0].valley, -5.38921568627451);
    expect(r.ccm).toBe(false);
    expect(r.checks.find(c => c.label === 'Continuous conduction')?.state).toBe('fail');
    expect(r.checks.find(c => c.label === 'Inductor saturation current')?.state).toBe('unknown');
    expect(r.checks.find(c => c.label === 'Output capacitance')?.state).toBe('unknown');
  });
  it('detects the exact CCM boundary and positive-current side', () => {
    const b = { ...base, vinMin: 5, vinNom: 5, vinMax: 5, vout: 10, eff: 1, fs: 100e3, fsMax: 100e3, lTol: 0 };
    const p = boostPoint(b, 10e-6, 5); // ripple 2.5 A, boundary Iout = 0.625 A
    close(p.boundary, 0.625);
    expect(boostPoint({ ...b, iout: 0.625 }, 10e-6, 5).ccm).toBe(false);
    expect(boostPoint({ ...b, iout: 0.626 }, 10e-6, 5).ccm).toBe(true);
    expect(boostPoint({ ...b, iout: 0.624 }, 10e-6, 5).ccm).toBe(false);
  });
  it('includes interior ripple and boundary extrema even off the sweep grid', () => {
    const b = { ...base, vinMin: 2.1, vinNom: 4, vinMax: 8.7, vout: 10, eff: 1, l: 10e-6, lTol: 0 };
    const r = analyseBoost(b);
    close(r.worstRipple.vin, 5);
    close(r.boundary.vin, 20 / 3);
    expect(r.points.some(p => p.vin === b.vinNom)).toBe(true);
  });
  it('does not assert a rating when a part specification is omitted', () => {
    const r = analyseBoost({ ...base, isat: 0, ilim: 0, cRating: 0, cout: 0, maxDuty: 0, minOn: 0 });
    for (const name of ['Inductor saturation current', 'Switch peak-current limit', 'Output capacitor ripple rating', 'Output capacitance', 'Maximum duty cycle', 'Minimum on-time'])
      expect(r.checks.find(c => c.label === name)?.state).toBe('unknown');
    expect(r.totalOut).toBeNull();
    expect(r.points.every(p => p.ceiling === null)).toBe(true);
  });
  it('fails real parts whose ratings are too small', () => {
    const r = analyseBoost({ ...base, isat: 1, irms: 1, ilim: 1, cRating: 0.1, cinRating: 0.01, cVoltage: 4, cinVoltage: 3, switchVoltage: 5, diodeVoltage: 4, cout: 1e-6, cin: 1e-6 });
    for (const name of ['Inductor saturation current', 'Inductor RMS rating', 'Switch peak-current limit', 'Output capacitor ripple rating', 'Input capacitor ripple rating', 'Output capacitor voltage', 'Input capacitor voltage', 'Switch voltage (steady state)', 'Diode reverse voltage (steady state)', 'Output capacitance', 'Input capacitance'])
      expect(r.checks.find(c => c.label === name)?.state, name).toBe('fail');
  });
  it('checks timing at maximum frequency, with low- and high-input duty extrema', () => {
    const r = analyseBoost({ ...base, maxDuty: 0.4, minOn: 300e-9, minOff: 500e-9 });
    close(r.on, (1 - 4.2 * 0.85 / 5) / 1.1e6);
    close(r.off, (3 * 0.85 / 5) / 1.1e6);
    for (const name of ['Maximum duty cycle', 'Minimum on-time', 'Minimum off-time'])
      expect(r.checks.find(c => c.label === name)?.state).toBe('fail');
  });
  it('detects an ESR-limited output budget regardless of the selected capacitance', () => {
    const r = analyseBoost({ ...base, esr: 0.1, cout: 1, dvTotal: 0.01 });
    expect(r.totalRequired).toBeNull();
    expect(r.checks.find(c => c.label === 'Total output ripple')?.state).toBe('fail');
  });
  it('requires more nominal capacitance when bias retention or tolerance worsens', () => {
    const a = analyseBoost(base), b = analyseBoost({ ...base, cBias: 0.4, cTol: 0.2 });
    close(a.requiredOut, b.requiredOut);
    expect(b.totalOut!).toBeGreaterThan(a.totalOut!);
    expect(b.coutEffective).toBeLessThan(a.coutEffective);
    const bigCin = analyseBoost({ ...base, cinDataMin: 100e-6 });
    close(bigCin.requiredIn, 100e-6);
  });
  it('keeps partial component loss inside the efficiency budget rather than adding it', () => {
    const a = analyseBoost(base), b = analyseBoost({ ...base, dcr: 2 });
    close(a.loss, b.loss);
    expect(b.partialLoss).toBeGreaterThan(b.loss);
    expect(b.partialLoss).toBeGreaterThan(a.partialLoss);
  });
  it('never returns a negative CCM output-current ceiling', () => {
    const p = boostPoint({ ...base, ilim: 0.01 }, 2.2e-6, 3);
    expect(p.ceiling).toBeNull();
    const ok = boostPoint(base, 2.2e-6, 3);
    expect(ok.ceiling).toBeGreaterThan(ok.boundary);
  });
  it('matches integrated triangular currents and capacitor charge over a cycle', () => {
    // Independent time-domain integration, including a CCM valley below Iout.
    for (const l of [2.2e-6, 0.6e-6]) {
      const p = boostPoint(base, l, 3);
      expect(p.ccm).toBe(true);
      const n = 100000;
      let in2 = 0, out2 = 0, il2 = 0, q = 0, qmin = 0, qmax = 0;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const il = t < p.d ? p.valley + p.dIl * t / p.d : p.iSwMax - p.dIl * (t - p.d) / (1 - p.d);
        const icin = il - p.ilAvg, icout = t < p.d ? -base.iout : il - base.iout;
        in2 += icin ** 2 / n; out2 += icout ** 2 / n; il2 += il ** 2 / n;
        q += icout / (n * base.fs); qmin = Math.min(qmin, q); qmax = Math.max(qmax, q);
      }
      close(Math.sqrt(in2), p.inputRms, 1e-6);
      close(Math.sqrt(out2), p.outputRms, 1e-6);
      close(Math.sqrt(il2), p.ilRms, 1e-6);
      close(qmax - qmin, p.qout, 1e-5);
      expect(Math.abs(q)).toBeLessThan(1e-14);
    }
  });
  it('includes additional off-time discharge beyond the simple TI approximation', () => {
    const p = boostPoint(base, 0.6e-6, 3);
    expect(p.valley).toBeLessThan(base.iout);
    expect(p.qout).toBeGreaterThan(base.iout * p.d / base.fs);
    close(boostCharge(1, 0.5, 2.5, 1, 1e6), 0.5e-6);
  });
  it('screens the range against a much finer independent sweep', () => {
    const r = analyseBoost(base);
    for (let i = 0; i <= 5000; i++) {
      const p = boostPoint(base, r.lMin, base.vinMin + (base.vinMax - base.vinMin) * i / 5000);
      expect(p.iSwMax).toBeLessThanOrEqual(r.peak.iSwMax * 1.0001);
      expect(p.outputRms).toBeLessThanOrEqual(r.outputRms * 1.0001);
      expect(p.boundary).toBeLessThanOrEqual(r.boundary.boundary * 1.0001);
    }
  });
  it.each([
    { vinMax: 5 }, { vinMin: 0 }, { fs: 0 }, { fsMax: 1 }, { eff: 0 }, { lTol: 1 },
    { cTol: 1 }, { cBias: 0 }, { cinBias: 1.1 }, { cout: -1 }, { maxDuty: 1.1 }, { isat: Infinity }, { iout: NaN },
  ])('rejects invalid input %j', patch => {
    expect(validateBoost({ ...base, ...patch }).length).toBeGreaterThan(0);
    expect(() => analyseBoost({ ...base, ...patch })).toThrow();
  });
});

it('rejects numeric overflow in retained capacitor sizing', () => {
  expect(() => analyseBoost({ ...base, cBias: 1e-320 })).toThrow('numerical range');
});
