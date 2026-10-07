import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let memory: Map<string, string>;
let events: EventTarget;
let storage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn>; removeItem: ReturnType<typeof vi.fn> };
let unsubscribe: (() => void) | undefined;
const KEY = 'pcbtk-projects';
const ACTIVE_KEY = 'pcbtk-project-active';
const load = async () => (await import('./projectStore')).projectStore;
const saved = () => JSON.parse(memory.get(KEY) ?? '[]') as { id: string; name: string }[];
const changed = (key: string | null) => {
  const event = new Event('storage');
  Object.defineProperty(event, 'key', { value: key });
  events.dispatchEvent(event);
};

beforeEach(() => {
  vi.resetModules();
  memory = new Map();
  events = new EventTarget();
  storage = {
    getItem: vi.fn((key: string) => memory.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { memory.set(key, value); }),
    removeItem: vi.fn((key: string) => { memory.delete(key); }),
  };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', events);
});
afterEach(() => {
  unsubscribe?.();
  unsubscribe = undefined;
  vi.unstubAllGlobals();
});

describe('project deletion and browser synchronization', () => {
  it('removes a deleted project from memory and storage and selects a remaining project', async () => {
    const store = await load();
    const first = store.create('Keep');
    const second = store.create('Delete');
    store.remove(second.id);
    expect(store.get().projects.map(p => p.id)).toEqual([first.id]);
    expect(saved().map(p => p.id)).toEqual([first.id]);
    expect(store.get().activeId).toBe(first.id);
    vi.resetModules();
    expect((await load()).get().projects.map(p => p.id)).toEqual([first.id]);
  });

  it('updates subscribers when another tab deletes a project, without writing the stale list back', async () => {
    const store = await load();
    const first = store.create('Keep');
    store.create('Delete');
    const listener = vi.fn();
    unsubscribe = store.subscribe(listener);
    memory.set(KEY, JSON.stringify([first]));
    storage.setItem.mockClear();
    changed(KEY);
    expect(store.get().projects).toEqual([first]);
    expect(store.get().activeId).toBe(first.id);
    expect(listener).toHaveBeenCalledOnce();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('does not resurrect deleted projects when editing before the storage event arrives', async () => {
    const store = await load();
    const first = store.create('Keep');
    store.create('Delete');
    memory.set(KEY, JSON.stringify([first]));
    memory.set(ACTIVE_KEY, JSON.stringify(first.id));
    store.create('New board');
    expect(saved().map(p => p.name)).toEqual(['Keep', 'New board']);
  });

  it('keeps another tab latest tool inputs when renaming a project', async () => {
    const store = await load();
    const first = store.create('Board');
    const latest = { ...first, tools: [{ path: '/trace-width', query: 'current=5.25', updated: 10 }] };
    memory.set(KEY, JSON.stringify([latest]));
    store.rename(first.id, 'Renamed');
    expect(store.get().projects[0].tools).toEqual(latest.tools);
    expect(saved()[0].name).toBe('Renamed');
  });

  it('ignores a deleted project selection and never restores it when saving from a stale tool', async () => {
    const store = await load();
    const first = store.create('Keep');
    const deleted = store.create('Delete');
    memory.set(KEY, JSON.stringify([first]));
    store.setActive(deleted.id);
    store.saveTool(deleted.id, '/trace-width', 'current=5');
    expect(saved().map(p => p.id)).toEqual([first.id]);
    expect(store.get().activeId).toBe(first.id);
    expect(store.get().projects[0].tools).toEqual([]);
  });

  it('refreshes when returning to a tab and when re-subscribing after navigation', async () => {
    const store = await load();
    store.create('Delete');
    unsubscribe = store.subscribe(() => {});
    memory.set(KEY, '[]');
    memory.delete(ACTIVE_KEY);
    events.dispatchEvent(new Event('focus'));
    expect(store.get()).toEqual({ projects: [], activeId: null });
    unsubscribe();
    store.create('Also delete');
    memory.set(KEY, '[]');
    unsubscribe = store.subscribe(() => {});
    expect(store.get()).toEqual({ projects: [], activeId: null });
  });

  it('removes all entries on a site-data clear event', async () => {
    const store = await load();
    store.create('Board');
    unsubscribe = store.subscribe(() => {});
    memory.clear();
    changed(null);
    expect(store.get()).toEqual({ projects: [], activeId: null });
  });

  it('keeps session projects usable when browser storage is blocked', async () => {
    storage.getItem.mockImplementation(() => { throw new Error('Blocked'); });
    storage.setItem.mockImplementation(() => { throw new Error('Blocked'); });
    const store = await load();
    const board = store.create('Board');
    store.rename(board.id, 'Renamed');
    expect(store.get().projects[0].name).toBe('Renamed');
    store.remove(board.id);
    expect(store.get()).toEqual({ projects: [], activeId: null });
  });

  it('preserves session edits when only storage writes are blocked and retries on the next edit', async () => {
    const store = await load();
    const persisted = store.create('Persisted');
    const write = storage.setItem.getMockImplementation()!;
    storage.setItem.mockImplementation(() => { throw new Error('Quota exceeded'); });
    const session = store.create('Session board');
    store.rename(session.id, 'Session renamed');
    expect(store.get().projects.map(p => p.name)).toEqual(['Persisted', 'Session renamed']);
    expect(saved().map(p => p.id)).toEqual([persisted.id]);
    storage.setItem.mockImplementation(write);
    store.rename(session.id, 'Saved again');
    expect(saved().map(p => p.name)).toEqual(['Persisted', 'Saved again']);
  });

  it('recovers from a non-array project value without crashing navigation', async () => {
    memory.set(KEY, '{}');
    memory.set(ACTIVE_KEY, JSON.stringify('deleted'));
    const store = await load();
    expect(store.get()).toEqual({ projects: [], activeId: null });
    store.create('Board');
    expect(saved()[0].name).toBe('Board');
  });
});
