export interface AdcInputParams {
  sourceOhms: number;
  filterOhms: number;
  filterFarads: number;
  switchOhms: number;
  sampleFarads: number;
  acquisitionSeconds: number;
  resolutionBits: number;
  referenceVolts: number;
  stepVolts: number;
  recoverySeconds: number | null;
}

export type AdcInputResult = { ok: false; errors: string[] } | {
  ok: true;
  totalOhms: number;
  halfLsbVolts: number;
  errorVolts: number;
  errorLsb: number;
  requiredSeconds: number;
  acquisitionPass: boolean;
  filterCutoffHz: number | null;
  filterPinErrorVolts: number;
  recoveryRequiredSeconds: number | null;
  recoveryErrorLsb: number | null;
  recoveryPass: boolean | null;
};

/**
 * First-order single-ended SAR input model. Before the acquisition switch closes,
 * the external filter capacitor is charged to the source voltage and the sample
 * capacitor is one `stepVolts` away. During acquisition the two capacitor voltages
 * follow the exact two-node linear RC solution. This excludes amplifier dynamics,
 * charge injection, leakage and a partially recovered filter capacitor.
 */
export function calculateAdcInput(p: AdcInputParams): AdcInputResult {
  const errors: string[] = [];
  const values = [p.sourceOhms, p.filterOhms, p.filterFarads, p.switchOhms, p.sampleFarads,
    p.acquisitionSeconds, p.resolutionBits, p.referenceVolts, p.stepVolts];
  if (!values.every(Number.isFinite) || (p.recoverySeconds !== null && !Number.isFinite(p.recoverySeconds))) errors.push('Every input must be a finite number.');
  if (!(p.sourceOhms >= 0 && p.sourceOhms <= 1e9 && p.filterOhms >= 0 && p.filterOhms <= 1e9)) errors.push('Source and filter resistances must be between 0 and 1 GΩ.');
  if (!(p.switchOhms > 0 && p.switchOhms <= 1e9)) errors.push('Sampling-switch resistance must be above 0 and at most 1 GΩ.');
  if (!(p.sampleFarads >= 1e-15 && p.sampleFarads <= 1e-6)) errors.push('Sample capacitance must be between 1 fF and 1 µF.');
  if (!(p.filterFarads >= 0 && p.filterFarads <= 1e-3)) errors.push('Filter capacitance must be between 0 and 1 mF.');
  if (!(p.acquisitionSeconds > 0 && p.acquisitionSeconds <= 1)) errors.push('Acquisition time must be above 0 and at most 1 s.');
  if (!(Number.isInteger(p.resolutionBits) && p.resolutionBits >= 6 && p.resolutionBits <= 24)) errors.push('Resolution must be an integer from 6 to 24 bits.');
  if (!(p.referenceVolts > 0 && p.referenceVolts <= 100 && p.stepVolts > 0 && p.stepVolts <= p.referenceVolts)) errors.push('Reference span must be positive, and the worst-case step must be above 0 and no greater than that span.');
  if (p.recoverySeconds !== null && !(p.recoverySeconds >= 0 && p.recoverySeconds <= 1)) errors.push('Recovery time must be between 0 and 1 s.');
  if (errors.length) return { ok: false, errors };

  const totalOhms = p.sourceOhms + p.filterOhms;
  const targetFraction = p.referenceVolts / 2 ** (p.resolutionBits + 1) / p.stepVolts;
  const halfLsbVolts = p.referenceVolts / 2 ** (p.resolutionBits + 1);

  // Normalised remaining voltage errors at the sample capacitor and ADC pin.
  let residual: (time: number) => { sample: number; pin: number };
  if (p.filterFarads === 0 || totalOhms === 0) {
    const tau = (totalOhms + p.switchOhms) * p.sampleFarads;
    residual = time => ({ sample: Math.exp(-time / tau), pin: 0 });
  } else {
    const a = 1 / (totalOhms * p.filterFarads);
    const b = 1 / (p.switchOhms * p.filterFarads);
    const c = 1 / (p.switchOhms * p.sampleFarads);
    const sum = a + b + c;
    const separation = Math.hypot(a + b - c, 2 * Math.sqrt(b * c));
    const fast = -(sum + separation) / 2;
    const slow = -2 * a * c / (sum + separation);
    const slowWeight = (-c - fast) / separation;
    const pinWeight = b / separation;
    residual = time => {
      const slowExp = Math.exp(slow * time);
      const fastExp = Math.exp(fast * time);
      return {
        sample: Math.max(0, Math.min(1, slowWeight * slowExp + (1 - slowWeight) * fastExp)),
        pin: Math.max(0, pinWeight * (slowExp - fastExp)),
      };
    };
  }

  const atAcquisition = residual(p.acquisitionSeconds);
  let upper = p.acquisitionSeconds;
  for (let i = 0; i < 200 && residual(upper).sample > targetFraction; i++) upper *= 2;
  let lower = 0;
  for (let i = 0; i < 72; i++) {
    const middle = (lower + upper) / 2;
    if (residual(middle).sample > targetFraction) lower = middle;
    else upper = middle;
  }
  const requiredSeconds = upper;
  const errorVolts = p.stepVolts * atAcquisition.sample;
  const filterPinErrorVolts = p.stepVolts * atAcquisition.pin;
  const filterCutoffHz = p.filterFarads > 0 && totalOhms > 0 ? 1 / (2 * Math.PI * totalOhms * p.filterFarads) : null;
  const recoveryRequiredSeconds = filterCutoffHz === null ? null
    : filterPinErrorVolts <= halfLsbVolts ? 0
      : totalOhms * p.filterFarads * Math.log(filterPinErrorVolts / halfLsbVolts);
  const recoveryErrorLsb = p.recoverySeconds === null || recoveryRequiredSeconds === null ? null
    : filterPinErrorVolts * Math.exp(-p.recoverySeconds / (totalOhms * p.filterFarads)) / (2 * halfLsbVolts);
  const recoveryPass = recoveryErrorLsb === null ? null : recoveryErrorLsb <= 0.5;
  return {
    ok: true, totalOhms, halfLsbVolts, errorVolts, errorLsb: errorVolts / (2 * halfLsbVolts), requiredSeconds,
    acquisitionPass: errorVolts <= halfLsbVolts, filterCutoffHz, filterPinErrorVolts, recoveryRequiredSeconds,
    recoveryErrorLsb, recoveryPass,
  };
}
