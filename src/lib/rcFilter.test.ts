import { describe, expect, it } from 'vitest';
import { rcCorners, rcDesign, rcFilter, rcResponse, rcStandard, type RcCircuit, type RcKind } from './rcFilter';

const base: RcCircuit = { kind: 'lowpass', r: 1000, c: 100e-9, rs: 0, rl: 0 };
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(Math.max(1e-12, Math.abs(b) * 1e-10));

describe('RC transfer functions', () => {
  it('reproduces the unloaded 1 kΩ / 100 nF textbook pole and time constants', () => {
    const r = rcFilter(base);
    near(r.fc, 1591.5494309189535);
    near(r.tau, 100e-6);
    near(r.rise1090, 219.722457733622e-6);
    near(r.settling1, 460.517018598809e-6);
    expect(r.gain).toBe(1);
  });

  it.each<RcKind>(['lowpass', 'highpass'])('has a relative −3.0103 dB corner with the correct phase: %s', kind => {
    const r = rcFilter({ ...base, kind, rs: 1000, rl: 1000 });
    const at = rcResponse(r, r.fc);
    near(at.magnitude, r.gain / Math.sqrt(2));
    near(at.relativeDb, -3.010299956639812);
    near(at.phase, kind === 'lowpass' ? -45 : 45);
    expect(at.db).toBeLessThan(at.relativeDb);
  });

  it('includes the loaded low-pass divider and the resistance seen by C', () => {
    const r = rcFilter({ ...base, rs: 1000, rl: 1000 });
    near(r.gain, 1 / 3);
    near(r.req, 2000 / 3);
    near(r.fc, 2387.32414637843);
  });

  it('puts R in parallel with the load for high-pass and adds source resistance', () => {
    const r = rcFilter({ ...base, kind: 'highpass', rs: 1000, rl: 1000 });
    near(r.gain, 1 / 3);
    near(r.req, 1500);
    near(r.fc, 1061.032953945969);
  });

  it.each<RcKind>(['lowpass', 'highpass'])('agrees with independent complex voltage division across a frequency sweep: %s', kind => {
    for (const rs of [0, 47, 10000]) for (const rl of [0, 470, 1e6]) {
      const i = { ...base, kind, rs, rl };
      const result = rcFilter(i);
      for (const f of [1, 100, 1591.55, 10000, 1e7]) {
        const xc = 1 / (2 * Math.PI * f * i.c);
        let zr: number, zi: number, dr: number, di: number;
        if (kind === 'lowpass') {
          const conductance = rl === 0 ? 0 : 1 / rl;
          const susceptance = 1 / xc;
          const denom = conductance ** 2 + susceptance ** 2;
          zr = conductance / denom; zi = -susceptance / denom;
          dr = rs + i.r + zr; di = zi;
        } else {
          zr = 1 / (1 / i.r + (rl === 0 ? 0 : 1 / rl)); zi = 0;
          dr = rs + zr; di = -xc;
        }
        const re = (zr * dr + zi * di) / (dr * dr + di * di);
        const im = (zi * dr - zr * di) / (dr * dr + di * di);
        const response = rcResponse(result, f);
        near(response.magnitude, Math.hypot(re, im));
        near(response.phase, Math.atan2(im, re) * 180 / Math.PI);
      }
    }
  });

  it('approaches the expected asymptotes and stays finite across wide frequency ratios', () => {
    for (const kind of ['lowpass', 'highpass'] as const) {
      const r = rcFilter({ ...base, kind });
      const low = rcResponse(r, r.fc * 1e-12), high = rcResponse(r, r.fc * 1e12);
      near(kind === 'lowpass' ? low.magnitude : high.magnitude, 1);
      near(kind === 'lowpass' ? high.db : low.db, -240);
    }
  });
});

