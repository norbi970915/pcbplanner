import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sources } from '../components/Sources';
import { stackupGroup } from '../components/StackupPicker';
import { ToolPage } from '../components/ToolPage';
import { Big, LenField, Notes, NumField, Panel, Section, SelectField } from '../components/ui';
import { INTERFACES, interfaceById } from '../data/interfaces';
import { FOILS, LAMINATES, laminateById, maskById } from '../data/laminates';
import type { Accuracy } from '../lib/fieldsolver';
import { evaluateInterface, freqLabel, interfaceLossRequest, rateLabel, type CheckRow, type LineMetrics } from '../lib/interfaceRules';
import type { LossRequest } from '../lib/solver.worker';
import { runPooled, runSolver } from '../lib/solverClient';
import { geometryForLayer, type Layer, type StackupGeometry } from '../lib/stackups';
import { formatPlies } from '../lib/plies';
import { fmt, fromMm } from '../lib/units';
import { useSettings } from '../state/settings';
import { useStackups } from '../state/stackupStore';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = {
  ifid: 'pcie-gen3',
  stk: 'std-6l-16-1080-2',
  lay: '',
  len: 100,
  minW: 0.09,
  minS: 0.09,
  maxW: 0.4,
  etch: 0.0127,
  srule: 'ratio',
  k: 1,
  sfix: 0.2,
  mat: 's1141-2116',
  foil: 'ed',
  acc: 'normal',
};

type P = typeof DEFAULTS;

/** One stackup layer measured against the interface: what it takes to route it there. */
interface LayerFit {
  id: string;
  name: string;
  type: StackupGeometry['type'];
  w: number;
  s?: number;
  dbPerMm: number;
}

/** Loss of the designed line at the interface Nyquist frequency, on the stackup's own plies. */
function lossRequest(sg: StackupGeometry, w: number, s: number | undefined, diff: boolean, p: P, fGHz: number): LossRequest {
  const lam = laminateById(p.mat) ?? LAMINATES[0];
  const mask = maskById('psr4000bn');
  const foil = FOILS.find((x) => x.id === p.foil) ?? FOILS[0];
  return interfaceLossRequest(sg, w, s, diff, {
    etch: p.etch,
    df: lam.df,
    f0Hz: lam.fGHz * 1e9,
    maskDf: mask?.df,
    maskF0Hz: mask ? mask.fGHz * 1e9 : undefined,
    rqUm: foil.rq,
    accuracy: p.acc as Accuracy,
    fHz: fGHz * 1e9,
  });
}

