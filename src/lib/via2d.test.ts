import { describe, expect, it } from 'vitest';
import { coaxViaImpedance, coaxZ, twinLeadZ, validateViaPair, viaPairImpedance } from './via2d';

const pct = (a: number, b: number) => (100 * Math.abs(a - b)) / b;

describe('via 2D solver', () => {
  it.each([
    [0.3, 0.8, 4.2],
    [0.25, 1.0, 3.8],
    [0.5, 1.2, 4.5],
  ])('coax via d=%s D=%s er=%s agrees with 60/√εr·ln(D/d) within 1.5 %%', (d, D, er) => {
    expect(pct(coaxViaImpedance(d, D, er), coaxZ(d, D, er))).toBeLessThan(1.5);
  });

  it('widely separated vias in their own antipads: Zdiff → 2·Zcoax, Zodd ≈ Zeven', () => {
    const g = { d: 0.3, pitch: 3, antipad: 0.8, shape: 'round' as const, er: 4 };
    const r = viaPairImpedance(g);
    const zc = coaxZ(0.3, 0.8, 4);
    expect(pct(r.zDiff, 2 * zc)).toBeLessThan(1.5);
    expect(pct(r.zOdd, r.zEven)).toBeLessThan(1);
  });

  it('pair in a very large clearance approaches the twin-lead formula from below', () => {
    const g = { d: 0.25, pitch: 0.8, antipad: 12, shape: 'oblong' as const, er: 1 };
    const r = viaPairImpedance(g, 10);
    const tl = twinLeadZ(0.25, 0.8, 1);
    expect(r.zDiff).toBeLessThan(tl);
    expect(pct(r.zDiff, tl)).toBeLessThan(5);
  });

  it('coupling: Zodd < Zeven when the vias are close in a shared antipad', () => {
    const r = viaPairImpedance({ d: 0.25, pitch: 0.8, antipad: 0.8, shape: 'oblong', er: 4 });
    expect(r.zOdd).toBeLessThan(r.zEven);
  });

  it('rejects impossible geometry', () => {
    expect(validateViaPair({ d: 0.3, pitch: 0.2, antipad: 0.8, shape: 'round', er: 4 }).length).toBeGreaterThan(0);
    expect(validateViaPair({ d: 0.3, pitch: 1, antipad: 0.2, shape: 'round', er: 4 }).length).toBeGreaterThan(0);
  });
});
