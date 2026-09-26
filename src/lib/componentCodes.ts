// Component marking codes: resistor colour bands (IEC 60062:2016), SMD resistor codes
// (3-digit, 4-digit, EIA-96), capacitor value, tolerance and voltage codes, and the
// EIA-198 dielectric codes of ceramic capacitors. Values in Ω, F and V.
import { E_SERIES } from './electronics';

/* ------------------------------------------------------------ colour bands */

export type BandColor = 'black' | 'brown' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'violet' | 'grey' | 'white' | 'gold' | 'silver' | 'pink' | 'none';

interface ColorDef {
  hex: string;
  digit?: number;
  exp?: number; // multiplier 10^exp
  tol?: number; // ± %
  tolLetter?: string;
  tcr?: number; // ± ppm/K
}

/** IEC 60062:2016 colour code. Grey is ±0.01 %; some older parts used grey for ±0.05 %. */
export const COLORS: Record<BandColor, ColorDef> = {
  black: { hex: '#1b1b1b', digit: 0, exp: 0, tcr: 250 },
  brown: { hex: '#7a4a24', digit: 1, exp: 1, tol: 1, tolLetter: 'F', tcr: 100 },
  red: { hex: '#d42a2a', digit: 2, exp: 2, tol: 2, tolLetter: 'G', tcr: 50 },
  orange: { hex: '#f07c1a', digit: 3, exp: 3, tol: 0.05, tolLetter: 'W', tcr: 15 },
  yellow: { hex: '#f2d21c', digit: 4, exp: 4, tol: 0.02, tolLetter: 'P', tcr: 25 },
  green: { hex: '#2e9a3e', digit: 5, exp: 5, tol: 0.5, tolLetter: 'D', tcr: 20 },
  blue: { hex: '#2f63d6', digit: 6, exp: 6, tol: 0.25, tolLetter: 'C', tcr: 10 },
  violet: { hex: '#8a45c8', digit: 7, exp: 7, tol: 0.1, tolLetter: 'B', tcr: 5 },
  grey: { hex: '#8c8c8c', digit: 8, exp: 8, tol: 0.01, tolLetter: 'L', tcr: 1 },
  white: { hex: '#f4f4f4', digit: 9, exp: 9 },
  gold: { hex: '#c9a227', exp: -1, tol: 5, tolLetter: 'J' },
  silver: { hex: '#b8bcc2', exp: -2, tol: 10, tolLetter: 'K' },
  pink: { hex: '#f29bc0', exp: -3 },
  none: { hex: 'transparent', tol: 20, tolLetter: 'M' },
};

export const COLOR_NAMES = Object.keys(COLORS) as BandColor[];
export const DIGIT_COLORS = COLOR_NAMES.filter((c) => COLORS[c].digit !== undefined);
export const MULT_COLORS = COLOR_NAMES.filter((c) => COLORS[c].exp !== undefined);
export const TOL_COLORS = COLOR_NAMES.filter((c) => COLORS[c].tol !== undefined);
export const TCR_COLORS = COLOR_NAMES.filter((c) => COLORS[c].tcr !== undefined);

/** Value n · 10^e without the float drift of n * 10 ** e for negative e. */
const pow10 = (n: number, e: number) => (e >= 0 ? n * 10 ** e : n / 10 ** -e);

export interface BandReading {
  ohms: number;
  tol: number; // ± %
  tolLetter: string;
  tcr?: number; // ± ppm/K
}

/**
 * Value of a 4-, 5- or 6-band resistor. `bands` lists the colours from the first digit on:
 * 4 bands = 2 digits, multiplier, tolerance; 5 = 3 digits, multiplier, tolerance; 6 = as 5 plus TCR.
 * Returns null when a colour cannot stand in its position.
 */
export function readBands(bands: BandColor[]): BandReading | null {
  const n = bands.length;
  if (n < 4 || n > 6) return null;
  const digits = n === 4 ? 2 : 3;
  let m = 0;
  for (const c of bands.slice(0, digits)) {
    const d = COLORS[c].digit;
    if (d === undefined) return null;
    m = m * 10 + d;
  }
  const exp = COLORS[bands[digits]].exp;
  const tol = COLORS[bands[digits + 1]];
  if (exp === undefined || tol.tol === undefined) return null;
  let tcr: number | undefined;
  if (n === 6) {
    tcr = COLORS[bands[5]].tcr;
    if (tcr === undefined) return null;
  }
  return { ohms: pow10(m, exp), tol: tol.tol, tolLetter: tol.tolLetter!, tcr };
}

