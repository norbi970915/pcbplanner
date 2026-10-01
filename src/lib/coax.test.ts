import { describe, expect, it } from 'vitest';
import { coaxLine, coaxLoss, coaxZ0, eccArg, EPS0, geometryError, geometryFactor, MU0, NP_TO_DB, solveInner, solveOuter } from './coax';
import { C0, ETA0 } from './units';

const near = (a: number, b: number, rel = 1e-12) => expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.abs(b) * rel);

describe('constants', () => {
  it('μ0 and ε0 follow from c and η0 (CODATA 2018 μ0 = 1.25663706212e-6, ε0 = 8.8541878128e-12)', () => {
    near(MU0, 1.25663706212e-6, 1e-10);
    near(EPS0, 8.8541878128e-12, 1e-10);
    near(1 / Math.sqrt(MU0 * EPS0), C0, 1e-14);
    near(NP_TO_DB, 8.685889638, 1e-9);
  });
});

describe('concentric coax', () => {
  it('Z0 = η0/(2π√εr) ln(D/d): D/d = e in air gives η0/2π ≈ 59.96 Ω', () => {
    near(coaxZ0(Math.E, 1, 1), ETA0 / (2 * Math.PI));
    expect(coaxZ0(Math.E, 1, 1).toFixed(3)).toBe('59.958');
  });

  it('D/d = 3.5 with εr 2.25 gives 50.08 Ω; D/d = 2.3 in air gives 49.94 Ω', () => {
    expect(coaxZ0(3.5, 1, 2.25).toFixed(2)).toBe('50.08');
    expect(coaxZ0(2.3, 1, 1).toFixed(2)).toBe('49.94');
  });

  it('only the ratio D/d matters', () => {
    near(coaxZ0(3, 0.9, 2.1), coaxZ0(30, 9, 2.1));
  });

  it('line constants are consistent: Z0 = √(L/C), v = 1/√(LC) = c/√εr', () => {
    const l = coaxLine(3, 0.9, 2.1);
    near(Math.sqrt(l.lPerM / l.cPerM), l.z0, 1e-12);
    near(1 / Math.sqrt(l.lPerM * l.cPerM), C0 / Math.sqrt(2.1), 1e-12);
    near(l.delay, Math.sqrt(2.1) / C0);
    near(l.vf, 1 / Math.sqrt(2.1));
  });

  it('C\' = 2π ε0 εr / ln(D/d): 55.63 pF/m in air at D/d = e; L\' = 0.2 µH/m', () => {
    const l = coaxLine(Math.E, 1, 1);
    expect((l.cPerM * 1e12).toFixed(2)).toBe('55.63');
    near(l.lPerM, 2e-7, 1e-9);
  });

  it('solves D or d for a target Z0 (round trip)', () => {
    for (const z of [25, 50, 75, 93, 120]) {
      for (const er of [1, 2.1, 2.25, 4]) {
        near(coaxZ0(solveOuter(z, 0.9, er), 0.9, er), z, 1e-12);
        near(coaxZ0(3, solveInner(z, 3, er), er), z, 1e-12);
      }
    }
    near(solveOuter(ETA0 / (2 * Math.PI), 1, 1), Math.E);
  });
});

describe('TE11 cutoff', () => {
  it('fc = c/(π√εr (D + d)/2), Pozar kc ≈ 2/(a + b)', () => {
    // D = 3 mm, d = 0.9 mm, εr = 2.1: (D + d)/2 = 1.95 mm
    const fc = coaxLine(3, 0.9, 2.1).te11;
    near(fc, C0 / (Math.PI * Math.sqrt(2.1) * 1.95e-3));
    expect((fc / 1e9).toFixed(2)).toBe('33.77');
    // in air with D + d = 2 · 10 mm the cutoff wavelength is π · 10 mm
    near(C0 / coaxLine(15, 5, 1).te11, Math.PI * 0.01, 1e-12);
  });
});

/**
 * Independent check of the eccentric formula with the image method: two line charges ±λ on the axis through both
 * centres, placed at the points that are mutually inverse in both circles, make both circles equipotentials.
 * Outer circle centre (0,0) radius b, inner circle centre (s,0) radius a.
 */
