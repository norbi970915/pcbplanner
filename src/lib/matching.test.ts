import { describe, expect, it } from 'vitest';
import { bandAround, cAbs, cConj, cSub, cx, lNetworks, networkGamma, networkName, networkZin, returnLoss, smithPath, smithPoint, standardNetwork, termAt, type Cx, type LSolution } from './matching';

const near = (a: number, b: number, rel = 1e-9) => expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.abs(b) * rel + 1e-300);
const TAU = 2 * Math.PI;

/** Zin of each solution must equal Zs* at f0. */
function roundTrip(f: number, zs: Cx, zl: Cx, sols: LSolution[]) {
  for (const s of sols) {
    const zin = networkZin(s, zl, f);
    expect(cAbs(cSub(zin, cConj(zs)))).toBeLessThanOrEqual(1e-9 * cAbs(zs));
    expect(returnLoss(networkGamma(s, zs, zl, f, f))).toBeGreaterThan(150);
  }
}

describe('L-network synthesis, Pozar Example 5.1', () => {
  // ZL = 200 − j100 Ω (series RC) to a 100 Ω line at 500 MHz: zL = 2 − j1 lies inside the 1 + jx circle,
  // so only the shunt-at-load network applies. Pozar: b = 0.29, x = 1.22 → C = 0.92 pF, L = 38.8 nH;
  // b = −0.69, x = −1.22 → L = 46.1 nH, C = 2.61 pF.
  const f = 500e6, zs = cx(100), zl = cx(200, -100);
  const r = lNetworks(f, zs, zl);

  it('finds the two shunt-at-load solutions only', () => {
    expect(r.solutions).toHaveLength(2);
    expect(r.solutions.every((s) => s.topology === 'shunt-load')).toBe(true);
  });

  it('matches the normalised b and x of eq. 5.3', () => {
    // eq. 5.3a/b with RL = 200, XL = −100, Z0 = 100
    const RL = 200, XL = -100, Z0 = 100;
    const bs = [1, -1].map((s) => (XL + s * Math.sqrt(RL / Z0) * Math.sqrt(RL * RL + XL * XL - Z0 * RL)) / (RL * RL + XL * XL));
    for (const [i, B] of bs.entries()) {
      near(r.solutions[i].b, B, 1e-12);
      near(r.solutions[i].x, 1 / B + (XL * Z0) / RL - Z0 / (B * RL), 1e-12);
    }
    near(r.solutions[0].b * Z0, 0.29, 0.01);
    near(r.solutions[0].x / Z0, 1.22, 0.01);
    near(r.solutions[1].b * Z0, -0.69, 0.01);
    near(r.solutions[1].x / Z0, -1.22, 0.01);
  });

  it('gives Pozar\'s component values', () => {
    const [a, b] = r.solutions;
    expect(a.shunt.kind).toBe('C');
    expect(a.series.kind).toBe('L');
    near(a.shunt.value, 0.92e-12, 0.01);
    near(a.series.value, 38.8e-9, 0.01);
    expect(b.shunt.kind).toBe('L');
    expect(b.series.kind).toBe('C');
    near(b.shunt.value, 46.1e-9, 0.01);
    near(b.series.value, 2.61e-12, 0.01);
    expect(networkName(a)).toBe('Low-pass (series L, shunt C)');
    expect(networkName(b)).toBe('High-pass (series C, shunt L)');
  });

  it('round-trips to Zs* and the node Q follows the path', () => {
    roundTrip(f, zs, zl, r.solutions);
    // the load node has Q = 0.5; the middle node lies on r = 1
    for (const s of r.solutions) near(s.zMid.re, 100, 1e-12);
  });
});

describe('L-network synthesis, series-at-load case (eq. 5.6)', () => {
  it('matches eq. 5.6 for RL < Z0 and returns four networks when both apply', () => {
    const f = 1e9, Z0 = 50, RL = 20, XL = 15;
    const r = lNetworks(f, cx(Z0), cx(RL, XL));
    const ser = r.solutions.filter((s) => s.topology === 'series-load');
    expect(ser).toHaveLength(2);
    for (const [i, s] of ser.entries()) {
      const sg = i === 0 ? 1 : -1;
      near(s.x, sg * Math.sqrt(RL * (Z0 - RL)) - XL, 1e-12);
      near(s.b, (sg * Math.sqrt((Z0 - RL) / RL)) / Z0, 1e-12);
    }
    // gL = RL/(RL² + XL²)·Z0 = 1.6 > 1 → the shunt-at-load network cannot be used
    expect(r.solutions).toHaveLength(2);
    roundTrip(f, cx(Z0), cx(RL, XL), r.solutions);
    // RL < Z0 with a large reactance satisfies both conditions
    const r4 = lNetworks(f, cx(Z0), cx(20, 60));
    expect(r4.solutions).toHaveLength(4);
    roundTrip(f, cx(Z0), cx(20, 60), r4.solutions);
  });

  it('gives Q = √(Rhigh/Rlow − 1) for real-to-real matching', () => {
    for (const [rs, rl] of [[50, 5], [50, 1000], [10, 75]]) {
      const r = lNetworks(100e6, cx(rs), cx(rl));
      expect(r.solutions).toHaveLength(2);
      const q = Math.sqrt(Math.max(rs, rl) / Math.min(rs, rl) - 1);
      for (const s of r.solutions) {
        near(s.qMid, q, 1e-9);
        near(s.qNode, q, 1e-9);
      }
      roundTrip(100e6, cx(rs), cx(rl), r.solutions);
    }
  });
});

