// NTC thermistor models, a resistive divider into an ADC, series-resistor choices, self-heating
// and tolerance. Temperatures are in kelvin, resistances in Ω, voltages in V, power in W.
//
// Beta model (TDK/EPCOS "NTC thermistors, general technical information", Jan. 2018, formula 1):
//   R(T) = R0 · exp(B · (1/T − 1/T0))
// Steinhart–Hart (Steinhart & Hart, Deep-Sea Research 15 (1968) 497–503):
//   1/T = A + B · ln R + C · (ln R)³
// B from two points (TDK formula 3): B = ln(R1/R2) / (1/T1 − 1/T2), so B depends on the pair.

/** 0 °C in kelvin. */
export const ZERO_C = 273.15;
export const toK = (c: number) => c + ZERO_C;
export const toC = (k: number) => k - ZERO_C;

export interface BetaModel {
  kind: 'beta';
  /** Resistance at the reference temperature t0, Ω. */
  r0: number;
  /** Reference temperature, K. */
  t0: number;
  /** B value, K. */
  beta: number;
}

export interface ShModel {
  kind: 'sh';
  a: number;
  b: number;
  c: number;
}

export type NtcModel = BetaModel | ShModel;

const finite = (...v: number[]) => v.every((x) => Number.isFinite(x));

/** Parameters are usable (does not check monotonicity of a Steinhart–Hart model; see shMonotonic). */
export function modelValid(m: NtcModel): boolean {
  if (m.kind === 'beta') return finite(m.r0, m.t0, m.beta) && m.r0 > 0 && m.t0 > 0 && m.beta > 0;
  return finite(m.a, m.b, m.c) && m.b > 0;
}

/** ln R for a Steinhart–Hart model at 1/T: the real root of C x³ + B x + (A − 1/T) = 0. */
function shLnR(m: ShModel, invT: number): number {
  const { a, b, c } = m;
  let x: number;
  if (c === 0) return (invT - a) / b;
  // Cardano for x³ + 3p x + 2y = 0 with p = B/(3C), 2y = (A − 1/T)/C
  const y = (a - invT) / (2 * c);
  const p = b / (3 * c);
  const d = p * p * p + y * y;
  if (d >= 0) {
    const s = Math.sqrt(d);
    x = Math.cbrt(s - y) - Math.cbrt(s + y);
  } else {
    x = (invT - a) / b;
  }
  // Newton polish (also the only path when the cubic has three real roots)
  for (let i = 0; i < 30; i++) {
    const f = a + b * x + c * x * x * x - invT;
    const fp = b + 3 * c * x * x;
    if (!(fp !== 0) || !Number.isFinite(f)) break;
    const dx = f / fp;
    x -= dx;
    if (Math.abs(dx) <= 1e-15 * Math.max(1, Math.abs(x))) break;
  }
  return x;
}

/** Zero-power resistance at temperature tK (K). NaN for T ≤ 0 K or an invalid model. */
export function resistance(m: NtcModel, tK: number): number {
  if (!(tK > 0) || !Number.isFinite(tK) || !modelValid(m)) return NaN;
  const r = m.kind === 'beta' ? m.r0 * Math.exp(m.beta * (1 / tK - 1 / m.t0)) : Math.exp(shLnR(m, 1 / tK));
  return Number.isFinite(r) && r > 0 ? r : NaN;
}

/** Temperature (K) at resistance r. NaN for r ≤ 0 or when the model gives no positive temperature. */
export function temperature(m: NtcModel, r: number): number {
  if (!(r > 0) || !Number.isFinite(r) || !modelValid(m)) return NaN;
  const x = Math.log(r);
  const inv = m.kind === 'beta' ? 1 / m.t0 + (x - Math.log(m.r0)) / m.beta : m.a + m.b * x + m.c * x * x * x;
  return inv > 0 && Number.isFinite(inv) ? 1 / inv : NaN;
}

