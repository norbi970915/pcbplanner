// The active KiCad project: one per browser, shared by the KiCad project page (/kicad-project), the
// KiCad impedance page and the "From KiCad project" sections of the tools.
//
// What is kept, and where (this browser only; nothing is uploaded):
//   IndexedDB database 'pcbplanner-kicad-project', object store 'active', two records:
//     'files'  { v: 1, boardName, boardText, projectName?, projectText?, otherBoards, savedAt }
//              the raw text of the .kicad_pcb and of the .kicad_pro (a board can be tens of MB, too
//              large for localStorage)
//     'roles'  { v: 1, boardName, roles }  the layer roles the user changed
//   The parsed board is never stored. On startup (the first subscriber) the texts are read back and
//   parsed again in the import worker, so a newer parser always reads the file afresh. Close removes
//   both records. Without IndexedDB (blocked storage, some private windows) or when the browser
//   refuses the size, the project lives in memory until the tab is closed.
// The names are new on purpose: the retired saved-projects feature used localStorage keys
// 'pcbtk-projects' and 'pcbtk-project-active', which src/lib/retiredBrowserData.ts still clears.
//
// Other tabs are told about a change over a BroadcastChannel and read the project again.
import { useSyncExternalStore } from 'react';
import type { KicadBoard } from '../lib/kicadImport';
import type { ProjectFile } from '../lib/kicadImportClient';
import type { KicadProjectData } from '../lib/kicadProjectQueries';
import type { KicadProject } from '../lib/kicadRouting';
import type { CopperRole } from '../lib/stackups';

export const KICAD_DB_NAME = 'pcbplanner-kicad-project';
export const KICAD_DB_STORE = 'active';
const CHANNEL = 'pcbplanner-kicad-project';
/** The board summary the KiCad impedance page kept per tab before the shared project; removed on start. */
const OLD_SESSION_KEY = 'pcbplanner:kicad-impedance:board';

export const KICAD_EXAMPLE = {
  board: { url: '/examples/pcbplanner-example-6layer.kicad_pcb', name: 'pcbplanner-example-6layer.kicad_pcb' },
  project: { url: '/examples/pcbplanner-example-6layer.kicad_pro', name: 'pcbplanner-example-6layer.kicad_pro' },
};

export type KicadProjectStatus = 'empty' | 'loading' | 'ready' | 'error';

export interface KicadProjectState {
  status: KicadProjectStatus;
  /** Known while loading, and once loaded. */
  boardName?: string;
  projectName?: string;
  /** The parsed project when status is 'ready'. */
  data: KicadProjectData | null;
  /** Why the last load failed. A failed replacement keeps the project that was loaded (status stays 'ready'). */
  error: string | null;
  /** The texts are saved in this browser (IndexedDB); false: memory only, gone when the tab closes. */
  persisted: boolean;
  /** Why the project is not saved, when it is not. */
  storageNote?: string;
}

