import { ToolPage } from '../components/ToolPage';
import { Big, LenField, Notes, NumField, Panel, Result, Section } from '../components/ui';
import { parallelViaCount, via } from '../lib/via';
import { fmt, si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { hole: 0.3, plating: 0.025, len: 1.6, pad: 0.6, antipad: 0.9, er: 4.3, dT: 10, amb: 25, z0: 50, target: 0 };

export default function Via() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const errors: string[] = [];
  if (!(p.hole > 0)) errors.push('Hole diameter must be greater than 0.');
  if (!(p.plating > 0)) errors.push('Plating thickness must be greater than 0.');
  if (!(p.len > 0)) errors.push('Via length must be greater than 0.');
  if (!(p.pad > p.hole)) errors.push('Pad diameter must be larger than the hole.');
  if (!(p.antipad > p.pad)) errors.push('Antipad (plane clearance) must be larger than the pad.');
  if (!(p.dT > 0)) errors.push('Temperature rise must be greater than 0.');
  if (p.target < 0) errors.push('Target current cannot be negative.');
  const r = errors.length ? null : via({ holeMm: p.hole, platingMm: p.plating, lengthMm: p.len, padMm: p.pad, antipadMm: p.antipad, er: p.er, dTC: p.dT, ambientC: p.amb, z0: p.z0 });
  const count = r && p.target > 0 ? parallelViaCount(p.target, r.currentInt) : null;
  const externalCount = r && p.target > 0 ? parallelViaCount(p.target, r.currentExt) : null;
  const notes: string[] = [];
  if (r && r.aspectRatio > 10) notes.push(`Aspect ratio ${fmt(r.aspectRatio, 3)}:1 is above the ~10:1 many fabs accept for through holes.`);

  const properties = (
    <>
      <Section title="Geometry">
        <LenField label="Finished hole" symbol="d" value={p.hole} onChange={(v) => set({ hole: v })} />
        <LenField label="Plating thickness" value={p.plating} onChange={(v) => set({ plating: v })} units={['um', 'mil', 'mm', 'oz']} />
        <LenField label="Via length" symbol="h" value={p.len} onChange={(v) => set({ len: v })} />
        <LenField label="Pad diameter" symbol="D1" value={p.pad} onChange={(v) => set({ pad: v })} />
        <LenField label="Antipad diameter" symbol="D2" value={p.antipad} onChange={(v) => set({ antipad: v })} />
        <NumField label="Dielectric constant" symbol="εr" value={p.er} onChange={(v) => set({ er: v })} min={1} allowZero />
      </Section>
      <Section title="Thermal / Electrical">
        <NumField label="Target current" symbol="I" value={p.target} onChange={(v) => set({ target: v })} unit="A" allowZero hint="Enter a current to estimate a parallel-via count." />
        <NumField label="Temperature rise" symbol="ΔT" value={p.dT} onChange={(v) => set({ dT: v })} unit="°C" />
        <NumField label="Ambient" value={p.amb} onChange={(v) => set({ amb: v })} unit="°C" allowNegative />
        <NumField label="Line impedance" symbol="Z0" value={p.z0} onChange={(v) => set({ z0: v })} unit="Ω" />
      </Section>
    </>
  );

  return (
    <ToolPage
      title="Via Calculator"
      description="Plated through-hole via: current capacity, DC resistance, voltage drop, thermal resistance, parasitic capacitance and inductance, and the rise-time penalty on a high-speed line."
      onReset={reset}
      properties={properties}
      status={r ? `Via: ${count !== null ? `${count} suggested for ${fmt(p.target, 3)} A, ` : ''}${fmt(r.currentExt, 3)} A external-k estimate, ${si(r.capPf * 1e-12, 'F', 3)}, ${si(r.indNh * 1e-9, 'H', 3)}` : 'Check the inputs'}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      <Notes items={notes} />
      {r && <Panel title="Parallel-via estimate">
        {count !== null && externalCount !== null ? <>
          <div className="flex flex-wrap gap-8 px-2.5 py-2">
            <Big label="Suggested starting count (internal k)" value={count} unit={count === 1 ? 'via' : 'vias'} />
          </div>
          <table className="tbl"><tbody>
            <Result label="Target current" value={fmt(p.target, 4)} unit="A" />
            <Result label="Current per via at suggested count" value={fmt(p.target / count, 4)} unit="A" />
            <Result label="External-k comparison" value={externalCount} unit={externalCount === 1 ? 'via' : 'vias'} />
            <Result label="Array DC resistance (equal sharing)" value={si(r.resistance / count, 'Ω')} />
            <Result label="Array voltage drop at target current" value={si(p.target * r.resistance / count, 'V')} />
          </tbody></table>
          <p className="px-2.5 py-2 text-faint">First-pass estimate for identical vias sharing current equally. The IPC-2221 trace equation is applied to the barrel; IPC does not prescribe this via count. Verify plating, pad connections and current sharing in the actual layout.</p>
        </> : <p className="px-2.5 py-2 text-muted">Enter a target current in Properties to see a starting via count for this geometry.</p>}
      </Panel>}
      {r && (
        <div className="grid gap-3 xl:grid-cols-2">
          <Panel title="Current and Resistance">
            <table className="tbl">
              <tbody>
                <Result label="Current capacity (IPC-2221, external k)" value={fmt(r.currentExt, 4)} unit="A" strong sub={`internal k: ${fmt(r.currentInt, 4)} A`} />
                <Result label="Barrel cross-section" value={fmt(r.areaMm2, 4)} unit="mm²" sub={`${fmt(r.areaMil2, 4)} mil²`} />
                <Result label="DC resistance" value={si(r.resistance, 'Ω')} sub={`at ${fmt(p.amb + p.dT, 4)} °C`} />
                <Result label="Voltage drop at capacity" value={si(r.voltageDropAtCurrent, 'V')} />
                <Result label="Power at capacity" value={si(r.powerAtCurrent, 'W')} />
                <Result label="Thermal resistance (barrel)" value={fmt(r.thermalRes, 4)} unit="°C/W" />
                <Result label="Aspect ratio" value={`${fmt(r.aspectRatio, 3)} : 1`} />
              </tbody>
            </table>
          </Panel>
          <Panel title="High-Speed Parasitics">
            <table className="tbl">
              <tbody>
                <Result label="Capacitance" value={si(r.capPf * 1e-12, 'F')} strong />
                <Result label="Inductance" value={si(r.indNh * 1e-9, 'H')} strong />
                <Result label="Via impedance √(L/C)" value={fmt(r.zVia, 4)} unit="Ω" />
                <Result label="Delay √(LC)" value={fmt(r.delayPs, 4)} unit="ps" />
                <Result label="Rise-time degradation" value={fmt(r.riseDegradationPs, 4)} unit="ps" sub={`10–90 %, on a ${fmt(p.z0, 3)} Ω line`} />
                <Result label="L-C resonance" value={fmt(r.resonanceGHz, 4)} unit="GHz" />
              </tbody>
            </table>
          </Panel>
        </div>
      )}
    </ToolPage>
  );
}

