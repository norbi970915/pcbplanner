import { describe, expect, it } from 'vitest';
import { cascadeBounds, fromImpedance, matchFrom, mismatchBounds, quantityError, quantityOf, VSWR_TABLE, type Quantity } from './vswr';

const near = (a: number, b: number, rel = 1e-12) => expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.abs(b) * rel + 1e-300);
const m = (q: Quantity, v: number) => matchFrom(q, v)!;
const QUANTITIES: Quantity[] = ['vswr', 'gamma', 'rl', 'ml', 'reflected', 'transmitted'];

describe('match quantities', () => {
  it('VSWR 2:1 matches the NAWCWD EW/radar handbook example (|Γ| 0.333, RL 9.54 dB, ML 0.51 dB, 11 % reflected)', () => {
    const r = m('vswr', 2);
    near(r.gamma, 1 / 3);
    near(r.rl, 20 * Math.log10(3));
    expect(r.rl.toFixed(2)).toBe('9.54');
    expect(r.ml.toFixed(2)).toBe('0.51');
    near(r.ml, -10 * Math.log10(8 / 9));
    near(r.reflected, 1 / 9);
    near(r.transmitted, 8 / 9);
  });

  it('VSWR 1.5 gives |Γ| = 0.2, RL 13.98 dB, ML 0.177 dB', () => {
    const r = m('vswr', 1.5);
    near(r.gamma, 0.2);
    near(r.rl, -20 * Math.log10(0.2));
    near(r.ml, -10 * Math.log10(0.96));
  });

  it('each input round-trips through every other quantity', () => {
    for (const g of [0.001, 0.05, 0.2, 1 / 3, 0.5, 0.9, 0.999]) {
      const ref = m('gamma', g);
      for (const q of QUANTITIES) {
        const back = m(q, quantityOf(ref, q));
        for (const k of QUANTITIES) near(quantityOf(back, k), quantityOf(ref, k), 1e-9);
      }
    }
  });

  it('a perfect match: VSWR 1, |Γ| 0, RL ∞, ML 0', () => {
    for (const r of [m('vswr', 1), m('gamma', 0), m('ml', 0), m('reflected', 0), m('transmitted', 1)]) {
      expect(r.gamma).toBe(0);
      expect(Object.is(r.gamma, -0)).toBe(false);
      expect(r.vswr).toBe(1);
      expect(r.rl).toBe(Infinity);
      expect(r.ml).toBe(0);
      expect(r.reflected).toBe(0);
      expect(r.transmitted).toBe(1);
    }
  });

  it('total reflection: |Γ| 1, VSWR ∞, RL 0, ML ∞', () => {
    for (const r of [m('gamma', 1), m('rl', 0), m('reflected', 1), m('transmitted', 0)]) {
      expect(r.gamma).toBe(1);
      expect(r.vswr).toBe(Infinity);
      expect(r.rl).toBe(0);
      expect(r.ml).toBe(Infinity);
      expect(r.transmitted).toBe(0);
    }
  });

  it('stays precise near a match and near total reflection', () => {
    // RL 80 dB: |Γ| = 1e-4, ML = −10 log(1 − 1e-8) ≈ 4.3429e-8 dB
    const a = m('rl', 80);
    near(a.gamma, 1e-4, 1e-12);
    near(a.ml, (10 / Math.LN10) * 1e-8, 1e-7);
    near(a.vswr, 1.0001 / 0.9999, 1e-12);
    // ML 1e-9 dB round-trips through |Γ|
    near(m('gamma', m('ml', 1e-9).gamma).ml, 1e-9, 1e-6);
    // |Γ| = 1 − 1e-9: VSWR ≈ 2e9
    near(m('gamma', 1 - 1e-9).vswr, (2 - 1e-9) / 1e-9, 1e-6);
    // RL 1e-6 dB is nearly total reflection: 1 − |Γ|² = 1 − 10^(−1e-7) ≈ 2.3026e-7
    near(m('rl', 1e-6).transmitted, -Math.expm1(-1e-7 * Math.LN10), 1e-12);
    // a huge VSWR does not overflow
    expect(Number.isFinite(m('vswr', 1e200).ml)).toBe(true);
  });

  it('rejects invalid values', () => {
    expect(quantityError('vswr', 0.99)).toMatch(/1 or more/);
    expect(quantityError('gamma', 1.01)).toMatch(/between 0 and 1/);
    expect(quantityError('gamma', -0.1)).not.toBeNull();
    expect(quantityError('rl', -3)).not.toBeNull();
    expect(quantityError('ml', -0.1)).not.toBeNull();
    expect(quantityError('reflected', 1.5)).not.toBeNull();
    expect(quantityError('transmitted', -0.5)).not.toBeNull();
    expect(quantityError('vswr', Number.NaN)).not.toBeNull();
    expect(quantityError('vswr', Infinity)).not.toBeNull();
    expect(matchFrom('vswr', 0.5)).toBeNull();
    expect(matchFrom('rl', Number.NaN)).toBeNull();
    expect(quantityError('vswr', 1)).toBeNull();
  });

  it('the quick-reference table is ordered and starts at a perfect match', () => {
    expect(VSWR_TABLE[0]).toBe(1);
    for (let i = 1; i < VSWR_TABLE.length; i++) expect(VSWR_TABLE[i]).toBeGreaterThan(VSWR_TABLE[i - 1]);
  });
});

