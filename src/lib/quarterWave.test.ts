import { describe, expect, it } from 'vitest';
import { microstripHJ, striplineWheeler } from './closedform';
import { cAbs, cx, cAdd, cInv } from './matching';
import {
  binom, binomialBandwidth, binomialZ, cascadeGamma, chebyshevDesign, chebyshevPoly, chebyshevT, exactBand, lineZin, microstripWidth, quarterWaveMm, quarterWaveZ, singleBandwidth,
  singleStub, smallReflectionGamma, striplineWidth, stubLengthForB, stubLengthForX, stubMatchZin, stubX,
} from './quarterWave';

const near = (a: number, b: number, rel = 1e-9) => expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.abs(b) * rel + 1e-15);

describe('transmission line', () => {
  it('a λ/4 line inverts the load and a λ/2 line repeats it', () => {
    const z = lineZin(50, cx(100, 30), Math.PI / 2);
    const inv = cInv(cx(100, 30));
    near(z.re, 2500 * inv.re, 1e-12);
    near(z.im, 2500 * inv.im, 1e-12);
    const h = lineZin(50, cx(100, 30), Math.PI);
    near(h.re, 100, 1e-12);
    near(h.im, 30, 1e-12);
  });

  it('gives the quarter wavelength from εeff', () => {
    near(quarterWaveMm(1e9, 1), 299792458 / 4e9 * 1e3, 1e-12);
    near(quarterWaveMm(1e9, 4), 299792458 / 8e9 * 1e3, 1e-12);
  });
});

describe('single-section quarter-wave transformer (Pozar §5.4)', () => {
  // 10 Ω load on a 50 Ω line, SWR ≤ 1.5 (Γm = 0.2): Z1 = 22.36 Ω and Δf/f0 = 29 %
  it('matches the 10 Ω to 50 Ω example', () => {
    near(quarterWaveZ(50, 10), 22.36, 1e-3);
    // 2 − (4/π) acos(0.2/√0.96 · 2√500/40) = 0.2929
    near(singleBandwidth(50, 10, 0.2), 0.2929, 1e-3);
    expect(Math.round(singleBandwidth(50, 10, 0.2) * 100)).toBe(29);
  });

  it('the bandwidth formula agrees with the exact cascade at the band edge', () => {
    for (const [z0, zl, gm] of [[50, 10, 0.2], [50, 200, 0.1], [75, 50, 0.05]]) {
      const bw = singleBandwidth(z0, zl, gm);
      const z1 = quarterWaveZ(z0, zl);
      near(cAbs(cascadeGamma(z0, zl, [z1], 1 - bw / 2)), gm, 1e-9);
      near(cAbs(cascadeGamma(z0, zl, [z1], 1 + bw / 2)), gm, 1e-9);
      expect(cAbs(cascadeGamma(z0, zl, [z1], 1))).toBeLessThan(1e-12);
      near(exactBand(z0, zl, [z1], gm).bandwidth, bw, 1e-9);
    }
  });

  it('reports the whole band when Γm exceeds the mismatch', () => {
    expect(singleBandwidth(50, 55, 0.2)).toBe(Infinity);
    expect(exactBand(50, 55, [quarterWaveZ(50, 55)], 0.2).bandwidth).toBe(2);
    expect(Number.isNaN(singleBandwidth(50, 50, 0.1))).toBe(true);
  });
});

