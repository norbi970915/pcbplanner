import { eNearest, type ESeries } from './electronics';

export type ComparatorTopology = 'inverting' | 'noninverting';
export interface HysteresisCircuit {
  topology: ComparatorTopology;
  resistance: number; // Vref-to-IN+ resistor (inverting) or Vin-to-IN+ resistor (non-inverting), ohms
  feedback: number; // output-to-IN+ resistor, ohms
  reference: number; // stiff voltage source, V
  outputHigh: number; // loaded output levels, V
  outputLow: number;
  tolerancePct: number;
  offsetVolts: number; // absolute bound on constant input offset
  referenceErrorVolts: number; // absolute reference uncertainty
}
export interface HysteresisThresholds { rising: number; falling: number; width: number }
export interface HysteresisAnalysis extends HysteresisThresholds {
  risingRange: [number, number];
  fallingRange: [number, number];
  widthRange: [number, number];
  tripFeedbackAmps: number;
}

function validate(p: HysteresisCircuit) {
  if (p.topology !== 'inverting' && p.topology !== 'noninverting') throw new RangeError('Choose an inverting or non-inverting circuit.');
  if (!Object.values(p).filter(v => typeof v === 'number').every(Number.isFinite)) throw new RangeError('Every input must be finite.');
  if (!(p.resistance >= 1 && p.resistance <= 1e9 && p.feedback >= 1 && p.feedback <= 1e9)) throw new RangeError('Resistors must be between 1 Ω and 1 GΩ.');
  if (!(Math.abs(p.reference) <= 100 && Math.abs(p.outputHigh) <= 100 && Math.abs(p.outputLow) <= 100)) throw new RangeError('Reference and output voltages must be within ±100 V.');
  if (!(p.outputHigh > p.outputLow)) throw new RangeError('Output HIGH must be greater than output LOW.');
  if (!(p.tolerancePct >= 0 && p.tolerancePct < 100)) throw new RangeError('Resistor tolerance must be from 0 to less than 100 %.');
  if (!(p.offsetVolts >= 0 && p.offsetVolts <= 10 && p.referenceErrorVolts >= 0 && p.referenceErrorVolts <= 10)) throw new RangeError('Offset and reference uncertainty must be between 0 and 10 V.');
}

/** KCL at IN+, with constant loaded output levels and no intrinsic hysteresis.
 * TI TLV3201/2 SBOS561C §8.1.2: the inverting divider is replaced by its Thevenin source.
 * Offset convention: switching occurs at IN+ = IN− + offset; the bounds include either sign.
 */
function thresholds(p: HysteresisCircuit, offset = 0): HysteresisThresholds {
  const k = p.resistance / p.feedback;
  let rising: number, falling: number;
  if (p.topology === 'inverting') {
    rising = (p.reference + k * p.outputHigh) / (1 + k) - offset;
    falling = (p.reference + k * p.outputLow) / (1 + k) - offset;
  } else {
    rising = (p.reference + offset) * (1 + k) - k * p.outputLow;
    falling = (p.reference + offset) * (1 + k) - k * p.outputHigh;
  }
  return { rising, falling, width: p.topology === 'inverting' ? (p.outputHigh - p.outputLow) * k / (1 + k) : (p.outputHigh - p.outputLow) * k };
}

/** Independent resistor/reference corners; offset is constant for both transitions.
 * Each threshold range is a population bound, not the width of one device's hysteresis.
 */
export function analyseHysteresis(p: HysteresisCircuit): HysteresisAnalysis {
  validate(p);
  const nominal = thresholds(p);
  const corners: HysteresisThresholds[] = [];
  const t = p.tolerancePct / 100;
  for (const a of [1 - t, 1 + t]) for (const b of [1 - t, 1 + t]) {
    for (const refError of [-p.referenceErrorVolts, p.referenceErrorVolts]) for (const offset of [-p.offsetVolts, p.offsetVolts]) {
      corners.push(thresholds({ ...p, resistance: p.resistance * a, feedback: p.feedback * b, reference: p.reference + refError }, offset));
    }
  }
  const range = (key: keyof HysteresisThresholds): [number, number] => [Math.min(...corners.map(c => c[key])), Math.max(...corners.map(c => c[key]))];
  const tripFeedbackAmps = Math.max(...[p.outputHigh, p.outputLow].map(vo => Math.abs(vo - p.reference)
    / (p.topology === 'inverting' ? p.resistance + p.feedback : p.feedback)));
  return { ...nominal, risingRange: range('rising'), fallingRange: range('falling'), widthRange: range('width'), tripFeedbackAmps };
}

export interface HysteresisDesign extends Omit<HysteresisCircuit, 'feedback' | 'reference'> {
  targetRising: number;
  targetFalling: number;
  series: ESeries;
}

/** Fix a resistor scale and solve the feedback ratio and stiff reference voltage.
 * Rounding keeps that reference unchanged; the returned standard thresholds show its consequence.
 */
export function designHysteresis(p: HysteresisDesign) {
  if (![p.targetRising, p.targetFalling].every(Number.isFinite) || Math.abs(p.targetRising) > 100 || Math.abs(p.targetFalling) > 100) throw new RangeError('Target thresholds must be finite and within ±100 V.');
  if (!(p.targetRising > p.targetFalling)) throw new RangeError('The rising threshold must be greater than the falling threshold.');
  if (!['E12', 'E24', 'E96'].includes(p.series)) throw new RangeError('Choose E12, E24 or E96 values.');
  const beta = (p.targetRising - p.targetFalling) / (p.outputHigh - p.outputLow);
  if (p.topology === 'inverting' && !(beta > 0 && beta < 1)) throw new RangeError('Inverting hysteresis must be smaller than the output HIGH−LOW swing.');
  const feedback = p.topology === 'inverting' ? p.resistance * (1 - beta) / beta : p.resistance / beta;
  const reference = p.topology === 'inverting' ? (p.targetFalling - beta * p.outputLow) / (1 - beta)
    : (p.targetRising + beta * p.outputLow) / (1 + beta);
  const exactCircuit: HysteresisCircuit = { ...p, feedback, reference };
  const exact = analyseHysteresis(exactCircuit);
  const standardCircuit = { ...exactCircuit, resistance: eNearest(p.resistance, p.series), feedback: eNearest(feedback, p.series) };
  const standard = analyseHysteresis(standardCircuit);
  return { exactCircuit, exact, standardCircuit, standard };
}
