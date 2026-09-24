import { Link } from 'react-router-dom';
import { ToolPage } from '../components/ToolPage';
import { Big, Notes, NumField, Panel, Result, Section, SelectField } from '../components/ui';
import { eNearest, eNeighbors, type ESeries } from '../lib/electronics';
import { termination, type TerminationKind } from '../lib/newCalculators';
import { fmt, si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { kind: 'source', z0: 50, driver: 17, chosen: 33, swing: 3.3, series: 'E24' };
const KINDS: { value: TerminationKind; label: string }[] = [
  { value: 'source', label: 'Source series' },
  { value: 'parallel', label: 'Single-ended load' },
  { value: 'differential', label: 'Differential load' },
];

export default function Termination() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const kind: TerminationKind = p.kind === 'parallel' || p.kind === 'differential' ? p.kind : 'source';
  const series: ESeries = p.series === 'E12' || p.series === 'E96' ? p.series : 'E24';
  const errors: string[] = [];
  if (!(p.z0 > 0)) errors.push('Line impedance must be greater than 0 Ω.');
  if (!(p.driver >= 0)) errors.push('Driver output resistance cannot be negative.');
  if (!(p.chosen >= 0) || (kind !== 'source' && p.chosen === 0)) errors.push('Selected termination must be greater than 0 Ω for a load termination.');
  if (!(p.swing > 0)) errors.push('Voltage step or termination voltage must be greater than 0 V.');
  const result = errors.length ? null : termination(p.z0, p.driver, kind, p.chosen, p.swing);
  const preferred = result ? (result.ideal > 0 ? eNearest(result.ideal, series) : 0) : null;
  const neighbours = result && result.ideal > 0 ? eNeighbors(result.ideal, series) : null;
  const notes: string[] = [];
  if (kind === 'source' && p.driver >= p.z0) notes.push('Driver output resistance already equals or exceeds Z0. An added series resistor cannot make a source match.');
  if (kind !== 'source') notes.push('Confirm that the driver can supply the DC current and that the receiver permits this load. Differential interfaces can also require bias or common-mode termination.');
  if (kind === 'differential') notes.push('The 0.4 V differential voltage is an example only. Enter the worst sustained voltage across the pair from the device datasheet.');
  if (kind === 'source') notes.push('Source termination assumes one point-to-point line and a high-impedance receiver. Place the resistor close to the driver.');

  return <ToolPage title="Signal Termination Calculator" description="Choose a source-series or load termination from the line impedance, then check the actual resistor's reflection coefficient and electrical stress."
    onReset={reset} status={result ? `${KINDS.find(x => x.value === kind)?.label}: ideal ${si(result.ideal, 'Ω', 4)}, selected ${si(p.chosen, 'Ω', 4)}` : 'Check the inputs'} method={<Method />}
    properties={<>
      <Section title="Transmission line">
        <SelectField label="Termination" value={kind} onChange={v => set({ kind: v, z0: v === 'differential' && p.z0 === 50 ? 100 : v !== 'differential' && p.z0 === 100 ? 50 : p.z0, chosen: v === 'differential' ? 100 : v === 'parallel' ? 50 : 33, swing: v === 'differential' ? 0.4 : 3.3 })} options={KINDS} />
        <NumField label={kind === 'differential' ? 'Differential impedance' : 'Line impedance'} symbol={kind === 'differential' ? 'Zdiff' : 'Z0'} value={p.z0} onChange={v => set({ z0: v })} unit="Ω" />
        {kind === 'source' && <NumField label="Driver output resistance" symbol="Rout" value={p.driver} onChange={v => set({ driver: v })} unit="Ω" allowZero hint="Use the datasheet value for this output mode and supply; it can vary across process and temperature." />}
      </Section>
      <Section title="Resistor & voltage">
        <NumField label="Selected resistor" value={p.chosen} onChange={v => set({ chosen: v })} unit="Ω" allowZero={kind === 'source'} />
        <SelectField label="Preferred values" value={series} onChange={v => set({ series: v })} options={['E12', 'E24', 'E96'].map(x => ({ value: x as ESeries, label: x }))} />
        <NumField label={kind === 'source' ? 'Driver voltage step' : kind === 'differential' ? 'Voltage across pair' : 'Voltage across resistor'} value={p.swing} onChange={v => set({ swing: v })} unit="V" hint={kind === 'source' ? 'Unloaded output swing; initial launched edge is smaller.' : 'Worst sustained voltage across the termination, used for power and current.'} />
      </Section>
    </>}>
    <Notes kind="error" items={errors} />
    <Notes items={notes} />
    {result && <div className="grid gap-3 xl:grid-cols-2">
      <Panel title="Termination Value">
        <div className="flex flex-wrap gap-8 px-2.5 py-3">
          <Big label="Ideal resistor" value={si(result.ideal, 'Ω', 4)} unit="" />
          <Big label={`Nearest ${series}`} value={preferred === null ? '—' : si(preferred, 'Ω', 4)} unit="" />
        </div>
        <table className="tbl"><tbody>
          <Result label="Selected value" value={si(p.chosen, 'Ω', 4)} />
          <Result label="Reflection coefficient magnitude" value={fmt(Math.abs(result.gamma), 5)} sub={`${fmt(Math.abs(result.gamma) * 100, 3)} % of incident voltage; ${kind === 'source' ? 'at source' : 'at load'}`} />
          <Result label="Reflection polarity" value={result.gamma > 0 ? 'Positive' : result.gamma < 0 ? 'Negative' : 'Zero'} />
        </tbody></table>
        <div className="flex flex-wrap gap-2 px-3 py-2">
          {preferred !== null && <button type="button" className="btn" onClick={() => set({ chosen: preferred })}>Use nearest {series}</button>}
          {neighbours && neighbours.below !== neighbours.above && <><button type="button" className="btn" onClick={() => set({ chosen: neighbours.below })}>Use {si(neighbours.below, 'Ω')}</button><button type="button" className="btn" onClick={() => set({ chosen: neighbours.above })}>Use {si(neighbours.above, 'Ω')}</button></>}
        </div>
      </Panel>
      <Panel title="Electrical Check">
        <table className="tbl"><tbody>
          <Result label={kind === 'source' ? 'Initial launched voltage' : 'Termination voltage'} value={fmt(kind === 'source' ? result.current * p.z0 : p.swing, 5)} unit="V" />
          {kind === 'source' && <Result label="First arrival at open receiver" value={fmt(2 * result.current * p.z0, 5)} unit="V" sub="before later reflections" />}
          <Result label={kind === 'source' ? 'Initial line current' : 'Termination current'} value={si(result.current, 'A', 4)} />
          <Result label={`Resistor power (${result.powerLabel.toLowerCase()})`} value={si(result.resistorWatts, 'W', 4)} />
        </tbody></table>
        <p className="px-3 py-2 text-faint">{kind === 'source' ? 'The source resistor conducts during edges; average dissipation depends on data pattern, frequency and line loss.' : 'The power calculation assumes the entered voltage can remain across the resistor continuously. Check resistor derating and driver limits.'}</p>
      </Panel>
    </div>}
    <Panel title="Design Context"><p className="px-3 py-2 text-muted">Use the <Link to="/impedance">impedance calculator</Link> to find the trace impedance. A single-ended source resistor matches Z0 − Rout; a single-ended load resistor matches Z0. A resistor across a differential pair matches Zdiff. Cable interfaces and IC-specific termination schemes may need different circuits.</p></Panel>
  </ToolPage>;
}

