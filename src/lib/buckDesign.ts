// Buck component checks around the TI SLVA477B preliminary CCM model.
// SI units. Efficiency is an estimate, not a simulated loss model.
import type { BoostCheck, CheckGroup, CheckState } from './boostDesign';
import { buck } from './power';

export interface BuckDesign {
  vinMin: number;
  vinNom: number;
  vinMax: number;
  vout: number;
  iout: number;
  fs: number; // minimum switching frequency
  fsMax: number;
  eff: number;
  rippleRatio: number; // ΔIL / Iout for the initial inductor estimate
  l: number; // 0 = the calculated value
  dvout: number; // capacitive output-ripple budget
  esr: number; // output bank ESR
  ilim: number; // guaranteed minimum peak-current limit; 0 = not supplied
  vf: number; // rectifier diode forward voltage; 0 = synchronous
  lTol: number;
  isat: number;
  irms: number;
  dcr: number;
  cout: number;
  cTol: number;
  cBias: number;
  cRating: number;
  cVoltage: number;
  dvTotal: number;
  cin: number;
  cinTol: number;
  cinBias: number;
  cinEsr: number;
  dvin: number;
  cinDataMin: number;
  cinRating: number;
  cinVoltage: number;
  maxDuty: number;
  minOn: number;
  minOff: number;
  switchVoltage: number;
  diodeVoltage: number;
}
export type BuckCheck = BoostCheck;

export function validateBuck(b: BuckDesign): string[] {
  const errors: string[] = [];
  if (Object.values(b).some(v => typeof v === 'number' && !Number.isFinite(v))) return ['All inputs must be finite numbers.'];
  if (!(b.vinMin > 0 && b.vinMin <= b.vinNom && b.vinNom <= b.vinMax)) errors.push('Input voltages must satisfy 0 < Vin,min ≤ Vin,nom ≤ Vin,max.');
  if (!(b.vout > 0)) errors.push('Output voltage must be greater than 0.');
  else if (b.eff > 0 && !(b.vout < b.vinMin * b.eff))
    errors.push('The output must stay below Vin,min × efficiency: at the lowest input the duty cycle would reach 100 % and the converter could not regulate.');
  if (!(b.iout > 0 && b.fs > 0 && b.fsMax >= b.fs)) errors.push('Load and switching frequency must be positive; maximum frequency must be at least the minimum.');
  if (!(b.eff > 0 && b.eff <= 1)) errors.push('Efficiency must be above 0 and at most 100 %.');
  if (!(b.rippleRatio > 0 && b.rippleRatio <= 2)) errors.push('Inductor ripple target must be above 0 and at most 200 %.');
  if (!(b.dvout > 0 && b.dvin > 0)) errors.push('Capacitive ripple budgets must be positive.');
  for (const key of ['lTol', 'cTol', 'cinTol'] as const)
    if (!(b[key] >= 0 && b[key] < 1)) errors.push('Component tolerances must be between 0 and less than 100 %.');
  if (!(b.cBias > 0 && b.cBias <= 1 && b.cinBias > 0 && b.cinBias <= 1)) errors.push('Retained capacitance must be above 0 and at most 100 %.');
  if (Object.values(b).some(v => typeof v === 'number' && v < 0)) errors.push('Component values and ratings cannot be negative.');
  if (b.maxDuty > 1) errors.push('Maximum duty cycle cannot exceed 100 %.');
  return [...new Set(errors)];
}

/** One operating point at input voltage `vin`, inductance `l` and the minimum switching frequency. */
export function buckPoint(b: BuckDesign, l: number, vin: number) {
  const d = b.vout / (vin * b.eff);
  const dIl = ((vin - b.vout) * d) / (b.fs * l);
  const iSwMax = b.iout + dIl / 2;
  const valley = b.iout - dIl / 2;
  const ccm = valley > 1e-9 * Math.max(b.iout, dIl, 1e-12);
  const ilRms = Math.sqrt(b.iout ** 2 + dIl ** 2 / 12);
  // The input capacitor carries the switch current minus its average, so its RMS includes the ripple.
  const inputRms = Math.sqrt(Math.max(0, d * ilRms ** 2 - (d * b.iout) ** 2));
  const outputRms = dIl / Math.sqrt(12);
  // A peak-current limit at or below ΔIL cannot support CCM at any positive valley current.
  const ceiling = b.ilim && b.ilim > dIl ? b.ilim - dIl / 2 : null;
  const diodeAvg = b.iout * (1 - d);
  return {
    vin, d, dIl, ilAvg: b.iout, iSwMax, valley, ccm, boundary: dIl / 2, ilRms, inputRms, outputRms, ceiling,
    switchRms: Math.sqrt(d) * ilRms, lowSideRms: Math.sqrt(1 - d) * ilRms,
    qout: dIl / (8 * b.fs), qin: (b.iout * d * (1 - d)) / b.fs,
    dvEsr: b.esr * dIl,
    // the input bank sees a current step of roughly the peak switch current at each turn-on
    inputEsrRipple: b.cinEsr * iSwMax,
    windingLoss: ilRms ** 2 * b.dcr, diodeAvg, diodeLoss: b.vf * diodeAvg,
  };
}
export type BuckPoint = ReturnType<typeof buckPoint>;

