import { describe, expect, it } from 'vitest';
import {
  besselPoles,
  cascadeAt,
  cascadeCorner,
  chebyshevCornerRatio,
  designFilter,
  designSection,
  filterCoefficients,
  idealStages,
  mfbHighPassC,
  passbandGain,
  prefAtLeast,
  prefNearest,
  prefNeighbors,
  requiredGbw,
  requiredSlewRate,
  sectionK,
  sectionPeak,
  sectionQ,
  stageF0Q,
  stageFromParts,
  type Coef,
  type FilterInput,
  type FilterResponse,
} from './activeFilter';
import { E_SERIES } from './electronics';

const near = (a: number, b: number, rel = 1e-9) => expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.abs(b) * rel + 1e-15);
const DB3 = -10 * Math.log10(2); // −3.0103 dB

// TI SLOA088 tables 16-4 to 16-9, orders 1–8, as printed: [a, b, Q] per section (Q blank → 0).
type Row = [number, number, number];
const TI: Record<FilterResponse, Row[][]> = {
  bessel: [
    [[1, 0, 0]],
    [[1.3617, 0.618, 0.58]],
    [[0.756, 0, 0], [0.9996, 0.4772, 0.69]],
    [[1.3397, 0.4889, 0.52], [0.7743, 0.389, 0.81]],
    [[0.6656, 0, 0], [1.1402, 0.4128, 0.56], [0.6216, 0.3245, 0.92]],
    [[1.2217, 0.3887, 0.51], [0.9686, 0.3505, 0.61], [0.5131, 0.2756, 1.02]],
    [[0.5937, 0, 0], [1.0944, 0.3395, 0.53], [0.8304, 0.3011, 0.66], [0.4332, 0.2381, 1.13]],
    [[1.1112, 0.3162, 0.51], [0.9754, 0.2979, 0.56], [0.7202, 0.2621, 0.71], [0.3728, 0.2087, 1.23]],
  ],
  butterworth: [
    [[1, 0, 0]],
    [[1.4142, 1, 0.71]],
    [[1, 0, 0], [1, 1, 1]],
    [[1.8478, 1, 0.54], [0.7654, 1, 1.31]],
    [[1, 0, 0], [1.618, 1, 0.62], [0.618, 1, 1.62]],
    [[1.9319, 1, 0.52], [1.4142, 1, 0.71], [0.5176, 1, 1.93]],
    [[1, 0, 0], [1.8019, 1, 0.55], [1.247, 1, 0.8], [0.445, 1, 2.25]],
    [[1.9616, 1, 0.51], [1.6629, 1, 0.6], [1.1111, 1, 0.9], [0.3902, 1, 2.56]],
  ],
  cheb05: [
    [[1, 0, 0]],
    [[1.3614, 1.3827, 0.86]],
    [[1.8636, 0, 0], [0.064, 1.1931, 1.71]], // a2 printed as 0.0640; Q = 1.71 and the poles give 0.6402
    [[2.6282, 3.4341, 0.71], [0.3648, 1.1509, 2.94]],
    [[2.9235, 0, 0], [1.3025, 2.3534, 1.18], [0.229, 1.0833, 4.54]],
    [[3.8645, 6.9797, 0.68], [0.7528, 1.8573, 1.81], [0.1589, 1.0711, 6.51]],
    [[4.0211, 0, 0], [1.8729, 4.1795, 1.09], [0.4861, 1.5676, 2.58], [0.1156, 1.0443, 8.84]],
    [[5.1117, 11.9607, 0.68], [1.0639, 2.9365, 1.61], [0.3439, 1.4206, 3.47], [0.0885, 1.0407, 11.53]],
  ],
  cheb1: [
    [[1, 0, 0]],
    [[1.3022, 1.5515, 0.96]],
    [[2.2156, 0, 0], [0.5442, 1.2057, 2.02]],
    [[2.5904, 4.1301, 0.78], [0.3039, 1.1697, 3.56]],
    [[3.5711, 0, 0], [1.128, 2.4896, 1.4], [0.1872, 1.0814, 5.56]],
    [[3.8437, 8.5529, 0.76], [0.6292, 1.9124, 2.2], [0.1296, 1.0766, 8]],
    [[4.952, 0, 0], [1.6338, 4.4899, 1.3], [0.3987, 1.5834, 3.16], [0.0937, 1.0432, 10.9]], // b4 printed 1.0432; the poles and TI's own k = 1.520 give 1.0423
    [[5.1019, 14.7608, 0.75], [0.8916, 3.0426, 1.96], [0.2806, 1.4334, 4.27], [0.0717, 1.0432, 14.24]],
  ],
  cheb2: [
    [[1, 0, 0]],
    [[1.1813, 1.7775, 1.13]],
    [[2.7994, 0, 0], [0.43, 1.2036, 2.55]],
    [[2.4025, 4.9862, 0.93], [0.2374, 1.1896, 4.59]],
    [[4.6345, 0, 0], [0.909, 2.6036, 1.78], [0.1434, 1.075, 7.23]],
    [[3.588, 10.4648, 0.9], [0.4925, 1.9622, 2.84], [0.0995, 1.0826, 10.46]],
    [[6.476, 0, 0], [1.3258, 4.7649, 1.65], [0.3067, 1.5927, 4.12], [0.0714, 1.0384, 14.28]],
    [[4.7743, 18.151, 0.89], [0.6991, 3.1353, 2.53], [0.2153, 1.4449, 5.58], [0.0547, 1.0461, 18.39]], // Q4 printed 18.39; a, b give 18.70
  ],
  cheb3: [
    [[1, 0, 0]],
    [[1.065, 1.9305, 1.3]],
    [[3.3496, 0, 0], [0.3559, 1.1923, 3.07]],
    [[2.1853, 5.5339, 1.08], [0.1964, 1.2009, 5.58]],
    [[5.6334, 0, 0], [0.762, 2.653, 2.14], [0.1172, 1.0686, 8.82]],
    [[3.2721, 11.6773, 1.04], [0.4077, 1.9873, 3.46], [0.0815, 1.0861, 12.78]],
    [[7.9064, 0, 0], [1.1159, 4.8963, 1.98], [0.2515, 1.5944, 5.02], [0.0582, 1.0348, 17.46]],
    [[4.3583, 20.2948, 1.03], [0.5791, 3.1808, 3.08], [0.1765, 1.4507, 6.83], [0.0448, 1.0478, 22.87]],
  ],
};
const RESPONSES = Object.keys(TI) as FilterResponse[];