/** Relative closeness used to decide whether a value is exactly representable. */
const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b));

/**
 * Digit and multiplier colours for `ohms` with 2 or 3 significant digits, rounding when the value
 * needs more digits. `exact` is false when rounding changed the value.
 */
export function bandsFor(ohms: number, digits: 2 | 3): { colors: BandColor[]; ohms: number; exact: boolean } | null {
  if (!(ohms > 0) || !Number.isFinite(ohms)) return null;
  let e = Math.floor(Math.log10(ohms)) - (digits - 1);
  let m = Math.round(pow10(ohms, -e));
  if (m >= 10 ** digits) {
    m /= 10;
    e += 1;
  }
  if (m < 10 ** (digits - 1)) {
    m *= 10;
    e -= 1;
  }
  const mult = MULT_COLORS.find((c) => COLORS[c].exp === e);
  if (!mult) return null;
  const colors = String(m)
    .split('')
    .map((d) => DIGIT_COLORS.find((c) => COLORS[c].digit === Number(d))!);
  const value = pow10(m, e);
  return { colors: [...colors, mult], ohms: value, exact: same(value, ohms) };
}

/* ------------------------------------------------------------ SMD resistors */

/** EIA-96 multiplier letters. R and S are alternatives for Y and X, H for B. */
export const EIA96_LETTERS: Record<string, number> = { Z: 0.001, Y: 0.01, R: 0.01, X: 0.1, S: 0.1, A: 1, B: 10, H: 10, C: 100, D: 1e3, E: 1e4, F: 1e5 };
const EIA96_PREFERRED: [string, number][] = [['Z', -3], ['Y', -2], ['X', -1], ['A', 0], ['B', 1], ['C', 2], ['D', 3], ['E', 4], ['F', 5]];

export type SmdKind = 'jumper' | '3-digit' | '4-digit' | 'R decimal' | 'milliohm' | 'EIA-96';

export interface SmdReading {
  ohms: number;
  kind: SmdKind;
  detail: string;
}

/**
 * Every reading of an SMD resistor marking. Usually one; a code such as 10R is both an EIA-96 code
 * (10 → 124 × 0.01 = 1.24 Ω) and "10 Ω" in R notation, so both are returned, the standard one first.
 * A lower-case m marks milliohms (5m0 = 5.0 mΩ) on current-sense resistors.
 */
export function readSmd(raw: string): SmdReading[] {
  const code = raw.trim().replace(/\s+/g, '');
  if (!code) return [];
  const out: SmdReading[] = [];
  if (/^\d*m\d+$|^\d+m\d*$/.test(code)) {
    const v = Number(code.replace('m', '.')) * 1e-3;
    if (Number.isFinite(v)) out.push({ ohms: v, kind: 'milliohm', detail: 'm marks the decimal point in milliohms' });
    return out;
  }
  const c = code.toUpperCase();
  if (/^0{1,4}$/.test(c)) return [{ ohms: 0, kind: 'jumper', detail: 'zero-ohm jumper' }];
  let m = /^(\d{2})([ZYRXSABHCDEF])$/.exec(c);
  if (m) {
    const i = Number(m[1]);
    if (i >= 1 && i <= 96) {
      const base = E_SERIES.E96[i - 1];
      out.push({ ohms: base * EIA96_LETTERS[m[2]], kind: 'EIA-96', detail: `${m[1]} → ${base}, ${m[2]} → ×${EIA96_LETTERS[m[2]]}` });
    }
  }
  if (/^(\d*R\d+|\d+R\d*)$/.test(c) && c.length >= 2) {
    const v = Number(c.replace('R', '.'));
    if (Number.isFinite(v)) out.push({ ohms: v, kind: 'R decimal', detail: 'R marks the decimal point' });
  }
  m = /^(\d{2})(\d)$/.exec(c);
  if (m) out.push({ ohms: pow10(Number(m[1]), Number(m[2])), kind: '3-digit', detail: `${m[1]} × 10^${m[2]}` });
  m = /^(\d{3})(\d)$/.exec(c);
  if (m) out.push({ ohms: pow10(Number(m[1]), Number(m[2])), kind: '4-digit', detail: `${m[1]} × 10^${m[2]}` });
  return out;
}

