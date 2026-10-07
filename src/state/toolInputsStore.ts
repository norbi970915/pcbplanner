import { useCallback, useSyncExternalStore } from 'react';
import { encodeToolQuery, type ToolDefaults } from '../lib/toolInputs';

export interface ToolInputs {
  query: string;
  savedQuery: string;
  defaults: ToolDefaults;
}
const snapshots = new Map<string, ToolInputs>();
const listeners = new Map<string, Set<() => void>>();

export const toolInputsStore = {
  get: (path: string) => snapshots.get(path) ?? null,
  publish(path: string, state: ToolDefaults, defaults: ToolDefaults) {
    const query = encodeToolQuery(state, defaults);
    const savedQuery = encodeToolQuery(state, defaults, true);
    const previous = snapshots.get(path);
    if (previous?.query === query && previous.savedQuery === savedQuery) return;
    snapshots.set(path, { query, savedQuery, defaults });
    listeners.get(path)?.forEach(listener => listener());
  },
  subscribe(path: string, listener: () => void) {
    let subscribers = listeners.get(path);
    if (!subscribers) { subscribers = new Set(); listeners.set(path, subscribers); }
    subscribers.add(listener);
    return () => {
      subscribers.delete(listener);
      if (!subscribers.size) listeners.delete(path);
    };
  },
};

export function useToolInputs(path: string) {
  const subscribe = useCallback((listener: () => void) => toolInputsStore.subscribe(path, listener), [path]);
  const get = useCallback(() => toolInputsStore.get(path), [path]);
  return useSyncExternalStore(subscribe, get, () => null);
}
