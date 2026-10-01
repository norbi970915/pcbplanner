// Time-domain reflection (low-pass step) from a reflection S-parameter, after the
// low-pass step mode of a vector network analyser (Keysight application note
// 5989-5723EN, "Time Domain Analysis Using a Network Analyzer", §4.1, §5, §8, §9):
//  - the data must lie on a harmonic grid f_k = k·Δf from DC to f_max;
//  - the DC value is extrapolated when it is not in the file;
//  - the response is assumed Hermitian, S(−f) = S*(f), so the time response is real;
//  - a Kaiser window trades step rise time against ringing;
//  - the response repeats every 1/Δf (alias-free range).
// Impedance follows from the step reflection: Z(t) = Z0 (1 + ρ)/(1 − ρ).

export interface GridCheck {
  ok: boolean;
  /** Frequency step, Hz. */
  df: number;
  /** True when the first point is DC; false when the first point is Δf. */
  hasDc: boolean;
  reason?: string;
}

/** Relative deviation from the harmonic grid tolerated for frequencies rounded in the file. */
const GRID_TOL = 0.01;
export const MIN_TDR_POINTS = 10;

/** Checks that frequencies are k·Δf for k = 0…N or k = 1…N. */
export function checkLowPassGrid(freq: Float64Array): GridCheck {
  const count = freq.length;
  const fail = (reason: string): GridCheck => ({ ok: false, df: NaN, hasDc: false, reason });
  if (count < MIN_TDR_POINTS) return fail(`The file has ${count} frequency points; the time-domain transform needs at least ${MIN_TDR_POINTS} on a uniform grid.`);
  const fMax = freq[count - 1];
  const hasDc = freq[0] <= GRID_TOL * (fMax / count);
  const df = hasDc ? fMax / (count - 1) : fMax / count;
  const offset = hasDc ? 0 : 1;
  if (!hasDc && Math.abs(freq[0] - df) > GRID_TOL * df) {
    return fail(`The data starts at ${fmtHz(freq[0])}, not at DC or at one frequency step (${fmtHz(df)}) above it. The low-pass transform needs harmonically related points f = k·Δf from DC, so the DC value can be extrapolated from the first points.`);
  }
  for (let k = 0; k < count; k++) {
    if (Math.abs(freq[k] - (k + offset) * df) > GRID_TOL * df) {
      return fail(`The frequency points are not uniformly spaced (point ${k + 1} is ${fmtHz(freq[k])}, the grid needs ${fmtHz((k + offset) * df)}). The low-pass transform needs points f = k·Δf from DC.`);
    }
  }
  return { ok: true, df, hasDc };
}

function fmtHz(f: number) {
  if (f >= 1e9) return `${Number((f / 1e9).toPrecision(6))} GHz`;
  if (f >= 1e6) return `${Number((f / 1e6).toPrecision(6))} MHz`;
  if (f >= 1e3) return `${Number((f / 1e3).toPrecision(6))} kHz`;
  return `${Number(f.toPrecision(6))} Hz`;
}

/** Modified Bessel function of the first kind, order 0 (power series). */
export function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  const q = (x * x) / 4;
  for (let k = 1; k < 200; k++) {
    term *= q / (k * k);
    sum += term;
    if (term < sum * 1e-17) break;
  }
  return sum;
}

/** Half of a Kaiser window centred on DC: w_k = I0(β√(1 − (k/N)²)) / I0(β), k = 0…N. */
export function kaiserHalf(beta: number, N: number): Float64Array {
  const w = new Float64Array(N + 1);
  const d = besselI0(beta);
  for (let k = 0; k <= N; k++) {
    const r = N > 0 ? k / N : 0;
    w[k] = besselI0(beta * Math.sqrt(Math.max(0, 1 - r * r))) / d;
  }
  return w;
}