describe('RC design and preferred values', () => {
  it.each<RcKind>(['lowpass', 'highpass'])('recovers known components including loading: %s', kind => {
    const i = { ...base, kind, r: 4700, c: 22e-9, rs: 330, rl: 22000 };
    const target = rcFilter(i).fc;
    near(rcDesign({ ...i, r: -1 }, target, 'r').r, i.r);
    near(rcDesign({ ...i, c: -1 }, target, 'c').c, i.c);
  });

  it.each<RcKind>(['lowpass', 'highpass'])('rejects targets beyond the finite load/source limits: %s', kind => {
    const i = { ...base, kind, rs: 1000, rl: 1000 };
    expect(() => rcDesign(i, 100, 'r')).toThrow(/too low/);
    expect(() => rcDesign(i, 1e6, 'r')).toThrow(/too high/);
  });

  it('rejects the exact infinite-R and zero-R boundaries', () => {
    expect(() => rcDesign({ ...base, c: 1, rl: 1 }, 1 / (2 * Math.PI), 'r')).toThrow();
    expect(() => rcDesign({ ...base, c: 1, rs: 1 }, 1 / (2 * Math.PI), 'r')).toThrow();
    expect(() => rcDesign({ ...base, kind: 'highpass', c: 1, rs: 1 }, 1 / (2 * Math.PI), 'r')).toThrow();
  });

  it('ranks bracketing E24/E12 combinations by their actual loaded cutoff', () => {
    const i = { ...base, r: 1630, c: 47e-9, rs: 100, rl: 10000 };
    const rows = rcStandard(i, 'E24', 'E12');
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.r).sort((a,b)=>a-b)).toEqual([1600, 1800]);
    expect(rows.every(r => r.c === 47e-9)).toBe(true);
    const target = rcFilter(i).fc;
    expect(Math.abs(Math.log(rows[0].fc / target))).toBeLessThanOrEqual(Math.abs(Math.log(rows[1].fc / target)));
  });
});

describe('RC tolerances and input validation', () => {
  it('matches the exact unloaded tolerance products', () => {
    const nominal = rcFilter(base);
    const corners = rcCorners(base, 1, 10);
    near(Math.min(...corners.map(r => r.fc)), nominal.fc / (1.01 * 1.1));
    near(Math.max(...corners.map(r => r.fc)), nominal.fc / (0.99 * 0.9));
  });

  it.each<RcKind>(['lowpass', 'highpass'])('bounds interior component values with loaded tolerance corners: %s', kind => {
    const i = { ...base, kind, rs: 820, rl: 1500 };
    const corners = rcCorners(i, 5, 20);
    for (const f of [100, 1000, 10000]) {
      const responses = corners.map(c => rcResponse(c, f));
      for (const dr of [-0.05, -0.02, 0, 0.03, 0.05]) for (const dc of [-0.2, -0.1, 0, 0.15, 0.2]) {
        const x = rcFilter({ ...i, r: i.r * (1 + dr), c: i.c * (1 + dc) });
        const response = rcResponse(x, f);
        for (const field of ['db', 'phase'] as const) {
          expect(response[field]).toBeGreaterThanOrEqual(Math.min(...responses.map(r => r[field])) - 1e-10);
          expect(response[field]).toBeLessThanOrEqual(Math.max(...responses.map(r => r[field])) + 1e-10);
        }
      }
    }
  });

  it('rejects invalid, non-finite and numerically unrepresentable values', () => {
    for (const r of [0, -1, NaN, Infinity]) expect(() => rcFilter({ ...base, r })).toThrow();
    for (const c of [0, -1, NaN, Infinity]) expect(() => rcFilter({ ...base, c })).toThrow();
    expect(() => rcFilter({ ...base, rs: -1 })).toThrow();
    expect(() => rcFilter({ ...base, rl: Infinity })).toThrow();
    expect(() => rcFilter({ ...base, r: 1e308, c: 1e308 })).toThrow();
    for (const t of [-1, 100, Infinity]) expect(() => rcCorners(base, t, 5)).toThrow();
    expect(() => rcResponse(rcFilter(base), 0)).toThrow();
  });
});
