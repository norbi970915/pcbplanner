import { DesignHistory, type HistoryEntry, type HistoryStep } from '../lib/designHistory';

export const REFRESH_INPUTS_EVENT = 'pcbplanner:reset';
type Binding = { apply: (value: unknown) => void };
export interface HistoryStatus {
  enabled: boolean; canUndo: boolean; canRedo: boolean; hasDraft?: boolean;
  undoLabel?: string; redoLabel?: string; message: string;
}
const EMPTY: HistoryStatus = { enabled: false, canUndo: false, canRedo: false, message: '' };
export const emptyHistoryStatus = () => EMPTY;
class ToolHistory {
  history = new DesignHistory();
  bindings = new Map<string, Binding>();
  expected = new Map<string, unknown>();
  listeners = new Set<() => void>();
  status: HistoryStatus = EMPTY;
  pending: HistoryEntry | null = null;
  publish(message = this.status.message) {
    const ready = (entry?: HistoryEntry) => !!entry && entry.steps.every(step => this.bindings.has(step.scope));
    this.status = { enabled: this.bindings.size > 0, hasDraft: this.bindings.size > 0 && !!document.querySelector('[data-uncommitted-input="true"]'), canUndo: ready(this.history.undoEntry),
      canRedo: ready(this.history.redoEntry), undoLabel: this.history.undoEntry?.label,
      redoLabel: this.history.redoEntry?.label, message };
    for (const listener of this.listeners) listener();
  }
  clear() { this.history.clear(); this.publish(''); }
}
const histories = new Map<string, ToolHistory>();
export function historyFor(path: string) {
  let history = histories.get(path);
  if (!history) { history = new ToolHistory(); histories.set(path, history); }
  return history;
}

let editEpoch = 0;
let observers = 0;
let draftObserver: MutationObserver | undefined;
const updateDraft = () => {
  const hasDraft = !!document.querySelector('[data-uncommitted-input="true"]');
  for (const store of histories.values()) if (store.bindings.size && !!store.status.hasDraft !== hasDraft) store.publish();
};
const newEdit = () => { editEpoch++; };
export function observeEditing() {
  if (observers++ === 0) {
    draftObserver = new MutationObserver(updateDraft);
    draftObserver.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-uncommitted-input'] });
    document.addEventListener('focusin', newEdit);
    document.addEventListener('focusout', newEdit);
    document.addEventListener('pointerdown', newEdit, true);
  }
  return () => {
    if (--observers === 0) {
      draftObserver?.disconnect();
      draftObserver = undefined;
      document.removeEventListener('focusin', newEdit);
      document.removeEventListener('focusout', newEdit);
      document.removeEventListener('pointerdown', newEdit, true);
    }
  };
}
export function currentEdit() {
  const field = document.activeElement;
  const typing = field instanceof HTMLTextAreaElement || (field instanceof HTMLInputElement &&
    !['checkbox', 'radio', 'file', 'button', 'submit', 'reset', 'color'].includes(field.type));
  const label = typing ? field.labels?.[0]?.textContent?.trim() || field.getAttribute('aria-label') : null;
  return { group: typing ? String(editEpoch) : undefined, label: label ? 'Change ' + label : 'Change inputs' };
}
export function recordChange(path: string, step: HistoryStep, label?: string) {
  const store = historyFor(path);
  store.expected.set(step.scope, step.after);
  if (store.pending) {
    const existing = store.pending.steps.find(s => s.scope === step.scope);
    if (existing) existing.after = step.after;
    else store.pending.steps.push(step);
    return;
  }
  const edit = currentEdit();
  store.history.record({ label: label ?? edit.label, group: label ? undefined : edit.group, steps: [step] });
  store.publish('');
}
export function historyTransaction(path: string, label: string, action: () => void) {
  const store = historyFor(path);
  if (store.pending) { action(); return; }
  newEdit();
  store.pending = { label, steps: [] };
  try { action(); }
  finally {
    const entry = store.pending;
    store.pending = null;
    store.history.record(entry);
    store.publish('');
  }
}
export function refreshInputs() {
  // React updates the model first; fields then clear any unparsed local text.
  window.setTimeout(() => window.dispatchEvent(new Event(REFRESH_INPUTS_EVENT)), 0);
}
export function changeHistory(path: string, direction: 'undo' | 'redo') {
  const store = historyFor(path);
  newEdit();
  if (direction === 'undo' && document.querySelector('[data-uncommitted-input="true"]')) {
    refreshInputs();
    store.publish('Restored the last valid inputs');
    return;
  }
  if (!(direction === 'undo' ? store.status.canUndo : store.status.canRedo)) return;
  const apply = (scope: string, value: unknown) => {
    store.expected.set(scope, value);
    store.bindings.get(scope)?.apply(value);
  };
  const label = store.history[direction](apply);
  refreshInputs();
  store.publish((direction === 'undo' ? 'Undid: ' : 'Redid: ') + label);
}