describe('filter coefficients against TI SLOA088 tables 16-4 to 16-9', () => {
  for (const r of RESPONSES)
    for (let n = 1; n <= 8; n++)
      it(`${r} order ${n}`, () => {
        const c = filterCoefficients(r, n);
        const t = TI[r][n - 1];
        expect(c.length).toBe(t.length);
        c.forEach((s, i) => {
          const [a, b, q] = t[i];
          if (r === 'cheb05' && n === 3 && i === 1) expect(s.a).toBeCloseTo(0.6402, 4); // TI misprint 0.0640
          else expect(Math.abs(s.a - a)).toBeLessThanOrEqual(5.5e-5);
          if (r === 'cheb1' && n === 7 && i === 3) expect(s.b).toBeCloseTo(1.0423, 4); // TI misprint 1.0432
          else expect(Math.abs(s.b - b)).toBeLessThanOrEqual(5.5e-5);
          if (r === 'cheb2' && n === 8 && i === 3) expect(sectionQ(s)).toBeCloseTo(18.70, 1); // TI misprint 18.39
          else expect(Math.abs(sectionQ(s) - q)).toBeLessThanOrEqual(0.0051);
        });
      });

  it('reproduces the k = fci/fc column for spot checks', () => {
    // Butterworth 4th: 0.719, 1.390; Bessel 3rd: 1.323, 1.414; Chebyshev 3 dB 5th: 0.178, 0.917, 1.500
    expect(filterCoefficients('butterworth', 4).map(sectionK).map((k) => +k.toFixed(3))).toEqual([0.719, 1.39]);
    expect(filterCoefficients('bessel', 3).map(sectionK).map((k) => +k.toFixed(3))).toEqual([1.323, 1.414]);
    expect(filterCoefficients('cheb3', 5).map(sectionK).map((k) => +k.toFixed(3))).toEqual([0.178, 0.917, 1.5]);
  });

  it('orders the sections first-order first, then by rising Q', () => {
    for (const r of RESPONSES)
      for (let n = 1; n <= 8; n++) {
        const c = filterCoefficients(r, n);
        expect(c.filter((s) => s.b === 0).length).toBe(n % 2);
        if (n % 2) expect(c[0].b).toBe(0);
        for (let i = 1; i < c.length; i++) expect(sectionQ(c[i])).toBeGreaterThanOrEqual(sectionQ(c[i - 1]));
      }
  });

  it('rejects invalid orders', () => {
    expect(() => filterCoefficients('butterworth', 0)).toThrow();
    expect(() => filterCoefficients('butterworth', 9)).toThrow();
    expect(() => filterCoefficients('butterworth', 2.5)).toThrow();
  });
});