/** A code for `ohms` with `digits` significant digits (2 → 3-digit code, 3 → 4-digit code), or null. */
export function smdCode(ohms: number, digits: 2 | 3): string | null {
  if (ohms === 0) return digits === 2 ? '000' : '0000';
  if (!(ohms > 0) || !Number.isFinite(ohms)) return null;
  let code: string;
  if (ohms >= 10 ** (digits - 1)) {
    const e = Math.floor(Math.log10(ohms) + 1e-12) - (digits - 1);
    const m = Math.round(pow10(ohms, -e));
    if (e > 9 || m >= 10 ** digits) return null;
    code = `${m}${e}`;
  } else {
    // below 10 (or 100) Ω the decimal point is written as R
    const intDigits = ohms >= 1 ? Math.floor(Math.log10(ohms) + 1e-12) + 1 : 0;
    const text = ohms.toFixed(digits - intDigits);
    code = (ohms >= 1 ? text : text.replace(/^0/, '')).replace('.', 'R');
    if (code.length !== digits + 1) return null;
  }
  const back = readSmd(code).find((r) => r.kind !== 'EIA-96');
  return back && same(back.ohms, ohms) ? code : null;
}

/** EIA-96 code for an E96 value, or null when the value is not in the series. */
export function eia96Code(ohms: number): string | null {
  if (!(ohms > 0)) return null;
  for (const [letter, e] of EIA96_PREFERRED) {
    const base = pow10(ohms, -e);
    const i = E_SERIES.E96.findIndex((v) => same(v, base));
    if (i >= 0) return `${String(i + 1).padStart(2, '0')}${letter}`;
  }
  return null;
}

/* ------------------------------------------------------------ capacitors */

/** EIA voltage codes: the digit is the decade, the letter the mantissa. */
export const CAP_VOLTAGE_CODES: Record<string, number> = {
  '0E': 2.5, '0G': 4, '0J': 6.3, '1A': 10, '1C': 16, '1D': 20, '1E': 25, '1V': 35, '1H': 50, '1J': 63, '1K': 80,
  '2A': 100, '2B': 125, '2C': 160, '2D': 200, '2E': 250, '2F': 315, '2V': 350, '2G': 400, '2W': 450, '2J': 630, '3A': 1000,
};

/** Tolerance letters. B, C and D are absolute (pF) on capacitors below 10 pF, percentages above. */
export const CAP_TOLERANCES: Record<string, { text: string; smallPf?: string }> = {
  B: { text: '±0.1 %', smallPf: '±0.1 pF' },
  C: { text: '±0.25 %', smallPf: '±0.25 pF' },
  D: { text: '±0.5 %', smallPf: '±0.5 pF' },
  F: { text: '±1 %' },
  G: { text: '±2 %' },
  J: { text: '±5 %' },
  K: { text: '±10 %' },
  M: { text: '±20 %' },
  P: { text: '+100 % / −0 %' },
  Z: { text: '+80 % / −20 %' },
};

export interface CapReading {
  farads: number;
  valueCode: string;
  detail: string;
  tolerance?: { letter: string; text: string };
  voltage?: { code: string; volts: number };
}

const RKM_CAP: Record<string, number> = { P: 1e-12, N: 1e-9, U: 1e-6, µ: 1e-6, R: 1e-12 };

/**
 * Reads a capacitor marking: a 3-digit pF code (104 = 100 nF; third digit 8 → ×0.01, 9 → ×0.1),
 * a 1–2 digit pF value (47), or RKM notation (4n7, 2p2, 4R7 = 4.7 pF), optionally preceded by a
 * voltage code (2A104J) and followed by a tolerance letter (104K). Returns null when unreadable.
 */
export function readCap(raw: string): CapReading | null {
  const c = raw.replace(/\s+/g, '').toUpperCase().replace('Μ', 'µ');
  const volt = c.slice(0, 2);
  // the plain value first, so a code such as 104K is never split into a voltage code
  return readCapValue(c) ?? (volt in CAP_VOLTAGE_CODES ? readCapValue(c.slice(2), volt) : null);
}

