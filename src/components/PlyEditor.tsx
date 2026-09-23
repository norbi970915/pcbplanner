import { useEffect, useState } from 'react';
import { formatPlies, parsePlies, pliesThickness, type PlyInput } from '../lib/plies';
import { fmt, fromMm, plain, toMm } from '../lib/units';
import { useSettings } from '../state/settings';

function Cell({ value, onChange, width = 60, digits = 5, disabled }: { value: number; onChange: (v: number) => void; width?: number; digits?: number; disabled?: boolean }) {
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
      disabled={disabled}
      aria-invalid={!Number.isFinite(n)}
      onChange={(e) => {
        setText(e.target.value);
        const v = Number.parseFloat(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
    />
  );
}

export interface MaterialOption {
  value: string;
  label: string;
  group?: string;
}

/**
 * Editor for a stack of dielectric plies (prepregs and cores) between the trace and a plane.
 * `value` is the URL form "t:dk[:df[:material]],…"; below the trace the first row touches the plane.
 * With `materials`, each ply can take its Dk (and Df) from the laminate library instead.
 */
export function PlyEditor({
  value,
  onChange,
  withDf = false,
  firstLabel,
  materials,
  resolve,
}: {
  value: string;
  onChange: (v: string) => void;
  withDf?: boolean;
  firstLabel: string;
  materials?: MaterialOption[];
  /** library values for a material id, used to fill the ply when one is picked */
  resolve?: (mat: string) => { dk: number; df?: number } | null;
}) {
  const { unit } = useSettings();
  const plies = parsePlies(value) ?? [];
  const set = (next: PlyInput[]) => onChange(formatPlies(next));
  const patch = (i: number, p: Partial<PlyInput>) => set(plies.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const groups = materials ? [...new Set(materials.map((m) => m.group ?? ''))] : [];
  const pick = (i: number, mat: string) => {
    if (!mat) return patch(i, { mat: undefined });
    const v = resolve?.(mat);
    patch(i, { mat, ...(v ? { dk: +v.dk.toFixed(4), ...(v.df === undefined ? {} : { df: +v.df.toFixed(5) }) } : {}) });
  };
  return (
    <div className="space-y-1 pt-0.5">
      <table className="w-full">
        <thead>
          <tr className="text-faint">
            <th className="text-left font-normal">Ply</th>
            {materials && <th className="text-left font-normal">Material</th>}
            <th className="text-right font-normal">t ({unit})</th>
            <th className="text-right font-normal">Dk</th>
            {withDf && <th className="text-right font-normal">Df</th>}
            <th />
          </tr>
        </thead>
        <tbody>
          {plies.map((p, i) => (
            <tr key={i}>
              <td className="text-muted">{i === 0 ? firstLabel : i + 1}</td>
              {materials && (
                <td>
                  <select className="fld w-[92px]" aria-label={`Ply ${i + 1} material`} value={p.mat ?? ''} onChange={(e) => pick(i, e.target.value)}>
                    <option value="">Custom</option>
                    {groups.map((g) => (
                      <optgroup key={g} label={g}>
                        {materials.filter((m) => (m.group ?? '') === g).map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </td>
              )}
              <td className="text-right">
                <Cell value={fromMm(p.t, unit)} onChange={(v) => patch(i, { t: toMm(v, unit) })} />
              </td>
              <td className="text-right">
                <Cell value={p.dk} onChange={(v) => patch(i, { dk: v })} width={50} digits={4} disabled={!!p.mat} />
              </td>
              {withDf && (
                <td className="text-right">
                  <Cell value={p.df ?? 0.02} onChange={(v) => patch(i, { df: v })} width={56} digits={4} disabled={!!p.mat} />
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
          Total {fmt(fromMm(pliesThickness(plies), unit), 4)} {unit}
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
      {materials && plies.some((x) => x.mat) && <p className="text-faint">Library plies take their Dk{withDf ? ' and Df' : ''} from the datasheet; only the thickness is editable.</p>}
    </div>
  );
}
