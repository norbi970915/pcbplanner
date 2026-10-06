import { describe, expect, it } from 'vitest';
import { searchEntries, type SearchEntry } from './siteSearch';
const entries: SearchEntry[] = [
  { path: '/via', title: 'Via Current', description: 'Copper resistance and trace connection', kind: 'Tool', group: 'Power' },
  { path: '/trace-width', title: 'Trace Width Calculator', description: 'Current and temperature rise', kind: 'Tool', group: 'Power' },
  { path: '/guide', title: '3W spacing', description: 'Crosstalk between traces', kind: 'Guide', group: 'Signals' },
];
describe('site search', () => {
  it('matches common track terminology and ranks title matches first', () => {
    expect(searchEntries(entries, 'track')[0].path).toBe('/trace-width');
    expect(searchEntries(entries, 'track width').map(entry => entry.path)).toEqual(['/trace-width']);
  });
  it('requires every term and includes guides without special-character crashes', () => {
    expect(searchEntries(entries, 'crosstalk')[0].kind).toBe('Guide');
    expect(searchEntries(entries, 'width thermal')).toEqual([]);
    expect(searchEntries(entries, '<script>')).toEqual([]);
    expect(searchEntries(entries, ' ')).toEqual([]);
  });
});
