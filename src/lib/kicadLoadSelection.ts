/** Reference prefixes are suggestions, never an inference of a part's actual operating current. */
export function preferredLoads<T extends { ref: string }>(parts: T[]): T[] {
  const rank = (ref: string) => /^(U|IC|Q)\d/i.test(ref) ? 0 : /^(D|R)\d/i.test(ref) ? 1 : 2;
  return parts.slice().sort((a, b) => rank(a.ref) - rank(b.ref));
}

/** Distribute only over parts the user explicitly selected. Capacitors are never silently added. */
export function spreadSelectedLoads(loads: { ref: string; amps: number }[], total: number) {
  if (!loads.length || !Number.isFinite(total) || total <= 0) return loads;
  return loads.map(load => ({ ...load, amps: total / loads.length }));
}
