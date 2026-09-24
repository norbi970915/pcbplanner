import { describe, expect, it } from 'vitest';
import { restoreToolState, toolSessionKey } from './useUrlState';

const defaults = { current: 3, rise: 10, mode: 'width', enabled: false };

describe('tool session state', () => {
  it('uses a separate key for each tool', () => {
    expect(toolSessionKey('/trace-width')).not.toBe(toolSessionKey('/via'));
  });

  it('restores the full input state when returning without a query', () => {
    const saved = JSON.stringify({ current: 2.345678901, rise: 15, mode: 'current', enabled: true });
    expect(restoreToolState('', saved, defaults)).toEqual({ current: 2.345678901, rise: 15, mode: 'current', enabled: true });
  });

  it('lets a shared result URL override saved state, filling absent fields from defaults', () => {
    const saved = JSON.stringify({ current: 8, rise: 30, mode: 'current', enabled: true });
    expect(restoreToolState('?current=5&rise=20', saved, defaults)).toEqual({ current: 5, rise: 20, mode: 'width', enabled: false });
  });

  it('merges a tool handoff into the existing session without losing other inputs', () => {
    const saved = JSON.stringify({ current: 8, rise: 30, mode: 'current', enabled: true });
    expect(restoreToolState('?current=5&handoff=1', saved, defaults)).toEqual({ current: 5, rise: 30, mode: 'current', enabled: true });
  });

  it('ignores malformed, unknown and wrong-type stored values', () => {
    expect(restoreToolState('', '{bad', defaults)).toEqual(defaults);
    expect(restoreToolState('', JSON.stringify({ current: 'wrong', rise: 12, extra: 99 }), defaults)).toEqual({ ...defaults, rise: 12 });
    expect(restoreToolState('?current=7&handoff=1', '[]', defaults)).toEqual({ ...defaults, current: 7 });
  });
});
