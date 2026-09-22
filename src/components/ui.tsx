import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { fromMm, LEN_UNITS, plain, toMm, type LenUnit } from '../lib/units';
import { useSettings } from '../state/settings';

export function Panel({ title, right, children, className = '' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded border border-line bg-panel ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="border-b border-line px-3 py-2 last:border-b-0">
      {title && <div className="mb-1 text-[11.5px] font-medium text-faint">{title}</div>}
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, symbol, hint, htmlFor, children }: { label: ReactNode; symbol?: ReactNode; hint?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[28px] items-center justify-between gap-2" title={hint}>
      <label htmlFor={htmlFor} className="min-w-0 flex-1 truncate text-[13px]">
        {label}
        {symbol && <span className="ml-1 font-serif italic text-muted">{symbol}</span>}
      </label>
      <div className="flex shrink-0 items-center gap-1">{children}</div>
    </div>
  );
}

function useSyncedText(value: number, toText: (v: number) => string) {
  const [text, setText] = useState(() => toText(value));
  const emitted = useRef(value);
  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setText(toText(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return { text, setText, emitted };
}

/** Length input stored in mm, displayed in a selectable unit. */
export function LenField({
  label,
  symbol,
  value,
  onChange,
  units = ['mm', 'mil', 'um'],
  min = 0,
  allowZero = false,
  hint,
}: {
  label: ReactNode;
  symbol?: ReactNode;
  value: number;
  onChange: (mm: number) => void;
  units?: LenUnit[];
  min?: number;
  allowZero?: boolean;
  hint?: string;
}) {
  const { unit: pref } = useSettings();
  // copper-thickness fields list 'oz' first and keep it regardless of the global unit
  const followsPref = units[0] !== 'oz' && units.includes(pref);
  const [unit, setUnit] = useState<LenUnit>(followsPref ? pref : units[0]);
  useEffect(() => {
    if (followsPref) setUnit(pref);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pref]);
  const { text, setText, emitted } = useSyncedText(value, (v) => plain(fromMm(v, unit), 5));
  const id = useId();
  const n = Number.parseFloat(text);
  const bad = !Number.isFinite(n) || (allowZero ? n < min : n <= min);
  return (
    <Row label={label} symbol={symbol} hint={hint} htmlFor={id}>
      <input
        id={id}
        className="fld w-[92px] text-right"
        inputMode="decimal"
        value={text}
        aria-invalid={bad}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number.parseFloat(e.target.value);
          if (Number.isFinite(v)) {
            const mm = toMm(v, unit);
            emitted.current = mm;
            onChange(mm);
          }
        }}
      />
      <select
        className="fld w-[56px]"
        aria-label="unit"
        value={unit}
        onChange={(e) => {
          const u = e.target.value as LenUnit;
          setUnit(u);
          setText(plain(fromMm(value, u), 5));
        }}
      >
        {units.map((u) => (
          <option key={u} value={u}>
            {LEN_UNITS[u].label}
          </option>
        ))}
      </select>
    </Row>
  );
}

/** Plain numeric input with a fixed unit label. */
export function NumField({
  label,
  symbol,
  value,
  onChange,
  unit,
  min = 0,
  allowZero = false,
  allowNegative = false,
  hint,
  width = 92,
}: {
  label: ReactNode;
  symbol?: ReactNode;
  value: number;
  onChange: (v: number) => void;
  unit?: ReactNode;
  min?: number;
  allowZero?: boolean;
  allowNegative?: boolean;
  hint?: string;
  width?: number;
}) {
  const { text, setText, emitted } = useSyncedText(value, (v) => plain(v, 6));
  const id = useId();
  const n = Number.parseFloat(text);
  const bad = !Number.isFinite(n) || (!allowNegative && (allowZero ? n < min : n <= min));
  return (
    <Row label={label} symbol={symbol} hint={hint} htmlFor={id}>
      <input
        id={id}
        className="fld text-right"
        style={{ width }}
        inputMode="decimal"
        value={text}
        aria-invalid={bad}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number.parseFloat(e.target.value);
          if (Number.isFinite(v)) {
            emitted.current = v;
            onChange(v);
          }
        }}
      />
      <span className="w-[56px] text-[12.5px] text-muted">{unit}</span>
    </Row>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  width = 152,
}: {
  label: ReactNode;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  width?: number;
}) {
  const id = useId();
  return (
    <Row label={label} htmlFor={id}>
      <select id={id} className="fld" style={{ width }} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Row>
  );
}

export function Check({ label, checked, onChange, hint }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex min-h-[26px] cursor-pointer items-center gap-2 text-[13px]" title={hint}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded border border-line-strong bg-field p-[2px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-[24px] rounded-[2px] px-2.5 text-[12.5px] ${value === o.value ? 'bg-accent text-white' : 'text-ink hover:bg-sel'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Key result line in the results table. */
export function Result({ label, value, unit, strong, sub }: { label: ReactNode; value: ReactNode; unit?: ReactNode; strong?: boolean; sub?: ReactNode }) {
  return (
    <tr>
      <th scope="row" className="text-left text-[13px] font-normal">
        {label}
        {sub && <div className="text-[11.5px] text-faint">{sub}</div>}
      </th>
      <td className={`v ${strong ? 'text-[15px] font-semibold' : ''}`}>{value}</td>
      <td className="w-[64px] text-[12.5px] text-muted">{unit}</td>
    </tr>
  );
}

export function Notes({ items, kind = 'note' }: { items: string[]; kind?: 'note' | 'error' }) {
  if (!items.length) return null;
  const cls = kind === 'error' ? 'border-[var(--err-line)] bg-[var(--err-bg)]' : 'border-[var(--note-line)] bg-[var(--note-bg)]';
  return (
    <div className={`border-l-[3px] px-3 py-2 text-[13px] ${cls}`} role={kind === 'error' ? 'alert' : undefined}>
      {items.length === 1 ? (
        items[0]
      ) : (
        <ul className="list-disc space-y-0.5 pl-4">
          {items.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Big({ label, value, unit, busy }: { label: ReactNode; value: ReactNode; unit: ReactNode; busy?: boolean }) {
  return (
    <div className="min-w-[140px]">
      <div className="text-[12px] text-muted">{label}</div>
      <div className={`tnum text-[26px] font-semibold leading-tight ${busy ? 'opacity-60' : ''}`}>
        {value} <span className="text-[15px] font-normal text-muted">{unit}</span>
      </div>
    </div>
  );
}
