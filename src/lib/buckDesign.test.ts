import { describe, expect, it } from 'vitest';
import { analyseBuck, buckPoint, validateBuck, type BuckDesign } from './buckDesign';
import { buck } from './power';

const base: BuckDesign = {
  vinMin: 10.8, vinNom: 12, vinMax: 13.2, vout: 3.3, iout: 2, fs: 500e3, fsMax: 550e3, eff: 0.9,
  rippleRatio: 0.3, l: 10e-6, dvout: 0.02, esr: 0.005, ilim: 3, vf: 0.4,
  lTol: 0.2, isat: 3, irms: 3, dcr: 0.03, cout: 47e-6, cTol: 0.1, cBias: 0.6, cRating: 1, cVoltage: 10, dvTotal: 0.03,
  cin: 20e-6, cinTol: 0.1, cinBias: 0.6, cinEsr: 0.005, dvin: 0.1, cinDataMin: 10e-6, cinRating: 2, cinVoltage: 25,
  maxDuty: 0.9, minOn: 100e-9, minOff: 100e-9, switchVoltage: 20, diodeVoltage: 20,
};
const close = (a: number, b: number, tolerance = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tolerance * Math.max(1e-12, Math.abs(b)));

describe('buck operating point', () => {
  const p = buckPoint(base, 10e-6, 12);
  it('matches a hand calculation at 12 V in, 3.3 V / 2 A out, 10 µH, 500 kHz', () => {
    close(p.d, 3.3 / (12 * 0.9));
    close(p.dIl, 0.5316666666666665);
    close(p.iSwMax, 2.265833333333333);
    close(p.valley, 1.7341666666666669);
    close(p.ilRms, 2.005880302270561);
    close(p.qout, 1.3291666666666663e-7);
    close(p.qin, 8.487654320987653e-7);
    expect(p.ccm).toBe(true);
  });
  it('gives the input-capacitor RMS with the inductor ripple included', () => {
    close(p.inputRms, 0.9251827028719329);
    // and reduces to the textbook Iout·√(D(1 − D)) when the ripple vanishes
    const flat = buckPoint(base, 1, 12);
    close(flat.inputRms, 2 * Math.sqrt(flat.d * (1 - flat.d)), 1e-6);
  });
  it('puts the current-limit ceiling half a ripple below the limit', () => {
    close(p.ceiling!, 3 - p.dIl / 2);
    expect(buckPoint({ ...base, ilim: 0.5 }, 10e-6, 12).ceiling).toBeNull();
  });
});

describe('buck design analysis', () => {
  const r = analyseBuck(base);
  it('keeps the SLVA477B inductor estimate', () => {
    const t = buck({ ...base, l: undefined });
    close(analyseBuck({ ...base, l: 0 }).l, t.lCalc);
    close(r.lMin, 10e-6 * 0.8);
  });
  it('finds each worst case at the right end of the input range', () => {
    // ripple and peak current grow with input voltage; duty is highest at the lowest input
    expect(r.worstRipple.vin).toBe(base.vinMax);
    expect(r.peak.vin).toBe(base.vinMax);
    close(r.dutyHigh, 3.3 / (10.8 * 0.9));
    close(r.dutyLow, 3.3 / (13.2 * 0.9));
    close(r.on, r.dutyLow / base.fsMax);
    close(r.off, (1 - r.dutyHigh) / base.fsMax);
  });
  it('balances power', () => {
    close(r.pout, 6.6);
    close(r.pin, 6.6 / 0.9);
    close(r.loss, 6.6 / 0.9 - 6.6);
    expect(r.partialLoss).toBeLessThan(r.loss);
  });
  it('checks the switch against Vin,max plus the diode drop', () => {
    expect(r.checks.find(c => c.label === 'Switch voltage (steady state)')?.detail).toContain('13.6 V');
  });
  it('flags a failing rating and withholds passes it cannot claim', () => {
    const low = analyseBuck({ ...base, isat: 2 });
    expect(low.checks.find(c => c.label === 'Inductor saturation current')?.state).toBe('fail');
    expect(r.checks.find(c => c.label === 'Inductor saturation current')?.state).toBe('pass');
  });
  it('detects discontinuous conduction and withholds the dependent checks', () => {
    const dcm = analyseBuck({ ...base, l: 0.5e-6, lTol: 0 });
    expect(dcm.ccm).toBe(false);
    expect(dcm.checks.find(c => c.label === 'Continuous conduction')?.state).toBe('fail');
    expect(dcm.checks.find(c => c.label === 'Inductor saturation current')?.state).toBe('unknown');
  });
});

describe('buck validation', () => {
  it('rejects an output the lowest input cannot regulate', () => {
    expect(validateBuck({ ...base, vout: 10 }).join(' ')).toContain('100 %');
    expect(() => analyseBuck({ ...base, vout: 10 })).toThrow();
  });
  it('rejects inverted input limits and bad tolerances', () => {
    expect(validateBuck({ ...base, vinMin: 14 }).length).toBeGreaterThan(0);
    expect(validateBuck({ ...base, lTol: 1 }).length).toBeGreaterThan(0);
    expect(validateBuck(base)).toEqual([]);
  });
});

describe('buck check groups (for switching optional sections off)', () => {
  const group = (label: string) => analyseBuck(base).checks.find(c => c.label === label)?.group;
  it('leaves the core checks ungrouped', () => {
    for (const label of ['Continuous conduction', 'Inductor saturation current', 'Inductor RMS rating', 'Switch peak-current limit', 'Output capacitance', 'Total output ripple'])
      expect(group(label), label).toBeUndefined();
  });
  it('tags every optional check with the section that owns it', () => {
    expect(group('Input capacitance')).toBe('cin');
    expect(group('Output capacitor ripple rating')).toBe('ratings');
    expect(group('Input capacitor voltage')).toBe('cinRating');
    for (const label of ['Maximum duty cycle', 'Minimum on-time', 'Minimum off-time', 'Switch voltage (steady state)', 'Diode reverse voltage (steady state)'])
      expect(group(label), label).toBe('ic');
  });
  it('drops the input bank from the loss subtotal when it is left out', () => {
    expect(analyseBuck({ ...base, cin: 0, cinEsr: 0, cinDataMin: 0 }).partialLoss).toBeLessThan(analyseBuck(base).partialLoss);
  });
});
