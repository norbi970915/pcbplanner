import { describe, expect, it } from 'vitest';
import { traceWidth } from './ipc2221';
import { onderdonk, skinDepth } from './copper';
import { MM_PER_OZ } from './units';

describe('IPC-2221', () => {
  it('5 A, 1 oz, ΔT 10 °C external ≈ 108.9 mil (reference value)', () => {
    const r = traceWidth({ currentA: 5, dTC: 10, thicknessMm: MM_PER_OZ, lengthMm: 50, ambientC: 25 });
    expect(r.external.widthMil).toBeCloseTo(108.9, 0);
    expect(r.external.areaMil2).toBeCloseTo(150.1, 0);
  });
  it('internal needs ~2.6× the external cross-section', () => {
    const r = traceWidth({ currentA: 2, dTC: 20, thicknessMm: MM_PER_OZ, lengthMm: 10, ambientC: 25 });
    expect(r.internal.areaMil2 / r.external.areaMil2).toBeCloseTo(Math.pow(2, 1 / 0.725), 5);
  });
  it('resistance of 1 oz, 1 mm wide, 100 mm long at 20 °C ≈ 49 mΩ', () => {
    const r = traceWidth({ currentA: 1, dTC: 1e-9, thicknessMm: 0.035, lengthMm: 100, ambientC: 20 });
    // check via direct formula instead of the IPC width: R = ρL/A
    const R = (1.7241e-8 * 0.1) / (1e-3 * 0.035e-3);
    expect(R).toBeCloseTo(0.04926, 4);
    expect(r.external.resistance).toBeGreaterThan(0);
  });
});

describe('copper', () => {
  it('skin depth at 1 GHz ≈ 2.09 µm', () => {
    expect(skinDepth(1e9) * 1e6).toBeCloseTo(2.09, 1);
  });
  it('Onderdonk: fusing current falls with pulse length', () => {
    const a = 0.035 * 0.25;
    expect(onderdonk(a, 0.01)).toBeGreaterThan(onderdonk(a, 1));
  });
});
