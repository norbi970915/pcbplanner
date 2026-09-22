import { useEffect, useMemo, useState } from 'react';
import { ToolPage } from '../components/ToolPage';
import { Big, Check, LenField, Notes, NumField, Panel, Result, Section, SelectField } from '../components/ui';
import { xtalk } from '../lib/crosstalk';
import type { Geometry } from '../lib/fieldsolver';
import { runPooled, useFieldSolve } from '../lib/solverClient';
import { fmt, fromMm } from '../lib/units';
import { useSettings } from '../state/settings';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { type: 'microstrip', mask: true, w: 0.15, t: 0.035, s: 0.15, h: 0.1, er: 4.1, h2: 0.2, er2: 4.2, len: 50, tr: 100, v: 3.3 };
const RATIOS = [1, 1.5, 2, 3, 4, 5];

function geomFor(p: typeof DEFAULTS, s: number): Geometry {
  const g: Geometry = { w: p.w, t: p.t, yTrace: p.h, diff: true, s, slabs: [{ y0: 0, y1: p.h, er: p.er }] };
  if (p.type === 'microstrip') {
    if (p.mask) g.mask = { surfaceY: p.h, overSubstrate: 0.0305, overTrace: 0.0152, er: 3.8 };
  } else {
    g.slabs.push({ y0: p.h, y1: p.h + p.t + p.h2, er: p.er2 });
    g.topPlane = p.h + p.t + p.h2;
  }
  return g;
}

