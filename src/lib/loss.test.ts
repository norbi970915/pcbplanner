import { describe, expect, it } from 'vitest';
import { FOILS, HURAY_SR, hurayRadius } from '../data/laminates';
import { microstripHJ } from './closedform';
import { MU0, RHO20 } from './copper';
import { djordjevicSarkar } from './dielectric';
import { solve, type Geometry } from './fieldsolver';
import { incrementalDZ, lineLoss, NP_TO_DB, roughnessFactor } from './loss';
import { C0, ETA0 } from './units';

const pct = (a: number, b: number) => (100 * (a - b)) / b;
const flat = (dk: number, df: number) => ({ dk: () => dk, df: () => df });

describe('energy partition', () => {
  it('εeff = air + Σ εr·p exactly (coated microstrip, two slabs, mask)', () => {
    const g: Geometry = {
      w: 0.15,
      wTop: 0.14,
      t: 0.035,
      yTrace: 0.1,
      diff: false,
      slabs: [
        { y0: 0, y1: 0.06, er: 4.3 },
        { y0: 0.06, y1: 0.1, er: 3.7 },
      ],
      mask: { surfaceY: 0.1, overSubstrate: 0.03, overTrace: 0.015, er: 3.8 },
    };
    const r = solve(g, { parts: true }).se!;
    const p = r.parts!;
    const sum = p.air + 4.3 * p.slabs[0] + 3.7 * p.slabs[1] + 3.8 * p.mask;
    expect(sum).toBeCloseTo(r.eeff, 9);
  });
  it('holds for the odd and even modes of a pair', () => {
    const g: Geometry = { w: 0.12, t: 0.035, yTrace: 0.1, diff: true, s: 0.15, slabs: [{ y0: 0, y1: 0.1, er: 4 }] };
    const r = solve(g, { parts: true });
    for (const m of [r.odd!, r.even!]) expect(m.parts!.air + 4 * m.parts!.slabs[0]).toBeCloseTo(m.eeff, 9);
  });
});

describe('dielectric loss', () => {
  it('homogeneous stripline: tanδeff = tanδ and αd = π f √εr tanδ / c', () => {
    const g: Geometry = { w: 0.12, t: 0.018, yTrace: 0.15, diff: false, slabs: [{ y0: 0, y1: 0.318, er: 3.8 }], topPlane: 0.318 };
    const r = lineLoss({ geom: g, slabModels: [flat(3.8, 0.008)], fRef: 1e9, freqs: [5e9], rough: { model: 'smooth' }, tempC: 20, accuracy: 'normal' });
    const p = r.points[0];
    expect(p.tanEff).toBeCloseTo(0.008, 9);
    expect(p.eeff).toBeCloseTo(3.8, 6);
    expect(p.alphaD).toBeCloseTo(((Math.PI * 5e9 * Math.sqrt(3.8) * 0.008) / C0) * NP_TO_DB, 6);
  });
  it('microstrip filling factor agrees with the quasi-static formula (Pozar 3.198) within 3 %', () => {
    const er = 4.2;
    const g: Geometry = { w: 0.2, t: 0.035, yTrace: 0.12, diff: false, slabs: [{ y0: 0, y1: 0.12, er }] };
    const r = lineLoss({ geom: g, slabModels: [flat(er, 0.02)], fRef: 1e9, freqs: [1e9], rough: { model: 'smooth' }, tempC: 20, accuracy: 'normal' });
    const p = r.points[0];
    const k0 = (2 * Math.PI * 1e9) / C0;
    const pozar = ((k0 * er * (p.eeff - 1) * 0.02) / (2 * Math.sqrt(p.eeff) * (er - 1))) * NP_TO_DB;
    expect(Math.abs(pct(p.alphaD, pozar))).toBeLessThan(3);
  });
});