/** dR/dT (Ω/K) at tK. Beta: −B·R/T². Steinhart–Hart: −R / (T² (B + 3C ln²R)). */
export function dRdT(m: NtcModel, tK: number): number {
  const r = resistance(m, tK);
  if (!Number.isFinite(r)) return NaN;
  if (m.kind === 'beta') return (-m.beta * r) / (tK * tK);
  const x = Math.log(r);
  return -r / (tK * tK * (m.b + 3 * m.c * x * x));
}

/** Local B value, −T² · d(ln R)/dT. Constant for the Beta model. */
export function localBeta(m: NtcModel, tK: number): number {
  return (-tK * tK * dRdT(m, tK)) / resistance(m, tK);
}

/** Temperature coefficient α = (1/R) dR/dT, in 1/K. */
export const alpha = (m: NtcModel, tK: number) => dRdT(m, tK) / resistance(m, tK);

/** B value from two (T, R) points (TDK formula 3). NaN for equal temperatures or invalid input. */
export function betaFromPoints(t1K: number, r1: number, t2K: number, r2: number): number {
  if (!(t1K > 0 && t2K > 0 && r1 > 0 && r2 > 0) || !finite(t1K, t2K, r1, r2) || t1K === t2K) return NaN;
  const b = Math.log(r1 / r2) / (1 / t1K - 1 / t2K);
  return Number.isFinite(b) ? b : NaN;
}

export interface CalPoint {
  /** K */
  t: number;
  /** Ω */
  r: number;
}

export type ShFit = { ok: true; model: ShModel } | { ok: false; error: string };

/**
 * Exact Steinhart–Hart coefficients through three points: solves
 * [1 L L³] [A B C]ᵀ = 1/T for L = ln R (Gaussian elimination with partial pivoting).
 * The determinant is (L2−L1)(L3−L1)(L3−L2)(L1+L2+L3), so the resistances must differ and their
 * product must not be 1 Ω³.
 */
export function fitSteinhartHart(points: readonly CalPoint[]): ShFit {
  if (points.length !== 3) return { ok: false, error: 'Three calibration points are needed.' };
  for (const p of points) {
    if (!(p.t > 0) || !Number.isFinite(p.t)) return { ok: false, error: 'Calibration temperatures must be above absolute zero.' };
    if (!(p.r > 0) || !Number.isFinite(p.r)) return { ok: false, error: 'Calibration resistances must be greater than 0 Ω.' };
  }
  const sorted = [...points].sort((p, q) => p.t - q.t);
  if (sorted[0].t === sorted[1].t || sorted[1].t === sorted[2].t) return { ok: false, error: 'The three calibration temperatures must differ.' };
  if (!(sorted[0].r > sorted[1].r && sorted[1].r > sorted[2].r)) return { ok: false, error: 'Resistance must fall as temperature rises (NTC) across the three points.' };
  const L = sorted.map((p) => Math.log(p.r));
  const sum = L[0] + L[1] + L[2];
  if (Math.abs(sum) < 1e-9) return { ok: false, error: 'The product of the three resistances is 1 Ω³; the Steinhart–Hart system is singular.' };
  const M = sorted.map((p, i) => [1, L[i], L[i] ** 3, 1 / p.t]);
  for (let col = 0; col < 3; col++) {
    let piv = col;
    for (let row = col + 1; row < 3; row++) if (Math.abs(M[row][col]) > Math.abs(M[piv][col])) piv = row;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let row = col + 1; row < 3; row++) {
      const f = M[row][col] / M[col][col];
      for (let k = col; k < 4; k++) M[row][k] -= f * M[col][k];
    }
  }
  const x = [0, 0, 0];
  for (let row = 2; row >= 0; row--) {
    let s = M[row][3];
    for (let k = row + 1; k < 3; k++) s -= M[row][k] * x[k];
    x[row] = s / M[row][row];
  }
  const model: ShModel = { kind: 'sh', a: x[0], b: x[1], c: x[2] };
  if (!finite(x[0], x[1], x[2]) || !(model.b > 0)) return { ok: false, error: 'These points do not give a usable Steinhart–Hart curve (B ≤ 0).' };
  return { ok: true, model };
}

