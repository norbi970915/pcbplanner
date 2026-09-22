import { describe, expect, it } from 'vitest';
import {
  FRACTIONAL_DRILLS,
  INCH_DRILLS_SORTED,
  LETTER_DRILLS,
  METRIC_DRILLS,
  NUMBER_DRILLS,
  SOURCES,
  nearestDrill,
} from '../data/drills';

describe('drill size data', () => {
  it('has the expected counts', () => {
    expect(NUMBER_DRILLS).toHaveLength(80);
    expect(LETTER_DRILLS).toHaveLength(26);
    expect(FRACTIONAL_DRILLS).toHaveLength(32);
    expect(METRIC_DRILLS).toHaveLength(64);
  });

  it('number drills shrink from #1 to #80; letters grow from A to Z; letters are all above #1', () => {
    for (let i = 1; i < NUMBER_DRILLS.length; i++) expect(NUMBER_DRILLS[i].inch).toBeLessThan(NUMBER_DRILLS[i - 1].inch);
    for (let i = 1; i < LETTER_DRILLS.length; i++) expect(LETTER_DRILLS[i].inch).toBeGreaterThan(LETTER_DRILLS[i - 1].inch);
    expect(LETTER_DRILLS[0].inch).toBeGreaterThan(NUMBER_DRILLS[0].inch);
  });

  it('spot values (ASME B94.11M, via Wikipedia and ICS chart)', () => {
    const n = (k: number) => NUMBER_DRILLS[k - 1].inch;
    expect(n(1)).toBe(0.228);
    expect(n(7)).toBe(0.201);
    expect(n(29)).toBe(0.136);
    expect(n(43)).toBe(0.089);
    expect(n(50)).toBe(0.07);
    expect(n(56)).toBe(0.0465);
    expect(n(69)).toBe(0.0292);
    expect(n(80)).toBe(0.0135);
    const l = (c: string) => LETTER_DRILLS[c.charCodeAt(0) - 65].inch;
    expect(l('A')).toBe(0.234);
    expect(l('E')).toBe(0.25);
    expect(l('F')).toBe(0.257);
    expect(l('Z')).toBe(0.413);
    expect(NUMBER_DRILLS[42].name).toBe('#43');
    expect(LETTER_DRILLS[25].name).toBe('Z');
  });

  it('fractional drills are exact n/64 with reduced names', () => {
    FRACTIONAL_DRILLS.forEach((d, i) => expect(d.inch).toBe((i + 1) / 64));
    expect(FRACTIONAL_DRILLS[0].name).toBe('1/64"');
    expect(FRACTIONAL_DRILLS[7].name).toBe('1/8"');
    expect(FRACTIONAL_DRILLS[31].name).toBe('1/2"');
    expect(FRACTIONAL_DRILLS[31].mm).toBeCloseTo(12.7, 12);
  });

  it('metric drills are 0.2 … 6.5 mm in 0.1 mm steps', () => {
    expect(METRIC_DRILLS[0].mm).toBe(0.2);
    expect(METRIC_DRILLS[METRIC_DRILLS.length - 1].mm).toBe(6.5);
    for (let i = 1; i < METRIC_DRILLS.length; i++) {
      expect(METRIC_DRILLS[i].mm - METRIC_DRILLS[i - 1].mm).toBeCloseTo(0.1, 10);
    }
  });

  it('mm = inch × 25.4 everywhere; sorted inch list is ascending', () => {
    for (const d of [...NUMBER_DRILLS, ...LETTER_DRILLS, ...FRACTIONAL_DRILLS, ...METRIC_DRILLS]) {
      expect(d.mm).toBeCloseTo(d.inch * 25.4, 12);
    }
    for (let i = 1; i < INCH_DRILLS_SORTED.length; i++) {
      expect(INCH_DRILLS_SORTED[i].inch).toBeGreaterThanOrEqual(INCH_DRILLS_SORTED[i - 1].inch);
    }
  });

  it('nearestDrill finds exact matches', () => {
    expect(nearestDrill(0.089 * 25.4, INCH_DRILLS_SORTED)?.name).toBe('#43');
    expect(nearestDrill(0.8, METRIC_DRILLS)?.name).toBe('0.8 mm');
  });

  it('lists sources with URLs', () => {
    for (const s of SOURCES) expect(s.url).toMatch(/^https:\/\//);
  });
});
