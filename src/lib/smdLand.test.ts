import { describe, expect, it } from 'vitest';
import { smdLand, type SmdLandInput } from './smdLand';

const part: SmdLandInput = {
  lengthMin: 1.5, lengthMax: 1.7, widthMin: 0.7, widthMax: 0.9,
  terminalMin: 0.3, terminalMax: 0.5,
  toe: 0.15, heel: 0.05, side: 0.05,
  fabrication: 0.1, placement: 0.1, courtyard: 0.25, maskExpansion: 0.05,
};

describe('two-terminal SMD land geometry', () => {
  it('returns two separated pads and a courtyard enclosing copper and maximum body', () => {
    const r = smdLand(part)!;
    expect(r).not.toBeNull();
    expect(r.gap).toBeGreaterThan(0);
    expect(r.padLength).toBeCloseTo((r.outer - r.gap) / 2);
    expect(r.pitch).toBeCloseTo(r.gap + r.padLength);
    expect(r.courtyardLength).toBeGreaterThan(r.outer);
    expect(r.courtyardWidth).toBeGreaterThan(part.widthMax);
    expect(r.maskWeb).toBeCloseTo(r.gap - 2 * part.maskExpansion);
  });

  it('increases copper dimensions when the joint goals grow', () => {
    const base = smdLand(part)!;
    const larger = smdLand({ ...part, toe: part.toe + 0.1, heel: part.heel + 0.1, side: part.side + 0.1 })!;
    expect(larger.outer).toBeGreaterThan(base.outer);
    expect(larger.gap).toBeLessThan(base.gap);
    expect(larger.padWidth).toBeGreaterThan(base.padWidth);
  });

  it('rejects overlapping terminations and impossible copper gaps', () => {
    expect(smdLand({ ...part, terminalMax: 0.8 })).toBeNull();
    expect(smdLand({ ...part, heel: 0.5 })).toBeNull();
  });
});