export default function Crosstalk() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const { unit } = useSettings();
  const ok = p.w > 0 && p.t > 0 && p.s > 0 && p.h > 0 && p.er >= 1 && p.len > 0 && p.tr > 0 && (p.type === 'microstrip' || (p.h2 > 0 && p.er2 >= 1));
  const geom = useMemo(() => (ok ? geomFor(p, p.s) : null), [p, ok]);
  const st = useFieldSolve(geom, { accuracy: 'normal', even: true });
  const x = st.result?.even && st.result.odd ? xtalk(st.result, p.len, p.tr, p.v) : null;

  // spacing sweep on the worker pool
  const [sweep, setSweep] = useState<{ ratio: number; kb: number; fext: number }[] | null>(null);
  const sweepKey = JSON.stringify([p.type, p.mask, p.w, p.t, p.h, p.er, p.h2, p.er2, p.len, p.tr, p.v]);
  useEffect(() => {
    if (!ok) return;
    let alive = true;
    setSweep(null);
    Promise.all(
      RATIOS.map((k) =>
        runPooled({ type: 'solve', geom: geomFor(p, k * p.w), opts: { accuracy: 'fast', even: true } }).then((r) =>
          r.ok && r.result?.even && r.result.odd ? { ratio: k, ...xtalk(r.result, p.len, p.tr, 1) } : null,
        ),
      ),
    ).then((rows) => alive && setSweep(rows.filter(Boolean) as { ratio: number; kb: number; fext: number }[]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sweepKey, ok]);

  const L = (mm: number) => `${fmt(fromMm(mm, unit), 4)} ${unit}`;
  const pct = (v: number) => `${fmt(100 * v, 3)} %`;

  const properties = (
    <>
      <Section title="Line Pair">
        <SelectField
          label="Line type"
          value={p.type as 'microstrip' | 'stripline'}
          onChange={(v) => set({ type: v })}
          options={[
            { value: 'microstrip', label: 'Surface microstrip' },
            { value: 'stripline', label: 'Stripline' },
          ]}
        />
        {p.type === 'microstrip' && <Check label="Solder mask coating" checked={p.mask} onChange={(v) => set({ mask: v })} />}
        <LenField label="Trace width" symbol="W" value={p.w} onChange={(v) => set({ w: v })} />
        <LenField label="Copper thickness" symbol="T" value={p.t} onChange={(v) => set({ t: v })} units={['mm', 'mil', 'um', 'oz']} />
        <LenField label="Edge-to-edge spacing" symbol="S" value={p.s} onChange={(v) => set({ s: v })} />
        <LenField label={p.type === 'stripline' ? 'Plane to trace' : 'Height to plane'} symbol="H" value={p.h} onChange={(v) => set({ h: v })} />
        <NumField label="Dielectric constant" symbol="εr" value={p.er} onChange={(v) => set({ er: v })} min={1} allowZero />
        {p.type === 'stripline' && (
          <>
            <LenField label="Trace to upper plane" symbol="H2" value={p.h2} onChange={(v) => set({ h2: v })} />
            <NumField label="Upper εr" value={p.er2} onChange={(v) => set({ er2: v })} min={1} allowZero />
          </>
        )}
      </Section>
      <Section title="Signal">
        <LenField label="Coupled length" symbol="Len" value={p.len} onChange={(v) => set({ len: v })} units={['mm', 'cm', 'in', 'mil']} />
        <NumField label="Rise time (10–90 %)" symbol="tr" value={p.tr} onChange={(v) => set({ tr: v })} unit="ps" />
        <NumField label="Aggressor swing" symbol="V" value={p.v} onChange={(v) => set({ v })} unit="V" />
      </Section>
    </>
  );

  return (
    <ToolPage
      title="Crosstalk Calculator"
      description="Near-end (NEXT) and far-end (FEXT) crosstalk between two parallel PCB traces, from the even- and odd-mode solution of the field solver, with a sweep over the spacing."
      onReset={reset}
      properties={properties}
      status={x ? `NEXT ${pct(x.next / p.v)} (${fmt(x.next * 1000, 4)} mV) · FEXT ${fmt(Math.abs(x.fext) * 1000, 4)} mV` : st.busy ? 'Solving…' : 'Check the inputs'}
      method={<Method />}
    >
      <Notes kind="error" items={ok ? (st.error ? [st.error] : []) : ['Check the inputs: all dimensions must be greater than 0 and εr at least 1.']} />
      {x && st.result && (
        <div className="grid gap-3 xl:grid-cols-2">
          <Panel title="Results">
            <div className="flex flex-wrap gap-8 px-2.5 py-2">
              <Big label="Near-end crosstalk (NEXT)" value={fmt(x.next * 1000, 4)} unit="mV" busy={st.busy} />
              <Big label="Far-end crosstalk (FEXT)" value={fmt(Math.abs(x.fext) * 1000, 4)} unit="mV" busy={st.busy} />
            </div>
            <table className="tbl">
              <tbody>
                <Result label="Backward coefficient Kb (saturated NEXT)" value={pct(x.kb)} strong />
                <Result label="NEXT as % of aggressor" value={pct(x.next / p.v)} sub={x.saturated ? 'saturated: coupled length exceeds the rise-time length' : `grows with length until ${L(x.satLenMm)}`} />
                <Result label="FEXT as % of aggressor" value={pct(Math.abs(x.fext) / p.v)} sub={x.fextSaturated ? 'saturated: modal delay difference exceeds the rise time (max V/2)' : p.type === 'stripline' && p.er === p.er2 ? 'homogeneous stripline: FEXT cancels' : 'grows linearly with the coupled length'} />
                <Result label="Zeven / Zodd" value={`${fmt(st.result.even!.z, 4)} / ${fmt(st.result.odd!.z, 4)}`} unit="Ω" />
                <Result label="εeff even / odd" value={`${fmt(st.result.even!.eeff, 4)} / ${fmt(st.result.odd!.eeff, 4)}`} />
                <Result label="Coupled-section delay" value={fmt(x.td * 1e12, 4)} unit="ps" />
              </tbody>
            </table>
          </Panel>
          <Panel title="Spacing Sweep (same geometry)">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Spacing</th>
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
            <p className="px-2.5 py-1.5 text-faint">The “3W rule” (S ≥ 2W, centre pitch ≥ 3W) typically keeps NEXT in the low single-digit percent.</p>
          </Panel>
        </div>
      )}
    </ToolPage>
  );
}

function Method() {
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
      <h2>References</h2>
      <ol>
        <li>E. Bogatin, <i>Signal and Power Integrity – Simplified</i>, 3rd ed., ch. 10.</li>
        <li>H. Johnson, M. Graham, <i>High-Speed Digital Design</i>, 1993.</li>
      </ol>
    </>
  );
}
