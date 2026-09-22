import { describe, expect, it } from 'vitest';
import { acResistance, ALPHA20, dcResistance, onderdonk, RHO20, rhoCu, skinDepth } from './copper';

describe('audit: copper', () => {
  it('resistivity and temperature coefficient', () => {
    // IEC 60028 (International Annealed Copper Standard): ρ20 = 1/58 Ω·mm²/m, α20 = 0.00393 /K.
    expect(RHO20).toBeCloseTo(1e-6 / 58, 12);
    expect(ALPHA20).toBe(0.00393);
    expect(rhoCu(120) / rhoCu(20)).toBeCloseTo(1.393, 6);
  });

  it('DC resistance: 1 m of 1 mm² at 20 °C = 17.24 mΩ', () => {
    // Direct consequence of IEC 60028: 1/58 Ω per m per mm².
    expect(dcResistance(1000, 1)).toBeCloseTo(0.017241, 5);
  });

  it('skin depth', () => {
    // δ = √(ρ/(π f µ)) (Ramo, Whinnery, Van Duzer). With IACS copper this gives the
    // common rule δ ≈ 66 µm/√f[MHz]: 66.1 µm at 1 MHz and 2.09 µm at 1 GHz.
    expect(skinDepth(1e6) * 1e6).toBeCloseTo(66.08, 1);
    expect(skinDepth(1e9) * 1e6).toBeCloseTo(2.090, 2);
    // Scales as 1/√f
    expect(skinDepth(4e9) / skinDepth(1e9)).toBeCloseTo(0.5, 9);
  });

  it('AC resistance model limits', () => {
    // DC limit: shell fills the conductor → Rac = Rdc
    expect(acResistance(100, 0.2, 0.035, 1).ratio).toBeCloseTo(1, 9);
    expect(acResistance(100, 0.2, 0.035, 0).ratio).toBe(1);
    // high-frequency limit: area → perimeter·δ − 4δ² (hand-derived from the model)
    const r = acResistance(100, 0.2, 0.035, 1e10);
    const d = r.skinDepthMm;
    expect(r.ratio).toBeCloseTo((0.2 * 0.035) / (0.2 * 0.035 - (0.2 - 2 * d) * (0.035 - 2 * d)), 9);
  });

  it('Onderdonk constant agrees with Brooks & Adam derivation (t = 0.0213·(A/I)² at 20 °C)', () => {
    // D. Brooks, J. Adam, "Who were Preece and Onderdonk?", PCD&F, 2015, Eq. 17:
    // for Ta = 20 °C, t = c·(A/I)² with c = 0.0213 (A in circular mils).
    // Onderdonk's own constants give c = log10(...)/33 = 0.02167, within 2 %.
    const cmil = 1000;
    const areaMm2 = (cmil * Math.PI) / 4 * 0.0254 * 0.0254;
    const i = onderdonk(areaMm2, 1, 20);
    const c = (i / cmil) ** 2;
    expect(Math.abs(c / 0.0213 - 1)).toBeLessThan(0.02);
    // exact Onderdonk: I = A·√(log10((Tm−Ta)/(234+Ta)+1)/(33 t))
    expect(i).toBeCloseTo(cmil * Math.sqrt(Math.log10((1084.62 - 20) / 254 + 1) / 33), 9);
  });

  it('Onderdonk: I ∝ 1/√t and ∝ A', () => {
    expect(onderdonk(0.01, 0.01) / onderdonk(0.01, 1)).toBeCloseTo(10, 9);
    expect(onderdonk(0.02, 1) / onderdonk(0.01, 1)).toBeCloseTo(2, 9);
  });
});
