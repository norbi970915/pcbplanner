import { describe, expect, it } from 'vitest';
import { emiDcGain, emiLcFrequency, emiResponse, emiSeriesImpedance, emiSize, emiStandard, emiSweep, validateEmi, type EmiCircuit } from './emiFilter';

const ideal: EmiCircuit = {
  topology: 'lc', part: 'inductor', l: 10e-6, rdc: 0, cp: 0, rac: 1000,
  c1: { c: 2.2e-6, esr: 0, esl: 0 }, c2: { c: 1e-6, esr: 0, esl: 0 },
  rs: 0.1, rl: 10, damping: false, rd: Math.sqrt(10), cd: 4e-6,
};

// Independent 2x2 nodal solver for an LC/pi fixture, without the tool's complex
// helpers or its reduced transfer expression. Rows store [real, imaginary].
type Pair = [number, number];
const plus = (a: Pair, b: Pair): Pair => [a[0] + b[0], a[1] + b[1]];
const times = (a: Pair, b: Pair): Pair => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const divide = (a: Pair, b: Pair): Pair => {
  const d = b[0] ** 2 + b[1] ** 2;
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
function nodal(i: EmiCircuit, f: number, removeLoad = false) {
  const w = 2 * Math.PI * f;
  const ys = divide([1, 0], [i.rdc, w * i.l]);
  const g11 = plus(ys, [1 / i.rs, i.topology === 'pi' ? w * i.c1.c : 0]);
  const g22 = plus(ys, [removeLoad || i.rl === 0 ? 0 : 1 / i.rl, w * i.c2.c]);
  const yy = times(ys, ys), gg = times(g11, g22);
  const det: Pair = [gg[0] - yy[0], gg[1] - yy[1]];
  return {
    forward: divide([ys[0] / i.rs, ys[1] / i.rs], det),
    reverse: divide(divide(ys, det), [i.rs, 0]),
    outputZ: divide(g11, det),
  };
}

describe('LC reference sizing', () => {
  it('uses the resonance formula in TI SNVA538, pp. 2–3', () => {
    expect(emiLcFrequency(10e-6, 1e-6)).toBeCloseTo(50329.21210448704, 7);
    expect(emiSize(50329.21210448704, 1e-6, 'l')).toBeCloseTo(10e-6, 14);
    expect(emiSize(50329.21210448704, 10e-6, 'c')).toBeCloseTo(1e-6, 14);
  });
  it('rejects a sized component outside the supported range', () => {
    expect(() => emiSize(1, 1e-15, 'l')).toThrow(RangeError);
  });
});

describe('loaded filter transfer and reciprocity', () => {
  it.each([100, 1e4, 50329.21210448704, 1e6, 1e8])('agrees with TI’s ideal LC denominator at %g Hz', f => {
    // TI H = 1/(1 + sL/RL + s²LC), near-ideal source Rs = 1 µΩ.
    const i = { ...ideal, rs: 1e-6 };
    const w = 2 * Math.PI * f;
    const re = 1 - w ** 2 * i.l * i.c2.c, im = w * i.l / i.rl;
    const reference = 1 / Math.hypot(re, im);
    expect(emiResponse(i, f).gain / reference).toBeCloseTo(1, 5);
  });
  it.each(['lc', 'pi'] as const)('agrees with independent two-node analysis for %s, including reverse current', topology => {
    const i = { ...ideal, topology, rdc: 0.25, rs: 2, rl: 47 };
    for (const f of [100, 1e4, 5e4, 1e6, 1e8]) {
      const expected = nodal(i, f), actual = emiResponse(i, f);
      expect(actual.gain).toBeCloseTo(Math.hypot(...expected.forward), 10);
      expect(actual.gain).toBeCloseTo(Math.hypot(...expected.reverse), 10);
      expect(actual.phase).toBeCloseTo(Math.atan2(expected.forward[1], expected.forward[0]) * 180 / Math.PI, 8);
      expect(actual.zout).toBeCloseTo(Math.hypot(...nodal(i, f, true).outputZ), 8);
    }
  });
  it('reports insertion attenuation relative to the unfiltered loaded circuit', () => {
    const i = { ...ideal, l: 1e-12, c2: { c: 1e-15, esr: 0, esl: 0 }, rs: 50, rl: 50 };
    const p = emiResponse(i, 100);
    expect(p.gainDb).toBeCloseTo(-6.020599913, 8);
    expect(p.attenuation).toBeCloseTo(0, 10);
  });
  it('does not treat π as a cascade of independent stages', () => {
    const lc = emiResponse({ ...ideal, rs: 5 }, 1e6);
    const pi = emiResponse({ ...ideal, topology: 'pi', rs: 5 }, 1e6);
    expect(pi.attenuation).toBeGreaterThan(lc.attenuation + 30);
  });
  it('retains a disconnected load and matches the analytic DC limit', () => {
    const i = { ...ideal, rl: 0, rdc: 0.5 };
    expect(emiDcGain(i)).toBe(1);
    expect(emiResponse(i, 1).gain).toBeCloseTo(1, 7);
    const loaded = { ...i, rl: 10 };
    expect(emiResponse(loaded, 1).gain).toBeCloseTo(emiDcGain(loaded), 7);
  });
});

describe('ferrite and parasitics', () => {
  const bead = { ...ideal, part: 'ferrite' as const, l: 1.208e-6, rdc: 0.3, cp: 1.678e-12, rac: 1082 };
  it('reproduces the resistive peak of the AN-1368 fitted bead model', () => {
    // At parallel resonance the reactive admittances cancel: Z = Rac + Rdc.
    const z = emiSeriesImpedance(bead, emiLcFrequency(bead.l, bead.cp));
    expect(z.re).toBeCloseTo(1082.3, 8);
    expect(z.im).toBeCloseTo(0, 8);
    expect(emiSeriesImpedance(bead, 1).re).toBeCloseTo(0.3, 8);
    expect(emiSeriesImpedance(bead, 1e9).im).toBeLessThan(0);
  });
  it('includes winding resistance in the inductor self-resonance', () => {
    const i = { ...ideal, rdc: 0.1, cp: 5e-12 };
    const z = emiSeriesImpedance(i, emiLcFrequency(i.l, i.cp));
    expect(Number.isFinite(z.re)).toBe(true);
    expect(z.re).toBeGreaterThan(1e6);
  });
  it('models loss of capacitor bypass performance above its series resonance', () => {
    const i = { ...ideal, c2: { ...ideal.c2, esr: 0.01, esl: 10e-9 } };
    expect(emiResponse(i, 100e6).attenuation).toBeLessThan(emiResponse(ideal, 100e6).attenuation - 50);
  });
  it('does not read inactive C1, Rac or damping fields', () => {
    expect(() => emiResponse({ ...ideal, c1: { c: NaN, esr: NaN, esl: NaN }, rac: NaN, rd: NaN, cd: NaN }, 1e6)).not.toThrow();
  });
});

describe('sweep, resonance and damping', () => {
  it('finds a narrow high-Q peak rather than missing it between log samples', () => {
    const i = { ...ideal, rs: 0.001, rl: 0 };
    const result = emiSweep(i, 1, 1e9);
    const zeta = i.rs / 2 * Math.sqrt(i.c2.c / i.l);
    const fp = emiLcFrequency(i.l, i.c2.c) * Math.sqrt(1 - 2 * zeta ** 2);
    const peak = -20 * Math.log10(2 * zeta * Math.sqrt(1 - zeta ** 2));
    expect(result.peak.f).toBeCloseTo(fp, 2);
    expect(result.peakingDb).toBeCloseTo(peak, 6);
  });
  it('an RC branch reduces a troublesome peak without adding DC loss', () => {
    const i = { ...ideal, rs: 0.01, rl: 0 };
    const off = emiSweep(i, 100, 10e6), on = emiSweep({ ...i, damping: true }, 100, 10e6);
    expect(on.peakingDb).toBeLessThan(off.peakingDb - 20);
    expect(on.peakZout.zout).toBeLessThan(off.peakZout.zout / 10);
    expect(emiResponse({ ...i, damping: true }, 1).gain).toBeCloseTo(emiDcGain(i), 7);
  });
  it('handles a very narrow frequency band without an unbounded loop', () => {
    expect(emiSweep(ideal, 1e6, 1e6 + 1).points.length).toBeGreaterThanOrEqual(401);
  });
  it('recalculates preferred values using the loaded response', () => {
    const rows = emiStandard({ ...ideal, l: 4.8e-6, c2: { ...ideal.c2, c: 1.05e-6 } }, 'E24', 1e6);
    expect(rows.length).toBe(4);
    for (const row of rows) expect(row.attenuation).toBe(emiResponse({ ...ideal, l: row.l, c2: { ...ideal.c2, c: row.c } }, 1e6).attenuation);
    expect(Math.abs(rows[0].errorPct)).toBeLessThan(Math.abs(rows[3].errorPct));
  });
});

describe('input validation', () => {
  it.each(['l', 'rdc', 'cp', 'rs', 'rl'] as const)('rejects non-finite %s', key => {
    for (const value of [NaN, Infinity, -Infinity]) expect(() => emiResponse({ ...ideal, [key]: value }, 1e6)).toThrow(RangeError);
  });
  it.each([{ l: 0 }, { l: -1 }, { rs: 0 }, { rs: -1 }, { rdc: -1 }, { rl: -1 }, { cp: -1 }])('rejects invalid circuit fields %j', change => {
    expect(() => validateEmi({ ...ideal, ...change })).toThrow(RangeError);
  });
  it('rejects invalid active loss/parasitic combinations', () => {
    expect(() => validateEmi({ ...ideal, part: 'ferrite', rac: 0 })).toThrow(RangeError);
    expect(() => validateEmi({ ...ideal, cp: 1e-12 })).toThrow(RangeError);
    expect(() => validateEmi({ ...ideal, c2: { ...ideal.c2, esl: 1e-9 } })).toThrow(RangeError);
    expect(() => validateEmi({ ...ideal, damping: true, rd: 0 })).toThrow(RangeError);
  });
  it.each([0, -1, NaN, Infinity, 1e15])('rejects unsupported frequency %g', f => {
    expect(() => emiResponse(ideal, f)).toThrow(RangeError);
  });
  it('rejects reversed sweep bounds', () => {
    expect(() => emiSweep(ideal, 1e6, 1e3)).toThrow(RangeError);
  });
});