export default function InterfaceRules() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const { unit } = useSettings();
  const stackups = useStackups();
  const spec = interfaceById(p.ifid) ?? INTERFACES[0];
  const stack = stackups.find((s) => s.id === p.stk) ?? stackups[0];
  const coppers = useMemo(() => (stack ? stack.layers.filter((l) => l.kind === 'copper') : []), [stack]);
  const layerId = p.lay && coppers.some((l) => l.id === p.lay) ? p.lay : (coppers.find((l) => l.role !== 'plane')?.id ?? coppers[0]?.id ?? '');
  const sg = useMemo(() => (stack && layerId ? geometryForLayer(stack, layerId) : null), [stack, layerId]);

  const [line, setLine] = useState<LineMetrics | null>(null);
  const [second, setSecond] = useState<{ w: number; s?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const key = JSON.stringify([sg, spec?.id, p.etch, p.srule, p.k, p.sfix, p.minS, p.mat, p.foil, p.acc]);

  useEffect(() => {
    if (!sg || !spec) return;
    const my = ++seq.current;
    setBusy(true);
    const t = setTimeout(() => {
      const diff = spec.z.kind === 'diff';
      const rule = diff
        ? {
            mode: p.srule as 'ratio' | 'fixed',
            s: p.sfix,
            ratio: p.k,
            minS: p.minS,
          }
        : undefined;
      void runSolver({
        type: 'design',
        req: {
          sg,
          kind: spec.z.kind,
          target: spec.z.target,
          etch: p.etch,
          rule,
          accuracy: p.acc as Accuracy,
        },
      })
        .then((d) => {
          if (my !== seq.current) return;
          if (!d.ok || !d.design) throw new Error(d.ok ? 'The solver returned no trace width.' : d.error);
          const { w, s, z } = d.design;
          return runSolver({
            type: 'loss',
            req: lossRequest(sg, w, s, diff, p, spec.nyquistGHz),
          }).then((l) => {
            if (my !== seq.current) return;
            if (!l.ok || !l.loss) throw new Error(l.ok ? 'The solver returned no loss.' : l.error);
            const pt = l.loss.points[0];
            setLine({ w, s, z, eeff: pt.eeff, dbPerMm: pt.alpha / 1000 });
            setError(null);
            // a second controlled impedance on the same interface (a clock pair, or the single-ended target beside a pair)
            const z2 = spec.z2;
            if (!z2) {
              setSecond(null);
              setBusy(false);
              return;
            }
            return runSolver({
              type: 'design',
              req: { sg, kind: z2.kind, target: z2.target, etch: p.etch, rule: z2.kind === 'diff' ? rule : undefined, accuracy: p.acc as Accuracy },
            }).then((d2) => {
              if (my !== seq.current) return;
              setSecond(d2.ok && d2.design ? { w: d2.design.w, s: d2.design.s } : null);
              setBusy(false);
            });
          });
        })
        .catch((e: unknown) => {
          if (my !== seq.current) return;
          setError(e instanceof Error ? e.message : String(e));
          setLine(null);
          setSecond(null);
          setBusy(false);
        });
    }, 180);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // every layer of the stackup, so the answer to “this does not fit” is on the same page
  const [scan, setScan] = useState<LayerFit[] | null>(null);
  const scanSeq = useRef(0);
  const scanKey = JSON.stringify([stack?.id, spec?.id, p.etch, p.srule, p.k, p.sfix, p.minS, p.mat, p.foil]);

  useEffect(() => {
    if (!stack || !spec) return;
    const my = ++scanSeq.current;
    setScan(null);
    const t = setTimeout(() => {
      const diff = spec.z.kind === 'diff';
      const rule = diff ? { mode: p.srule as 'ratio' | 'fixed', s: p.sfix, ratio: p.k, minS: p.minS } : undefined;
      const jobs = stack.layers
        .filter((l) => l.kind === 'copper' && l.role !== 'plane')
        .map((l) => ({ layer: l, g: geometryForLayer(stack, l.id) }))
        .filter((x): x is { layer: Layer; g: StackupGeometry } => !!x.g)
        .map(({ layer, g }) =>
          runPooled({ type: 'design', req: { sg: g, kind: spec.z.kind, target: spec.z.target, etch: p.etch, rule, accuracy: 'fast' } }).then((d) => {
            if (!d.ok || !d.design) return null;
            const { w, s } = d.design;
            return runPooled({ type: 'loss', req: lossRequest(g, w, s, diff, { ...p, acc: 'fast' }, spec.nyquistGHz) }).then((l): LayerFit | null =>
              l.ok && l.loss ? { id: layer.id, name: layer.name, type: g.type, w, s, dbPerMm: l.loss.points[0].alpha / 1000 } : null,
            );
          }),
        );
      void Promise.all(jobs).then((r) => {
        if (my === scanSeq.current) setScan(r.filter((x): x is LayerFit => !!x));
      });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanKey]);

  const L = (mm: number) => `${fmt(fromMm(mm, unit), 3)} ${unit}`;
  const rows: CheckRow[] = spec && line ? evaluateInterface(spec, line, { minW: p.minW, minS: p.minS, maxW: p.maxW }, p.len, L, second ?? undefined) : [];

  const errors: string[] = [];
  if (stack && !sg) errors.push('That layer has no reference plane marked in the stackup. Open the Layer Stack Manager and mark the neighbouring copper as a plane.');
  if (!(p.len > 0)) errors.push('Route length must be greater than 0.');
  if (error) errors.push(error);

  const handoff = sg && spec && line && !busy && !errors.length ? (() => {
    const laminate = laminateById(p.mat) ?? LAMINATES[0];
    const foil = FOILS.find((item) => item.id === p.foil) ?? FOILS[0];
    const mask = maskById('psr4000bn');
    const shared = new URLSearchParams({
      type: sg.type, mode: spec.z.kind === 'diff' ? 'diff' : 'se',
      w: String(line.w), s: String(line.s ?? p.sfix),
      h: String(sg.h), er: String(sg.er), t: String(sg.t), etch: String(p.etch), acc: p.acc,
      mat: 'custom',
    });
    if (sg.below && sg.below.length > 1) shared.set('dl', formatPlies(sg.below.map((ply) => ({ t: ply.t, dk: ply.er }))));
    if (sg.h2 !== undefined) {
      shared.set('h2', String(sg.h2));
      shared.set('er2', String(sg.er2 ?? sg.er));
      shared.set('mat2', 'custom');
    }
    if (sg.above && sg.above.length > 1) shared.set('dl2', formatPlies(sg.above.map((ply) => ({ t: ply.t, dk: ply.er }))));
    if (sg.type === 'microstrip') {
      shared.set('mask', sg.mask ? '1' : '0');
      if (sg.mask) {
        shared.set('c1', String(sg.mask.c1));
        shared.set('c2', String(sg.mask.c2));
        shared.set('erm', String(sg.mask.er));
      }
    }
    const impedance = new URLSearchParams(shared);
    impedance.set('target', String(spec.z.target));
    impedance.set('fq', String(spec.nyquistGHz));
    const loss = new URLSearchParams(shared);
    loss.set('len', String(p.len));
    loss.set('f', String(spec.nyquistGHz));
    loss.set('fmax', String(Math.min(200, Math.max(20, spec.nyquistGHz * 2))));
    loss.set('df', String(laminate.df));
    loss.set('f0', String(laminate.fGHz));
    loss.set('df2', String(laminate.df));
    loss.set('f02', String(laminate.fGHz));
    loss.set('foil', foil.id);
    loss.set('rq', String(foil.rq));
    if (sg.below && sg.below.length > 1) loss.set('dl', formatPlies(sg.below.map((ply) => ({ t: ply.t, dk: ply.er, df: laminate.df }))));
    if (sg.above && sg.above.length > 1) loss.set('dl2', formatPlies(sg.above.map((ply) => ({ t: ply.t, dk: ply.er, df: laminate.df }))));
    if (sg.mask && mask) {
      loss.set('mmat', 'custom');
      loss.set('dfm', String(mask.df));
      loss.set('fm', String(mask.fGHz));
    }
    return { impedance: `/impedance?${impedance}`, loss: `/trace-loss?${loss}` };
  })() : null;

  const properties = (
    <>
      <Section title="Interface">
        <SelectField
          label="Interface"
          value={p.ifid}
          onChange={(v) => set({ ifid: v })}
          options={INTERFACES.map((i) => ({
            value: i.id,
            label: i.name,
            group: i.family,
          }))}
          width={176}
        />
        <LenField
          label="Route length"
          value={p.len}
          onChange={(v) => set({ len: v })}
          units={['mm', 'in', 'mil']}
          hint="Length of the longest trace of this interface on your board."
        />
      </Section>
      <Section title="Board">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <label className="text-muted" htmlFor="ir-stk">
            Stackup
          </label>
          <select id="ir-stk" className="fld w-[176px]" value={stack?.id ?? ''} onChange={(e) => set({ stk: e.target.value, lay: '' })}>
            {[...new Set(stackups.map(stackupGroup))].map((g) => (
              <optgroup key={g} label={g}>
                {stackups
                  .filter((s) => stackupGroup(s) === g)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label ?? s.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <label className="text-muted" htmlFor="ir-lay">
            Layer
          </label>
          <select id="ir-lay" className="fld w-[176px]" value={layerId} onChange={(e) => set({ lay: e.target.value })}>
            {coppers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
                {l.role === 'plane' ? ' (plane)' : ''}
              </option>
            ))}
          </select>
        </div>
        {sg && <p className="text-faint">{sg.note}</p>}
      </Section>
      <Section title="Fabrication Limits">
        <LenField label="Minimum trace width" value={p.minW} onChange={(v) => set({ minW: v })} />
        <LenField label="Minimum spacing" value={p.minS} onChange={(v) => set({ minS: v })} />
        <LenField label="Maximum trace width" value={p.maxW} onChange={(v) => set({ maxW: v })} />
        <LenField label="Etch (W − top)" value={p.etch} onChange={(v) => set({ etch: v })} allowZero />
      </Section>
      {spec?.z.kind === 'diff' && (
        <Section title="Pair Spacing">
          <SelectField
            label="Spacing rule"
            value={p.srule}
            onChange={(v) => set({ srule: v })}
            options={[
              { value: 'ratio', label: 'S = k · W' },
              { value: 'fixed', label: 'Fixed S' },
            ]}
          />
          {p.srule === 'ratio' ? (
            <NumField label="k (S / W)" value={p.k} onChange={(v) => set({ k: v })} unit="" />
          ) : (
            <LenField label="Spacing S" value={p.sfix} onChange={(v) => set({ sfix: v })} />
          )}
          <p className="text-faint">Tight coupling (k = 1) keeps the pair narrow; loosening it to k = 2 widens the trace at the same impedance, which often rescues a 100 Ω pair on a thin dielectric.</p>
        </Section>
      )}
      <Section title="Material & Loss">
        <SelectField
          label="Laminate (Df)"
          value={p.mat}
          onChange={(v) => set({ mat: v })}
          options={LAMINATES.map((l) => ({
            value: l.id,
            label: `${l.vendor} ${l.name}`,
            group: l.cls,
          }))}
          width={176}
        />
        <SelectField label="Copper foil" value={p.foil} onChange={(v) => set({ foil: v })} options={FOILS.map((f) => ({ value: f.id, label: f.name }))} width={176} />
        <SelectField
          label="Solver accuracy"
          value={p.acc}
          onChange={(v) => set({ acc: v })}
          options={[
            { value: 'fast', label: 'Fast' },
            { value: 'normal', label: 'Normal' },
            { value: 'high', label: 'High' },
          ]}
        />
        <p className="text-faint">Dk comes from the stackup; the laminate sets Df and how Dk and Df move with frequency.</p>
      </Section>
    </>
  );

  const statusClass = (s: CheckRow['status']) => (s === 'ok' ? 'text-ok' : s === 'fail' ? 'text-[var(--err-line)]' : s === 'warn' ? 'text-[var(--accent)]' : 'text-muted');
  const statusText = (s: CheckRow['status']) => (s === 'ok' ? 'OK' : s === 'fail' ? 'Fails' : s === 'warn' ? 'Tight' : '');
  const layerName = coppers.find((l) => l.id === layerId)?.name ?? 'this layer';

  return (
    <ToolPage
      title="Interface Design Rules"
      description="Impedance, skew, loss budget and length limits of PCIe, USB, HDMI, Ethernet, DDR and other interfaces, applied to a layer of your own stackup: the trace width and spacing you need, the loss over your route, and every skew limit as a trace length."
      onReset={reset}
      properties={properties}
      status={spec ? `${spec.name} · ${rateLabel(spec.rateGbps)} per lane · Nyquist ${freqLabel(spec.nyquistGHz)}${busy ? ' · solving…' : ''}` : 'No interface data'}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      {spec && (
        <>
          <Panel title={`${spec.name} on ${layerName}`}>
            <div className="flex flex-wrap gap-6 px-3 py-2.5">
              <Big label="Trace width" value={line ? fmt(fromMm(line.w, unit), 3) : '—'} unit={unit} busy={busy} />
              {spec.z.kind === 'diff' && <Big label="Pair spacing" value={line?.s !== undefined ? fmt(fromMm(line.s, unit), 3) : '—'} unit={unit} busy={busy} />}
              <Big label={`Loss at ${freqLabel(spec.nyquistGHz)}`} value={line ? fmt(line.dbPerMm * 25.4, 3) : '—'} unit="dB/in" busy={busy} />
              <Big label="Over your route" value={line ? fmt(line.dbPerMm * p.len, 2) : '—'} unit="dB" busy={busy} />
            </div>
            {rows.length > 0 && (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Rule</th>
                    <th>Requirement</th>
                    <th className="v">On this board</th>
                    <th className="w-[70px]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.label}>
                      <td>
                        {r.label}
                        {r.note && <div className="text-faint">{r.note}</div>}
                      </td>
                      <td className="text-muted">{r.required}</td>
                      <td className="v">{r.value}</td>
                      <td className={statusClass(r.status)}>{statusText(r.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
          {handoff && <Panel title="Continue the Design" className="mt-3">
            <div className="flex flex-wrap gap-2 px-3 py-3">
              <Link className="btn no-underline" to={handoff.impedance}>Check this trace in Impedance</Link>
              <Link className="btn no-underline" to={handoff.loss}>See this route in Trace Loss</Link>
            </div>
            <p className="px-3 pb-3 text-faint">Carries the solved width and spacing, stackup geometry, route length and Nyquist frequency. Check the laminate loss data and foil against your fab materials.</p>
          </Panel>}
          <Panel title="Which layer to route it on" className="mt-3">
            {scan ? (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Layer</th>
                    <th>Cross-section</th>
                    <th className="v">{spec.z.kind === 'diff' ? 'Width / spacing' : 'Width'}</th>
                    <th className="v">Loss at {freqLabel(spec.nyquistGHz)}</th>
                    {spec.lossBudgetDb !== undefined && <th className="v">Longest route</th>}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {scan.map((f) => {
                    const ok = f.w >= p.minW && f.w <= p.maxW && (f.s === undefined || f.s >= p.minS);
                    return (
                      <tr key={f.id} className={f.id === layerId ? 'sel' : ''}>
                        <td>{f.name}</td>
                        <td className="text-muted">{f.type === 'microstrip' ? 'Microstrip' : f.type === 'stripline' ? 'Stripline' : 'Embedded microstrip'}</td>
                        <td className={`v ${ok ? '' : 'text-[var(--err-line)]'}`}>{f.s !== undefined ? `${L(f.w)} / ${L(f.s)}` : L(f.w)}</td>
                        <td className="v">{fmt(f.dbPerMm * 25.4, 3)} dB/in</td>
                        {spec.lossBudgetDb !== undefined && <td className="v">{L(spec.lossBudgetDb / f.dbPerMm)}</td>}
                        <td className="text-right">
                          {f.id === layerId ? (
                            <span className="text-muted">shown above</span>
                          ) : (
                            <button className="btn" onClick={() => set({ lay: f.id })}>
                              Use
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="px-2.5 py-2 text-muted">Solving every layer of the stackup…</p>
            )}
            <p className="px-2.5 py-1.5 text-faint">
              Each layer is designed to the same impedance target and spacing rule at fast accuracy, so a width in red cannot be built within your fabrication limits. A layer marked as a plane, or one with no reference plane beside it, is left out.
            </p>
          </Panel>

          <Panel title={`${spec.name} rules`} className="mt-3">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="w-[190px]">Parameter</th>
                  <th>Requirement</th>
                  <th className="w-[80px]">From</th>
                </tr>
              </thead>
              <tbody>
                {spec.rules.map((r) => (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td>
                      {r.req}
                      {r.detail && <div className="text-faint">{r.detail}</div>}
                    </td>
                    <td className={r.normative ? '' : 'text-muted'} title={spec.sources[r.src]?.title}>
                      {r.normative ? 'Spec' : 'Guide'} [{r.src + 1}]
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-2.5 py-1.5 text-faint">
              “Spec” marks a requirement of the interface specification itself, “Guide” a chip- or connector-vendor recommendation. The bracketed number points at the source list
              under Method below.
            </p>
          </Panel>
        </>
      )}
    </ToolPage>
  );
}

export function Method() {
  const spec = INTERFACES[0];

  return (
    <>
      <h2>What this page does</h2>
      <p>
        Every interface carries the rules its specification, or the chip vendor’s layout guide, lays down: the impedance a pair is built to, how closely its two traces must match,
        how much insertion loss the board may spend and where the coupling capacitors and ground vias belong. Those rules are written for a channel, not for your board, so this
        page applies them to one layer of your stackup.
      </p>
      <ol>
        <li>The cross-section of the chosen layer comes from the stackup, with every prepreg and core ply keeping its own Dk.</li>
        <li>
          The 2D field solver finds the trace width, and the pair spacing, that meets the impedance target of the interface, following your spacing rule and the fab minimums.
        </li>
        <li>
          That geometry then goes through the loss model at the Nyquist frequency of the interface: conductor loss from the incremental-inductance rule, copper roughness from the
          foil you chose and dielectric loss from the Df of the laminate. This gives the loss per inch, the loss over your route and the longest route the budget allows.
        </li>
        <li>
          Each skew limit is turned into a trace-length tolerance from the delay of that same line, which is why the tolerance on a stripline is tighter in millimetres than on a
          microstrip.
        </li>
      </ol>
      <p>
        The loss figure covers the traces only. Connectors, vias, the package and the die take their share of the same channel budget, so leave margin: spending no more than about
        two thirds of the budget on board traces is a common working rule.
      </p>
      <p>
        Use the <Link to="/impedance">impedance calculator</Link> to finish the geometry, <Link to="/trace-loss">trace loss</Link> to see the loss across frequency, and the{' '}
        <Link to="/stackup-advisor">stackup advisor</Link> when no layer of your stackup can carry the width an interface needs.
      </p>
      {spec && <Sources items={spec.sources} />}
    </>
  );
}
