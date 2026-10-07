import { useSyncExternalStore } from 'react';
import { isStackup } from '../lib/stackupFile';
import type { Stackup } from '../lib/stackups';

/** One tool's inputs, exactly as they appear in its URL. */
export interface SavedTool {
  path: string; // e.g. "/impedance"
  query: string; // the search string without "?"
  note?: string;
  updated: number;
}

export interface Project {
  id: string;
  name: string;
  created: number;
  updated: number;
  tools: SavedTool[];
}

export interface ProjectFile {
  app: 'pcbplanner';
  version: 1;
  exported: string;
  projects: Project[];
  /** custom stackups, so a project file opens with its own materials on another machine */
  stackups: Stackup[];
}

const KEY = 'pcbtk-projects';
const ACTIVE_KEY = 'pcbtk-project-active';

const isTool = (t: unknown): t is SavedTool =>
  !!t && typeof t === 'object' && typeof (t as SavedTool).path === 'string' && (t as SavedTool).path.startsWith('/') && typeof (t as SavedTool).query === 'string';

export const isProject = (p: unknown): p is Project =>
  !!p &&
  typeof p === 'object' &&
  typeof (p as Project).id === 'string' &&
  typeof (p as Project).name === 'string' &&
  Array.isArray((p as Project).tools) &&
  (p as Project).tools.every(isTool);

/** Contents of a project file. */
export function serialiseProjects(projects: Project[], stackups: Stackup[]): string {
  const file: ProjectFile = { app: 'pcbplanner', version: 1, exported: new Date().toISOString(), projects, stackups };
  return JSON.stringify(file, null, 2);
}

/** Read a project file; returns a message instead of throwing when it is not one. */
export function parseProjectFile(text: string): { projects: Project[]; stackups: Stackup[] } | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: 'That file is not valid JSON.' };
  }
  const f = data as Partial<ProjectFile>;
  if (!f || f.app !== 'pcbplanner') return { error: 'That file was not exported from pcbplanner.' };
  if (f.version !== 1) return { error: `Unsupported project file version (${String(f.version)}).` };
  const projects = Array.isArray(f.projects) ? f.projects.filter(isProject) : [];
  if (!projects.length) return { error: 'The file contains no projects.' };
  const stackups = Array.isArray(f.stackups) ? f.stackups.filter(isStackup) : [];
  return { projects, stackups };
}

/** Keep ids and names unique when importing into a store that may already hold them. */
export function mergeProjects(existing: Project[], incoming: Project[]): Project[] {
  const ids = new Set(existing.map((p) => p.id));
  const names = new Set(existing.map((p) => p.name));
  const added = incoming.map((p) => {
    const id = ids.has(p.id) ? `${p.id}-${Math.random().toString(36).slice(2, 7)}` : p.id;
    let name = p.name;
    if (names.has(name)) {
      let n = 2;
      while (names.has(`${p.name} (${n})`)) n++;
      name = `${p.name} (${n})`;
    }
    ids.add(id);
    names.add(name);
    return { ...p, id, name };
  });
  return [...existing, ...added];
}

function read<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return (v as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function readProjects(fallback: Project[]): Project[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter(isProject) : [];
  } catch {
    return fallback;
  }
}

function validActiveId(stored: unknown, list: Project[]): string | null {
  return typeof stored === 'string' && list.some((project) => project.id === stored)
    ? stored
    : list[0]?.id ?? null;
}

let projects = readProjects([]);
let activeId = validActiveId(read<unknown>(ACTIVE_KEY, null), projects);
let snapshot = { projects, activeId };
const listeners = new Set<() => void>();
let hasUnstoredChanges = false;

/** Read the latest state before editing so a stale tab cannot restore a deleted project. */
function syncFromStorage() {
  // Keep session changes when storage writes are blocked; later edits retry saving.
  if (hasUnstoredChanges) return;
  const nextProjects = readProjects(projects);
  const nextActiveId = validActiveId(read<unknown>(ACTIVE_KEY, activeId), nextProjects);
  if (nextActiveId === activeId && JSON.stringify(nextProjects) === JSON.stringify(projects)) return;
  projects = nextProjects;
  activeId = nextActiveId;
  snapshot = { projects, activeId };
  listeners.forEach((listener) => listener());
}

function onStorage(event: StorageEvent) {
  if (event.key === KEY || event.key === ACTIVE_KEY || event.key === null) syncFromStorage();
}

function commit() {
  activeId = validActiveId(activeId, projects);
  snapshot = { projects, activeId };
  try {
    localStorage.setItem(KEY, JSON.stringify(projects));
    if (activeId) localStorage.setItem(ACTIVE_KEY, JSON.stringify(activeId));
    else localStorage.removeItem(ACTIVE_KEY);
    hasUnstoredChanges = false;
  } catch {
    hasUnstoredChanges = true;
    /* storage unavailable (private window, blocked site data) */
  }
  listeners.forEach((l) => l());
}

const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const projectStore = {
  subscribe(l: () => void) {
    if (!listeners.size && typeof window !== 'undefined') {
      window.addEventListener('storage', onStorage);
      window.addEventListener('focus', syncFromStorage);
      syncFromStorage();
    }
    listeners.add(l);
    return () => {
      listeners.delete(l);
      if (!listeners.size && typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorage);
        window.removeEventListener('focus', syncFromStorage);
      }
    };
  },
  get: () => snapshot,
  create(name: string): Project {
    syncFromStorage();
    const now = Date.now();
    const p: Project = { id: newId(), name: name.trim() || 'New project', created: now, updated: now, tools: [] };
    projects = [...projects, p];
    activeId = p.id;
    commit();
    return p;
  },
  rename(id: string, name: string) {
    syncFromStorage();
    projects = projects.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name, updated: Date.now() } : p));
    commit();
  },
  remove(id: string) {
    syncFromStorage();
    projects = projects.filter((p) => p.id !== id);
    if (activeId === id) activeId = projects[0]?.id ?? null;
    commit();
  },
  setActive(id: string | null) {
    syncFromStorage();
    activeId = id;
    commit();
  },
  /** Store a tool's current inputs in a project, replacing an earlier entry for the same tool. */
  saveTool(id: string, path: string, query: string, note?: string) {
    syncFromStorage();
    const entry: SavedTool = { path, query, note, updated: Date.now() };
    projects = projects.map((p) => (p.id === id ? { ...p, updated: Date.now(), tools: [...p.tools.filter((t) => t.path !== path), entry] } : p));
    commit();
  },
  removeTool(id: string, path: string) {
    syncFromStorage();
    projects = projects.map((p) => (p.id === id ? { ...p, updated: Date.now(), tools: p.tools.filter((t) => t.path !== path) } : p));
    commit();
  },
  import(incoming: Project[]) {
    syncFromStorage();
    projects = mergeProjects(projects, incoming);
    activeId = activeId ?? projects[0]?.id ?? null;
    commit();
  },
};

export function useProjects() {
  return useSyncExternalStore(projectStore.subscribe, projectStore.get, projectStore.get);
}