/** Key-value storage for the two records; IndexedDB in the browser, a Map in tests and as the fallback. */
export interface KicadProjectStorage {
  kind: 'indexeddb' | 'memory';
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

interface FilesRecord {
  v: 1;
  boardName: string;
  boardText: string;
  projectName?: string;
  projectText?: string;
  otherBoards: string[];
  savedAt: number;
}
interface RolesRecord {
  v: 1;
  boardName: string;
  roles: Record<string, CopperRole>;
}

export function memoryStorage(): KicadProjectStorage {
  const m = new Map<string, unknown>();
  return {
    kind: 'memory',
    get: async (k) => m.get(k),
    set: async (k, v) => {
      m.set(k, v);
    },
    delete: async (k) => {
      m.delete(k);
    },
  };
}

/** IndexedDB storage, or null when the browser has none (or blocks it). */
export function indexedDbStorage(factory?: IDBFactory): KicadProjectStorage | null {
  let idb: IDBFactory | undefined;
  try {
    idb = factory ?? (typeof indexedDB !== 'undefined' ? indexedDB : undefined);
  } catch {
    idb = undefined;
  }
  if (!idb) return null;
  const f = idb;
  let db: Promise<IDBDatabase> | null = null;
  const open = () =>
    (db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = f.open(KICAD_DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(KICAD_DB_STORE)) req.result.createObjectStore(KICAD_DB_STORE);
      };
      req.onsuccess = () => {
        const d = req.result;
        // another tab upgrading the database: let it, and open again next time
        d.onversionchange = () => {
          d.close();
          db = null;
        };
        resolve(d);
      };
      req.onerror = () => {
        db = null;
        reject(req.error ?? new Error('IndexedDB could not be opened.'));
      };
      req.onblocked = () => {
        db = null;
        reject(new Error('IndexedDB is blocked by another tab.'));
      };
    }));
  const run = async <T>(mode: IDBTransactionMode, f2: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const d = await open();
    return new Promise<T>((resolve, reject) => {
      const tx = d.transaction(KICAD_DB_STORE, mode);
      const req = f2(tx.objectStore(KICAD_DB_STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? req.error ?? new Error('IndexedDB request failed.'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB request was aborted.'));
    });
  };
  return {
    kind: 'indexeddb',
    get: (k) => run('readonly', (s) => s.get(k)),
    set: async (k, v) => {
      await run('readwrite', (s) => s.put(v, k));
    },
    delete: async (k) => {
      await run('readwrite', (s) => s.delete(k));
    },
  };
}

export interface LoadOptions {
  /** Asked before a different loaded project is replaced; return false to keep it. */
  confirmReplace?: (current: string, next: string) => boolean;
}

export interface KicadProjectStore {
  subscribe(listener: () => void): () => void;
  get(): KicadProjectState;
  /** Read the saved project back (once; later calls return the same promise). */
  restore(): Promise<void>;
  /** Open a board, or a project: the .kicad_pcb and its .kicad_pro, or a whole folder. Resolves true when loaded. */
  load(files: ProjectFile[], opts?: LoadOptions): Promise<boolean>;
  /** Open the site's example project. */
  loadExample(opts?: LoadOptions): Promise<boolean>;
  /** Remove the project from this browser. */
  close(): Promise<void>;
  /** Change a layer's role; undefined (or the detected role) goes back to the detection. */
  setRole(layer: string, role: CopperRole | undefined, detected?: CopperRole): void;
  resetRoles(): void;
  clearError(): void;
}

const EMPTY: KicadProjectState = { status: 'empty', data: null, error: null, persisted: false };

const named = (b: Blob, name: string): ProjectFile => {
  const file = typeof File !== 'undefined' ? new File([b], name) : Object.assign(b, { name, lastModified: 0, webkitRelativePath: '' }) as unknown as File;
  return { file, name, path: name, size: b.size };
};

// the reader and the routing code load only when a project is opened, not with every page (the sidebar imports this store)
const routingLib = () => import('../lib/kicadRouting');
const readBoard = async (text: string) => (await import('../lib/kicadImportClient')).readKicadFile(new Blob([text], { type: 'text/plain' }));

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * A store over a storage adapter. `parseBoard` reads a board text (the import worker in the browser;
 * tests pass the parser itself). `channel` false: no cross-tab messages.
 */
export function createKicadProjectStore(o: {
  storage?: KicadProjectStorage | null;
  parseBoard?: (text: string) => Promise<KicadBoard>;
  fetcher?: typeof fetch;
  channel?: boolean;
} = {}): KicadProjectStore {
  let storage: KicadProjectStorage | null | undefined = o.storage;
  const parseBoard = o.parseBoard ?? readBoard;
  let state: KicadProjectState = EMPTY;
  const listeners = new Set<() => void>();
  let restoring: Promise<void> | null = null;
  let seq = 0;
  let bc: BroadcastChannel | null | undefined;
  // writes run one after another, so a close never races a save that is still going on
  let writes: Promise<unknown> = Promise.resolve();
  const queue = <T>(f: () => Promise<T>): Promise<T> => {
    const run = writes.then(f, f);
    writes = run.catch(() => undefined);
    return run;
  };

  const emit = (next: KicadProjectState) => {
    state = next;
    listeners.forEach((l) => l());
  };
  const patch = (p: Partial<KicadProjectState>) => emit({ ...state, ...p });

  /** Storage, chosen on first use: IndexedDB, else memory. */
  const store = (): KicadProjectStorage => {
    if (storage === undefined) storage = indexedDbStorage();
    if (!storage) storage = memoryStorage();
    return storage;
  };
  const channel = () => {
    if (o.channel === false) return null;
    if (bc !== undefined) return bc;
    try {
      bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;
      if (bc)
        bc.onmessage = (e: MessageEvent<{ type?: string }>) => {
          if (e.data?.type === 'project') void reread();
          else if (e.data?.type === 'roles') void rereadRoles();
        };
    } catch {
      bc = null;
    }
    return bc;
  };
  const tell = (type: 'project' | 'roles') => {
    try {
      channel()?.postMessage({ type });
    } catch {
      /* no other tabs to tell */
    }
  };
  const safe = async <T>(f: () => Promise<T>): Promise<{ ok: true; v: T } | { ok: false; error: string }> => {
    try {
      return { ok: true, v: await f() };
    } catch (e) {
      return { ok: false, error: messageOf(e) };
    }
  };

  /** Parse texts into project data. Throws with a plain message when the board is not readable. */
  const parse = async (rec: Omit<FilesRecord, 'v' | 'savedAt'>, roles: Record<string, CopperRole>): Promise<KicadProjectData> => {
    const [board, { parseKicadProject }] = await Promise.all([parseBoard(rec.boardText), routingLib()]);
    let project: KicadProject | null = null;
    let projectError: string | undefined;
    if (rec.projectName && rec.projectText !== undefined) {
      try {
        project = parseKicadProject(rec.projectText, rec.projectName);
      } catch (e) {
        projectError = messageOf(e);
      }
    }
    const known = new Set(board.copper.map((c) => c.name));
    const kept = Object.fromEntries(Object.entries(roles).filter(([k, v]) => known.has(k) && (v === 'plane' || v === 'signal')));
    return {
      boardName: rec.boardName,
      board,
      project,
      ...(rec.projectName ? { projectName: rec.projectName } : {}),
      ...(projectError ? { projectError } : {}),
      otherBoards: rec.otherBoards ?? [],
      roleOverrides: kept,
    };
  };

  const isFiles = (v: unknown): v is FilesRecord => !!v && typeof v === 'object' && (v as FilesRecord).v === 1 && typeof (v as FilesRecord).boardName === 'string' && typeof (v as FilesRecord).boardText === 'string';
  const isRoles = (v: unknown): v is RolesRecord => !!v && typeof v === 'object' && (v as RolesRecord).v === 1 && typeof (v as RolesRecord).roles === 'object' && (v as RolesRecord).roles !== null;

  /** Read the saved project and parse it (replaces what is shown). */
  const reread = async () => {
    const id = ++seq;
    const s = store();
    const files = await safe(() => s.get('files'));
    if (id !== seq) return;
    if (!files.ok) {
      // storage that cannot even be read: work in memory from now on
      storage = memoryStorage();
      if (state.status !== 'ready') emit({ ...EMPTY, storageNote: 'Browser storage is not available, so a project stays loaded only until this tab is closed.' });
      return;
    }
    if (!isFiles(files.v)) {
      if (state.data || state.status === 'loading') emit({ ...EMPTY, persisted: false });
      return;
    }
    const rec = files.v;
    patch({ status: 'loading', boardName: rec.boardName, projectName: rec.projectName, error: null });
    const roles = await safe(() => s.get('roles'));
    const saved = roles.ok && isRoles(roles.v) && roles.v.boardName === rec.boardName ? roles.v.roles : {};
    try {
      const data = await parse(rec, saved);
      if (id !== seq) return;
      emit({ status: 'ready', boardName: data.boardName, projectName: data.projectName, data, error: null, persisted: s.kind === 'indexeddb' });
    } catch (e) {
      if (id !== seq) return;
      emit({ ...EMPTY, status: 'error', boardName: rec.boardName, error: `The saved project ${rec.boardName} could not be read again: ${messageOf(e)} Load it again.` });
    }
  };
  const rereadRoles = async () => {
    const d = state.data;
    if (!d) return;
    const r = await safe(() => store().get('roles'));
    if (!r.ok || state.data !== d) return;
    const roles = isRoles(r.v) && r.v.boardName === d.boardName ? r.v.roles : {};
    emit({ ...state, data: { ...d, roleOverrides: roles } });
  };

  const writeRoles = (d: KicadProjectData) => {
    const s = store();
    void queue(() => safe(() => s.set('roles', { v: 1, boardName: d.boardName, roles: d.roleOverrides } satisfies RolesRecord))).then((r) => {
      if (r.ok) tell('roles');
    });
  };

  const api: KicadProjectStore = {
    subscribe(l) {
      listeners.add(l);
      if (!restoring) void api.restore();
      return () => {
        listeners.delete(l);
      };
    },
    get: () => state,
    restore() {
      if (!restoring) {
        try {
          if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(OLD_SESSION_KEY);
        } catch {
          /* storage blocked */
        }
        channel();
        restoring = reread();
      }
      return restoring;
    },
    async load(files, opts = {}) {
      const { pickProjectFiles } = await routingLib();
      const pick = pickProjectFiles(files);
      if (!pick.board) {
        const one = files.length === 1 ? files[0].name : null;
        patch({
          error: one
            ? `${one} is not a .kicad_pcb file. Choose the board file of a KiCad project (KiCad 6 to 10), or the whole project folder.`
            : `No .kicad_pcb file among the ${files.length} files. Choose the board file of a KiCad project (KiCad 6 to 10), or the whole project folder.`,
          ...(state.data ? {} : { status: 'error' as const }),
        });
        return false;
      }
      const current = state.data?.boardName ?? (state.status === 'loading' ? state.boardName : undefined);
      if (current && current !== pick.board.name && opts.confirmReplace && !opts.confirmReplace(current, pick.board.name)) return false;
      const id = ++seq;
      const before = state;
      patch({ status: 'loading', boardName: pick.board.name, projectName: pick.project?.name, error: null });
      try {
        const boardText = await pick.board.file.text();
        let projectText: string | undefined;
        let projectError: string | undefined;
        if (pick.project) {
          try {
            projectText = await pick.project.file.text();
          } catch {
            projectError = `${pick.project.name} could not be read.`;
          }
        }
        const rec: Omit<FilesRecord, 'v' | 'savedAt'> = { boardName: pick.board.name, boardText, projectName: projectText !== undefined ? pick.project?.name : undefined, projectText, otherBoards: pick.otherBoards };
        const data = await parse(rec, {});
        if (projectError) data.projectError = projectError;
        if (id !== seq) return false;
        emit({ status: 'ready', boardName: data.boardName, projectName: data.projectName, data, error: null, persisted: false });
        // save in the background; the project is usable meanwhile
        const s = store();
        const saved = await queue(() =>
          safe(async () => {
            if (id !== seq) return false;
            await s.delete('roles');
            await s.set('files', { v: 1, ...rec, savedAt: Date.now() } satisfies FilesRecord);
            return true;
          }),
        );
        if (id !== seq || (saved.ok && !saved.v)) return true;
        if (saved.ok) {
          patch({ persisted: s.kind === 'indexeddb', storageNote: s.kind === 'indexeddb' ? undefined : 'Browser storage is not available, so the project stays loaded only until this tab is closed.' });
          tell('project');
        } else {
          await queue(() => safe(() => s.delete('files')));
          patch({ persisted: false, storageNote: `The project could not be saved in this browser (${saved.error}), so it stays loaded only until this tab is closed.` });
        }
        return true;
      } catch (e) {
        if (id !== seq) return false;
        // keep the project that was loaded; say why the new one was not
        emit(before.data ? { ...before, error: messageOf(e) } : { ...EMPTY, status: 'error', boardName: pick.board.name, error: messageOf(e), storageNote: before.storageNote });
        return false;
      }
    },
    async loadExample(opts) {
      const get = o.fetcher ?? (typeof fetch !== 'undefined' ? fetch : undefined);
      if (!get) return false;
      try {
        const [r, rp] = await Promise.all([get(KICAD_EXAMPLE.board.url), get(KICAD_EXAMPLE.project.url)]);
        if (!r.ok) throw new Error(`The example could not be loaded (HTTP ${r.status}).`);
        const files = [named(await r.blob(), KICAD_EXAMPLE.board.name)];
        if (rp.ok) files.push(named(await rp.blob(), KICAD_EXAMPLE.project.name));
        return await api.load(files, opts);
      } catch (e) {
        patch({ error: messageOf(e), ...(state.data ? {} : { status: 'error' as const }) });
        return false;
      }
    },
    async close() {
      ++seq;
      emit({ ...EMPTY, storageNote: state.storageNote });
      const s = store();
      await queue(() =>
        safe(async () => {
          await s.delete('files');
          await s.delete('roles');
        }),
      );
      tell('project');
    },
    setRole(layer, role, detected) {
      const d = state.data;
      if (!d) return;
      const next = { ...d.roleOverrides };
      if (role === undefined || role === detected) delete next[layer];
      else next[layer] = role;
      const data = { ...d, roleOverrides: next };
      emit({ ...state, data });
      writeRoles(data);
    },
    resetRoles() {
      const d = state.data;
      if (!d || !Object.keys(d.roleOverrides).length) return;
      const data = { ...d, roleOverrides: {} };
      emit({ ...state, data });
      writeRoles(data);
    },
    clearError() {
      if (state.error) patch({ error: null, ...(state.status === 'error' ? { status: 'empty' as const } : {}) });
    },
  };
  return api;
}

let shared: KicadProjectStore | null = null;
/** The browser's store (created on first use, so importing this module touches no storage). */
export function kicadProjectStore(): KicadProjectStore {
  return (shared ??= createKicadProjectStore());
}

/** Ask before replacing a different loaded project (a native dialog: keyboard and screen-reader friendly). */
export const confirmReplace = (current: string, next: string) =>
  typeof window === 'undefined' || window.confirm(`Replace the loaded KiCad project ${current} with ${next}? The loaded project is removed from this browser.`);

const serverSnapshot = () => EMPTY;

/**
 * The active KiCad project and its actions. The first subscriber reads a saved project back and
 * parses it again in the import worker; until then the status is 'loading' (or 'empty').
 */
export function useKicadProject() {
  const s = kicadProjectStore();
  const state = useSyncExternalStore(s.subscribe, s.get, serverSnapshot);
  return {
    ...state,
    load: (files: ProjectFile[], opts: LoadOptions = { confirmReplace }) => s.load(files, opts),
    loadExample: (opts: LoadOptions = { confirmReplace }) => s.loadExample(opts),
    close: () => s.close(),
    setRole: s.setRole,
    resetRoles: s.resetRoles,
    clearError: s.clearError,
  };
}
