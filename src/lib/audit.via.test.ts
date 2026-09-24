import { describe, expect, it } from 'vitest';
import { currentFor, IPC2221 } from './ipc2221';
import { parallelViaCount, via } from './via';

const IN = 25.4;

describe('audit: via (H. Johnson, High-Speed Digital Design, §7.4)', () => {
  // Worked example quoted from Johnson's formulas in "The Analysis of Vias", ALLPCB
  // (www.allpcb.com/sns/the-analysisi-of-vias_26200.html): 50 mil board, 10 mil hole,
  // 20 mil pad, 32 mil clearance, εr 4.4 →
  //   C = 1.41·4.4·0.050·0.020/(0.032−0.020) = 0.517 pF
  //   T10-90 = 2.2·C·(Z0/2) = 2.2·0.517·(55/2) = 31.28 ps
  //   L = 5.08·0.050·[ln(4·0.050/0.010)+1] = 1.015 nH
  // The code uses the barrel outer diameter (hole + 2·plating) for d, so choose
  // hole + 2·plating = 10 mil.
  const r = via({ holeMm: 0.01 * IN - 0.05, platingMm: 0.025, lengthMm: 0.05 * IN, padMm: 0.02 * IN, antipadMm: 0.032 * IN, er: 4.4, dTC: 10, ambientC: 25, z0: 55 });

  it('capacitance 0.517 pF', () => expect(r.capPf).toBeCloseTo(0.517, 3));
  it('rise-time degradation 31.28 ps', () => expect(r.riseDegradationPs).toBeCloseTo(31.28, 2));
  it('inductance 1.015 nH', () => expect(r.indNh).toBeCloseTo(1.015, 3));

  it('derived quantities', () => {
    expect(r.zVia).toBeCloseTo(Math.sqrt(1.015e-9 / 0.517e-12), -0.5);
    expect(r.resonanceGHz).toBeCloseTo(1 / (2 * Math.PI * Math.sqrt(r.indNh * 1e-9 * r.capPf * 1e-12)) / 1e9, 9);
    expect(r.aspectRatio).toBeCloseTo((0.05 * IN) / (0.01 * IN - 0.05), 9);
  });

  it('barrel current uses IPC-2221 on the annulus area', () => {
    const a = ((Math.PI / 4) * ((0.3 + 0.05) ** 2 - 0.3 ** 2)) / 0.0254 ** 2;
    const v = via({ holeMm: 0.3, platingMm: 0.025, lengthMm: 1.6, padMm: 0.6, antipadMm: 0.9, er: 4.3, dTC: 10, ambientC: 25, z0: 50 });
    expect(v.areaMil2).toBeCloseTo(a, 9);
    expect(v.currentExt).toBeCloseTo(currentFor(a, 10, IPC2221.kExternal), 12);
    // thermal resistance of the barrel, Fourier: L/(k·A) = 1.6e-3/(401·2.553e-8) = 156.3 K/W
    expect(v.thermalRes).toBeCloseTo(156.3, 0);
  });

  it('antipad ≤ pad gives NaN capacitance, not a number', () => {
    const v = via({ holeMm: 0.3, platingMm: 0.025, lengthMm: 1.6, padMm: 0.6, antipadMm: 0.6, er: 4.3, dTC: 10, ambientC: 25, z0: 50 });
    expect(Number.isNaN(v.capPf)).toBe(true);
    expect(Number.isNaN(v.zVia)).toBe(true);
  });

  it('sizes parallel vias at and just above a capacity boundary', () => {
    expect(parallelViaCount(3, 1)).toBe(3);
    expect(parallelViaCount(3.0001, 1)).toBe(4);
    expect(parallelViaCount(0.5, 1)).toBe(1);
  });
});