describe('conductor loss (incremental inductance)', () => {
  it('microstrip: solver ∂Z/∂n matches the derivative of Hammerstad–Jensen in air within 5 %', () => {
    const w = 0.3, h = 0.2, t = 0.035;
    const g: Geometry = { w, t, yTrace: h, diff: false, slabs: [] };
    const d = 1e-4;
    const hj = (microstripHJ(w - 2 * d, h + 2 * d, t - 2 * d, 1).z0 - microstripHJ(w + 2 * d, h - 2 * d, t + 2 * d, 1).z0) / (2 * d);
    expect(Math.abs(pct(incrementalDZ(g, 'normal'), hj))).toBeLessThan(5);
  });
  it('stripline: αc agrees with Pozar’s incremental-inductance formula (eq. 3.199) within 4 %', () => {
    const b = 0.318, t = 0.018, w = 0.12, er = 3.5, f = 1e9;
    const g: Geometry = { w, t, yTrace: (b - t) / 2, diff: false, slabs: [{ y0: 0, y1: b, er }], topPlane: b };
    const r = lineLoss({ geom: g, slabModels: [flat(er, 0)], fRef: f, freqs: [f], rough: { model: 'smooth' }, tempC: 20, accuracy: 'normal' });
    const p = r.points[0];
    const rs = Math.sqrt(Math.PI * f * MU0 * RHO20);
    const [B, T, W] = [b * 1e-3, t * 1e-3, w * 1e-3];
    const A = 1 + (2 * W) / (B - T) + (1 / Math.PI) * ((B + T) / (B - T)) * Math.log((2 * B - T) / T);
    const pozar = ((2.7e-3 * rs * er * p.z * A) / (30 * Math.PI * (B - T))) * NP_TO_DB;
    // compare the skin-effect part only (remove the DC blend)
    const skinOnly = p.alphaC * Math.sqrt(1 - (r.rdc / p.rPerM) ** 2);
    expect(Math.abs(pct(skinOnly, pozar))).toBeLessThan(4);
  });
  it('microstrip: αc within 15 % of Pucel’s closed form (W/h = 1.5), which uses older Z0 fits', () => {
    const w = 0.3, h = 0.2, t = 0.035, er = 4, f = 1e9;
    const g: Geometry = { w, t, yTrace: h, diff: false, slabs: [{ y0: 0, y1: h, er }] };
    const r = lineLoss({ geom: g, slabModels: [flat(er, 0)], fRef: f, freqs: [f], rough: { model: 'smooth' }, tempC: 20, accuracy: 'normal' });
    const p = r.points[0];
    const rs = Math.sqrt(Math.PI * f * MU0 * RHO20);
    // Pucel, Massé, Hartwig (1968), 1/(2π) < W/h ≤ 2, lengths in mm → per m
    const we = w + (t / Math.PI) * (1 + Math.log((2 * h) / t));
    const bracket = 1 + h / we + (h / (Math.PI * we)) * (Math.log((2 * h) / t) - t / w);
    const pucelNp = ((rs / (2 * Math.PI * p.z * h * 1e-3)) * (1 - (we / (4 * h)) ** 2) * bracket);
    const skinOnly = p.alphaC * Math.sqrt(1 - (r.rdc / p.rPerM) ** 2);
    expect(Math.abs(pct(skinOnly, pucelNp * NP_TO_DB))).toBeLessThan(15);
  });
  it('rough copper raises only the conductor loss; Rac → Rdc at low frequency', () => {
    const g: Geometry = { w: 0.15, t: 0.035, yTrace: 0.1, diff: false, slabs: [{ y0: 0, y1: 0.1, er: 4 }] };
    const base = { geom: g, slabModels: [flat(4, 0.01)], fRef: 1e9, freqs: [1e3, 1e10], tempC: 20, accuracy: 'normal' as const };
    const smooth = lineLoss({ ...base, rough: { model: 'smooth' } });
    const rough = lineLoss({ ...base, rough: { model: 'hammerstad', rq: 2 } });
    expect(rough.points[1].alphaD).toBeCloseTo(smooth.points[1].alphaD, 12);
    expect(rough.points[1].alphaC).toBeGreaterThan(smooth.points[1].alphaC * 1.5);
    expect(smooth.points[0].rPerM / smooth.rdc).toBeCloseTo(1, 3);
    expect(smooth.rdc).toBeCloseTo(RHO20 / (0.15 * 0.035 * 1e-6), 6);
  });
  it('conductor loss grows as √f in the skin-effect regime', () => {
    const g: Geometry = { w: 0.15, t: 0.035, yTrace: 0.1, diff: false, slabs: [{ y0: 0, y1: 0.1, er: 4 }] };
    const r = lineLoss({ geom: g, slabModels: [flat(4, 0)], fRef: 1e9, freqs: [4e9, 16e9], rough: { model: 'smooth' }, tempC: 20, accuracy: 'normal' });
    expect(r.points[1].alphaC / r.points[0].alphaC).toBeCloseTo(2, 2);
  });
});

