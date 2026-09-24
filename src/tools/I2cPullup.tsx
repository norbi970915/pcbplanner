import { ToolPage } from '../components/ToolPage';
import { Big, Notes, NumField, Panel, Result, Section, SelectField } from '../components/ui';
import type { ESeries } from '../lib/electronics';
import { I2C_LIMITS, i2cPullup, type I2cMode } from '../lib/newCalculators';
import { fmt, si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { mode: 'fast', vdd: 3.3, cap: 200, vol: 0.4, sink: 3, resistance: 1500, tolerance: 1, series: 'E24' };
const MODES: { value: I2cMode; label: string }[] = [
  { value: 'standard', label: 'Standard (100 kHz)' },
  { value: 'fast', label: 'Fast (400 kHz)' },
  { value: 'fastPlus', label: 'Fast Plus (1 MHz)' },
];

export default function I2cPullup() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const mode: I2cMode = p.mode === 'standard' || p.mode === 'fastPlus' ? p.mode : 'fast';
  const series: ESeries = p.series === 'E12' || p.series === 'E96' ? p.series : 'E24';
  const limits = I2C_LIMITS[mode];
  const errors: string[] = [];
  if (!(p.vdd > 0)) errors.push('Bus supply must be greater than 0 V.');
  if (!(p.cap > 0)) errors.push('Bus capacitance must be greater than 0 pF.');
  if (!(p.vol >= 0 && p.vol < p.vdd)) errors.push('VOL(max) must be at least 0 V and below the bus supply.');
  if (!(p.sink > 0)) errors.push('Weakest device sink capability must be greater than 0 mA.');
  if (!(p.resistance > 0)) errors.push('Selected pull-up resistance must be greater than 0 Ω.');
  if (!(p.tolerance >= 0 && p.tolerance < 100)) errors.push('Resistor tolerance must be between 0 and 100 %.');
  const result = errors.length ? null : i2cPullup(p.vdd, p.cap, p.vol, p.sink, mode, series, p.tolerance);
  const actual = result?.evaluate(p.resistance);
  const notes: string[] = [];
  if (result?.busCapExceeded) notes.push(`Bus capacitance exceeds the ${limits.busPf} pF ${limits.label} limit; a resistor choice alone does not make this bus compliant.`);
  if (result && result.min > result.max) notes.push('No passive pull-up can satisfy both sink current and rise-time limits. Reduce bus capacitance, lower the speed or check whether an active buffer is appropriate.');
  if (result && result.min <= result.max && result.minNominal > result.maxNominal) notes.push('Resistor tolerance leaves no valid nominal value. Reduce tolerance, bus capacitance or bus speed.');
  else if (result && result.min <= result.max && !result.options.length) notes.push(`No ${series} value meets both limits with the entered tolerance. Try a finer series or adjust the design.`);
  if (result && actual && (actual.worstSinkMa > p.sink || actual.worstRiseNs > limits.riseNs || actual.fastestRiseNs < limits.minRiseNs)) notes.push('The selected resistor can fail a limit at its tolerance corner.');
  if (p.vdd <= 2) notes.push('At 2 V and below, the I²C low-level voltage and sink-current conditions differ. Enter the limits of the weakest device from its datasheet.');
  const preferred = result?.suggested ?? null;

  return (
    <ToolPage title="I²C Pull-up Calculator" description="Size the pull-up on each SDA or SCL line from bus capacitance, rise-time limit and the weakest device's LOW-level sink capability." onReset={reset}
      properties={<>
        <Section title="I²C bus">
          <SelectField label="Mode" value={mode} onChange={v => set({ mode: v, sink: v === 'fastPlus' ? 20 : 3 })} options={MODES} />
          <NumField label="Bus supply" symbol="VDD" value={p.vdd} onChange={v => set({ vdd: v })} unit="V" />
          <NumField label="Capacitance per line" symbol="Cb" value={p.cap} onChange={v => set({ cap: v })} unit="pF" hint="Include all device pins, PCB traces and connectors on one SDA or SCL line." />
        </Section>
        <Section title="Weakest device">
          <NumField label="Maximum LOW voltage" symbol="VOL" value={p.vol} onChange={v => set({ vol: v })} unit="V" allowZero />
          <NumField label="Sink capability" symbol="IOL" value={p.sink} onChange={v => set({ sink: v })} unit="mA" hint="Use the smallest guaranteed sink current among devices driving this line LOW." />
        </Section>
        <Section title="Resistor">
          <NumField label="Selected pull-up" symbol="Rp" value={p.resistance} onChange={v => set({ resistance: v })} unit="Ω" />
          <NumField label="Resistor tolerance" value={p.tolerance} onChange={v => set({ tolerance: v })} unit="%" allowZero />
          <SelectField label="Preferred values" value={series} onChange={v => set({ series: v })} options={['E12', 'E24', 'E96'].map(x => ({ value: x as ESeries, label: x }))} />
        </Section>
      </>}
      status={result ? `${limits.label}: ${si(result.min, 'Ω', 4)} to ${si(result.max, 'Ω', 4)}` : 'Check the inputs'} method={<Method />}>
      <Notes kind="error" items={errors} />
      <Notes items={notes} />
      {result && actual && <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="Valid Pull-up Range">
          <div className="flex flex-wrap gap-8 px-2.5 py-3">
            <Big label="Minimum, sink/rise limit" value={si(result.min, 'Ω', 4)} unit="" />
            <Big label="Maximum, rise-time limit" value={si(result.max, 'Ω', 4)} unit="" />
          </div>
          <table className="tbl"><tbody>
            <Result label="Rise-time limit (30–70 %)" value={fmt(limits.riseNs)} unit="ns" />
            {limits.minRiseNs > 0 && <Result label="Minimum rise time" value={fmt(limits.minRiseNs)} unit="ns" />}
            <Result label="Bus-capacitance limit" value={fmt(limits.busPf)} unit="pF" />
            <Result label={`Suggested ${series} value`} value={preferred ? si(preferred, 'Ω') : 'None meets both limits'} sub="includes resistor tolerance" />
          </tbody></table>
          {preferred && <div className="px-3 py-2"><button className="btn" type="button" onClick={() => set({ resistance: preferred })}>Use suggested value</button></div>}
        </Panel>
        <Panel title="Selected Resistor Check">
          <div className="flex flex-wrap gap-8 px-2.5 py-3"><Big label="Selected resistor" value={si(p.resistance, 'Ω')} unit="" /><Big label="Nominal rise time" value={fmt(actual.riseNs, 4)} unit="ns" /></div>
          <table className="tbl"><tbody>
            <Result label="Worst-corner rise time" value={fmt(actual.worstRiseNs, 4)} unit="ns" sub="highest resistance" />
            {limits.minRiseNs > 0 && <Result label="Fastest-corner rise time" value={fmt(actual.fastestRiseNs, 4)} unit="ns" sub="lowest resistance" />}
            <Result label="Worst-corner sink current" value={fmt(actual.worstSinkMa, 4)} unit="mA" sub="lowest resistance, at entered VOL(max)" />
            <Result label="Maximum LOW-state resistor power" value={si(actual.maximumLowMw * 1e-3, 'W', 4)} sub="assumes the line is pulled near 0 V" />
            <Result label="Rise-time check" value={actual.worstRiseNs <= limits.riseNs && actual.fastestRiseNs >= limits.minRiseNs ? 'Within limits' : actual.fastestRiseNs < limits.minRiseNs ? 'Too fast' : 'Too slow'} strong />
            <Result label="Sink-current check" value={actual.worstSinkMa <= p.sink ? 'Within limit' : 'Too much current'} strong />
          </tbody></table>
          <p className="px-3 py-2 text-faint">Calculate SDA and SCL separately if their capacitances or weakest drivers differ. Include any pull-ups already fitted by modules as a parallel resistance.</p>
        </Panel>
      </div>}
    </ToolPage>
  );
}