/** In-place radix-2 FFT; sign = +1 computes Σ x[k]·e^{+j2πkn/L} (unscaled inverse). */
export function fft(re: Float64Array, im: Float64Array, sign: 1 | -1) {
  const L = re.length;
  for (let i = 1, j = 0; i < L; i++) {
    let bit = L >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let size = 2; size <= L; size <<= 1) {
    const ang = (sign * 2 * Math.PI) / size;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    const half = size >> 1;
    for (let start = 0; start < L; start += size) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = start + k, b = a + half;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

export interface StepResponse {
  /** Time, s; from −T/2 to T/2 with T = 1/Δf. */
  t: Float64Array;
  /** Step reflection coefficient ρ(t). */
  rho: Float64Array;
  df: number;
  fMax: number;
  /** Alias-free range 1/Δf, s. */
  range: number;
  /** DC reflection coefficient used (from the file or extrapolated). */
  dc: number;
  dcExtrapolated: boolean;
}

/**
 * Low-pass step response of a reflection coefficient sampled on a harmonic grid.
 * Without a DC point, Re S(0) is extrapolated from the first two points with Re S = a + b·f²
 * (the real part of a Hermitian response is even in f), and Im S(0) = 0.
 */
export function lowPassStep(freq: Float64Array, re: Float64Array, im: Float64Array, beta: number): StepResponse | { error: string } {
  const grid = checkLowPassGrid(freq);
  if (!grid.ok) return { error: grid.reason ?? 'The frequency grid is not suitable.' };
  const count = freq.length;
  const N = grid.hasDc ? count - 1 : count; // index of f_max
  const sr = new Float64Array(N + 1);
  const si = new Float64Array(N + 1);
  let dc: number;
  if (grid.hasDc) {
    dc = re[0];
    for (let k = 0; k <= N; k++) {
      sr[k] = re[k];
      si[k] = im[k];
    }
    si[0] = 0;
  } else {
    dc = Math.max(-1, Math.min(1, (4 * re[0] - re[1]) / 3));
    sr[0] = dc;
    for (let k = 1; k <= N; k++) {
      sr[k] = re[k - 1];
      si[k] = im[k - 1];
    }
  }
  const step = stepFromSpectrum(sr, si, beta);
  return { t: step.t.map((x) => x / grid.df), rho: step.rho, df: grid.df, fMax: N * grid.df, range: 1 / grid.df, dc, dcExtrapolated: !grid.hasDc };
}

/** Transform length: at least 2N + 2 (room for the mirrored spectrum), oversampled for a smooth trace. */
function transformLength(N: number) {
  const pow2 = (v: number) => 2 ** Math.ceil(Math.log2(Math.max(2, v)));
  return Math.max(pow2(2 * N + 2), Math.min(pow2(8 * N), 1 << 17));
}

/**
 * Step response from spectrum samples X_0…X_N at k·Δf (Δf = 1 here: time is returned in units of 1/Δf).
 * The step is the running sum of the impulse response, started at t = −T/2 so the window's
 * pre-ringing is included; the final value equals the windowed DC value X_0.
 */
function stepFromSpectrum(xr: Float64Array, xi: Float64Array, beta: number): { t: Float64Array; rho: Float64Array } {
  const N = xr.length - 1;
  const w = kaiserHalf(beta, N);
  const L = transformLength(N);
  const re = new Float64Array(L);
  const im = new Float64Array(L);
  re[0] = xr[0] * w[0];
  for (let k = 1; k <= N; k++) {
    re[k] = xr[k] * w[k];
    im[k] = xi[k] * w[k];
    re[L - k] = re[k];
    im[L - k] = -im[k];
  }
  fft(re, im, 1);
  const half = L >> 1;
  const t = new Float64Array(L);
  const rho = new Float64Array(L);
  let acc = 0;
  for (let m = 0; m < L; m++) {
    const idx = (m + half) % L; // m = 0 is t = −T/2
    acc += re[idx] / L;
    t[m] = (m - half) / L;
    rho[m] = acc;
  }
  return { t, rho };
}

/**
 * 10–90 % rise time of the step for an ideal reflection (S = 1 at every frequency) with the same
 * f_max, number of points and window: the time resolution of the transform.
 */
export function stepRiseTime(N: number, df: number, beta: number): number {
  const xr = new Float64Array(N + 1).fill(1);
  const xi = new Float64Array(N + 1);
  const { t, rho } = stepFromSpectrum(xr, xi, beta);
  const zero = t.length >> 1;
  const cross = (level: number, dir: -1 | 1) => {
    // walk from t = 0 until the step passes the level, then interpolate
    for (let m = zero; m > 0 && m < t.length - 1; m += dir) {
      const a = rho[m], b = rho[m + dir];
      if ((dir < 0 && b < level && a >= level) || (dir > 0 && b >= level && a < level)) return t[m] + ((level - a) / (b - a)) * (t[m + dir] - t[m]);
    }
    return NaN;
  };
  return (cross(0.9, 1) - cross(0.1, -1)) / df;
}

/** Z = Z0 (1 + ρ)/(1 − ρ); +Infinity for ρ ≥ 1 (open), 0 for ρ ≤ −1 (short). */
export function impedanceFromRho(rho: number, z0: number): number {
  if (rho >= 1) return Infinity;
  if (rho <= -1) return 0;
  return (z0 * (1 + rho)) / (1 - rho);
}
