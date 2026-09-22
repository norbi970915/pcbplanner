import { describe, expect, it } from 'vitest';
import {
  IPC2221_SPACING_BANDS,
  IPC2221_SPACING_PER_VOLT_ABOVE_500,
  SPACING_COLUMNS,
  SOURCES,
  ipc2221Spacing,
} from '../data/ipc2221Spacing';

describe('IPC-2221 Table 6-1 data', () => {
  it('has 9 contiguous bands 0–500 V', () => {
    expect(IPC2221_SPACING_BANDS).toHaveLength(9);
    expect(IPC2221_SPACING_BANDS[0].vMin).toBe(0);
    expect(IPC2221_SPACING_BANDS[8].vMax).toBe(500);
    for (let i = 1; i < IPC2221_SPACING_BANDS.length; i++) {
      expect(IPC2221_SPACING_BANDS[i].vMin).toBe(IPC2221_SPACING_BANDS[i - 1].vMax + 1);
    }
  });

  it('every column is non-decreasing with voltage', () => {
    for (const c of SPACING_COLUMNS) {
      for (let i = 1; i < IPC2221_SPACING_BANDS.length; i++) {
        expect(IPC2221_SPACING_BANDS[i].mm[c]).toBeGreaterThanOrEqual(IPC2221_SPACING_BANDS[i - 1].mm[c]);
      }
      expect(IPC2221_SPACING_PER_VOLT_ABOVE_500[c]).toBeGreaterThan(0);
    }
  });

  it('coated/internal never needs more than uncoated external at sea level (B1,B4 ≤ B2 ≤ B3)', () => {
    for (const b of IPC2221_SPACING_BANDS) {
      expect(b.mm.B1).toBeLessThanOrEqual(b.mm.B2);
      expect(b.mm.B4).toBeLessThanOrEqual(b.mm.B2);
      expect(b.mm.B2).toBeLessThanOrEqual(b.mm.B3);
      expect(b.mm.A7).toBeLessThanOrEqual(b.mm.A6);
    }
  });

  it('spot values from the standard', () => {
    expect(ipc2221Spacing(12, 'B2')).toBe(0.1);
    expect(ipc2221Spacing(24, 'A6')).toBe(0.25);
    expect(ipc2221Spacing(48, 'B2')).toBe(0.6);
    expect(ipc2221Spacing(100, 'B3')).toBe(1.5);
    expect(ipc2221Spacing(170, 'B2')).toBe(1.25);
    expect(ipc2221Spacing(250, 'B3')).toBe(6.4);
    expect(ipc2221Spacing(300, 'A7')).toBe(0.8);
    expect(ipc2221Spacing(400, 'A6')).toBe(1.5);
    expect(ipc2221Spacing(-48, 'B2')).toBe(0.6);
  });

  it('>500 V follows the worked example in clause 6.3 (B1, 600 V → 0.50 mm)', () => {
    expect(ipc2221Spacing(600, 'B1')).toBeCloseTo(0.5, 10);
    expect(ipc2221Spacing(1000, 'B2')).toBeCloseTo(2.5 + 500 * 0.005, 10);
    expect(ipc2221Spacing(1000, 'B4')).toBeCloseTo(0.8 + 500 * 0.00305, 10);
  });

  it('band edges: 15 V in first band, 15.5 V and 16 V in second', () => {
    expect(ipc2221Spacing(15, 'A6')).toBe(0.13);
    expect(ipc2221Spacing(15.5, 'A6')).toBe(0.25);
    expect(ipc2221Spacing(16, 'A6')).toBe(0.25);
    expect(ipc2221Spacing(500, 'B2')).toBe(2.5);
  });

  it('lists sources with URLs', () => {
    expect(SOURCES.length).toBeGreaterThan(0);
    for (const s of SOURCES) expect(s.url).toMatch(/^https:\/\//);
  });
});