describe('load impedance', () => {
  it('100 Ω and 25 Ω on 50 Ω give |Γ| = 1/3, VSWR 2, angle 0° and 180°', () => {
    const a = fromImpedance(100, 0, 50)!;
    near(a.gamma, 1 / 3);
    near(a.vswr, 2);
    expect(a.angleDeg).toBe(0);
    const b = fromImpedance(25, 0, 50)!;
    near(b.gamma, 1 / 3);
    near(Math.abs(b.angleDeg), 180);
    near(b.g, 0.04);
  });

  it('50 + j50 Ω on 50 Ω: Γ = (1 + 2j)/5, |Γ| = 1/√5, ∠63.43°, VSWR = (3 + √5)/2', () => {
    const r = fromImpedance(50, 50, 50)!;
    near(r.re, 0.2);
    near(r.im, 0.4);
    near(r.gamma, 1 / Math.sqrt(5));
    near(r.angleDeg, (Math.atan(2) * 180) / Math.PI);
    near(r.vswr, (3 + Math.sqrt(5)) / 2, 1e-12);
    // Y = 1/(50 + j50) = 0.01 − j0.01 S
    near(r.g, 0.01);
    near(r.b, -0.01);
    // 1 − |Γ|² computed directly agrees with 1 − |Γ|²
    near(r.transmitted, 1 - 0.2, 1e-12);
  });

  it('matched load, short, and pure reactance', () => {
    const z = fromImpedance(50, 0, 50)!;
    expect(z.gamma).toBe(0);
    expect(z.rl).toBe(Infinity);
    expect(Number.isNaN(z.angleDeg)).toBe(true);
    const s = fromImpedance(0, 0, 50)!;
    expect(s.gamma).toBe(1);
    near(Math.abs(s.angleDeg), 180);
    expect(s.vswr).toBe(Infinity);
    expect(s.g).toBe(Infinity);
    const x = fromImpedance(0, 30, 50)!;
    near(x.gamma, 1);
    expect(x.transmitted).toBe(0);
    expect(x.ml).toBe(Infinity);
    // nearly lossless: R = 1 mΩ in series with j50 keeps an accurate mismatch loss
    const n = fromImpedance(1e-3, 50, 50)!;
    near(n.transmitted, (4 * 1e-3 * 50) / ((50.001 * 50.001) + 2500), 1e-12);
  });

  it('agrees with matchFrom for real loads', () => {
    for (const r of [5, 20, 49, 51, 75, 150, 1000]) {
      const a = fromImpedance(r, 0, 50)!;
      const s = r > 50 ? r / 50 : 50 / r;
      near(a.vswr, s, 1e-12);
      near(a.ml, m('vswr', s).ml, 1e-9);
    }
  });

  it('rejects active loads and bad Z0', () => {
    expect(fromImpedance(-1, 0, 50)).toBeNull();
    expect(fromImpedance(10, 0, 0)).toBeNull();
    expect(fromImpedance(10, Number.NaN, 50)).toBeNull();
  });
});

/** Transducer gain of a perfect through between Γs and Γl (Pozar §12.1 with S21 = 1, S11 = S22 = 0). */
function gt(gs: number, gl: number, theta: number) {
  const re = 1 - gs * gl * Math.cos(theta), im = -gs * gl * Math.sin(theta);
  return ((1 - gs * gs) * (1 - gl * gl)) / (re * re + im * im);
}

