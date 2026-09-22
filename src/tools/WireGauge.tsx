import { ToolPage } from '../components/ToolPage';
import { Big, Check, Notes, NumField, Panel, Result, Section, SelectField } from '../components/ui';
import { GAUGES, METALS, minimumGauge, preeceFusing, voltageDrop, type Metal } from '../lib/wire';
import { fmt, si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { n: 18, metal: 'copper', len: 2, rt: true, i: 3, v: 12, t: 20, maxPct: 3 };

export default function WireGauge() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const metal = p.metal as Metal;
  const errors: string[] = [];
  if (!(p.len > 0)) errors.push('Length must be greater than 0.');
  if (!(p.i >= 0)) errors.push('Current cannot be negative.');
  if (!(p.v > 0)) errors.push('Supply voltage must be greater than 0.');
  const base = { metal, lengthM: p.len, roundTrip: p.rt, currentA: p.i, supplyV: p.v, tempC: p.t };
  const r = errors.length ? null : voltageDrop({ ...base, n: p.n });
  const minG = errors.length ? null : minimumGauge(base, p.maxPct);
  const notes: string[] = [];
  if (r && r.dropPct > p.maxPct) notes.push(`The drop is ${fmt(r.dropPct, 3)} %, above your ${fmt(p.maxPct, 3)} % limit. ${minG ? `Use AWG ${minG.label} or thicker.` : 'No AWG size meets it.'}`);

  const properties = (
    <>
      <Section title="Wire">
        <SelectField label="Gauge (AWG)" value={String(p.n)} onChange={(v) => set({ n: Number(v) })} options={GAUGES.map((g) => ({ value: String(g.n), label: g.label }))} width={110} />
        <SelectField label="Conductor" value={metal} onChange={(v) => set({ metal: v })} options={(Object.keys(METALS) as Metal[]).map((m) => ({ value: m, label: METALS[m].label }))} />
        <NumField label="Conductor temperature" value={p.t} onChange={(v) => set({ t: v })} unit="°C" allowNegative />
      </Section>
      <Section title="Circuit">
        <NumField label="Cable length (one way)" value={p.len} onChange={(v) => set({ len: v })} unit="m" />
        <Check label="Count the return conductor (×2)" checked={p.rt} onChange={(v) => set({ rt: v })} />
        <NumField label="Current" value={p.i} onChange={(v) => set({ i: v })} unit="A" allowZero />
        <NumField label="Supply voltage" value={p.v} onChange={(v) => set({ v })} unit="V" />
        <NumField label="Allowed drop" value={p.maxPct} onChange={(v) => set({ maxPct: v })} unit="%" />
      </Section>
    </>
  );

  return (
    <ToolPage
      title="Wire Gauge & Voltage Drop"
      description="AWG wire diameter, cross-section and resistance, the voltage drop and loss over a cable run, the smallest gauge that meets a drop limit, and the Preece fusing current."
      onReset={reset}
      properties={properties}
      status={r ? `AWG ${GAUGES.find((g) => g.n === p.n)?.label}: ${fmt(r.dropPct, 3)} % drop, ${si(r.V, 'V', 3)} · minimum gauge ${minG?.label ?? '—'}` : 'Check the inputs'}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      <Notes items={notes} />
      {r && (
        <div className="grid gap-3 xl:grid-cols-2">
          <Panel title="Results">
            <div className="flex flex-wrap gap-8 px-2.5 py-2">
              <Big label="Voltage drop" value={fmt(r.dropPct, 3)} unit="%" />
              <Big label="Smallest gauge for the limit" value={minG ? `AWG ${minG.label}` : '—'} unit="" />
            </div>
            <table className="tbl">
              <tbody>
                <Result label="Voltage drop" value={si(r.V, 'V')} strong />
                <Result label="Voltage at the load" value={si(r.loadV, 'V')} />
                <Result label="Cable resistance" value={si(r.R, 'Ω')} sub={p.rt ? 'both conductors' : 'one conductor'} />
                <Result label="Power lost in the cable" value={si(r.power, 'W')} />
              </tbody>
            </table>
          </Panel>
          <Panel title="Wire Properties">
            <table className="tbl">
              <tbody>
                <Result label="Diameter" value={fmt(r.diameterMm, 4)} unit="mm" sub={`${fmt(r.diameterMm / 25.4, 4)} in`} />
                <Result label="Cross-section" value={fmt(r.areaMm2, 4)} unit="mm²" sub={`${fmt(r.areaMm2 / (Math.PI / 4) / 0.0254 ** 2, 5)} circular mils`} />
                <Result label="Resistance" value={fmt(r.rPerKm, 4)} unit="Ω/km" sub={`at ${fmt(p.t, 3)} °C · ${fmt(r.rPerKm * 0.3048, 4)} Ω/1000 ft`} />
                <Result label="Fusing current (Preece)" value={fmt(preeceFusing(r.diameterMm, metal), 4)} unit="A" sub="bare wire in free air, long duration" />
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
      <div className="eq">
        <span className="no">(1)</span>
        <i>d</i> = 0.005 in · 92<sup>(36 − n)/39</sup>
      </div>
      <p>
        This is the definition of the American Wire Gauge in ASTM B258. Gauge 0000 is n = −3, 000 is −2, 00 is −1 and 0 is 0. Resistance uses ρ = 1.7241 µΩ·cm and α = 0.00393 /°C for
        annealed copper (IEC 60028), and 2.8264 µΩ·cm and α = 0.00403 /°C for aluminium (IEC 60889). The voltage drop counts both conductors when the return path is a wire.
      </p>
      <div className="eq">
        <span className="no">(2)</span>
        <i>I</i>
        <sub>fuse</sub> = <i>K</i> · <i>d</i>
        <sup>1.5</sup>
      </div>
      <p>
        Preece's equation (1884) gives the current that eventually melts a bare wire in still air. <i>K</i> is 10244 for copper and 7585 for aluminium, with <i>d</i> in inches. It is not a
        safe operating current. Size cables by their insulation temperature rating and the applicable wiring code.
      </p>
      <h2>References</h2>
      <ol>
        <li>ASTM B258, Standard Specification for Standard Nominal Diameters and Cross-Sectional Areas of AWG Sizes of Solid Round Wires.</li>
        <li>IEC 60028, International standard of resistance for copper.</li>
        <li>W. H. Preece, “On the Heating Effects of Electric Currents,” Proc. Royal Society, 1884.</li>
      </ol>
    </>
  );
}