/** 1/T falls monotonically with ln R between rLo and rHi (B + 3C ln²R > 0), so R(T) is one-to-one there. */
export function shMonotonic(m: ShModel, rLo: number, rHi: number): boolean {
  if (!(rLo > 0 && rHi > 0)) return false;
  const x1 = Math.log(Math.min(rLo, rHi));
  const x2 = Math.log(Math.max(rLo, rHi));
  // B + 3C x² is extreme at x = 0 or the interval ends
  const xs = [x1, x2, ...(x1 < 0 && x2 > 0 ? [0] : [])];
  return xs.every((x) => m.b + 3 * m.c * x * x > 0);
}

/* ------------------------------------------------------------- divider + ADC */

/** low: thermistor from the output to ground, Rs to the supply. high: thermistor to the supply, Rs to ground. */
export type Position = 'low' | 'high';

export interface Divider {
  position: Position;
  /** Series (fixed) resistor, Ω. */
  rs: number;
  /** Divider supply, V. */
  vs: number;
  /** ADC full-scale reference, V (equal to vs for a ratiometric reading). */
  vref: number;
  /** ADC resolution, bits (integer 1…24). */
  bits: number;
}

export const bitsValid = (bits: number) => Number.isInteger(bits) && bits >= 1 && bits <= 24;

/** Output voltage of the divider for thermistor resistance r. */
export function dividerV(d: Divider, r: number): number {
  if (!(r >= 0) || !(d.rs >= 0) || r + d.rs === 0) return NaN;
  return d.vs * (d.position === 'low' ? r / (r + d.rs) : d.rs / (r + d.rs));
}

/** Thermistor resistance from the divider output voltage (NaN outside 0 < V < Vs or for Rs = 0). */
export function rFromV(d: Divider, v: number): number {
  if (!(d.rs > 0) || !(d.vs > 0) || !(v > 0 && v < d.vs)) return NaN;
  return d.position === 'low' ? (d.rs * v) / (d.vs - v) : (d.rs * (d.vs - v)) / v;
}

/** 1 LSB = Vref / 2^N. */
export const lsb = (d: Divider) => (bitsValid(d.bits) && d.vref > 0 ? d.vref / 2 ** d.bits : NaN);

/**
 * Ideal ADC code for input v: round(v / LSB), i.e. code transitions at ½ LSB, limited to 0…2^N − 1.
 * NaN for invalid bits or reference.
 */
export function adcCode(d: Divider, v: number): number {
  const q = lsb(d);
  if (!Number.isFinite(q) || !Number.isFinite(v)) return NaN;
  return Math.min(2 ** d.bits - 1, Math.max(0, Math.round(v / q)));
}

/** Centre voltage of an ADC code. */
export const codeV = (d: Divider, code: number) => code * lsb(d);

/** Divider slope dV/dT (V/K) at tK. Low side: Vs·Rs/(R+Rs)² · dR/dT; high side: the negative. */
export function sensitivity(m: NtcModel, d: Divider, tK: number): number {
  const r = resistance(m, tK);
  const s = dRdT(m, tK);
  if (!Number.isFinite(r) || !Number.isFinite(s) || !(d.rs >= 0)) return NaN;
  const k = (d.vs * d.rs) / (r + d.rs) ** 2;
  if (k === 0) return 0;
  return (d.position === 'low' ? 1 : -1) * k * s;
}

/** Temperature step of one LSB, K/LSB (Infinity when the slope is zero, e.g. Rs = 0). */
export function kPerLsb(m: NtcModel, d: Divider, tK: number): number {
  const s = Math.abs(sensitivity(m, d, tK));
  const q = lsb(d);
  if (!Number.isFinite(s) || !Number.isFinite(q)) return NaN;
  return s === 0 ? Infinity : q / s;
}

