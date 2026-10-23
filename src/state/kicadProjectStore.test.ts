/// <reference types="node" />
import { describe, expect, it, vi } from 'vitest';
import { exampleBoard, exampleProject, EXAMPLE_FILE, EXAMPLE_PROJECT_FILE } from '../lib/kicadExample';
import { parseKicadBoard } from '../lib/kicadImport';
import type { ProjectFile } from '../lib/kicadImportClient';
import { createKicadProjectStore, indexedDbStorage, memoryStorage, type KicadProjectStorage } from './kicadProjectStore';

const file = (name: string, text: string, path = name): ProjectFile => {
  const f = new File([text], name);
  return { file: f, name, path, size: f.size };
};
const example = () => [file(EXAMPLE_FILE, exampleBoard()), file(EXAMPLE_PROJECT_FILE, exampleProject())];
const parseBoard = async (t: string) => parseKicadBoard(t);
/** Browser storage that survives a "reload": two stores over the same records. */
const persistent = (): KicadProjectStorage => ({ ...memoryStorage(), kind: 'indexeddb' });
const make = (storage: KicadProjectStorage | null) => createKicadProjectStore({ storage, parseBoard, channel: false });
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('KiCad project store', () => {
  it('starts empty; load parses the board and the project file', async () => {
    const s = make(persistent());
    await s.restore();
    expect(s.get().status).toBe('empty');
    expect(await s.load(example())).toBe(true);
    const st = s.get();
    expect(st.status).toBe('ready');
    expect(st.boardName).toBe(EXAMPLE_FILE);
    expect(st.projectName).toBe(EXAMPLE_PROJECT_FILE);
    expect(st.data!.board.copper).toHaveLength(6);
    expect(st.data!.project!.classes.map((c) => c.name)).toContain('USB');
    expect(st.data!.board.routing!.pairs).toHaveLength(3);
    expect(st.persisted).toBe(true);
  });

  it('keeps the raw texts, not the parsed board, and survives a reload with the layer roles', async () => {
    const storage = persistent();
    const a = make(storage);
    await a.restore();
    await a.load(example());
    a.setRole('In2.Cu', 'plane', 'signal');
    await settle();
    const rec = (await storage.get('files')) as Record<string, unknown>;
    expect(rec).toMatchObject({ v: 1, boardName: EXAMPLE_FILE, projectName: EXAMPLE_PROJECT_FILE, boardText: exampleBoard(), projectText: exampleProject() });
    expect(rec).not.toHaveProperty('board');
    // a new visit: a new store over the same storage parses the texts again
    const parse = vi.fn(parseBoard);
    const b = createKicadProjectStore({ storage, parseBoard: parse, channel: false });
    expect(b.get().status).toBe('empty');
    await b.restore();
    expect(parse).toHaveBeenCalledTimes(1);
    expect(b.get().status).toBe('ready');
    expect(b.get().data!.boardName).toBe(EXAMPLE_FILE);
    expect(b.get().data!.project!.name).toBe(EXAMPLE_PROJECT_FILE);
    expect(b.get().data!.roleOverrides).toEqual({ 'In2.Cu': 'plane' });
    // back to the detected role
    b.setRole('In2.Cu', 'signal', 'signal');
    await settle();
    const c = make(storage);
    await c.restore();
    expect(c.get().data!.roleOverrides).toEqual({});
  });

  it('close removes the project from storage and from every subscriber', async () => {
    const storage = persistent();
    const s = make(storage);
    await s.restore();
    await s.load(example());
    s.setRole('F.Cu', 'plane', 'signal');
    const seen: string[] = [];
    s.subscribe(() => seen.push(s.get().status));
    await s.close();
    expect(s.get()).toMatchObject({ status: 'empty', data: null, error: null });
    expect(seen).toContain('empty');
    expect(await storage.get('files')).toBeUndefined();
    expect(await storage.get('roles')).toBeUndefined();
    const again = make(storage);
    await again.restore();
    expect(again.get().status).toBe('empty');
  });

  it('a close right after a load is not undone by the save still going on', async () => {
    const base = persistent();
    // a slow disk: every write takes a while
    const storage: KicadProjectStorage = { ...base, set: (k, v) => new Promise((r) => setTimeout(() => void base.set(k, v).then(r), 30)) };
    const s = make(storage);
    await s.restore();
    const loading = s.load(example());
    await new Promise<void>((resolve) => {
      const stop = s.subscribe(() => {
        if (s.get().status === 'ready') {
          stop();
          resolve();
        }
      });
    });
    // the project is shown, its save is still under way: close now
    await s.close();
    await loading;
    await new Promise((r) => setTimeout(r, 60));
    expect(s.get().status).toBe('empty');
    expect(await base.get('files')).toBeUndefined();
  });

  it('asks before replacing a different project; same board name reloads without asking', async () => {
    const s = make(persistent());
    await s.restore();
    await s.load(example());
    const no = vi.fn(() => false);
    expect(await s.load([file('other.kicad_pcb', exampleBoard())], { confirmReplace: no })).toBe(false);
    expect(no).toHaveBeenCalledWith(EXAMPLE_FILE, 'other.kicad_pcb');
    expect(s.get().data!.boardName).toBe(EXAMPLE_FILE);
    const yes = vi.fn(() => true);
    expect(await s.load([file('other.kicad_pcb', exampleBoard())], { confirmReplace: yes })).toBe(true);
    expect(s.get().data!.boardName).toBe('other.kicad_pcb');
    expect(s.get().data!.project).toBeNull();
    const ask = vi.fn(() => false);
    expect(await s.load([file('other.kicad_pcb', exampleBoard())], { confirmReplace: ask })).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  it('a file that is not a board is an error; a failed replacement keeps the loaded project', async () => {
    const s = make(persistent());
    await s.restore();
    expect(await s.load([file('notes.txt', 'hello')])).toBe(false);
    expect(s.get().status).toBe('error');
    expect(s.get().error).toMatch(/notes\.txt is not a \.kicad_pcb file/);
    await s.load(example());
    expect(await s.load([file('broken.kicad_pcb', '(kicad_pcb (version 20240108)')], { confirmReplace: () => true })).toBe(false);
    expect(s.get().status).toBe('ready');
    expect(s.get().data!.boardName).toBe(EXAMPLE_FILE);
    expect(s.get().error).toMatch(/truncated/);
    s.clearError();
    expect(s.get().error).toBeNull();
  });

  it('a project folder: the board with a project of the same name, backups ignored', async () => {
    const s = make(persistent());
    await s.restore();
    await s.load([
      file(EXAMPLE_FILE, exampleBoard(), `proj/${EXAMPLE_FILE}`),
      file(EXAMPLE_PROJECT_FILE, exampleProject(), `proj/${EXAMPLE_PROJECT_FILE}`),
      file('old.kicad_pcb', exampleBoard(), 'proj/proj-backups/old.kicad_pcb'),
      file('sub.kicad_pcb', exampleBoard(), 'proj/sub/sub.kicad_pcb'),
    ]);
    expect(s.get().data).toMatchObject({ boardName: EXAMPLE_FILE, projectName: EXAMPLE_PROJECT_FILE, otherBoards: ['proj/sub/sub.kicad_pcb'] });
  });

  it('works in memory when the browser has no storage, or refuses to save', async () => {
    // no IndexedDB in this test environment: the store falls back to memory
    expect(indexedDbStorage()).toBeNull();
    const s = make(null);
    await s.restore();
    expect(await s.load(example())).toBe(true);
    expect(s.get()).toMatchObject({ status: 'ready', persisted: false });
    expect(s.get().storageNote).toMatch(/until this tab is closed/);

    const full: KicadProjectStorage = {
      kind: 'indexeddb',
      get: async () => undefined,
      set: async () => {
        throw new Error('QuotaExceededError');
      },
      delete: async () => {},
    };
    const q = make(full);
    await q.restore();
    expect(await q.load(example())).toBe(true);
    expect(q.get()).toMatchObject({ status: 'ready', persisted: false });
    expect(q.get().storageNote).toMatch(/could not be saved.*QuotaExceededError/);

    const blocked: KicadProjectStorage = {
      kind: 'indexeddb',
      get: async () => {
        throw new Error('SecurityError');
      },
      set: async () => {
        throw new Error('SecurityError');
      },
      delete: async () => {
        throw new Error('SecurityError');
      },
    };
    const b = make(blocked);
    await b.restore();
    expect(b.get().status).toBe('empty');
    expect(await b.load(example())).toBe(true);
    expect(b.get().status).toBe('ready');
    expect(b.get().persisted).toBe(false);
  });

  it('a damaged saved record is ignored; a saved board that no longer parses is an error with the name', async () => {
    const storage = persistent();
    await storage.set('files', { v: 1, boardName: 7 });
    const a = make(storage);
    await a.restore();
    expect(a.get().status).toBe('empty');
    await storage.set('files', { v: 1, boardName: 'gone.kicad_pcb', boardText: 'not a board', otherBoards: [], savedAt: 0 });
    const b = make(storage);
    await b.restore();
    expect(b.get()).toMatchObject({ status: 'error', boardName: 'gone.kicad_pcb' });
    expect(b.get().error).toMatch(/gone\.kicad_pcb could not be read again/);
  });

  it('roles for layers the board does not have are dropped on restore', async () => {
    const storage = persistent();
    const a = make(storage);
    await a.restore();
    await a.load(example());
    await storage.set('roles', { v: 1, boardName: EXAMPLE_FILE, roles: { 'In2.Cu': 'plane', 'In9.Cu': 'plane', 'F.Cu': 'bogus' } });
    const b = make(storage);
    await b.restore();
    expect(b.get().data!.roleOverrides).toEqual({ 'In2.Cu': 'plane' });
  });

  it('the example loads through the fetcher', async () => {
    const fetcher = (async (url: string) => {
      const text = url.endsWith('.kicad_pcb') ? exampleBoard() : exampleProject();
      return new Response(text, { status: 200 });
    }) as unknown as typeof fetch;
    const s = createKicadProjectStore({ storage: persistent(), parseBoard, channel: false, fetcher });
    await s.restore();
    expect(await s.loadExample()).toBe(true);
    expect(s.get().data).toMatchObject({ boardName: 'LinkBench-4.kicad_pcb', projectName: 'LinkBench-4.kicad_pro' });
  });
});
