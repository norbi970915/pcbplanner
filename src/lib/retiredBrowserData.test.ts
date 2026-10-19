import { describe, expect, it } from 'vitest';
import { clearRetiredBrowserData } from './retiredBrowserData';
const storage = (values: Record<string, string>) => {
  const entries = new Map(Object.entries(values));
  return { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); }, removeItem: (key: string) => { entries.delete(key); } };
};
describe('retired browser records', () => {
  it('deletes project records and stale navigation without touching other saved work', () => {
    const local = storage({ 'pcbtk-projects': '[{"name":"Retired board"}]', 'pcbtk-project-active': 'old-id', 'pcbtk-favorites': '["/impedance","/projects"]', 'pcbtk-stackups': '[{"id":"custom"}]', 'pcbplanner:analytics-consent': 'declined' });
    const session = storage({ 'pcbtk-tabs': '["/","/projects","/impedance"]', 'pcbplanner:comparison:/impedance': 'baseline', 'pcbplanner:inputs:/impedance': 'inputs' });
    clearRetiredBrowserData(local, session);
    expect(local.getItem('pcbtk-projects')).toBeNull(); expect(local.getItem('pcbtk-project-active')).toBeNull();
    expect(JSON.parse(local.getItem('pcbtk-favorites')!)).toEqual(['/impedance']);
    expect(JSON.parse(session.getItem('pcbtk-tabs')!)).toEqual(['/', '/impedance']);
    expect(local.getItem('pcbtk-stackups')).toBe('[{"id":"custom"}]'); expect(local.getItem('pcbplanner:analytics-consent')).toBe('declined');
    expect(session.getItem('pcbplanner:comparison:/impedance')).toBe('baseline'); expect(session.getItem('pcbplanner:inputs:/impedance')).toBe('inputs');
    clearRetiredBrowserData(local, session);
    expect(JSON.parse(local.getItem('pcbtk-favorites')!)).toEqual(['/impedance']);
  });
  it('tolerates blocked or malformed storage', () => {
    const blocked = {getItem: () => {throw Error('blocked');}, setItem: () => {throw Error('blocked');}, removeItem: () => {throw Error('blocked');}};
    expect(() => clearRetiredBrowserData(blocked, blocked)).not.toThrow();
    const malformed = storage({'pcbtk-favorites':'bad json','pcbtk-tabs':'{}'});
    expect(() => clearRetiredBrowserData(malformed, malformed)).not.toThrow();
  });
});
