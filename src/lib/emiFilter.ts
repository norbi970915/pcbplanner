// Lumped differential-mode power filters. Circuit analysis by KCL; LC and damping
// background: TI SNVA538. Ferrite model and operating-point limits: ADI AN-1368.
import { eNeighbors, type ESeries } from './electronics';
import { cAbs, cAdd, cDiv, cInv, cMul, cx, type Cx } from './matching';

export interface EmiCap { c: number; esr: number; esl: number }
export interface EmiCircuit {
  topology: 'lc' | 'pi';
  part: 'inductor' | 'ferrite';
  l: number;
  rdc: number;
  cp: number; // parallel capacitance of series part
  rac: number; // parallel AC loss resistor, ferrite only
  c1: EmiCap;
  c2: EmiCap;
  rs: number; // Thevenin source resistance
  rl: number; // load resistance; 0 = disconnected
  damping: boolean;
  rd: number;
  cd: number;
}

function range(v: number, lo: number, hi: number, name: string) {
  if (!Number.isFinite(v) || v < lo || v > hi) throw new RangeError(`${name} must be between ${lo} and ${hi} in base SI units.`);
}

export function validateEmi(i: EmiCircuit) {
  if (i.topology !== 'lc' && i.topology !== 'pi') throw new RangeError('Choose LC or C–L–C π topology.');
  if (i.part !== 'inductor' && i.part !== 'ferrite') throw new RangeError('Choose an inductor or ferrite bead.');
  range(i.l, 1e-12, 1, 'Inductance');
  range(i.rdc, 0, 1e6, 'Series DC resistance');
  range(i.cp, 0, 1e-3, 'Series-part parallel capacitance');
  if (i.part === 'ferrite') range(i.rac, 1e-6, 1e9, 'Ferrite AC loss resistance');
  if (i.part === 'inductor' && i.cp > 0 && i.rdc === 0) throw new RangeError('Include non-zero DC resistance when modelling inductor parallel capacitance.');
  range(i.rs, 1e-6, 1e9, 'Source resistance');
  range(i.rl, 0, 1e12, 'Load resistance');
  if (i.rl > 0 && i.rl < 1e-6) throw new RangeError('Use at least 1 µΩ for a connected load; 0 disconnects it.');
  for (const [name, c] of [['Output capacitor', i.c2], ...(i.topology === 'pi' ? [['Input capacitor', i.c1] as const] : [])] as const) {
    range(c.c, 1e-15, 1, `${name} capacitance`);
    range(c.esr, 0, 1e6, `${name} ESR`);
    range(c.esl, 0, 1e-3, `${name} ESL`);
    if (c.esl > 0 && c.esr === 0) throw new RangeError(`${name}: include non-zero ESR when modelling ESL.`);
  }
  if (i.damping) {
    range(i.rd, 1e-6, 1e9, 'Damping resistance');
    range(i.cd, 1e-15, 1, 'Damping capacitance');
  }
}

export const emiLcFrequency = (l: number, c: number) => 1 / (2 * Math.PI * Math.sqrt(l * c));
export const emiCapAdmittance = (cap: EmiCap, w: number): Cx => cInv(cx(cap.esr, w * cap.esl - 1 / (w * cap.c)));

/** Ferrite: Rdc + (L || Rac || Cp). Inductor: (Rdc + L) || Cp. Parameters are fitted at
 * the operating point; current ratings do not define a DC-bias derating law. */
export function emiSeriesImpedance(i: EmiCircuit, f: number): Cx {
  const w = 2 * Math.PI * f;
  if (i.part === 'inductor') {
    const winding = cx(i.rdc, w * i.l);
    return i.cp === 0 ? winding : cInv(cAdd(cInv(winding), cx(0, w * i.cp)));
  }
  return cAdd(cx(i.rdc), cInv(cx(1 / i.rac, w * i.cp - 1 / (w * i.l))));
}

export interface EmiPoint {
  f: number;
  gain: number;
  gainDb: number;
  phase: number;
  attenuation: number; // insertion loss relative to same source/load without any filter
  zout: number; // source killed, load disconnected
  seriesZ: number;
}

/** Voltage Vs -> Vout. By reciprocity it also equals Isource/Iinjected for a
 * current source across the output, with Vs killed and the same Rs/RL. */
function response(i: EmiCircuit, f: number): EmiPoint {
  const w = 2 * Math.PI * f;
  const z = emiSeriesImpedance(i, f);
  const y1 = i.topology === 'pi' ? emiCapAdmittance(i.c1, w) : cx(0);
  const yc = emiCapAdmittance(i.c2, w);
  const yd = i.damping ? cInv(cx(i.rd, -1 / (w * i.cd))) : cx(0);
  const y2 = cAdd(yc, yd);
  const yload = cAdd(y2, cx(i.rl === 0 ? 0 : 1 / i.rl));
  const a = cAdd(cx(1), cMul(cx(i.rs), y1));
  const denominator = cAdd(cMul(a, cAdd(cx(1), cMul(z, yload))), cMul(cx(i.rs), yload));
  const h = cInv(denominator);
  const gain = cAbs(h);
  const gainDb = 20 * Math.log10(gain);
  const bypassGain = i.rl === 0 ? 1 : 1 / (1 + i.rs / i.rl);
  const sourceShuntZ = cDiv(cx(i.rs), a);
  const zout = cAbs(cInv(cAdd(y2, cInv(cAdd(z, sourceShuntZ)))));
  const point = { f, gain, gainDb, phase: Math.atan2(h.im, h.re) * 180 / Math.PI, attenuation: 20 * Math.log10(bypassGain) - gainDb, zout, seriesZ: cAbs(z) };
  if (!Object.values(point).every(Number.isFinite)) throw new RangeError('A lossless resonance exceeds the numerical range. Include component losses or use less extreme values.');
  return point;
}

