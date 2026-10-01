import { describe, expect, it } from 'vitest';
import { NTC_PARTS, partById, tableR } from '../data/ntcParts';
import {
  adcCode, alpha, betaFromPoints, bitsValid, codeV, dividerV, dRdT, fitSteinhartHart, kPerLsb, localBeta, lookupTable, lsb, lutC, lutCsv, resistance, rFromV, rsMaxSlope,
  rsMaxSpan, rsThreePoint, rsTurningPoint, rsTurningPointBeta, selfHeating, sensitivity, shMonotonic, temperature, tFromCode, thermistorPower, toC, toK, toleranceBand,
  type BetaModel, type Divider, type NtcModel, type ShModel,
} from './ntc';

const near = (a: number, b: number, abs: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(abs);
const vishay = partById('vishay')!;
const tdk = partById('tdk')!;
const murata = partById('murata')!;
const R = (part: typeof vishay, tC: number) => tableR(part, tC)!;
const fitFrom = (part: typeof vishay, temps: number[]) => {
  const f = fitSteinhartHart(temps.map((t) => ({ t: toK(t), r: R(part, t) })));
  if (!f.ok) throw new Error(f.error);
  return f.model;
};
const beta10k: BetaModel = { kind: 'beta', r0: 10e3, t0: toK(25), beta: 3977 };
const div: Divider = { position: 'low', rs: 10e3, vs: 3.3, vref: 3.3, bits: 12 };

describe('datasheet data', () => {
  it('tables reproduce the B values stated by each manufacturer (within 1 K)', () => {
    const b = (part: typeof vishay, t1: number, t2: number) => betaFromPoints(toK(t1), R(part, t1), toK(t2), R(part, t2));
    near(b(vishay, 25, 85), 3977, 1); // Vishay B25/85
    near(b(tdk, 25, 100), 3988, 1); // TDK B25/100 (R/T 8016)
    near(b(murata, 25, 50), 3380, 1); // Murata B25/50
    near(b(murata, 25, 85), 3434, 1); // Murata reference B25/85
    near(b(murata, 25, 100), 3455, 1); // Murata reference B25/100
  });

  it('every table is 10 kΩ at 25 °C and falls monotonically', () => {
    for (const p of NTC_PARTS) {
      if (!p.table) continue;
      expect(R(p, 25)).toBe(10e3);
      for (let i = 1; i < p.table.length; i++) expect(p.table[i][1]).toBeLessThan(p.table[i - 1][1]);
    }
  });

  it('every preset fit temperature is in its table', () => {
    for (const p of NTC_PARTS) if (p.table) for (const t of p.fit) expect(tableR(p, t)).toBeGreaterThan(0);
  });
});

describe('Steinhart–Hart fit', () => {
  for (const part of [vishay, tdk, murata]) {
    it(`${part.name}: passes through the three fit points to < 0.01 °C`, () => {
      const m = fitFrom(part, part.fit);
      for (const t of part.fit) near(toC(temperature(m, R(part, t))), t, 0.01);
      for (const t of part.fit) near(resistance(m, toK(t)) / R(part, t), 1, 1e-9);
    });
  }

  it('Vishay NTCLE100E3103 fitted at −40/25/125 °C stays within 0.06 °C of the whole −40…125 °C table', () => {
    const m = fitFrom(vishay, [-40, 25, 125]);
    for (const [t, r] of vishay.table!) if (t <= 125) near(toC(temperature(m, r)), t, 0.06);
  });

  it('Vishay fitted at 0/25/85 °C: within 0.02 °C inside the fit span', () => {
    const m = fitFrom(vishay, [0, 25, 85]);
    for (const [t, r] of vishay.table!) if (t >= 0 && t <= 85) near(toC(temperature(m, r)), t, 0.02);
  });

  it('TDK R/T 8016 fitted at −40/25/125 °C: within 0.03 °C from −40 to 125 °C', () => {
    const m = fitFrom(tdk, [-40, 25, 125]);
    for (const [t, r] of tdk.table!) if (t >= -40 && t <= 125) near(toC(temperature(m, r)), t, 0.03);
  });

  it('point order does not matter', () => {
    const a = fitFrom(vishay, [0, 25, 85]);
    const b = fitFrom(vishay, [85, 0, 25]);
    near(a.a, b.a, 1e-15);
    near(a.c, b.c, 1e-18);
  });

  it('an exact Beta curve fits with C = 0', () => {
    const f = fitSteinhartHart([-20, 25, 90].map((t) => ({ t: toK(t), r: resistance(beta10k, toK(t)) })));
    expect(f.ok).toBe(true);
    if (f.ok) {
      near(f.model.c, 0, 1e-15);
      near(f.model.b, 1 / 3977, 1e-12);
    }
  });

  it('rejects bad calibration data', () => {
    const ok = [{ t: toK(0), r: 30e3 }, { t: toK(25), r: 10e3 }, { t: toK(85), r: 1e3 }];
    expect(fitSteinhartHart(ok.slice(0, 2)).ok).toBe(false);
    expect(fitSteinhartHart([ok[0], ok[1], { t: toK(25), r: 9e3 }]).ok).toBe(false); // repeated T
    expect(fitSteinhartHart([ok[0], ok[1], { t: toK(85), r: 20e3 }]).ok).toBe(false); // not NTC
    expect(fitSteinhartHart([ok[0], ok[1], { t: toK(85), r: -1 }]).ok).toBe(false);
    expect(fitSteinhartHart([ok[0], ok[1], { t: 0, r: 1e3 }]).ok).toBe(false); // absolute zero
  });

  it('monotonic check', () => {
    const m = fitFrom(vishay, [-40, 25, 125]);
    expect(shMonotonic(m, 100, 1e6)).toBe(true);
    expect(shMonotonic({ kind: 'sh', a: 1e-3, b: 2e-4, c: -1e-5 }, 100, 1e6)).toBe(false);
  });
});

describe('model conversions', () => {
  const sh = fitFrom(vishay, [-40, 25, 125]);
  const models: NtcModel[] = [beta10k, sh];

  it('R → T → R and T → R → T round trips', () => {
    for (const m of models) {
      for (let tC = -80; tC <= 250; tC += 7.3) {
        const r = resistance(m, toK(tC));
        near(toC(temperature(m, r)), tC, 1e-9);
      }
      for (const r of [50, 330, 1e3, 10e3, 100e3, 1e6]) near(resistance(m, temperature(m, r)) / r, 1, 1e-12);
    }
  });

  it('Beta model: R(T0) = R0 and B from the model returns B', () => {
    near(resistance(beta10k, toK(25)), 10e3, 1e-9);
    near(betaFromPoints(toK(25), resistance(beta10k, toK(25)), toK(85), resistance(beta10k, toK(85))), 3977, 1e-9);
    near(localBeta(beta10k, toK(60)), 3977, 1e-9);
  });

  it('dR/dT matches a central difference for both models', () => {
    for (const m of models) {
      for (const tC of [-30, 25, 110]) {
        const h = 1e-3;
        const num = (resistance(m, toK(tC) + h) - resistance(m, toK(tC) - h)) / (2 * h);
        near(dRdT(m, toK(tC)) / num, 1, 1e-6);
      }
    }
  });

  it('the Steinhart–Hart local B of the Vishay part rises with temperature (B depends on the pair)', () => {
    expect(localBeta(sh, toK(0))).toBeLessThan(localBeta(sh, toK(100)));
  });

  it('edge cases: absolute zero, negative temperature in K, zero or negative resistance', () => {
    for (const m of models) {
      expect(resistance(m, 0)).toBeNaN();
      expect(resistance(m, -5)).toBeNaN();
      expect(resistance(m, NaN)).toBeNaN();
      expect(temperature(m, 0)).toBeNaN();
      expect(temperature(m, -100)).toBeNaN();
      expect(temperature(m, Infinity)).toBeNaN();
    }
    expect(resistance({ ...beta10k, r0: -1 }, 300)).toBeNaN();
    expect(betaFromPoints(300, 1e3, 300, 2e3)).toBeNaN();
    expect(betaFromPoints(300, -1e3, 320, 2e3)).toBeNaN();
  });
});

describe('divider and ADC', () => {
  it('low and high side voltages and the inverse', () => {
    near(dividerV(div, 10e3), 1.65, 1e-12);
    near(dividerV({ ...div, position: 'high' }, 30e3), 3.3 * 10e3 / 40e3, 1e-12);
    for (const position of ['low', 'high'] as const) {
      const d = { ...div, position };
      for (const r of [100, 3e3, 10e3, 300e3]) near(rFromV(d, dividerV(d, r)) / r, 1, 1e-12);
    }
  });

  it('ADC codes: LSB, rounding, clipping and bits 1…24', () => {
    near(lsb(div), 3.3 / 4096, 1e-15);
    expect(adcCode(div, 1.65)).toBe(2048);
    expect(adcCode(div, 5)).toBe(4095);
    expect(adcCode(div, -1)).toBe(0);
    expect(bitsValid(1) && bitsValid(24)).toBe(true);
    expect(bitsValid(0) || bitsValid(25) || bitsValid(12.5)).toBe(false);
    expect(adcCode({ ...div, bits: 1 }, 3.3)).toBe(1);
    expect(adcCode({ ...div, bits: 24 }, 3.3)).toBe(2 ** 24 - 1);
    expect(adcCode({ ...div, bits: 0 }, 1)).toBeNaN();
    expect(adcCode({ ...div, bits: 25 }, 1)).toBeNaN();
    near(codeV(div, 2048), 1.65, 1e-12);
  });

  it('code → temperature inverts temperature → code to within one LSB', () => {
    for (const tC of [-20, 25, 80]) {
      const v = dividerV(div, resistance(beta10k, toK(tC)));
      const t = toC(tFromCode(beta10k, div, adcCode(div, v)));
      near(t, tC, 0.6 * kPerLsb(beta10k, div, toK(tC)));
    }
    expect(tFromCode(beta10k, div, 0)).toBeNaN();
  });

  it('ratiometric: codes do not depend on the supply when Vref = Vs', () => {
    const r = resistance(beta10k, toK(40));
    expect(adcCode({ ...div, vs: 5, vref: 5 }, dividerV({ ...div, vs: 5, vref: 5 }, r))).toBe(adcCode(div, dividerV(div, r)));
  });

  it('sensitivity matches a numerical derivative, with opposite signs for the two positions', () => {
    for (const position of ['low', 'high'] as const) {
      const d = { ...div, position };
      const h = 1e-3, t = toK(30);
      const num = (dividerV(d, resistance(beta10k, t + h)) - dividerV(d, resistance(beta10k, t - h))) / (2 * h);
      near(sensitivity(beta10k, d, t) / num, 1, 1e-6);
    }
    expect(sensitivity(beta10k, div, toK(30))).toBeLessThan(0);
  });

  it('Rs = 0: no output change, infinite °C per LSB, no inverse', () => {
    const d = { ...div, rs: 0 };
    expect(dividerV(d, 10e3)).toBe(3.3);
    expect(sensitivity(beta10k, d, toK(25))).toBe(0);
    expect(kPerLsb(beta10k, d, toK(25))).toBe(Infinity);
    expect(rFromV(d, 1)).toBeNaN();
  });
});

describe('series resistor', () => {
  const sh = fitFrom(vishay, [-40, 25, 125]);
  const slopeAt = (m: NtcModel, rs: number, tK: number) => Math.abs(sensitivity(m, { ...div, rs }, tK));

  it('Rs = R(T) gives the largest slope at T (any model)', () => {
    for (const m of [beta10k, sh] as NtcModel[]) {
      const t = toK(40);
      const rs = rsMaxSlope(m, t);
      const best = slopeAt(m, rs, t);
      for (const k of [0.9, 0.99, 1.01, 1.1]) expect(slopeAt(m, rs * k, t)).toBeLessThan(best);
      // the maximum is Vs·B/(4T²) for the Beta model
      if (m.kind === 'beta') near(best, (3.3 * 3977) / (4 * t * t), 1e-12);
    }
  });

  it('Rs = R(T)(B − 2T)/(B + 2T) puts the steepest point of V(T) at T (Beta model)', () => {
    const t = toK(40);
    const rs = rsTurningPointBeta(resistance(beta10k, t), 3977, t);
    near(rs / rsTurningPoint(beta10k, t), 1, 1e-12);
    const s0 = slopeAt(beta10k, rs, t);
    for (const dt of [-2, -0.2, 0.2, 2]) expect(slopeAt(beta10k, rs, t + dt)).toBeLessThan(s0);
    // second derivative of V(T) is zero there
    const h = 0.01, V = (tt: number) => dividerV({ ...div, rs }, resistance(beta10k, tt));
    near((V(t + h) - 2 * V(t) + V(t - h)) / (h * h) / s0, 0, 1e-6);
  });

  it('the general turning-point formula also works for the Steinhart–Hart model', () => {
    const t = toK(60);
    const rs = rsTurningPoint(sh, t);
    const s0 = slopeAt(sh, rs, t);
    for (const dt of [-1, -0.1, 0.1, 1]) expect(slopeAt(sh, rs, t + dt)).toBeLessThan(s0);
  });

  it('√(R1·R2) maximises the output span; the three-point Rs puts V(Tmid) halfway', () => {
    const r1 = resistance(beta10k, toK(0)), r2 = resistance(beta10k, toK(50)), r3 = resistance(beta10k, toK(100));
    const span = (rs: number) => dividerV({ ...div, rs }, r1) - dividerV({ ...div, rs }, r3);
    const rs = rsMaxSpan(r1, r3);
    for (const k of [0.95, 1.05]) expect(span(rs * k)).toBeLessThan(span(rs));
    const rl = rsThreePoint(r1, r2, r3);
    const d = { ...div, rs: rl };
    near(dividerV(d, r2), (dividerV(d, r1) + dividerV(d, r3)) / 2, 1e-12);
    expect(rsThreePoint(1, 1, 1)).toBeNaN();
    expect(rsMaxSpan(-1, 5)).toBeNaN();
  });
});

describe('self-heating', () => {
  it('power peaks at Vs²/(4 Rs) when R = Rs; ΔT = P/δ', () => {
    near(thermistorPower(div, 10e3), (3.3 * 3.3) / 40e3, 1e-15);
    expect(thermistorPower(div, 5e3)).toBeLessThan(thermistorPower(div, 10e3));
    expect(thermistorPower(div, 20e3)).toBeLessThan(thermistorPower(div, 10e3));
    near(selfHeating(1e-3, 1e-3), 1, 1e-15);
    expect(selfHeating(1e-3, 0)).toBeNaN();
  });
});

describe('tolerance', () => {
  it("reproduces Vishay's example: ±5 % R25 and ±0.75 % B give 5.966 % at 0 °C", () => {
    const z = 1.05 * Math.exp(0.0075 * 3977 * (1 / toK(0) - 1 / toK(25))) - 1;
    near(z * 100, 5.966, 0.001);
    // Vishay quotes ΔR/R due to B tolerance 2.79 % at −40 °C (first order in ΔB)
    near(0.0075 * 3977 * (1 / toK(-40) - 1 / toK(25)) * 100, 2.79, 0.005);
  });

  it('gives −1.13 / +1.19 °C at 0 °C for the Vishay example (Vishay, linearised: ±1.17 °C)', () => {
    const sh = fitFrom(vishay, [-40, 25, 125]);
    const band = toleranceBand(sh, toK(0), 0.05, 0.0075, 3977);
    // Vishay: ΔT ≈ Z/TCR = 5.966/5.09 = 1.17 °C (linearised); the exact log form gives a little less
    near(band.high, 1.19, 0.01);
    near(band.low, -1.13, 0.01);
    // their mean matches the linearised 1.17 °C, and the model's α at 0 °C matches Vishay's TCR of −5.09 %/K
    near((band.high - band.low) / 2, 1.17, 0.02);
    near(100 * alpha(sh, toK(0)), -5.09, 0.01);
  });

  it('is zero without tolerance and only the R25 part at 25 °C', () => {
    const b0 = toleranceBand(beta10k, toK(70), 0, 0, 3977);
    near(b0.low, 0, 1e-9);
    near(b0.high, 0, 1e-9);
    const b25 = toleranceBand(beta10k, toK(25), 0.01, 0.01, 3977);
    const t = toK(25);
    near(b25.high, 1 / (1 / t + Math.log(0.99) / 3977) - t, 1e-9);
    expect(toleranceBand(beta10k, toK(25), 1.5, 0, 3977).low).toBeNaN();
  });
});

describe('lookup table', () => {
  it('builds rows, CSV and C arrays', () => {
    const rows = lookupTable(beta10k, div, -40, 125, 5)!;
    expect(rows.length).toBe(34);
    expect(rows[0].tC).toBe(-40);
    expect(rows[33].tC).toBe(125);
    expect(rows[13].code).toBe(2048); // 25 °C, R = Rs
    const csv = lutCsv(rows);
    expect(csv.split('\n')[0]).toBe('T_C,R_ohm,V_out_V,ADC_code');
    expect(csv).toContain('\n25,10000,1.65,2048\n');
    const c = lutC(rows, 12, ['test']);
    expect(c).toContain('static const uint16_t ntc_adc_code[NTC_TABLE_LEN] = {');
    expect(c).toContain('#define NTC_TABLE_LEN 34');
    expect(c).toContain('-400, -350');
    expect(lutC(rows, 8, []).includes('uint8_t')).toBe(true);
    expect(lutC(rows, 18, []).includes('uint32_t')).toBe(true);
  });

  it('handles fractional steps and rejects too many rows', () => {
    const rows = lookupTable(beta10k, div, 0, 1, 0.1)!;
    expect(rows.length).toBe(11);
    expect(rows[3].tC).toBe(0.3);
    expect(lookupTable(beta10k, div, 0, 1000, 0.1)).toBeNull();
    expect(lookupTable(beta10k, div, 10, 0, 1)).toBeNull();
    expect(lookupTable(beta10k, div, 0, 10, 0)).toBeNull();
  });

  it('never writes NaN into the text output', () => {
    const rows = lookupTable(beta10k, { ...div, bits: 0 }, 0, 10, 5)!;
    expect(lutCsv(rows)).not.toContain('NaN');
    expect(lutC(rows, 0, [])).not.toContain('NaN');
  });
});

describe('Steinhart–Hart inversion for unusual coefficients', () => {
  it('falls back to Newton when the cubic has three real roots', () => {
    // C < 0 within the monotonic region
    const m: ShModel = { kind: 'sh', a: 1.1e-3, b: 2.4e-4, c: -1e-8 };
    for (const r of [1e3, 10e3, 100e3]) near(resistance(m, temperature(m, r)) / r, 1, 1e-10);
  });
});
