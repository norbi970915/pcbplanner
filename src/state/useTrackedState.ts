import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type SetStateAction } from 'react';
import { useLocation } from 'react-router-dom';
import { emptyHistoryStatus, historyFor, observeEditing, recordChange } from './designHistoryStore';

export const sameDesignValue = (a: unknown, b: unknown) => Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b);

/** Track immutable design values, separate from transient UI state and solved results. */
export function useTrackedState<T>(scope: string, initial: T | (() => T), equal = sameDesignValue) {
  const { pathname } = useLocation();
  const [state, applyState] = useState(initial);
  const latest = useRef(state);
  const replace = useCallback((value: T, clear = true) => {
    const store = historyFor(pathname);
    if (clear && !equal(latest.current, value)) store.clear();
    latest.current = value;
    store.expected.set(scope, value);
    applyState(value);
  }, [pathname, scope, equal]);
  const set = useCallback((next: SetStateAction<T>, label?: string) => {
    const before = latest.current;
    const after = typeof next === 'function' ? (next as (prev: T) => T)(before) : next;
    if (equal(before, after)) return;
    latest.current = after;
    recordChange(pathname, { scope, before, after }, label);
    applyState(after);
  }, [pathname, scope, equal]);
  useEffect(() => {
    const store = historyFor(pathname);
    if (store.expected.has(scope) && !equal(store.expected.get(scope), latest.current)) store.clear();
    store.expected.set(scope, latest.current);
    const binding = { apply: (value: unknown) => { latest.current = value as T; applyState(value as T); } };
    store.bindings.set(scope, binding);
    store.publish();
    const stop = observeEditing();
    return () => {
      stop();
      if (store.bindings.get(scope) === binding) store.bindings.delete(scope);
      store.publish();
    };
  }, [pathname, scope, equal]);
  return [state, set, replace] as const;
}

export function useDesignHistory() {
  const { pathname } = useLocation();
  const store = historyFor(pathname);
  const subscribe = useCallback((listener: () => void) => {
    store.listeners.add(listener);
    return () => { store.listeners.delete(listener); };
  }, [store]);
  const status = useSyncExternalStore(subscribe, () => store.status, emptyHistoryStatus);
  return { ...status, pathname };
}
