import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { plain } from '../lib/units';

const MULT: Record<string, number> = { p: 1e-12, n: 1e-9, µ: 1e-6, m: 1e-3, '': 1, k: 1e3, M: 1e6, G: 1e9 };
export type SiPrefix = 'p' | 'n' | 'µ' | 'm' | '' | 'k' | 'M' | 'G';

/** Prefix from the list that shows v with a mantissa of 1…999 (or the closest one). */
function pickPrefix(v: number, prefixes: SiPrefix[]): SiPrefix {
  const a = Math.abs(v);
  if (!(a > 0)) return prefixes.includes('') ? '' : prefixes[0];
  const sorted = [...prefixes].sort((x, y) => MULT[x] - MULT[y]);
  let best = sorted[0];
  for (const p of sorted) if (a >= MULT[p] * 0.9999999) best = p;
  return best;
}

/**
 * Numeric input stored in base SI units (V, A, Ω, W, Hz, H, F) and shown with a
 * selectable prefix. Same row layout as NumField / LenField.
 */
export function SiField({
  label,
  symbol,
  value,
  onChange,
  unit,
  prefixes,
  allowZero = false,
  allowNegative = false,
  digits = 6,
  hint,
}: {
  label: ReactNode;
  symbol?: ReactNode;
  value: number;
  onChange: (v: number) => void;
  unit: string;
  prefixes: SiPrefix[];
  allowZero?: boolean;
  allowNegative?: boolean;
  digits?: number;
  hint?: string;
}) {
  const [prefix, setPrefix] = useState<SiPrefix>(() => pickPrefix(value, prefixes));
  const [text, setText] = useState(() => plain(value / MULT[prefix], digits));
  const emitted = useRef(value);
  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      const p = pickPrefix(value, prefixes);
      setPrefix(p);
      setText(plain(value / MULT[p], digits));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const id = useId();
  const n = Number.parseFloat(text);
  const bad = !Number.isFinite(n) || (!allowNegative && (allowZero ? n < 0 : n <= 0));
  return (
    <div className="grid min-h-[22px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2" title={hint}>
      <label htmlFor={id} className="truncate text-muted">
        {label}
        {symbol && <span className="ml-1 font-[Cambria,serif] italic text-faint">{symbol}</span>}
      </label>
      <div className="flex items-center gap-1">
        <input
          id={id}
          className="fld w-[84px] text-right"
          inputMode="decimal"
          value={text}
          aria-invalid={bad}
          onChange={(e) => {
            setText(e.target.value);
            const v = Number.parseFloat(e.target.value);
            if (Number.isFinite(v)) {
              const base = v * MULT[prefix];
              emitted.current = base;
              onChange(base);
            }
          }}
        />
        <select
          className="fld w-[48px]"
          aria-label="unit"
          value={prefix}
          onChange={(e) => {
            const p = e.target.value as SiPrefix;
            setPrefix(p);
            setText(plain(value / MULT[p], digits));
          }}
        >
          {prefixes.map((p) => (
            <option key={p} value={p}>
              {p + unit}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
