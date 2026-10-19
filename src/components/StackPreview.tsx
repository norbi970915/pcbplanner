import type { Layer } from '../lib/stackups';
import { LAYER_COLOR, LAYER_INK } from './layerColors';

/** Stack preview of the Layer Stack Manager: one bar per layer, height roughly proportional to its thickness. */
export function StackPreview({ layers, length, selected, onSelect }: { layers: Layer[]; length: (mm: number) => string; selected?: string | null; onSelect?: (id: string) => void }) {
  const total = layers.reduce((a, l) => a + l.t, 0);
  return (
    <div className="p-2.5">
      {layers.map((l, i) => {
        const n = layers.slice(0, i + 1).filter((x) => x.kind === 'copper').length;
        return (
          <div
            key={l.id}
            className="flex items-center justify-between px-2 text-[11px]"
            style={{
              background: LAYER_COLOR[l.kind],
              minHeight: Math.max(7, Math.min(30, (l.t / Math.max(total, 1e-6)) * 420)),
              color: LAYER_INK[l.kind],
              outline: selected === l.id ? '2px solid var(--accent)' : undefined,
              opacity: l.kind === 'copper' && l.role === 'plane' ? 0.8 : 1,
            }}
            onClick={onSelect ? () => onSelect(l.id) : undefined}
          >
            <span className="truncate">
              {l.kind === 'copper' && l.name !== `L${n}` ? `L${n} ` : ''}
              {l.name}
              {l.kind === 'copper' ? ` (${l.role === 'plane' ? 'plane' : 'signal'})` : ''}
            </span>
            <span className="tnum">{length(l.t)}</span>
          </div>
        );
      })}
    </div>
  );
}