describe('roughness models', () => {
  it('Hammerstad: 1 when smooth, 1 + (2/π)·atan(1.4) at Rq = δ, saturates at 2', () => {
    expect(roughnessFactor({ model: 'hammerstad', rq: 0 }, 1)).toBe(1);
    expect(roughnessFactor({ model: 'hammerstad', rq: 1 }, 1)).toBeCloseTo(1 + (2 / Math.PI) * Math.atan(1.4), 12);
    expect(roughnessFactor({ model: 'hammerstad', rq: 100 }, 0.1)).toBeCloseTo(2, 6);
  });
  it('Groiss: 1 + e^−(δ/2Rq)^1.6, saturates at 2', () => {
    expect(roughnessFactor({ model: 'groiss', rq: 1 }, 2)).toBeCloseTo(1 + Math.exp(-1), 12);
    expect(roughnessFactor({ model: 'groiss', rq: 100 }, 0.01)).toBeCloseTo(2, 6);
  });
  it('Huray: → 1 + 1.5·SR as δ → 0, → 1 at low frequency', () => {
    expect(roughnessFactor({ model: 'huray', radius: 0.5, sr: 1 }, 1e-6)).toBeCloseTo(2.5, 5);
    expect(roughnessFactor({ model: 'huray', radius: 0.5, sr: 1 }, 1e4)).toBeCloseTo(1, 5);
  });
});

describe('Djordjevic–Sarkar laminate model', () => {
  const m = djordjevicSarkar({ dk: 3.66, df: 0.0037, f0: 10e9 });
  it('reproduces the datasheet point', () => {
    expect(m.dk(10e9)).toBeCloseTo(3.66, 12);
    expect(m.df(10e9)).toBeCloseTo(0.0037, 12);
  });
  it('Dk falls slowly with frequency and Df stays nearly flat mid-band', () => {
    expect(m.dk(1e9)).toBeGreaterThan(m.dk(10e9));
    expect(m.dk(1e9) - m.dk(10e9)).toBeLessThan(0.05);
    expect(Math.abs(m.df(1e9) / m.df(10e9) - 1)).toBeLessThan(0.05);
  });
  it('predicts the multi-frequency datasheet within 1.5 % (Shengyi S1141 2116 RC 55 %, fitted at 5 GHz)', () => {
    // the datasheet steps unevenly (4.09, 4.07, 4.00, 3.99 at 1/3/5/10 GHz); a causal model is smooth
    const s = djordjevicSarkar({ dk: 4.0, df: 0.017, f0: 5e9 });
    expect(Math.abs(s.dk(1e9) / 4.09 - 1)).toBeLessThan(0.015);
    expect(Math.abs(s.dk(3e9) / 4.07 - 1)).toBeLessThan(0.015);
    expect(Math.abs(s.dk(10e9) / 3.99 - 1)).toBeLessThan(0.015);
  });
  it('predicts FR408HR (fitted at 10 GHz) within 1 % at 1 and 2 GHz', () => {
    const s = djordjevicSarkar({ dk: 3.65, df: 0.0095, f0: 10e9 });
    expect(Math.abs(s.dk(1e9) / 3.69 - 1)).toBeLessThan(0.01);
    expect(Math.abs(s.dk(2e9) / 3.68 - 1)).toBeLessThan(0.01);
  });
  it('library defaults match the foil preset', () => {
    const ed = FOILS.find((f) => f.id === 'ed')!;
    expect(ed.rq).toBe(3.2);
    expect(hurayRadius(ed.rz)).toBeCloseTo(0.6651, 4);
    expect(HURAY_SR).toBeCloseTo(4.887, 3);
  });
  it('lossless material stays constant', () => {
    const l = djordjevicSarkar({ dk: 2.2, df: 0, f0: 1e9 });
    expect(l.dk(1e10)).toBe(2.2);
    expect(l.df(1e10)).toBe(0);
  });
});

// keep the constants honest: Rs of copper at 1 GHz ≈ 8.25 mΩ/sq
it('surface resistance of copper at 1 GHz', () => {
  expect(Math.sqrt(Math.PI * 1e9 * MU0 * RHO20) * 1e3).toBeCloseTo(8.25, 2);
  expect(ETA0).toBeCloseTo(376.73, 2);
});