describe('exact responses of the normalised filters', () => {
  const at = (r: FilterResponse, n: number, kind: 'lowpass' | 'highpass', f: number) => {
    const st = idealStages(filterCoefficients(r, n), kind, 1000, []);
    return cascadeAt(st, f).mag;
  };

  it('is 3.0103 dB below the passband at fc for every response, order and kind', () => {
    for (const r of RESPONSES)
      for (let n = 1; n <= 8; n++)
        for (const kind of ['lowpass', 'highpass'] as const) expect(20 * Math.log10(at(r, n, kind, 1000))).toBeCloseTo(DB3, 9);
  });

  it('Butterworth is maximally flat: |H|² = 1/(1 + Ω^2n)', () => {
    for (let n = 1; n <= 8; n++) for (const w of [0.1, 0.5, 2, 5]) near(at('butterworth', n, 'lowpass', 1000 * w), 1 / Math.sqrt(1 + w ** (2 * n)), 1e-9);
  });

  it('Chebyshev passband ripple equals the rated ripple and ends at the ripple-band edge', () => {
    for (const r of ['cheb05', 'cheb1', 'cheb2', 'cheb3'] as const) {
      const rip = { cheb05: 0.5, cheb1: 1, cheb2: 2, cheb3: 3 }[r];
      for (let n = 2; n <= 8; n++) {
        const edge = 1000 / chebyshevCornerRatio(n, rip);
        let hi = -Infinity;
        let lo = Infinity;
        for (let i = 0; i <= 4000; i++) {
          const db = 20 * Math.log10(at(r, n, 'lowpass', (edge * i) / 4000 + 1e-9));
          hi = Math.max(hi, db);
          lo = Math.min(lo, db);
        }
        expect(hi - lo).toBeCloseTo(rip, 3);
        // even order: DC sits at a trough, so the peaks are +ripple above the DC gain
        expect(hi).toBeCloseTo(n % 2 ? 0 : rip, 3);
        expect(20 * Math.log10(at(r, n, 'lowpass', edge))).toBeCloseTo(n % 2 ? -rip : 0, 9);
      }
    }
  });

  it('high-pass mirrors low-pass about fc', () => {
    for (const r of RESPONSES) for (const w of [0.3, 0.9, 1.7]) near(at(r, 5, 'highpass', 1000 / w), at(r, 5, 'lowpass', 1000 * w), 1e-9);
  });

  it('group delay equals −dφ/dω and the Bessel delay is flat at low frequency', () => {
    const st = idealStages(filterCoefficients('cheb1', 6), 'lowpass', 1000, []);
    for (const f of [100, 700, 1200]) {
      const h = 1e-3;
      const d = -(cascadeAt(st, f + h).phase - cascadeAt(st, f - h).phase) / (2 * Math.PI * 2 * h);
      near(cascadeAt(st, f).delay, d, 1e-5);
    }
    // Bessel poles are maximally flat in delay: within 0.1 % up to 0.2 fc for 4th order
    const be = idealStages(filterCoefficients('bessel', 4), 'lowpass', 1000, []);
    near(cascadeAt(be, 200).delay, cascadeAt(be, 1).delay, 1e-3);
  });

  it('Bessel polynomial roots satisfy the polynomial (order 4: s⁴ + 10s³ + 45s² + 105s + 105)', () => {
    for (const [re, im] of besselPoles(4)) {
      // evaluate the polynomial at the root
      let pr = 1;
      let pi = 0;
      for (const k of [10, 45, 105, 105]) {
        const nr = pr * re - pi * im + k;
        pi = pr * im + pi * re;
        pr = nr;
      }
      expect(Math.hypot(pr, pi)).toBeLessThan(1e-9);
    }
  });

  it('phase is continuous and ends at −90°·n for a low-pass', () => {
    const st = idealStages(filterCoefficients('butterworth', 5), 'lowpass', 1000, []);
    expect((cascadeAt(st, 1e7).phase * 180) / Math.PI).toBeCloseTo(-450, 0);
    expect((cascadeAt(st, 1000).phase * 180) / Math.PI).toBeCloseTo(-225, 9);
  });
});

