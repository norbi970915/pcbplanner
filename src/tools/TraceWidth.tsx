import { ToolPage } from '../components/ToolPage';
import { Big, LenField, Notes, NumField, Panel, Section, SelectField } from '../components/ui';
import { rhoCu } from '../lib/copper';
import { currentFor, IPC2221, ipc2221Warnings, tempRiseFor, traceWidth } from '../lib/ipc2221';
import { fmt, fromMm, MM_PER_MIL, MM_PER_OZ, si } from '../lib/units';
import { useSettings } from '../state/settings';
import { useUrlState } from '../state/useUrlState';

type Mode = 'width' | 'current' | 'temp';
const DEFAULTS = { mode: 'width', current: 3, width: 1, t: MM_PER_OZ, dT: 10, amb: 25, len: 50 };
const MIL2 = MM_PER_MIL * MM_PER_MIL;

export default function TraceWidth() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const { unit } = useSettings();
  const mode = p.mode as Mode;
  const errors: string[] = [];
  if (!(p.t > 0)) errors.push('Copper thickness must be greater than 0.');
  if (mode !== 'temp' && !(p.dT > 0)) errors.push('Temperature rise must be greater than 0.');
  if (mode !== 'current' && !(p.current > 0)) errors.push('Current must be greater than 0.');
  if (mode !== 'width' && !(p.width > 0)) errors.push('Width must be greater than 0.');
  if (!(p.len >= 0)) errors.push('Length cannot be negative.');
  const ok = errors.length === 0;
  const L = (mm: number) => fmt(fromMm(mm, unit), 4);

  type Row = [string, string, string];
  let rows: Row[] = [];
  let headline: { ext: string; int: string; unit: string; label: string } | null = null;
  let warnings: string[] = [];
  let tempNote = '';

  if (ok && mode === 'width') {
    const res = traceWidth({ currentA: p.current, dTC: p.dT, thicknessMm: p.t, lengthMm: p.len, ambientC: p.amb });
    headline = { ext: L(res.external.widthMm), int: L(res.internal.widthMm), unit, label: 'width' };
    rows = [
      ['Required width', `${L(res.external.widthMm)} ${unit}`, `${L(res.internal.widthMm)} ${unit}`],
      ['Cross-section', `${fmt(res.external.areaMm2, 4)} mm²`, `${fmt(res.internal.areaMm2, 4)} mm²`],
      ['Resistance', si(res.external.resistance, 'Ω'), si(res.internal.resistance, 'Ω')],
      ['Voltage drop', si(res.external.voltageDrop, 'V'), si(res.internal.voltageDrop, 'V')],
      ['Power loss', si(res.external.power, 'W'), si(res.internal.power, 'W')],
      ['Current density', `${fmt(res.external.currentDensity, 4)} A/mm²`, `${fmt(res.internal.currentDensity, 4)} A/mm²`],
    ];
    warnings = ipc2221Warnings({ currentA: p.current, dTC: p.dT, thicknessMm: p.t, lengthMm: p.len, ambientC: p.amb }, res.external.widthMil);
    tempNote = `Resistance at the conductor temperature, ${fmt(p.amb + p.dT, 4)} °C.`;
  } else if (ok) {
    const area = p.width * p.t;
    const aMil2 = area / MIL2;
    if (mode === 'current') {
      const ext = currentFor(aMil2, p.dT, IPC2221.kExternal);
      const int = currentFor(aMil2, p.dT, IPC2221.kInternal);
      const R = (rhoCu(p.amb + p.dT) * p.len * 1e-3) / (area * 1e-6);
      headline = { ext: fmt(ext, 4), int: fmt(int, 4), unit: 'A', label: 'current' };
      rows = [
        ['Maximum current', `${fmt(ext, 4)} A`, `${fmt(int, 4)} A`],
        ['Resistance', si(R, 'Ω'), si(R, 'Ω')],
        ['Voltage drop at max current', si(ext * R, 'V'), si(int * R, 'V')],
        ['Power loss at max current', si(ext * ext * R, 'W'), si(int * int * R, 'W')],
      ];
      tempNote = `Resistance at the conductor temperature, ${fmt(p.amb + p.dT, 4)} °C.`;
    } else {
      const ext = tempRiseFor(p.current, aMil2, IPC2221.kExternal);
      const int = tempRiseFor(p.current, aMil2, IPC2221.kInternal);
      const Rext = (rhoCu(p.amb + ext) * p.len * 1e-3) / (area * 1e-6);
      const Rint = (rhoCu(p.amb + int) * p.len * 1e-3) / (area * 1e-6);
      headline = { ext: fmt(ext, 4), int: fmt(int, 4), unit: '°C', label: 'temperature rise' };
      rows = [
        ['Temperature rise', `${fmt(ext, 4)} °C`, `${fmt(int, 4)} °C`],
        ['Conductor temperature', `${fmt(p.amb + ext, 4)} °C`, `${fmt(p.amb + int, 4)} °C`],
        ['Resistance (hot)', si(Rext, 'Ω'), si(Rint, 'Ω')],
        ['Voltage drop', si(p.current * Rext, 'V'), si(p.current * Rint, 'V')],
        ['Power loss', si(p.current * p.current * Rext, 'W'), si(p.current * p.current * Rint, 'W')],
      ];
      if (int > 100) warnings.push('The internal-layer rise is over 100 °C, outside the IPC-2221 data. The trace is badly undersized.');
      if (p.amb + int > 130) warnings.push('The conductor would exceed a typical FR-4 Tg (130–170 °C).');
    }
  }

  const properties = (
    <>
      <Section title="Calculation">
        <SelectField
          label="Solve for"
          value={mode}
          onChange={(v) => set({ mode: v })}
          options={[
            { value: 'width', label: 'Width from current' },
            { value: 'current', label: 'Current from width' },
            { value: 'temp', label: 'Temperature rise' },
          ]}
        />
      </Section>
      <Section title="Conductor">
        {mode !== 'current' && <NumField label="Current" symbol="I" value={p.current} onChange={(v) => set({ current: v })} unit="A" />}
        {mode !== 'width' && <LenField label="Trace width" symbol="W" value={p.width} onChange={(v) => set({ width: v })} />}
        <LenField label="Copper thickness" symbol="T" value={p.t} onChange={(v) => set({ t: v })} units={['oz', 'um', 'mil', 'mm']} />
        <LenField label="Trace length" symbol="L" value={p.len} onChange={(v) => set({ len: v })} units={['mm', 'cm', 'in', 'mil']} allowZero />
      </Section>
      <Section title="Thermal">
        {mode !== 'temp' && <NumField label="Temperature rise" symbol="ΔT" value={p.dT} onChange={(v) => set({ dT: v })} unit="°C" />}
        <NumField label="Ambient" value={p.amb} onChange={(v) => set({ amb: v })} unit="°C" allowNegative />
      </Section>
    </>
  );

  return (
    <ToolPage
      title="Trace Width, Current & Temperature Rise"
      description="IPC-2221 trace sizing: the minimum width for a current, the current a trace can carry, or the temperature rise of a given trace, with resistance, voltage drop and loss for external and internal layers."
      onReset={reset}
      properties={properties}
      status={headline ? `IPC-2221 ${headline.label}: external ${headline.ext} ${headline.unit}, internal ${headline.int} ${headline.unit}` : 'Check the inputs'}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      <Notes items={warnings} />
      <Panel title="Results">
        {headline && (
          <div className="flex flex-wrap gap-8 px-2.5 py-2">
            <Big label={`External layer ${headline.label}`} value={headline.ext} unit={headline.unit} />
            <Big label={`Internal layer ${headline.label}`} value={headline.int} unit={headline.unit} />
          </div>
        )}
        <table className="tbl">
          <thead>
            <tr>
              <th>Quantity</th>
              <th className="v">External layer</th>
              <th className="v">Internal layer</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]}>
                <th scope="row" className="text-left font-normal">
                  {r[0]}
                </th>
                <td className="v">{r[1]}</td>
                <td className="v">{r[2]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {tempNote && <p className="px-2.5 py-1.5 text-faint">{tempNote}</p>}
      </Panel>
    </ToolPage>
  );
}

