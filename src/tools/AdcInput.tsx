import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SiField } from '../components/SiField';
import { ToolPage } from '../components/ToolPage';
import { Big, Check, Notes, NumField, Panel, Result, Section } from '../components/ui';
import { calculateAdcInput, type AdcInputResult } from '../lib/adcInput';
import { fmt, si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = {
  divider: false, sourceOhms: 1000, topOhms: 10000, bottomOhms: 10000,
  filterOhms: 100, filterFarads: 100e-12, switchOhms: 500, sampleFarads: 10e-12,
  acquisitionSeconds: 1e-6, resolutionBits: 12, referenceVolts: 3.3, stepVolts: 3.3,
  checkRecovery: false, recoverySeconds: 10e-6,
};

export default function AdcInput() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const [resetKey, setResetKey] = useState(0);
  const validDivider = !p.divider || (p.topOhms > 0 && p.bottomOhms > 0 && Number.isFinite(p.topOhms) && Number.isFinite(p.bottomOhms));
  const sourceOhms = p.divider && validDivider ? p.topOhms * p.bottomOhms / (p.topOhms + p.bottomOhms) : p.sourceOhms;
  const result: AdcInputResult = validDivider ? calculateAdcInput({
    sourceOhms, filterOhms: p.filterOhms, filterFarads: p.filterFarads, switchOhms: p.switchOhms,
    sampleFarads: p.sampleFarads, acquisitionSeconds: p.acquisitionSeconds, resolutionBits: p.resolutionBits,
    referenceVolts: p.referenceVolts, stepVolts: p.stepVolts, recoverySeconds: p.checkRecovery ? p.recoverySeconds : null,
  }) : { ok: false, errors: ['Both divider resistors must be greater than 0 Ω.'] };
  const failures = result.ok ? [
    ...(!result.acquisitionPass ? ['The sample capacitor does not settle to within ½ LSB in the available acquisition time. Increase acquisition time, reduce resistance, or use a suitable buffer.'] : []),
    ...(result.recoveryPass === false ? ['The filter node does not recover to within ½ LSB in the entered interval. Reduce the source/filter time constant or allow more time.'] : []),
  ] : result.errors;
  const notes = result.ok ? [
    ...(p.checkRecovery && result.recoveryPass === null ? ['No filter-node recovery calculation is needed when there is no shunt capacitor or the source is ideal.'] : []),
    'This is a first-order SAR ADC estimate for one worst-case voltage step. Confirm the input model and timing against the chosen ADC datasheet.',
  ] : [];

  return <ToolPage title="ADC Input Settling Checker"
    description="Check whether a source, optional RC input filter and SAR ADC sampling capacitor settle within the acquisition window."
    onReset={() => { reset(); setResetKey(key => key + 1); }}
    status={result.ok ? `${result.acquisitionPass ? 'Acquisition meets' : 'Acquisition misses'} ½ LSB · needs ${si(result.requiredSeconds, 's', 4)}` : 'Check the inputs'}
    method={<Method />}
    properties={<div key={resetKey}>
      <Section title="Signal source">
        <Check label="Use resistor-divider source" checked={p.divider} onChange={divider => set({ divider })} />
        {p.divider ? <>
          <SiField label="Divider top" value={p.topOhms} onChange={topOhms => set({ topOhms })} unit="Ω" prefixes={['', 'k', 'M']} />
          <SiField label="Divider bottom" value={p.bottomOhms} onChange={bottomOhms => set({ bottomOhms })} unit="Ω" prefixes={['', 'k', 'M']} />
          {validDivider && <p className="text-faint">Thevenin source resistance: {si(sourceOhms, 'Ω', 5)} (Rtop ∥ Rbottom).</p>}
        </> : <SiField label="Source resistance" value={p.sourceOhms} onChange={sourceOhms => set({ sourceOhms })} unit="Ω" prefixes={['', 'k', 'M']} allowZero hint="Thevenin resistance of the sensor, driver or divider at the ADC input." />}
      </Section>
      <Section title="Input filter">
        <SiField label="Series resistor" value={p.filterOhms} onChange={filterOhms => set({ filterOhms })} unit="Ω" prefixes={['', 'k', 'M']} allowZero />
        <SiField label="Shunt capacitor" value={p.filterFarads} onChange={filterFarads => set({ filterFarads })} unit="F" prefixes={['p', 'n', 'µ', 'm']} allowZero hint="Capacitance at the ADC pin to ground, including significant pin/parasitic capacitance if known. Enter 0 for none." />
      </Section>
      <Section title="ADC sampling input">
        <SiField label="Switch resistance" value={p.switchOhms} onChange={switchOhms => set({ switchOhms })} unit="Ω" prefixes={['', 'k', 'M']} hint="ADC sample-and-hold switch on-resistance from the device input model." />
        <SiField label="Sample capacitor" value={p.sampleFarads} onChange={sampleFarads => set({ sampleFarads })} unit="F" prefixes={['p', 'n', 'µ']} hint="ADC sample-and-hold capacitance from the datasheet." />
        <SiField label="Acquisition window" value={p.acquisitionSeconds} onChange={acquisitionSeconds => set({ acquisitionSeconds })} unit="s" prefixes={['n', 'µ', 'm', '']} hint="Time the ADC sampling switch is closed, not the whole conversion period." />
        <NumField label="Resolution" value={p.resolutionBits} onChange={resolutionBits => set({ resolutionBits })} unit="bits" />
        <NumField label="Reference span" value={p.referenceVolts} onChange={referenceVolts => set({ referenceVolts })} unit="V" hint="Full-scale input span used for the ½ LSB target." />
        <NumField label="Worst-case step" value={p.stepVolts} onChange={stepVolts => set({ stepVolts })} unit="V" hint="Largest voltage difference between the previous sample capacitor state and the new channel." />
      </Section>
      <Section title="Between samples">
        <Check label="Check filter-node recovery" checked={p.checkRecovery} onChange={checkRecovery => set({ checkRecovery })} />
        {p.checkRecovery && <SiField label="Recovery interval" value={p.recoverySeconds} onChange={recoverySeconds => set({ recoverySeconds })} unit="s" prefixes={['n', 'µ', 'm', '']} allowZero hint="Time after the sampling switch opens before the next acquisition." />}
      </Section>
    </div>}>
    <Notes kind="error" items={failures} />
    <Notes items={notes} />
    {result.ok && <>
      <Panel title="Settling Result">
        <div className="flex flex-wrap gap-8 px-3 py-3">
          <Big label="Required acquisition" value={si(result.requiredSeconds, 's', 5)} unit="" />
          <Big label="Available acquisition" value={si(p.acquisitionSeconds, 's', 5)} unit="" />
          <Big label="Remaining error" value={fmt(result.errorLsb, 5)} unit="LSB" />
        </div>
        <table className="tbl"><tbody>
          <Result label="Acquisition result" value={result.acquisitionPass ? 'Within ½ LSB' : 'Exceeds ½ LSB'} strong />
          <Result label="Error on sample capacitor" value={si(result.errorVolts, 'V', 5)} sub={`${fmt(result.errorLsb, 5)} LSB at end of acquisition`} />
          <Result label="½ LSB target" value={si(result.halfLsbVolts, 'V', 5)} />
          <Result label="Source plus series resistance" value={si(result.totalOhms, 'Ω', 5)} />
          <Result label="External RC cutoff" value={result.filterCutoffHz === null ? 'No shunt RC filter' : si(result.filterCutoffHz, 'Hz', 5)} />
          {p.checkRecovery && <>
            <Result label="Pin recovery needed" value={result.recoveryRequiredSeconds === null ? 'Not applicable' : si(result.recoveryRequiredSeconds, 's', 5)} />
            <Result label="Pin error after interval" value={result.recoveryErrorLsb === null ? 'Not applicable' : `${fmt(result.recoveryErrorLsb, 5)} LSB`} />
          </>}
        </tbody></table>
      </Panel>
      <Panel title="Circuit Assumption">
        <p className="px-3 py-3 font-semibold">Source → R<sub>source</sub> → R<sub>filter</sub> → ADC pin (C<sub>filter</sub> to ground) → R<sub>ON</sub> → C<sub>sample</sub></p>
        <p className="px-3 pb-3 text-muted">The filter capacitor starts charged to the source voltage; the sample capacitor starts one entered step away. If channels are sampled repeatedly before the filter recovers, use the recovery check and verify with the device's input model.</p>
      </Panel>
      <Panel title="Continue the Design">
        <div className="flex flex-wrap gap-2 px-3 py-3">
          <Link className="btn no-underline" to="/rc-filter">Design the RC filter</Link>
          <Link className="btn no-underline" to="/resistors">Choose divider resistors</Link>
          <Link className="btn no-underline" to="/power-tree">Check supply rails</Link>
        </div>
      </Panel>
    </>}
  </ToolPage>;
}

