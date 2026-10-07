export type ToolDefaults = Record<string, string | number | boolean>;

export function parseToolQuery<T extends ToolDefaults>(search: string, defaults: T): T {
  const q = new URLSearchParams(search);
  const out: ToolDefaults = { ...defaults };
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

/** Compact URLs for sharing; full snapshots keep defaults explicit when reopening a saved tool. */
export function encodeToolQuery<T extends ToolDefaults>(state: T, defaults: T, includeDefaults = false): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(state)) {
    const def = defaults[k];
    if (!includeDefaults) {
      if (v === def) continue;
      if (typeof v === 'number' && typeof def === 'number' && Number(v.toPrecision(7)) === Number(def.toPrecision(7))) continue;
    }
    if (typeof v === 'number') q.set(k, String(Number(v.toPrecision(7))));
    else if (typeof v === 'boolean') q.set(k, v ? '1' : '0');
    else q.set(k, v);
  }
  return q.toString();
}

export function normaliseToolQuery(search: string, defaults: ToolDefaults): string {
  return encodeToolQuery(parseToolQuery(search, defaults), defaults);
}