describe('mismatch between source and load', () => {
  it('VSWR 1.5 source into VSWR 2 load: limits match a phase sweep of the transducer gain', () => {
    const s = m('vswr', 1.5), l = m('vswr', 2);
    const b = mismatchBounds(s, l);
    near(b.product, 0.2 / 3);
    near(b.powerMinDb, -20 * Math.log10(1 + 0.2 / 3));
    near(b.powerMaxDb, -20 * Math.log10(1 - 0.2 / 3));
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i <= 3600; i++) {
      const loss = -10 * Math.log10(gt(0.2, 1 / 3, (i / 3600) * 2 * Math.PI));
      lo = Math.min(lo, loss);
      hi = Math.max(hi, loss);
    }
    near(b.lossMinDb, lo, 1e-9);
    near(b.lossMaxDb, hi, 1e-9);
    // hand values: 0.1773 + 0.5115 dB, then 20 log(1 ∓ 0.0667)
    expect(b.lossMinDb.toFixed(3)).toBe('0.090');
    expect(b.lossMaxDb.toFixed(3)).toBe('1.249');
    expect(b.powerMinDb.toFixed(3)).toBe('-0.561');
    expect(b.powerMaxDb.toFixed(3)).toBe('0.599');
  });

  it('agrees with the Fluke power-error form 1 − 1/(1 ± |Γs||Γl|)²', () => {
    const b = mismatchBounds(m('gamma', 0.3), m('gamma', 0.5));
    near(10 ** (b.powerMinDb / 10), 1 / (1.15 * 1.15), 1e-12);
    near(10 ** (b.powerMaxDb / 10), 1 / (0.85 * 0.85), 1e-12);
  });

  it('equal mismatches can cancel (conjugate match): minimum loss 0 dB', () => {
    const b = mismatchBounds(m('vswr', 3), m('vswr', 3));
    near(b.lossMinDb + 1, 1, 1e-12);
  });

  it('a matched source leaves only the load mismatch loss', () => {
    const l = m('vswr', 2);
    const b = mismatchBounds(m('vswr', 1), l);
    expect(b.product).toBe(0);
    near(b.lossMinDb, l.ml);
    near(b.lossMaxDb, l.ml);
    expect(b.powerMinDb + 0).toBe(0);
  });

  it('total reflection at one end delivers no power', () => {
    const b = mismatchBounds(m('gamma', 1), m('vswr', 2));
    expect(b.lossMinDb).toBe(Infinity);
    expect(b.lossMaxDb).toBe(Infinity);
    const c = mismatchBounds(m('gamma', 1), m('gamma', 1));
    expect(c.powerMaxDb).toBe(Infinity);
    expect(c.lossMinDb).toBe(Infinity);
  });
});

describe('cascaded VSWR', () => {
  it('2.5:1 and 2:1 give 5:1 at most and 1.25:1 at least', () => {
    const c = cascadeBounds(m('vswr', 2.5), m('vswr', 2));
    near(c.vswrMax, 5);
    near(c.vswrMin, 1.25);
    near(c.gammaMax, m('vswr', 5).gamma, 1e-12);
    near(c.gammaMin, m('vswr', 1.25).gamma, 1e-12);
    // the order of the two ports does not matter
    const d = cascadeBounds(m('vswr', 2), m('vswr', 2.5));
    near(d.vswrMin, 1.25);
  });

  it('matches a sweep of a load with VSWR S2 behind an impedance step of ratio S1', () => {
    for (const [s1, s2] of [[1.3, 1.8], [2, 2], [3, 1.1], [1.05, 4]]) {
      const z0 = 50, z1 = 50 * s1;
      let lo = Infinity, hi = 0;
      for (let i = 0; i < 7200; i++) {
        // load with VSWR s2 relative to z1 at phase θ: ZL = z1 (1 + Γ)/(1 − Γ)
        const th = (i / 7200) * 2 * Math.PI, g = (s2 - 1) / (s2 + 1);
        const gr = g * Math.cos(th), gi = g * Math.sin(th);
        const dr = 1 - gr, di = -gi, den = dr * dr + di * di;
        const zr = (z1 * ((1 + gr) * dr + gi * di)) / den, zi = (z1 * (gi * dr - (1 + gr) * di)) / den;
        const s = fromImpedance(zr, zi, z0)!.vswr;
        lo = Math.min(lo, s);
        hi = Math.max(hi, s);
      }
      const c = cascadeBounds(m('vswr', s1), m('vswr', s2));
      near(c.vswrMax, hi, 1e-6);
      near(c.vswrMin, lo, 1e-6);
    }
  });

  it('a total reflection on either side stays a total reflection', () => {
    const c = cascadeBounds(m('gamma', 1), m('vswr', 1.5));
    expect(c.vswrMax).toBe(Infinity);
    expect(c.vswrMin).toBe(Infinity);
    expect(c.gammaMin).toBe(1);
  });

  it('a perfect match on one side leaves the other unchanged', () => {
    const c = cascadeBounds(m('vswr', 1), m('vswr', 1.7));
    near(c.vswrMax, 1.7);
    near(c.vswrMin, 1.7);
  });
});
