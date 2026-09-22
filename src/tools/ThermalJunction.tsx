import { ToolPage } from '../components/ToolPage';
import { Big, Notes, NumField, Panel, Result, Section, SelectField } from '../components/ui';
import { junction } from '../lib/thermal';
import { fmt } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { mode: 'ja', p: 1.5, ta: 40, ja: 40, jc: 2, cs: 0.5, sa: 8, tjmax: 125 };

export default function ThermalJunction() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const mode = p.mode as 'ja' | 'chain';
  const errors: string[] = [];
  if (!(p.p > 0)) errors.push('Power must be greater than 0.');
  if (mode === 'ja' && !(p.ja > 0)) errors.push('θJA must be greater than 0.');
  if (mode === 'chain' && !(p.jc >= 0 && p.cs >= 0 && p.sa > 0)) errors.push('θ values cannot be negative and θSA must be greater than 0.');
  const r = errors.length ? null : junction({ powerW: p.p, ambientC: p.ta, mode, thetaJA: p.ja, thetaJC: p.jc, thetaCS: p.cs, thetaSA: p.sa, tjMaxC: p.tjmax });
  const notes: string[] = [];
  if (r && r.margin < 0) notes.push(`The junction exceeds Tj,max by ${fmt(-r.margin, 3)} °C. Reduce the power or the thermal resistance.`);
  else if (r && r.margin < 15) notes.push('Less than 15 °C margin to Tj,max. Most designs derate further for reliability.');
  if (mode === 'ja') notes.push('θJA in datasheets is measured on a JEDEC test board (JESD51). Your board may be much better or worse; use it for comparison, not as a guarantee.');

  // temperature profile bars for the chain
  const pts = r && r.nodes ? [
    { n: 'Junction', t: r.tj },
    { n: 'Case', t: r.nodes.case },
    { n: 'Heatsink', t: r.nodes.sink },
    { n: 'Ambient', t: p.ta },
  ] : r ? [
    { n: 'Junction', t: r.tj },
    { n: 'Ambient', t: p.ta },
  ] : [];
  const tMax = Math.max(p.tjmax, ...pts.map((x) => x.t));

  const properties = (
    <>
      <Section title="Operating Point">
        <NumField label="Power dissipation" symbol="P" value={p.p} onChange={(v) => set({ p: v })} unit="W" />
        <NumField label="Ambient temperature" symbol="Ta" value={p.ta} onChange={(v) => set({ ta: v })} unit="°C" allowNegative />
        <NumField label="Max junction temp." symbol="Tj,max" value={p.tjmax} onChange={(v) => set({ tjmax: v })} unit="°C" allowNegative />
      </Section>
      <Section title="Thermal Path">
        <SelectField
          label="Model"
          value={mode}
          onChange={(v) => set({ mode: v })}
          options={[
            { value: 'ja', label: 'θJA (no heatsink)' },
            { value: 'chain', label: 'θJC + θCS + θSA' },
          ]}
        />
        {mode === 'ja' ? (
          <NumField label="Junction to ambient" symbol="θJA" value={p.ja} onChange={(v) => set({ ja: v })} unit="°C/W" />
        ) : (
          <>
            <NumField label="Junction to case" symbol="θJC" value={p.jc} onChange={(v) => set({ jc: v })} unit="°C/W" allowZero />
            <NumField label="Case to sink (TIM)" symbol="θCS" value={p.cs} onChange={(v) => set({ cs: v })} unit="°C/W" allowZero />
            <NumField label="Sink to ambient" symbol="θSA" value={p.sa} onChange={(v) => set({ sa: v })} unit="°C/W" />
          </>
        )}
      </Section>
    </>
  );

  return (
    <ToolPage
      title="Junction Temperature"
      description="Junction temperature from power dissipation and the thermal-resistance path, the maximum power for a junction limit, and the heatsink thermal resistance needed."
      onReset={reset}
      properties={properties}
      status={r ? `Tj = ${fmt(r.tj, 4)} °C · margin ${fmt(r.margin, 3)} °C · θ = ${fmt(r.theta, 4)} °C/W` : 'Check the inputs'}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      <Notes items={notes} />
      {r && (
        <div className="grid gap-3 xl:grid-cols-2">
          <Panel title="Results">
            <div className="flex flex-wrap gap-8 px-2.5 py-2">
              <Big label="Junction temperature Tj" value={fmt(r.tj, 4)} unit="°C" />
              <Big label="Margin to Tj,max" value={fmt(r.margin, 3)} unit="°C" />
            </div>
            <table className="tbl">
              <tbody>
                <Result label="Total thermal resistance" value={fmt(r.theta, 4)} unit="°C/W" />
                <Result label="Maximum power for Tj,max" value={fmt(r.maxPower, 4)} unit="W" strong />
                {r.nodes && (
                  <>
                    <Result label="Case temperature" value={fmt(r.nodes.case, 4)} unit="°C" />
                    <Result label="Heatsink temperature" value={fmt(r.nodes.sink, 4)} unit="°C" />
                    <Result
                      label="Heatsink θSA needed for Tj,max"
                      value={r.thetaSARequired > 0 ? fmt(r.thetaSARequired, 4) : 'not achievable'}
                      unit={r.thetaSARequired > 0 ? '°C/W' : ''}
                      sub="with the given θJC and θCS"
                    />
                  </>
                )}
              </tbody>
            </table>
          </Panel>
          <Panel title="Temperature Along the Path">
            <div className="space-y-1.5 p-2.5">
              {pts.map((x) => (
                <div key={x.n} className="grid grid-cols-[80px_minmax(0,1fr)_70px] items-center gap-2">
                  <span className="text-muted">{x.n}</span>
                  <div className="h-[14px] bg-field">
                    <div className="h-full" style={{ width: `${Math.max(2, (100 * x.t) / tMax)}%`, background: x.t > p.tjmax ? 'var(--err-line)' : 'var(--copper)' }} />
                  </div>
                  <span className="tnum text-right">{fmt(x.t, 4)} °C</span>
                </div>
              ))}
              <div className="grid grid-cols-[80px_minmax(0,1fr)_70px] items-center gap-2 text-faint">
                <span>Tj,max</span>
                <div className="relative h-[2px]">
                  <div className="absolute top-[-6px] h-[14px] w-px bg-[var(--err-line)]" style={{ left: `${(100 * p.tjmax) / tMax}%` }} />
                </div>
                <span className="tnum text-right">{fmt(p.tjmax, 4)} °C</span>
              </div>
            </div>
          </Panel>
        </div>
      )}
    </ToolPage>
  );
}

export function Method() {
  return (
    <>
      <h2>Thermal resistance model</h2>
      <p>Heat flows from the junction to the ambient air through thermal resistances in series, like current through resistors. The temperature rise across the path is:</p>
      <div className="eq">
        <span className="no">(1)</span>
        <i>T</i>
        <sub>j</sub> = <i>T</i>
        <sub>a</sub> + <i>P</i> · (θ<sub>JC</sub> + θ<sub>CS</sub> + θ<sub>SA</sub>)
      </div>
      <p>
        Without a heatsink the whole path is lumped into θ<sub>JA</sub>. Datasheet θ<sub>JA</sub> values come from a standardised JEDEC test board (JESD51-3 low-K or JESD51-7 high-K).
        Copper area, thermal vias and airflow on your board change the real value a lot. For board-mounted parts, Ψ<sub>JT</sub> and θ<sub>JB</sub> with a measured case or board
        temperature give better estimates.
      </p>
      <h2>References</h2>
      <ol>
        <li>JEDEC JESD51, Methodology for the Thermal Measurement of Component Packages.</li>
        <li>Texas Instruments SPRA953, “Semiconductor and IC Package Thermal Metrics.”</li>
      </ol>
    </>
  );
}