/** Temperature (K) for an ADC code, using the code's centre voltage. NaN for codes that map to no resistance. */
export const tFromCode = (m: NtcModel, d: Divider, code: number) => temperature(m, rFromV(d, codeV(d, code)));

/* ------------------------------------------------------------ self-heating */

/** Power in the thermistor, Vs² · R / (R + Rs)² (W). Largest, Vs²/(4Rs), when R = Rs. */
export function thermistorPower(d: Divider, r: number): number {
  if (!(r >= 0) || !(d.rs >= 0) || r + d.rs === 0) return NaN;
  return (d.vs * d.vs * r) / (r + d.rs) ** 2;
}

/** Steady-state self-heating ΔT = P / δ (K), δ in W/K (TDK general technical information, formula 11). */
export const selfHeating = (p: number, deltaWPerK: number) => (deltaWPerK > 0 ? p / deltaWPerK : NaN);

/* ------------------------------------------------------- series resistor */

/** Rs giving the largest |dV/dT| at tK: d/dRs [Rs/(R+Rs)²] = 0 ⇒ Rs = R(T). */
export const rsMaxSlope = (m: NtcModel, tK: number) => resistance(m, tK);

/**
 * Rs that puts the turning (inflection) point of V(T) at tK: there the curve is steepest and locally
 * linear. From d²V/dT² = 0: Rs = 2 s²/s' − R with s = dR/dT. For the Beta model this reduces to
 * Rs = R(T) · (B − 2T)/(B + 2T) (TDK application notes, section 1.2, for a paralleled resistor).
 * NaN when no positive Rs exists.
 */
export function rsTurningPoint(m: NtcModel, tK: number): number {
  const r = resistance(m, tK);
  const s = dRdT(m, tK);
  if (!Number.isFinite(r) || !Number.isFinite(s)) return NaN;
  // s'/s = d ln|s| / dT
  let q = s / r - 2 / tK;
  if (m.kind === 'sh') {
    const x = Math.log(r);
    const g = m.b + 3 * m.c * x * x;
    q -= (6 * m.c * x * (s / r)) / g;
  }
  const rs = (2 * s) / q - r;
  return Number.isFinite(rs) && rs > 0 ? rs : NaN;
}

/** Closed form of rsTurningPoint for the Beta model. */
export const rsTurningPointBeta = (r: number, beta: number, tK: number) => {
  const rs = (r * (beta - 2 * tK)) / (beta + 2 * tK);
  return rs > 0 ? rs : NaN;
};

/** Rs giving the largest output span between two resistances: d(span)/dRs = 0 ⇒ Rs = √(R1·R2). */
export const rsMaxSpan = (r1: number, r2: number) => (r1 > 0 && r2 > 0 ? Math.sqrt(r1 * r2) : NaN);

/**
 * Rs that makes the output at the middle temperature the mean of the outputs at the ends
 * (three-point linearisation): Rs = (R2(R1 + R3) − 2 R1 R3) / (R1 + R3 − 2 R2).
 */
export function rsThreePoint(r1: number, r2: number, r3: number): number {
  const den = r1 + r3 - 2 * r2;
  if (!(r1 > 0 && r2 > 0 && r3 > 0) || den === 0) return NaN;
  const rs = (r2 * (r1 + r3) - 2 * r1 * r3) / den;
  return Number.isFinite(rs) && rs > 0 ? rs : NaN;
}

/* --------------------------------------------------------------- tolerance */

export interface ToleranceBand {
  /** Most negative and most positive temperature reading error, K. */
  low: number;
  high: number;
}

/**
 * Reading error when the part sits at a tolerance corner and is read with the nominal model.
 * The actual resistance is R(T)·(1 ± tR)·exp(±tB·B·(1/T − 1/Tref)) — the R25 tolerance and the
 * resistance spread from the B tolerance (TDK general technical information, 3.1.4; Vishay 29049,
 * "Determination of the resistance/temperature deviation"). Fractions, not percent.
 */
