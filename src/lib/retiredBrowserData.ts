/** Remove records belonging to a retired feature without clearing unrelated work. */
export function clearRetiredBrowserData(local: Pick<Storage, 'removeItem' | 'getItem' | 'setItem'>, session: Pick<Storage, 'getItem' | 'setItem'>) {
  for (const key of ['pcbtk-projects', 'pcbtk-project-active']) {
    try { local.removeItem(key); } catch { /* Storage may be blocked. */ }
  }
  for (const [storage, key] of [[local, 'pcbtk-favorites'], [session, 'pcbtk-tabs']] as const) {
    try {
      const entries: unknown = JSON.parse(storage.getItem(key) ?? 'null');
      if (!Array.isArray(entries)) continue;
      const next = entries.filter(entry => entry !== '/projects');
      if (next.length !== entries.length) storage.setItem(key, JSON.stringify(next));
    } catch { /* Missing, malformed or blocked storage must not prevent startup. */ }
  }
}
