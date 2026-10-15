import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Accuracy, Geometry } from '../lib/fieldsolver';
import { niceTicks, sweepDef, sweepGeometry, sweepParams, type SweepParam } from '../lib/impedanceSweep';
import { runPooled } from '../lib/solverClient';
import { fmt, fromMm, type LenUnit } from '../lib/units';
import { Panel } from './ui';

const NAMES: Record<SweepParam, string> = { w: 'Trace width', h: 'Dielectric height', er: 'Dielectric Dk', s: 'Pair spacing', gap: 'Gap to ground', mask: 'Mask thickness' };

/**
 * Z0 (or Zdiff) of the current cross-section with one input varied around its value. Each point is a
 * full field-solver run on the worker pool; the other inputs stay as entered.
 */
export function ImpedanceSweep({ geom, acc, param, onParam, target, currentZ, unit }: {
  geom: Geometry | null; acc: Accuracy; param: string; onParam: (p: string) => void; target: number; currentZ?: number; unit: LenUnit;
}) {
  const id = useId();
  const options = geom ? sweepParams(geom) : [];
  const active = options.includes(param as SweepParam) ? (param as SweepParam) : null;
  const def = useMemo(() => (geom && active ? sweepDef(geom, active) : null), [geom, active]);
  const key = JSON.stringify([geom, active, acc]);
  const [state, setState] = useState<{ key: string; zs: (number | null)[] }>({ key: '', zs: [] });
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    if (!geom || !def) return;
    const t = setTimeout(() => {
      void Promise.all(
        def.values.map((v) =>
          runPooled({ type: 'solve', geom: sweepGeometry(geom, def.param, v), opts: { accuracy: acc, field: false, even: false } }).then((r) => {
            const z = r.ok && r.result ? (geom.diff ? r.result.zdiff : r.result.se?.z) : undefined;
            return z !== undefined && Number.isFinite(z) ? z : null;
          }),
        ),
      ).then((zs) => {
        if (mine === seq.current) setState({ key, zs });
      });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const zs = state.key === key ? state.zs : null;
  const toX = (v: number) => (def?.kind === 'percent' ? v : fromMm(v, unit));
  const xUnit = def?.kind === 'percent' ? '%' : unit;
  const zName = geom?.diff ? 'Zdiff' : 'Z0';

  const select = (
    <label className="flex items-center gap-2 text-muted" htmlFor={id}>
      Vary
      <select id={id} className="fld" style={{ width: 150 }} value={active ?? ''} onChange={(e) => onParam(e.target.value)} disabled={!geom}>
        <option value="">Nothing</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o === 's' && geom?.coupling === 'broadside' ? 'Inter-layer gap' : NAMES[o]}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Panel title="Sweep" right={select} className="mt-3">
      {!def ? (
        <p className="px-3 py-3 text-muted">
          Choose an input to see how {zName} changes as it varies around the current design, for example how close ground pour can come or what a thinner dielectric does. Each point is a full field-solver run.
        </p>
      ) : (
        <div className="px-2 py-2">
          <SweepPlot xs={def.values.map(toX)} zs={zs} current={toX(def.current)} currentZ={currentZ} target={target} xLabel={`${def.label} (${xUnit})`} zName={zName} xUnit={xUnit} />
          <p className="px-1 pt-1 text-faint">
            {def.values.length} field-solver points at {acc} accuracy, {def.kind === 'percent' ? 'every dielectric scaled together' : 'from ' + fmt(toX(def.values[0]), 3) + ' to ' + fmt(toX(def.values[def.values.length - 1]), 3) + ' ' + xUnit}. {def.param === 'h' ? 'All dielectric heights, including any resin band above copper, scale together; copper thickness stays fixed.' : 'All other inputs stay as entered.'} The dashed line marks the current design.
          </p>
        </div>
      )}
    </Panel>
  );
}

function SweepPlot({ xs, zs, current, currentZ, target, xLabel, zName, xUnit }: {
  xs: number[]; zs: (number | null)[] | null; current: number; currentZ?: number; target: number; xLabel: string; zName: string; xUnit: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 280, ml = 56, mr = 16, mt = 26, mb = 44;
  const ok = zs ? zs.filter((z): z is number => z !== null) : [];
  const x0 = xs[0], x1 = xs[xs.length - 1];
  // show the target and its ±10 % band when they are near the data
  let lo = ok.length ? Math.min(...ok) : target * 0.9;
  let hi = ok.length ? Math.max(...ok) : target * 1.1;
  if (target > 0 && target > lo - (hi - lo) && target < hi + (hi - lo)) {
    lo = Math.min(lo, target);
    hi = Math.max(hi, target);
  }
  const pad = Math.max((hi - lo) * 0.08, hi * 0.005);
  lo -= pad;
  hi += pad;
  const px = (x: number) => ml + ((W - ml - mr) * (x - x0)) / (x1 - x0 || 1);
  const py = (z: number) => mt + ((H - mt - mb) * (hi - z)) / (hi - lo || 1);
  const clampY = (z: number) => Math.min(H - mb, Math.max(mt, py(z)));
  const pts = zs ? xs.map((x, i) => (zs[i] === null ? null : ([px(x), py(zs[i] as number)] as const))) : [];
  const path = pts.filter(Boolean).map((p, i) => `${i ? 'L' : 'M'}${p![0].toFixed(1)},${p![1].toFixed(1)}`).join(' ');
  const hz = hover !== null && zs ? zs[hover] : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full max-w-[740px]"
      role="img"
      aria-label={`${zName} versus ${xLabel}${ok.length ? `, from ${fmt(Math.min(...ok), 4)} to ${fmt(Math.max(...ok), 4)} ohm` : ''}`}
      onMouseLeave={() => setHover(null)}
      onMouseMove={(e) => {
        if (!zs) return;
        const r = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * W;
        let best = 0;
        xs.forEach((v, i) => {
          if (Math.abs(px(v) - x) < Math.abs(px(xs[best]) - x)) best = i;
        });
        setHover(best);
      }}
    >
      {target > 0 && <rect x={ml} width={W - ml - mr} y={clampY(target * 1.1)} height={Math.max(0, clampY(target * 0.9) - clampY(target * 1.1))} fill="var(--ok)" opacity="0.08" />}
      {niceTicks(lo, hi, 5).map((t) => (
        <g key={'y' + t}>
          <line x1={ml} x2={W - mr} y1={py(t)} y2={py(t)} stroke="var(--line)" />
          <text x={ml - 8} y={py(t) + 4} textAnchor="end" fontSize="12" fill="var(--muted)">{fmt(t, 4)}</text>
        </g>
      ))}
      {niceTicks(x0, x1, 6).map((t) => (
        <g key={'x' + t}>
          <line x1={px(t)} x2={px(t)} y1={mt} y2={H - mb} stroke="var(--line)" opacity="0.5" />
          <text x={px(t)} y={H - mb + 18} textAnchor="middle" fontSize="12" fill="var(--muted)">{fmt(t, 4)}</text>
        </g>
      ))}
      <text x={(ml + W - mr) / 2} y={H - 8} textAnchor="middle" fontSize="13" fill="var(--muted)">{xLabel}</text>
      <text x={14} y={mt - 10} fontSize="13" fill="var(--muted)">{zName} (Ω)</text>
      {target > 0 && target >= lo && target <= hi && (
        <>
          <line x1={ml} x2={W - mr} y1={py(target)} y2={py(target)} stroke="var(--ok)" strokeDasharray="6 4" />
          <text x={W - mr - 4} y={py(target) - 5} textAnchor="end" fontSize="12" fill="var(--ok)">target {fmt(target, 4)} Ω ±10 %</text>
        </>
      )}
      {current >= Math.min(x0, x1) && current <= Math.max(x0, x1) && <line x1={px(current)} x2={px(current)} y1={mt} y2={H - mb} stroke="var(--accent-ink)" strokeDasharray="3 3" />}
      {zs ? (
        <>
          <path d={path} fill="none" stroke="var(--copper)" strokeWidth="2.5" />
          {pts.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r={hover === i ? 5 : 3} fill="var(--copper)" />)}
          {currentZ !== undefined && Number.isFinite(currentZ) && currentZ >= lo && currentZ <= hi && <circle cx={px(current)} cy={py(currentZ)} r="5" fill="none" stroke="var(--accent-ink)" strokeWidth="2" />}
        </>
      ) : (
        <text x={(ml + W - mr) / 2} y={(mt + H - mb) / 2} textAnchor="middle" fontSize="14" fill="var(--muted)">Calculating {xs.length} points…</text>
      )}
      {hz !== null && hover !== null && (
        <text x={ml + 6} y={mt + 14} fontSize="13" fill="var(--ink)">
          {fmt(xs[hover], 4)} {xUnit} → {fmt(hz, 4)} Ω
        </text>
      )}
    </svg>
  );
}
