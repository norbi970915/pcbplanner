import { useId } from 'react';
import { formatPlies, parsePlies, pliesThickness, type PlyInput } from '../lib/plies';
import { fmt, fromMm, LEN_UNITS, plain, toMm } from '../lib/units';
import { useSettings } from '../state/settings';
import { numericInputIssue, parseNumericInput } from '../lib/numericInput';
import { useSyncedText } from '../state/useNumericText';
import { useFieldIssue } from '../state/fieldInteraction';

function Cell({ value, onChange, label, width = 60, digits = 5, disabled, min = 0, allowZero = false, scale = 1, max, exclusiveMax = false }: { value: number; onChange: (v: number) => void; label: string; width?: number; digits?: number; disabled?: boolean; min?: number; allowZero?: boolean; scale?: number; max?: number; exclusiveMax?: boolean }) {
  const { text, setText, emit } = useSyncedText(value, v => plain(v, digits));
  const id = useId(), options = { min, allowZero, scale, max };
  const issue = (entry: string) => numericInputIssue(entry, options) || (exclusiveMax && max !== undefined && (parseNumericInput(entry) ?? -Infinity) * scale >= max ? `Enter a value less than ${max}.` : undefined);
  const error = disabled ? undefined : issue(text);
  useFieldIssue(id, label, error, true);
  return (
    <input
      className="fld text-right"
      id={id}
      aria-label={label}
      style={{ width }}
      inputMode="decimal"
      value={text}
      disabled={disabled}
      aria-invalid={!!error}
      title={error}
      data-uncommitted-input={!!error || undefined}
      onChange={(e) => {
        setText(e.target.value);
        const v = parseNumericInput(e.target.value);
        if (v !== null && !issue(e.target.value)) { emit(v); onChange(v); }
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
  fallbackFrequency = 1,
  firstLabel,
  materials,
  resolve,
}: {
  value: string;
  onChange: (v: string) => void;
  withDf?: boolean;
  fallbackFrequency?: number;
  firstLabel: string;
  materials?: MaterialOption[];
  /** library values for a material id, used to fill the ply when one is picked */
  resolve?: (mat: string) => { dk: number; df?: number } | null;
}) {
  const { unit } = useSettings();
  const plies = parsePlies(value) ?? [];
  const showFrequency = withDf && plies.some(p=>p.fGHz!==undefined);
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
            {showFrequency && <th className="text-right font-normal">Ref GHz</th>}
            <th><span className="sr-only">Actions</span></th>
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
                <Cell label={`${firstLabel} ply ${i + 1} thickness (${unit})`} value={fromMm(p.t, unit)} scale={LEN_UNITS[unit].toMm} max={1000} onChange={(v) => patch(i, { t: toMm(v, unit) })} />
              </td>
              <td className="text-right">
                <Cell label={`${firstLabel} ply ${i + 1} Dk`} value={p.dk} min={1} allowZero max={1000} onChange={(v) => patch(i, { dk: v })} width={50} digits={4} disabled={!!p.mat} />
              </td>
              {withDf && (
                <td className="text-right">
                  <Cell label={`${firstLabel} ply ${i + 1} Df`} value={p.df ?? 0.02} allowZero max={1} exclusiveMax onChange={(v) => patch(i, { df: v })} width={56} digits={4} disabled={!!p.mat} />
                </td>
              )}
              {showFrequency && <td className="text-right"><Cell label={`${firstLabel} ply ${i + 1} reference frequency (GHz)`} value={p.fGHz ?? fallbackFrequency} max={200} onChange={fGHz=>patch(i,{fGHz})} width={64} digits={6} disabled={!!p.mat} /></td>}
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