export function emiResponse(i: EmiCircuit, f: number) {
  validateEmi(i);
  range(f, 1, 3e9, 'Frequency');
  return response(i, f);
}

/** Low-frequency attenuation includes Rdc, not the capacitor or damping branch. */
export function emiDcGain(i: EmiCircuit) {
  return i.rl === 0 ? 1 : 1 / (1 + (i.rs + i.rdc) / i.rl);
}

/** Reference sizing, not an exact loaded -3 dB cutoff. Input pi capacitance is
 * not added to C2; the full two-node response must then be checked. */
export function emiSize(f0: number, fixed: number, solve: 'l' | 'c') {
  range(f0, 1, 3e9, 'LC reference frequency');
  range(fixed, solve === 'l' ? 1e-15 : 1e-12, 1, 'Fixed component');
  const value = 1 / ((2 * Math.PI * f0) ** 2 * fixed);
  range(value, solve === 'l' ? 1e-12 : 1e-15, 1, 'Calculated component');
  return value;
}

/** Values bracketing L and C2, with the exact loaded probe response. */
export function emiStandard(i: EmiCircuit, series: ESeries, f: number) {
  validateEmi(i);
  if (i.part !== 'inductor') return [];
  const ls = eNeighbors(i.l, series), cs = eNeighbors(i.c2.c, series);
  const target = emiLcFrequency(i.l, i.c2.c);
  return [...new Set([ls.below, ls.above])].flatMap(l => [...new Set([cs.below, cs.above])].map(c => {
    const circuit = { ...i, l, c2: { ...i.c2, c } };
    const f0 = emiLcFrequency(l, c);
    return { l, c, f0, errorPct: (f0 / target - 1) * 100, attenuation: emiResponse(circuit, f).attenuation };
  })).sort((a, b) => Math.abs(Math.log(a.f0 / target)) - Math.abs(Math.log(b.f0 / target)));
}

/** Sample log frequency then refine every bracketed local maximum, so a narrow
 * high-Q peak near the LC reference is not mistaken for a smooth passband. */
export function emiSweep(i: EmiCircuit, lo: number, hi: number) {
  validateEmi(i);
  range(lo, 1, 3e9, 'Sweep start'); range(hi, 1, 3e9, 'Sweep end');
  if (hi <= lo) throw new RangeError('Sweep end must be greater than sweep start.');
  const a = Math.log(lo), b = Math.log(hi);
  const frequencies = Array.from({ length: 401 }, (_, n) => Math.exp(a + (b - a) * n / 400));
  const f0 = emiLcFrequency(i.l, i.c2.c);
  for (const f of [f0 * 0.99, f0, f0 * 1.01, i.cp > 0 ? emiLcFrequency(i.l, i.cp) : 0]) if (f >= lo && f <= hi) frequencies.push(f);
  const points = [...new Set(frequencies)].sort((x, y) => x - y).map(f => response(i, f));
  const extra: EmiPoint[] = [];
  for (const key of ['gainDb', 'zout'] as const) {
    for (let n = 1; n < points.length - 1; n++) {
      if (!(points[n][key] > points[n - 1][key] && points[n][key] > points[n + 1][key])) continue;
      let left = Math.log(points[n - 1].f), right = Math.log(points[n + 1].f);
      const ratio = (Math.sqrt(5) - 1) / 2;
      let x1 = right - ratio * (right - left), x2 = left + ratio * (right - left);
      let p1 = response(i, Math.exp(x1)), p2 = response(i, Math.exp(x2));
      for (let k = 0; k < 45; k++) {
        if (p1[key] > p2[key]) { right = x2; x2 = x1; p2 = p1; x1 = right - ratio * (right - left); p1 = response(i, Math.exp(x1)); }
        else { left = x1; x1 = x2; p1 = p2; x2 = left + ratio * (right - left); p2 = response(i, Math.exp(x2)); }
      }
      extra.push(p1[key] > p2[key] ? p1 : p2);
    }
  }
  points.push(...extra); points.sort((x, y) => x.f - y.f);
  const peak = points.reduce((best, p) => p.gainDb > best.gainDb ? p : best);
  const peakZout = points.reduce((best, p) => p.zout > best.zout ? p : best);
  return { points, peak, peakZout, peakingDb: Math.max(0, peak.gainDb - 20 * Math.log10(emiDcGain(i))) };
}
