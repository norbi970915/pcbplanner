import { CrosstalkDiagram } from '../components/CrosstalkDiagram';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ToolPage } from '../components/ToolPage';
import { ComparisonButton, ComparisonPanel } from '../components/DesignComparison';
import { KicadProjectSource, type KicadPickValues } from '../components/KicadProjectSource';
import { PlyEditor } from '../components/PlyEditor';
import { useDesignComparison } from '../state/useDesignComparison';
import { comparisonRow as row } from '../lib/designComparison';
import { Big, Check, LenField, Notes, NumField, Panel, Result, Section, SelectField } from '../components/ui';
import { CROSSTALK_DEFAULTS, crosstalkGeometry, xtalk } from '../lib/crosstalk';
import { crosstalkPatch } from '../lib/kicadCrosstalk';
import { indexTracks, neighbours, parallelLayers, parallelRun, PARALLEL, type Neighbour, type ParallelRun, type TrackIndex } from '../lib/kicadParallel';
import { layerGeometry, type KicadProjectData, type LayerGeometry } from '../lib/kicadProjectQueries';
import type { RawTrack } from '../lib/kicadRouting';
import { projectTracks } from '../lib/kicadTracksClient';
import { formatPlies, parsePlies } from '../lib/plies';
import { runPooled, useFieldSolve } from '../lib/solverClient';
import { fmt, fromMm } from '../lib/units';
import { useKicadProject } from '../state/kicadProjectStore';
import { useSettings } from '../state/settings';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = CROSSTALK_DEFAULTS;
const RATIOS = [1, 1.5, 2, 3, 4, 5];
const TYPE_LABEL: Record<string, string> = { microstrip: 'Surface microstrip', embedded: 'Embedded microstrip', stripline: 'Stripline' };

const leaf = (n: string) => n.slice(n.lastIndexOf('/') + 1) || n;
const indexCache = new WeakMap<RawTrack[], TrackIndex>();
const indexOf = (tracks: RawTrack[]) => {
  let ix = indexCache.get(tracks);
  if (!ix) indexCache.set(tracks, (ix = indexTracks(tracks)));
  return ix;
};
const partnerOf = (d: KicadProjectData) => (net: string) => {
  const p = d.board.routing?.pairs.find((x) => x.p === net || x.n === net);
  return p ? (p.p === net ? p.n : p.p) : undefined;
};

/** What the From KiCad Project section found on the last Apply. */
type KicadRuns =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'error'; message: string }
  | {
      status: 'done';
      data: KicadProjectData;
      ix: TrackIndex;
      layer: LayerGeometry;
      aggressor: string;
      victim?: string;
      run: ParallelRun | null; // aggressor and victim on the layer (null: one of them is not routed there)
      elsewhere: ParallelRun[]; // layers where they do run in parallel, when they do not on this one
      near: Neighbour[];
      applied: boolean;
    };