describe('TI SLOA088 worked examples', () => {
  const c = (a: number, b: number): Coef => ({ a, b });

  it('example 16-1: first-order unity gain, fc = 1 kHz, C1 = 47 nF', () => {
    expect(designSection(c(1, 0), 'lp1', 1000, { C1: 47e-9 }).R1).toBeCloseTo(3386, 0); // TI: 3.38 kΩ
    expect(designSection(c(0.756, 0), 'lp1', 1000, { C1: 47e-9 }).R1).toBeCloseTo(2560, -1); // TI: 2.56 kΩ
  });

  // TI prints R1 = 1.26 kΩ and R2 = 1.30 kΩ. Their sum (2.56 kΩ) matches, but the split depends on a
  // near-zero discriminant: evaluating TI's own equation gives 1.235 kΩ and 1.333 kΩ, and only these
  // reproduce a = 1.065, b = 1.9305 (TI's values give a = 1.062, b = 1.921).
  it('example 16-2: 2nd-order 3 dB Chebyshev Sallen-Key, 3 kHz, 22 nF / 150 nF', () => {
    const k = c(1.065, 1.9305);
    expect(22e-9 * (4 * k.b) / k.a ** 2).toBeLessThan(150e-9); // TI: C2 ≥ 150 nF (149.8 nF)
    const p = designSection(k, 'lp-sk', 3000, { C1: 22e-9, C2: 150e-9 });
    expect((p.R1 + p.R2) / 1e3).toBeCloseTo(2.56, 1);
    expect(p.R1 / 1e3).toBeCloseTo(1.235, 3);
    expect(p.R2 / 1e3).toBeCloseTo(1.333, 3);
    const s = stageFromParts('lp-sk', p);
    const wc = 2 * Math.PI * 3000;
    near(s.d1 * wc, 1.065);
    near(s.d2 * wc * wc, 1.9305);
  });

  it('example 16-3: 5th-order Butterworth 50 kHz', () => {
    expect(designSection(c(1, 0), 'lp1', 50e3, { C1: 1e-9 }).R1 / 1e3).toBeCloseTo(3.18, 2);
    expect(820e-12 * 4 / 1.618 ** 2).toBeCloseTo(1.253e-9, 11); // TI: 1.26 nF, rounded up to 1.5 nF
    const s2 = designSection(c(1.618, 1), 'lp-sk', 50e3, { C1: 820e-12, C2: 1.5e-9 });
    expect(s2.R1 / 1e3).toBeCloseTo(1.87, 2);
    expect(s2.R2 / 1e3).toBeCloseTo(4.42, 2);
    const s3 = designSection(c(0.618, 1), 'lp-sk', 50e3, { C1: 330e-12, C2: 4.7e-9 });
    expect(s3.R1 / 1e3).toBeCloseTo(1.45, 2);
    expect(s3.R2 / 1e3).toBeCloseTo(4.51, 2);
    // TI's 1 % values 3.16 k, 1.87 k, 4.42 k, 1.47 k, 4.53 k are the nearest E96 values
    expect([3183, 1872, 4415, 1452, 4508].map((r) => prefNearest(r, 'E96'))).toEqual([3160, 1870, 4420, 1470, 4530]);
  });

  it('example 16-4: 3rd-order Bessel high-pass 1 kHz, 100 nF → 2.105 kΩ; 3.18 kΩ, 1.67 kΩ', () => {
    expect(designSection(c(0.756, 0), 'hp1', 1000, { C1: 100e-9 }).R1 / 1e3).toBeCloseTo(2.105, 3);
    const p = designSection(c(0.9996, 0.4772), 'hp-sk', 1000, { C1: 100e-9 });
    expect(p.R1 / 1e3).toBeCloseTo(3.18, 2);
    expect(p.R2 / 1e3).toBeCloseTo(1.67, 2);
  });

  it('op amp bandwidth rule: 5th-order 3 dB Chebyshev 10 kHz, gain 2 → 17 MHz; Butterworth unity → 1.5 MHz', () => {
    expect(requiredGbw(c(0.1172, 1.0686), 10e3, 2) / 1e6).toBeCloseTo(17, 0);
    expect(requiredGbw(filterCoefficients('butterworth', 5)[2], 10e3, 1) / 1e6).toBeCloseTo(1.5, 1);
    near(requiredGbw(c(1.8478, 1), 1e3, 1), 100 * 1e3 * sectionK(c(1.8478, 1)));
  });

  it('slew rate rule: 5 Vpp at 100 kHz needs 1.57 V/µs', () => {
    expect(requiredSlewRate(5, 100e3) / 1e6).toBeCloseTo(1.57, 2);
  });
});