describe('L-network edge cases', () => {
  it('needs no network when ZL = Zs*', () => {
    const r = lNetworks(1e9, cx(50), cx(50));
    expect(r.matched).toBe(true);
    expect(r.solutions).toHaveLength(1);
    expect(r.solutions[0].series.kind).toBe('none');
    expect(r.solutions[0].shunt.kind).toBe('none');
  });

  it('cancels the reactance with one element when RL = Rs', () => {
    const r = lNetworks(1e9, cx(50), cx(50, 30));
    expect(r.matched).toBe(false);
    const single = r.solutions.filter((s) => s.shunt.kind === 'none');
    expect(single).toHaveLength(1);
    expect(single[0].series.kind).toBe('C');
    near(single[0].series.value, 1 / (TAU * 1e9 * 30), 1e-12);
    roundTrip(1e9, cx(50), cx(50, 30), r.solutions);
  });

  it('refuses a purely reactive load', () => {
    const r = lNetworks(1e9, cx(50), cx(0, 30));
    expect(r.solutions).toHaveLength(0);
    expect(r.reason).toMatch(/no resistance/);
    expect(lNetworks(1e9, cx(50), cx(-5, 30)).solutions).toHaveLength(0);
    expect(lNetworks(1e9, cx(0), cx(50)).solutions).toHaveLength(0);
  });

  it('matches a complex source to a complex load (conjugate match)', () => {
    const zs = cx(25, 40), zl = cx(120, -70);
    const r = lNetworks(2.4e9, zs, zl);
    expect(r.solutions.length).toBeGreaterThan(0);
    roundTrip(2.4e9, zs, zl, r.solutions);
  });
});

describe('frequency response', () => {
  it('models the termination as series R–L or R–C', () => {
    near(termAt(cx(10, 20), 1e9, 2e9).im, 40, 1e-12);
    near(termAt(cx(10, -20), 1e9, 2e9).im, -10, 1e-12);
  });

  it('finds the return-loss band; its 3 dB width matches f0/QL with QL = Qn/2', () => {
    // 50 Ω to 5 kΩ: Qn = √99, QL = Qn/2 ≈ 4.97 (Ludwig & Bogdanov §8.1); the half-power band of the
    // swept network is close to f0/QL for this Q
    const f0 = 100e6, zs = cx(50), zl = cx(5000);
    const s = lNetworks(f0, zs, zl).solutions[0];
    const rl = (f: number) => returnLoss(networkGamma(s, zs, zl, f0, f));
    const band = bandAround(rl, f0, 10 * Math.log10(2))!;
    expect(band.lo).not.toBeNull();
    expect(band.hi).not.toBeNull();
    near(rl(band.lo!), 10 * Math.log10(2), 1e-6);
    near(rl(band.hi!), 10 * Math.log10(2), 1e-6);
    const bw = band.hi! - band.lo!;
    near(bw, f0 / (Math.sqrt(99) / 2), 0.05);
    expect(bandAround(rl, f0 * 3, 10)).toBeNull();
  });

  it('rounds to standard values and keeps the best of the neighbours', () => {
    const f0 = 500e6, zs = cx(100), zl = cx(200, -100);
    const s = lNetworks(f0, zs, zl).solutions[0];
    const std = standardNetwork(s, 'E24', zs, zl, f0);
    expect([0.91e-12, 1e-12].some((v) => Math.abs(std.shunt.value - v) < 1e-18)).toBe(true);
    expect([36e-9, 39e-9].some((v) => Math.abs(std.series.value - v) < 1e-15)).toBe(true);
    expect(std.rl).toBeGreaterThan(20);
    expect(std.rl).toBeLessThan(Infinity);
  });
});

describe('Smith chart path', () => {
  it('starts at the load, follows r and g circles and ends at the source conjugate', () => {
    const zs = cx(50), zl = cx(10, -25);
    for (const s of lNetworks(1e9, zs, zl).solutions) {
      const [a, b] = smithPath(s, zl, 50);
      const g0 = smithPoint(zl, 50);
      near(a[0].re, g0.re, 1e-12);
      near(a[0].im, g0.im, 1e-12);
      const end = b[b.length - 1];
      expect(cAbs(end)).toBeLessThan(1e-9);
      // series arcs keep r constant, shunt arcs keep g constant
      const zOf = (g: Cx) => {
        const d = (1 - g.re) ** 2 + g.im ** 2;
        return cx((1 - g.re ** 2 - g.im ** 2) / d, (2 * g.im) / d);
      };
      const arcS = s.topology === 'series-load' ? a : b;
      const arcP = s.topology === 'series-load' ? b : a;
      const r0 = zOf(arcS[0]).re;
      for (const g of arcS) near(zOf(g).re, r0, 1e-9);
      const y = (g: Cx) => {
        const z = zOf(g);
        return z.re / (z.re * z.re + z.im * z.im);
      };
      const g0p = y(arcP[0]);
      for (const g of arcP) near(y(g), g0p, 1e-9);
    }
  });
});
