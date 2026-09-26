// 555 timer (TI NE555 datasheet SLFS022K, section 6.3). The capacitor charges and discharges
// between 1/3 and 2/3 of VCC, so each interval is ln 2 · R · C (astable) or ln 3 · R · C
// (monostable); TI rounds these to 0.693 and 1.1. SI units: Ω, F, s, Hz.
import { eNearest, type ESeries } from './electronics';

/** Largest RA + RB the threshold current allows (datasheet note 1): 3.4 MΩ at 5 V, 10 MΩ at 15 V. */
export const MAX_R_5V = 3.4e6;
export const MAX_R_15V = 10e6;
/** Highest astable frequency TI recommends for the bipolar 555, and its shortest monostable pulse. */
export const MAX_FREQ = 100e3;
export const MIN_PULSE = 10e-6;

export interface Astable {
  tHigh: number;
  tLow: number;
  period: number;
  freq: number;
  duty: number; // output high time / period
}

/**
 * Astable timing. With `diode` a diode across RB bypasses it while charging, so the high time
 * depends on RA alone and the duty cycle can go below 50 % (ideal diode assumed).
 */
export function astable(ra: number, rb: number, c: number, diode = false): Astable {
  const tHigh = Math.LN2 * (diode ? ra : ra + rb) * c;
  const tLow = Math.LN2 * rb * c;
  const period = tHigh + tLow;
  return { tHigh, tLow, period, freq: 1 / period, duty: tHigh / period };
}

/** Monostable pulse width, ln 3 · RA · C ≈ 1.1 RA C. */
export const monostable = (ra: number, c: number) => Math.log(3) * ra * c;

/** Resistor for a monostable pulse width. */
export const monostableR = (tw: number, c: number) => tw / (Math.log(3) * c);

export interface AstableDesign {
  ra: number;
  rb: number;
  diode: boolean;
  exact: Astable;
  /** nearest standard values and the timing they give */
  std: { ra: number; rb: number; timing: Astable };
}

/**
 * RA and RB for a frequency and duty cycle with capacitor C. Above 50 % duty the standard circuit
 * works; at or below 50 % a diode across RB is needed (then RA sets the high time alone).
 * Returns null when no positive resistor pair exists.
 */
export function designAstable(freq: number, duty: number, c: number, series: ESeries): AstableDesign | null {
  if (!(freq > 0 && c > 0 && duty > 0 && duty < 1)) return null;
  const period = 1 / freq;
  const tHigh = duty * period;
  const tLow = period - tHigh;
  const rb = tLow / (Math.LN2 * c);
  const diode = duty <= 0.5;
  const ra = diode ? tHigh / (Math.LN2 * c) : tHigh / (Math.LN2 * c) - rb;
  if (!(ra > 0 && rb > 0)) return null;
  const sra = eNearest(ra, series);
  const srb = eNearest(rb, series);
  return { ra, rb, diode, exact: astable(ra, rb, c, diode), std: { ra: sra, rb: srb, timing: astable(sra, srb, c, diode) } };
}