function imageGeometryFactor(a: number, b: number, s: number) {
  // p q = b² and (p − s)(q − s) = a²  →  s p² − (b² + s² − a²) p + s b² = 0
  const k = b * b + s * s - a * a;
  const roots = [(k - Math.sqrt(k * k - 4 * s * s * b * b)) / (2 * s), (k + Math.sqrt(k * k - 4 * s * s * b * b)) / (2 * s)];
  const p = roots.find((r) => Math.abs(r - s) < a)!; // +λ inside the inner conductor
  const q = (b * b) / p; // −λ outside the outer conductor
  // potential in units of λ/(2πε): φ = ln(|z − q| / |z − p|)
  const phi = (x: number, y: number) => Math.log(Math.hypot(x - q, y) / Math.hypot(x - p, y));
  const inner: number[] = [], outer: number[] = [];
  for (let i = 0; i < 12; i++) {
    const t = (i / 12) * 2 * Math.PI;
    inner.push(phi(s + a * Math.cos(t), a * Math.sin(t)));
    outer.push(phi(b * Math.cos(t), b * Math.sin(t)));
  }
  return { inner, outer, g: inner[0] - outer[0] };
}

describe('offset (eccentric) centre conductor', () => {
  it('reduces to ln(D/d) at zero offset', () => {
    near(eccArg(3, 0.9, 0), Math.cosh(Math.log(3 / 0.9)), 1e-15);
    near(geometryFactor(3, 0.9, 1e-12), Math.log(3 / 0.9), 1e-12);
  });

  it('agrees with an image-charge solution of the eccentric cylinders', () => {
    for (const [D, d, s] of [[3, 0.9, 0.3], [3, 0.9, 1.0], [10, 1, 4.4], [2, 1.5, 0.2], [5, 2, 0.01]]) {
      const img = imageGeometryFactor(d / 2, D / 2, s);
      // both circles are equipotentials
      for (const v of img.inner) near(v, img.inner[0], 1e-9);
      for (const v of img.outer) near(v, img.outer[0], 1e-9);
      near(geometryFactor(D, d, s), img.g, 1e-9);
    }
  });

  it('matches McDonald\'s small-offset expansion Z0 ≈ 60 (ln(b/a) − δ²/(b² − a²))', () => {
    const a = 0.45, b = 1.5, dl = 0.02;
    const approx = Math.log(b / a) - (dl * dl) / (b * b - a * a);
    near(geometryFactor(2 * b, 2 * a, dl), approx, 1e-6);
  });

  it('lowers Z0 as the offset grows, towards 0 when the conductors touch', () => {
    const z = [0, 0.2, 0.5, 0.9, 1.04].map((s) => coaxZ0(3, 0.9, 2.1, s));
    for (let i = 1; i < z.length; i++) expect(z[i]).toBeLessThan(z[i - 1]);
    expect(coaxZ0(3, 0.9, 1, 1.05 - 1e-9)).toBeLessThan(0.1);
  });

  it('is precise when the gap is tiny (no acosh cancellation)', () => {
    // u = x − 1 small: acosh(1 + u) ≈ √(2u)
    const D = 2, d = 1, s = 0.5 - 1e-10;
    const u = ((D - d - 2 * s) * (D - d + 2 * s)) / (2 * D * d);
    near(geometryFactor(D, d, s), Math.sqrt(2 * u) * (1 - u / 12), 1e-8);
  });

  it('solves D or d for a target Z0 with an offset (round trip)', () => {
    for (const z of [10, 30, 50, 75]) {
      for (const s of [0.05, 0.3, 0.8]) {
        const D = solveOuter(z, 0.9, 2.1, s);
        expect(geometryError(D, 0.9, s)).toBeNull();
        near(coaxZ0(D, 0.9, 2.1, s), z, 1e-10);
        const d = solveInner(z, 3, 2.1, s);
        expect(geometryError(3, d, s)).toBeNull();
        near(coaxZ0(3, d, 2.1, s), z, 1e-10);
      }
    }
  });

  it('the line constants stay consistent with an offset', () => {
    const l = coaxLine(3, 0.9, 2.1, 0.4);
    near(Math.sqrt(l.lPerM / l.cPerM), l.z0, 1e-12);
    near(l.z0, coaxZ0(3, 0.9, 2.1, 0.4));
  });
});

