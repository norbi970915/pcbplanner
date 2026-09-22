import { describe, expect, it } from 'vitest';
import { junction, viaArray } from './thermal';

describe('junction temperature', () => {
  it('Tj = Ta + P·θJA', () => {
    const r = junction({ powerW: 2, ambientC: 40, mode: 'ja', thetaJA: 35, thetaJC: 0, thetaCS: 0, thetaSA: 0, tjMaxC: 125 });
    expect(r.tj).toBeCloseTo(110, 6);
    expect(r.maxPower).toBeCloseTo(85 / 35, 6);
  });
  it('chain: node temperatures and required heatsink', () => {
    const r = junction({ powerW: 10, ambientC: 25, mode: 'chain', thetaJA: 0, thetaJC: 1.5, thetaCS: 0.5, thetaSA: 4, tjMaxC: 150 });
    expect(r.tj).toBeCloseTo(85, 6);
    expect(r.nodes!.case).toBeCloseTo(70, 6);
    expect(r.nodes!.sink).toBeCloseTo(65, 6);
    expect(r.thetaSARequired).toBeCloseTo(12.5 - 2, 6);
  });
});

describe('thermal via array', () => {
  it('single open 0.3 mm via, 25 µm plating, 1.6 mm board ≈ 156 K/W', () => {
    const r = viaArray({ count: 1, holeMm: 0.3, platingMm: 0.025, lengthMm: 1.6, fillK: 0, padAreaMm2: 0, kLaminate: 0.3, powerW: 1 });
    expect(r.rVia).toBeCloseTo(156.3, 0);
  });
  it('N vias in parallel divide the resistance by N; copper fill lowers it', () => {
    const one = viaArray({ count: 1, holeMm: 0.3, platingMm: 0.025, lengthMm: 1.6, fillK: 0, padAreaMm2: 0, kLaminate: 0.3, powerW: 1 });
    const nine = viaArray({ count: 9, holeMm: 0.3, platingMm: 0.025, lengthMm: 1.6, fillK: 0, padAreaMm2: 0, kLaminate: 0.3, powerW: 1 });
    const filled = viaArray({ count: 1, holeMm: 0.3, platingMm: 0.025, lengthMm: 1.6, fillK: 401, padAreaMm2: 0, kLaminate: 0.3, powerW: 1 });
    expect(nine.rArray).toBeCloseTo(one.rVia / 9, 6);
    expect(filled.rVia).toBeLessThan(one.rVia / 3);
  });
});