export function analyseBuck(b: BuckDesign) {
  const errors = validateBuck(b);
  if (errors.length) throw new Error(errors.join(' '));
  const base = buck({ ...b, l: b.l || undefined, ilim: b.ilim || undefined, vf: b.vf || undefined });
  const l = base.l, lMin = l * (1 - b.lTol);
  // Uniform screening sweep plus the nominal input and D = 0.5, where the input-capacitor RMS peaks.
  const inputs = new Set(Array.from({ length: 201 }, (_, i) => b.vinMin + (b.vinMax - b.vinMin) * i / 200));
  for (const v of [b.vinNom, (2 * b.vout) / b.eff]) if (v >= b.vinMin && v <= b.vinMax) inputs.add(v);
  const points = [...inputs].sort((a, z) => a - z).map(v => buckPoint(b, lMin, v));
  if (points.some(p => ![p.d, p.iSwMax, p.ilRms, p.qout, p.qin, p.inputRms, p.windingLoss].every(Number.isFinite)) || !(lMin > 0))
    throw new Error('Inputs exceed the numerical range of this model.');
  const max = (f: (p: BuckPoint) => number) => points.reduce((a, p) => (f(p) > f(a) ? p : a));
  const min = (f: (p: BuckPoint) => number) => points.reduce((a, p) => (f(p) < f(a) ? p : a));
  const ccm = points.every(p => p.ccm);
  const peak = max(p => p.iSwMax), rms = max(p => p.ilRms), boundary = max(p => p.boundary);
  const coutEffective = b.cout * (1 - b.cTol) * b.cBias;
  const cinEffective = b.cin * (1 - b.cinTol) * b.cinBias;
  const requiredOut = max(p => p.qout).qout / b.dvout;
  const requiredIn = Math.max(b.cinDataMin, max(p => p.qin).qin / b.dvin);
  const esrOut = max(p => p.dvEsr).dvEsr;
  const totalOut = b.cout > 0 ? max(p => p.qout / coutEffective + p.dvEsr) : null;
  const totalIn = b.cin > 0 ? max(p => p.qin / cinEffective + p.inputEsrRipple) : null;
  const totalRequired = b.dvTotal > 0
    ? points.some(p => p.dvEsr >= b.dvTotal) ? null : Math.max(...points.map(p => p.qout / (b.dvTotal - p.dvEsr)))
    : null;
  const derived = [requiredOut, requiredIn, coutEffective, cinEffective,
    requiredOut / ((1 - b.cTol) * b.cBias), requiredIn / ((1 - b.cinTol) * b.cinBias),
    totalRequired ?? 0, totalOut ? totalOut.qout / coutEffective + totalOut.dvEsr : 0,
    totalIn ? totalIn.qin / cinEffective + totalIn.inputEsrRipple : 0];
  if (!derived.every(Number.isFinite) || (b.cout > 0 && coutEffective === 0) || (b.cin > 0 && cinEffective === 0))
    throw new Error('Capacitor inputs exceed the numerical range of this model.');

  const checks: BuckCheck[] = [];
  const add = (label: string, state: CheckState, detail: string, group?: CheckGroup) => checks.push({ label, state, detail, group });
  const rating = (label: string, value: number, need: number, unit: string, dependent = true, group?: CheckGroup) => {
    if (!value) add(label, 'unknown', 'Rating not supplied.', group);
    else if (dependent && !ccm) add(label, 'unknown', 'Outside the supported CCM range.', group);
    else add(label, value >= need ? 'pass' : 'fail', 'Need ≥ ' + Number(need.toPrecision(4)) + ' ' + unit + '; supplied ' + value + ' ' + unit + '.', group);
  };
  add('Continuous conduction', ccm ? 'pass' : 'fail', ccm ? 'Positive valley current across the input range at the entered load.' : 'Boundary or discontinuous operation is predicted. CCM current and capacitor checks are unavailable.');
  rating('Inductor saturation current', b.isat, peak.iSwMax, 'A');
  rating('Inductor RMS rating', b.irms, rms.ilRms, 'A');
  rating('Switch peak-current limit', b.ilim, peak.iSwMax, 'A');
  rating('Output capacitor ripple rating', b.cRating, max(p => p.outputRms).outputRms, 'A', true, 'ratings');
  rating('Input capacitor ripple rating', b.cinRating, max(p => p.inputRms).inputRms, 'A', true, 'cinRating');
  rating('Output capacitor voltage', b.cVoltage, b.vout, 'V', false, 'ratings');
  rating('Input capacitor voltage', b.cinVoltage, b.vinMax, 'V', false, 'cinRating');
  // the switch node swings from Vin down to −Vf, so the switch sees Vin,max + Vf
  rating('Switch voltage (steady state)', b.switchVoltage, b.vinMax + b.vf, 'V', false, 'ic');
  if (b.vf) rating('Diode reverse voltage (steady state)', b.diodeVoltage, b.vinMax, 'V', false, 'ic');
  for (const [label, actual, required, selected, group] of [
    ['Output capacitance', coutEffective, requiredOut, b.cout, undefined],
    ['Input capacitance', cinEffective, requiredIn, b.cin, 'cin'],
  ] as const) {
    add(label, !ccm || !selected ? 'unknown' : actual >= required ? 'pass' : 'fail',
      !ccm ? 'Outside the supported CCM range.' : !selected ? 'No capacitor value supplied.' : 'Effective ' + Number((actual * 1e6).toPrecision(4)) + ' µF; need ≥ ' + Number((required * 1e6).toPrecision(4)) + ' µF.', group);
  }
  add('Total output ripple', !ccm || !b.dvTotal || !totalOut ? 'unknown' : totalOut.qout / coutEffective + totalOut.dvEsr <= b.dvTotal ? 'pass' : 'fail',
    !ccm ? 'Outside the supported CCM range.' : !b.dvTotal || !totalOut ? 'Enter a capacitor value and total ripple budget to check.' : 'Conservative sum of capacitive and ESR ripple.');
  // duty is highest at the lowest input and lowest at the highest input
  const dutyHigh = points[0].d, dutyLow = points[points.length - 1].d;
  const on = dutyLow / b.fsMax, off = (1 - dutyHigh) / b.fsMax;
  add('Maximum duty cycle', !b.maxDuty ? 'unknown' : dutyHigh <= b.maxDuty ? 'pass' : 'fail', !b.maxDuty ? 'IC limit not supplied.' : 'Required ' + Number((100 * dutyHigh).toPrecision(4)) + ' % at Vin,min; limit ' + b.maxDuty * 100 + ' %.', 'ic');
  add('Minimum on-time', !b.minOn ? 'unknown' : on >= b.minOn ? 'pass' : 'fail', !b.minOn ? 'IC limit not supplied.' : 'Shortest required pulse ' + Number((on * 1e9).toPrecision(4)) + ' ns, at Vin,max.', 'ic');
  add('Minimum off-time', !b.minOff ? 'unknown' : off >= b.minOff ? 'pass' : 'fail', !b.minOff ? 'IC limit not supplied.' : 'Shortest required off-time ' + Number((off * 1e9).toPrecision(4)) + ' ns, at Vin,min.', 'ic');

  const pout = b.vout * b.iout, pin = pout / b.eff;
  // Use the complete sum at each point; do not add component losses to the efficiency estimate.
  const partialLoss = Math.max(...points.map(p => p.windingLoss + p.outputRms ** 2 * b.esr + p.inputRms ** 2 * b.cinEsr + p.diodeLoss));
  return { base, l, lMin, points, ccm, peak, rms, boundary, coutEffective, cinEffective, requiredOut, requiredIn, esrOut,
    totalRequired, totalOut: totalOut ? totalOut.qout / coutEffective + totalOut.dvEsr : null,
    totalIn: totalIn ? totalIn.qin / cinEffective + totalIn.inputEsrRipple : null,
    outputRms: max(p => p.outputRms).outputRms, inputRms: max(p => p.inputRms), diode: max(p => p.diodeLoss),
    worstRipple: max(p => p.dIl), minValley: min(p => p.valley), dutyHigh, dutyLow, on, off,
    checks, pout, pin, loss: pin - pout, partialLoss };
}
export type BuckAnalysis = ReturnType<typeof analyseBuck>;