function Method() {
  return (
    <>
      <h2>IPC-2221 conductor sizing</h2>
      <p>IPC-2221 relates the current a conductor can carry to its cross-sectional area and the temperature rise you accept:</p>
      <div className="eq">
        <span className="no">(1)</span>
        <i>I</i> = <i>k</i> · Δ<i>T</i>
        <sup>0.44</sup> · <i>A</i>
        <sup>0.725</sup>
      </div>
      <p>
        <i>A</i> is in square mils and Δ<i>T</i> in °C. <i>k</i> is 0.048 for external and 0.024 for internal layers, because buried traces cannot lose heat to the air. Solved for the width,
        the area is divided by the copper thickness (1 oz/ft² = 1.378 mil ≈ 35 µm). Solved for the temperature rise:
      </p>
      <div className="eq">
        <span className="no">(2)</span>Δ<i>T</i> = ( <i>I</i> / (<i>k</i> · <i>A</i>
        <sup>0.725</sup>) )<sup>1/0.44</sup>
      </div>
      <p>Resistance uses ρ = 1.7241 µΩ·cm at 20 °C with α = 0.00393 /°C, evaluated at the conductor temperature.</p>
      <h3>Limits</h3>
      <p>
        The IPC-2221 curves go back to 1950s test data. They are generally considered valid for up to about 35 A, widths up to 400 mil, ΔT of 10–100 °C and 0.5–3 oz copper. IPC-2152 (2009)
        is based on newer measurements and accounts for board thickness and nearby planes. It usually allows narrower internal traces than IPC-2221, so treat the IPC-2221 internal
        result as conservative.
      </p>
      <h2>References</h2>
      <ol>
        <li>IPC-2221B, Generic Standard on Printed Board Design, 2012.</li>
        <li>IPC-2152, Standard for Determining Current Carrying Capacity in Printed Board Design, 2009.</li>
      </ol>
    </>
  );
}
