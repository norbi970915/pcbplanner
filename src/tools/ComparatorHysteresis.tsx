import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { SiField } from '../components/SiField';
import { ToolPage } from '../components/ToolPage';
import { Big, Notes, NumField, Panel, Result, Section, SelectField } from '../components/ui';
import { analyseHysteresis, designHysteresis, type ComparatorTopology, type HysteresisAnalysis, type HysteresisCircuit } from '../lib/comparatorHysteresis';
import type { ESeries } from '../lib/electronics';
import { fmt, si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = {
  topology: 'inverting', mode: 'design', rising: 2.7, falling: 2.3, resistance: 10000, feedback: 115000, reference: 2.5,
  outputHigh: 5, outputLow: 0, tolerance: 1, offset: 0.003, referenceError: 0.005, series: 'E96',
};
const rangeText = (range: [number, number]) => `${fmt(range[0], 6)} to ${fmt(range[1], 6)} V`;

export default function ComparatorHysteresis() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const [resetKey, setResetKey] = useState(0);
  const topology: ComparatorTopology = p.topology === 'noninverting' ? 'noninverting' : 'inverting';
  const mode = p.mode === 'analyse' ? 'analyse' : 'design';
  const series: ESeries = p.series === 'E12' || p.series === 'E24' ? p.series : 'E96';
  const base = { topology, resistance: p.resistance, outputHigh: p.outputHigh, outputLow: p.outputLow,
    tolerancePct: p.tolerance, offsetVolts: p.offset, referenceErrorVolts: p.referenceError };
  const errors: string[] = [];
  let design: ReturnType<typeof designHysteresis> | null = null;
  let result: HysteresisAnalysis | null = null;
  let circuit: HysteresisCircuit | null = null;
  try {
    if (mode === 'design') {
      design = designHysteresis({ ...base, targetRising: p.rising, targetFalling: p.falling, series });
      circuit = design.standardCircuit;
      result = design.standard;
    } else {
      circuit = { ...base, feedback: p.feedback, reference: p.reference };
      result = analyseHysteresis(circuit);
    }
  } catch (e) { errors.push(e instanceof Error ? e.message : 'Unable to calculate these thresholds.'); }
  const notes = result ? [
    ...(result.fallingRange[1] >= result.risingRange[0] ? ['The threshold tolerance bands overlap across devices. This does not mean one device has negative hysteresis; check whether your required switching limits still hold.'] : []),
    'Use the loaded output HIGH and LOW voltages from the comparator datasheet. The reference is a stiff voltage source; divider impedance must be included in the reference resistor for an inverting circuit.',
  ] : [];

  return <ToolPage title="Comparator Hysteresis Calculator"
    description="Design or analyse inverting and non-inverting comparator thresholds, with standard resistor values, reference voltage and worst-case resistor, offset and reference bounds."
    onReset={() => { reset(); setResetKey(k => k + 1); }}
    status={result ? `Rising ${fmt(result.rising, 5)} V · falling ${fmt(result.falling, 5)} V · hysteresis ${si(result.width, 'V', 4)}` : 'Check the inputs'}
    method={<Method />}
    properties={<div key={resetKey}>
      <Section title="Circuit">
        <SelectField label="Topology" value={topology} onChange={topology => set({ topology })} options={[{ value: 'inverting', label: 'Inverting' }, { value: 'noninverting', label: 'Non-inverting' }]} />
        <SelectField label="Calculate" value={mode} onChange={mode => set({ mode })} options={[{ value: 'design', label: 'Design thresholds' }, { value: 'analyse', label: 'Analyse resistors' }]} />
        <NumField label="Output HIGH" value={p.outputHigh} onChange={outputHigh => set({ outputHigh })} unit="V" allowNegative hint="Actual loaded VOH, not automatically the positive supply rail." />
        <NumField label="Output LOW" value={p.outputLow} onChange={outputLow => set({ outputLow })} unit="V" allowNegative />
        <p className="text-faint">Illustrative defaults; no comparator part is selected.</p>
      </Section>
      {mode === 'design' && <Section title="Target thresholds">
        <NumField label="Rising input threshold" value={p.rising} onChange={rising => set({ rising })} unit="V" allowNegative />
        <NumField label="Falling input threshold" value={p.falling} onChange={falling => set({ falling })} unit="V" allowNegative />
        <SelectField label="Preferred resistors" value={series} onChange={series => set({ series })} options={['E12', 'E24', 'E96'].map(value => ({ value, label: value }))} />
      </Section>}
      <Section title={mode === 'design' ? 'Resistor scale' : 'Components'}>
        <SiField label={topology === 'inverting' ? 'Reference resistor' : 'Input resistor'} symbol="R" value={p.resistance} onChange={resistance => set({ resistance })} unit="Ω" prefixes={['', 'k', 'M']} hint={topology === 'inverting' ? 'Effective resistance from a stiff Vref to IN+, including a reference divider’s Thevenin resistance.' : 'Total series resistance from Vin to IN+, including source resistance.'} />
        {mode === 'analyse' && <>
          <SiField label="Feedback resistor" symbol="RF" value={p.feedback} onChange={feedback => set({ feedback })} unit="Ω" prefixes={['', 'k', 'M']} />
          <NumField label="Reference voltage" value={p.reference} onChange={reference => set({ reference })} unit="V" allowNegative />
        </>}
      </Section>
      <Section title="Accuracy bounds">
        <NumField label="Resistor tolerance" value={p.tolerance} onChange={tolerance => set({ tolerance })} unit="%" allowZero hint="Independent bounds on both effective resistors. Preferred series and tolerance are separate choices." />
        <SiField label="Input offset bound" value={p.offset} onChange={offset => set({ offset })} unit="V" prefixes={['µ', 'm', '']} allowZero hint="Absolute maximum input offset at your operating conditions; treated as constant between transitions." />
        <SiField label="Reference uncertainty" value={p.referenceError} onChange={referenceError => set({ referenceError })} unit="V" prefixes={['µ', 'm', '']} allowZero hint="Absolute bound on the stiff reference voltage. Output levels stay fixed in this calculation." />
      </Section>
    </div>}>
    <Notes kind="error" items={errors} /><Notes items={notes} />
    {design && <Panel title={`Resistors for the target (${series})`}>
      <table className="tbl"><thead><tr><th>Quantity</th><th className="v">Exact</th><th className="v">Standard resistors</th></tr></thead><tbody>
        <tr><td>{topology === 'inverting' ? 'Reference resistor R' : 'Input resistor R'}</td><td className="v">{si(design.exactCircuit.resistance, 'Ω', 5)}</td><td className="v">{si(design.standardCircuit.resistance, 'Ω', 5)}</td></tr>
        <tr><td>Feedback resistor RF</td><td className="v">{si(design.exactCircuit.feedback, 'Ω', 5)}</td><td className="v">{si(design.standardCircuit.feedback, 'Ω', 5)}</td></tr>
        <tr><td>Required stiff reference</td><td className="v">{fmt(design.exactCircuit.reference, 6)} V</td><td className="v">{fmt(design.standardCircuit.reference, 6)} V</td></tr>
        <tr><td>Rising input threshold</td><td className="v">{fmt(design.exact.rising, 6)} V</td><td className="v">{fmt(design.standard.rising, 6)} V</td></tr>
        <tr><td>Falling input threshold</td><td className="v">{fmt(design.exact.falling, 6)} V</td><td className="v">{fmt(design.standard.falling, 6)} V</td></tr>
      </tbody></table>
      <p className="px-3 py-2 text-muted">The reference stays at its calculated value when resistors are rounded. Choose a reference that can supply this voltage and current, then analyse the values you can actually build.</p>
      <div className="px-3 pb-3"><button className="btn" type="button" onClick={() => set({ mode: 'analyse', resistance: design!.standardCircuit.resistance, feedback: design!.standardCircuit.feedback, reference: design!.standardCircuit.reference })}>Analyse these values</button></div>
    </Panel>}
    {result && circuit && <>
      <Panel title="Switching thresholds">
        <div className="flex flex-wrap gap-8 px-3 py-3"><Big label="Rising input" value={fmt(result.rising, 5)} unit="V" /><Big label="Falling input" value={fmt(result.falling, 5)} unit="V" /><Big label="Hysteresis" value={si(result.width, 'V', 5)} unit="" /></div>
        <table className="tbl"><tbody>
          <Result label="Output at rising threshold" value={topology === 'inverting' ? 'HIGH → LOW' : 'LOW → HIGH'} />
          <Result label="Output at falling threshold" value={topology === 'inverting' ? 'LOW → HIGH' : 'HIGH → LOW'} />
          <Result label="Rising threshold bounds" value={rangeText(result.risingRange)} />
          <Result label="Falling threshold bounds" value={rangeText(result.fallingRange)} />
          <Result label="Hysteresis width bounds" value={rangeText(result.widthRange)} sub="One device, constant offset/reference; resistor corners only." />
          <Result label="Maximum feedback current at a trip" value={si(result.tripFeedbackAmps, 'A', 5)} sub="Nominal resistors and output levels; excludes other output loads." />
        </tbody></table>
        <TransferPlot result={result} circuit={circuit} />
      </Panel>
      <Panel title="Circuit connections">
        <CircuitDiagram topology={topology} />
        <p className="px-3 pb-3 text-muted">Between the falling and rising thresholds the output retains its previous state. Check input common-mode range, input bias current, intrinsic hysteresis and output drive separately. Open-drain pull-up loading is not solved by this fixed-output-level model.</p>
        <p className="px-3 pb-3"><Link to="/logic-levels">Check the output’s logic-level compatibility</Link> · <Link to="/resistors">Choose a reference divider</Link></p>
      </Panel>
    </>}
  </ToolPage>;
}