export function toleranceBand(m: NtcModel, tK: number, rTol: number, bTol: number, betaNom: number, tRefK = toK(25)): ToleranceBand {
  const r = resistance(m, tK);
  if (!Number.isFinite(r) || !(rTol >= 0 && rTol < 1) || !(bTol >= 0 && bTol < 1) || !(betaNom > 0)) return { low: NaN, high: NaN };
  let low = Infinity;
  let high = -Infinity;
  for (const sr of [-1, 1]) {
    for (const sb of [-1, 1]) {
      const rAct = r * (1 + sr * rTol) * Math.exp(sb * bTol * betaNom * (1 / tK - 1 / tRefK));
      const e = temperature(m, rAct) - tK;
      low = Math.min(low, e);
      high = Math.max(high, e);
    }
  }
  return Number.isFinite(low) && Number.isFinite(high) ? { low, high } : { low: NaN, high: NaN };
}

/* ------------------------------------------------------------ lookup table */

export interface LutRow {
  tC: number;
  r: number;
  v: number;
  code: number;
}

export const LUT_MAX_ROWS = 2001;

/** Rows from tMinC to tMaxC (°C) in steps of stepC; null when the step count is unusable. */
export function lookupTable(m: NtcModel, d: Divider, tMinC: number, tMaxC: number, stepC: number): LutRow[] | null {
  if (!(stepC > 0) || !(tMaxC >= tMinC) || !finite(tMinC, tMaxC, stepC)) return null;
  const n = Math.floor((tMaxC - tMinC) / stepC + 1e-9) + 1;
  if (n > LUT_MAX_ROWS) return null;
  const rows: LutRow[] = [];
  for (let i = 0; i < n; i++) {
    const tC = Number((tMinC + i * stepC).toFixed(6));
    const r = resistance(m, toK(tC));
    const v = dividerV(d, r);
    rows.push({ tC, r, v, code: adcCode(d, v) });
  }
  return rows;
}

const num = (v: number, sig: number) => (Number.isFinite(v) ? String(Number(v.toPrecision(sig))) : '');

export function lutCsv(rows: readonly LutRow[]): string {
  const out = ['T_C,R_ohm,V_out_V,ADC_code'];
  for (const r of rows) out.push(`${num(r.tC, 6)},${num(r.r, 6)},${num(r.v, 6)},${Number.isFinite(r.code) ? r.code : ''}`);
  return out.join('\n') + '\n';
}

/**
 * C arrays: ADC codes and the matching temperatures in 0.1 °C, ascending in temperature.
 * `comment` lines are written above the arrays.
 */
export function lutC(rows: readonly LutRow[], bits: number, comment: readonly string[], name = 'ntc'): string {
  const type = bits <= 8 ? 'uint8_t' : bits <= 16 ? 'uint16_t' : 'uint32_t';
  const wrap = (vals: string[], per: number) => {
    const lines: string[] = [];
    for (let i = 0; i < vals.length; i += per) lines.push('  ' + vals.slice(i, i + per).join(', ') + (i + per < vals.length ? ',' : ''));
    return lines.join('\n');
  };
  const codes = rows.map((r) => (Number.isFinite(r.code) ? String(r.code) : '0'));
  const temps = rows.map((r) => String(Math.round(r.tC * 10)));
  return [
    ...comment.map((c) => `// ${c}`),
    '#include <stdint.h>',
    '',
    `#define ${name.toUpperCase()}_TABLE_LEN ${rows.length}`,
    '',
    `/* ADC code at each temperature */`,
    `static const ${type} ${name}_adc_code[${name.toUpperCase()}_TABLE_LEN] = {`,
    wrap(codes, 12),
    '};',
    '',
    `/* Temperature in 0.1 deg C for each entry of ${name}_adc_code */`,
    `static const int16_t ${name}_temp_dC[${name.toUpperCase()}_TABLE_LEN] = {`,
    wrap(temps, 12),
    '};',
    '',
  ].join('\n');
}
