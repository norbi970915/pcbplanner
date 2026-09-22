import { ToolPage } from '../components/ToolPage';
import { Big, Notes, NumField, Panel, Result, Section } from '../components/ui';
import { boost } from '../lib/power';
import { fmt, si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { vmin: 3, vnom: 3.7, vout: 5, iout: 1, fs: 1000, eff: 85, rr: 30, l: 0, dv: 30, esr: 5, ilim: 0, vf: 0 };

export default function Boost() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const errors: string[] = [];
  if (!(p.vmin > 0 && p.vmin <= p.vnom)) errors.push('Input voltages must satisfy 0 < Vin,min ≤ Vin,nom.');
  if (!(p.vout > p.vnom)) errors.push('A boost converter needs Vout above the input voltage.');
  if (!(p.iout > 0)) errors.push('Output current must be greater than 0.');
  if (!(p.fs > 0)) errors.push('Switching frequency must be greater than 0.');
  if (!(p.eff > 0 && p.eff <= 100)) errors.push('Efficiency must be between 0 and 100 %.');
  if (!(p.rr > 0 && p.rr <= 200)) errors.push('Ripple ratio must be between 0 and 200 %.');
  if (!(p.dv > 0)) errors.push('Output ripple must be greater than 0.');
  if (p.l < 0 || p.esr < 0 || p.ilim < 0 || p.vf < 0) errors.push('Values cannot be negative.');
  const r = errors.length
    ? null
    : boost({
        vinMin: p.vmin,
        vinNom: p.vnom,
        vout: p.vout,
        iout: p.iout,
        fs: p.fs * 1e3,
        eff: p.eff / 100,
        rippleRatio: p.rr / 100,
        l: p.l > 0 ? p.l * 1e-6 : undefined,
        dvout: p.dv * 1e-3,
        esr: p.esr * 1e-3,
        ilim: p.ilim > 0 ? p.ilim : undefined,
        vf: p.vf > 0 ? p.vf : undefined,
      });
  const notes: string[] = [];
  if (r) {
    if (r.d <= 0) notes.push('With this efficiency the input already reaches Vout: no boosting is needed at Vin,min.');
    if (r.d > 0.85) notes.push(`Duty cycle ${fmt(100 * r.d, 3)} %. Boost converters become inefficient and hard to control above about 85–90 %. Consider a lower ratio or a different topology.`);
    if (r.iMaxOut !== undefined && r.iMaxOut < p.iout) notes.push(`The IC can deliver only ${fmt(r.iMaxOut, 3)} A at Vin,min: (Ilim − ΔIL/2)·(1 − D). Use a larger inductor or an IC with a higher current limit.`);
  }

  const properties = (
    <>
      <Section title="Input / Output">
        <NumField label="Input voltage min." symbol="Vin,min" value={p.vmin} onChange={(v) => set({ vmin: v })} unit="V" />
        <NumField label="Input voltage nominal" symbol="Vin" value={p.vnom} onChange={(v) => set({ vnom: v })} unit="V" />
        <NumField label="Output voltage" symbol="Vout" value={p.vout} onChange={(v) => set({ vout: v })} unit="V" />
        <NumField label="Max. output current" symbol="Iout" value={p.iout} onChange={(v) => set({ iout: v })} unit="A" />
      </Section>
      <Section title="Converter">
        <NumField label="Switching frequency (min.)" symbol="fs" value={p.fs} onChange={(v) => set({ fs: v })} unit="kHz" />
        <NumField label="Estimated efficiency" symbol="η" value={p.eff} onChange={(v) => set({ eff: v })} unit="%" />
        <NumField label="Switch current limit (min.)" value={p.ilim} onChange={(v) => set({ ilim: v })} unit="A" allowZero hint="From the IC datasheet; 0 = skip the check." />
        <NumField label="Diode forward voltage" value={p.vf} onChange={(v) => set({ vf: v })} unit="V" allowZero hint="Non-synchronous converters only; 0 = synchronous." />
      </Section>
      <Section title="Inductor">
        <NumField label="Ripple (of Iout·Vout/Vin)" value={p.rr} onChange={(v) => set({ rr: v })} unit="%" hint="TI recommends 20–40 %." />
        <NumField label="Inductor used" symbol="L" value={p.l} onChange={(v) => set({ l: v })} unit="µH" allowZero hint="0 = use the calculated value." />
      </Section>
      <Section title="Output Capacitor">
        <NumField label="Output ripple (capacitive)" symbol="ΔVout" value={p.dv} onChange={(v) => set({ dv: v })} unit="mV" />
        <NumField label="Capacitor ESR" value={p.esr} onChange={(v) => set({ esr: v })} unit="mΩ" allowZero />
      </Section>
    </>
  );

  return (
    <ToolPage
      title="Boost Converter Calculator"
      description="Step-up (boost) converter power stage in continuous conduction: duty cycle, inductor value and ripple current, peak switch current, maximum output current of the IC, output capacitor, ESR ripple and rectifier diode, after TI SLVA372D."
      onReset={reset}
      properties={properties}
      status={r ? `D = ${fmt(100 * r.d, 3)} % · L = ${si(r.l, 'H', 3)} · Isw,max = ${fmt(r.iSwMax, 3)} A · Cout ≥ ${si(r.coutMin, 'F', 3)}` : 'Check the inputs'}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      <Notes items={notes} />
      {r && r.d > 0 && (
        <div className="grid gap-3 xl:grid-cols-2">
          <Panel title="Inductor">
            <div className="flex flex-wrap gap-8 px-2.5 py-2">
              <Big label={p.l > 0 ? 'Inductor used' : 'Calculated inductor'} value={si(r.l, 'H', 3).replace(/H$/, '')} unit="H" />
              <Big label="Peak current" value={fmt(r.iSwMax, 3)} unit="A" />
            </div>
            <table className="tbl">
              <tbody>
                {p.l > 0 && <Result label="Calculated inductor" value={si(r.lCalc, 'H', 3)} sub={`for ${fmt(p.rr, 3)} % ripple at Vin = ${fmt(p.vnom, 4)} V`} />}
                <Result label="Ripple current ΔIL" value={fmt(r.dIl, 4)} unit="A" sub="at Vin,min" strong />
                <Result label="Peak switch / inductor current" value={fmt(r.iSwMax, 4)} unit="A" sub="ΔIL/2 + Iout/(1 − D)" />
                <Result label="Average inductor (input) current" value={fmt(r.ilAvg, 4)} unit="A" />
                <Result label="Inductor RMS current" value={fmt(r.ilRms, 4)} unit="A" />
                {r.iMaxOut !== undefined && <Result label="Max. output current of the IC" value={fmt(r.iMaxOut, 4)} unit="A" sub="(Ilim,min − ΔIL/2)·(1 − D)" />}
              </tbody>
            </table>
          </Panel>
          <Panel title="Duty Cycle, Capacitor and Diode">
            <table className="tbl">
              <tbody>
                <Result label="Duty cycle at Vin,min" value={`${fmt(100 * r.d, 4)} %`} strong />
                <Result label="Duty cycle at Vin,nom" value={`${fmt(100 * r.dNom, 4)} %`} />
                <Result label="Minimum output capacitance" value={si(r.coutMin, 'F', 3)} strong sub={`for ${fmt(p.dv, 4)} mV capacitive ripple`} />
                <Result label="ESR ripple" value={fmt(r.dvEsr * 1e3, 4)} unit="mV" sub="ESR·(Iout/(1 − D) + ΔIL/2)" />
                <Result label="Diode average current" value={fmt(r.iDiode, 4)} unit="A" />
                {r.pDiode !== undefined && <Result label="Diode dissipation" value={fmt(r.pDiode, 4)} unit="W" />}
              </tbody>
            </table>
          </Panel>
        </div>
      )}
    </ToolPage>
  );
}

