import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { plain } from '../lib/units';
import { RESET_EVENT } from '../state/useUrlState';
import { Row } from './ui';
import { numericInputIssue, parseNumericInput } from '../lib/numericInput';

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
  diagramKey,
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
  diagramKey?: string;
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
  // Reset must also clear text the user typed that never parsed (the value did not change).
  const latest = useRef({ value, prefixes, digits });
  latest.current = { value, prefixes, digits };
  useEffect(() => {
    const onReset = () => {
      const { value: v, prefixes: ps, digits: d } = latest.current;
      emitted.current = v;
      const p = pickPrefix(v, ps);
      setPrefix(p);
      setText(plain(v / MULT[p], d));
    };
    window.addEventListener(RESET_EVENT, onReset);
    return () => window.removeEventListener(RESET_EVENT, onReset);
  }, []);
  const id = useId();
  const options = { allowZero, allowNegative, scale: MULT[prefix] };
  const error = numericInputIssue(text, options);
  const help = hint;
  return (
    <Row label={label} symbol={symbol} hint={help} htmlFor={id} error={error} diagramKey={diagramKey}>
        <input
          id={id}
          className="fld w-[84px] text-right"
          inputMode="decimal"
          value={text}
          aria-invalid={!!error}
          aria-describedby={[help && id + '-help', error && id + '-error'].filter(Boolean).join(' ')}
          onChange={(e) => {
            setText(e.target.value);
            const v = parseNumericInput(e.target.value);
            if (v !== null && !numericInputIssue(e.target.value, options)) {
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
            const entry = parseNumericInput(text);
            if (entry !== null) setText(plain((error ? entry * MULT[prefix] : value) / MULT[p], digits));
          }}
        >
          {prefixes.map((p) => (
            <option key={p} value={p}>
              {p + unit}
            </option>
          ))}
        </select>
    </Row>
  );
}