function readCapValue(c: string, volt?: string): CapReading | null {
  const m = /^(\d{3}|\d{1,2}|\d*[PNUµR]\d+|\d+[PNUµR]\d*)([BCDFGJKMPZ])?$/.exec(c);
  if (!m) return null;
  const [, value, tol] = m;
  let farads: number;
  let detail: string;
  if (/^\d{3}$/.test(value)) {
    const k = Number(value[2]);
    if (k === 7) return null;
    const mult = k === 8 ? '0.01' : k === 9 ? '0.1' : `10^${k}`;
    farads = pow10(Number(value.slice(0, 2)), k === 8 ? -2 : k === 9 ? -1 : k) * 1e-12;
    detail = `${value.slice(0, 2)} × ${mult} pF`;
  } else if (/^\d{1,2}$/.test(value)) {
    farads = Number(value) * 1e-12;
    detail = 'value in pF';
  } else {
    const letter = value.match(/[PNUµR]/)![0];
    farads = Number(value.replace(letter, '.')) * RKM_CAP[letter];
    detail = letter === 'R' ? 'R marks the decimal point in pF' : `${letter.toLowerCase()} marks the decimal point`;
  }
  if (!Number.isFinite(farads)) return null;
  const small = farads < 10e-12;
  return {
    farads,
    valueCode: value,
    detail,
    tolerance: tol ? { letter: tol, text: (small && CAP_TOLERANCES[tol].smallPf) || CAP_TOLERANCES[tol].text } : undefined,
    voltage: volt ? { code: volt, volts: CAP_VOLTAGE_CODES[volt] } : undefined,
  };
}

/** 3-digit code for a capacitance in farads, or null when it needs more than two significant digits. */
export function capCode(farads: number): string | null {
  const pf = farads * 1e12;
  if (!(pf >= 0.1) || !Number.isFinite(pf)) return null;
  let e = Math.floor(Math.log10(pf) + 1e-12) - 1;
  let m = Math.round(pow10(pf, -e));
  if (m >= 100) {
    m /= 10;
    e += 1;
  }
  // third digit: 0…6 = 10^k pF, 9 = ×0.1, 8 = ×0.01 (7 is unused)
  if (!same(pow10(m, e), pf) || e > 6 || e < -2) return null;
  return `${m}${e >= 0 ? e : e === -1 ? 9 : 8}`;
}

/* ------------------------------------------------------------ dielectrics */

const CLASS1_SIG: Record<string, number> = { C: 0, B: 0.3, L: 0.8, A: 0.9, M: 1, P: 1.5, R: 2.2, S: 3.3, T: 4.7, V: 5.6, U: 7.5 };
const CLASS1_MULT: Record<string, number> = { '0': -1, '1': -10, '2': -100, '3': -1000, '5': 1, '6': 10, '7': 100, '8': 1000 };
const CLASS1_TOL: Record<string, number> = { G: 30, H: 60, J: 120, K: 250, L: 500, M: 1000, N: 2500 };
const CLASS2_LOW: Record<string, number> = { X: -55, Y: -30, Z: 10 };
const CLASS2_HIGH: Record<string, number> = { '4': 65, '5': 85, '6': 105, '7': 125, '8': 150, '9': 200 };
const CLASS2_CHANGE: Record<string, string> = { P: '±10 %', R: '±15 %', L: '±15 % (+15 / −40 % above 125 °C)', S: '±22 %', T: '+22 / −33 %', U: '+22 / −56 %', V: '+22 / −82 %' };

export type DielectricReading =
  | { cls: 1; tempco: number; tol: number }
  | { cls: 2; low: number; high: number; change: string };

/** EIA-198 dielectric code: class 1 (C0G, U2J; NP0 = C0G) or class 2 (X7R, X5R, Y5V). */
export function readDielectric(raw: string): DielectricReading | null {
  const c = raw.trim().toUpperCase().replace(/^NP0$|^NPO$/, 'C0G').replace(/^COG$/, 'C0G');
  if (c.length !== 3) return null;
  if (c[0] in CLASS2_LOW && c[1] in CLASS2_HIGH && c[2] in CLASS2_CHANGE) return { cls: 2, low: CLASS2_LOW[c[0]], high: CLASS2_HIGH[c[1]], change: CLASS2_CHANGE[c[2]] };
  if (c[0] in CLASS1_SIG && c[1] in CLASS1_MULT && c[2] in CLASS1_TOL) return { cls: 1, tempco: CLASS1_SIG[c[0]] * CLASS1_MULT[c[1]] || 0, tol: CLASS1_TOL[c[2]] };
  return null;
}
