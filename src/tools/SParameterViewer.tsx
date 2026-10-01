import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Sources } from '../components/Sources';
import { ToolPage } from '../components/ToolPage';
import { Big, Notes, NumField, Panel, Section, Segmented, SelectField } from '../components/ui';
import { INTERFACES, type InterfaceSpec } from '../data/interfaces';
import { mixedIndex, toMixedMode, type MixedNetwork, type PairConvention } from '../lib/mixedMode';
import { decimateMinMax, groupDelay, lowerIndex, magnitudeDb, phaseDeg, svgPath, term, unwrappedPhase, valueAt, type Trace } from '../lib/sparamTrace';
import { impedanceFromRho, lowPassStep, stepRiseTime } from '../lib/tdr';
import { MAX_FILE_CHARS, MAX_PORTS, parseTouchstone, portsFromFileName, type Matrices, type Network } from '../lib/touchstone';
import { fmt } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { f: 4, view: 'se', conv: '13', tr: '', mt: '', gd: '', tdr: '', ap: 5, beta: 6, tmax: 0, ph: 'wrap', iface: '' };

const PALETTE = ['var(--accent)', 'var(--copper)', 'var(--ok)', 'var(--err-line)', 'var(--note-line)', 'var(--mask)', 'var(--accent-ink)', 'var(--muted)'];
const DASHES = [undefined, '7 4', '2 3', '9 3 2 3'];
const APERTURES = [3, 5, 11, 21, 41];
const WINDOWS = [
  { beta: 0, label: 'Minimum (β = 0)' },
  { beta: 6, label: 'Normal (β = 6)' },
  { beta: 13, label: 'Maximum (β = 13)' },
];
const BUDGETS = INTERFACES.filter((i) => i.lossBudgetDb !== undefined && i.z.kind === 'diff');

type View = 'se' | 'mm';

/** One S-parameter of the current view. */
interface Param {
  key: string;
  label: string;
  /** Row and column in the matrix of the view (0-based). */
  i: number;
  j: number;
  /** Same port (or pair) at both ends. */
  reflection: boolean;
  /** Reference resistance for a time-domain impedance, when the term is a same-mode reflection. */
  z0: number | null;
  kind: 'transmission' | 'reflection' | 'conversion';
}

function seParams(net: Network): Param[] {
  const n = net.ports;
  const out: Param[] = [];
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= n; j++) {
      out.push({ key: `${i}.${j}`, label: n < 10 ? `S${i}${j}` : `S${i},${j}`, i: i - 1, j: j - 1, reflection: i === j, z0: i === j ? net.referenceOhms[i - 1] : null, kind: i === j ? 'reflection' : 'transmission' });
    }
  }
  return out;
}

function mmParams(mm: MixedNetwork): Param[] {
  const out: Param[] = [];
  for (const x of ['d', 'c'] as const) {
    for (const y of ['d', 'c'] as const) {
      for (let a = 1; a <= 2; a++) {
        for (let b = 1; b <= 2; b++) {
          const key = `${x}${y}${a}${b}`;
          const [i, j] = mixedIndex(key)!;
          const same = x === y;
          out.push({
            key,
            label: `S${key.toUpperCase()}`,
            i,
            j,
            reflection: a === b,
            z0: same && a === b ? (x === 'd' ? mm.diffRefOhms[a - 1] : mm.commonRefOhms[a - 1]) : null,
            kind: !same ? 'conversion' : a === b ? 'reflection' : 'transmission',
          });
        }
      }
    }
  }
  return out;
}

function defaultSelection(view: View, ports: number): string[] {
  if (view === 'mm') return ['dd21', 'dd11', 'cd21', 'cc11'];
  if (ports === 1) return ['1.1'];
  if (ports === 2) return ['2.1', '1.2', '1.1', '2.2'];
  return Array.from({ length: ports }, (_, i) => `${i + 1}.1`);
}

// ── per-trace data, cached per matrix set ────────────────────────────────────
interface TraceData {
  t: Trace;
  db: Float64Array;
  deg: Float64Array;
  unwrappedDeg?: Float64Array;
}
const traceCache = new WeakMap<Matrices, Map<string, TraceData>>();
function traceOf(m: Matrices, p: Param): TraceData {
  let map = traceCache.get(m);
  if (!map) traceCache.set(m, (map = new Map()));
  let d = map.get(p.key);
  if (!d) {
    const t = term(m, p.i, p.j);
    d = { t, db: magnitudeDb(t), deg: phaseDeg(t) };
    map.set(p.key, d);
  }
  return d;
}
function unwrappedDeg(d: TraceData): Float64Array {
  if (!d.unwrappedDeg) d.unwrappedDeg = unwrappedPhase(d.t).map((v) => (v * 180) / Math.PI);
  return d.unwrappedDeg;
}

// ── formatting ───────────────────────────────────────────────────────────────
function freqUnit(fMax: number): { div: number; unit: string } {
  if (fMax >= 1e9) return { div: 1e9, unit: 'GHz' };
  if (fMax >= 1e6) return { div: 1e6, unit: 'MHz' };
  if (fMax >= 1e3) return { div: 1e3, unit: 'kHz' };
  return { div: 1, unit: 'Hz' };
}
function timeUnit(tMax: number): { div: number; unit: string } {
  if (tMax >= 1e-6) return { div: 1e-6, unit: 'µs' };
  if (tMax >= 1e-9) return { div: 1e-9, unit: 'ns' };
  return { div: 1e-12, unit: 'ps' };
}
const fmtFreq = (f: number) => {
  const u = freqUnit(f);
  return `${fmt(f / u.div, 4)} ${u.unit}`;
};
/** dB value for display: −∞ for zero magnitude, never NaN. */
const dbText = (v: number) => (v === -Infinity ? '−∞' : v === Infinity ? '∞' : fmt(v, 4));

/** Ticks at 1, 2 or 5 × 10^k covering [lo, hi]. */
function niceTicks(lo: number, hi: number, target = 5): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

// ── plot ─────────────────────────────────────────────────────────────────────
interface Series {
  key: string;
  label: string;
  colour: string;
  dash?: string;
  x: Float64Array;
  y: Float64Array;
}

const W = 760, H = 270, LEFT = 60, RIGHT = 16, TOP = 30, BOTTOM = 38;
const INNER_W = W - LEFT - RIGHT;
const COLUMNS = Math.round(INNER_W * 1.25);

