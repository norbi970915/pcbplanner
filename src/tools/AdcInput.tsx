import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SiField } from '../components/SiField';
import { ToolPage } from '../components/ToolPage';
import { Big, Check, Notes, NumField, Panel, Result, Section } from '../components/ui';
import { calculateAdcInput, type AdcInputResult } from '../lib/adcInput';
import { adcAccuracy } from '../lib/adcAccuracy';
import { fmt, si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = {
  divider: false, sourceOhms: 1000, topOhms: 10000, bottomOhms: 10000,
  filterOhms: 100, filterFarads: 100e-12, switchOhms: 500, sampleFarads: 10e-12,
  acquisitionSeconds: 1e-6, resolutionBits: 12, referenceVolts: 3.3, stepVolts: 3.3,
  checkRecovery: false, recoverySeconds: 10e-6,
  checkAccuracy: false, signalVolts: 1.65, offsetVolts: 0.001, gainPct: 0.05, referencePct: 0.1, inlLsb: 1,
  quantisation: true, includeSettling: true,
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
  const rcLink = `/rc-filter?${new URLSearchParams({ kind: 'lowpass', mode: 'analyse', rs: String(sourceOhms), r: String(p.filterOhms), c: String(p.filterFarads) })}`;
  let accuracy: ReturnType<typeof adcAccuracy> | null = null;
  const accuracyErrors: string[] = [];
  if (p.checkAccuracy) {
    try {
      if (p.includeSettling && !result.ok) throw new RangeError('Valid settling inputs are needed to include acquisition error in the accuracy budget.');
      accuracy = adcAccuracy({ bits: p.resolutionBits, spanVolts: p.referenceVolts, signalVolts: p.signalVolts, offsetVolts: p.offsetVolts,
        gainPct: p.gainPct, referencePct: p.referencePct, inlLsb: p.inlLsb, quantisation: p.quantisation,
        settlingVolts: p.includeSettling && result.ok ? result.errorVolts : 0 });
    } catch (e) { accuracyErrors.push(e instanceof Error ? e.message : 'Unable to calculate the accuracy budget.'); }
  }

  return <ToolPage title="ADC Input Settling Checker"
    description="Check SAR ADC acquisition settling, with an optional DC accuracy budget for offset, gain, reference and INL at your signal voltage."
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
      <Section title="DC accuracy budget">
        <Check label="Enable accuracy budget" checked={p.checkAccuracy} onChange={checkAccuracy => set({ checkAccuracy })} />
        {p.checkAccuracy && <>
          <NumField label="Signal at ADC pin" value={p.signalVolts} onChange={signalVolts => set({ signalVolts })} unit="V" allowZero hint="Unipolar input, from 0 to the reference span. Uses the resolution and span above." />
          <SiField label="ADC offset bound" value={p.offsetVolts} onChange={offsetVolts => set({ offsetVolts })} unit="V" prefixes={['µ', 'm', '']} allowZero hint="Absolute maximum offset expressed in indicated volts at the nominal reference. Convert a datasheet LSB figure using span / 2^bits." />
          <NumField label="Gain error bound" value={p.gainPct} onChange={gainPct => set({ gainPct })} unit="%" allowZero hint="Slope error after offset removal, excluding reference error. A %FS gain specification is converted to the equivalent slope percentage." />
          <NumField label="Reference uncertainty" value={p.referencePct} onChange={referencePct => set({ referencePct })} unit="%" allowZero hint="Total independent reference bound, including relevant initial error and drift. Set to zero if already included in the ADC gain specification." />
          <NumField label="INL bound" value={p.inlLsb} onChange={inlLsb => set({ inlLsb })} unit="LSB" allowZero hint="Specified after offset/gain removal, at the nominal span. Use the definition and maximum from your ADC datasheet." />
          <Check label="Include ½ LSB quantisation" checked={p.quantisation} onChange={quantisation => set({ quantisation })} />
          <Check label="Include acquisition error above" checked={p.includeSettling} onChange={includeSettling => set({ includeSettling })} />
          <p className="text-faint">Illustrative defaults. Replace with maximum specifications for your ADC and reference. Noise, divider/amplifier errors and drift not entered here are excluded.</p>
        </>}
      </Section>
    </div>}>
    <Notes kind="error" items={failures} />
    <Notes items={notes} />
    <Notes kind="error" items={accuracyErrors} />
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
          <Link className="btn no-underline" to={p.filterOhms > 0 && p.filterFarads > 0 ? rcLink : '/rc-filter'}>{p.filterOhms > 0 && p.filterFarads > 0 ? 'Analyse this RC filter' : 'Design an RC filter'}</Link>
          <Link className="btn no-underline" to="/resistors">Choose divider resistors</Link>
          <Link className="btn no-underline" to="/power-tree">Check supply rails</Link>
        </div>
      </Panel>
    </>}
    {accuracy && <Panel title="DC Accuracy Budget">
      <div className="flex flex-wrap gap-8 px-3 py-3">
        <Big label="Worst-case bound" value={si(accuracy.worstVolts, 'V', 5)} unit="" />
        <Big label="In code steps" value={fmt(accuracy.worstLsb, 5)} unit="LSB" />
        <Big label="Of full-scale span" value={fmt(accuracy.fullScalePct, 5)} unit="%" />
      </div>
      <table className="tbl"><tbody>
        <Result label="Signal voltage" value={fmt(p.signalVolts, 6)} unit="V" />
        <Result label="One nominal LSB" value={si(accuracy.lsbVolts, 'V', 5)} />
        <Result label="ADC offset bound" value={si(p.offsetVolts, 'V', 5)} sub={`${fmt(p.offsetVolts / accuracy.lsbVolts, 5)} LSB`} />
        <Result label="Gain alone at this reading" value={si(accuracy.gainVolts, 'V', 5)} />
        <Result label="Reference alone, worst corner" value={si(accuracy.referenceVolts, 'V', 5)} />
        <Result label="Combined gain/reference error" value={`${si(accuracy.slopeLow, 'V', 5)} to ${si(accuracy.slopeHigh, 'V', 5)}`} sub="Exact slope corners; replaces, rather than adds to, the two individual figures above." />
        <Result label="INL bound" value={si(accuracy.inlVolts, 'V', 5)} sub={`${fmt(p.inlLsb, 5)} LSB`} />
        <Result label="Quantisation bound" value={si(accuracy.quantisationVolts, 'V', 5)} sub={p.quantisation ? '½ nominal LSB, interior codes' : 'Excluded'} />
        <Result label="Acquisition uncertainty" value={si(accuracy.settlingIndicatedVolts, 'V', 5)} sub={p.includeSettling ? 'Settling residual scaled by the largest gain/reference slope, bounded in either direction' : 'Excluded'} />
        <Result label="Total signed error interval" value={`${si(accuracy.low, 'V', 5)} to ${si(accuracy.high, 'V', 5)}`} strong />
        <Result label="Unclipped indicated voltage" value={`${fmt(accuracy.indicatedLow, 6)} to ${fmt(accuracy.indicatedHigh, 6)} V`} />
        <Result label="Worst bound as % of reading" value={accuracy.readingPct === null ? 'Not defined at 0 V' : `${fmt(accuracy.readingPct, 5)} %`} />
      </tbody></table>
      <div className="px-3 py-2"><Notes items={accuracy.railLimited ? ['The unclipped interval reaches a code rail. Saturation can limit the usable range; the ½ LSB quantisation model applies to interior codes.'] : []} /></div>
      <p className="px-3 pb-3 text-muted">This is a worst-case DC bound, not an ENOB or noise calculation. Maximum specifications are added by bound, without RSS. Offset and INL are expressed at the nominal reference; do not enter an overall accuracy or gain figure that already includes the separately entered errors.</p>
    </Panel>}
  </ToolPage>;
}