function Method() {
  return <>
    <h2>Method</h2>
    <p>For one point-to-point line with a high-impedance receiver, source-series termination is R<sub>series</sub> = Z0 − R<sub>out</sub>. Its source reflection coefficient is (R<sub>out</sub> + R<sub>series</sub> − Z0) / (R<sub>out</sub> + R<sub>series</sub> + Z0). The initial launched voltage is V<sub>step</sub> × Z0 / (R<sub>out</sub> + R<sub>series</sub> + Z0).</p>
    <p>For a far-end resistor, the ideal value equals the line impedance: Z0 for a single-ended line or Zdiff for a resistor across a differential pair. The load reflection coefficient is (R<sub>term</sub> − Z) / (R<sub>term</sub> + Z). Power is V²/R for a sustained voltage across the load; source-series power is only the initial edge peak, I²R. Real driver impedance, line loss, receiver capacitance and resistor parasitics alter the waveform.</p>
    <h2>References</h2><ol>
      <li><a href="https://www.analog.com/media/en/training-seminars/tutorials/mt-097.pdf" target="_blank" rel="noreferrer">Analog Devices MT-097, Dealing with High Speed Logic</a>, source resistance and line matching.</li>
      <li><a href="https://www.analog.com/en/resources/app-notes/an-1177.html" target="_blank" rel="noreferrer">Analog Devices AN-1177, LVDS termination and layout</a>, differential termination and topology considerations.</li>
    </ol>
  </>;
}