export function Method() {
  return <>
    <h2>Method</h2>
    <p>The target is ½ LSB = V<sub>REF</sub> / 2<sup>N+1</sup> for an N-bit converter. The entered worst-case voltage step is applied between a fully settled ADC-pin capacitor and the previous sample-capacitor voltage. With no external shunt capacitor, the remaining step decays with τ = (R<sub>source</sub> + R<sub>filter</sub> + R<sub>ON</sub>) C<sub>sample</sub>.</p>
    <p>With a shunt capacitor, the calculator solves the two-node linear RC network during acquisition, including charge sharing through R<sub>ON</sub> and recharge through the source/filter resistance. It finds the minimum acquisition time for the sample-capacitor error to fall below ½ LSB. A divider's source resistance is R<sub>top</sub> ∥ R<sub>bottom</sub>.</p>
    <p>If recovery is enabled, the ADC-pin error at the end of acquisition is allowed to decay through (R<sub>source</sub> + R<sub>filter</sub>) C<sub>filter</sub> after the switch opens. This is a separate first-order check, not a full repeated-sample simulation. The model assumes an ideal source behind its entered resistance and does not include amplifier slew/settling, switch charge injection, leakage, input protection, noise, aliasing or a non-linear sampling switch. Check the chosen ADC's datasheet input model and timing.</p>
    <h2>References</h2><ol>
      <li><a href="https://www.ti.com/lit/an/sbaa178/sbaa178.pdf" target="_blank" rel="noreferrer">Texas Instruments SBAA178, Determining Minimum Acquisition Times for SAR ADCs</a>, input RC network and sample-capacitor settling.</li>
      <li><a href="https://www.ti.com/lit/an/spracz0/spracz0.pdf" target="_blank" rel="noreferrer">Texas Instruments SPRACZ0, Charge-Sharing Driving Circuits for C2000 ADCs</a>, charge sharing, filter capacitance and acquisition limits.</li>
    </ol>
  </>;
}
