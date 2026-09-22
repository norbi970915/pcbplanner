import { Fragment, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ToolPage } from '../components/ToolPage';
import { LenField, Notes, NumField, Panel, Section, SelectField } from '../components/ui';
import { nominalThickness, planAdvice, rankAdvice, type Constraints, type Ranked, type Requirement } from '../lib/advisor';
import type { DesignResult } from '../lib/design';
import type { Accuracy } from '../lib/fieldsolver';
import { cancelPool, poolSize, runPooled } from '../lib/solverClient';
import { copperCount, geometryForLayer } from '../lib/stackups';
import { fmt, fromMm } from '../lib/units';
import { useSettings } from '../state/settings';
import { useStackups } from '../state/stackupStore';
import { useUrlState } from '../state/useUrlState';

const THICKNESSES = [0.8, 1.0, 1.2, 1.6, 1.8, 2.0];
const LAYER_COUNTS = [2, 4, 6, 8, 10, 12];

const PRESET_REQS: Record<string, Omit<Requirement, 'id'>> = {
  se50: { label: '50 Ω single-ended', kind: 'se', z: 50, spacing: 'ratio', s: 0.15, ratio: 1, where: 'all' },
  usb90: { label: 'USB 90 Ω diff', kind: 'diff', z: 90, spacing: 'ratio', s: 0.15, ratio: 1, where: 'all' },
  pcie85: { label: 'PCIe 85 Ω diff', kind: 'diff', z: 85, spacing: 'ratio', s: 0.15, ratio: 1, where: 'all' },
  eth100: { label: 'Ethernet/HDMI 100 Ω diff', kind: 'diff', z: 100, spacing: 'ratio', s: 0.15, ratio: 1, where: 'all' },
  ddr40: { label: 'DDR 40 Ω single-ended', kind: 'se', z: 40, spacing: 'ratio', s: 0.15, ratio: 1, where: 'all' },
};

const DEFAULTS = {
  lmin: 4,
  lmax: 6,
  tmin: 1.6,
  tmax: 1.6,
  sig: 2,
  minW: 0.09,
  minS: 0.09,
  maxW: 0.35,
  etch: 0.0127,
  prio: 'cost',
  acc: 'fast',
  reqs: JSON.stringify([
    { id: 'r1', ...PRESET_REQS.se50 },
    { id: 'r2', ...PRESET_REQS.usb90 },
  ]),
};