describe('section transfer functions from parts reproduce the target coefficients', () => {
  const fc = 2500;
  const wc = 2 * Math.PI * fc;
  const check = (circuit: Parameters<typeof stageFromParts>[0], k: Coef, caps: Record<string, number>, g = 1) => {
    const p = designSection(k, circuit, fc, caps, g);
    const s = stageFromParts(circuit, p);
    if (circuit.startsWith('lp')) {
      near(s.d1 * wc, k.a, 1e-9);
      near(s.d2 * wc * wc, k.b, 1e-9);
    } else if (k.b === 0) near(s.d0 / wc, k.a, 1e-9);
    else {
      near(s.d1 / wc, k.a, 1e-9);
      near(s.d0 / (wc * wc), k.b, 1e-9);
    }
    return s;
  };
  const k = { a: 0.7654, b: 1 };

  it('Sallen-Key low-pass (unity gain)', () => expect(check('lp-sk', k, { C1: 10e-9, C2: 100e-9 }).gain).toBe(1));
  it('MFB low-pass with gain −2.2', () => near(check('lp-mfb', k, { C1: 10e-9, C2: 330e-9 }, 2.2).gain, -2.2));
  it('Sallen-Key high-pass (unity gain, equal C)', () => expect(check('hp-sk', k, { C1: 10e-9 }).gain).toBe(1));
  it('MFB high-pass with gain −C/C2', () => near(check('hp-mfb', k, { C1: 10e-9, C2: 4.7e-9 }, 2).gain, -10 / 4.7));
  it('first-order sections', () => {
    check('lp1', { a: 0.6656, b: 0 }, { C1: 1e-9 });
    check('hp1', { a: 0.6656, b: 0 }, { C1: 1e-9 });
  });

  it('refuses a Sallen-Key C2 below the 4b/a² limit', () => {
    expect(() => designSection(k, 'lp-sk', fc, { C1: 10e-9, C2: 10e-9 })).toThrow();
  });

  it('Q and f0 of the realised section', () => {
    const s = stageFromParts('lp-sk', { R1: 10e3, R2: 10e3, C1: 10e-9, C2: 20e-9 });
    near(stageF0Q(s).f0, 1 / (2 * Math.PI * Math.sqrt(1e8 * 2e-16)));
    near(stageF0Q(s).q, Math.sqrt(1e8 * 2e-16) / (10e-9 * 20e3));
  });

  it('peak gain of a section is Q²/√(Q² − ¼)', () => {
    const q = 3;
    const st = idealStages([{ a: 1 / q, b: 1 }], 'lowpass', 1000, []);
    let peak = 0;
    for (let i = 0; i < 20000; i++) peak = Math.max(peak, cascadeAt(st, 800 + i * 0.02).mag);
    expect(peak).toBeCloseTo(sectionPeak(q), 6);
  });
});

