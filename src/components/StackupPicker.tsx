import { useState } from 'react';
import { copperCount, shortName, type Stackup } from '../lib/stackups';
import { useStackups } from '../state/stackupStore';

/** Group label used in stackup dropdowns: "6 layers · 1.6 mm", or "My stackups". */
export function stackupGroup(s: Stackup) {
  if (!s.builtin) return 'My stackups';
  return `${copperCount(s)} layers · ${s.nominal ?? '?'} mm`;
}

/** Stackup + signal-layer chooser with an Apply button (Properties-panel rows). */
export function StackupPicker({ onApply, applyLabel = 'Apply' }: { onApply: (stack: Stackup, layerId: string) => void; applyLabel?: string }) {
  const stackups = useStackups();
  const [stackId, setStackId] = useState(() => stackups.find((s) => s.id === 'std-6l-16-1080-2')?.id ?? stackups[0]?.id ?? '');
  const stack = stackups.find((s) => s.id === stackId) ?? stackups[0];
  const coppers = stack ? stack.layers.filter((l) => l.kind === 'copper') : [];
  const [layerId, setLayerId] = useState('');
  const groups = [...new Set(stackups.map(stackupGroup))];

  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <label className="text-muted" htmlFor="stk">
          Stackup
        </label>
        <select
          id="stk"
          className="fld w-[176px]"
          value={stack?.id ?? ''}
          onChange={(e) => {
            setStackId(e.target.value);
            setLayerId('');
          }}
        >
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {stackups
                .filter((s) => stackupGroup(s) === g)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {shortName(s)}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1">
        <label className="text-muted" htmlFor="stk-l">
          Layer
        </label>
        <select id="stk-l" className="fld w-[118px]" value={layerId || coppers[0]?.id || ''} onChange={(e) => setLayerId(e.target.value)}>
          {coppers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
              {l.role === 'plane' ? ' (plane)' : ''}
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => stack && onApply(stack, layerId || coppers[0]?.id)}>
          {applyLabel}
        </button>
      </div>
    </>
  );
}
