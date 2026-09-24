import { describe, expect, it } from 'vitest';
import { i2cBusCapacitance, i2cPullup, shuntSelection, termination } from './newCalculators';

const bus = { model: 'known' as const, traceCm: 20, widthMm: 0.2, planeGapMm: 0.2, copperUm: 35, er: 4.2, knownPfCm: 1.5, pinCount: 4, pinPf: 10, cableCm: 30, cablePfPerM: 50, extraPf: 5 };

describe('I²C bus capacitance estimate', () => {
  it('adds every contribution on one net, including trace branches and cable', () => {
    const r = i2cBusCapacitance(bus)!;
    expect(r.tracePf).toBe(30);
    expect(r.pinsPf).toBe(40);
    expect(r.cablePf).toBe(15);
    expect(r.totalPf).toBe(90);
  });

  it('derives trace capacitance from geometry and increases with trace width', () => {
    const narrow = i2cBusCapacitance({ ...bus, model: 'microstrip', widthMm: 0.2 })!;
    const wide = i2cBusCapacitance({ ...bus, model: 'microstrip', widthMm: 0.4 })!;
    expect(narrow.tracePfCm).toBeGreaterThan(0.5);
    expect(narrow.tracePfCm).toBeLessThan(5);
    expect(wide.tracePfCm).toBeGreaterThan(narrow.tracePfCm);
  });

  it('rejects fractional device counts and impossible geometry', () => {
    expect(i2cBusCapacitance({ ...bus, pinCount: 1.5 })).toBeNull();
    expect(i2cBusCapacitance({ ...bus, model: 'stripline', planeGapMm: 0 })).toBeNull();
  });
});

describe('I²C pull-up window', () => {
  it('reproduces TI SLVA689 fast-mode 3.3 V, 200 pF example', () => {
    const r = i2cPullup(3.3, 200, 0.4, 3, 'fast', 'E24')!;
    expect(r.min).toBeCloseTo(966.667, 2);
    expect(r.max).toBeCloseTo(1770.3, 0);
    expect(r.options).toContain(1500);
    expect(r.evaluate(1500).riseNs).toBeCloseTo(254.19, 1);
    expect(r.evaluate(1500).sinkMa).toBeCloseTo(1.9333, 3);
  });

  it('reports when a passive pull-up has no valid range', () => {
    const r = i2cPullup(3.3, 400, 0.4, 3, 'fast', 'E24')!;
    expect(r.min).toBeGreaterThan(r.max);
    expect(r.options).toEqual([]);
  });

  it('rejects a nominal value that passes only without its tolerance', () => {
    const r = i2cPullup(3.3, 200, 0.4, 3, 'fast', 'E24', 5)!;
    expect(r.min).toBeLessThan(1000);
    expect(r.options).not.toContain(1000);
    expect(r.evaluate(1000).worstSinkMa).toBeGreaterThan(3);
    expect(r.options).toContain(1500);
  });

  it('applies Fast-mode minimum rise time on a lightly loaded bus', () => {
    const r = i2cPullup(3.3, 10, 0.4, 3, 'fast', 'E24')!;
    expect(r.riseMin).toBeGreaterThan(r.sinkMin);
    expect(r.evaluate(1000).fastestRiseNs).toBeLessThan(20);
    expect(r.options).not.toContain(1000);
  });
});

describe('line termination', () => {
  it('matches a 50 Ω line with a 17 Ω driver and 33 Ω source resistor', () => {
    const r = termination(50, 17, 'source', 33, 3.3)!;
    expect(r.ideal).toBe(33);
    expect(r.gamma).toBe(0);
    expect(r.current * 50).toBeCloseTo(1.65, 8);
  });

  it('checks a resistor across a differential pair', () => {
    const r = termination(100, 0, 'differential', 100, 0.4)!;
    expect(r.gamma).toBe(0);
    expect(r.resistorWatts).toBeCloseTo(0.0016, 8);
  });
});

describe('current-sense shunt', () => {
  it('checks burden, heat and low-current offset at the high-resistance corner', () => {
    const r = shuntSelection(10, 0.1, 50, 5, 0.5, 50, 50, 50)!;
    expect(r.idealMaxMilliOhms).toBe(5);
    expect(r.dropMv).toBe(50);
    expect(r.worstDropMv).toBeCloseTo(50.375, 8);
    expect(r.watts).toBeCloseTo(0.5, 8);
    expect(r.offsetErrorPct).toBeCloseTo(10, 8);
    expect(r.worstErrorPct).toBeCloseTo(10.75, 8);
    expect(r.dropExceeded).toBe(true);
  });
});
