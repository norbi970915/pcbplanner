import { ToolPage } from '../components/ToolPage';
import { Big, Notes, NumField, Panel, Result, Section } from '../components/ui';
import { buck } from '../lib/power';
import { fmt, si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { vmin: 10.8, vnom: 12, vmax: 13.2, vout: 3.3, iout: 2, fs: 500, eff: 90, rr: 30, l: 0, dv: 20, esr: 5, ilim: 0, dvin: 100, vf: 0 };

export default function Buck() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const errors: string[] = [];
  if (!(p.vout > 0)) errors.push('Output voltage must be greater than 0.');
  if (!(p.vmin > 0 && p.vmin <= p.vnom && p.vnom <= p.vmax)) errors.push('Input voltages must satisfy 0 < Vin,min ≤ Vin,nom ≤ Vin,max.');
  if (!(p.iout > 0)) errors.push('Output current must be greater than 0.');
  if (!(p.fs > 0)) errors.push('Switching frequency must be greater than 0.');
  if (!(p.eff > 0 && p.eff <= 100)) errors.push('Efficiency must be between 0 and 100 %.');
  if (!(p.rr > 0 && p.rr <= 200)) errors.push('Ripple ratio must be between 0 and 200 %.');
  if (!(p.dv > 0)) errors.push('Output ripple must be greater than 0.');
  if (!(p.dvin > 0)) errors.push('Input ripple must be greater than 0.');
  if (p.l < 0 || p.esr < 0 || p.ilim < 0 || p.vf < 0) errors.push('Values cannot be negative.');
  const r = errors.length
    ? null
    : buck({
        vinMin: p.vmin,
        vinNom: p.vnom,
        vinMax: p.vmax,
        vout: p.vout,
        iout: p.iout,
        fs: p.fs * 1e3,
        eff: p.eff / 100,
        rippleRatio: p.rr / 100,
        l: p.l > 0 ? p.l * 1e-6 : undefined,
        dvout: p.dv * 1e-3,
        esr: p.esr * 1e-3,
        ilim: p.ilim > 0 ? p.ilim : undefined,
        dvin: p.dvin * 1e-3,
        vf: p.vf > 0 ? p.vf : undefined,
      });
  const notes: string[] = [];
  if (r) {
    if (r.dMinVin >= 1) notes.push('The output voltage is too close to the minimum input: the duty cycle reaches 100 %. A buck converter cannot regulate there.');
    else if (r.dMinVin > 0.9) notes.push(`Maximum duty cycle ${fmt(100 * r.dMinVin, 3)} %. Check the IC's maximum duty cycle / minimum off-time.`);
    if (r.iMaxOut !== undefined && r.iMaxOut < p.iout) notes.push(`The IC can deliver only ${fmt(r.iMaxOut, 3)} A with this ripple (current limit − ΔIL/2). Use a larger inductor, a higher frequency or an IC with a higher current limit.`);
    const onTime = r.dMaxVin / (p.fs * 1e3);
    if (onTime < 100e-9) notes.push(`Minimum on-time is ${si(onTime, 's', 3)} at Vin,max. Many controllers need more than 60–150 ns; check the datasheet.`);
  }

  const properties = (
    <>
      <Section title="Input / Output">
        <NumField label="Input voltage min." symbol="Vin,min" value={p.vmin} onChange={(v) => set({ vmin: v })} unit="V" />
        <NumField label="Input voltage nominal" symbol="Vin" value={p.vnom} onChange={(v) => set({ vnom: v })} unit="V" />
        <NumField label="Input voltage max." symbol="Vin,max" value={p.vmax} onChange={(v) => set({ vmax: v })} unit="V" />
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
        <NumField label="Ripple current (of Iout)" value={p.rr} onChange={(v) => set({ rr: v })} unit="%" hint="TI recommends 20–40 % of the output current." />
        <NumField label="Inductor used" symbol="L" value={p.l} onChange={(v) => set({ l: v })} unit="µH" allowZero hint="0 = use the calculated value." />
      </Section>
      <Section title="Capacitors">
        <NumField label="Output ripple (capacitive)" symbol="ΔVout" value={p.dv} onChange={(v) => set({ dv: v })} unit="mV" />
        <NumField label="Output capacitor ESR" value={p.esr} onChange={(v) => set({ esr: v })} unit="mΩ" allowZero />
        <NumField label="Input ripple" symbol="ΔVin" value={p.dvin} onChange={(v) => set({ dvin: v })} unit="mV" />
      </Section>
    </>
  );

  return (
    <ToolPage
      title="Buck Converter Calculator"
      description="Step-down (buck) converter power stage in continuous conduction: duty cycle, inductor value and ripple current, peak switch current, output and input capacitors, ESR ripple and rectifier diode, after TI SLVA477B."
      onReset={reset}
      properties={properties}
      status={r ? `L = ${si(r.l, 'H', 3)} · ΔIL = ${fmt(r.dIl, 3)} A · Isw,max = ${fmt(r.iSwMax, 3)} A · Cout ≥ ${si(r.coutMin, 'F', 3)}` : 'Check the inputs'}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      <Notes items={notes} />
      {r && (
        <div className="grid gap-3 xl:grid-cols-2">
          <Panel title="Inductor">
            <div className="flex flex-wrap gap-8 px-2.5 py-2">
              <Big label={p.l > 0 ? 'Inductor used' : 'Calculated inductor'} value={si(r.l, 'H', 3).replace(/H$/, '')} unit="H" />
              <Big label="Peak current" value={fmt(r.iSwMax, 3)} unit="A" />
            </div>
            <table className="tbl">
              <tbody>
                {p.l > 0 && <Result label="Calculated inductor" value={si(r.lCalc, 'H', 3)} sub={`for ${fmt(p.rr, 3)} % ripple at Vin = ${fmt(p.vnom, 4)} V`} />}
                <Result label="Ripple current ΔIL" value={fmt(r.dIl, 4)} unit="A" sub="at Vin,max (worst case)" strong />
                <Result label="Peak switch / inductor current" value={fmt(r.iSwMax, 4)} unit="A" sub="Iout + ΔIL/2: the inductor saturation rating must exceed this" />
                <Result label="Inductor RMS current" value={fmt(r.ilRms, 4)} unit="A" sub="for the heating (Irms) rating" />
                {r.iMaxOut !== undefined && <Result label="Max. output current of the IC" value={fmt(r.iMaxOut, 4)} unit="A" sub="Ilim,min − ΔIL/2" />}
              </tbody>
            </table>
          </Panel>
          <Panel title="Duty Cycle">
            <table className="tbl">
              <tbody>
                <Result label="At Vin,min" value={`${fmt(100 * r.dMinVin, 4)} %`} />
                <Result label="At Vin,nom" value={`${fmt(100 * r.dNom, 4)} %`} />
                <Result label="At Vin,max" value={`${fmt(100 * r.dMaxVin, 4)} %`} sub={`on-time ${si(r.dMaxVin / (p.fs * 1e3), 's', 3)}`} />
              </tbody>
            </table>
          </Panel>
          <Panel title="Output Capacitor">
            <table className="tbl">
              <tbody>
                <Result label="Minimum capacitance" value={si(r.coutMin, 'F', 3)} strong sub={`for ${fmt(p.dv, 4)} mV capacitive ripple`} />
                <Result label="ESR ripple" value={fmt(r.dvEsr * 1e3, 4)} unit="mV" sub="adds to the capacitive ripple" />
                <Result label="Total ripple estimate" value={fmt((r.dvEsr + p.dv * 1e-3) * 1e3, 4)} unit="mV" sub="conservative sum" />
                <Result label="Capacitor RMS current" value={fmt(r.dIl / Math.sqrt(12), 4)} unit="A" sub="ΔIL / √12" />
              </tbody>
            </table>
          </Panel>
          <Panel title="Input Capacitor and Diode">
            <table className="tbl">
              <tbody>
                <Result label="Minimum input capacitance" value={si(r.cinMin, 'F', 3)} strong sub={`for ${fmt(p.dvin, 4)} mV ripple, ESR not included`} />
                <Result label="Input capacitor RMS current" value={fmt(r.icinRms, 4)} unit="A" sub="Iout·√(D(1−D)), worst case over the input range" />
                <Result label="Diode average current" value={fmt(r.iDiode, 4)} unit="A" sub="non-synchronous: Iout·(1 − D) at Vin,max" />
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
      <p>
        The calculator follows TI application report SLVA477B for a buck converter with an integrated switch in continuous conduction mode. Synchronous converters use the same
        equations without the diode.
      </p>
      <div className="eq">
        <span className="no">(1)</span>
        <i>D</i> = <i>V</i>
        <sub>out</sub> / (<i>V</i>
        <sub>in</sub> · η)
      </div>
      <div className="eq">
        <span className="no">(2)</span>
        <i>L</i> = <i>V</i>
        <sub>out</sub> (<i>V</i>
        <sub>in</sub> − <i>V</i>
        <sub>out</sub>) / (Δ<i>I</i>
        <sub>L</sub> · <i>f</i>
        <sub>s</sub> · <i>V</i>
        <sub>in</sub>),&nbsp;&nbsp; Δ<i>I</i>
        <sub>L</sub> = (0.2…0.4) · <i>I</i>
        <sub>out</sub>
      </div>
      <div className="eq">
        <span className="no">(3)</span>Δ<i>I</i>
        <sub>L</sub> = (<i>V</i>
        <sub>in,max</sub> − <i>V</i>
        <sub>out</sub>) · <i>D</i> / (<i>f</i>
        <sub>s</sub> · <i>L</i>),&nbsp;&nbsp; <i>I</i>
        <sub>SW,max</sub> = Δ<i>I</i>
        <sub>L</sub>/2 + <i>I</i>
        <sub>out</sub>
      </div>
      <div className="eq">
        <span className="no">(4)</span>
        <i>C</i>
        <sub>out,min</sub> = Δ<i>I</i>
        <sub>L</sub> / (8 · <i>f</i>
        <sub>s</sub> · Δ<i>V</i>
        <sub>out</sub>),&nbsp;&nbsp; Δ<i>V</i>
        <sub>ESR</sub> = ESR · Δ<i>I</i>
        <sub>L</sub>
      </div>
      <p>
        The duty cycle uses the estimated efficiency because the converter also has to supply its own losses. The ripple current and switch current are evaluated at the maximum input
        voltage, where they are largest. The inductor estimate uses the nominal input voltage, as in SLVA477B.
      </p>
      <p>
        The input capacitor is sized by charge balance, <i>C</i>
        <sub>in</sub> = <i>I</i>
        <sub>out</sub>·<i>D</i>(1 − <i>D</i>) / (<i>f</i>
        <sub>s</sub>·Δ<i>V</i>
        <sub>in</sub>). Its RMS current, <i>I</i>
        <sub>out</sub>·√(<i>D</i>(1 − <i>D</i>)), is highest at <i>D</i> = 0.5. The tool uses the duty cycle in the input range that is closest to 0.5.
      </p>
      <h3>Practical notes</h3>
      <ul>
        <li>Ceramic capacitors lose much of their capacitance under DC bias. Use X5R/X7R and check the derated value at the operating voltage.</li>
        <li>Internally compensated converters need the L and C values from their datasheet. These equations size the parts; they do not check loop stability.</li>
        <li>Choose an inductor whose saturation current is above the peak current, with margin for the current-limit threshold during faults.</li>
      </ul>
      <h2>References</h2>
      <ol>
        <li>
          B. Hauke, “Basic Calculation of a Buck Converter's Power Stage,” Texas Instruments SLVA477B, 2015. Equation 1 of the main text is used; the appendix prints η in the numerator.
        </li>
        <li>R. W. Erickson, D. Maksimović, <i>Fundamentals of Power Electronics</i>, Springer.</li>
      </ol>
    </>
  );
}