function Method() {
  return (
    <>
      <h2>Equations</h2>
      <p>The calculator follows TI application note SLVA372D for a boost converter with an integrated switch in continuous conduction mode.</p>
      <div className="eq">
        <span className="no">(1)</span>
        <i>D</i> = 1 − <i>V</i>
        <sub>in,min</sub> · η / <i>V</i>
        <sub>out</sub>
      </div>
      <div className="eq">
        <span className="no">(2)</span>
        <i>L</i> = <i>V</i>
        <sub>in</sub> (<i>V</i>
        <sub>out</sub> − <i>V</i>
        <sub>in</sub>) / (Δ<i>I</i>
        <sub>L</sub> · <i>f</i>
        <sub>s</sub> · <i>V</i>
        <sub>out</sub>),&nbsp;&nbsp; Δ<i>I</i>
        <sub>L</sub> = (0.2…0.4) · <i>I</i>
        <sub>out</sub> · <i>V</i>
        <sub>out</sub>/<i>V</i>
        <sub>in</sub>
      </div>
      <div className="eq">
        <span className="no">(3)</span>Δ<i>I</i>
        <sub>L</sub> = <i>V</i>
        <sub>in,min</sub> · <i>D</i> / (<i>f</i>
        <sub>s</sub> · <i>L</i>),&nbsp;&nbsp; <i>I</i>
        <sub>SW,max</sub> = Δ<i>I</i>
        <sub>L</sub>/2 + <i>I</i>
        <sub>out</sub>/(1 − <i>D</i>)
      </div>
      <div className="eq">
        <span className="no">(4)</span>
        <i>C</i>
        <sub>out,min</sub> = <i>I</i>
        <sub>out</sub> · <i>D</i> / (<i>f</i>
        <sub>s</sub> · Δ<i>V</i>
        <sub>out</sub>),&nbsp;&nbsp; Δ<i>V</i>
        <sub>ESR</sub> = ESR · (<i>I</i>
        <sub>out</sub>/(1 − <i>D</i>) + Δ<i>I</i>
        <sub>L</sub>/2)
      </div>
      <p>
        The worst case for a boost converter is the minimum input voltage: the duty cycle, the input current and the switch current are all highest there. The output capacitor supplies
        the whole load current while the switch is on, which is why a boost needs much more output capacitance than a buck for the same ripple.
      </p>
      <h2>References</h2>
      <ol>
        <li>B. Hauke, “Basic Calculation of a Boost Converter's Power Stage,” Texas Instruments SLVA372D, 2022.</li>
        <li>R. W. Erickson, D. Maksimović, <i>Fundamentals of Power Electronics</i>, Springer.</li>
      </ol>
    </>
  );
}
