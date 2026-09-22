import { describe, expect, it } from 'vitest';
import {
  BGA_BALL_VS_PITCH,
  BGA_COLLAPSING,
  BGA_NON_COLLAPSING,
  SOURCES,
  bgaLandByRule,
  bgaLevelForBall,
} from '../data/bgaLand';

describe('IPC-7351 BGA land data', () => {
  it('tables are sorted by ball diameter (descending) and lands are monotonic', () => {
    for (const t of [BGA_COLLAPSING, BGA_NON_COLLAPSING]) {
      expect(t).toHaveLength(13);
      for (let i = 1; i < t.length; i++) {
        expect(t[i].ball).toBeLessThan(t[i - 1].ball);
        expect(t[i].land).toBeLessThanOrEqual(t[i - 1].land);
      }
    }
  });

  it('nominal land lies within the land variation; collapsing < ball < non-collapsing', () => {
    for (const r of [...BGA_COLLAPSING, ...BGA_NON_COLLAPSING]) {
      expect(r.land).toBeLessThanOrEqual(r.landMax + 1e-9);
      expect(r.land).toBeGreaterThanOrEqual(r.landMin - 1e-9);
      expect(r.level).toBe(bgaLevelForBall(r.ball));
    }
    for (const r of BGA_COLLAPSING) expect(r.land).toBeLessThan(r.ball);
    for (const r of BGA_NON_COLLAPSING) expect(r.land).toBeGreaterThan(r.ball);
  });

  it('percent matches the density level (Table 3-18)', () => {
    const red = { A: 25, B: 20, C: 15 } as const;
    const inc = { A: 15, B: 10, C: 5 } as const;
    for (const r of BGA_COLLAPSING) expect(r.percent).toBe(red[r.level]);
    for (const r of BGA_NON_COLLAPSING) expect(r.percent).toBe(inc[r.level]);
  });

  it('collapsing rows ≥ 0.25 mm equal the % rule rounded to 0.05 mm', () => {
    for (const r of BGA_COLLAPSING.filter((x) => x.ball >= 0.25)) {
      expect(bgaLandByRule(r.ball, 'collapsing')).toBeCloseTo(r.land, 9);
    }
  });

  it('non-collapsing (single-source) rows equal the % rule rounded to 0.01 mm (within 0.005)', () => {
    for (const r of BGA_NON_COLLAPSING) {
      expect(Math.abs(r.ball * (1 + r.percent / 100) - r.land)).toBeLessThanOrEqual(0.0051);
    }
  });

  it('spot values: 0.50 mm ball → 0.40 mm land (TI SPRACA4 example), 0.60 → 0.45', () => {
    expect(BGA_COLLAPSING.find((r) => r.ball === 0.5)?.land).toBe(0.4);
    expect(BGA_COLLAPSING.find((r) => r.ball === 0.6)?.land).toBe(0.45);
    expect(BGA_COLLAPSING.find((r) => r.ball === 0.15)?.land).toBe(0.13);
  });

  it('ball-vs-pitch table: sorted, tolerance brackets nominal, ball < pitch', () => {
    for (let i = 0; i < BGA_BALL_VS_PITCH.length; i++) {
      const r = BGA_BALL_VS_PITCH[i];
      if (i > 0) expect(r.ball).toBeLessThan(BGA_BALL_VS_PITCH[i - 1].ball);
      expect(r.ballMin).toBeLessThan(r.ball);
      expect(r.ballMax).toBeGreaterThan(r.ball);
      for (const p of r.pitches) expect(r.ball).toBeLessThan(p);
    }
  });

  it('lists sources with URLs', () => {
    for (const s of SOURCES) expect(s.url).toMatch(/^https:\/\//);
  });
});
