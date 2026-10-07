import { describe, expect, it } from 'vitest';
import { encodeToolQuery, normaliseToolQuery, parseToolQuery } from './toolInputs';
import { restoreToolState } from '../state/useUrlState';

const defaults = { current: 3, rise: 10, mode: 'width', enabled: false };
describe('project input snapshots', () => {
  it('treats explicit defaults and compact default URLs as the same saved inputs', () => {
    expect(normaliseToolQuery('mode=width&rise=10&current=3&enabled=false', defaults)).toBe('');
  });
  it('compares values rather than query ordering or number formatting', () => {
    expect(normaliseToolQuery('enabled=true&current=4.5000&rise=1e1', defaults)).toBe(encodeToolQuery({ ...defaults, current: 4.5, enabled: true }, defaults));
  });
  it('ignores navigation markers but detects changed input values', () => {
    expect(normaliseToolQuery('current=4&handoff=1&utm_source=group', defaults)).toBe('current=4');
    expect(normaliseToolQuery('current=5', defaults)).not.toBe(normaliseToolQuery('current=4', defaults));
  });
  it('stores default inputs explicitly so reopening cannot restore a later unsaved session', () => {
    const saved = encodeToolQuery(defaults, defaults, true);
    expect(saved).toBe('current=3&rise=10&mode=width&enabled=0');
    expect(restoreToolState(saved, JSON.stringify({ ...defaults, current: 9, rise: 30 }), defaults)).toEqual(defaults);
  });
  it('keeps the existing seven-digit share precision and rounding to defaults', () => {
    expect(encodeToolQuery({ ...defaults, current: 3.0000000000000004 }, defaults)).toBe('');
    expect(encodeToolQuery({ ...defaults, current: 4.123456789 }, defaults)).toBe('current=4.123457');
  });
  it('round-trips string inputs containing separators and ignores invalid numbers', () => {
    const d = { name: '', value: 1 };
    const state = { name: 'R1=10k & R2=2k', value: 2 };
    expect(parseToolQuery(encodeToolQuery(state, d, true), d)).toEqual(state);
    expect(parseToolQuery('value=Infinity&unknown=4', d)).toEqual(d);
  });
});
