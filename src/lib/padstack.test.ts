import { describe, expect, it } from 'vitest';
import { fabAllowance2221, leadDiagonal, padstack, roundUp, type PadstackInput } from './padstack';

const base: PadstackInput = {
  leadMm: 0.55,
  level: 'B',
  basis: 'ipc7251',
  holeTolMm: 0,
  drillOversizeMm: 0,
  copperOz: 1,
  layers: 4,
  spokes: 4,
  planes: 2,
  round: false,
};

describe('hole and land (IPC-7251 worked example, 0.55 mm lead)', () => {
  it('Level A: hole 0.80, land 1.50', () => {
    const r = padstack({ ...base, level: 'A' });
    expect(r.hole).toBeCloseTo(0.8, 9);
    expect(r.padOuter).toBeCloseTo(1.5, 9);
  });
  it('Level B: hole 0.75, land 1.35', () => {
    const r = padstack(base);
    expect(r.hole).toBeCloseTo(0.75, 9);
    expect(r.padOuter).toBeCloseTo(1.35, 9);
    expect(r.ringExtNominal).toBeCloseTo(0.3, 9);
    expect(r.ringExtWorst).toBeCloseTo(0.05, 9);
  });
  it('Level C: hole 0.70, land 1.20', () => {
    const r = padstack({ ...base, level: 'C' });
    expect(r.hole).toBeCloseTo(0.7, 9);
    expect(r.padOuter).toBeCloseTo(1.2, 9);
  });
});

describe('PCB Matrix IPC-7251 chart row: 2.45 mm lead, Level A', () => {
  // chart: hole 2.70, land 3.40, anti-pad 3.70, thermal ID 3.30, OD 3.70, spoke 0.51 (0.6·3.40/4)
  const r = padstack({ ...base, leadMm: 2.45, level: 'A' });
  it('hole, land, antipad and thermal', () => {
    expect(r.hole).toBeCloseTo(2.7, 9);
    expect(r.padOuter).toBeCloseTo(3.4, 9);
    expect(r.antipad).toBeCloseTo(3.7, 9);
    expect(r.thermalOd).toBeCloseTo(3.7, 9);
    expect(r.thermalId).toBeCloseTo(3.3, 9);
  });
  it('spoke 0.51 rounded up to 0.55 mm', () => {
    expect(r.spokeWidth).toBeCloseTo(0.55, 9);
  });
});

describe('IPC-2221 basis and details', () => {
  it('Table 9-1: Level B 0.25; +0.05 for 2 oz; +0.05 above 8 layers', () => {
    expect(fabAllowance2221('B', 1, 4)).toBeCloseTo(0.25, 9);
    expect(fabAllowance2221('B', 2, 10)).toBeCloseTo(0.35, 9);
  });
  it('land = a + 2b + c with max hole: 0.75 + 0.1 tolerance + 0.1 + 0.25 = 1.20', () => {
    const r = padstack({ ...base, basis: 'ipc2221', holeTolMm: 0.1 });
    expect(r.maxHole).toBeCloseTo(0.85, 9);
    expect(r.padOuter).toBeCloseTo(1.2, 9);
  });
  it('internal land from drilled hole: 0.75 + 0.1 + 2·0.03 + 0.5 = 1.41', () => {
    const r = padstack({ ...base, drillOversizeMm: 0.1 });
    expect(r.padInnerMin).toBeCloseTo(1.41, 9);
    expect(r.padInner).toBeCloseTo(1.41, 9);
    expect(r.ringIntWorst).toBeCloseTo(0.03, 9);
  });
  it('overrides replace the defaults', () => {
    const r = padstack({ ...base, arExtMm: 0.1, faMm: 0.3, antipadOverHoleMm: 1.2 });
    expect(r.padOuter).toBeCloseTo(0.75 + 0.2 + 0.3, 9);
    expect(r.antipad).toBeCloseTo(1.95, 9);
  });
  it('rectangular lead uses the diagonal: 0.64 × 0.64 → 0.905', () => {
    expect(leadDiagonal(0.64, 0.64)).toBeCloseTo(0.90510, 4);
  });
  it('rounding to 0.05 mm', () => {
    expect(roundUp(0.905 + 0.2, 0.05)).toBeCloseTo(1.15, 9);
    expect(roundUp(1.1, 0.05)).toBeCloseTo(1.1, 9);
  });
  it('web limit 4 mm per oz and total web width', () => {
    const r = padstack(base); // spoke ceil(0.6·1.35/4 = 0.2025) = 0.25, 4 spokes, 2 planes
    expect(r.spokeWidth).toBeCloseTo(0.25, 9);
    expect(r.webTotal).toBeCloseTo(2.0, 9);
    expect(padstack({ ...base, copperOz: 2 }).webLimit).toBeCloseTo(2.0, 9);
  });
});
