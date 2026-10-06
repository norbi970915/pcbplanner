import { describe, expect, it } from 'vitest';
import { DesignHistory, type HistoryEntry } from './designHistory';

const entry = (before: unknown, after: unknown, group?: string): HistoryEntry => ({
  label: 'Change width', group, steps: [{ scope: 'inputs', before, after }],
});
describe('design history', () => {
  it('groups typing and restores the original value with one undo', () => {
    const h = new DesignHistory(), values: unknown[] = [];
    h.record(entry(0.15, 0.2, 'focus-1')); h.record(entry(0.2, 0.25, 'focus-1'));
    h.undo((_scope, value) => values.push(value));
    expect(values).toEqual([0.15]); expect(h.undoEntry).toBeUndefined();
    h.redo((_scope, value) => values.push(value)); expect(values).toEqual([0.15, 0.25]);
  });
  it('removes a typing session that returns to its original value', () => {
    const h = new DesignHistory();
    h.record(entry({ w: 1 }, { w: 2 }, 'same')); h.record(entry({ w: 2 }, { w: 1 }, 'same'));
    expect(h.undoEntry).toBeUndefined(); expect(h.redoEntry).toBeUndefined();
  });
  it('keeps independent edits and reset separate, then restores every input', () => {
    const h = new DesignHistory(), values: unknown[] = [];
    h.record(entry({ w: 1, h: 2 }, { w: 3, h: 2 }, 'width'));
    h.record(entry({ w: 3, h: 2 }, { w: 3, h: 4 }, 'height'));
    h.record({ ...entry({ w: 3, h: 4 }, { w: 1, h: 2 }), label: 'Reset inputs' });
    h.undo((_scope, value) => values.push(value)); expect(values).toEqual([{ w: 3, h: 4 }]);
    h.undo((_scope, value) => values.push(value)); expect(values[1]).toEqual({ w: 3, h: 2 });
  });
  it('undoes a file and settings reset as one transaction, in reverse order', () => {
    const h = new DesignHistory(), values: [string, unknown][] = [];
    const file = { name: 'measurement.s2p', points: [1, 2] };
    h.record({ label: 'Reset inputs', steps: [
      { scope: 'file', before: file, after: null }, { scope: 'inputs', before: { mode: 'db' }, after: { mode: 'linear' } },
    ] });
    h.undo((scope, value) => values.push([scope, value]));
    expect(values).toEqual([['inputs', { mode: 'db' }], ['file', file]]);
    expect(values[1][1]).toBe(file);
    h.redo((scope, value) => values.push([scope, value])); expect(values.slice(2)).toEqual([['file', null], ['inputs', { mode: 'linear' }]]);
  });
  it('drops the redo branch when editing after undo, even with the same group', () => {
    const h = new DesignHistory(), values: unknown[] = [];
    h.record(entry(1, 2, 'one')); h.record(entry(2, 3, 'two')); h.undo(() => {});
    h.record(entry(2, 4, 'one'));
    expect(h.redoEntry).toBeUndefined();
    h.undo((_s, v) => values.push(v)); expect(values).toEqual([2]);
    h.undo((_s, v) => values.push(v)); expect(values).toEqual([2, 1]);
  });
  it('bounds retained snapshots and clears all steps on a new document', () => {
    const h = new DesignHistory(2), values: unknown[] = [];
    h.record(entry(0, 1)); h.record(entry(1, 2)); h.record(entry(2, 3));
    for (let i = 0; i < 3; i++) h.undo((_s, v) => values.push(v));
    expect(values).toEqual([2, 1]); h.clear();
    expect(h.undoEntry).toBeUndefined(); expect(h.redoEntry).toBeUndefined();
  });
});
