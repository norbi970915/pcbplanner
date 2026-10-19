import { describe, expect, it } from 'vitest';
import { encodeToolQuery, parseToolQuery } from './toolInputs';

const defaults = { current: 3, rise: 10, mode: 'width', enabled: false };
describe('calculator input URLs', () => {
  it('keeps the existing seven-digit share precision and rounding to defaults', () => {
    expect(encodeToolQuery({ ...defaults, current: 3.0000000000000004 }, defaults)).toBe('');
    expect(encodeToolQuery({ ...defaults, current: 4.123456789 }, defaults)).toBe('current=4.123457');
  });
  it('round-trips string inputs containing separators and ignores invalid numbers', () => {
    const d = { name: '', value: 1 };
    const state = { name: 'R1=10k & R2=2k', value: 2 };
    expect(parseToolQuery(encodeToolQuery(state, d), d)).toEqual(state);
    expect(parseToolQuery('value=Infinity&unknown=4', d)).toEqual(d);
  });
});