function Plot({
  series,
  x0,
  x1,
  xAxis,
  yLabel,
  yRange,
  markerX,
  onMarker,
  onStep,
  overlay,
  title,
}: {
  series: Series[];
  x0: number;
  x1: number;
  xAxis: { div: number; unit: string; label: string };
  yLabel: string;
  yRange: [number, number];
  markerX?: number | null;
  onMarker?: (x: number) => void;
  onStep?: (dir: 1 | -1) => void;
  overlay?: (X: (v: number) => number, Y: (v: number) => number) => ReactNode;
  title: string;
}) {
  const clip = useId();
  const [lo, hi] = yRange;
  const X = (v: number) => LEFT + ((v - x0) / (x1 - x0 || 1)) * INNER_W;
  const Y = (v: number) => {
    const c = v === Infinity ? hi : v === -Infinity ? lo : Math.max(lo - (hi - lo) * 0.02, Math.min(hi + (hi - lo) * 0.02, v));
    return TOP + (1 - (c - lo) / (hi - lo || 1)) * (H - TOP - BOTTOM);
  };
  const paths = useMemo(
    () =>
      series.map((s) => {
        // keep one point either side of the visible range so the line runs to the frame
        const a = Math.max(0, lowerIndex(s.x, x0));
        const b = Math.min(s.x.length, lowerIndex(s.x, x1) + 2);
        return { s, d: svgPath(decimateMinMax(s.x.subarray(a, b), s.y.subarray(a, b), x0, x1, COLUMNS), X, Y) };
      }),
    // X and Y depend only on the ranges listed here
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, x0, x1, lo, hi],
  );
  const xt = niceTicks(x0 / xAxis.div, x1 / xAxis.div, 6).filter((v) => v * xAxis.div >= x0 - 1e-12 * Math.abs(x1) && v * xAxis.div <= x1 * (1 + 1e-12));
  const yt = niceTicks(lo, hi, 5);
  const pointerX = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    return x0 + Math.max(0, Math.min(1, (px - LEFT) / INNER_W)) * (x1 - x0);
  };
  const legendW = Math.min(110, INNER_W / Math.max(1, series.length));
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`block h-auto w-full max-w-[900px] ${onMarker ? 'cursor-crosshair' : ''}`}
      role={onMarker ? 'slider' : 'img'}
      tabIndex={onMarker ? 0 : undefined}
      aria-label={title}
      aria-valuemin={onMarker ? x0 : undefined}
      aria-valuemax={onMarker ? x1 : undefined}
      aria-valuenow={onMarker && markerX != null ? markerX : undefined}
      aria-valuetext={onMarker && markerX != null ? fmtFreq(markerX) : undefined}
      onPointerDown={onMarker ? (e) => onMarker(pointerX(e)) : undefined}
      onKeyDown={
        onStep
          ? (e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                onStep(e.key === 'ArrowRight' ? 1 : -1);
              }
            }
          : undefined
      }
    >
      <title>{title}</title>
      <defs>
        <clipPath id={clip}>
          <rect x={LEFT} y={TOP} width={INNER_W} height={H - TOP - BOTTOM} />
        </clipPath>
      </defs>
      {yt.map((v) => (
        <g key={`y${v}`}>
          <line x1={LEFT} x2={W - RIGHT} y1={Y(v)} y2={Y(v)} stroke="var(--line)" />
          <text x={LEFT - 6} y={Y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{fmt(v, 4)}</text>
        </g>
      ))}
      {xt.map((v) => (
        <g key={`x${v}`}>
          <line x1={X(v * xAxis.div)} x2={X(v * xAxis.div)} y1={TOP} y2={H - BOTTOM} stroke="var(--line)" />
          <text x={X(v * xAxis.div)} y={H - BOTTOM + 15} textAnchor="middle" fontSize={11} fill="var(--muted)">{fmt(v, 4)}</text>
        </g>
      ))}
      <text x={LEFT} y={14} fontSize={11} fill="var(--muted)">{yLabel}</text>
      <text x={LEFT + INNER_W / 2} y={H - 4} textAnchor="middle" fontSize={11} fill="var(--muted)">{`${xAxis.label} (${xAxis.unit})`}</text>
      {paths.map(({ s }, k) => (
        <g key={`l${s.key}`}>
          <line x1={LEFT + 140 + k * legendW} x2={LEFT + 158 + k * legendW} y1={10} y2={10} stroke={s.colour} strokeWidth={2} strokeDasharray={s.dash} />
          <text x={LEFT + 162 + k * legendW} y={14} fontSize={11} fill="var(--ink)">{s.label}</text>
        </g>
      ))}
      <g clipPath={`url(#${clip})`}>
        {overlay?.(X, Y)}
        {paths.map(({ s, d }) => <path key={s.key} d={d} fill="none" stroke={s.colour} strokeWidth={1.6} strokeDasharray={s.dash} strokeLinejoin="round" />)}
        {markerX != null && markerX >= x0 && markerX <= x1 && <line x1={X(markerX)} x2={X(markerX)} y1={TOP} y2={H - BOTTOM} stroke="var(--ink)" strokeDasharray="3 3" />}
      </g>
      <rect x={LEFT} y={TOP} width={INNER_W} height={H - TOP - BOTTOM} fill="none" stroke="var(--line-strong)" />
    </svg>
  );
}

