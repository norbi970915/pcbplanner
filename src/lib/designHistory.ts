export interface HistoryStep { scope: string; before: unknown; after: unknown; }
export interface HistoryEntry { label: string; group?: string; steps: HistoryStep[]; }

/** Immutable input snapshots; a focused typing session is one reversible edit. */
export class DesignHistory {
  private entries: HistoryEntry[] = [];
  private cursor = 0;
  private limit: number;
  constructor(limit = 50) { this.limit = limit; }
  get undoEntry() { return this.entries[this.cursor - 1]; }
  get redoEntry() { return this.entries[this.cursor]; }
  clear() { this.entries = []; this.cursor = 0; }
  record(entry: HistoryEntry) {
    if (!entry.steps.length) return;
    const branching = this.cursor < this.entries.length;
    this.entries = this.entries.slice(0, this.cursor);
    const last = this.undoEntry;
    if (!branching && entry.group && last?.group === entry.group) {
      const steps = last.steps.map(step => ({ ...step }));
      for (const step of entry.steps) {
        const old = steps.find(s => s.scope === step.scope);
        if (old) old.after = step.after;
        else steps.push({ ...step });
      }
      const changed = steps.filter(step => !Object.is(step.before, step.after) && JSON.stringify(step.before) !== JSON.stringify(step.after));
      if (changed.length) this.entries[this.cursor - 1] = { ...last, steps: changed };
      else { this.entries.pop(); this.cursor--; }
    } else {
      this.entries.push(entry);
      this.cursor++;
      if (this.entries.length > this.limit) { this.entries.shift(); this.cursor--; }
    }
  }
  undo(apply: (scope: string, value: unknown) => void) {
    const entry = this.undoEntry;
    if (!entry) return;
    for (const step of [...entry.steps].reverse()) apply(step.scope, step.before);
    this.cursor--;
    return entry.label;
  }
  redo(apply: (scope: string, value: unknown) => void) {
    const entry = this.redoEntry;
    if (!entry) return;
    for (const step of entry.steps) apply(step.scope, step.after);
    this.cursor++;
    return entry.label;
  }
}
