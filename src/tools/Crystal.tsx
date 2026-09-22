import { SiField } from '../components/SiField';
import { ToolPage } from '../components/ToolPage';
import { Big, Notes, NumField, Panel, Result, Section, SelectField } from '../components/ui';
import { crystalCL, crystalLoadCap, crystalPullPpm, driftSecondsPerDay, eNearest, eNeighbors, freqErrorFromPpm, ppmFromFreq } from '../lib/electronics';
import { fmt, si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

// Capacitances in pF, Cm in fF. The measured frequency is stored as an offset
// from nominal (df, Hz) so the URL keeps full precision.
const DEFAULTS = { cl: 18, cs: 4, cm: 0, c0: 2, f: 25e6, pmode: 'meas', df: 250, ppm: 20 };

export default function Crystal() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const errors: string[] = [];
  if (!(p.cl > 0)) errors.push('Load capacitance must be greater than 0.');
  if (!(p.cs >= 0)) errors.push('Stray capacitance cannot be negative.');
  if (p.cl > 0 && p.cs >= p.cl) errors.push('Stray capacitance must be smaller than the load capacitance.');
  if (!(p.cm >= 0) || !(p.c0 >= 0)) errors.push('Crystal capacitances cannot be negative.');
  const okCap = errors.length === 0;
  const errP: string[] = [];
  if (!(p.f > 0)) errP.push('Nominal frequency must be greater than 0.');
  const byMeas = p.pmode !== 'ppm';

  const c = okCap ? crystalLoadCap(p.cl, p.cs) : NaN;
  const pull = (clAct: number) => (p.cm > 0 ? crystalPullPpm(p.cm * 1e-3, p.c0, clAct, p.cl) : NaN);
  const rows = okCap
    ? (['E12', 'E24'] as const).flatMap((s) => {
        const n = eNearest(c, s);
        const { below, above } = eNeighbors(c, s);
        return [...new Set([below, above])].map((v) => ({ s, v, nearest: v === n, cl: crystalCL(v, v, p.cs) }));
      })
    : [];

  const ppm = byMeas ? ppmFromFreq(p.f, p.f + p.df) : p.ppm;
  const dfHz = byMeas ? p.df : freqErrorFromPpm(p.f, p.ppm);
  const drift = driftSecondsPerDay(ppm);

  const properties = (
    <>
      <Section title="Load capacitors">
        <NumField label="Crystal load capacitance" symbol="CL" value={p.cl} onChange={(v) => set({ cl: v })} unit="pF" />
        <NumField
          label="Stray capacitance"
          symbol="Cs"
          value={p.cs}
          onChange={(v) => set({ cs: v })}
          unit="pF"
          allowZero
          hint="Pin, trace and oscillator input capacitance in parallel with the crystal. 2–5 pF is typical."
        />
      </Section>
      <Section title="Crystal model (optional)">
        <NumField label="Motional capacitance" symbol="Cm" value={p.cm} onChange={(v) => set({ cm: v })} unit="fF" allowZero hint="C1 in the datasheet. 0 = no pulling estimate." />
        <NumField label="Shunt capacitance" symbol="C0" value={p.c0} onChange={(v) => set({ c0: v })} unit="pF" allowZero />
      </Section>
      <Section title="Frequency error">
        <SelectField
          label="Calculate"
          value={byMeas ? 'meas' : 'ppm'}
          onChange={(v) => set({ pmode: v })}
          options={[
            { value: 'meas', label: 'ppm from frequency' },
            { value: 'ppm', label: 'Frequency from ppm' },
          ]}
          width={160}
        />
        <SiField label="Nominal frequency" symbol="f" value={p.f} onChange={(v) => set({ f: v })} unit="Hz" prefixes={['', 'k', 'M']} digits={10} />
        {byMeas ? (
          <SiField label="Measured frequency" value={p.f + p.df} onChange={(v) => set({ df: v - p.f })} unit="Hz" prefixes={['', 'k', 'M']} digits={12} />
        ) : (
          <NumField label="Error" value={p.ppm} onChange={(v) => set({ ppm: v })} unit="ppm" allowNegative />
        )}
      </Section>
    </>
  );

  return (
    <ToolPage
      title="Crystal Load Capacitors & PPM"
      description="Load capacitor values for a Pierce crystal oscillator with the nearest E12 and E24 parts, the frequency pulling they cause, and conversion between frequency error, ppm and clock drift."
      onReset={reset}
      properties={properties}
      status={okCap ? `C1 = C2 = ${fmt(c, 4)} pF (E12 ${fmt(eNearest(c, 'E12'), 3)} pF), ${fmt(ppm, 4)} ppm` : 'Check the inputs'}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      {okCap && (
        <Panel title="Load capacitors">
          <div className="flex flex-wrap gap-8 px-3 py-3">
            <Big label="C1 = C2 (exact)" value={fmt(c, 4)} unit="pF" />
            <Big label="Nearest E12" value={fmt(eNearest(c, 'E12'), 3)} unit="pF" />
            <Big label="Nearest E24" value={fmt(eNearest(c, 'E24'), 3)} unit="pF" />
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th className="text-left">Series</th>
                <th className="v">C1 = C2</th>
                <th className="v">Resulting CL</th>
                <th className="v">CL error</th>
                <th className="v">Frequency shift</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.s}-${r.v}`}>
                  <td className={r.nearest ? 'font-semibold' : ''}>
                    {r.s}
                    {r.nearest ? ' (nearest)' : ''}
                  </td>
                  <td className="v">{fmt(r.v, 3)} pF</td>
                  <td className="v">{fmt(r.cl, 4)} pF</td>
                  <td className="v">
                    {r.cl >= p.cl ? '+' : ''}
                    {fmt(r.cl - p.cl, 3)} pF
                  </td>
                  <td className="v">{p.cm > 0 ? `${pull(r.cl) >= 0 ? '+' : ''}${fmt(pull(r.cl), 3)} ppm` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-muted">
            {p.cm > 0
              ? `Frequency shift relative to the calibrated frequency at CL = ${fmt(p.cl, 4)} pF, for Cm = ${fmt(p.cm, 3)} fF and C0 = ${fmt(p.c0, 3)} pF.`
              : 'Enter the motional capacitance Cm and shunt capacitance C0 from the crystal datasheet to see the frequency shift caused by each capacitor choice.'}
          </p>
        </Panel>
      )}
      <Notes kind="error" items={errP} />
      {errP.length === 0 && (
        <Panel title="Frequency error and drift">
          <table className="tbl">
            <tbody>
              <Result label="Frequency error" value={si(dfHz, 'Hz')} strong={!byMeas} sub={`actual ${si(p.f + dfHz, 'Hz', 10)}`} />
              <Result label="Relative error" value={fmt(ppm, 5)} unit="ppm" strong={byMeas} sub={`${fmt(ppm * 1e3, 5)} ppb, ${fmt(ppm * 1e-4, 4)} %`} />
              <Result label="Clock drift per day" value={fmt(drift, 4)} unit="s" />
              <Result label="Clock drift per 30 days" value={fmt(drift * 30, 4)} unit="s" sub={`${fmt((drift * 30) / 60, 4)} min`} />
              <Result label="Clock drift per year" value={fmt(drift * 365.25, 4)} unit="s" sub={`${fmt((drift * 365.25) / 60, 4)} min`} />
            </tbody>
          </table>
        </Panel>
      )}
    </ToolPage>
  );
}

export function Method() {
  return (
    <>
      <h2>Load capacitors</h2>
      <p>
        In a Pierce oscillator the crystal sees the two load capacitors in series plus the stray capacitance of the pins and traces. The crystal is calibrated by the manufacturer at a stated
        load capacitance <i>C</i>
        <sub>L</sub>, and the circuit must present that value:
      </p>
      <div className="eq">
        <span className="no">(1)</span>
        <i>C</i>
        <sub>L</sub> = <i>C</i>
        <sub>1</sub>
        <i>C</i>
        <sub>2</sub> / (<i>C</i>
        <sub>1</sub> + <i>C</i>
        <sub>2</sub>) + <i>C</i>
        <sub>stray</sub>, so with <i>C</i>
        <sub>1</sub> = <i>C</i>
        <sub>2</sub>: <i>C</i>
        <sub>1</sub> = <i>C</i>
        <sub>2</sub> = 2 (<i>C</i>
        <sub>L</sub> − <i>C</i>
        <sub>stray</sub>)
      </div>
      <p>
        The stray capacitance is usually 2–5 pF; it is not known exactly, so check the frequency on the first boards. E12 and E24 are the IEC 60063 preferred-value series.
      </p>
      <h2>Frequency pulling</h2>
      <p>
        Using the Butterworth–Van Dyke model (motional capacitance <i>C</i>
        <sub>m</sub>, shunt capacitance <i>C</i>
        <sub>0</sub>), the load-resonant frequency is approximately
      </p>
      <div className="eq">
        <span className="no">(2)</span>
        <i>f</i>
        <sub>L</sub> ≈ <i>f</i>
        <sub>s</sub> (1 + <i>C</i>
        <sub>m</sub> / (2 (<i>C</i>
        <sub>0</sub> + <i>C</i>
        <sub>L</sub>)))
      </div>
      <p>
        so a load capacitance other than the specified one shifts the frequency by <i>C</i>
        <sub>m</sub>/2 · [1/(<i>C</i>
        <sub>0</sub> + <i>C</i>
        <sub>L,actual</sub>) − 1/(<i>C</i>
        <sub>0</sub> + <i>C</i>
        <sub>L,spec</sub>)]. A smaller load capacitance raises the frequency.
      </p>
      <h2>PPM and drift</h2>
      <div className="eq">
        <span className="no">(3)</span>
        ppm = (<i>f</i>
        <sub>actual</sub> − <i>f</i>
        <sub>nominal</sub>) / <i>f</i>
        <sub>nominal</sub> · 10<sup>6</sup>; drift = ppm · 10<sup>−6</sup> · 86 400 s/day
      </div>
      <p>For example, a 20 ppm error makes a clock gain or lose 1.728 s per day, about 10.5 min per year.</p>
      <h2>References</h2>
      <ol>
        <li>E. A. Vittoz, M. G. R. Degrauwe, S. Bitz, "High-performance crystal oscillator circuits: theory and application", IEEE J. Solid-State Circuits, vol. 23, no. 3, 1988.</li>
        <li>STMicroelectronics AN2867, Guidelines for oscillator design on STM8AF/AL/S and STM32 MCUs/MPUs.</li>
        <li>IEC 60063, Preferred number series for resistors and capacitors.</li>
      </ol>
    </>
  );
}