describe('binomial transformer (Pozar §5.6)', () => {
  // three sections, 50 Ω load on a 100 Ω line, Γm = 0.05: Z = 91.7, 70.7, 54.5 Ω and Δf/f0 = 70 %
  it('matches the three-section example', () => {
    const z = binomialZ(100, 50, 3);
    near(z[0], 91.7, 1e-3);
    near(z[1], 70.7, 1e-3);
    near(z[2], 54.5, 1e-3);
    // A = 2^−4 ln(0.5) = −0.0433; 2 − (4/π) acos[½ (0.05/0.0433)^(1/3)] = 0.703
    near(binomialBandwidth(100, 50, 3, 0.05), 0.703, 2e-3);
    expect(Math.round(binomialBandwidth(100, 50, 3, 0.05) * 100)).toBe(70);
  });

  it('ends exactly on ZL and is maximally flat at f0', () => {
    const z = binomialZ(50, 150, 4);
    // the next step after ZN must land on ZL: ln(ZL/ZN) = 2^−N C(N, N) ln(ZL/Z0)
    near(Math.log(150 / z[3]), Math.log(3) / 16, 1e-12);
    expect(cAbs(cascadeGamma(50, 150, z, 1))).toBeLessThan(1e-12);
    // maximally flat in the small-reflection model: |Γ| grows as (Δθ)^N near f0
    const g1 = cAbs(smallReflectionGamma(50, 150, z, 1.01)), g2 = cAbs(smallReflectionGamma(50, 150, z, 1.02));
    near(g2 / g1, 2 ** 4, 1e-3);
    // the exact cascade stays below the small-reflection band-edge value inside the band
    expect(cAbs(cascadeGamma(50, 150, z, 0.9))).toBeLessThan(0.01);
  });

  it('the small-reflection sum equals 2^−N ½ ln(ZL/Z0) (1 + e^−2jθ)^N', () => {
    const z = binomialZ(50, 100, 3);
    const fr = 0.7, th = (Math.PI / 2) * fr;
    const g = cAbs(smallReflectionGamma(50, 100, z, fr));
    near(g, 2 ** -3 * 0.5 * Math.log(2) * (2 * Math.abs(Math.cos(th))) ** 3, 1e-12);
  });

  it('binomial coefficients', () => {
    expect([0, 1, 2, 3, 4, 5].map((k) => binom(5, k))).toEqual([1, 5, 10, 10, 5, 1]);
  });
});

describe('Chebyshev transformer (Pozar §5.7)', () => {
  it('Chebyshev polynomials', () => {
    expect(chebyshevPoly(1)).toEqual([0, 1]);
    expect(chebyshevPoly(2)).toEqual([-1, 0, 2]);
    expect(chebyshevPoly(3)).toEqual([0, -3, 0, 4]);
    expect(chebyshevPoly(4)).toEqual([1, 0, -8, 0, 8]);
    for (const x of [-1.5, -0.3, 0.2, 0.9, 1.4]) near(chebyshevT(4, x), 8 * x ** 4 - 8 * x ** 2 + 1, 1e-12);
    near(chebyshevT(3, -1.3), 4 * (-1.3) ** 3 - 3 * -1.3, 1e-12);
  });

  // three sections, 100 Ω load on a 50 Ω line, Γm = 0.05: sec θm = 1.408, θm = 44.7°, Δf/f0 = 101 %,
  // Γ0 = A sec³θm / 2, Γ1 = 3A (sec³θm − sec θm) / 2
  it('matches the three-section example', () => {
    const d = chebyshevDesign(50, 100, 3, 0.05)!;
    near(d.secThetaM, 1.408, 1e-3);
    near((d.thetaM * 180) / Math.PI, 44.7, 2e-3);
    near(d.bandwidth, 1.01, 0.01);
    const s = d.secThetaM;
    near(d.gammas[0], (0.05 * s ** 3) / 2, 1e-12);
    near(d.gammas[1], (3 * 0.05 * (s ** 3 - s)) / 2, 1e-12);
    near(d.gammas[0], 0.0698, 0.005);
    near(d.gammas[1], 0.1037, 0.005);
    near(d.z[1], 70.71, 1e-3); // centre section of a symmetric design is √(Z0 ZL)
    near(d.z[0] * d.z[2], 5000, 1e-12);
  });

  it('ends on ZL and keeps the approximate ripple at Γm', () => {
    for (const n of [2, 3, 4, 5]) {
      const d = chebyshevDesign(50, 200, n, 0.05)!;
      near(d.z[n - 1] * Math.exp(2 * d.gammas[n]), 200, 1e-12);
      // small-reflection response: |Γ| ≤ Γm across the passband, = Γm at the band edges
      const frM = (2 * d.thetaM) / Math.PI;
      for (let fr = frM; fr <= 1; fr += 0.01) expect(cAbs(smallReflectionGamma(50, 200, d.z, fr))).toBeLessThanOrEqual(0.05 * (1 + 1e-9));
      near(cAbs(smallReflectionGamma(50, 200, d.z, frM)), 0.05, 1e-9);
      // the exact cascade stays close to the design (small-reflection theory)
      const band = exactBand(50, 200, d.z, 0.05);
      near(band.bandwidth, d.bandwidth, 0.05);
      expect(band.peak).toBeLessThan(0.06);
    }
  });

  it('declines when Γm is above the unmatched reflection', () => {
    expect(chebyshevDesign(50, 55, 3, 0.1)).toBeNull();
  });
});

