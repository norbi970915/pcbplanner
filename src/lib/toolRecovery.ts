/** Clear only this tool's failed inputs and comparison; preserve other tools and saved constructions. */
export function clearFailedToolState(path: string, storage: Pick<Storage, 'removeItem'>) {
  for (const key of ['pcbplanner:tool:' + path, 'pcbplanner:comparison:' + path]) {
    try { storage.removeItem(key); } catch { /* Storage can be blocked. */ }
  }
}