export function Method() {
  return (
    <>
      <h2>Formulas</h2>
      <p>
        The barrel is a copper tube with inner diameter <i>d</i> (finished hole) and outer diameter <i>d</i> + 2<i>t</i>
        <sub>plating</sub>. Its cross-section goes into the IPC-2221 current formula with the external-layer constant, which is common practice. The internal constant is shown as a
        lower comparison estimate. Neither coefficient is a via-specific current rating.
      </p>
      <p>For a target current, the first-pass count is ceil(target current / estimated current per via), using the lower internal-layer constant for the starting suggestion. It assumes equal sharing between identical vias. The external-layer count is shown for comparison. Via connections, nearby copper and heating need checking in the finished layout.</p>
      <p>The parasitic capacitance and inductance of a through via follow H. Johnson (dimensions in inches):</p>
      <div className="eq">
        <span className="no">(1)</span>
        <i>C</i> [pF] = 1.41 ε<sub>r</sub> <i>T D</i>
        <sub>1</sub> / (<i>D</i>
        <sub>2</sub> − <i>D</i>
        <sub>1</sub>)
      </div>
      <div className="eq">
        <span className="no">(2)</span>
        <i>L</i> [nH] = 5.08 <i>h</i> [ ln(4<i>h</i>/<i>d</i>) + 1 ]
      </div>
      <p>
        The 10–90 % rise-time degradation caused by the via capacitance on a line of impedance <i>Z</i>
        <sub>0</sub> is roughly 2.2 · <i>C</i> · <i>Z</i>
        <sub>0</sub>/2. These are first-order estimates. Stubs, back-drilling and return vias matter more at multi-GHz rates, and a 3D field solver is needed there.
      </p>
      <h2>References</h2>
      <ol>
        <li>H. Johnson, M. Graham, <i>High-Speed Digital Design</i>, Prentice Hall, 1993, ch. 7.</li>
        <li>IPC-2221B, Generic Standard on Printed Board Design, 2012.</li>
        <li><a href="https://www.ti.com/lit/an/slva959b/slva959b.pdf" target="_blank" rel="noopener noreferrer">Texas Instruments, Best Practices for Board Layout of Motor Drivers</a>, section 3.1, via dimensions, quantity and layout.</li>
      </ol>
    </>
  );
}