describe('closed-form trace synthesis', () => {
  it('inverts Hammerstad–Jensen and Wheeler', () => {
    const m = microstripWidth(50, 0.2, 0.035, 4.2)!;
    near(microstripHJ(m.w, 0.2, 0.035, 4.2).z0, 50, 1e-9);
    const s = striplineWidth(35, 0.2, 0.035, 3.7)!;
    near(striplineWheeler(s.w, 0.435, 0.035, 3.7).z0, 35, 1e-9);
    expect(s.eeff).toBe(3.7);
    expect(microstripWidth(500, 0.2, 0.035, 4.2)).toBeNull();
  });
});

describe('stubs (Pozar §2.3)', () => {
  it('input reactance of open and short stubs', () => {
    near(stubX('short', 50, Math.PI / 4), 50, 1e-12);
    near(stubX('open', 50, Math.PI / 4), -50, 1e-12);
    expect(stubX('short', 50, Math.PI / 2)).toBe(Infinity);
    expect(Math.abs(stubX('open', 50, Math.PI / 2))).toBeLessThan(1e-9);
  });

  it('length for a target reactance round-trips', () => {
    for (const end of ['open', 'short'] as const) {
      for (const x of [-200, -20, 0.5, 35, 900]) {
        const bl = stubLengthForX(end, 50, x);
        expect(bl).toBeGreaterThan(0);
        expect(bl).toBeLessThan(Math.PI);
        near(stubX(end, 50, bl), x, 1e-9);
      }
      for (const b of [-0.05, -0.001, 0.001, 0.03]) {
        const bl = stubLengthForB(end, 1 / 50, b);
        near(-1 / stubX(end, 50, bl), b, 1e-9);
      }
    }
  });
});

describe('single-stub shunt matching (Pozar §5.2, Example 5.2)', () => {
  // ZL = 60 − j80 Ω on 50 Ω: d1 = 0.110 λ, d2 = 0.260 λ, y = 1 ± j1.47
  it('matches the example positions and susceptances', () => {
    const sols = singleStub(50, cx(60, -80), 50, 'open');
    expect(sols).toHaveLength(2);
    near(sols[0].d, 0.110, 0.005);
    near(sols[1].d, 0.260, 0.005);
    near(sols[0].b * 50, 1.47, 0.005);
    near(sols[1].b * 50, -1.47, 0.005);
    // the stub cancels it: short stub 0.095 λ / 0.405 λ, open stub 0.345 λ / 0.155 λ
    const shorts = singleStub(50, cx(60, -80), 50, 'short');
    near(shorts[0].l, 0.095, 0.01);
    near(shorts[1].l, 0.405, 0.01);
    near(sols[0].l, 0.345, 0.01);
    near(sols[1].l, 0.155, 0.01);
  });

  it('round-trips to Z0 for both stub types and other stub impedances', () => {
    for (const zl of [cx(60, -80), cx(15, 10), cx(200, 0), cx(50, 40), cx(10, -100)]) {
      for (const end of ['open', 'short'] as const) {
        for (const zs of [50, 30, 90]) {
          const sols = singleStub(50, zl, zs, end);
          expect(sols.length).toBeGreaterThan(0);
          for (const m of sols) {
            const zin = stubMatchZin(50, zl, zs, end, m, 1);
            near(zin.re, 50, 1e-9);
            expect(Math.abs(zin.im)).toBeLessThan(1e-7);
            // the line admittance real part is Y0 at d
            near(cInv(lineZin(50, zl, 2 * Math.PI * m.d)).re, 1 / 50, 1e-9);
          }
        }
      }
    }
  });

  it('handles RL = Z0 (one finite root plus d = λ/4) and an already matched load', () => {
    const s = singleStub(50, cx(50, 40), 50, 'open');
    expect(s).toHaveLength(2);
    near(s[0].d, 0.25, 1e-12);
    near(s[1].d, (Math.PI + Math.atan(-0.4)) / (2 * Math.PI), 1e-12);
    const m = singleStub(50, cx(50, 0), 50, 'short');
    expect(m).toHaveLength(1);
    expect(m[0].d).toBe(0);
    expect(cAbs(cAdd(stubMatchZin(50, cx(50), 50, 'short', m[0], 1), cx(-50)))).toBeLessThan(1e-9);
    expect(singleStub(50, cx(0, 40), 50, 'open')).toHaveLength(0);
  });
});
