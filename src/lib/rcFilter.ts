import { eNeighbors, type ESeries } from './electronics';

export type RcKind = 'lowpass' | 'highpass';
export interface RcCircuit {
  kind: RcKind;
  r: number; // filter resistor, ohms
  c: number; // farads
  rs: number; // Thevenin source resistance, ohms
  rl: number; // resistive load, ohms; 0 means open circuit
}

function positive(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(name + ' must be finite and greater than zero.');
}

function loading(i: Pick<RcCircuit, 'kind' | 'rs' | 'rl'>) {
  if (i.kind !== 'lowpass' && i.kind !== 'highpass') throw new RangeError('Choose low-pass or high-pass.');
  if (!Number.isFinite(i.rs) || i.rs < 0 || !Number.isFinite(i.rl) || i.rl < 0) throw new RangeError('Source and load resistance must be finite and non-negative.');
}

/** Parallel resistance with 0 used only for an absent load. Avoids a*b overflow. */
const loaded = (a: number, load: number) => load === 0 ? a : 1 / (1 / a + 1 / load);

/** Exact first-order transfer function for the circuit shown on the tool. */
export function rcFilter(i: RcCircuit) {
  loading(i);
  positive(i.r, 'Resistance');
  positive(i.c, 'Capacitance');
  const series = i.rs + i.r;
  const shunt = loaded(i.r, i.rl);
  const req = i.kind === 'lowpass' ? loaded(series, i.rl) : i.rs + shunt;
  const gain = i.kind === 'lowpass' ? (i.rl === 0 ? 1 : 1 / (1 + series / i.rl)) : 1 / (1 + i.rs / shunt);
  const tau = req * i.c;
  const fc = 1 / (2 * Math.PI * tau);
  if (![req, gain, tau, fc].every(v => Number.isFinite(v) && v > 0)) throw new RangeError('These values exceed the numerical range. Use less extreme component values.');
  return { ...i, req, gain, passbandDb: 20 * Math.log10(gain), tau, fc, settling1: Math.log(100) * tau, rise1090: Math.log(9) * tau };
}

export type RcResult = ReturnType<typeof rcFilter>;

export function rcResponse(result: RcResult, f: number) {
  positive(f, 'Frequency');
  const x = f / result.fc;
  const denominator = result.kind === 'lowpass' ? Math.hypot(1, x) : Math.hypot(1, 1 / x);
  const relativeDb = -20 * Math.log10(denominator);
  const phase = (result.kind === 'lowpass' ? -Math.atan(x) : Math.atan(1 / x)) * 180 / Math.PI;
  return { magnitude: result.gain / denominator, db: result.passbandDb + relativeDb, relativeDb, phase };
}

/** Solve for one component, including source/load resistance. Impossible finite-R targets throw. */
export function rcDesign(i: RcCircuit, target: number, solveFor: 'r' | 'c'): RcResult {
  loading(i);
  positive(target, 'Target cutoff');
  if (solveFor === 'c') {
    const unitCap = rcFilter({ ...i, c: 1 });
    return rcFilter({ ...i, c: 1 / (2 * Math.PI * target * unitCap.req) });
  }
  if (solveFor !== 'r') throw new RangeError('Choose resistance or capacitance.');
  positive(i.c, 'Capacitance');
  const req = 1 / (2 * Math.PI * target * i.c);
  let r: number;
  if (i.kind === 'lowpass') {
    if (i.rl > 0 && req >= i.rl) throw new RangeError('Target cutoff is too low for this capacitance and load. Increase C or increase the load resistance.');
    const series = i.rl === 0 ? req : req / (1 - req / i.rl);
    r = series - i.rs;
    if (!(r > 0)) throw new RangeError('Target cutoff is too high for this capacitance and source resistance. Reduce C or reduce the source resistance.');
  } else {
    const shunt = req - i.rs;
    if (!(shunt > 0)) throw new RangeError('Target cutoff is too high for this capacitance and source resistance. Reduce C or reduce the source resistance.');
    if (i.rl > 0 && shunt >= i.rl) throw new RangeError('Target cutoff is too low for this capacitance and load. Increase C or increase the load resistance.');
    r = i.rl === 0 ? shunt : shunt / (1 - shunt / i.rl);
  }
  return rcFilter({ ...i, r });
}

/** Independent R/C tolerance corners. Source and load are held fixed. */
export function rcCorners(i: RcCircuit, rPct: number, cPct: number): RcResult[] {
  for (const t of [rPct, cPct]) if (!Number.isFinite(t) || t < 0 || t >= 100) throw new RangeError('Component tolerances must be from 0 to less than 100%.');
  return [-1, 1].flatMap(dr => [-1, 1].map(dc => rcFilter({ ...i, r: i.r * (1 + dr * rPct / 100), c: i.c * (1 + dc * cPct / 100) })));
}

/** Bracketing preferred values for both parts, ranked by logarithmic cutoff error. */
export function rcStandard(i: RcCircuit, rSeries: ESeries, cSeries: ESeries) {
  const exact = rcFilter(i);
  const rn = eNeighbors(i.r, rSeries), cn = eNeighbors(i.c, cSeries);
  return [...new Set([rn.below, rn.above])].flatMap(r => [...new Set([cn.below, cn.above])].map(c => {
    const result = rcFilter({ ...i, r, c });
    return { ...result, errorPct: (result.fc / exact.fc - 1) * 100 };
  })).sort((a, b) => Math.abs(Math.log(a.fc / exact.fc)) - Math.abs(Math.log(b.fc / exact.fc)));
}
