// Boost component checks around the TI SLVA372D preliminary CCM model.
// SI units. Efficiency is an estimate, not a simulated loss model.
import { boost, type BoostInput } from './power';

export interface BoostDesign extends BoostInput {
  vinMax: number;
  fsMax: number;
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
export type CheckState = 'pass' | 'fail' | 'unknown';
export interface BoostCheck { label: string; state: CheckState; detail: string }

export function validateBoost(b: BoostDesign): string[] {
  const errors: string[] = [];
  if (Object.values(b).some(v => typeof v === 'number' && !Number.isFinite(v))) return ['All inputs must be finite numbers.'];
  if (!(b.vinMin > 0 && b.vinMin <= b.vinNom && b.vinNom <= b.vinMax && b.vinMax < b.vout))
    errors.push('Voltages must satisfy 0 < Vin,min ≤ Vin,nom ≤ Vin,max < Vout.');
  if (!(b.iout > 0 && b.fs > 0 && b.fsMax >= b.fs)) errors.push('Load and switching frequency must be positive; maximum frequency must be at least the minimum.');
  if (!(b.eff > 0 && b.eff <= 1)) errors.push('Efficiency must be above 0 and at most 100 %.');
  if (!(b.rippleRatio > 0 && b.rippleRatio <= 2)) errors.push('Inductor ripple target must be above 0 and at most 200 %.');
  if (!(b.dvout > 0 && b.dvin > 0)) errors.push('Capacitive ripple budgets must be positive.');
  for (const key of ['lTol', 'cTol', 'cinTol'] as const)
    if (!(b[key] >= 0 && b[key] < 1)) errors.push('Component tolerances must be between 0 and less than 100 %.');
  if (!(b.cBias > 0 && b.cBias <= 1 && b.cinBias > 0 && b.cinBias <= 1)) errors.push('Retained capacitance must be above 0 and at most 100 %.');
  if (Object.values(b).some(v => typeof v === 'number' && v < 0)) errors.push('Component values and ratings cannot be negative.');
  if (b.maxDuty > 1) errors.push('Maximum duty cycle cannot exceed 100 %.');
  return errors;
}

/** Integrate the CCM output-capacitor current over a cycle.
 * Includes extra off-time discharge when the inductor valley is below Iout.
 * Multiplying by 1/C gives peak-to-peak capacitive ripple.
 */
export function boostCharge(iout: number, d: number, peak: number, ripple: number, fs: number) {
  const onCharge = iout * d / fs;
  const u = ripple > 0 ? Math.max(0, Math.min(1, (peak - iout) / ripple)) : 1;
  const offMaximum = -onCharge + (1 - d) / fs * ((peak - iout) * u - ripple * u * u / 2);
  return onCharge + Math.max(0, offMaximum);
}

export function boostPoint(b: BoostDesign, l: number, vin: number) {
  const r = boost({ ...b, vinMin: vin, l });
  const valley = r.ilAvg - r.dIl / 2;
  const ccm = valley > 1e-9 * Math.max(r.ilAvg, r.dIl, 1e-12);
  const boundary = r.dIl * (1 - r.d) / 2;
  const inputRms = r.dIl / Math.sqrt(12);
  const outputRms = Math.sqrt(b.iout ** 2 * r.d / (1 - r.d) + (1 - r.d) * r.dIl ** 2 / 12);
  const qout = boostCharge(b.iout, r.d, r.iSwMax, r.dIl, b.fs);
  const qin = r.dIl / (8 * b.fs);
  // A peak-current limit below ΔIL cannot support CCM at any positive valley current.
  const ceiling = b.ilim && b.ilim > r.dIl ? (b.ilim - r.dIl / 2) * (1 - r.d) : null;
  return { ...r, vin, valley, ccm, boundary, inputRms, outputRms, qout, qin, ceiling,
    switchRms: Math.sqrt(r.d) * r.ilRms, diodeRms: Math.sqrt(1 - r.d) * r.ilRms,
    windingLoss: r.ilRms ** 2 * b.dcr, inputEsrRipple: r.dIl * b.cinEsr };
}
export type BoostPoint = ReturnType<typeof boostPoint>;

export function analyseBoost(b: BoostDesign) {
  const errors = validateBoost(b);
  if (errors.length) throw new Error(errors.join(' '));
  const base = boost(b);
  const l = base.l, lMin = l * (1 - b.lTol);
  // Uniform screening sweep plus exact extrema of ripple and the CCM boundary.
  // Boundary ∝ Vin²(1 - η Vin/Vout), maximal at 2 Vout/(3η).
  const inputs = new Set(Array.from({ length: 201 }, (_, i) => b.vinMin + (b.vinMax - b.vinMin) * i / 200));
  for (const v of [b.vinNom, b.vout / (2 * b.eff), 2 * b.vout / (3 * b.eff)])
    if (v >= b.vinMin && v <= b.vinMax) inputs.add(v);
  const points = [...inputs].sort((a, z) => a - z).map(v => boostPoint(b, lMin, v));
  if (points.some(p => ![p.d, p.iSwMax, p.ilRms, p.qout, p.qin, p.outputRms, p.windingLoss].every(Number.isFinite)) || !(lMin > 0))
    throw new Error('Inputs exceed the numerical range of this model.');
  const max = (f: (p: BoostPoint) => number) => points.reduce((a, p) => f(p) > f(a) ? p : a);
  const min = (f: (p: BoostPoint) => number) => points.reduce((a, p) => f(p) < f(a) ? p : a);
  const ccm = points.every(p => p.ccm);
  const peak = max(p => p.iSwMax), rms = max(p => p.ilRms), boundary = max(p => p.boundary);
  const coutEffective = b.cout * (1 - b.cTol) * b.cBias;
  const cinEffective = b.cin * (1 - b.cinTol) * b.cinBias;
  const requiredOut = max(p => p.qout / b.dvout).qout / b.dvout;
  const requiredIn = Math.max(b.cinDataMin, max(p => p.qin / b.dvin).qin / b.dvin);
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
  const checks: BoostCheck[] = [];
  const add = (label: string, state: CheckState, detail: string) => checks.push({ label, state, detail });
  const rating = (label: string, value: number, need: number, unit: string, dependent = true) => {
    if (!value) add(label, 'unknown', 'Rating not supplied.');
    else if (dependent && !ccm) add(label, 'unknown', 'Outside the supported CCM range.');
    else add(label, value >= need ? 'pass' : 'fail', 'Need ≥ ' + Number(need.toPrecision(4)) + ' ' + unit + '; supplied ' + value + ' ' + unit + '.');
  };
  add('Continuous conduction', ccm ? 'pass' : 'fail', ccm ? 'Positive valley current across the input range at the entered load.' : 'Boundary or discontinuous operation is predicted. CCM current and capacitor checks are unavailable.');
  rating('Inductor saturation current', b.isat, peak.iSwMax, 'A');
  rating('Inductor RMS rating', b.irms, rms.ilRms, 'A');
  rating('Switch peak-current limit', b.ilim ?? 0, peak.iSwMax, 'A');
  rating('Output capacitor ripple rating', b.cRating, max(p => p.outputRms).outputRms, 'A');
  rating('Input capacitor ripple rating', b.cinRating, max(p => p.inputRms).inputRms, 'A');
  rating('Output capacitor voltage', b.cVoltage, b.vout, 'V', false);
  rating('Input capacitor voltage', b.cinVoltage, b.vinMax, 'V', false);
  rating('Switch voltage (steady state)', b.switchVoltage, b.vout + (b.vf ?? 0), 'V', false);
  if (b.vf) rating('Diode reverse voltage (steady state)', b.diodeVoltage, b.vout, 'V', false);
  for (const [label, actual, required, selected] of [
    ['Output capacitance', coutEffective, requiredOut, b.cout],
    ['Input capacitance', cinEffective, requiredIn, b.cin],
  ] as const) {
    add(label, !ccm || !selected ? 'unknown' : actual >= required ? 'pass' : 'fail',
      !ccm ? 'Outside the supported CCM range.' : !selected ? 'No capacitor value supplied.' : 'Effective ' + Number((actual * 1e6).toPrecision(4)) + ' µF; need ≥ ' + Number((required * 1e6).toPrecision(4)) + ' µF.');
  }
  add('Total output ripple', !ccm || !b.dvTotal || !totalOut ? 'unknown' : totalOut.qout / coutEffective + totalOut.dvEsr <= b.dvTotal ? 'pass' : 'fail',
    !ccm ? 'Outside the supported CCM range.' : !b.dvTotal || !totalOut ? 'Enter a capacitor value and total ripple budget to check.' : 'Conservative sum of capacitive and ESR ripple.');
  const dutyHigh = points[0].d, dutyLow = points[points.length - 1].d;
  const on = dutyLow / b.fsMax, off = (1 - dutyHigh) / b.fsMax;
  add('Maximum duty cycle', !b.maxDuty ? 'unknown' : dutyHigh <= b.maxDuty ? 'pass' : 'fail', !b.maxDuty ? 'IC limit not supplied.' : 'Required ' + Number((100 * dutyHigh).toPrecision(4)) + ' %; limit ' + b.maxDuty * 100 + ' %.');
  add('Minimum on-time', !b.minOn ? 'unknown' : on >= b.minOn ? 'pass' : 'fail', !b.minOn ? 'IC limit not supplied.' : 'Shortest required pulse ' + Number((on * 1e9).toPrecision(4)) + ' ns.');
  add('Minimum off-time', !b.minOff ? 'unknown' : off >= b.minOff ? 'pass' : 'fail', !b.minOff ? 'IC limit not supplied.' : 'Shortest required off-time ' + Number((off * 1e9).toPrecision(4)) + ' ns.');
  const pout = b.vout * b.iout, pin = pout / b.eff;
  // Use the complete sum at each point; do not add component losses to the efficiency estimate.
  const partialLoss = Math.max(...points.map(p => p.windingLoss + p.outputRms ** 2 * b.esr + p.inputRms ** 2 * b.cinEsr)) + b.iout * (b.vf ?? 0);
  return { base, l, lMin, points, ccm, peak, rms, boundary, coutEffective, cinEffective, requiredOut, requiredIn, esrOut,
    totalRequired, totalOut: totalOut ? totalOut.qout / coutEffective + totalOut.dvEsr : null,
    totalIn: totalIn ? totalIn.qin / cinEffective + totalIn.inputEsrRipple : null,
    outputRms: max(p => p.outputRms).outputRms, inputRms: max(p => p.inputRms).inputRms,
    worstRipple: max(p => p.dIl), minValley: min(p => p.valley), dutyHigh, dutyLow, on, off,
    checks, pout, pin, loss: pin - pout, partialLoss };
}
export type BoostAnalysis = ReturnType<typeof analyseBoost>;
