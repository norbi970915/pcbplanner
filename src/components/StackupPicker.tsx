import { useState } from 'react';
import { copperCount, shortName, type Stackup } from '../lib/stackups';
import { constructionOf, regionStackup } from '../lib/stackupRegions';
import { useStackups } from '../state/stackupStore';

/** Group label used in stackup dropdowns: "6 layers · 1.6 mm", or "My stackups". */
export function stackupGroup(s: Stackup) {
  if (!s.builtin) return 'My stackups';
  if (constructionOf(s)==='flex') return 'Flex design starters';
  if (constructionOf(s)==='rigid-flex') return 'Rigid-flex design starters';
  return `${copperCount(s)} layers · ${s.nominal ?? '?'} mm`;
}

/** Stackup + signal-layer chooser with an Apply button (Properties-panel rows). */
export function StackupPicker({ onApply, applyLabel = 'Apply' }: { onApply: (stack: Stackup, layerId: string) => void; applyLabel?: string }) {
  const stackups = useStackups();
  const [stackId, setStackId] = useState(() => stackups.find((s) => s.id === 'std-6l-16-1080-2')?.id ?? stackups[0]?.id ?? '');
  const stack = stackups.find((s) => s.id === stackId) ?? stackups[0];
  const [regionId, setRegionId] = useState('');
  const selectedRegion = stack?.regions?.find(r=>r.id===regionId)?.id ?? stack?.regions?.[0]?.id;
  const active = stack ? regionStackup(stack,selectedRegion) : undefined;
  const coppers = active ? active.layers.filter((l) => l.kind === 'copper') : [];
  const [layerId, setLayerId] = useState('');
  const groups = [...new Set(stackups.map(stackupGroup))];

  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <label className="text-muted" htmlFor="stk">
          Stackup
        </label>
        <select data-report-ignore
          id="stk"
          className="fld w-[176px]"
          value={stack?.id ?? ''}
          onChange={(e) => {
            setStackId(e.target.value);
            setRegionId('');
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
      {stack?.regions?.length && <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <label htmlFor="stk-region" className="text-muted">Region</label>
        <select data-report-ignore id="stk-region" className="fld w-[176px]" value={selectedRegion} onChange={e=>{setRegionId(e.target.value);setLayerId('');}}>
          {stack.regions.map(r=><option key={r.id} value={r.id}>{r.name} ({r.kind})</option>)}
        </select>
      </div>}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1">
        <label className="text-muted" htmlFor="stk-l">
          Layer
        </label>
        <select data-report-ignore id="stk-l" className="fld w-[118px]" value={layerId || coppers[0]?.id || ''} onChange={(e) => setLayerId(e.target.value)}>
          {coppers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
              {l.role === 'plane' ? ' (plane)' : ''}
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => active && onApply(active, layerId || coppers[0]?.id)}>
          {applyLabel}
        </button>
      </div>
    </>
  );
}