export function Method() {
  return <>
    <h2>Method</h2>
    <p>The target is ½ LSB = V<sub>REF</sub> / 2<sup>N+1</sup> for an N-bit converter. The entered worst-case voltage step is applied between a fully settled ADC-pin capacitor and the previous sample-capacitor voltage. With no external shunt capacitor, the remaining step decays with τ = (R<sub>source</sub> + R<sub>filter</sub> + R<sub>ON</sub>) C<sub>sample</sub>.</p>
    <p>With a shunt capacitor, the calculator solves the two-node linear RC network during acquisition, including charge sharing through R<sub>ON</sub> and recharge through the source/filter resistance. It finds the minimum acquisition time for the sample-capacitor error to fall below ½ LSB. A divider's source resistance is R<sub>top</sub> ∥ R<sub>bottom</sub>.</p>
    <p>If recovery is enabled, the ADC-pin error at the end of acquisition is allowed to decay through (R<sub>source</sub> + R<sub>filter</sub>) C<sub>filter</sub> after the switch opens. This is a separate first-order check, not a full repeated-sample simulation. The model assumes an ideal source behind its entered resistance and does not include amplifier slew/settling, switch charge injection, leakage, input protection, noise, aliasing or a non-linear sampling switch. Check the chosen ADC's datasheet input model and timing.</p>
    <h2>Optional DC accuracy budget</h2>
    <p>LSB = nominal reference span / 2<sup>N</sup>. Offset is an absolute indicated-voltage bound; INL is entered in nominal LSB after offset/gain removal. For non-negative unipolar signal V, slope uncertainty is bounded exactly by V[(1 − g)/(1 + r) − 1] and V[(1 + g)/(1 − r) − 1], where g is ADC slope-error fraction and r is independent reference uncertainty. This models indication with the nominal reference while the actual reference is multiplied by (1 ± r).</p>
    <p>To each slope corner add ±(offset + INL·LSB + optional ½ LSB + optional acquisition residual·(1 + g)/(1 − r)). The largest absolute endpoint is reported. Acquisition error is treated as a symmetric uncertainty, scaled by the largest indication slope, for a worst-case previous-channel step. These are unclipped interior-code bounds; near a rail, an ADC can saturate. Offset/INL units must match the nominal reference. DNL, random noise, temperature terms not included in the entered bounds, input leakage, source-divider and amplifier errors are excluded. Set reference uncertainty to zero if already included in the gain specification. Worst-case limits are not independent standard deviations, so an RSS estimate is not provided.</p>
    <h2>References</h2><ol>
      <li><a href="https://www.ti.com/lit/pdf/sbaa178" target="_blank" rel="noreferrer">Texas Instruments SBAA178, Determining Minimum Acquisition Times for SAR ADCs</a>, input RC network and sample-capacitor settling.</li>
      <li><a href="https://www.ti.com/lit/pdf/spracz0" target="_blank" rel="noreferrer">Texas Instruments SPRACZ0, Charge-Sharing Driving Circuits for C2000 ADCs</a>, charge sharing, filter capacitance and acquisition limits.</li>
      <li><a href="https://www.analog.com/en/resources/technical-articles/the-abcs-of-analog-to-digital-converters-how-adc-errors-affect-system-performance.html" target="_blank" rel="noreferrer">Analog Devices, The ABCs of ADCs: How ADC Errors Affect System Performance</a>, offset, gain, INL and resolution versus accuracy.</li>
      <li><a href="https://www.analog.com/en/resources/technical-articles/methods-for-calibrating-gain-error-in-dataconverter-systems.html" target="_blank" rel="noreferrer">Analog Devices, Methods for Calibrating Gain Error in Data-Converter Systems</a>, reference and converter gain errors.</li>
    </ol>
  </>;
}
