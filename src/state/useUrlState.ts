import { useCallback, useEffect, useRef, useState } from 'react';

type Primitive = string | number | boolean;

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

/**
 * Tool state mirrored into the URL query string, so every result has a
 * shareable link. Only values that differ from the defaults are written.
 */
export function useUrlState<T extends Record<string, Primitive>>(defaults: T) {
  const defaultsRef = useRef(defaults);
  const [state, setState] = useState<T>(() => parse(window.location.search, defaults));

  useEffect(() => {
    const t = setTimeout(() => {
      const q = encode(state, defaultsRef.current);
      const url = window.location.pathname + (q ? `?${q}` : '') + window.location.hash;
      window.history.replaceState(window.history.state, '', url);
    }, 250);
    return () => clearTimeout(t);
  }, [state]);

  const set = useCallback((patch: Partial<T>) => setState((s) => ({ ...s, ...patch })), []);
  const reset = useCallback(() => setState(defaultsRef.current), []);
  return [state, set, reset] as const;
}
