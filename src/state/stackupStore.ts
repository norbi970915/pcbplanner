import { useSyncExternalStore } from 'react';
import { isStackup } from '../lib/stackupFile';
import { FLEX_PRESETS } from '../data/flexStackups';
import { PRESETS, type Stackup } from '../lib/stackups';

const KEY = 'pcbtk-stackups';
let custom: Stackup[] = load();
const listeners = new Set<() => void>();
let snapshot: Stackup[] = [...PRESETS, ...FLEX_PRESETS, ...custom];

function load(): Stackup[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter(isStackup) : [];
  } catch {
    return [];
  }
}

function commit() {
  snapshot = [...PRESETS, ...FLEX_PRESETS, ...custom];
  try {
    localStorage.setItem(KEY, JSON.stringify(custom));
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l());
}

export const stackupStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: () => snapshot,
  save(s: Stackup) {
    const copy = { ...s, builtin: false };
    const i = custom.findIndex((c) => c.id === s.id);
    custom = i >= 0 ? custom.map((c, n) => (n === i ? copy : c)) : [...custom, copy];
    commit();
  },
  remove(id: string) {
    custom = custom.filter((c) => c.id !== id);
    commit();
  },
};

export function useStackups() {
  return useSyncExternalStore(stackupStore.subscribe, stackupStore.get, stackupStore.get);
}