function CircuitDiagram({ topology }: { topology: ComparatorTopology }) {
  const inverting = topology === 'inverting';
  return <svg viewBox="0 0 560 200" className="block w-full max-w-[640px]" role="img" aria-label={inverting ? 'Vin to IN−; Vref through R to IN+; output through RF to IN+.' : 'Vin through R to IN+; Vref to IN−; output through RF to IN+.'}>
    <g stroke="var(--muted)" fill="none" strokeWidth="1.5">
      <path d="M290 65 L290 155 L375 110 Z M375 110 H490 M455 110 V25 H350 M285 25 H250 V87 H290 M70 87 H130 M205 87 H290 M70 132 H290" />
      <rect x="130" y="79" width="75" height="16" /><rect x="285" y="17" width="65" height="16" />
    </g>
    <circle cx="250" cy="87" r="3" fill="var(--accent)" />
    <g fill="var(--ink)" fontSize="13"><text x="18" y="91">{inverting ? 'Vref' : 'Vin'}</text><text x="18" y="136">{inverting ? 'Vin' : 'Vref'}</text><text x="300" y="92">+</text><text x="300" y="137">−</text><text x="157" y="69">R</text><text x="307" y="52">RF</text><text x="490" y="114">Vout</text></g>
    <text x="20" y="183" fill="var(--muted)" fontSize="12">Vref is a stiff reference. RF always returns to IN+.</text>
  </svg>;
}