function parseReqs(s: string): Requirement[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export default function StackupAdvisor() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const { unit } = useSettings();
  const stackups = useStackups();
  const navigate = useNavigate();
  const reqs = useMemo(() => parseReqs(p.reqs), [p.reqs]);
  const setReqs = (r: Requirement[]) => set({ reqs: JSON.stringify(r) });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [ranked, setRanked] = useState<Ranked[] | null>(null);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const runId = useRef(0);

  const c: Constraints = {
    layersMin: p.lmin,
    layersMax: p.lmax,
    thickMin: p.tmin,
    thickMax: p.tmax,
    signalMin: p.sig,
    minW: p.minW,
    minS: p.minS,
    maxW: p.maxW,
    etch: p.etch,
    priority: p.prio as 'cost' | 'margin',
  };
  const preview = useMemo(() => planAdvice(stackups, reqs, c, p.acc as Accuracy), [stackups, reqs, JSON.stringify(c), p.acc]); // eslint-disable-line react-hooks/exhaustive-deps
  const errors: string[] = [];
  if (!reqs.length) errors.push('Add at least one impedance requirement.');
  if (p.lmin > p.lmax) errors.push('Minimum layer count is above the maximum.');
  if (p.tmin > p.tmax) errors.push('Minimum thickness is above the maximum.');

  const run = async () => {
    const my = ++runId.current;
    setRunning(true);
    setRanked(null);
    const { plans, rejected, jobs } = preview;
    setRejectedCount(rejected.length);
    const results = new Map<string, DesignResult | string>();
    const entries = [...jobs.entries()];
    setProgress({ done: 0, total: entries.length });
    let done = 0;
    await Promise.all(
      entries.map(([key, req]) =>
        runPooled({ type: 'design', req }).then((r) => {
          if (my !== runId.current) return;
          results.set(key, r.ok && r.design ? r.design : r.ok ? 'no result' : r.error);
          done++;
          setProgress({ done, total: entries.length });
        }),
      ),
    );
    if (my !== runId.current) return;
    setRanked(rankAdvice(plans, reqs, c, results));
    setRunning(false);
  };
  const stop = () => {
    runId.current++;
    cancelPool();
    setRunning(false);
  };

  const L = (mm: number) => fmt(fromMm(mm, unit), 3);
  const cellText = (r: Ranked, reqId: string, outer: boolean) => {
    const cells = (r.cells[reqId] ?? []).filter((cl) => {
      const layer = r.plan.layers.find((l) => l.name === cl.layer);
      return layer?.outer === outer;
    });
    if (!cells.length) return <span className="text-faint">—</span>;
    const worst = cells.reduce((a, b) => ((a.result?.w ?? 0) <= (b.result?.w ?? 0) ? a : b));
    if (!worst.result) return <span className="text-[var(--err-line)]">error</span>;
    const { w, s } = worst.result;
    const txt = s !== undefined ? `${L(w)} / ${L(s)}` : L(w);
    return <span className={worst.ok ? '' : 'text-[var(--err-line)]'}>{txt}</span>;
  };

  const openLayer = (r: Ranked, layerId: string) => {
    const g = geometryForLayer(r.plan.stackup, layerId);
    if (!g) return;
    const q = new URLSearchParams({ type: g.type, h: String(g.h), er: String(g.er), t: String(g.t), etch: String(p.etch) });
    if (g.h2 !== undefined) {
      q.set('h2', String(g.h2));
      q.set('er2', String(g.er2 ?? g.er));
    }
    if (g.type === 'microstrip') {
      q.set('mask', g.mask ? '1' : '0');
      if (g.mask) {
        q.set('c1', String(g.mask.c1));
        q.set('c2', String(g.mask.c2));
        q.set('erm', String(g.mask.er));
      }
    }
    navigate(`/impedance?${q.toString()}`);
  };

  const updateReq = (i: number, patch: Partial<Requirement>) => setReqs(reqs.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  const properties = (
    <>
      <Section title="Board">
        <SelectField label="Layers (min)" value={String(p.lmin)} onChange={(v) => set({ lmin: Number(v) })} options={LAYER_COUNTS.map((n) => ({ value: String(n), label: `${n}` }))} width={80} />
        <SelectField label="Layers (max)" value={String(p.lmax)} onChange={(v) => set({ lmax: Number(v) })} options={LAYER_COUNTS.map((n) => ({ value: String(n), label: `${n}` }))} width={80} />
        <SelectField label="Thickness (min)" value={String(p.tmin)} onChange={(v) => set({ tmin: Number(v) })} options={THICKNESSES.map((t) => ({ value: String(t), label: `${t} mm` }))} width={80} />
        <SelectField label="Thickness (max)" value={String(p.tmax)} onChange={(v) => set({ tmax: Number(v) })} options={THICKNESSES.map((t) => ({ value: String(t), label: `${t} mm` }))} width={80} />
        <NumField label="Signal layers needed" value={p.sig} onChange={(v) => set({ sig: Math.max(1, Math.round(v)) })} unit="" />
      </Section>
      <Section title="Fabrication Limits">
        <LenField label="Minimum trace width" value={p.minW} onChange={(v) => set({ minW: v })} />
        <LenField label="Minimum spacing" value={p.minS} onChange={(v) => set({ minS: v })} />
        <LenField label="Maximum trace width" value={p.maxW} onChange={(v) => set({ maxW: v })} hint="Widest trace that still routes, e.g. between BGA pads or through connector pin fields." />
        <LenField label="Etch (W − top)" value={p.etch} onChange={(v) => set({ etch: v })} allowZero />
      </Section>
      <Section title="Impedance Requirements">
        {reqs.map((r, i) => (
          <div key={r.id} className="space-y-[3px] border-b border-line pb-1.5 last:border-b-0">
            <div className="flex items-center gap-1">
              <input className="fld min-w-0 flex-1" aria-label="Requirement name" value={r.label} onChange={(e) => updateReq(i, { label: e.target.value })} />
              <button className="btn px-1.5" aria-label="Remove requirement" onClick={() => setReqs(reqs.filter((_, n) => n !== i))}>
                ✕
              </button>
            </div>
            <SelectField
              label="Type"
              value={r.kind}
              onChange={(v) => updateReq(i, { kind: v })}
              options={[
                { value: 'se', label: 'Single-ended' },
                { value: 'diff', label: 'Differential' },
              ]}
              width={110}
            />
            <NumField label="Impedance" value={r.z} onChange={(v) => updateReq(i, { z: v })} unit="Ω" />
            {r.kind === 'diff' && (
              <>
                <SelectField
                  label="Spacing rule"
                  value={r.spacing}
                  onChange={(v) => updateReq(i, { spacing: v })}
                  options={[
                    { value: 'ratio', label: 'S = k · W' },
                    { value: 'fixed', label: 'Fixed S' },
                  ]}
                  width={110}
                />
                {r.spacing === 'ratio' ? (
                  <NumField label="k (S / W)" value={r.ratio} onChange={(v) => updateReq(i, { ratio: v })} unit="" />
                ) : (
                  <LenField label="Spacing S" value={r.s} onChange={(v) => updateReq(i, { s: v })} />
                )}
              </>
            )}
            <SelectField
              label="On layers"
              value={r.where}
              onChange={(v) => updateReq(i, { where: v })}
              options={[
                { value: 'all', label: 'All signal layers' },
                { value: 'outer', label: 'Outer only' },
                { value: 'inner', label: 'Inner only' },
              ]}
              width={130}
            />
          </div>
        ))}
        <div className="flex flex-wrap gap-1 pt-1">
          {Object.entries(PRESET_REQS).map(([k, v]) => (
            <button key={k} className="btn px-1.5" onClick={() => setReqs([...reqs, { id: `r${Date.now().toString(36)}${k}`, ...v }])}>
              + {v.label.replace(' single-ended', ' SE')}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Ranking">
        <SelectField
          label="Prefer"
          value={p.prio as 'cost' | 'margin'}
          onChange={(v) => set({ prio: v })}
          options={[
            { value: 'cost', label: 'Fewest layers' },
            { value: 'margin', label: 'Widest traces' },
          ]}
        />
        <SelectField
          label="Solver accuracy"
          value={p.acc as Accuracy}
          onChange={(v) => set({ acc: v })}
          options={[
            { value: 'fast', label: 'Fast (screening)' },
            { value: 'normal', label: 'Normal' },
          ]}
        />
      </Section>
    </>
  );

  const shown = ranked ?? [];
  const okCount = shown.filter((r) => r.ok).length;

  return (
    <ToolPage
      title="Stackup Advisor"
      description="Set the board thickness, layer count, fabrication limits and impedance requirements. The field solver designs every line on every candidate stackup and ranks the stackups that meet all requirements."
      onReset={reset}
      properties={properties}
      status={
        running
          ? `Solving ${progress.done}/${progress.total} line designs on ${poolSize()} threads…`
          : ranked
            ? `${okCount} of ${shown.length} stackups meet every requirement`
            : `${preview.plans.length} candidate stackups, ${preview.jobs.size} unique line designs`
      }
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      <Panel
        title="Candidates"
        right={
          running ? (
            <button className="btn" onClick={stop}>
              Stop
            </button>
          ) : (
            <button className="btn btn-primary" disabled={errors.length > 0 || !preview.plans.length} onClick={run}>
              Find Best Stackups
            </button>
          )
        }
      >
        <div className="px-2.5 py-2 text-muted">
          {preview.plans.length} stackups match the board limits ({preview.jobs.size} unique line designs to solve)
          {rejectedCount > 0 && ranked ? `; ${rejectedCount} excluded by the layer requirements` : ''}.
          {running && (
            <div className="mt-1.5 h-[6px] bg-field">
              <div className="h-full bg-accent transition-[width]" style={{ width: `${progress.total ? (100 * progress.done) / progress.total : 0}%` }} />
            </div>
          )}
        </div>
        {ranked && (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="w-[34px]">#</th>
                  <th>Stackup</th>
                  <th className="v">Layers</th>
                  <th className="v">Thickness</th>
                  {reqs.map((r) => (
                    <th key={r.id} className="v" title={`W${r.kind === 'diff' ? ' / S' : ''} in ${unit}: outer | inner`}>
                      {r.label}
                      <div className="font-normal text-faint">outer | inner ({unit})</div>
                    </th>
                  ))}
                  <th className="v">Margin</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => {
                  const id = r.plan.stackup.id;
                  const open = openId === id;
                  return (
                    <Fragment key={id}>
                      <tr className={`cursor-pointer ${open ? 'sel' : ''}`} onClick={() => setOpenId(open ? null : id)}>
                        <td className="tnum text-muted">{i + 1}</td>
                        <td>
                          <span className="mr-1 text-[9px] text-muted">{open ? '▼' : '▶'}</span>
                          {r.plan.stackup.name.replace(/ · .*$/, '')}
                        </td>
                        <td className="v">{copperCount(r.plan.stackup)}</td>
                        <td className="v">{fmt(nominalThickness(r.plan.stackup), 3)} mm</td>
                        {reqs.map((q) => (
                          <td key={q.id} className="v">
                            {cellText(r, q.id, true)} <span className="text-faint">|</span> {cellText(r, q.id, false)}
                          </td>
                        ))}
                        <td className="v">{r.ok ? `${fmt(r.margin, 3)}×` : '—'}</td>
                        <td className={r.ok ? 'text-ok' : 'text-[var(--err-line)]'}>{r.ok ? 'Meets all' : `${r.reasons.length} issue${r.reasons.length > 1 ? 's' : ''}`}</td>
                      </tr>
                      {open && (
                        <tr key={`${id}-d`}>
                          <td />
                          <td colSpan={reqs.length + 5} className="pb-2">
                            {r.reasons.length > 0 && <Notes items={r.reasons.slice(0, 6)} />}
                            <div className="mt-1 flex flex-wrap gap-1">
                              {r.plan.layers.map((l) => (
                                <button key={l.layerId} className="btn" onClick={() => openLayer(r, l.layerId)} title={l.sg.note}>
                                  {l.name} → Impedance
                                </button>
                              ))}
                              <button className="btn" onClick={() => navigate(`/stackup?id=${encodeURIComponent(id)}`)}>
                                Open in Layer Stack Manager
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </ToolPage>
  );
}

function Method() {
  return (
    <>
      <h2>How the advisor works</h2>
      <ol>
        <li>Every stackup in the library (and your saved stackups) is filtered by layer count, nominal thickness and the number of referenced signal layers.</li>
        <li>
          For each remaining stackup, each signal layer is converted into its cross-section: surface microstrip with solder mask on the outer layers, stripline (with the real prepreg
          and core εr on each side) on the inner layers.
        </li>
        <li>
          The 2D field solver then finds the trace width that meets every impedance requirement on every layer where it applies. Differential pairs use your spacing rule, never
          narrower than the fab minimum. Identical cross-sections are solved once and shared, and the work runs on several CPU threads.
        </li>
        <li>
          A stackup passes when every width is between the fab minimum and your routing maximum. Passing stackups are ranked by layer count (cost) or by the smallest width relative to
          the fab minimum (manufacturing margin).
        </li>
      </ol>
      <p>
        Fast mode is meant for screening. Open the chosen layer in the impedance calculator to confirm the final geometry at normal or high accuracy. The fab adjusts widths to its
        actual process when you order controlled impedance.
      </p>
    </>
  );
}
