import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

type Primitive = string | number | boolean;
const SESSION_PREFIX = 'pcbplanner:tool:';

export function toolSessionKey(path: string): string {
  return `${SESSION_PREFIX}${path}`;
}

function parse<T extends Record<string, Primitive>>(search: string, defaults: T): T {
  const q = new URLSearchParams(search);
  const out: Record<string, Primitive> = { ...defaults };
  for (const [k, def] of Object.entries(defaults)) {
    const raw = q.get(k);
    if (raw === null) continue;
    if (typeof def === 'number') {
      const n = Number(raw);
      if (Number.isFinite(n)) out[k] = n;
    } else if (typeof def === 'boolean') {
      out[k] = raw === '1' || raw === 'true';
    } else {
      out[k] = raw;
    }
  }
  return out as T;
}

function encode<T extends Record<string, Primitive>>(state: T, defaults: T): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(state)) {
    if (v === defaults[k]) continue;
    if (typeof v === 'number') q.set(k, String(Number(v.toPrecision(7))));
    else if (typeof v === 'boolean') q.set(k, v ? '1' : '0');
    else q.set(k, v);
  }
  return q.toString();
}

/** An explicit tool query is a shareable result and takes priority over the session. */
export function restoreToolState<T extends Record<string, Primitive>>(search: string, stored: string | null, defaults: T): T {
  const query = new URLSearchParams(search);
  const hasToolParams = Object.keys(defaults).some((key) => query.has(key));
  if (hasToolParams && query.get('handoff') !== '1') return parse(search, defaults);
  if (!stored) return hasToolParams ? parse(search, defaults) : { ...defaults };
  try {
    const saved: unknown = JSON.parse(stored);
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return hasToolParams ? parse(search, defaults) : { ...defaults };
    const out: Record<string, Primitive> = { ...defaults };
    for (const [key, def] of Object.entries(defaults)) {
      const value = (saved as Record<string, unknown>)[key];
      if (typeof value === typeof def && (typeof value !== 'number' || Number.isFinite(value))) out[key] = value as Primitive;
    }
    return hasToolParams ? parse(search, out as T) : out as T;
  } catch {
    return hasToolParams ? parse(search, defaults) : { ...defaults };
  }
}

function readSession(path: string): string | null {
  try {
    return sessionStorage.getItem(toolSessionKey(path));
  } catch {
    return null;
  }
}

function saveSession<T extends Record<string, Primitive>>(path: string, state: T, defaults: T) {
  try {
    const key = toolSessionKey(path);
    if (Object.keys(defaults).every((name) => state[name] === defaults[name])) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* storage unavailable: the URL still carries the current result */
  }
}

/**
 * Tool state mirrored into the URL for sharing and sessionStorage for
 * returning to a tool during this browser tab's session.
 */
/** Event fired after a reset so input fields re-display their values. */
export const RESET_EVENT = 'pcbplanner:reset';

export function useUrlState<T extends Record<string, Primitive>>(defaults: T) {
  const defaultsRef = useRef(defaults);
  const location = useLocation();
  const path = location.pathname;
  const [state, setState] = useState<T>(() => restoreToolState(window.location.search, readSession(path), defaults));
  const navigationKey = useRef(location.key);

  useEffect(() => {
    if (navigationKey.current === location.key) return;
    navigationKey.current = location.key;
    setState(restoreToolState(location.search, readSession(path), defaultsRef.current));
  }, [location.key, location.search, path]);

  useEffect(() => {
    saveSession(path, state, defaultsRef.current);
    const t = setTimeout(() => {
      const q = encode(state, defaultsRef.current);
      const url = path + (q ? `?${q}` : '') + window.location.hash;
      window.history.replaceState(window.history.state, '', url);
    }, 250);
    return () => clearTimeout(t);
  }, [path, state]);

  const set = useCallback((patch: Partial<T>) => setState((s) => ({ ...s, ...patch })), []);
  const reset = useCallback(() => {
    setState(defaultsRef.current);
    saveSession(path, defaultsRef.current, defaultsRef.current);
    // after the re-render, tell every field to re-display its value (clears unparsable text)
    setTimeout(() => window.dispatchEvent(new Event(RESET_EVENT)), 0);
  }, [path]);
  return [state, set, reset] as const;
}