describe('standard values', () => {
  it('E6 is every other E12 value', () => {
    for (const v of [1.5e-9, 2.2e-9, 33e-9, 470e-12]) expect(prefNearest(v, 'E6')).toBe(v);
    expect(E_SERIES.E12.filter((_, i) => i % 2 === 0)).toEqual([100, 150, 220, 330, 470, 680]);
    expect(prefNeighbors(1.26e-9, 'E6')).toEqual({ below: 1e-9, above: 1.5e-9 });
    expect(prefAtLeast(3.46e-9, 'E6')).toBe(4.7e-9); // TI example 16-3 third filter
    expect(prefAtLeast(1.5e-9, 'E6')).toBe(1.5e-9);
  });
});

describe('full design', () => {
  const base: FilterInput = { kind: 'lowpass', response: 'butterworth', order: 5, fc: 50e3, topology: 'sallen-key', mfbGain: 1, capMode: 'auto', rLevel: 10e3, cFixed: 1e-9, rSeries: 'E96', cSeries: 'E12' };

  it('keeps the realised corner close to the target with E96 resistors', () => {
    const d = designFilter(base);
    expect(d.sections.length).toBe(3);
    expect(Math.abs(d.fcReal / 50e3 - 1)).toBeLessThan(0.02);
    near(d.gainIdeal, 1);
    near(cascadeCorner(d.ideal, 'lowpass', 50e3), 50e3, 1e-9);
    for (const s of d.sections) expect(s.capRatio).toBeGreaterThanOrEqual(s.minRatio * (1 - 1e-6));
  });

  it('auto capacitors put the resistors that set f0 near the resistance level', () => {
    for (const kind of ['lowpass', 'highpass'] as const)
      for (const topology of ['sallen-key', 'mfb'] as const) {
        const d = designFilter({ ...base, kind, topology, response: 'cheb1', order: 6, mfbGain: 2, rSeries: 'E96', cSeries: 'E24' });
        for (const s of d.sections) {
          const r = s.circuit === 'lp-mfb' ? Math.sqrt(s.std.R2 * s.std.R3) : Math.sqrt(s.std.R1 * s.std.R2);
          expect(r / 10e3).toBeGreaterThan(0.75);
          expect(r / 10e3).toBeLessThan(1.33);
        }
      }
  });

  it('MFB high-pass picks capacitors whose ratio is closest to the gain', () => {
    const c = mfbHighPassC(15e-9, 2, 'E12');
    expect(c / prefNearest(c / 2, 'E12')).toBeCloseTo(6.8 / 3.3, 9); // best E12 ratio near 2 within √10 of 15 nF
    expect(mfbHighPassC(10e-9, 2.2, 'E12') / prefNearest(mfbHighPassC(10e-9, 2.2, 'E12') / 2.2, 'E12')).toBeCloseTo(2.2, 9);
  });

  it('high-pass MFB with gain: passband gain is the product of the section gains', () => {
    const d = designFilter({ ...base, kind: 'highpass', topology: 'mfb', mfbGain: 2, order: 4, response: 'cheb1', capMode: 'fixed', cFixed: 10e-9 });
    near(d.gainIdeal, 4);
    near(passbandGain(d.real, 'highpass'), d.sections.reduce((g, s) => g * (s.std.C1 / s.std.C2), 1));
    expect(Math.abs(d.fcReal / 50e3 - 1)).toBeLessThan(0.05);
    expect(d.sections.every((s) => s.gbw === null)).toBe(true);
  });

  it('low-pass MFB inverts each section and needs C2/C1 ≥ 4b(1 + |A0|)/a²', () => {
    const d = designFilter({ ...base, topology: 'mfb', mfbGain: 1, order: 4 });
    expect(d.sections.every((s) => s.real.gain < 0)).toBe(true);
    for (const s of d.sections) expect(s.capRatio).toBeGreaterThanOrEqual((8 * s.coef.b) / s.coef.a ** 2 - 1e-9);
  });

  it('rejects invalid inputs', () => {
    expect(() => designFilter({ ...base, fc: 0 })).toThrow();
    expect(() => designFilter({ ...base, capMode: 'fixed', cFixed: 0 })).toThrow();
    expect(() => designFilter({ ...base, topology: 'mfb', mfbGain: 0 })).toThrow();
  });
});
