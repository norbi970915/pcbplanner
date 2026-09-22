import { describe, expect, it } from 'vitest';
import { LETTER_DRILLS, NUMBER_DRILLS, FRACTIONAL_DRILLS } from '../data/drills';
import { METRIC_COARSE, SOURCES, UNIFIED } from '../data/threads';

describe('metric coarse threads', () => {
  it('sorted by diameter; pitch non-decreasing', () => {
    for (let i = 1; i < METRIC_COARSE.length; i++) {
      expect(METRIC_COARSE[i].d).toBeGreaterThan(METRIC_COARSE[i - 1].d);
      expect(METRIC_COARSE[i].pitch).toBeGreaterThanOrEqual(METRIC_COARSE[i - 1].pitch);
    }
  });

  it('tap drill is close to D − P (within 0.1 mm) and below D', () => {
    for (const t of METRIC_COARSE) {
      expect(t.tapDrillDminusP).toBeCloseTo(t.d - t.pitch, 9);
      expect(Math.abs(t.tapDrill - t.tapDrillDminusP)).toBeLessThanOrEqual(0.1 + 1e-9);
      expect(t.tapDrill).toBeLessThan(t.d);
    }
  });

  it('ISO 273 clearance: D < fine < medium < coarse, all increasing with D', () => {
    for (let i = 0; i < METRIC_COARSE.length; i++) {
      const c = METRIC_COARSE[i].clearance;
      expect(c.fine).toBeGreaterThan(METRIC_COARSE[i].d);
      expect(c.medium).toBeGreaterThan(c.fine);
      expect(c.coarse).toBeGreaterThan(c.medium);
      if (i > 0) expect(c.fine).toBeGreaterThan(METRIC_COARSE[i - 1].clearance.fine);
    }
  });

  it('spot values', () => {
    const m = (n: string) => METRIC_COARSE.find((t) => t.name === n)!;
    expect(m('M3')).toMatchObject({ pitch: 0.5, tapDrill: 2.5, clearance: { fine: 3.2, medium: 3.4, coarse: 3.6 } });
    expect(m('M2.5')).toMatchObject({ pitch: 0.45, tapDrill: 2.05, clearance: { fine: 2.7, medium: 2.9, coarse: 3.1 } });
    expect(m('M8')).toMatchObject({ pitch: 1.25, tapDrill: 6.8, clearance: { fine: 8.4, medium: 9, coarse: 10 } });
    expect(m('M12')).toMatchObject({ pitch: 1.75, tapDrill: 10.2, clearance: { fine: 13, medium: 13.5, coarse: 14.5 } });
  });
});

describe('unified threads', () => {
  const allDrills = [...NUMBER_DRILLS, ...LETTER_DRILLS, ...FRACTIONAL_DRILLS];
  const drillByName = (name: string) =>
    allDrills.find((d) => d.name === name || d.name === `${name}"`);

  it('every drill name resolves to the same decimal as the drill table', () => {
    for (const t of UNIFIED) {
      for (const d of [t.tapDrill, t.close, t.free]) {
        const ref = drillByName(d.name);
        expect(ref, d.name).toBeDefined();
        expect(Math.abs(ref!.inch - d.inch)).toBeLessThan(0.00006); // 3/64 = 0.046875 printed as 0.0469
      }
    }
  });

  it('tap < minor-ish < major < close < free', () => {
    for (const t of UNIFIED) {
      expect(t.tapDrill.inch).toBeLessThan(t.major);
      expect(t.tapDrill.inch).toBeGreaterThan(t.major - 1.3 / t.tpi); // above the basic minor diameter region
      expect(t.close.inch).toBeGreaterThan(t.major);
      expect(t.free.inch).toBeGreaterThan(t.close.inch);
    }
  });

  it('spot values', () => {
    const u = (n: string) => UNIFIED.find((t) => t.name === n)!;
    expect(u('#4-40')).toMatchObject({ major: 0.112, tpi: 40, tapDrill: { name: '#43' }, close: { name: '#32' }, free: { name: '#30' } });
    expect(u('1/4-20')).toMatchObject({ major: 0.25, tpi: 20, tapDrill: { name: '#7' }, close: { name: 'F' }, free: { name: 'H' } });
    expect(u('3/8-16').tapDrill.inch).toBe(0.3125);
  });

  it('lists sources with URLs', () => {
    for (const s of SOURCES) expect(s.url).toMatch(/^https:\/\//);
  });
});
