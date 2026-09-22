import { ToolPage } from '../components/ToolPage';
import { Big, Notes, NumField, Panel, Result, Section } from '../components/ui';
import { ldo } from '../lib/power';
import { fmt } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { vin: 5, vout: 3.3, iout: 500, iq: 1, ja: 60, ta: 40, tj: 125, vdo: 0.3 };

export default function Ldo() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const errors: string[] = [];
  if (!(p.vout > 0)) errors.push('Output voltage must be greater than 0.');
  if (!(p.vin > p.vout)) errors.push('The input voltage must be above the output voltage.');
  if (!(p.iout > 0)) errors.push('Load current must be greater than 0.');
  if (!(p.ja > 0)) errors.push('θJA must be greater than 0.');
  if (p.iq < 0 || p.vdo < 0) errors.push('Values cannot be negative.');
  if (!(p.tj > p.ta)) errors.push('Tj,max must be above the ambient temperature.');
  const r = errors.length ? null : ldo({ vin: p.vin, vout: p.vout, iout: p.iout * 1e-3, iq: p.iq * 1e-3, thetaJA: p.ja, ta: p.ta, tjMax: p.tj, vDropout: p.vdo });
  const notes: string[] = [];
  if (r) {
    if (!r.dropoutOk) notes.push(`Headroom ${fmt(r.headroom, 3)} V is below the dropout voltage ${fmt(p.vdo, 3)} V: the regulator falls out of regulation. Dropout also rises with load and temperature.`);
    if (r.tj > p.tj) notes.push(`The junction reaches ${fmt(r.tj, 4)} °C, above Tj,max. Most LDOs enter thermal shutdown around 150–170 °C. Reduce Vin, the current or θJA, or use a switching regulator.`);
    else if (p.tj - r.tj < 15) notes.push('Less than 15 °C margin to Tj,max.');
    notes.push('θJA in datasheets is measured on a JEDEC test board (JESD51-7). Copper area and thermal vias on your board change it a lot.');
  }

  const properties = (
    <>
      <Section title="Operating Point">
        <NumField label="Input voltage" symbol="Vin" value={p.vin} onChange={(v) => set({ vin: v })} unit="V" />
        <NumField label="Output voltage" symbol="Vout" value={p.vout} onChange={(v) => set({ vout: v })} unit="V" />
        <NumField label="Load current" symbol="Iout" value={p.iout} onChange={(v) => set({ iout: v })} unit="mA" />
        <NumField label="Ground current" symbol="Iq" value={p.iq} onChange={(v) => set({ iq: v })} unit="mA" allowZero hint="Quiescent / ground-pin current at this load, from the datasheet." />
        <NumField label="Dropout voltage" value={p.vdo} onChange={(v) => set({ vdo: v })} unit="V" allowZero />
      </Section>
      <Section title="Thermal">
        <NumField label="Junction to ambient" symbol="θJA" value={p.ja} onChange={(v) => set({ ja: v })} unit="°C/W" />
        <NumField label="Ambient temperature" symbol="Ta" value={p.ta} onChange={(v) => set({ ta: v })} unit="°C" allowNegative />
        <NumField label="Max. junction temp." symbol="Tj,max" value={p.tj} onChange={(v) => set({ tj: v })} unit="°C" />
      </Section>
    </>
  );

  return (
    <ToolPage
      title="LDO Regulator Power Dissipation"
      description="Linear regulator (LDO) power dissipation, junction temperature, efficiency and dropout headroom, with the maximum load current and the θJA needed for a junction temperature limit."
      onReset={reset}
      properties={properties}
      status={r ? `Pd = ${fmt(r.pd, 4)} W · Tj = ${fmt(r.tj, 4)} °C · η = ${fmt(100 * r.efficiency, 3)} %` : 'Check the inputs'}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      <Notes items={notes} />
      {r && (
        <Panel title="Results">
          <div className="flex flex-wrap gap-8 px-2.5 py-2">
            <Big label="Power dissipation" value={fmt(r.pd, 4)} unit="W" />
            <Big label="Junction temperature" value={fmt(r.tj, 4)} unit="°C" />
            <Big label="Efficiency" value={fmt(100 * r.efficiency, 3)} unit="%" />
          </div>
          <table className="tbl">
            <tbody>
              <Result label="Headroom Vin − Vout" value={fmt(r.headroom, 4)} unit="V" sub={r.dropoutOk ? 'above the dropout voltage' : 'BELOW the dropout voltage'} />
              <Result label="Pass-element dissipation" value={fmt(r.headroom * p.iout * 1e-3, 4)} unit="W" sub="(Vin − Vout)·Iout" />
              <Result label="Ground-current dissipation" value={fmt(p.vin * p.iq * 1e-3, 4)} unit="W" sub="Vin·Iq" />
              <Result label="Maximum dissipation for Tj,max" value={fmt(r.pMax, 4)} unit="W" />
              <Result label="Maximum load current for Tj,max" value={r.ioutMax > 0 ? fmt(r.ioutMax * 1e3, 4) : '0'} unit="mA" strong />
              <Result label="θJA needed at this load" value={fmt(r.thetaNeeded, 4)} unit="°C/W" />
            </tbody>
          </table>
        </Panel>
      )}
    </ToolPage>
  );
}

function Method() {
  return (
    <>
      <h2>Equations</h2>
      <p>A linear regulator drops the difference between input and output across its pass transistor. All of that power becomes heat:</p>
      <div className="eq">
        <span className="no">(1)</span>
        <i>P</i>
        <sub>D</sub> = (<i>V</i>
        <sub>in</sub> − <i>V</i>
        <sub>out</sub>) · <i>I</i>
        <sub>out</sub> + <i>V</i>
        <sub>in</sub> · <i>I</i>
        <sub>q</sub>
      </div>
      <div className="eq">
        <span className="no">(2)</span>
        <i>T</i>
        <sub>j</sub> = <i>T</i>
        <sub>a</sub> + <i>P</i>
        <sub>D</sub> · θ<sub>JA</sub>,&nbsp;&nbsp; η = <i>V</i>
        <sub>out</sub> <i>I</i>
        <sub>out</sub> / (<i>V</i>
        <sub>in</sub> (<i>I</i>
        <sub>out</sub> + <i>I</i>
        <sub>q</sub>))
      </div>
      <p>
        The efficiency of an LDO can never exceed <i>V</i>
        <sub>out</sub>/<i>V</i>
        <sub>in</sub>. For large voltage drops or currents, a switching regulator, or a buck followed by an LDO for low noise, dissipates far less.
      </p>
      <h2>References</h2>
      <ol>
        <li>Texas Instruments, “Technical Review of Low Dropout Voltage Regulator Operation and Performance,” application report.</li>
        <li>JEDEC JESD51-7, High Effective Thermal Conductivity Test Board for Leaded Surface Mount Packages.</li>
      </ol>
    </>
  );
}
