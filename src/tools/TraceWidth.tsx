import { Sources } from '../components/Sources';
import { ToolPage } from '../components/ToolPage';
import { Big, LenField, Notes, NumField, Panel, Section, SelectField } from '../components/ui';
import { IPC2152_EXTERNAL, IPC2152_EXTERNAL_VALIDITY, ipc2152Current, ipc2152DeltaT, ipc2152Width, SOURCES as IPC2152_SOURCES } from '../data/ipc2152';
import { rhoCu } from '../lib/copper';
import { currentFor, IPC2221, ipc2221Warnings, tempRiseFor, traceWidth } from '../lib/ipc2221';
import { fmt, fromMm, MM_PER_MIL, MM_PER_OZ, si } from '../lib/units';
import { useSettings } from '../state/settings';
import { useUrlState } from '../state/useUrlState';

type Mode = 'width' | 'current' | 'temp';
type Std = 'ipc2221' | 'ipc2152';
const DEFAULTS = { std: 'ipc2221', mode: 'width', current: 3, width: 1, t: MM_PER_OZ, dT: 10, amb: 25, len: 50 };
const MIL2 = MM_PER_MIL * MM_PER_MIL;
type Row = [string, string, string];

export default function TraceWidth() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const { unit } = useSettings();
  const mode = p.mode as Mode;
  const std = p.std as Std;
  const errors: string[] = [];
  if (!(p.t > 0)) errors.push('Copper thickness must be greater than 0.');
  if (mode !== 'temp' && !(p.dT > 0)) errors.push('Temperature rise must be greater than 0.');
  if (mode !== 'current' && !(p.current > 0)) errors.push('Current must be greater than 0.');
  if (mode !== 'width' && !(p.width > 0)) errors.push('Width must be greater than 0.');
  if (!(p.len >= 0)) errors.push('Length cannot be negative.');
  const ok = errors.length === 0;
  const L = (mm: number) => fmt(fromMm(mm, unit), 4);
  const R = (areaMm2: number, tempC: number) => (rhoCu(tempC) * p.len * 1e-3) / (areaMm2 * 1e-6);
  const tMil = p.t / MM_PER_MIL;

  let rows: Row[] = [];
  let cols: [string, string] = ['External layer', 'Internal layer'];
  let headline: { a: string; b: string; unit: string; label: string; la: string; lb: string } | null = null;
  const warnings: string[] = [];
  let tempNote = '';

  if (ok && std === 'ipc2221') {
    if (mode === 'width') {
      const res = traceWidth({ currentA: p.current, dTC: p.dT, thicknessMm: p.t, lengthMm: p.len, ambientC: p.amb });
      headline = { a: L(res.external.widthMm), b: L(res.internal.widthMm), unit, label: 'width', la: 'External layer width', lb: 'Internal layer width' };
      rows = [
        ['Required width', `${L(res.external.widthMm)} ${unit}`, `${L(res.internal.widthMm)} ${unit}`],
        ['Cross-section', `${fmt(res.external.areaMm2, 4)} mm²`, `${fmt(res.internal.areaMm2, 4)} mm²`],
        ['Resistance', si(res.external.resistance, 'Ω'), si(res.internal.resistance, 'Ω')],
        ['Voltage drop', si(res.external.voltageDrop, 'V'), si(res.internal.voltageDrop, 'V')],
        ['Power loss', si(res.external.power, 'W'), si(res.internal.power, 'W')],
        ['Current density', `${fmt(res.external.currentDensity, 4)} A/mm²`, `${fmt(res.internal.currentDensity, 4)} A/mm²`],
      ];
      warnings.push(...ipc2221Warnings({ currentA: p.current, dTC: p.dT, thicknessMm: p.t, lengthMm: p.len, ambientC: p.amb }, res.external.widthMil));
      tempNote = `Resistance at the conductor temperature, ${fmt(p.amb + p.dT, 4)} °C.`;
    } else {
      const area = p.width * p.t;
      const aMil2 = area / MIL2;
      if (mode === 'current') {
        const ext = currentFor(aMil2, p.dT, IPC2221.kExternal);
        const int = currentFor(aMil2, p.dT, IPC2221.kInternal);
        const r = R(area, p.amb + p.dT);
        headline = { a: fmt(ext, 4), b: fmt(int, 4), unit: 'A', label: 'current', la: 'External layer current', lb: 'Internal layer current' };
        rows = [
          ['Maximum current', `${fmt(ext, 4)} A`, `${fmt(int, 4)} A`],
          ['Resistance', si(r, 'Ω'), si(r, 'Ω')],
          ['Voltage drop at max current', si(ext * r, 'V'), si(int * r, 'V')],
          ['Power loss at max current', si(ext * ext * r, 'W'), si(int * int * r, 'W')],
        ];
        tempNote = `Resistance at the conductor temperature, ${fmt(p.amb + p.dT, 4)} °C.`;
      } else {
        const ext = tempRiseFor(p.current, aMil2, IPC2221.kExternal);
        const int = tempRiseFor(p.current, aMil2, IPC2221.kInternal);
        const re = R(area, p.amb + ext);
        const ri = R(area, p.amb + int);
        headline = { a: fmt(ext, 4), b: fmt(int, 4), unit: '°C', label: 'temperature rise', la: 'External layer rise', lb: 'Internal layer rise' };
        rows = [
          ['Temperature rise', `${fmt(ext, 4)} °C`, `${fmt(int, 4)} °C`],
          ['Conductor temperature', `${fmt(p.amb + ext, 4)} °C`, `${fmt(p.amb + int, 4)} °C`],
          ['Resistance (hot)', si(re, 'Ω'), si(ri, 'Ω')],
          ['Voltage drop', si(p.current * re, 'V'), si(p.current * ri, 'V')],
          ['Power loss', si(p.current * p.current * re, 'W'), si(p.current * p.current * ri, 'W')],
        ];
        if (int > 100) warnings.push('The internal-layer rise is over 100 °C, outside the IPC-2221 data. The trace is badly undersized.');
        if (p.amb + int > 130) warnings.push('The conductor would exceed a typical FR-4 Tg (130–170 °C).');
      }
    }
  } else if (ok) {
    // IPC-2152 external curve fit (Brooks & Adam) next to IPC-2221 external
    cols = ['IPC-2152 fit (external)', 'IPC-2221 (external)'];
    const V = IPC2152_EXTERNAL_VALIDITY;
    let wMil = 0;
    let dT = p.dT;
    let I = p.current;
    if (mode === 'width') {
      wMil = ipc2152Width(IPC2152_EXTERNAL, p.current, p.dT, tMil);
      const w21 = traceWidth({ currentA: p.current, dTC: p.dT, thicknessMm: p.t, lengthMm: p.len, ambientC: p.amb }).external;
      headline = { a: L(wMil * MM_PER_MIL), b: L(w21.widthMm), unit, label: 'width', la: 'IPC-2152 fit width', lb: 'IPC-2221 external width' };
      rows = [
        ['Required width', `${L(wMil * MM_PER_MIL)} ${unit}`, `${L(w21.widthMm)} ${unit}`],
        ['Resistance', si(R(wMil * MM_PER_MIL * p.t, p.amb + p.dT), 'Ω'), si(w21.resistance, 'Ω')],
        ['Voltage drop', si(p.current * R(wMil * MM_PER_MIL * p.t, p.amb + p.dT), 'V'), si(w21.voltageDrop, 'V')],
      ];
    } else if (mode === 'current') {
      wMil = p.width / MM_PER_MIL;
      I = ipc2152Current(IPC2152_EXTERNAL, p.dT, wMil, tMil);
      const i21 = currentFor((p.width * p.t) / MIL2, p.dT, IPC2221.kExternal);
      headline = { a: fmt(I, 4), b: fmt(i21, 4), unit: 'A', label: 'current', la: 'IPC-2152 fit current', lb: 'IPC-2221 external current' };
      rows = [['Maximum current', `${fmt(I, 4)} A`, `${fmt(i21, 4)} A`]];
    } else {
      wMil = p.width / MM_PER_MIL;
      dT = ipc2152DeltaT(IPC2152_EXTERNAL, p.current, wMil, tMil);
      const d21 = tempRiseFor(p.current, (p.width * p.t) / MIL2, IPC2221.kExternal);
      headline = { a: fmt(dT, 4), b: fmt(d21, 4), unit: '°C', label: 'temperature rise', la: 'IPC-2152 fit rise', lb: 'IPC-2221 external rise' };
      rows = [
        ['Temperature rise', `${fmt(dT, 4)} °C`, `${fmt(d21, 4)} °C`],
        ['Conductor temperature', `${fmt(p.amb + dT, 4)} °C`, `${fmt(p.amb + d21, 4)} °C`],
      ];
    }
    const oz = p.t / MM_PER_OZ;
    if (wMil < V.widthMil.min || wMil > V.widthMil.max) warnings.push(`Width ${fmt(wMil, 4)} mil is outside the ${V.widthMil.min}–${V.widthMil.max} mil range the fit was checked against.`);
    if (I > V.currentA.max) warnings.push(`Current above ${V.currentA.max} A is outside the fitted data.`);
    if (dT > V.deltaTC.max) warnings.push(`Temperature rise above ${V.deltaTC.max} °C is outside the fitted data.`);
    if (oz < 1.5) warnings.push('The external fit was derived from 2 oz and 3 oz data; for thinner copper treat it as an estimate.');
    warnings.push('IPC-2152 data: a single trace in still air on a board without copper planes (close to worst case). Nearby planes and copper pours lower the real temperature considerably.');
  }

  const properties = (
    <>
      <Section title="Calculation">
        <SelectField
          label="Standard"
          value={std}
          onChange={(v) => set({ std: v })}
          options={[
            { value: 'ipc2221', label: 'IPC-2221' },
            { value: 'ipc2152', label: 'IPC-2152 (curve fit)' },
          ]}
        />
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
      description="PCB trace sizing to IPC-2221 or IPC-2152: the minimum width for a current, the current a trace can carry, or its temperature rise, with resistance, voltage drop and loss."
      onReset={reset}
      properties={properties}
      status={headline ? `${std === 'ipc2221' ? 'IPC-2221' : 'IPC-2152 fit'} ${headline.label}: ${headline.a} ${headline.unit} (${cols[1]}: ${headline.b} ${headline.unit})` : 'Check the inputs'}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      <Notes items={warnings} />
      <Panel title="Results">
        {headline && (
          <div className="flex flex-wrap gap-8 px-2.5 py-2">
            <Big label={headline.la} value={headline.a} unit={headline.unit} />
            <Big label={headline.lb} value={headline.b} unit={headline.unit} />
          </div>
        )}
        <table className="tbl">
          <thead>
            <tr>
              <th>Quantity</th>
              <th className="v">{cols[0]}</th>
              <th className="v">{cols[1]}</th>
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
        <i>A</i> is in square mils and Δ<i>T</i> in °C. <i>k</i> is 0.048 for external and 0.024 for internal layers. Solved for the rise: Δ<i>T</i> = ( <i>I</i> / (<i>k</i> · <i>A</i>
        <sup>0.725</sup>) )<sup>1/0.44</sup>. The IPC-2221 curves go back to 1950s data and are usually considered valid up to about 35 A, widths up to 400 mil and ΔT of 10–100 °C.
      </p>
      <h2>IPC-2152 (curve fit)</h2>
      <p>
        IPC-2152 (2009) replaced the old curves with new measurements, published as charts. This tool uses the regression that Brooks and Adam fitted to the IPC-2152 external data, not IPC's
        copyrighted charts:
      </p>
      <div className="eq">
        <span className="no">(2)</span>Δ<i>T</i> = 215.3 · <i>I</i>
        <sup>2</sup> · <i>W</i>
        <sup>−1.15</sup> · <i>Th</i>
        <sup>−1.0</sup>&nbsp;&nbsp;(W, Th in mil)
      </div>
      <p>
        One equation fits the 2 oz and 3 oz external data. It was compared with the IPC-2152 curves for widths of 5–200 mil, up to 20 A and 100 °C, and reads about 5–10 % high on wide, hot
        traces. The IPC-2152 test conditions (an isolated trace in still air on a plane-less board) are close to worst case. Copper planes, pours and board thickness lower the real temperature,
        and IPC-2152 gives modifiers for them. For those effects, thermal simulation is the reliable method.
      </p>
      <Sources items={IPC2152_SOURCES} />
    </>
  );
}