/** y-range of finite values, rounded outwards to `step`; `[q, 1 − q]` quantiles when `q` > 0. */
function rangeOf(arrays: Float64Array[], step: number, opts: { q?: number; minSpan?: number; floor?: number; ceil?: number } = {}): [number, number] {
  let lo = Infinity, hi = -Infinity;
  if (opts.q) {
    const all: number[] = [];
    for (const a of arrays) for (const v of a) if (Number.isFinite(v)) all.push(v);
    if (all.length) {
      all.sort((p, q) => p - q);
      lo = all[Math.floor(opts.q * (all.length - 1))];
      hi = all[Math.ceil((1 - opts.q) * (all.length - 1))];
    }
  } else {
    for (const a of arrays) for (const v of a) if (Number.isFinite(v)) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (!Number.isFinite(lo)) return [0, step];
  if (opts.floor !== undefined) lo = Math.max(lo, opts.floor);
  if (opts.ceil !== undefined) hi = Math.min(hi, opts.ceil);
  const span = opts.minSpan ?? step;
  if (hi - lo < span) {
    const mid = (hi + lo) / 2;
    lo = mid - span / 2;
    hi = mid + span / 2;
  }
  const s = niceTicks(lo, hi, 5);
  const st = s.length > 1 ? s[1] - s[0] : step;
  return [Math.floor(lo / st) * st, Math.ceil(hi / st) * st];
}

function PairDiagram({ conv }: { conv: PairConvention }) {
  // left: ports at the input pair, right: output pair; the drawn lines are the two traces
  const rows = conv === '13' ? [[1, 3], [2, 4]] : [[1, 2], [3, 4]];
  return (
    <svg viewBox="0 0 220 74" className="block h-auto w-full max-w-[240px]" role="img" aria-label={conv === '13' ? 'Ports 1 and 2 at the input, 3 and 4 at the output; lines 1 to 3 and 2 to 4' : 'Ports 1 and 3 at the input, 2 and 4 at the output; lines 1 to 2 and 3 to 4'}>
      <text x={30} y={10} textAnchor="middle" fontSize={10} fill="var(--muted)">pair 1 (in)</text>
      <text x={190} y={10} textAnchor="middle" fontSize={10} fill="var(--muted)">pair 2 (out)</text>
      {rows.map(([a, b], k) => (
        <g key={a}>
          <line x1={44} x2={176} y1={30 + k * 26} y2={30 + k * 26} stroke={k ? 'var(--copper)' : 'var(--accent)'} strokeWidth={2.5} />
          <rect x={18} y={20 + k * 26} width={24} height={20} fill="var(--sheet)" stroke="var(--line-strong)" />
          <rect x={178} y={20 + k * 26} width={24} height={20} fill="var(--sheet)" stroke="var(--line-strong)" />
          <text x={30} y={34 + k * 26} textAnchor="middle" fontSize={11} fill="var(--ink)">{a}</text>
          <text x={190} y={34 + k * 26} textAnchor="middle" fontSize={11} fill="var(--ink)">{b}</text>
          <text x={8} y={34 + k * 26} textAnchor="middle" fontSize={11} fill="var(--muted)">{k ? '−' : '+'}</text>
          <text x={212} y={34 + k * 26} textAnchor="middle" fontSize={11} fill="var(--muted)">{k ? '−' : '+'}</text>
        </g>
      ))}
    </svg>
  );
}

function TraceGrid({ params, ports, selected, onToggle, labels }: { params: Param[]; ports: number; selected: string[]; onToggle: (key: string) => void; labels: string[] }) {
  return (
    <div className="grid gap-[2px]" style={{ gridTemplateColumns: `auto repeat(${ports}, minmax(0, 1fr))` }}>
      <span />
      {labels.map((l) => <span key={`c${l}`} className="text-center text-[10px] text-faint">{l}</span>)}
      {Array.from({ length: ports }, (_, i) => (
        <div key={i} className="contents">
          <span className="pr-1 text-right text-[10px] leading-[20px] text-faint">{labels[i]}</span>
          {params.filter((p) => p.i === i).sort((a, b) => a.j - b.j).map((p) => {
            const on = selected.includes(p.key);
            return (
              <button key={p.key} type="button" aria-pressed={on} title={p.label} onClick={() => onToggle(p.key)} className={`h-[20px] min-w-0 truncate border border-[var(--field-line)] px-0.5 text-[10px] ${on ? 'bg-accent text-white' : 'bg-field text-ink hover:bg-hover'}`}>
                {p.label.slice(1)}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

interface Loaded {
  net: Network;
  name: string;
}

export default function SParameterViewer() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const readSeq = useRef(0);

  const importFile = async (file: File) => {
    const id = ++readSeq.current;
    setError(null);
    setBusy(true);
    try {
      if (file.size > MAX_FILE_CHARS) throw new Error(`The file is larger than the ${MAX_FILE_CHARS / 1e6} MB limit of this viewer.`);
      const text = await file.text();
      if (id !== readSeq.current) return;
      const net = parseTouchstone(text, { ports: portsFromFileName(file.name) });
      if (id !== readSeq.current) return;
      setData({ net, name: file.name });
    } catch (e) {
      if (id === readSeq.current) {
        setData(null);
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (id === readSeq.current) setBusy(false);
    }
  };
  const importRef = useRef(importFile);
  useEffect(() => {
    importRef.current = importFile;
  });

  // drag and drop anywhere on the page
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) void importRef.current(file);
    };
    document.addEventListener('dragenter', enter);
    document.addEventListener('dragover', over);
    document.addEventListener('dragleave', leave);
    document.addEventListener('drop', drop);
    return () => {
      document.removeEventListener('dragenter', enter);
      document.removeEventListener('dragover', over);
      document.removeEventListener('dragleave', leave);
      document.removeEventListener('drop', drop);
    };
  }, []);

  const clear = () => {
    ++readSeq.current;
    setData(null);
    setError(null);
    setBusy(false);
    reset();
  };

  const net = data?.net ?? null;
  const conv: PairConvention = p.conv === '12' ? '12' : '13';
  const mixed = useMemo(() => (net && net.ports === 4 ? toMixedMode(net, conv) : null), [net, conv]);
  const view: View = p.view === 'mm' && mixed ? 'mm' : 'se';
  const src: Matrices | null = view === 'mm' ? mixed : net;
  const params = useMemo(() => (view === 'mm' && mixed ? mmParams(mixed) : net ? seParams(net) : []), [view, mixed, net]);
  const byKey = useMemo(() => new Map(params.map((q) => [q.key, q])), [params]);
  const selKeys = useMemo(() => {
    if (!net) return [];
    const raw = (view === 'mm' ? p.mt : p.tr).split(',').filter((k) => byKey.has(k));
    return raw.length || (view === 'mm' ? p.mt : p.tr) === 'none' ? raw : defaultSelection(view, net.ports);
  }, [net, view, p.mt, p.tr, byKey]);
  const selected = selKeys.map((k) => byKey.get(k)!);
  const styleOf = (key: string) => {
    const k = Math.max(0, selKeys.indexOf(key));
    return { colour: PALETTE[k % PALETTE.length], dash: DASHES[Math.floor(k / PALETTE.length) % DASHES.length] };
  };
  const toggle = (key: string) => {
    const next = selKeys.includes(key) ? selKeys.filter((k) => k !== key) : [...selKeys, key];
    set(view === 'mm' ? { mt: next.length ? next.join(',') : 'none' } : { tr: next.length ? next.join(',') : 'none' });
  };

  const markerHz = p.f * 1e9;
  const freq = net?.freq ?? new Float64Array(0);
  const fMin = freq.length ? freq[0] : 0;
  const fMax = freq.length ? freq[freq.length - 1] : 1;
  const fu = freqUnit(fMax);
  const xAxisF = { ...fu, label: 'Frequency' };
  const inRange = net !== null && markerHz >= fMin && markerHz <= fMax;
  const setMarker = (hz: number) => set({ f: Number((hz / 1e9).toPrecision(7)) });
  const stepMarker = (dir: 1 | -1) => {
    if (!freq.length) return;
    const k = lowerIndex(freq, markerHz);
    const exact = k >= 0 && freq[k] === markerHz;
    const next = dir > 0 ? (k < 0 ? 0 : Math.min(freq.length - 1, k + 1)) : Math.max(0, exact ? k - 1 : k);
    setMarker(freq[next]);
  };

  // ── series ───────────────────────────────────────────────────────────────
  const seriesFor = (list: Param[], pick: (d: TraceData) => Float64Array): Series[] =>
    src ? list.map((q) => ({ key: q.key, label: q.label, ...styleOf(q.key), x: freq, y: pick(traceOf(src, q)) })) : [];
  const transmission = selected.filter((q) => !q.reflection || q.kind === 'conversion');
  const reflection = selected.filter((q) => q.reflection && q.kind !== 'conversion');
  const unwrap = p.ph === 'unwrap';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const txSeries = useMemo(() => seriesFor(transmission, (d) => d.db), [src, selKeys.join(',')]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rxSeries = useMemo(() => seriesFor(reflection, (d) => d.db), [src, selKeys.join(',')]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const phSeries = useMemo(() => seriesFor(selected, (d) => (unwrap ? unwrappedDeg(d) : d.deg)), [src, selKeys.join(','), unwrap]);
  const dbRange = (list: Series[]): [number, number] => {
    // 5 dB grid, at least 10 dB tall, at most 120 dB below the highest value
    let top = -Infinity, bottom = Infinity;
    for (const x of list) for (const v of x.y) if (Number.isFinite(v)) {
      if (v > top) top = v;
      if (v < bottom) bottom = v;
    }
    if (!Number.isFinite(top)) return [-40, 0];
    const hi = Math.ceil(top / 5 - 1e-9) * 5;
    const lo = Math.max(hi - 120, Math.floor(bottom / 5 + 1e-9) * 5);
    return [Math.min(lo, hi - 10), hi];
  };
  const txRange = useMemo(() => dbRange(txSeries), [txSeries]);
  const rxRange = useMemo(() => dbRange(rxSeries), [rxSeries]);
  const phRange = useMemo<[number, number]>(() => (unwrap ? rangeOf(phSeries.map((x) => x.y), 90) : [-180, 180]), [phSeries, unwrap]);

  // ── group delay ──────────────────────────────────────────────────────────
  const gdOptions = params.filter((q) => q.kind === 'transmission');
  const gdDefault = view === 'mm' ? 'dd21' : net && net.ports >= 2 ? '2.1' : '';
  const gdParam = byKey.get(p.gd) && byKey.get(p.gd)!.kind === 'transmission' ? byKey.get(p.gd)! : byKey.get(gdDefault) ?? null;
  const aperture = APERTURES.includes(p.ap) ? p.ap : 5;
  const gd = useMemo(() => {
    if (!src || !gdParam) return null;
    const y = groupDelay(freq, traceOf(src, gdParam).t, (aperture - 1) / 2);
    const range = rangeOf([y], 1e-12, { q: 0.01, minSpan: 1e-12 });
    const unit = timeUnit(Math.max(Math.abs(range[0]), Math.abs(range[1])));
    const scaled = y.map((v) => v / unit.div);
    return { y, range, unit, series: [{ key: 'gd', label: `${gdParam.label}, ${aperture}-point aperture`, colour: 'var(--accent)', x: freq, y: scaled }] as Series[] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, gdParam?.key, aperture]);
  const gdUnit = gd?.unit ?? { div: 1e-12, unit: 'ps' };

  // ── TDR ──────────────────────────────────────────────────────────────────
  const tdrOptions = params.filter((q) => q.z0 !== null);
  const tdrParam = byKey.get(p.tdr)?.z0 != null ? byKey.get(p.tdr)! : tdrOptions[0] ?? null;
  const beta = WINDOWS.some((w) => w.beta === p.beta) ? p.beta : 6;
  const tdr = useMemo(() => {
    if (!src || !tdrParam || tdrParam.z0 === null) return null;
    const d = traceOf(src, tdrParam);
    const r = lowPassStep(freq, d.t.re, d.t.im, beta);
    if ('error' in r) return r;
    const N = Math.round(r.fMax / r.df);
    const rise = stepRiseTime(N, r.df, beta);
    const z0 = tdrParam.z0;
    const z = r.rho.map((v) => impedanceFromRho(v, z0));
    // auto time span: until the response has settled to within 1 % of its largest deviation
    const end = r.rho[r.rho.length - 1];
    let peak = 0;
    for (let m = r.t.length >> 1; m < r.t.length; m++) peak = Math.max(peak, Math.abs(r.rho[m] - end));
    let settle = 0;
    for (let m = r.t.length - 1; m >= r.t.length >> 1; m--) {
      if (Math.abs(r.rho[m] - end) > Math.max(1e-3, 0.01 * peak)) {
        settle = r.t[m];
        break;
      }
    }
    const half = r.range / 2;
    const autoEnd = Math.min(half, Math.max(10 * rise, 1.25 * settle));
    const series: Series[] = [{ key: 'z', label: `Z(t), Z0 = ${fmt(z0, 4)} Ω`, colour: 'var(--copper)', x: r.t, y: z }];
    return { ...r, z, z0, rise, autoEnd, half, series };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, tdrParam?.key, beta]);
  const tdrOk = tdr && !('error' in tdr) ? tdr : null;
  const tEnd = tdrOk ? (p.tmax > 0 ? Math.min(tdrOk.half, p.tmax * 1e-9) : tdrOk.autoEnd) : 0;
  const tStart = tdrOk ? -Math.min(tdrOk.half, Math.max(3 * tdrOk.rise, tEnd * 0.05)) : 0;
  const tdrRange = useMemo<[number, number]>(() => {
    if (!tdrOk) return [0, 100];
    let lo = tdrOk.z0, hi = tdrOk.z0;
    for (let m = 0; m < tdrOk.t.length; m++) {
      const z = tdrOk.z[m];
      if (tdrOk.t[m] < tStart || tdrOk.t[m] > tEnd || !Number.isFinite(z)) continue;
      if (z < lo) lo = z;
      if (z > hi) hi = z;
    }
    lo = Math.max(0, lo);
    hi = Math.min(hi, 5 * tdrOk.z0);
    return rangeOf([Float64Array.of(lo, hi)], 5, { minSpan: Math.max(5, 0.1 * tdrOk.z0) });
  }, [tdrOk, tStart, tEnd]);

  // ── interface budget ─────────────────────────────────────────────────────
  const budget: InterfaceSpec | null = BUDGETS.find((i) => i.id === p.iface) ?? null;
  const budgetTerm = net ? (net.ports === 4 && mixed ? { m: mixed as Matrices, q: mmParams(mixed).find((q) => q.key === 'dd21')!, label: 'SDD21' } : net.ports === 2 ? { m: net as Matrices, q: seParams(net).find((q) => q.key === '2.1')!, label: 'S21' } : null) : null;
  const budgetCheck = useMemo(() => {
    if (!budget || !budgetTerm) return null;
    const fN = budget.nyquistGHz * 1e9;
    const v = valueAt(budgetTerm.m.freq, traceOf(budgetTerm.m, budgetTerm.q).t, fN);
    if (!v) return { fN, il: null, pass: null };
    const il = -v.db;
    return { fN, il, pass: il <= budget.lossBudgetDb! };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budget, budgetTerm?.m, budgetTerm?.q.key]);
  const lossRule = budget?.rules.find((r) => r.key === 'loss');

  // ── marker values ────────────────────────────────────────────────────────
  const markerRows = src && inRange ? params.map((q) => ({ q, v: valueAt(freq, traceOf(src, q).t, markerHz) })) : [];
  const nearest = (() => {
    if (!inRange) return null;
    const k = lowerIndex(freq, markerHz);
    return k < freq.length - 1 && freq[k + 1] - markerHz < markerHz - freq[k] ? freq[k + 1] : freq[k];
  })();
  const bigs = selected.slice(0, 4).map((q) => {
    const v = markerRows.find((r) => r.q.key === q.key)?.v ?? null;
    const label = q.kind === 'reflection' ? `${q.label} return loss` : q.kind === 'transmission' ? `${q.label} insertion loss` : `${q.label} conversion`;
    const value = v ? (q.kind === 'conversion' ? dbText(v.db) : dbText(-v.db)) : '—';
    return { key: q.key, label, value };
  });

  // ── notes ────────────────────────────────────────────────────────────────
  const notes: string[] = [];
  if (net) {
    if (!inRange) notes.push(`The ${fmt(p.f, 4)} GHz marker is outside this file's ${fmtFreq(fMin)}–${fmtFreq(fMax)} range; click a plot to move it.`);
    const ext = data ? portsFromFileName(data.name) : null;
    if (ext !== null && ext !== net.ports) notes.push(`The file name says ${ext} ports, but [Number of Ports] is ${net.ports}; the keyword is used.`);
    if (view === 'mm' && mixed && mixed.unequalPairs.length) notes.push(`Pair ${mixed.unequalPairs.join(' and ')} has different reference resistances on its two ports (${net.referenceOhms.join(' / ')} Ω). The mixed-mode conversion assumes equal references within each pair, so these mixed-mode values are not exact.`);
    if (net.referenceOhms.some((r) => r !== 50)) notes.push(`Port references are ${net.referenceOhms.join(' / ')} Ω. Compare with limits and other files at the same reference.`);
  }

  const se = view === 'se';
  const gridLabels = se ? Array.from({ length: net?.ports ?? 0 }, (_, i) => String(i + 1)) : ['D1', 'D2', 'C1', 'C2'];

  const properties = (
    <>
      <Section title="Frequency Marker">
        <NumField label="Frequency" value={p.f} onChange={(v) => set({ f: v })} unit="GHz" min={0} hint="Click a frequency plot to move the marker; arrow keys step between data points." />
        {nearest !== null && <p className="text-faint">Nearest data point {fmtFreq(nearest)}. Between points, dB and phase are interpolated linearly.</p>}
      </Section>
      {net?.ports === 4 && (
        <Section title="Mixed Mode (4-port)">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <span className="text-muted">View</span>
            <Segmented label="View" value={view} onChange={(v) => set({ view: v })} options={[{ value: 'se', label: 'Single-ended' }, { value: 'mm', label: 'Mixed-mode' }]} />
          </div>
          <SelectField label="Port numbering" value={conv} onChange={(v) => set({ conv: v })} width={150} options={[{ value: '13', label: '1-2 in, 3-4 out (1→3)' }, { value: '12', label: '1-3 in, 2-4 out (1→2)' }]} />
          <PairDiagram conv={conv} />
          <p className="text-faint">{conv === '13' ? 'Pair 1 = ports 1 (+) and 2 (−), pair 2 = ports 3 (+) and 4 (−). Lines run 1→3 and 2→4.' : 'Pair 1 = ports 1 (+) and 3 (−), pair 2 = ports 2 (+) and 4 (−). Lines run 1→2 and 3→4.'}</p>
        </Section>
      )}
      {net && (
        <Section title="Traces">
          <TraceGrid params={params} ports={se ? net.ports : 4} selected={selKeys} onToggle={toggle} labels={gridLabels} />
          <p className="text-faint">Row = response, column = stimulus{se ? '' : ' (D = differential, C = common mode of pair 1 or 2)'}.</p>
          <div className="flex gap-2 pt-1">
            <button type="button" className="btn" onClick={() => set(se ? { tr: '' } : { mt: '' })}>Default</button>
            <button type="button" className="btn" onClick={() => set(se ? { tr: 'none' } : { mt: 'none' })}>None</button>
          </div>
        </Section>
      )}
      {net && (
        <Section title="Phase and Group Delay">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <span className="text-muted">Phase</span>
            <Segmented label="Phase" value={unwrap ? 'unwrap' : 'wrap'} onChange={(v) => set({ ph: v })} options={[{ value: 'wrap', label: 'Wrapped' }, { value: 'unwrap', label: 'Unwrapped' }]} />
          </div>
          {gdOptions.length > 0 && <SelectField label="Group delay of" value={gdParam?.key ?? ''} onChange={(v) => set({ gd: v })} width={110} options={gdOptions.map((q) => ({ value: q.key, label: q.label }))} />}
          {gdOptions.length > 0 && <SelectField label="Aperture" value={String(aperture)} onChange={(v) => set({ ap: Number(v) })} width={110} options={APERTURES.map((a) => ({ value: String(a), label: `${a} points` }))} />}
        </Section>
      )}
      {net && tdrOptions.length > 0 && (
        <Section title="Time Domain (TDR)">
          <SelectField label="Reflection" value={tdrParam?.key ?? ''} onChange={(v) => set({ tdr: v })} width={110} options={tdrOptions.map((q) => ({ value: q.key, label: q.label }))} />
          <SelectField label="Window" value={String(beta)} onChange={(v) => set({ beta: Number(v) })} width={130} options={WINDOWS.map((w) => ({ value: String(w.beta), label: w.label }))} />
          <NumField label="Show up to" value={p.tmax} onChange={(v) => set({ tmax: v })} unit="ns" allowZero hint="0 = until the response has settled" />
        </Section>
      )}
      <Section title="Interface Loss Budget">
        <SelectField
          label="Interface"
          value={budget?.id ?? ''}
          onChange={(v) => set({ iface: v })}
          width={150}
          options={[{ value: '', label: 'None' }, ...BUDGETS.map((i) => ({ value: i.id, label: i.name }))]}
        />
        {budget && <p className="text-faint">{budget.lossBudgetDb} dB at the {fmt(budget.nyquistGHz, 4)} GHz Nyquist frequency, from Interface Design Rules.</p>}
      </Section>
    </>
  );

  const status = busy
    ? 'Reading the file…'
    : net && data
      ? `${data.name} · ${net.ports}-port · ${net.freq.length.toLocaleString('en-US')} points · ${fmtFreq(fMin)}–${fmtFreq(fMax)} · Touchstone ${net.version} · ${net.referenceOhms.join(' / ')} Ω`
      : 'No file loaded';

  return (
    <ToolPage
      title="S-Parameter Viewer (.s2p, .s4p)"
      description="Open a Touchstone .s1p to .s16p file in the browser: magnitude, phase and group delay of every S-parameter, mixed-mode SDD21, SDD11 and SCD21 of a 4-port pair, a low-pass TDR impedance profile and interface loss budgets at the Nyquist frequency. The file is not uploaded."
      properties={properties}
      onReset={clear}
      status={status}
      method={<Method budget={budget} />}
    >
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center border-2 border-dashed border-[var(--accent)]" style={{ background: 'color-mix(in srgb, var(--doc) 80%, transparent)' }}>
          <span className="border border-line bg-sheet px-3 py-2 font-semibold">Drop the Touchstone file to open it</span>
        </div>
      )}
      <Panel title="Touchstone File">
        <div className="space-y-2 px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              accept=".s1p,.s2p,.s3p,.s4p,.s5p,.s6p,.s8p,.s12p,.s16p,.ts,.snp"
              className="sr-only"
              aria-label="Choose a Touchstone file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importFile(file);
                e.target.value = '';
              }}
            />
            <button type="button" className="btn" onClick={() => fileInput.current?.click()}>Choose file</button>
            <span className="min-w-0 break-all text-muted">{busy ? 'Reading…' : data?.name || 'or drop a file anywhere on this page'}</span>
          </div>
          <p className="text-muted">The file stays in this browser tab. Touchstone 1.0, 1.1, 2.0 and 2.1; S-, Y- and Z-parameters in RI, MA or DB; 1 to {MAX_PORTS} ports; up to {MAX_FILE_CHARS / 1e6} MB.</p>
          {net && (
            <p className="text-faint break-all">
              {net.ports}-port · {fmtFreq(fMin)}–{fmtFreq(fMax)} · {net.freq.length.toLocaleString('en-US')} points · version {net.version} · {net.parameter}-parameters, {net.format} · {net.matrix} matrix
              {net.twoPortOrder ? ` · order ${net.twoPortOrder}` : ''}
            </p>
          )}
          {net && <Notes items={net.notes} />}
        </div>
      </Panel>
      <Notes kind="error" items={error ? [error] : []} />
      <Notes items={notes} />
      {net && src && (
        <>
          {selected.length > 0 && (
            <Panel title={`At ${fmt(p.f, 4)} GHz${view === 'mm' ? ' (mixed mode)' : ''}`}>
              {inRange ? (
                <div className="flex flex-wrap gap-6 px-3 py-3">
                  {bigs.map((b) => <Big key={b.key} label={b.label} value={b.value} unit="dB" />)}
                </div>
              ) : (
                <p className="px-3 py-3 text-muted">Set the marker inside {fmtFreq(fMin)}–{fmtFreq(fMax)} to read values.</p>
              )}
            </Panel>
          )}
          {budget && (
            <Panel title={`${budget.name} loss budget`}>
              <div className="space-y-2 px-3 py-3">
                {!budgetTerm ? (
                  <p className="text-muted">The budget applies to the differential insertion loss. Open a 4-port (converted to SDD21) or a 2-port file of the differential channel.</p>
                ) : budgetCheck?.il == null ? (
                  <p className="text-muted">The {fmt(budget.nyquistGHz, 4)} GHz Nyquist frequency is outside this file's {fmtFreq(fMin)}–{fmtFreq(fMax)} range, so the budget cannot be checked.</p>
                ) : (
                  <div className="flex flex-wrap items-end gap-6">
                    <Big label={`${budgetTerm.label} insertion loss at ${fmt(budget.nyquistGHz, 4)} GHz`} value={dbText(budgetCheck.il)} unit="dB" />
                    <Big label="Budget" value={fmt(budget.lossBudgetDb!, 4)} unit="dB" />
                    <div className={`pb-1 font-semibold ${budgetCheck.pass ? 'text-[var(--ok)]' : 'text-[var(--err-line)]'}`}>{budgetCheck.pass ? 'Within the budget' : 'Over the budget'}</div>
                  </div>
                )}
                {budget.lossNote && <p className="text-muted">{budget.lossNote}</p>}
                <p className="text-faint">
                  A single loss figure at the Nyquist frequency is all the interface data gives, so it is checked as one point, not as a mask. It is the board's share of the channel: a connector or via file is only part of that share.
                  {lossRule ? ` Source: ${budget.sources[lossRule.src]?.title ?? ''}.` : ''}
                </p>
                {budgetTerm && net.ports === 2 && <p className="text-faint">For a 2-port file, S21 is taken to be the differential insertion loss (for example an SDD export).</p>}
              </div>
            </Panel>
          )}
          {txSeries.length > 0 && (
            <Panel title={view === 'mm' ? 'Transmission and Mode Conversion |S| (dB)' : 'Transmission |S| (dB)'}>
              <div className="px-2 py-2">
                <Plot
                  title="Transmission magnitude against frequency"
                  series={txSeries}
                  x0={fMin}
                  x1={fMax}
                  xAxis={xAxisF}
                  yLabel="|S| (dB)"
                  yRange={txRange}
                  markerX={markerHz}
                  onMarker={setMarker}
                  onStep={stepMarker}
                  overlay={
                    budget && budgetCheck
                      ? (X, Y) => {
                          const x = X(budgetCheck.fN), y = Y(-budget.lossBudgetDb!);
                          const colour = budgetCheck.pass === null ? 'var(--muted)' : budgetCheck.pass ? 'var(--ok)' : 'var(--err-line)';
                          return (
                            <g>
                              <line x1={x} x2={x} y1={TOP} y2={H - BOTTOM} stroke={colour} strokeDasharray="1 3" />
                              <path d={`M${x - 6},${y}L${x},${y - 6}L${x + 6},${y}L${x},${y + 6}Z`} fill={colour} />
                              <text x={x + 9} y={y + 16} fontSize={11} fill={colour}>{`${budgetTerm?.label ?? 'IL'} budget −${budget.lossBudgetDb} dB`}</text>
                            </g>
                          );
                        }
                      : undefined
                  }
                />
              </div>
            </Panel>
          )}
          {rxSeries.length > 0 && (
            <Panel title="Reflection |S| (dB)">
              <div className="px-2 py-2">
                <Plot title="Reflection magnitude against frequency" series={rxSeries} x0={fMin} x1={fMax} xAxis={xAxisF} yLabel="|S| (dB)" yRange={rxRange} markerX={markerHz} onMarker={setMarker} onStep={stepMarker} />
              </div>
            </Panel>
          )}
          {phSeries.length > 0 && (
            <Panel title={unwrap ? 'Phase, unwrapped (°)' : 'Phase (°)'}>
              <div className="px-2 py-2">
                <Plot title="Phase against frequency" series={phSeries} x0={fMin} x1={fMax} xAxis={xAxisF} yLabel="Phase (°)" yRange={phRange} markerX={markerHz} onMarker={setMarker} onStep={stepMarker} />
              </div>
            </Panel>
          )}
          {gd && gdParam && (
            <Panel title={`Group Delay of ${gdParam.label}`}>
              <div className="px-2 py-2">
                <Plot
                  title="Group delay against frequency"
                  series={gd.series}
                  x0={fMin}
                  x1={fMax}
                  xAxis={xAxisF}
                  yLabel={`Group delay (${gdUnit.unit})`}
                  yRange={[gd.range[0] / gdUnit.div, gd.range[1] / gdUnit.div]}
                  markerX={markerHz}
                  onMarker={setMarker}
                  onStep={stepMarker}
                />
                <GdReadout freq={freq} y={gd.y} markerHz={markerHz} unit={gdUnit} aperture={aperture} />
              </div>
            </Panel>
          )}
          {tdrParam && (
            <Panel title={`Time-Domain Impedance from ${tdrParam.label} (low-pass step)`}>
              {tdr && 'error' in tdr ? (
                <p className="px-3 py-3 text-muted">Not available for this file. {tdr.error}</p>
              ) : tdrOk ? (
                <div className="px-2 py-2">
                  <Plot
                    title="Impedance against time"
                    series={tdrOk.series}
                    x0={tStart}
                    x1={tEnd}
                    xAxis={{ ...timeUnit(tEnd), label: 'Round-trip time' }}
                    yLabel="Impedance (Ω)"
                    yRange={tdrRange}
                    overlay={(X, Y) => <line x1={X(tStart)} x2={X(tEnd)} y1={Y(tdrOk.z0)} y2={Y(tdrOk.z0)} stroke="var(--muted)" strokeDasharray="5 4" />}
                  />
                  <p className="px-1 pt-1 text-faint">
                    Step rise time (10–90 %) {fmt(tdrOk.rise / 1e-12, 3)} ps from f<sub>max</sub> = {fmtFreq(tdrOk.fMax)} and the {WINDOWS.find((w) => w.beta === beta)?.label.toLowerCase()} window; features closer than this are not resolved. Alias-free range 1/Δf = {fmt(tdrOk.range / 1e-9, 4)} ns (Δf = {fmtFreq(tdrOk.df)}); the plot shows at most half of it.
                    {tdrOk.dcExtrapolated ? ` DC value extrapolated: ρ(0) = ${fmt(tdrOk.dc, 4)}.` : ` DC value from the file: ρ(0) = ${fmt(tdrOk.dc, 4)}.`} All other ports are terminated in their reference resistances.
                  </p>
                </div>
              ) : null}
            </Panel>
          )}
          {inRange && markerRows.length > 0 && (
            <Panel title={`All parameters at ${fmt(p.f, 4)} GHz`}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th className="v">|S| (dB)</th>
                    <th className="v">Phase (°)</th>
                    <th className="v">|S|</th>
                  </tr>
                </thead>
                <tbody>
                  {markerRows.map(({ q, v }) => (
                    <tr key={q.key}>
                      <td>{q.label} <span className="text-faint">{q.kind === 'reflection' ? 'reflection' : q.kind === 'transmission' ? 'transmission' : 'mode conversion'}</span></td>
                      <td className="v">{v ? dbText(v.db) : '—'}</td>
                      <td className="v">{v && Number.isFinite(v.db) ? fmt(v.deg, 4) : '—'}</td>
                      <td className="v">{v ? fmt(10 ** (v.db / 20), 4) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
        </>
      )}
      {!net && !error && !busy && <p className="px-1 text-muted">Open a measured or simulated connector, via, package, cable or channel model to inspect its response. 4-port files can be viewed as one differential pair in mixed mode.</p>}
      <p className="px-1 text-muted">
        Need the PCB trace estimate and a routing frequency? <Link to="/interface-rules">Open Interface Design Rules</Link>. Do not simply add this file’s loss to the trace estimate: mismatches and reference impedances affect a combined channel.
      </p>
    </ToolPage>
  );
}

function GdReadout({ freq, y, markerHz, unit, aperture }: { freq: Float64Array; y: Float64Array; markerHz: number; unit: { div: number; unit: string }; aperture: number }) {
  const k = lowerIndex(freq, markerHz);
  const inside = k >= 0 && markerHz <= freq[freq.length - 1];
  let v: number | null = null;
  if (inside) {
    const a = y[k], b = k < freq.length - 1 ? y[k + 1] : a;
    const u = k < freq.length - 1 ? (markerHz - freq[k]) / (freq[k + 1] - freq[k]) : 0;
    const r = a + (b - a) * u;
    v = Number.isFinite(r) ? r : null;
  }
  const mid = Math.floor(freq.length / 2);
  const span = freq.length > aperture ? freq[Math.min(freq.length - 1, mid + (aperture - 1) / 2)] - freq[Math.max(0, mid - (aperture - 1) / 2)] : NaN;
  return (
    <p className="px-1 pt-1 text-faint">
      {v !== null ? `${fmt(v / unit.div, 4)} ${unit.unit} at the marker. ` : ''}
      Aperture {aperture} points{Number.isFinite(span) ? ` (about ${fmtFreq(span)} mid-band)` : ''}; a wider aperture smooths noise but hides fast changes. The y-axis spans the 1st to 99th percentile; spikes beyond it are clipped.
    </p>
  );
}

function Method({ budget }: { budget: InterfaceSpec | null }) {
  return (
    <>
      <h2>Reading the file</h2>
      <p>
        The reader follows the IBIS Touchstone specification, versions 1.0, 1.1, 2.0 and 2.1 [1, 2]. The option line sets the frequency unit (Hz, kHz, MHz, GHz; default GHz), the parameter (S, Y, Z; default S), the
        data format (RI, MA, DB; default MA) and the reference resistance R (default 50 Ω). Only the first option line counts. A version 1.1 option line may list one R per port. Comments start at “!”.
      </p>
      <p>
        Version 1.x files do not state their port count, so it is taken from the .sNp file extension. A 1-port or 2-port frequency point is one line; for three or more ports the matrix is written row by row,
        each row starting on a new line and wrapping after four pairs. 2-port data uses the order N11, N21, N12, N22, the one exception to row order. In a 1.x 2-port file, noise data starts where the frequency
        stops increasing.
      </p>
      <p>
        Version 2.x files start with [Version], followed by the option line and [Number of Ports]. [Two-Port Data Order] (21_12 or 12_21) is required for 2-ports, [Number of Frequencies] for all files, and
        [Reference] can give each port its own resistance, also across several lines. [Matrix Format] Lower or Upper stores only one triangle of a symmetric matrix, row by row, and the other triangle is
        mirrored. Data for one frequency may span any number of lines, but every frequency point must start on a new line; the reader uses this to catch a wrong port count. [Begin Information] blocks and
        [Noise Data] are skipped, and the file must end with [End]. Errors are reported with their line number.
      </p>
      <p>
        Two departures from the specification found in exported files are read with a note rather than refused: a [Version] 1.0 or 1.1 line (the file is then read as version 1), and a 2.x 2-port file
        without [Two-Port Data Order], for which the version 1 order 21_12 is assumed. If such a file was written in 12_21 order, S21 and S12 are swapped.
      </p>
      <p>Files with [Mixed-Mode Order] and H- or G-parameter files are not read: mixed-mode data has a per-file port order that this viewer does not map, and hybrid parameters are rarely used for interconnect.</p>
      <h2>Y- and Z-parameters</h2>
      <p>The specification defines the waves at port i with its reference resistance R<sub>i</sub> as power waves [1]:</p>
      <div className="eq"><span className="no">(1)</span>a<sub>i</sub> = (V<sub>i</sub> + R<sub>i</sub>I<sub>i</sub>) / (2√R<sub>i</sub>), b<sub>i</sub> = (V<sub>i</sub> − R<sub>i</sub>I<sub>i</sub>) / (2√R<sub>i</sub>)</div>
      <p>With V = ZI this gives, for D = diag(1/√R<sub>i</sub>) and R = diag(R<sub>i</sub>):</p>
      <div className="eq"><span className="no">(2)</span>S = D (Z − R)(Z + R)<sup>−1</sup> D<sup>−1</sup> = D (I − RY)(I + RY)<sup>−1</sup> D<sup>−1</sup></div>
      <p>
        Version 1.x Y- and Z-data is normalised to R, so R = I in (2). Version 2.x Y- and Z-data is not normalised and carries no reference of its own; the S-parameters are then computed for the resistances
        listed in the file, or 50 Ω.
      </p>
      <h2>Magnitude, phase and the marker</h2>
      <p>
        |S| in dB is 20 log<sub>10</sub>|S|; insertion loss and return loss are −20 log<sub>10</sub>|S| of a transmission and a reflection term. Phase is arg S in degrees. Unwrapped phase adds whole turns
        wherever neighbouring points differ by more than 180°. At the marker, dB and phase are interpolated linearly between the two nearest data points; nothing is extrapolated beyond the file.
      </p>
      <h2>Mixed-mode S-parameters of a 4-port</h2>
      <p>
        One pair of single-ended ports p and n forms a differential and a common-mode port. With both ports referenced to the same resistance R, the differential mode is referenced to 2R and the common mode to
        R/2, and the mixed-mode waves are [1 Appendix A, 3]:
      </p>
      <div className="eq"><span className="no">(3)</span>a<sub>D</sub> = (a<sub>p</sub> − a<sub>n</sub>)/√2, a<sub>C</sub> = (a<sub>p</sub> + a<sub>n</sub>)/√2, and the same for b</div>
      <div className="eq"><span className="no">(4)</span>S<sub>mm</sub> = M S M<sup>T</sup>, M<sup>−1</sup> = M<sup>T</sup></div>
      <p>
        M has one row per mixed-mode port (D1, D2, C1, C2) with ±1/√2 at the two single-ended ports of the pair. Written out, SDD21 = ½(S<sub>p2p1</sub> − S<sub>p2n1</sub> − S<sub>n2p1</sub> + S<sub>n2n1</sub>) and
        SCD21 = ½(S<sub>p2p1</sub> − S<sub>p2n1</sub> + S<sub>n2p1</sub> − S<sub>n2n1</sub>). The port numbering selects p and n: “1-2 in, 3-4 out” uses pair 1 = (1, 2) and pair 2 = (3, 4), with lines 1→3 and 2→4;
        “1-3 in, 2-4 out” uses pair 1 = (1, 3) and pair 2 = (2, 4), with lines 1→2 and 3→4. The wrong choice shows almost no SDD21. Equal real references within each pair are assumed, as in the specification;
        the viewer warns when they differ. SDD21 is differential insertion loss, SDD11 differential return loss, SCD21 conversion of a differential input to a common-mode output, and SCC11 common-mode
        return loss.
      </p>
      <h2>Group delay</h2>
      <p>Group delay is the negative slope of the phase against angular frequency. It is computed as a finite difference of the unwrapped phase φ across an aperture of k points centred on each point [4]:</p>
      <div className="eq"><span className="no">(5)</span>τ<sub>g</sub>(f<sub>i</sub>) = −(φ<sub>i+h</sub> − φ<sub>i−h</sub>) / (2π (f<sub>i+h</sub> − f<sub>i−h</sub>)), h = (k − 1)/2</div>
      <p>
        At the ends of the data the aperture is cut short. A wider aperture lowers the noise and hides fast changes [4]. The phase must change by less than 180° between neighbouring points; for a delay τ that
        needs a frequency step below 1/(2τ), otherwise the delay is wrong.
      </p>
      <h2>Time-domain impedance (low-pass step)</h2>
      <p>The impedance profile follows the low-pass step mode of a vector network analyser [5]:</p>
      <ol>
        <li>The data must lie on a harmonic grid f<sub>k</sub> = k·Δf from DC (or from Δf) to f<sub>max</sub>; points may deviate by 1 % of Δf to allow for rounding in the file. Other grids show no profile.</li>
        <li>Without a DC point, ρ(0) is extrapolated. The real part of the response of a real network is even in frequency and the imaginary part odd, so Re S = a + b f² is fitted through the first two points and Im S(0) = 0.</li>
        <li>A Kaiser window with β = 0, 6 or 13 is applied about DC. With this implementation these give step rise times of 0.45, 0.99 and 1.47 / f<sub>max</sub>, matching the minimum, normal and maximum windows of [5, Table 1-3].</li>
        <li>The spectrum is mirrored as S(−f) = S*(f) and inverse-transformed by FFT (zero-padded) to the impulse response; its running sum is the step response ρ(t), which settles at the windowed DC value.</li>
        <li>Z(t) = Z<sub>0</sub>(1 + ρ)/(1 − ρ), with Z<sub>0</sub> the port reference, 2R for SDD and R/2 for SCC.</li>
      </ol>
      <p>
        The time axis is the round trip. The response repeats every 1/Δf, so reflections later than half of that wrap round and are not shown. The profile is the step response of the file, band-limited to
        f<sub>max</sub>: features shorter than the rise time are smeared, a large discontinuity hides those behind it (multiple reflections are not removed), and the result depends on the DC extrapolation.
      </p>
      <h2>Interface loss budgets</h2>
      <p>
        The budgets come from the interface data used by Interface Design Rules: one insertion-loss figure per interface at its Nyquist frequency, for the board's share of the channel. The viewer compares the
        differential insertion loss (SDD21 of a 4-port, S21 of a 2-port) with that figure at that one frequency. No frequency-dependent mask or return-loss limit is drawn, because the data does not contain one.
      </p>
      <h2>Plotting</h2>
      <p>
        Each trace is reduced to the first, lowest, highest and last point of every horizontal plot column before drawing, so narrow resonances survive in files with many thousands of points. Values below
        the bottom of the axis are drawn on it, and zero magnitude is shown as −∞ dB.
      </p>
      <h2>References</h2>
      <ol>
        <li><a href="https://ibis.org/touchstone_ver2.1/touchstone_ver2_1.pdf" target="_blank" rel="noopener noreferrer">IBIS Open Forum, Touchstone File Format Specification, version 2.1 (26 January 2024)</a>: option line, keywords, data layout, power waves, mixed-mode definitions and Appendix A.</li>
        <li><a href="https://ibis.org/touchstone_ver2.0/touchstone_ver2_0.pdf" target="_blank" rel="noopener noreferrer">IBIS Open Forum, Touchstone File Format Specification, version 2.0</a>; version 2.1 files are identical apart from the [Version] argument.</li>
        <li><a href="https://doi.org/10.1109/22.392911" target="_blank" rel="noopener noreferrer">D. E. Bockelman and W. R. Eisenstadt, “Combined differential and common-mode scattering parameters: theory and simulation”, IEEE Trans. Microwave Theory Tech., vol. 43, no. 7, pp. 1530–1539, July 1995</a>.</li>
        <li><a href="https://helpfiles.keysight.com/csg/m9485a/tutorials/group_delay6_5.htm" target="_blank" rel="noopener noreferrer">Keysight, network analyser help: Group Delay</a>: aperture, −Δφ/Δf, the 180° limit between points.</li>
        <li><a href="https://www.keysight.com/us/en/assets/7018-01451/application-notes/5989-5723.pdf" target="_blank" rel="noopener noreferrer">Keysight application note 5989-5723EN, Time Domain Analysis Using a Network Analyzer</a>: §4.1 low-pass mode, §5 windowing, §8 range, §9 resolution.</li>
      </ol>
      {budget && <Sources items={budget.sources} />}
    </>
  );
}
