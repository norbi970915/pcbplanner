export type ComparisonState = Record<string, string | number | boolean>;
export interface ComparisonRow {
  id: string;
  label: string;
  value: string | number | boolean | null;
  unit?: string;
}
export interface ComparisonDesign<S extends ComparisonState = ComparisonState> {
  state: S;
  inputs: ComparisonRow[];
  results: ComparisonRow[];
}
export const comparisonRow = (id: string, label: string, value: ComparisonRow['value'], unit?: string): ComparisonRow =>
  ({ id, label, value: typeof value === 'number' && !Number.isFinite(value) ? null : value, unit });

export function snapshotDesign<S extends ComparisonState>(design: ComparisonDesign<S>): ComparisonDesign<S> {
  return { state: { ...design.state }, inputs: design.inputs.map(row => ({ ...row })), results: design.results.map(row => ({ ...row })) };
}

export function sameComparisonValue(a?: ComparisonRow, b?: ComparisonRow): boolean {
  if (!a || !b || a.unit !== b.unit) return false;
  if (typeof a.value === 'number' && typeof b.value === 'number') {
    return Math.abs(a.value - b.value) <= Math.max(1e-12, Math.max(Math.abs(a.value), Math.abs(b.value)) * 1e-10);
  }
  return a.value === b.value;
}

export function comparisonRows(a: ComparisonRow[], b: ComparisonRow[]) {
  const old = new Map(a.map(row => [row.id, row]));
  const live = new Map(b.map(row => [row.id, row]));
  return [...new Set([...old.keys(), ...live.keys()])].map(id => ({
    id, a: old.get(id), b: live.get(id), changed: !sameComparisonValue(old.get(id), live.get(id)),
  }));
}

/** Absolute deltas only: temperatures, percentages and zero baselines stay unambiguous. */
export function comparisonDelta(a?: ComparisonRow, b?: ComparisonRow): number | null {
  if (!a || !b || a.unit !== b.unit || typeof a.value !== 'number' || typeof b.value !== 'number') return null;
  if (!Number.isFinite(a.value) || !Number.isFinite(b.value)) return null;
  return sameComparisonValue(a, b) ? 0 : b.value - a.value;
}

export function decodeComparison<S extends ComparisonState>(stored: string | null, expected: S): ComparisonDesign<S> | null {
  try {
    const record = JSON.parse(stored || 'null');
    if (record?.version !== 1 || !record.design) return null;
    const d = record.design;
    const keys = Object.keys(expected);
    if (!d.state || Object.keys(d.state).length !== keys.length || keys.some(key =>
      typeof d.state[key] !== typeof expected[key] || (typeof d.state[key] === 'number' && !Number.isFinite(d.state[key])))) return null;
    const validRows = (rows: unknown): rows is ComparisonRow[] => Array.isArray(rows) && rows.length <= 100 &&
      new Set(rows.map(row => row?.id)).size === rows.length && rows.every(row =>
        row && typeof row.id === 'string' && typeof row.label === 'string' &&
        (row.unit === undefined || typeof row.unit === 'string') &&
        (row.value === null || typeof row.value === 'string' || typeof row.value === 'boolean' ||
          (typeof row.value === 'number' && Number.isFinite(row.value))));
    return validRows(d.inputs) && validRows(d.results) ? snapshotDesign(d) : null;
  } catch { return null; }
}
