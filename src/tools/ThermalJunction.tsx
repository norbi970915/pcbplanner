import { ToolPage } from '../components/ToolPage';
import { ComparisonButton, ComparisonPanel } from '../components/DesignComparison';
import { useDesignComparison } from '../state/useDesignComparison';
import { comparisonRow as row } from '../lib/designComparison';
import { Big, Notes, NumField, Panel, Result, Section, SelectField } from '../components/ui';
import { junction } from '../lib/thermal';
import { fmt } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { mode: 'ja', p: 1.5, ta: 40, ja: 40, jc: 2, cs: 0.5, sa: 8, tjmax: 125, tref: 70, psi: 15 };
type Mode = 'ja' | 'chain' | 'psijb' | 'psijt';
const MODE_LABEL: Record<Mode, string> = {
  ja: 'Junction to ambient',
  chain: 'Junction, case and heatsink',
  psijb: 'ψJB from the board temperature',
  psijt: 'ψJT from the case-top temperature',
};

export default function ThermalJunction() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const mode: Mode = (['ja', 'chain', 'psijb', 'psijt'] as const).includes(p.mode as Mode) ? (p.mode as Mode) : 'ja';
  const psiMode = mode === 'psijb' || mode === 'psijt';
  const refName = mode === 'psijt' ? 'Case top' : 'Board';
  const errors: string[] = [];
  if (!(p.p > 0)) errors.push('Power must be greater than 0.');
  if (mode === 'ja' && !(p.ja > 0)) errors.push('θJA must be greater than 0.');
  if (mode === 'chain' && !(p.jc >= 0 && p.cs >= 0 && p.sa > 0)) errors.push('θ values cannot be negative and θSA must be greater than 0.');
  if (psiMode && !(p.psi >= 0)) errors.push(`${mode === 'psijb' ? 'ψJB' : 'ψJT'} cannot be negative.`);
  const r = errors.length ? null : junction({ powerW: p.p, ambientC: p.ta, mode, thetaJA: p.ja, thetaJC: p.jc, thetaCS: p.cs, thetaSA: p.sa, tjMaxC: p.tjmax, refC: p.tref, psi: p.psi });
  const notes: string[] = [];
  if (r && r.margin < 0) notes.push(`The junction exceeds Tj,max by ${fmt(-r.margin, 3)} °C. Reduce the power or the thermal resistance.`);
  else if (r && r.margin < 15) notes.push('Less than 15 °C margin to Tj,max. Most designs derate further for reliability.');
  if (mode === 'ja') notes.push('θJA in datasheets is measured on a JEDEC test board (JESD51). Your board may be much better or worse; use it for comparison, not as a guarantee.');
  if (mode === 'psijb') notes.push('Use the board temperature right at the package: measured next to it, or from a model of your board such as the Thermal tab of the KiCad Project page. ψJB is not θJB; θJB is a cold-plate value and does not belong in this formula.');
  if (mode === 'psijt') notes.push('Use the temperature of the top of the package: a fine thermocouple, or an IR camera set to the emissivity of the package.');

  // temperature profile bars for the chain
  const pts = r && psiMode ? [
    { n: 'Junction', t: r.tj },
    { n: refName, t: p.tref },
  ] : r && r.nodes ? [
    { n: 'Junction', t: r.tj },
    { n: 'Case', t: r.nodes.case },
    { n: 'Heatsink', t: r.nodes.sink },
    { n: 'Ambient', t: p.ta },
  ] : r ? [
    { n: 'Junction', t: r.tj },
    { n: 'Ambient', t: p.ta },
  ] : [];
  const tMax = Math.max(p.tjmax, ...pts.map((x) => x.t));

  const comparison = useDesignComparison('/junction-temperature', {
    state: p,
    inputs: [row('mode', 'Thermal model', MODE_LABEL[mode]),
      row('p', 'Power dissipation', p.p, 'W'), ...(psiMode ? [row('tref', `${refName} temperature`, p.tref, '\u00b0C')] : [row('ta', 'Ambient temperature', p.ta, '\u00b0C')]), row('tjmax', 'Junction limit', p.tjmax, '\u00b0C'),
      ...(psiMode ? [row('psi', mode === 'psijb' ? 'ψJB' : 'ψJT', p.psi, '\u00b0C/W')] : mode === 'ja' ? [row('ja', 'Junction to ambient', p.ja, '\u00b0C/W')] : [row('jc', 'Junction to case', p.jc, '\u00b0C/W'), row('cs', 'Case to sink', p.cs, '\u00b0C/W'), row('sa', 'Sink to ambient', p.sa, '\u00b0C/W')])],
    results: [row('tj', 'Junction temperature', r?.tj ?? null, '\u00b0C'), row('margin', 'Margin to junction limit', r?.margin ?? null, '\u00b0C'),
      row('theta', 'Total thermal resistance', r?.theta ?? null, '\u00b0C/W'), row('maxPower', 'Maximum power for limit', r?.maxPower ?? null, 'W'),
      ...(mode === 'chain' ? [row('case', 'Case temperature', r?.nodes?.case ?? null, '\u00b0C'), row('sink', 'Heatsink temperature', r?.nodes?.sink ?? null, '\u00b0C')] : [])],
  }, !!r, set);

  const properties = (
    <>
      <Section title="Operating Point">
        <NumField label="Power dissipation" symbol="P" value={p.p} onChange={(v) => set({ p: v })} unit="W" />
        {!psiMode && <NumField label="Ambient temperature" symbol="Ta" value={p.ta} onChange={(v) => set({ ta: v })} unit="°C" allowNegative />}
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
            { value: 'psijb', label: 'ψJB + board temp.' },
            { value: 'psijt', label: 'ψJT + case top' },
          ]}
        />
        {psiMode ? (
          <>
            <NumField
              label={mode === 'psijb' ? 'Board temperature at the package' : 'Case-top temperature'}
              symbol={mode === 'psijb' ? 'TPCB' : 'TC'}
              value={p.tref}
              onChange={(v) => set({ tref: v })}
              unit="°C"
              allowNegative
            />
            <NumField
              label={mode === 'psijb' ? 'Junction to board (ψ)' : 'Junction to case top (ψ)'}
              symbol={mode === 'psijb' ? 'ψJB' : 'ψJT'}
              value={p.psi}
              onChange={(v) => set({ psi: v })}
              unit="°C/W"
              allowZero
              hint="From the package datasheet's thermal table. It is a characterisation parameter, not a thermal resistance: it is only valid with the measured temperature it is defined from."
            />
          </>
        ) : mode === 'ja' ? (
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
      description="Junction temperature from power dissipation and the thermal-resistance path, or from a measured board or case-top temperature with the package's ψJB or ψJT; the maximum power for a junction limit, and the heatsink thermal resistance needed."
      onReset={reset}
      properties={properties}
      status={r ? `Tj = ${fmt(r.tj, 4)} °C · margin ${fmt(r.margin, 3)} °C · ${psiMode ? (mode === 'psijb' ? 'ψJB' : 'ψJT') : 'θ'} = ${fmt(r.theta, 4)} °C/W` : 'Check the inputs'}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      <Notes items={notes} />
      {r && (
        <div className="grid gap-3 xl:grid-cols-2">
          <Panel title="Results" right={<ComparisonButton comparison={comparison} />}>
            <div className="flex flex-wrap gap-8 px-2.5 py-2">
              <Big label="Junction temperature Tj" value={fmt(r.tj, 4)} unit="°C" />
              <Big label="Margin to Tj,max" value={fmt(r.margin, 3)} unit="°C" />
            </div>
            <table className="tbl">
              <tbody>
                {psiMode ? (
                  <Result label={`Rise from the ${refName.toLowerCase()} to the junction`} value={fmt(r.tj - p.tref, 4)} unit="°C" sub={`${mode === 'psijb' ? 'ψJB' : 'ψJT'} · P`} />
                ) : (
                  <>
                    <Result label="Total thermal resistance" value={fmt(r.theta, 4)} unit="°C/W" />
                    <Result label="Maximum power for Tj,max" value={fmt(r.maxPower, 4)} unit="W" strong />
                  </>
                )}
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
      <ComparisonPanel comparison={comparison} />
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
        Copper area, thermal vias and airflow on your board change the real value a lot.
      </p>
      <h2>From a measured board or case temperature</h2>
      <p>
        For a part on your own board, a temperature you know is a better starting point than the ambient. With the board temperature at the package (measured, or from a model of
        the board) and the package's Ψ<sub>JB</sub>, or the temperature of the top of the package and its Ψ<sub>JT</sub>: [2]
      </p>
      <div className="eq">
        <span className="no">(2)</span>
        <i>T</i>
        <sub>J</sub> = <i>T</i>
        <sub>PCB</sub> + Ψ<sub>JB</sub> · <i>P</i> &nbsp;&nbsp; <i>T</i>
        <sub>J</sub> = <i>T</i>
        <sub>C</sub> + Ψ<sub>JT</sub> · <i>P</i>
      </div>
      <p>
        Ψ<sub>JB</sub> and Ψ<sub>JT</sub> are not thermal resistances: they are measured on a test board, from the junction to the board at the package's centre pin and to the top of
        the package, with most of the heat going into the board. That is why they work with the measured temperature and only with it. θ<sub>JB</sub> looks similar but is measured
        between cold plates and gives a wrong junction temperature in this formula. Since the board temperature itself depends on the power, these modes give no maximum power.
      </p>
      <h2>References</h2>
      <ol>
        <li>JEDEC JESD51, Methodology for the Thermal Measurement of Component Packages.</li>
        <li>
          Texas Instruments SPRA953D, “Semiconductor and IC Package Thermal Metrics,” 2024: eq. 8 (Ψ<sub>JT</sub>), eq. 9 (Ψ<sub>JB</sub>), §4 to §5 (θ<sub>JB</sub> and Ψ
          <sub>JB</sub>). https://www.ti.com/lit/an/spra953d/spra953d.pdf
        </li>
      </ol>
    </>
  );
}