function Method() {
  return <>
    <h2>Method</h2>
    <p>For a passive open-drain pull-up, the sink-current minimum is (VDD − VOL(max)) / IOL and the rise-time maximum is t<sub>r,max</sub> / (0.8473 × C<sub>b</sub>). Fast-mode also has a 20 ns minimum rise time, which can raise the resistance minimum on a very low-capacitance bus. The 0.8473 factor converts an RC time constant to a 30–70 % rising edge. A nominal resistor must keep its low-tolerance corner above the minimum and its high-tolerance corner below the maximum.</p>
    <p>Sink current is calculated at VOL(max); maximum resistor power assumes the line is pulled near 0 V. The actual LOW level depends on the device's output characteristic. Leakage, level shifters, active pull-ups and parallel pull-ups can change the result. Verify the weakest device's datasheet and the bus capacitance.</p>
    <h2>References</h2><ol>
      <li><a href="https://www.nxp.com/docs/en/user-guide/UM10204.pdf" target="_blank" rel="noreferrer">NXP UM10204, I²C-bus specification and user manual</a>, Standard, Fast and Fast-mode Plus timing and electrical limits.</li>
      <li><a href="https://www.ti.com/lit/pdf/slva689" target="_blank" rel="noreferrer">Texas Instruments SLVA689, I²C Bus Pullup Resistor Calculation</a>, equations and design example.</li>
    </ol>
  </>;
}
