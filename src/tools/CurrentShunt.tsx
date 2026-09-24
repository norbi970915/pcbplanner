import { ToolPage } from '../components/ToolPage';
import { Big, Notes, NumField, Panel, Result, Section, SelectField } from '../components/ui';
import { eValuesInRange, type ESeries } from '../lib/electronics';
import { shuntSelection } from '../lib/newCalculators';
import { fmt, si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { maxA: 10, minA: 0.1, budgetMv: 60, rMilli: 5, tolerance: 0.5, tcr: 50, deltaC: 50, offsetUv: 50, series: 'E24' };

export default function CurrentShunt() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const series: ESeries = p.series === 'E12' || p.series === 'E96' ? p.series : 'E24';
  const errors: string[] = [];
  if (!(p.maxA > 0)) errors.push('Maximum continuous current must be greater than 0 A.');
  if (!(p.minA >= 0 && p.minA <= p.maxA)) errors.push('Minimum current must be between 0 and maximum current.');
  if (!(p.budgetMv > 0)) errors.push('Allowed voltage drop must be greater than 0 mV.');
  if (!(p.rMilli > 0)) errors.push('Selected shunt resistance must be greater than 0 mΩ.');
  if (!(p.tolerance >= 0 && p.tolerance < 100)) errors.push('Shunt tolerance must be between 0 and 100 %.');
  if (!(p.tcr >= 0 && p.deltaC >= 0 && p.offsetUv >= 0)) errors.push('TCR, temperature change and amplifier offset cannot be negative.');
  const result = errors.length ? null : shuntSelection(p.maxA, p.minA, p.budgetMv, p.rMilli, p.tolerance, p.tcr, p.deltaC, p.offsetUv);
  const candidates = result ? eValuesInRange(Math.max(result.idealMaxMilliOhms / 20, 1e-6), result.idealMaxMilliOhms / (1 + result.resistorErrorPct / 100), series).reverse().slice(0, 6) : [];
  const notes: string[] = [];
  if (result?.dropExceeded) notes.push('The selected shunt can exceed the allowed voltage drop at the high-resistance tolerance and temperature corner.');
  if (result && p.minA === 0) notes.push('Percentage measurement error is undefined at zero current. Enter the smallest non-zero current you need to resolve.');
  if (result && !candidates.length) notes.push(`No ${series} value was found below the worst-case drop limit in the searched range. Check a different series or allow more burden voltage.`);

  return <ToolPage title="Current-Sense Shunt Selector" description="Choose a shunt from current range and allowed voltage drop, then check resistor power and a first-order measurement-error budget."
    onReset={reset} status={result ? `${fmt(p.rMilli, 4)} mΩ at ${fmt(p.maxA, 4)} A: ${fmt(result.dropMv, 4)} mV, ${si(result.watts, 'W', 4)}` : 'Check the inputs'} method={<Method />}
    properties={<>
      <Section title="Current & voltage budget">
        <NumField label="Maximum continuous current" symbol="Imax" value={p.maxA} onChange={v => set({ maxA: v })} unit="A" />
        <NumField label="Minimum measured current" symbol="Imin" value={p.minA} onChange={v => set({ minA: v })} unit="A" allowZero />
        <NumField label="Allowed voltage drop" value={p.budgetMv} onChange={v => set({ budgetMv: v })} unit="mV" hint="Maximum acceptable burden voltage in the current path." />
      </Section>
      <Section title="Shunt resistor">
        <NumField label="Selected resistance" symbol="Rs" value={p.rMilli} onChange={v => set({ rMilli: v })} unit="mΩ" />
        <SelectField label="Preferred values" value={series} onChange={v => set({ series: v })} options={['E12', 'E24', 'E96'].map(x => ({ value: x as ESeries, label: x }))} />
        <NumField label="Resistance tolerance" value={p.tolerance} onChange={v => set({ tolerance: v })} unit="%" allowZero />
        <NumField label="Temperature coefficient" symbol="TCR" value={p.tcr} onChange={v => set({ tcr: v })} unit="ppm/°C" allowZero />
        <NumField label="Temperature change" symbol="ΔT" value={p.deltaC} onChange={v => set({ deltaC: v })} unit="°C" allowZero hint="Difference from the resistance's reference temperature, including self-heating where known." />
      </Section>
      <Section title="Measurement">
        <NumField label="Input-referred offset" symbol="Vos" value={p.offsetUv} onChange={v => set({ offsetUv: v })} unit="µV" allowZero hint="Maximum amplifier input offset after any calibration, from its datasheet." />
      </Section>
    </>}>
    <Notes kind="error" items={errors} />
    <Notes items={notes} />
    {result && <>
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="Shunt & Burden">
          <div className="flex flex-wrap gap-8 px-2.5 py-3"><Big label="Maximum nominal shunt" value={fmt(result.idealMaxMilliOhms, 4)} unit="mΩ" /><Big label="Selected shunt" value={fmt(p.rMilli, 4)} unit="mΩ" /></div>
          <table className="tbl"><tbody>
            <Result label="Voltage drop at Imax" value={fmt(result.dropMv, 5)} unit="mV" />
            <Result label="Worst-corner drop" value={fmt(result.worstDropMv, 5)} unit="mV" sub={`Budget ${fmt(p.budgetMv, 5)} mV`} strong />
            <Result label="Nominal continuous dissipation" value={si(result.watts, 'W', 4)} />
            <Result label="High-resistance corner dissipation" value={si(result.worstWatts, 'W', 4)} />
          </tbody></table>
          <p className="px-3 py-2 text-faint">Choose a resistor with a continuous power rating above the calculated value after PCB footprint and ambient-temperature derating. Check pulse ratings separately.</p>
        </Panel>
        <Panel title="Measurement at Minimum Current">
          <div className="flex flex-wrap gap-8 px-2.5 py-3"><Big label="Sense voltage" value={fmt(result.signalMinMv, 5)} unit="mV" /><Big label="Estimated worst error" value={result.worstErrorPct === null ? '—' : fmt(result.worstErrorPct, 4)} unit={result.worstErrorPct === null ? '' : '%'} /></div>
          <table className="tbl"><tbody>
            <Result label="Shunt tolerance + TCR bound" value={fmt(result.resistorErrorPct, 4)} unit="%" />
            <Result label="Amplifier offset contribution" value={result.offsetErrorPct === null ? 'Undefined at 0 A' : `${fmt(result.offsetErrorPct, 4)} %`} />
            <Result label="Offset-equivalent current" value={si(p.offsetUv * 1e-6 / (p.rMilli * 1e-3), 'A', 4)} />
          </tbody></table>
          <p className="px-3 py-2 text-faint">This additive bound excludes amplifier gain error, noise, ADC error and PCB connection resistance. Kelvin sense routing helps keep copper and pad drops out of the measured voltage.</p>
        </Panel>
      </div>
      <Panel title={`Candidate ${series} Values Within Worst-Case Drop Budget`}>
        {candidates.length ? <table className="tbl"><thead><tr><th className="text-left">Shunt</th><th className="v">Worst drop at Imax</th><th className="v">Nominal power</th><th /></tr></thead><tbody>
          {candidates.map(r => <tr key={r}><td>{fmt(r, 5)} mΩ</td><td className="v">{fmt(p.maxA * r * (1 + result.resistorErrorPct / 100), 5)} mV</td><td className="v">{si(p.maxA ** 2 * r * 1e-3, 'W', 4)}</td><td className="v"><button type="button" className="btn" onClick={() => set({ rMilli: r })}>Use</button></td></tr>)}
        </tbody></table> : <p className="px-3 py-2 text-muted">No candidate in this series fits the current and drop budget.</p>}
        <p className="px-3 py-2 text-faint">Preferred-number candidates are nominal values; confirm that a real shunt with the chosen tolerance, TCR, power rating and package is available.</p>
      </Panel>
    </>}
  </ToolPage>;
}

function Method() {
  return <>
    <h2>Method</h2>
    <p>Maximum nominal resistance from the burden budget is R<sub>max</sub> = V<sub>drop,max</sub> / I<sub>max</sub>. For the selected resistor, V<sub>sense</sub> = IR and P = I²R. The high-resistance corner multiplies nominal R by 1 + tolerance + TCR × |ΔT| (each term converted to a fraction).</p>
    <p>The error display adds the shunt tolerance/TCR bound to the input-referred offset divided by the minimum non-zero sense voltage. This is a conservative first-order bound, not a complete measurement uncertainty analysis. Sense amplifier gain and common-mode limits, resistor self-heating and ADC behaviour need separate checks.</p>
    <h2>References</h2><ol>
      <li><a href="https://www.ti.com/document-viewer/lit/html/SBOA167" target="_blank" rel="noreferrer">Texas Instruments SBOA167, Current-Sense Shunt Resistor Selection</a>, burden, power and accuracy trade-offs.</li>
      <li><a href="https://www.ti.com/document-viewer/lit/html/SBAA460" target="_blank" rel="noreferrer">Texas Instruments SBAA460, Considerations for Selecting a Shunt Resistor</a>, temperature effects and Kelvin connections.</li>
    </ol>
  </>;
}