export default function Crosstalk() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const { unit } = useSettings();
  const kp = useKicadProject();
  const built = useMemo(() => crosstalkGeometry(p, p.s), [p]);
  const errors = [...built.errors, ...(p.len > 0 ? [] : ['Coupled length must be greater than 0.']), ...(p.tr > 0 ? [] : ['Rise time must be greater than 0.'])];
  const ok = !!built.geom && !errors.length;
  const geom = ok ? built.geom : null;
  const st = useFieldSolve(geom, { accuracy: 'normal', even: true });
  const x = st.result?.even && st.result.odd ? xtalk(st.result, p.len, p.tr, p.v) : null;
  const plyBelow = parsePlies(p.dl) ?? [];
  const plyAbove = parsePlies(p.dl2) ?? [];
  const homogeneous = p.type === 'stripline' && !plyBelow.length && !plyAbove.length && p.er === p.er2;

  // spacing sweep on the worker pool
  const [sweep, setSweep] = useState<{ ratio: number; kb: number; fext: number }[] | null>(null);
  const sweepKey = JSON.stringify({ ...p, s: 0 });
  useEffect(() => {
    if (!ok) return;
    let alive = true;
    setSweep(null);
    Promise.all(
      RATIOS.map((k) => {
        const g = crosstalkGeometry(p, k * p.w).geom;
        return g
          ? runPooled({ type: 'solve', geom: g, opts: { accuracy: 'fast', even: true } }).then((r) => (r.ok && r.result?.even && r.result.odd ? { ratio: k, ...xtalk(r.result, p.len, p.tr, 1) } : null))
          : Promise.resolve(null);
      }),
    ).then((rows) => alive && setSweep(rows.filter(Boolean) as { ratio: number; kb: number; fext: number }[]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sweepKey, ok]);

  const L = (mm: number) => `${fmt(fromMm(mm, unit), 4)} ${unit}`;
  const pct = (v: number) => `${fmt(100 * v, 3)} %`;

  // From KiCad project: the layer's cross-section, and W, S and Len from where the two nets run in parallel
  const [kx, setKx] = useState<KicadRuns>({ status: 'idle' });
  const seq = useRef(0);
  const applyRun = (layer: LayerGeometry, run: ParallelRun) => {
    const patch = crosstalkPatch(layer, run);
    if (patch) set(patch);
    return !!patch;
  };
  const applyKicad = async (v: KicadPickValues) => {
    const d = kp.data;
    if (!d || !v.layer || !v.net) return;
    const id = ++seq.current;
    setKx({ status: 'busy' });
    try {
      const ix = indexOf(await projectTracks(d));
      if (id !== seq.current) return;
      const layer = v.layer.layer;
      const a = v.net.name;
      const b = v.net2?.name;
      const run = b ? parallelRun(ix, layer, a, b) : null;
      const applied = !!run && applyRun(v.layer, run);
      setKx({ status: 'done', data: d, ix, layer: v.layer, aggressor: a, victim: b, run, elsewhere: b && !applied ? parallelLayers(ix, a, b) : [], near: neighbours(ix, layer, a, PARALLEL.neighbours, partnerOf(d)), applied });
    } catch (e) {
      if (id === seq.current) setKx({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };
  const takeVictim = (r: ParallelRun) => {
    if (kx.status !== 'done') return;
    seq.current++;
    const layer = r.layer === kx.layer.layer ? kx.layer : layerGeometry(kx.data, r.layer, { mask: kx.layer.mask });
    if (!layer) {
      setKx({ status: 'error', message: `${r.layer} has no reference plane in the KiCad project, so it has no cross-section to take.` });
      return;
    }
    const applied = applyRun(layer, r);
    setKx({ ...kx, layer, victim: r.b, run: r, elsewhere: [], near: layer === kx.layer ? kx.near : neighbours(kx.ix, r.layer, kx.aggressor, PARALLEL.neighbours, partnerOf(kx.data)), applied });
  };

  const kicadNote =
    kx.status === 'busy'
      ? 'Reading the tracks of the board…'
      : kx.status === 'error'
        ? kx.message
        : kx.status === 'done'
          ? kx.applied && kx.run
            ? `${kx.layer.layer}: ${kx.layer.kind}${kx.layer.refs.length ? ` over ${kx.layer.refs.join(' / ')}` : ''}. W, S and the coupled length set from ${leaf(kx.run.a)} and ${leaf(kx.run.b)} (see Parallel Runs). Rise time and swing are yours to set.`
            : kx.victim
              ? `${leaf(kx.aggressor)} and ${leaf(kx.victim)} do not run in parallel on ${kx.layer.layer}; nothing was changed. See Parallel Runs.`
              : `Choose a victim net, or take one of the nets listed under Parallel Runs.`
          : 'Apply sets the cross-section, W, S and the coupled length where the two nets run in parallel on the layer. Without a victim net, Apply lists the nets that run beside the aggressor.';

  const comparison = useDesignComparison('/crosstalk', {
    state: p,
    inputs: [
      row('type', 'Line type', TYPE_LABEL[p.type] ?? p.type), ...(p.type === 'microstrip' ? [row('mask', 'Solder mask', p.mask)] : []),
      ...(p.type === 'microstrip' && p.mask ? [row('c1', 'Mask over laminate', p.c1, 'mm'), row('c2', 'Mask over trace', p.c2, 'mm'), row('erm', 'Mask Dk', p.erm)] : []),
      row('w', 'Trace width', p.w, 'mm'), row('etch', 'Etch (W − top)', p.etch, 'mm'), row('t', 'Copper thickness', p.t, 'mm'), row('s', 'Edge-to-edge gap', p.s, 'mm'),
      ...(plyBelow.length ? [row('dl', 'Lower dielectric plies', p.dl)] : [row('h', 'Height to lower plane', p.h, 'mm'), row('er', 'Lower dielectric Dk', p.er)]),
      ...(p.type !== 'microstrip' ? (plyAbove.length ? [row('dl2', 'Upper dielectric plies', p.dl2)] : [row('h2', p.type === 'stripline' ? 'Height to upper plane' : 'Cover thickness', p.h2, 'mm'), row('er2', 'Upper dielectric Dk', p.er2)]) : []),
      row('len', 'Coupled length', p.len, 'mm'), row('tr', 'Rise time', p.tr, 'ps'), row('v', 'Aggressor swing', p.v, 'V'),
    ],
    results: [
      row('next', 'Near-end crosstalk (NEXT)', x ? x.next * 1000 : null, 'mV'),
      row('fext', 'Far-end crosstalk (magnitude)', x ? Math.abs(x.fext) * 1000 : null, 'mV'),
      row('kb', 'Saturated NEXT coefficient', x ? x.kb * 100 : null, '%'),
      row('td', 'Coupled-section delay', x ? x.td * 1e12 : null, 'ps'),
      row('zeven', 'Even-mode impedance', st.result?.even?.z ?? null, 'Ω'),
      row('zodd', 'Odd-mode impedance', st.result?.odd?.z ?? null, 'Ω'),
    ],
  }, ok && !!x && !st.busy && !st.error, set);

  const properties = (
    <>
      <Section title="Line Pair">
        <SelectField
          label="Line type"
          value={p.type as 'microstrip' | 'embedded' | 'stripline'}
          onChange={(v) => set({ type: v })}
          options={[
            { value: 'microstrip', label: TYPE_LABEL.microstrip },
            { value: 'embedded', label: TYPE_LABEL.embedded },
            { value: 'stripline', label: TYPE_LABEL.stripline },
          ]}
        />
        {p.type === 'microstrip' && <Check label="Solder mask coating" checked={p.mask} onChange={(v) => set({ mask: v })} />}
        {p.type === 'microstrip' && p.mask && (
          <>
            <LenField label="Mask over laminate" symbol="C1" value={p.c1} onChange={(v) => set({ c1: v })} allowZero />
            <LenField label="Mask over trace" symbol="C2" value={p.c2} onChange={(v) => set({ c2: v })} allowZero />
            <NumField label="Mask εr" value={p.erm} onChange={(v) => set({ erm: v })} min={1} allowZero />
          </>
        )}
        <LenField label="Trace width" hint="Copper trace width. The cross-section is schematic; use the numerical dimensions for fabrication." symbol="W" value={p.w} onChange={(v) => set({ w: v })} />
        <LenField label="Etch (W − top)" diagramKey="etch" hint="Trapezoidal etch: the top of each trace is narrower by this amount. Zero for rectangular copper; 0.5 mil is typical for 1 oz." value={p.etch} onChange={(v) => set({ etch: v })} allowZero />
        <LenField label="Copper thickness" hint="Copper thickness after processing. Selecting oz converts copper weight to an approximate thickness." symbol="T" value={p.t} onChange={(v) => set({ t: v })} units={['mm', 'mil', 'um', 'oz']} />
        <LenField label="Edge-to-edge spacing" hint="Copper edge-to-edge clearance between the two traces. Centre pitch equals W + S." symbol="S" value={p.s} onChange={(v) => set({ s: v })} />
      </Section>
      <Section title={p.type === 'stripline' ? 'Dielectric Below' : 'Dielectric'}>
        <Check
          label="Stacked plies (different Dk)"
          checked={!!plyBelow.length}
          onChange={(v) => set({ dl: v ? formatPlies([{ t: p.h / 2, dk: p.er }, { t: p.h / 2, dk: p.er }]) : '' })}
          hint="Model each prepreg or core between the plane and the traces separately, with its own Dk."
        />
        {plyBelow.length ? (
          <PlyEditor value={p.dl} onChange={(v) => set({ dl: v })} firstLabel="plane" />
        ) : (
          <>
            <LenField label={p.type === 'stripline' ? 'Plane to trace' : 'Height to plane'} hint="Dielectric distance from the nearest copper trace face to the reference plane; copper thickness is separate." symbol="H" value={p.h} onChange={(v) => set({ h: v })} />
            <NumField label="Dielectric constant" diagramKey="er" hint="Relative permittivity (Dk). Use a laminate value appropriate for your signal frequency." symbol="εr" value={p.er} onChange={(v) => set({ er: v })} min={1} allowZero />
          </>
        )}
      </Section>
      {p.type !== 'microstrip' && (
        <Section title={p.type === 'stripline' ? 'Dielectric Above' : 'Cover Dielectric'}>
          <Check
            label="Stacked plies (different Dk)"
            checked={!!plyAbove.length}
            onChange={(v) => set({ dl2: v ? formatPlies([{ t: p.h2 / 2, dk: p.er2 }, { t: p.h2 / 2, dk: p.er2 }]) : '' })}
            hint="Model each prepreg or core between the traces and the layer above separately."
          />
          {plyAbove.length ? (
            <PlyEditor value={p.dl2} onChange={(v) => set({ dl2: v })} firstLabel="trace" />
          ) : (
            <>
              <LenField label={p.type === 'stripline' ? 'Trace to upper plane' : 'Cover thickness'} hint="Dielectric distance between the trace and the upper reference plane or the top of the cover." symbol="H2" value={p.h2} onChange={(v) => set({ h2: v })} />
              <NumField label="Upper εr" diagramKey="er2" hint="Relative permittivity of the upper dielectric." value={p.er2} onChange={(v) => set({ er2: v })} min={1} allowZero />
            </>
          )}
        </Section>
      )}
      <Section title="Signal">
        <LenField label="Coupled length" symbol="Len" value={p.len} onChange={(v) => set({ len: v })} units={['mm', 'cm', 'in', 'mil']} />
        <NumField label="Rise time (10–90 %)" symbol="tr" value={p.tr} onChange={(v) => set({ tr: v })} unit="ps" />
        <NumField label="Aggressor swing" symbol="V" value={p.v} onChange={(v) => set({ v })} unit="V" />
      </Section>
      <KicadProjectSource pick={['layer', 'net', 'net2']} require={['layer', 'net']} labels={{ net: 'Aggressor net', net2: 'Victim net' }} onApply={(v) => void applyKicad(v)} note={kicadNote} />
    </>
  );

  return (
    <ToolPage
      title="Crosstalk Calculator"
      description="Near-end (NEXT) and far-end (FEXT) crosstalk between two parallel PCB traces, from the even- and odd-mode solution of the field solver, with a sweep over the spacing."
      onReset={reset}
      reportBusy={st.busy}
      properties={properties}
      status={x ? `NEXT ${pct(x.next / p.v)} (${fmt(x.next * 1000, 4)} mV) · FEXT ${fmt(Math.abs(x.fext) * 1000, 4)} mV` : st.busy ? 'Solving…' : 'Check the inputs'}
      method={<Method />}
    >
      <Notes kind="error" items={ok ? (st.error ? [st.error] : []) : errors.length ? errors : ['Check the inputs.']} />
      {/* drawn with placeholders until the first solve finishes, so the page does not jump when results arrive */}
      {ok && (
        <div className="grid gap-3 xl:grid-cols-2">
          <Panel title="Results" right={<ComparisonButton comparison={comparison} />}>
            <div className="flex flex-wrap gap-8 px-2.5 py-2">
              <Big label="Near-end crosstalk (NEXT)" value={x ? fmt(x.next * 1000, 4) : '—'} unit="mV" busy={st.busy} />
              <Big label="Far-end crosstalk (FEXT)" value={x ? fmt(Math.abs(x.fext) * 1000, 4) : '—'} unit="mV" busy={st.busy} />
            </div>
            <table className="tbl">
              <tbody>
                <Result label="Backward coefficient Kb (saturated NEXT)" value={x ? pct(x.kb) : '—'} strong />
                <Result label="NEXT as % of aggressor" value={x ? pct(x.next / p.v) : '—'} sub={!x ? ' ' : x.saturated ? 'saturated: coupled length exceeds the rise-time length' : `grows with length until ${L(x.satLenMm)}`} />
                <Result label="FEXT as % of aggressor" value={x ? pct(Math.abs(x.fext) / p.v) : '—'} sub={!x ? ' ' : x.fextSaturated ? 'saturated: modal delay difference exceeds the rise time (max V/2)' : homogeneous ? 'homogeneous stripline: FEXT cancels' : 'grows linearly with the coupled length'} />
                <Result label="Zeven / Zodd" value={x && st.result ? `${fmt(st.result.even!.z, 4)} / ${fmt(st.result.odd!.z, 4)}` : '—'} unit="Ω" />
                <Result label="εeff even / odd" value={x && st.result ? `${fmt(st.result.even!.eeff, 4)} / ${fmt(st.result.odd!.eeff, 4)}` : '—'} />
                <Result label="Coupled-section delay" value={x ? fmt(x.td * 1e12, 4) : '—'} unit="ps" />
              </tbody>
            </table>
          </Panel>
          <Panel title="Spacing Sweep (same geometry)">
            <table className="tbl" aria-busy={ok && !sweep}>
              <thead>
                <tr>
                  <th>Edge gap</th>
                  <th className="v">S</th>
                  <th className="v">NEXT (Kb)</th>
                  <th className="v">FEXT at this length</th>
                </tr>
              </thead>
              <tbody>
                {sweep
                  ? sweep.map((r) => (
                      <tr key={r.ratio} className={Math.abs(r.ratio * p.w - p.s) < 1e-9 ? 'sel' : ''}>
                        <td>{r.ratio} W</td>
                        <td className="v">{L(r.ratio * p.w)}</td>
                        <td className="v">{pct(r.kb)}</td>
                        <td className="v">{pct(Math.abs(r.fext))}</td>
                      </tr>
                    ))
                  : RATIOS.map((k) => (
                      <tr key={k}>
                        <td>{k} W</td>
                        <td className="v">{L(k * p.w)}</td>
                        <td className="v text-faint" colSpan={2}>
                          solving…
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
            <p className="px-2.5 py-1.5 text-faint">Sweep rows use edge clearance S. The 2 W row corresponds to the 3W centre-pitch reference (P = W + S).</p>
          </Panel>
        </div>
      )}
      {kx.status === 'done' && <ParallelRunsPanel kx={kx} L={L} onUse={takeVictim} />}
      <ComparisonPanel comparison={comparison} />
      {ok && <Panel title="Trace Spacing and the 3W Reference"><CrosstalkDiagram width={p.w} spacing={p.s} length={L}/></Panel>}
    </ToolPage>
  );
}

/** What the last Apply found on the board: the chosen pair of nets, and the nets beside the aggressor. */
function ParallelRunsPanel({ kx, L, onUse }: { kx: Extract<KicadRuns, { status: 'done' }>; L: (mm: number) => string; onUse: (r: ParallelRun) => void }) {
  const { layer, aggressor: a, victim: b, run, elsewhere, near } = kx;
  const name = (n: string) => <span title={n}>{leaf(n)}</span>;
  const rule = (r: { maxGap: number }) => `directions within ${PARALLEL.parallelDeg}°, edge spacing up to ${L(r.maxGap)}`;
  const wOf = (r: ParallelRun) => (r.wA !== undefined && r.wB !== undefined && Math.abs(r.wA - r.wB) > 1e-9 ? `${L(r.wA)} / ${L(r.wB)}` : L((r.wA ?? r.wB)!));
  return (
    <Panel title={`Parallel Runs in ${kx.data.boardName}`}>
      {run && run.coupled > 0 ? (
        <table className="tbl">
          <tbody>
            <Result label="Nets (aggressor, victim)" value={<>{name(run.a)}, {name(run.b)}</>} sub={kx.applied ? 'inputs set from this run' : undefined} />
            <Result label="Layer" value={`${layer.layer} · ${layer.kind}`} />
            <Result label="Coupled length" value={L(run.coupled)} strong sub={`${L(run.coupledA)} along the aggressor, ${L(run.coupledB)} along the victim`} />
            <Result label="Edge spacing (dominant)" value={L(run.gap!)} strong sub={run.gapMin !== run.gapMax ? `${L(run.gapMin!)} to ${L(run.gapMax!)} over the coupled stretches` : undefined} />
            <Result label="Width (aggressor / victim)" value={wOf(run)} sub={run.wA !== undefined && run.wB !== undefined && Math.abs(run.wA - run.wB) > 1e-9 ? 'W is set to the mean' : undefined} />
            <Result label="Routed on this layer" value={`${L(run.lenA)} / ${L(run.lenB)}`} />
          </tbody>
        </table>
      ) : b ? (
        <div className="space-y-1.5 px-2.5 py-2">
          <p>
            {name(a)} and {name(b)} {run ? `do not run in parallel on ${layer.layer} (${rule(run)}).` : `are not both routed on ${layer.layer}.`}
          </p>
          {elsewhere.length ? (
            <ul className="space-y-1">
              {elsewhere.map((r) => (
                <li key={r.layer} className="flex flex-wrap items-center gap-2">
                  <span>
                    On {r.layer}: {L(r.coupled)} at {L(r.gap!)}
                  </span>
                  <button type="button" className="btn" onClick={() => onUse(r)}>
                    Use {r.layer}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-faint">They do not run in parallel on any other layer either.</p>
          )}
        </div>
      ) : null}
      <h3 className="px-2.5 pt-2 font-semibold">
        Nets beside {name(a)} on {layer.layer}
      </h3>
      {near.length ? (
        <table className="tbl">
          <thead>
            <tr>
              <th>Net</th>
              <th className="v">Coupled</th>
              <th className="v">Spacing</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {near.map((r) => (
              <tr key={r.b} className={r.b === run?.b && kx.applied ? 'sel' : ''}>
                <td>
                  {name(r.b)}
                  {r.partner && <span className="text-faint"> (pair partner)</span>}
                </td>
                <td className="v">{L(r.coupled)}</td>
                <td className="v">{L(r.gap!)}</td>
                <td className="v">
                  <button type="button" className="btn" onClick={() => onUse(r)} aria-label={`Use ${r.b} as the victim`}>
                    Use
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="px-2.5 py-1.5 text-faint">
          {kx.ix.get(layer.layer)?.has(a) ? `No net runs beside it on this layer (directions within ${PARALLEL.parallelDeg}°, edge spacing up to ${PARALLEL.gapWidths} times the wider trace and at least ${L(PARALLEL.gapMin)}).` : `${leaf(a)} is not routed on ${layer.layer}.`}
        </p>
      )}
      <p className="px-2.5 py-1.5 text-faint">
        {run && run.coupled > 0 ? `Counted as parallel: ${rule(run)}. ` : ''}Longest coupled length first, at most {PARALLEL.neighbours} nets. Use takes the net as the victim and sets W, S and the coupled length.
      </p>
    </Panel>
  );
}

export function Method() {
  return (
    <>
      <h2>Even and odd modes</h2>
      <p>Two coupled lines are described by their even-mode (both lines driven alike) and odd-mode (driven oppositely) impedances and effective dielectric constants, which the field solver computes directly.</p>
      <div className="eq">
        <span className="no">(1)</span>
        <i>K</i>
        <sub>b</sub> = (<i>Z</i>
        <sub>even</sub> − <i>Z</i>
        <sub>odd</sub>) / (2 (<i>Z</i>
        <sub>even</sub> + <i>Z</i>
        <sub>odd</sub>))
      </div>
      <p>
        Near-end noise grows with coupled length until the round-trip delay 2<i>T</i>
        <sub>D</sub> equals the rise time, then saturates at <i>K</i>
        <sub>b</sub> · <i>V</i>. Far-end noise comes from the difference in modal velocities. It is zero in homogeneous stripline and grows linearly with length in microstrip:
      </p>
      <div className="eq">
        <span className="no">(2)</span>
        <i>V</i>
        <sub>FEXT</sub> = <i>V</i> · (<i>T</i>
        <sub>D,even</sub> − <i>T</i>
        <sub>D,odd</sub>) / (2 <i>t</i>
        <sub>r</sub>)
      </div>
      <p>Both expressions assume weak coupling, matched terminations and a linear edge, which are standard first-order assumptions.</p>
      <p>The cross-section is the one the Impedance Calculator builds for an edge-coupled pair: surface microstrip with optional solder mask (C1 over the laminate, C2 over the traces), embedded microstrip under a dielectric cover, or stripline, each dielectric as one layer or as stacked plies, and an optional trapezoidal etch.</p>
      <h2>From a KiCad project</h2>
      <p>
        The From KiCad Project section takes a signal layer of the loaded board and two nets, the aggressor and the victim. The layer gives the cross-section that the KiCad impedance page solves (line type, heights, Dk of each ply, copper thickness, solder mask and the 0.5 mil
        etch). The tracks of the two nets on that layer are then measured where they run in parallel, with the routing check’s gap measurement:
      </p>
      <ul>
        <li>Segments are taken as they are; arcs are cut into chords of at most 2°, and each chord counts with its arc length.</li>
        <li>For every piece of one net, each piece of the other net whose direction is within {PARALLEL.parallelDeg}° is projected onto it. The centre distance is taken at the middle of the overlap, and half of each width is taken off to give the edge spacing. Where several pieces overlap the same stretch, the nearest counts. Overlapping copper is not a parallel run.</li>
        <li>
          A stretch is coupled when the edge spacing is at most {PARALLEL.gapWidths} times the wider of the two traces (their length-weighted dominant widths on the layer), and never less than {PARALLEL.gapMin} mm. Beyond that the coupling is small next to that of the
          nearest neighbours.
        </li>
        <li>The measurement runs along both nets; the coupled length is the mean of the two. The spacing applied is the length-weighted dominant value (binned to 1 µm); the range shown leaves out values with less than {PARALLEL.rangeShare * 100} % of the coupled length.</li>
      </ul>
      <p>
        Apply sets the cross-section, W (the mean of the two nets’ widths over the coupled stretches when they differ), S (the dominant spacing) and the coupled length. Rise time and aggressor swing are not in a board file and stay as set. Several separate parallel
        stretches are added together into one coupled length, which is right for far-end crosstalk and conservative for near-end crosstalk. Without a victim net, Apply lists the nets with the longest parallel runs beside the aggressor on that layer; a third trace between
        two nets is not taken into account. The board file is read in this browser only.
      </p>
      <h2>References</h2>
      <ol>
        <li>E. Bogatin, <i>Signal and Power Integrity – Simplified</i>, 3rd ed., ch. 10.</li>
        <li>H. Johnson, M. Graham, <i>High-Speed Digital Design</i>, 1993.</li>
        <li>KiCad source, pcbnew/drc/drc_test_provider_diff_pair_coupling.cpp (commonParallelProjection).</li>
      </ol>
    </>
  );
}
