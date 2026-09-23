import { useEffect, useState } from 'react';
import { formatPlies, parsePlies, pliesThickness, type PlyInput } from '../lib/plies';
import { fmt, fromMm, plain, toMm } from '../lib/units';
import { useSettings } from '../state/settings';

function Cell({ value, onChange, width = 64, digits = 5 }: { value: number; onChange: (v: number) => void; width?: number; digits?: number }) {
  const [text, setText] = useState(() => plain(value, digits));
  useEffect(() => {
    setText(plain(value, digits));
  }, [value, digits]);
  const n = Number.parseFloat(text);
  return (
    <input
      className="fld text-right"
      style={{ width }}
      inputMode="decimal"
      value={text}
      aria-invalid={!Number.isFinite(n)}
      onChange={(e) => {
        setText(e.target.value);
        const v = Number.parseFloat(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
    />
  );
}

/**
 * Editor for a stack of dielectric plies (prepregs and cores) between the trace and a plane.
 * `value` is the URL form "t:dk[:df],…"; below the trace the first row is the one touching the plane.
 */
export function PlyEditor({ value, onChange, withDf = false, firstLabel }: { value: string; onChange: (v: string) => void; withDf?: boolean; firstLabel: string }) {
  const { unit } = useSettings();
  const plies = parsePlies(value) ?? [];
  const set = (next: PlyInput[]) => onChange(formatPlies(next));
  const patch = (i: number, p: Partial<PlyInput>) => set(plies.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const u = unit;
  return (
    <div className="space-y-1 pt-0.5">
      <table className="w-full">
        <thead>
          <tr className="text-faint">
            <th className="text-left font-normal">Ply</th>
            <th className="text-right font-normal">t ({u})</th>
            <th className="text-right font-normal">Dk</th>
            {withDf && <th className="text-right font-normal">Df</th>}
            <th />
          </tr>
        </thead>
        <tbody>
          {plies.map((p, i) => (
            <tr key={i}>
              <td className="text-muted">{i === 0 ? firstLabel : i + 1}</td>
              <td className="text-right">
                <Cell value={fromMm(p.t, u)} onChange={(v) => patch(i, { t: toMm(v, u) })} />
              </td>
              <td className="text-right">
                <Cell value={p.dk} onChange={(v) => patch(i, { dk: v })} width={52} digits={4} />
              </td>
              {withDf && (
                <td className="text-right">
                  <Cell value={p.df ?? 0.02} onChange={(v) => patch(i, { df: v })} width={58} digits={4} />
                </td>
              )}
              <td className="text-right">
                <button className="btn" aria-label={`Remove ply ${i + 1}`} disabled={plies.length < 2} onClick={() => set(plies.filter((_, k) => k !== i))}>
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between">
        <span className="text-faint">
          Total {fmt(fromMm(pliesThickness(plies), u), 4)} {u}
        </span>
        <button
          className="btn"
          onClick={() => {
            const last = plies[plies.length - 1] ?? { t: 0.1, dk: 4.2, ...(withDf ? { df: 0.02 } : {}) };
            set([...plies, { ...last }]);
          }}
        >
          + Ply
        </button>
      </div>
    </div>
  );
}
