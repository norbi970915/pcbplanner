import { useSyncExternalStore } from 'react';
import { TOOLS } from '../tools/registry';

const KEY = 'pcbtk-favorites';
const knownPaths = new Set(TOOLS.map((tool) => tool.path));
const empty: readonly string[] = [];
const listeners = new Set<() => void>();

function parse(value: string | null): readonly string[] {
  try {
    const data: unknown = JSON.parse(value ?? '[]');
    return Array.isArray(data)
      ? [...new Set(data.filter((path): path is string => typeof path === 'string' && knownPaths.has(path)))]
      : empty;
  } catch {
    return empty;
  }
}

function read(fallback: readonly string[]): readonly string[] {
  try {
    return parse(localStorage.getItem(KEY));
  } catch {
    return fallback;
  }
}

let snapshot = read(empty);
function update(next: readonly string[]) {
  if (next.length === snapshot.length && next.every((path, index) => path === snapshot[index])) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}
function onStorage(event: StorageEvent) {
  if (event.key === KEY || event.key === null) update(read(snapshot));
}

export const favoritesStore = {
  subscribe(listener: () => void) {
    if (!listeners.size && typeof window !== 'undefined') {
      window.addEventListener('storage', onStorage);
      // Catch changes made while no favorites UI was mounted.
      snapshot = read(snapshot);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (!listeners.size && typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
    };
  },
  get: () => snapshot,
  toggle(path: string) {
    if (!knownPaths.has(path)) return;
    const current = read(snapshot);
    const next = current.includes(path) ? current.filter((item) => item !== path) : [...current, path];
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Keep favorites usable in this session when browser storage is blocked.
    }
    update(next);
  },
};

export function useFavorites() {
  return useSyncExternalStore(favoritesStore.subscribe, favoritesStore.get, () => empty);
}
