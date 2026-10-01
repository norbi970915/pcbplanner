import { describe, expect, it } from 'vitest';
import {
  combineSnrDb,
  decodePoints,
  encodePoints,
  enobFromSnr,
  gaussTail,
  integratePhaseNoise,
  jitterBudget,
  jitterForSnr,
  jitterSnrDb,
  parseFrequency,
  parseList,
  parsePastedPoints,
  phaseJitterRad,
  phaseJitterSeconds,
  powerLawArea,
  qFromBer,
  snrFromEnob,
  type PnPoint,
} from './jitter';

const near = (a: number, b: number, rel = 1e-12) => expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.abs(b) * rel);
const P = (rows: number[][]): PnPoint[] => rows.map(([f, l]) => ({ f, l }));
/** a value printed with `decimals` decimals in the source, allowing `ulp` units of the last digit (0.5 = correctly rounded) */
const printed = (v: number, shown: number, decimals: number, ulp = 0.5) => expect(Math.abs(v - shown)).toBeLessThanOrEqual(ulp * 10 ** -decimals + 1e-12);

function ok(r: ReturnType<typeof integratePhaseNoise>) {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('ADI MT-008 worked examples', () => {
  it('Figure 5: −150 dBc/Hz flat from 10 kHz to 200 MHz at 100 MHz gives −67 dBc, 6.32e-4 rad, about 1 ps', () => {
    const r = ok(integratePhaseNoise(P([[1e4, -150], [2e8, -150]]), 100e6, 1e4, 2e8));
    near(r.dbc, -150 + 10 * Math.log10(2e8 - 1e4));
    printed(r.dbc, -67, 0);
    printed(r.rad * 1e4, 6.32, 2);
    printed(r.seconds * 1e12, 1, 0);
  });

  it('Figure 7: Wenzel ULN 100 MHz oscillator, 0.01 + 0.002 + 0.063 ps, 0.064 ps in total', () => {
    const r = ok(integratePhaseNoise(P([[100, -125], [1e3, -150], [1e4, -174], [2e8, -174]]), 100e6, 100, 2e8));
    const ps = r.segments.map((s) => s.jitter * 1e12);
    printed(ps[0], 0.01, 2);
    printed(ps[1], 0.002, 3);
    printed(ps[2], 0.063, 3, 1); // 0.0635 printed as 0.063 in MT-008
    printed(r.seconds * 1e12, 0.064, 3);
    // the total is the root-sum-square of the segment jitters
    near(r.seconds, Math.hypot(...r.segments.map((s) => s.jitter)), 1e-12);
  });

  it('Figure 7: Wenzel Sprinter 100 MHz oscillator, 0.02 + 0.003 + 0.18 ps, 0.18 ps in total', () => {
    const r = ok(integratePhaseNoise(P([[100, -120], [1e3, -150], [1e4, -165], [2e8, -165]]), 100e6, 100, 2e8));
    const ps = r.segments.map((s) => s.jitter * 1e12);
    printed(ps[0], 0.02, 2);
    printed(ps[1], 0.003, 3);
    printed(ps[2], 0.18, 2);
    printed(r.seconds * 1e12, 0.18, 2);
  });

  it('Figure 11: ADF4360-1 at 2.25 GHz integrated to 4.5 GHz gives 1.57 ps', () => {
    const pts = P([[100, -82], [1e3, -80], [1e4, -77], [1e5, -112], [1e6, -134], [1e7, -146], [4.5e9, -146]]);
    const r = ok(integratePhaseNoise(pts, 2.25e9, 100, 4.5e9));
    const ps = r.segments.map((s) => s.jitter * 1e12);
    [0.28, 1.21, 0.89, 0.07, 0.03, 0.34].forEach((v, i) => printed(ps[i], v, 2));
    printed(r.seconds * 1e12, 1.57, 2);
  });
});

describe('dBc to jitter conversion', () => {
  it('Skyworks AN279: −54.46 dBc at 160 MHz is 0.00268 rad and 2.663 ps', () => {
    // −54.46 dBc is itself rounded to 0.01 dB (±0.06 % in jitter), so compare to 0.1 %
    near(phaseJitterSeconds(-54.46, 160e6) * 1e12, 2.663, 1e-3);
    expect(Math.abs(phaseJitterRad(-54.46) - 0.00268)).toBeLessThan(1e-5);
  });
});

describe('exact power-law integration', () => {
  it('a −20 dB/decade line matches the closed form L1·f1²·(1/fa − 1/fb)', () => {
    const l1 = 1e-9; // −90 dBc/Hz at 1 kHz
    const r = ok(integratePhaseNoise(P([[1e3, -90], [1e6, -150]]), 1e8, 2e3, 5e5));
    near(r.segments[0].slope, -20);
    near(r.area, l1 * 1e6 * (1 / 2e3 - 1 / 5e5), 1e-12);
  });

  it('a −10 dB/decade line integrates to a logarithm, L1·f1·ln(fb/fa)', () => {
    const r = ok(integratePhaseNoise(P([[1e3, -100], [1e5, -120]]), 1e8, 1e3, 1e5));
    near(r.segments[0].slope, -10);
    near(r.area, 1e-10 * 1e3 * Math.log(100), 1e-12);
    // slopes on either side of −10 dB/decade converge to the logarithm
    const lo = powerLawArea(1e-10, 1e3, -1 - 1e-9, 1e3, 1e5);
    const hi = powerLawArea(1e-10, 1e3, -1 + 1e-9, 1e3, 1e5);
    near(lo, 1e-10 * 1e3 * Math.log(100), 1e-7);
    near(hi, 1e-10 * 1e3 * Math.log(100), 1e-7);
  });

  it('a flat line is level × bandwidth and a partial band integrates only the overlap', () => {
    const r = ok(integratePhaseNoise(P([[1e3, -140], [1e7, -140]]), 1e8, 12e3, 5e6));
    near(r.area, 1e-14 * (5e6 - 12e3), 1e-12);
  });

  it('splitting a segment with an extra point on the same line changes nothing', () => {
    const a = ok(integratePhaseNoise(P([[1e3, -90], [1e6, -150]]), 1e8, 1e3, 1e6));
    const b = ok(integratePhaseNoise(P([[1e3, -90], [1e4, -110], [1e6, -150]]), 1e8, 1e3, 1e6));
    near(a.area, b.area, 1e-12);
  });
});

describe('edge cases', () => {
  it('sorts unsorted points', () => {
    const a = ok(integratePhaseNoise(P([[1e4, -165], [100, -120], [2e8, -165], [1e3, -150]]), 1e8, 100, 2e8));
    expect(a.points.map((p) => p.f)).toEqual([100, 1e3, 1e4, 2e8]);
    printed(a.seconds * 1e12, 0.18, 2);
  });

  it('rejects a single point, duplicates and non-positive offsets', () => {
    expect(integratePhaseNoise(P([[1e3, -100]]), 1e8, 1e3, 1e6).ok).toBe(false);
    expect(integratePhaseNoise(P([[1e3, -100], [1e3, -110]]), 1e8, 1e3, 1e3).ok).toBe(false);
    expect(integratePhaseNoise(P([[0, -100], [1e3, -110]]), 1e8, 1, 1e3).ok).toBe(false);
    expect(integratePhaseNoise(P([[1e3, -100], [1e4, -110]]), 0, 1e3, 1e4).ok).toBe(false);
    expect(integratePhaseNoise(P([[1e3, -100], [1e4, -110]]), 1e8, 1e4, 1e3).ok).toBe(false);
  });

  it('refuses a band below the first point and, unless allowed, above the last', () => {
    const pts = P([[1e3, -100], [1e6, -150]]);
    const below = integratePhaseNoise(pts, 1e8, 100, 1e6);
    expect(below.ok).toBe(false);
    if (!below.ok) expect(below.error).toMatch(/below the first point/);
    expect(integratePhaseNoise(pts, 1e8, 1e3, 2e7).ok).toBe(false);
  });

  it('holds the last level flat above the last point when extension is allowed', () => {
    const r = ok(integratePhaseNoise(P([[1e3, -100], [1e6, -150]]), 1e8, 1e3, 2e7, true));
    expect(r.extended).toBe(true);
    const last = r.segments[r.segments.length - 1];
    expect(last.extended).toBe(true);
    near(last.area, 1e-15 * (2e7 - 1e6), 1e-12);
    // a band wholly above the data uses the extension alone
    const hi = ok(integratePhaseNoise(P([[1e3, -100], [1e6, -150]]), 1e8, 1e3, 1e6, true));
    expect(hi.extended).toBe(false);
  });

  it('never returns a non-finite result', () => {
    const r = integratePhaseNoise(P([[1e3, -1e6], [1e6, -1e6]]), 1e8, 1e3, 1e6);
    expect(r.ok).toBe(false);
  });
});

describe('URL encoding of the point list', () => {
  it('round-trips, keeps the order and stays compact', () => {
    const pts = P([[12e3, -150.5], [1e3, -120], [20e6, -165], [2.25e9, -146.25], [100, -82]]);
    const text = encodePoints(pts);
    expect(text).toBe('12000:-150.5,1e3:-120,2e7:-165,2.25e9:-146.25,100:-82');
    expect(decodePoints(text)).toEqual(pts);
    expect(decodePoints(encodePoints(decodePoints(text)!))).toEqual(pts);
  });

  it('rejects malformed text', () => {
    expect(decodePoints('1e3:-90,abc')).toBeNull();
    expect(decodePoints('1e3:-90:4')).toBeNull();
    expect(decodePoints('1e3')).toBeNull();
    expect(decodePoints('')).toEqual([]);
  });
});

describe('typed and pasted input', () => {
  it('reads SI suffixes', () => {
    expect(parseFrequency('12k')).toBe(12e3);
    expect(parseFrequency('1.5 MHz')).toBe(1.5e6);
    expect(parseFrequency('2e7')).toBe(2e7);
    expect(parseFrequency('100 Hz')).toBe(100);
    expect(parseFrequency('4.5G')).toBe(4.5e9);
    expect(parseFrequency('1m')).toBeNull();
    expect(parseFrequency('k')).toBeNull();
  });

  it('parses pasted lines and reports bad ones', () => {
    const { points, errors } = parsePastedPoints('100, -82\n1k\t-80\n\n10 kHz -77 dBc/Hz\n100k; -112\nfoo, bar\n1M,-134,5');
    expect(points).toEqual(P([[100, -82], [1e3, -80], [1e4, -77], [1e5, -112]]));
    expect(errors).toHaveLength(2);
  });
});

describe('jitter-limited ADC SNR', () => {
  it('SNR = −20 log10(2π fin σ) and back', () => {
    near(jitterSnrDb(100e6, 1e-12), -20 * Math.log10(2 * Math.PI * 1e-4));
    near(jitterForSnr(100e6, jitterSnrDb(100e6, 0.3e-12)), 0.3e-12, 1e-12);
    near(enobFromSnr(snrFromEnob(12)), 12);
    near(snrFromEnob(12), 74);
  });

  it('TI SLWA034: 78.9 dBFS from the clock and 72.4 dBFS from the ADC combine to 71.5 dBFS', () => {
    printed(combineSnrDb(78.9, 72.4), 71.5, 1);
  });
});

describe('Q(BER) and total jitter', () => {
  it('reproduces the Renesas AN-815 Table 1 multipliers N = 2Q', () => {
    const table: [number, number, number][] = [
      [3, 6.18, 2], [4, 7.438, 3], [5, 8.53, 2], [6, 9.507, 3], [7, 10.399, 3], [8, 11.224, 3], [9, 11.996, 3],
      [10, 12.723, 3], [11, 13.412, 3], [12, 14.069, 3], [13, 14.698, 3], [14, 15.301, 3], [15, 15.883, 3], [16, 16.444, 3],
    ];
    for (const [e, n, d] of table) printed(2 * qFromBer(10 ** -e), n, d);
  });

  it('gives Q = 7.034 at 1e-12 and 6.706 at 1e-11, and inverts the Gaussian tail', () => {
    printed(qFromBer(1e-12), 7.034, 3);
    printed(qFromBer(1e-11), 6.706, 3);
    for (const q of [1, 2, 3.5, 7, 9]) near(qFromBer(gaussTail(q)), q, 1e-9);
    near(gaussTail(0), 0.5, 1e-14);
    // the series and the continued fraction meet at q = 2√2 without a step
    near(gaussTail(2 * Math.SQRT2 - 1e-9), gaussTail(2 * Math.SQRT2 + 1e-9), 1e-7);
    near(gaussTail(2 * Math.SQRT2), 0.00233886749052, 1e-9); // standard normal tail at 2.828427
    expect(Number.isNaN(qFromBer(0))).toBe(true);
    expect(Number.isNaN(qFromBer(0.6))).toBe(true);
  });

  it('adds random terms as RSS and deterministic terms linearly', () => {
    const b = jitterBudget([3, 4], [10, 5], 1e-12);
    near(b.rj, 5);
    near(b.dj, 15);
    near(b.tj, 15 + 2 * qFromBer(1e-12) * 5);
    printed(b.rjPp, 70.34, 2);
  });

  it('parses term lists', () => {
    expect(parseList('0.5, 0.3 1.2')).toEqual([0.5, 0.3, 1.2]);
    expect(parseList('')).toEqual([]);
    expect(parseList('1, x')).toBeNull();
    expect(parseList('-1')).toBeNull();
  });
});