describe('geometry validation', () => {
  it('rejects impossible geometries', () => {
    expect(geometryError(3, 0.9)).toBeNull();
    expect(geometryError(3, 0)).not.toBeNull();
    expect(geometryError(0, 1)).not.toBeNull();
    expect(geometryError(1, 1)).not.toBeNull();
    expect(geometryError(0.9, 3)).not.toBeNull();
    expect(geometryError(3, 0.9, -0.1)).not.toBeNull();
    expect(geometryError(3, 0.9, 1.05)).not.toBeNull();
    expect(geometryError(3, 0.9, 1.0499)).toBeNull();
    expect(geometryError(Number.NaN, 0.9)).not.toBeNull();
    expect(geometryError(Infinity, 0.9)).not.toBeNull();
  });
});

describe('attenuation', () => {
  it('copper (58 MS/m) at 1 GHz: Rs = 8.25 mΩ, skin depth 2.09 µm', () => {
    const l = coaxLoss(3, 0.9, 2.1, 0, 58e6, 1e9);
    expect((l.rs * 1e3).toFixed(2)).toBe('8.25');
    expect((l.skin * 1e6).toFixed(2)).toBe('2.09');
    near(l.rs, 1 / (58e6 * l.skin), 1e-12);
    expect(l.alphaD).toBe(0);
  });

  it('αc = R/(2 Z0) with R = Rs/(2π)(1/a + 1/b) (Pozar Table 2.1 and §2.7)', () => {
    const l = coaxLoss(3, 0.9, 2.1, 0, 58e6, 1e9);
    near(l.alphaC, l.rPerM / (2 * coaxZ0(3, 0.9, 2.1)), 1e-12);
    // hand value: Rs = 8.2503 mΩ, R = 8.2503e-3/(2π) (1/0.45e-3 + 1/1.5e-3) = 3.793 Ω/m, Z0 = 49.82 Ω → 0.3307 dB/m
    expect((l.rPerM).toFixed(3)).toBe('3.793');
    expect((l.alphaC * NP_TO_DB).toFixed(3)).toBe('0.331');
  });

  it('αd = π f √εr tanδ / c, i.e. 27.29 √εr tanδ / λ0 dB per metre', () => {
    const l = coaxLoss(3, 0.9, 2.1, 2e-4, 58e6, 1e9);
    near(l.alphaD, (Math.PI * 1e9 * Math.sqrt(2.1) * 2e-4) / C0);
    near(l.alphaD * NP_TO_DB, (Math.PI * NP_TO_DB * Math.sqrt(2.1) * 2e-4) / (C0 / 1e9), 1e-12);
    expect((l.alphaD * NP_TO_DB).toFixed(4)).toBe('0.0264');
  });

  it('conductor loss scales with √f and dielectric loss with f', () => {
    const a = coaxLoss(3, 0.9, 2.1, 1e-3, 58e6, 1e8), b = coaxLoss(3, 0.9, 2.1, 1e-3, 58e6, 4e8);
    near(b.alphaC / a.alphaC, 2, 1e-12);
    near(b.alphaD / a.alphaD, 4, 1e-12);
  });

  it('there is an optimum D/d ≈ 3.59 for lowest conductor loss at fixed D', () => {
    // minimise (1 + D/d)/ln(D/d): the root of ln x = 1 + 1/x is x = 3.5911
    let best = 0, lowest = Infinity;
    for (let x = 2; x <= 6; x += 0.0005) {
      const a = coaxLoss(10, 10 / x, 1, 0, 58e6, 1e9).alphaC;
      if (a < lowest) {
        lowest = a;
        best = x;
      }
    }
    expect(best).toBeGreaterThan(3.58);
    expect(best).toBeLessThan(3.60);
  });
});
