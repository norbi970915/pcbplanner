import { describe, expect, it } from 'vitest';
import { mergeProjects, parseProjectFile, serialiseProjects, type Project } from './projectStore';

const p = (id: string, name: string): Project => ({ id, name, created: 1, updated: 2, tools: [{ path: '/impedance', query: 'w=0.2', updated: 3 }] });

describe('project files', () => {
  it('round-trips projects and custom stackups', () => {
    const stack = { id: 'custom-1', name: 'My board', layers: [{ id: 'a', kind: 'copper' as const, name: 'L1', t: 0.035 }] };
    const r = parseProjectFile(serialiseProjects([p('p1', 'Carrier')], [stack]));
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.projects[0].name).toBe('Carrier');
    expect(r.projects[0].tools[0]).toMatchObject({ path: '/impedance', query: 'w=0.2' });
    expect(r.stackups[0].id).toBe('custom-1');
  });
  it('rejects anything that is not a pcbplanner project file', () => {
    expect(parseProjectFile('nope')).toEqual({ error: 'That file is not valid JSON.' });
    expect(parseProjectFile('{"app":"other"}')).toMatchObject({ error: expect.stringContaining('not exported') });
    expect(parseProjectFile('{"app":"pcbplanner","version":9}')).toMatchObject({ error: expect.stringContaining('version') });
    expect(parseProjectFile('{"app":"pcbplanner","version":1,"projects":[]}')).toMatchObject({ error: expect.stringContaining('no projects') });
  });
  it('drops entries that are not tool states', () => {
    const text = JSON.stringify({
      app: 'pcbplanner',
      version: 1,
      projects: [{ id: 'x', name: 'x', created: 1, updated: 1, tools: [{ path: 'no-slash', query: '' }] }],
      stackups: [],
    });
    expect(parseProjectFile(text)).toMatchObject({ error: expect.stringContaining('no projects') });
  });
});

describe('merging imported projects', () => {
  it('keeps ids and names unique', () => {
    const merged = mergeProjects([p('p1', 'Carrier')], [p('p1', 'Carrier'), p('p2', 'Other')]);
    expect(merged).toHaveLength(3);
    expect(new Set(merged.map((x) => x.id)).size).toBe(3);
    expect(merged[1].name).toBe('Carrier (2)');
    expect(merged[2].name).toBe('Other');
  });
});
