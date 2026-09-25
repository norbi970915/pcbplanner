import { describe, expect, it } from 'vitest';
import { checkLogicLevels, type LogicLevelsInput } from './logicLevels';

const example: LogicLevelsInput = {
  vohMin: 2.9, volMax: 0.4, vohMax: 3.3, vihMin: 2, vilMax: 0.8,
  operatingMax: 3.6, absoluteMax: 4, receiverMayBeOff: false,
};

describe('logic-level compatibility', () => {
  it('calculates worst-case high and low noise margins', () => {
    const r = checkLogicLevels(example);
    expect(r.errors).toEqual([]);
    expect(r.highMargin).toBeCloseTo(0.9);
    expect(r.lowMargin).toBeCloseTo(0.4);
    expect(r.verdict).toBe('passes-entered-limits');
  });

  it('finds a 3.3 V driver that cannot guarantee HIGH to a 5 V CMOS receiver', () => {
    const r = checkLogicLevels({ ...example, vihMin: 3.5, operatingMax: 5.5, absoluteMax: 6 });
    expect(r.highMargin).toBeCloseTo(-0.6);
    expect(r.lowCompatible).toBe(true);
    expect(r.verdict).toBe('incompatible');
  });

  it('separates normal operating input limits from absolute maximum ratings', () => {
    const r = checkLogicLevels({ ...example, operatingMax: 3, absoluteMax: 3.6 });
    expect(r.operatingCompatible).toBe(false);
    expect(r.absoluteCompatible).toBe(true);
    expect(r.verdict).toBe('incompatible');
  });

  it('requires review when limits or powered-off behaviour are unknown', () => {
    const r = checkLogicLevels({ ...example, operatingMax: 0, absoluteMax: 0, receiverMayBeOff: true });
    expect(r.verdict).toBe('review');
    expect(r.warnings.some(note => note.includes('powered-off'))).toBe(true);
  });

  it('rejects inconsistent datasheet limits', () => {
    expect(checkLogicLevels({ ...example, vohMax: 2.7 }).errors).not.toEqual([]);
    expect(checkLogicLevels({ ...example, vilMax: 2.1 }).errors).not.toEqual([]);
  });
});
