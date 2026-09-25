import { describe, expect, it } from 'vitest';
import { calculateAdcInput, type AdcInputParams } from './adcInput';

const base: AdcInputParams = {
  sourceOhms: 1000, filterOhms: 100, filterFarads: 0, switchOhms: 500, sampleFarads: 10e-12,
  acquisitionSeconds: 1e-6, resolutionBits: 12, referenceVolts: 3.3, stepVolts: 3.3, recoverySeconds: null,
};

describe('ADC input settling', () => {
  it('reduces to the ordinary RC settling time with no external capacitor', () => {
    const r = calculateAdcInput(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.requiredSeconds).toBeCloseTo((1600 * 10e-12) * Math.log(2 ** 13), 12);
    expect(r.errorLsb).toBeLessThan(0.5);
    expect(r.filterCutoffHz).toBeNull();
  });

  it('models sample-capacitor charge sharing with a filter capacitor and recovery', () => {
    const r = calculateAdcInput({ ...base, filterFarads: 1e-9, acquisitionSeconds: 1e-6, recoverySeconds: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.filterPinErrorVolts).toBeGreaterThan(0);
    expect(r.recoveryRequiredSeconds).toBeGreaterThan(0);
    expect(r.recoveryPass).toBe(false);
    expect(r.filterCutoffHz).toBeCloseTo(1 / (2 * Math.PI * 1100e-9), 5);
  });

  it('approaches the capacitor charge-sharing limit when the source is effectively open', () => {
    const r = calculateAdcInput({ ...base, sourceOhms: 1e9, filterOhms: 0, filterFarads: 1e-9, switchOhms: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.errorVolts).toBeCloseTo(3.3 * 10 / 1010, 5);
    expect(r.acquisitionPass).toBe(false);
  });

  it('clamps the ADC pin with an ideal source', () => {
    const r = calculateAdcInput({ ...base, sourceOhms: 0, filterOhms: 0, filterFarads: 1e-9 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.requiredSeconds).toBeCloseTo(500 * 10e-12 * Math.log(2 ** 13), 12);
    expect(r.filterPinErrorVolts).toBe(0);
  });

  it('identifies insufficient acquisition time and invalid inputs', () => {
    const tooShort = calculateAdcInput({ ...base, acquisitionSeconds: 10e-9 });
    expect(tooShort.ok).toBe(true);
    if (tooShort.ok) expect(tooShort.acquisitionPass).toBe(false);
    expect(calculateAdcInput({ ...base, resolutionBits: 12.5 }).ok).toBe(false);
    expect(calculateAdcInput({ ...base, stepVolts: 4 }).ok).toBe(false);
  });
});