function TransferPlot({ result: r, circuit: c }: { result: HysteresisAnalysis; circuit: HysteresisCircuit }) {
  const id = useId().replace(/:/g, '');
  const span = Math.max(r.risingRange[1] - r.fallingRange[0], r.width, 1e-6);
  const lo = Math.min(r.falling, r.fallingRange[0]) - span * 0.25, hi = Math.max(r.rising, r.risingRange[1]) + span * 0.25;
  const x = (v: number) => 65 + 490 * (v - lo) / (hi - lo);
  const inv = c.topology === 'inverting', yh = 35, yl = 115;
  return <svg viewBox="0 0 640 185" className="block w-full max-w-[740px]" role="img" aria-label="Static hysteresis transfer curve. Blue follows a rising input; copper follows a falling input.">
    <defs><marker id={`rise-${id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="var(--accent)" /></marker><marker id={`fall-${id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="var(--copper)" /></marker></defs>
    <g stroke="var(--line)"><line x1="65" y1="20" x2="65" y2="125" /><line x1="65" y1="125" x2="555" y2="125" /><line x1={x(r.falling)} y1="20" x2={x(r.falling)} y2="125" strokeDasharray="3 3" /><line x1={x(r.rising)} y1="20" x2={x(r.rising)} y2="125" strokeDasharray="3 3" /></g>
    <polyline points={`65,${inv ? yh : yl} ${x(r.rising)},${inv ? yh : yl} ${x(r.rising)},${inv ? yl : yh} 555,${inv ? yl : yh}`} fill="none" stroke="var(--accent)" strokeWidth="2" markerEnd={`url(#rise-${id})`} />
    <polyline points={`555,${inv ? yl : yh} ${x(r.falling)},${inv ? yl : yh} ${x(r.falling)},${inv ? yh : yl} 65,${inv ? yh : yl}`} fill="none" stroke="var(--copper)" strokeDasharray="6 3" strokeWidth="2" markerEnd={`url(#fall-${id})`} />
    <g fill="var(--muted)" fontSize="11"><text x="5" y={yh + 4}>{fmt(c.outputHigh, 4)} V</text><text x="5" y={yl + 4}>{fmt(c.outputLow, 4)} V</text><text x={x(r.falling)} y="145" textAnchor="middle">{fmt(r.falling, 4)} V</text><text x={x(r.rising)} y="160" textAnchor="middle">{fmt(r.rising, 4)} V</text><text x="575" y="128">Vin</text></g>
    <text x="65" y="178" fill="var(--accent)" fontSize="11">Rising input →</text><text x="240" y="178" fill="var(--copper)" fontSize="11">← Falling input</text>
  </svg>;
}

export function Method() {
  return <>
    <h2>Threshold equations</h2>
    <p>The circuit uses a stiff reference Vref, an effective resistor R and a feedback resistor RF from Vout to IN+. Input bias current and intrinsic hysteresis are zero in this model. The entered VOH and VOL are constant loaded output voltages.</p>
    <p>Inverting: Vin connects to IN−; R connects Vref to IN+. With k = R/RF, VH = (Vref + k·VOH)/(1 + k) and VL = (Vref + k·VOL)/(1 + k). A reference divider can be replaced by its Thevenin voltage and resistance; include that resistance in R.</p>
    <p>Non-inverting: R connects Vin to IN+ and Vref connects to IN−. VH = Vref(1 + k) − k·VOL and VL = Vref(1 + k) − k·VOH. Include any source resistance in R. The reference is assumed unloaded at IN−.</p>
    <h2>Design and bounds</h2>
    <p>Let b = (VH − VL)/(VOH − VOL). Inverting design requires 0 &lt; b &lt; 1: RF = R(1 − b)/b and Vref = (VL − b·VOL)/(1 − b). Non-inverting: RF = R/b and Vref = (VH + b·VOL)/(1 + b). The standard resistors are independently rounded to the nearest selected E-series value; their calculated thresholds use the exact reference voltage.</p>
    <p>Independent resistor corners, ±reference uncertainty and ±constant input offset are evaluated. Switching is defined by IN+ = IN− + Vos. Each threshold band is an independent bound across devices. Hysteresis width is evaluated with the same offset/reference for both transitions, so those constant terms cancel. Output-voltage uncertainty, intrinsic hysteresis, bias-current error, reference-divider component correlations, propagation delay and dynamic output loading are excluded. Use worst-case loaded output levels and check the comparator’s common-mode and supply limits. Open-drain circuits need a pull-up/loading model beyond this calculation.</p>
    <h2>References</h2><ol>
      <li><a href="https://www.ti.com/lit/ds/symlink/tlv3201.pdf" target="_blank" rel="noreferrer">TI TLV3201/TLV3202, SBOS561C, §8.1.2</a>: inverting and non-inverting external hysteresis networks; Figure 8-5 provides the 330 kΩ / 1 MΩ, 2.5 V reference example.</li>
      <li><a href="https://www.ti.com/lit/an/sboa219b/sboa219b.pdf" target="_blank" rel="noreferrer">TI SBOA219B, Comparator With and Without Hysteresis Circuit</a>: positive feedback, threshold accuracy and noise at a switching point.</li>
      <li>IEC 60063, preferred number series. Series selection does not specify resistor tolerance.</li>
    </ol>
  </>;
}
