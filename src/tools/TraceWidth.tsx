import { ToolPage } from '../components/ToolPage';
import { Big, Group, LenField, Notes, NumField, Panel, Segmented } from '../components/ui';
import { rhoCu } from '../lib/copper';
import { currentFor, IPC2221, ipc2221Warnings, traceWidth } from '../lib/ipc2221';
import { fmt, fromMm, MM_PER_MIL, MM_PER_OZ, si } from '../lib/units';
import { useSettings } from '../state/settings';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { mode: 'width', current: 3, width: 1, t: MM_PER_OZ, dT: 10, amb: 25, len: 50 };

export default function TraceWidth() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const { unit } = useSettings();
  const forWidth = p.mode === 'width';
  const errors: string[] = [];
  if (!(p.t > 0)) errors.push('Copper thickness must be greater than 0.');
  if (!(p.dT > 0)) errors.push('Temperature rise must be greater than 0.');
  if (forWidth && !(p.current > 0)) errors.push('Current must be greater than 0.');
  if (!forWidth && !(p.width > 0)) errors.push('Width must be greater than 0.');
  if (!(p.len >= 0)) errors.push('Length cannot be negative.');
  const ok = errors.length === 0;

  // width mode: IPC-2221 width; current mode: capacity of the given width
  const res = ok && forWidth ? traceWidth({ currentA: p.current, dTC: p.dT, thicknessMm: p.t, lengthMm: p.len, ambientC: p.amb }) : null;
  const areaGiven = p.width * p.t;
  const capExt = ok && !forWidth ? currentFor(areaGiven / (MM_PER_MIL * MM_PER_MIL), p.dT, IPC2221.kExternal) : NaN;
  const capInt = ok && !forWidth ? currentFor(areaGiven / (MM_PER_MIL * MM_PER_MIL), p.dT, IPC2221.kInternal) : NaN;
  const tempC = p.amb + p.dT;
  const rGiven = (rhoCu(tempC) * p.len * 1e-3) / (areaGiven * 1e-6);
  const L = (mm: number) => `${fmt(fromMm(mm, unit), 4)}`;
  const warnings = res ? ipc2221Warnings({ currentA: p.current, dTC: p.dT, thicknessMm: p.t, lengthMm: p.len, ambientC: p.amb }, res.external.widthMil) : [];

  const rows = forWidth && res
    ? [
        ['Required width', `${L(res.internal.widthMm)} ${unit}`, `${L(res.external.widthMm)} ${unit}`],
        ['Cross-section', `${fmt(res.internal.areaMm2, 4)} mm²`, `${fmt(res.external.areaMm2, 4)} mm²`],
        ['Resistance', si(res.internal.resistance, 'Ω'), si(res.external.resistance, 'Ω')],
        ['Voltage drop', si(res.internal.voltageDrop, 'V'), si(res.external.voltageDrop, 'V')],
        ['Power loss', si(res.internal.power, 'W'), si(res.external.power, 'W')],
        ['Current density', `${fmt(res.internal.currentDensity, 4)} A/mm²`, `${fmt(res.external.currentDensity, 4)} A/mm²`],
      ]
    : !forWidth && ok
      ? [
          ['Maximum current', `${fmt(capInt, 4)} A`, `${fmt(capExt, 4)} A`],
          ['Resistance', si(rGiven, 'Ω'), si(rGiven, 'Ω')],
          ['Voltage drop at max current', si(capInt * rGiven, 'V'), si(capExt * rGiven, 'V')],
          ['Power loss at max current', si(capInt * capInt * rGiven, 'W'), si(capExt * capExt * rGiven, 'W')],
        ]
      : [];

  return (
    <ToolPage
      title="Trace Width & Current Calculator"
      description="IPC-2221 trace sizing: the minimum width for a given current and temperature rise, or the current a given trace can carry, with resistance, voltage drop and power loss for internal and external layers."
      onReset={reset}
      method={<Method />}
    >
      <div className="grid gap-4 lg:grid-cols-[350px_minmax(0,1fr)]">
        <Panel title="Inputs">
          <Group>
            <div className="flex items-center justify-between">
              <span className="text-[13px]">Calculate</span>
              <Segmented
                label="Calculation"
                value={p.mode as 'width' | 'current'}
                onChange={(v) => set({ mode: v })}
                options={[
                  { value: 'width', label: 'Width from current' },
                  { value: 'current', label: 'Current from width' },
                ]}
              />
            </div>
            {forWidth ? (
              <NumField label="Current" symbol="I" value={p.current} onChange={(v) => set({ current: v })} unit="A" />
            ) : (
              <LenField label="Trace width" symbol="W" value={p.width} onChange={(v) => set({ width: v })} />
            )}
            <LenField label="Copper thickness" symbol="T" value={p.t} onChange={(v) => set({ t: v })} units={['oz', 'um', 'mil', 'mm']} />
            <NumField label="Temperature rise" symbol="ΔT" value={p.dT} onChange={(v) => set({ dT: v })} unit="°C" />
            <NumField label="Ambient" value={p.amb} onChange={(v) => set({ amb: v })} unit="°C" allowNegative />
            <LenField label="Trace length" symbol="L" value={p.len} onChange={(v) => set({ len: v })} units={['mm', 'cm', 'in', 'mil']} allowZero />
          </Group>
        </Panel>

        <div className="min-w-0 space-y-4">
          <Panel title="Result">
            <div className="flex flex-wrap gap-8 px-3 py-3">
              {forWidth && res ? (
                <>
                  <Big label="External layer width" value={L(res.external.widthMm)} unit={unit} />
                  <Big label="Internal layer width" value={L(res.internal.widthMm)} unit={unit} />
                </>
              ) : (
                <>
                  <Big label="External layer" value={fmt(capExt, 4)} unit="A" />
                  <Big label="Internal layer" value={fmt(capInt, 4)} unit="A" />
                </>
              )}
            </div>
            <div className="space-y-2 px-3 pb-3">
              <Notes kind="error" items={errors} />
              <Notes items={warnings} />
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th />
                  <th className="v">External layer</th>
                  <th className="v">Internal layer</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r[0]}>
                    <th scope="row" className="text-left text-[13px] font-normal">
                      {r[0]}
                    </th>
                    <td className="v">{r[2]}</td>
                    <td className="v">{r[1]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-2 text-[12px] text-muted">Resistance is evaluated at the conductor temperature, {fmt(tempC, 4)} °C (ambient + rise).</p>
          </Panel>
        </div>
      </div>
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
        <i>A</i> is in square mils and Δ<i>T</i> in °C. <i>k</i> is 0.048 for external and 0.024 for internal layers, because buried traces cannot lose heat to the air. Width is <i>A</i> divided by
        the copper thickness (1 oz/ft² = 1.378 mil ≈ 35 µm). Resistance uses ρ = 1.7241 µΩ·cm at 20 °C with α = 0.00393 /°C, evaluated at ambient + ΔT.
      </p>
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
