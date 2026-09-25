import { Link } from 'react-router-dom';
import { ToolPage } from '../components/ToolPage';
import { Big, Check, Notes, NumField, Panel, Result, Section } from '../components/ui';
import { checkLogicLevels } from '../lib/logicLevels';
import { fmt } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = {
  vohMin: 2.9, volMax: 0.4, vohMax: 3.3, vihMin: 2, vilMax: 0.8,
  operatingMax: 3.6, absoluteMax: 4, receiverMayBeOff: false,
};

export default function LogicLevels() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const result = checkLogicLevels(p);
  const verdict = result.verdict === 'incompatible' ? 'Incompatible at an entered limit'
    : result.verdict === 'review' ? 'Review the missing or boundary conditions' : 'Passes the entered limits';
  const errors = [...result.errors, ...result.failures];
  const notes = result.errors.length ? [] : result.warnings;

  return <ToolPage title="Logic-Level Compatibility Checker"
    description="Compare a driving pin's guaranteed HIGH and LOW levels with a receiving pin's thresholds and input-voltage limits."
    onReset={reset} status={result.errors.length ? 'Check the inputs' : `${verdict} · HIGH margin ${fmt(result.highMargin, 4)} V · LOW margin ${fmt(result.lowMargin, 4)} V`}
    method={<Method />}
    properties={<>
      <Section title="Driver output · datasheet limits">
        <div className="logic-level-fields space-y-[3px]">
        <NumField label="Guaranteed HIGH" symbol="VOH(min)" value={p.vohMin} onChange={vohMin => set({ vohMin })} unit="V" hint="Minimum output HIGH at the intended supply, load current and temperature." />
        <NumField label="Worst-case LOW" symbol="VOL(max)" value={p.volMax} onChange={volMax => set({ volMax })} unit="V" allowZero hint="Maximum output LOW at the intended sink current and temperature." />
        <NumField label="Highest HIGH" symbol="VOH(max)" value={p.vohMax} onChange={vohMax => set({ vohMax })} unit="V" hint="Highest voltage the driver can apply to the receiver, including supply tolerance." />
        </div>
      </Section>
      <Section title="Receiver input · datasheet limits">
        <div className="logic-level-fields space-y-[3px]">
        <NumField label="HIGH threshold" symbol="VIH(min)" value={p.vihMin} onChange={vihMin => set({ vihMin })} unit="V" hint="Minimum voltage guaranteed to register as HIGH." />
        <NumField label="LOW threshold" symbol="VIL(max)" value={p.vilMax} onChange={vilMax => set({ vilMax })} unit="V" allowZero hint="Maximum voltage guaranteed to register as LOW." />
        <NumField label="Operating input max" value={p.operatingMax} onChange={operatingMax => set({ operatingMax })} unit="V" allowZero hint="Highest input voltage allowed during normal operation; 0 means not entered." />
        <NumField label="Absolute input max" value={p.absoluteMax} onChange={absoluteMax => set({ absoluteMax })} unit="V" allowZero hint="Absolute maximum input rating. It is not a normal operating target; 0 means not entered." />
        </div>
      </Section>
      <Section title="Power state">
        <Check label="Receiver may be unpowered while driver is active" checked={p.receiverMayBeOff} onChange={receiverMayBeOff => set({ receiverMayBeOff })} />
        <p className="text-faint">If checked, confirm powered-off input tolerance and injection current in the receiver datasheet.</p>
      </Section>
    </>}>
    <Notes kind="error" items={errors} />
    <Notes items={notes} />
    {!result.errors.length && <>
      <Panel title="Compatibility Result">
        <div className="px-3 pt-3 font-semibold">{verdict}</div>
        <div className="flex flex-wrap gap-8 px-3 py-3">
          <Big label="HIGH noise margin" value={fmt(result.highMargin, 5)} unit="V" />
          <Big label="LOW noise margin" value={fmt(result.lowMargin, 5)} unit="V" />
        </div>
        <table className="tbl"><tbody>
          <Result label="HIGH: VOH(min) − VIH(min)" value={result.highCompatible ? 'Meets threshold' : 'Fails threshold'} sub={`${fmt(p.vohMin, 5)} V − ${fmt(p.vihMin, 5)} V`} strong />
          <Result label="LOW: VIL(max) − VOL(max)" value={result.lowCompatible ? 'Meets threshold' : 'Fails threshold'} sub={`${fmt(p.vilMax, 5)} V − ${fmt(p.volMax, 5)} V`} strong />
          <Result label="Recommended input limit" value={result.operatingCompatible === null ? 'Not entered' : result.operatingCompatible ? 'Within limit' : 'Exceeds limit'} sub={`Driver HIGH may reach ${fmt(p.vohMax, 5)} V`} />
          <Result label="Absolute maximum input rating" value={result.absoluteCompatible === null ? 'Not entered' : result.absoluteCompatible ? 'Within rating' : 'Exceeds rating'} />
        </tbody></table>
        <p className="px-3 py-2 text-faint">Use guaranteed datasheet minimum and maximum values at the actual supplies, temperatures and pin load. Absolute maximum ratings do not define reliable normal operation.</p>
      </Panel>
      <Panel title="Continue the Design">
        <div className="flex flex-wrap gap-2 px-3 py-3">
          <Link className="btn no-underline" to="/power-tree">Check supply rails</Link>
          <Link className="btn no-underline" to="/i2c-pullup">Check open-drain pull-ups</Link>
          <Link className="btn no-underline" to="/termination">Check signal termination</Link>
        </div>
      </Panel>
    </>}
  </ToolPage>;
}

export function Method() {
  return <>
    <h2>Method</h2>
    <p>HIGH noise margin = V<sub>OH(min)</sub> − V<sub>IH(min)</sub>. LOW noise margin = V<sub>IL(max)</sub> − V<sub>OL(max)</sub>. Non-negative margins meet the static input thresholds; zero margin leaves no allowance for additional noise at that corner.</p>
    <p>The driver's highest possible HIGH is also checked against the receiver's recommended operating input limit and absolute maximum input rating when entered. Passing an absolute maximum check does not imply reliable operation beyond the recommended limit. A receiver that can be unpowered while the driver remains active needs a separate datasheet check for I<sub>off</sub>, input clamps and injection current.</p>
    <p>This is a DC, single-ended logic check. It does not model propagation delay, edge rate, transmission-line effects, bus contention or the output-voltage change with loading. Use guaranteed datasheet corners for the specific pins and supply range.</p>
    <h2>Reference</h2><ol>
      <li><a href="https://www.ti.com/lit/an/scea021a/scea021a.pdf" target="_blank" rel="noreferrer">Texas Instruments SCEA021A, Voltage-Level-Translation Devices</a>, driver/receiver VIH, VIL, VOH and VOL compatibility.</li>
    </ol>
  </>;
}
