import { Link } from 'react-router-dom';
import { SiField } from '../components/SiField';
import { ToolPage } from '../components/ToolPage';
import { Big, Check, LenField, Notes, NumField, Panel, Result, Section, SelectField } from '../components/ui';
import type { ESeries } from '../lib/electronics';
import { I2C_LIMITS, i2cBusCapacitance, i2cPullup, type I2cMode, type I2cTraceModel } from '../lib/newCalculators';
import { fmt, si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = {
  mode: 'fast', vdd: 3.3, cap: 200, capSource: 'manual', traceModel: 'microstrip', traceMm: 100, widthMm: 0.2, planeGapMm: 0.2, copperUm: 35, er: 4.2,
  knownPfCm: 1.5, pinCount: 4, pinPf: 10, cableMm: 0, cablePfPerM: 50, extraPf: 0, vol: 0.4, sink: 3, resistance: 1500, tolerance: 1, series: 'E24',
};
const MODES: { value: I2cMode; label: string }[] = [
  { value: 'standard', label: 'Standard (100 kHz)' },
  { value: 'fast', label: 'Fast (400 kHz)' },
  { value: 'fastPlus', label: 'Fast Plus (1 MHz)' },
];

export default function I2cPullup() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const mode: I2cMode = p.mode === 'standard' || p.mode === 'fastPlus' ? p.mode : 'fast';
  const series: ESeries = p.series === 'E12' || p.series === 'E96' ? p.series : 'E24';
  const capSource = p.capSource === 'estimate' ? 'estimate' : 'manual';
  const traceModel: I2cTraceModel = p.traceModel === 'stripline' || p.traceModel === 'known' ? p.traceModel : 'microstrip';
  const estimate = i2cBusCapacitance({
    model: traceModel, traceCm: p.traceMm / 10, widthMm: p.widthMm, planeGapMm: p.planeGapMm, copperUm: p.copperUm, er: p.er, knownPfCm: p.knownPfCm,
    pinCount: p.pinCount, pinPf: p.pinPf, cableCm: p.cableMm / 10, cablePfPerM: p.cablePfPerM, extraPf: p.extraPf,
  });
  const busCapPf = capSource === 'estimate' ? estimate?.totalPf ?? 0 : p.cap;
  const limits = I2C_LIMITS[mode];
  const errors: string[] = [];
  if (!(p.vdd > 0)) errors.push('Bus supply must be greater than 0 V.');
  if (capSource === 'manual' && !(p.cap > 0)) errors.push('Bus capacitance must be greater than 0 pF.');
  if (capSource === 'estimate' && (!estimate || !(busCapPf > 0))) errors.push('Enter valid trace, pin and cable values that produce a bus capacitance above 0 pF. Pin count must be a whole number.');
  if (!(p.vol >= 0 && p.vol < p.vdd)) errors.push('VOL(max) must be at least 0 V and below the bus supply.');
  if (!(p.sink > 0)) errors.push('Weakest device sink capability must be greater than 0 mA.');
  if (!(p.resistance > 0)) errors.push('Selected pull-up resistance must be greater than 0 Ω.');
  if (!(p.tolerance >= 0 && p.tolerance < 100)) errors.push('Resistor tolerance must be between 0 and 100 %.');
  const result = errors.length ? null : i2cPullup(p.vdd, busCapPf, p.vol, p.sink, mode, series, p.tolerance);
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
    <ToolPage title="I²C Pull-up Calculator" description="Size the pull-up on each SDA or SCL line from bus capacitance, rise-time limit and the weakest device's LOW-level sink capability. Estimate the capacitance from the board and connected pins if needed." onReset={reset}
      properties={<>
        <Section title="I²C bus">
          <SelectField label="Mode" value={mode} onChange={v => set({ mode: v, sink: v === 'fastPlus' ? 20 : 3 })} options={MODES} />
          <NumField label="Bus supply" symbol="VDD" value={p.vdd} onChange={v => set({ vdd: v })} unit="V" />
          <Check label="Estimate bus capacitance" checked={capSource === 'estimate'} onChange={enabled => set({ capSource: enabled ? 'estimate' : 'manual' })} hint="When off, enter the total capacitance per line yourself. When on, calculate it from the board and connected devices below." />
          {capSource === 'manual' ? <NumField label="Capacitance per line" symbol="Cb" value={p.cap} onChange={v => set({ cap: v })} unit="pF" hint="Include all device pins, PCB trace branches, connectors and cable on one SDA or SCL line." /> : <p className="text-faint">Estimated capacitance: {fmt(busCapPf, 5)} pF per line.</p>}
        </Section>
        <Section title="Weakest device">
          <NumField label="Maximum LOW voltage" symbol="VOL" value={p.vol} onChange={v => set({ vol: v })} unit="V" allowZero />
          <NumField label="Sink capability" symbol="IOL" value={p.sink} onChange={v => set({ sink: v })} unit="mA" hint="Use the smallest guaranteed sink current among devices driving this line LOW." />
        </Section>
        <Section title="Resistor">
          <SiField label="Selected pull-up" symbol="Rp" value={p.resistance} onChange={v => set({ resistance: v })} unit="Ω" prefixes={['m', '', 'k', 'M']} />
          <NumField label="Resistor tolerance" value={p.tolerance} onChange={v => set({ tolerance: v })} unit="%" allowZero />
          <SelectField label="Preferred values" value={series} onChange={v => set({ series: v })} options={['E12', 'E24', 'E96'].map(x => ({ value: x as ESeries, label: x }))} />
        </Section>
      </>}
      status={result ? `${limits.label}, Cb ${fmt(busCapPf, 4)} pF: ${si(result.min, 'Ω', 4)} to ${si(result.max, 'Ω', 4)}` : 'Check the inputs'} method={<Method />}>
      <Notes kind="error" items={errors} />
      <Notes items={notes} />
      {capSource === 'estimate' && <CapacitanceEstimate p={p} set={set} model={traceModel} estimate={estimate} limitPf={limits.busPf} />}
      {result && actual && <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="Valid Pull-up Range">
          <div className="flex flex-wrap gap-8 px-2.5 py-3">
            <Big label="Minimum, sink/rise limit" value={si(result.min, 'Ω', 4)} unit="" />
            <Big label="Maximum, rise-time limit" value={si(result.max, 'Ω', 4)} unit="" />
          </div>
          <table className="tbl"><tbody>
            <Result label="Bus capacitance used" value={fmt(busCapPf, 5)} unit="pF" sub={capSource === 'estimate' ? 'from the live estimate' : 'entered total per line'} />
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

function CapacitanceEstimate({ p, set, model, estimate, limitPf }: {
  p: typeof DEFAULTS;
  set: (patch: Partial<typeof DEFAULTS>) => void;
  model: I2cTraceModel;
  estimate: ReturnType<typeof i2cBusCapacitance>;
  limitPf: number;
}) {
  return <Panel title="Estimate Capacitance on One Bus Line">
    <p className="px-3 pt-2 text-muted">Add every branch of either SDA or SCL. Enter pin capacitance from the devices' datasheets and include any cable, connectors, ESD parts or level shifters connected to that net. The total below feeds the pull-up calculation immediately.</p>
    <div className="grid gap-5 border-b border-line px-3 py-3 xl:grid-cols-2">
      <div className="space-y-1">
        <h3 className="pb-1 font-semibold">PCB Trace</h3>
        <SelectField label="Capacitance model" value={model} onChange={v => set({ traceModel: v })} options={[
          { value: 'microstrip', label: 'Surface microstrip' },
          { value: 'stripline', label: 'Internal stripline' },
          { value: 'known', label: 'Known pF/cm' },
        ]} />
        <LenField label="All trace branches" value={p.traceMm} onChange={v => set({ traceMm: v })} units={['mm', 'cm', 'mil', 'in']} allowZero hint="Sum the copper length of every branch on this one bus net, not just the longest path." />
        {model === 'known' ? <NumField label="Trace capacitance" value={p.knownPfCm} onChange={v => set({ knownPfCm: v })} unit="pF/cm" hint="Use a fabricator or field-solver value for this trace geometry." /> : <>
          <LenField label="Trace width" value={p.widthMm} onChange={v => set({ widthMm: v })} />
          <LenField label={model === 'stripline' ? 'Gap to each plane' : 'Gap to reference plane'} value={p.planeGapMm} onChange={v => set({ planeGapMm: v })} hint={model === 'stripline' ? 'Symmetric stripline: distance from each trace surface to its adjacent plane.' : 'Dielectric thickness from the trace bottom to a continuous reference plane.'} />
          <NumField label="Copper thickness" value={p.copperUm} onChange={v => set({ copperUm: v })} unit="µm" allowZero />
          <NumField label="Laminate Dk" symbol="εr" value={p.er} onChange={v => set({ er: v })} min={1} allowZero />
        </>}
        <p className="pt-1 text-faint">{model === 'microstrip' ? 'Unmasked surface trace above a continuous plane; solder mask and adjacent copper can change the actual value.' : model === 'stripline' ? 'Trace centred between two continuous planes in one uniform dielectric.' : <>For a detailed stackup, use the <Link to="/impedance">impedance calculator</Link>: multiply its pF/mm result by 10 to enter pF/cm here.</>}</p>
      </div>
      <div className="space-y-1">
        <h3 className="pb-1 font-semibold">Devices, Cable &amp; Other Loads</h3>
        <NumField label="Connected pins on this line" value={p.pinCount} onChange={v => set({ pinCount: v })} allowZero hint="Count the controller and all targets attached to this one SDA or SCL net." />
        <NumField label="Capacitance per pin" value={p.pinPf} onChange={v => set({ pinPf: v })} unit="pF" allowZero hint="Use the maximum pin capacitance from the device datasheets; 10 pF is a starting example." />
        <LenField label="Cable length" value={p.cableMm} onChange={v => set({ cableMm: v })} units={['mm', 'cm', 'in']} allowZero />
        <NumField label="Cable capacitance" value={p.cablePfPerM} onChange={v => set({ cablePfPerM: v })} unit="pF/m" allowZero hint="Use the cable datasheet value. The 50 pF/m default is only a placeholder." />
        <NumField label="Other capacitance" value={p.extraPf} onChange={v => set({ extraPf: v })} unit="pF" allowZero hint="Sum connector, ESD, level-shifter and other net capacitances from datasheets." />
        <p className="pt-1 text-faint">If pin values differ, use a suitable per-pin value and add the remaining difference to Other capacitance. A buffer or switch can split the bus into separate capacitive segments.</p>
      </div>
    </div>
    {estimate && <>
      <div className="flex flex-wrap gap-8 px-3 py-3"><Big label="Estimated capacitance, one line" value={fmt(estimate.totalPf, 5)} unit="pF" /><Big label="Of mode limit" value={fmt(100 * estimate.totalPf / limitPf, 4)} unit="%" /></div>
      <table className="tbl"><tbody>
        <Result label="PCB trace" value={fmt(estimate.tracePf, 5)} unit="pF" sub={`${fmt(estimate.tracePfCm, 4)} pF/cm × ${fmt(p.traceMm / 10, 5)} cm`} />
        <Result label="Connected device pins" value={fmt(estimate.pinsPf, 5)} unit="pF" sub={`${p.pinCount} × ${fmt(p.pinPf, 4)} pF`} />
        <Result label="Cable" value={fmt(estimate.cablePf, 5)} unit="pF" sub={`${fmt(p.cableMm / 10, 5)} cm at ${fmt(p.cablePfPerM, 5)} pF/m`} />
        <Result label="Other parts" value={fmt(estimate.extraPf, 5)} unit="pF" />
        {estimate.lineZ0 !== null && <Result label="Trace-model impedance" value={fmt(estimate.lineZ0, 4)} unit="Ω" sub="used only to derive trace capacitance per length" />}
      </tbody></table>
    </>}
    <p className="px-3 py-2 text-faint">This is an engineering estimate. Verify pin and cable values from datasheets; measure the assembled bus rise time if the design is close to a timing limit.</p>
  </Panel>;
}

function Method() {
  return <>
    <h2>Method</h2>
    <p>Bus capacitance is calculated for one SDA or SCL net: C<sub>b</sub> = C<sub>trace</sub> + ΣC<sub>pin</sub> + C<sub>cable</sub> + C<sub>other</sub>. Count all branches of the net. The PCB trace term is its total length times capacitance per unit length. The manual option accepts a measured or otherwise known total.</p>
    <p>For the geometry estimate, the existing Hammerstad–Jensen microstrip or Wheeler symmetric-stripline approximation gives trace impedance Z0 and effective dielectric constant ε<sub>eff</sub>. Capacitance per metre follows from C′ = √ε<sub>eff</sub> / (c·Z0). The microstrip approximation omits solder mask; both models assume uniform geometry and continuous reference planes. The known pF/cm option lets a fabricator or field-solver value replace this approximation.</p>
    <p>For a passive open-drain pull-up, the sink-current minimum is (VDD − VOL(max)) / IOL and the rise-time maximum is t<sub>r,max</sub> / (0.8473 × C<sub>b</sub>). Fast-mode also has a 20 ns minimum rise time, which can raise the resistance minimum on a very low-capacitance bus. The 0.8473 factor converts an RC time constant to a 30–70 % rising edge. A nominal resistor must keep its low-tolerance corner above the minimum and its high-tolerance corner below the maximum.</p>
    <p>Sink current is calculated at VOL(max); maximum resistor power assumes the line is pulled near 0 V. The actual LOW level depends on the device's output characteristic. Leakage, level shifters, active pull-ups and parallel pull-ups can change the result. Verify the weakest device's datasheet and the bus capacitance.</p>
    <h2>References</h2><ol>
      <li><a href="https://www.nxp.com/docs/en/user-guide/UM10204.pdf" target="_blank" rel="noreferrer">NXP UM10204, I²C-bus specification and user manual</a>, Standard, Fast and Fast-mode Plus timing and electrical limits.</li>
      <li><a href="https://www.ti.com/lit/pdf/slva689" target="_blank" rel="noreferrer">Texas Instruments SLVA689, I²C Bus Pullup Resistor Calculation</a>, equations and design example.</li>
      <li>E. Hammerstad and Ø. Jensen, “Accurate Models for Microstrip Computer-Aided Design,” IEEE MTT-S International Microwave Symposium, 1980; H. A. Wheeler, “Transmission-Line Properties of a Strip Line Between Parallel Planes,” IEEE Transactions on Microwave Theory and Techniques, 1978.</li>
    </ol>
  </>;
}
