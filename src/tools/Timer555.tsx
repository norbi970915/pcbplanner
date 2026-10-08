import { SiField } from '../components/SiField';
import { ToolPage } from '../components/ToolPage';
import { Big, Check, Notes, NumField, Panel, Result, Section, Segmented, SelectField } from '../components/ui';
import type { ESeries } from '../lib/electronics';
import { fmt, si } from '../lib/units';
import { astable, designAstable, MAX_FREQ, MAX_R_15V, MAX_R_5V, MIN_PULSE, monostable, type Astable } from '../lib/timer555';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { mode: 'astable', ra: 1000, rb: 10000, c: 1e-7, diode: false, f: 1000, duty: 60, series: 'E24' };

const split = (v: number, unit: string) => {
  const [num, u] = si(v, unit, 4).split(' ');
  return { num, u };
};

export default function Timer555() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const mode = p.mode === 'design' || p.mode === 'mono' ? p.mode : 'astable';
  const series = (['E12', 'E24', 'E96'].includes(p.series) ? p.series : 'E24') as ESeries;

  const errors: string[] = [];
  const notes: string[] = [];
  if (!(p.c > 0)) errors.push('Capacitance must be greater than 0.');
  if (mode === 'astable' && !(p.ra > 0 && p.rb > 0)) errors.push('RA and RB must be greater than 0.');
  if (mode === 'mono' && !(p.ra > 0)) errors.push('RA must be greater than 0.');
  if (mode === 'design' && !(p.f > 0)) errors.push('Frequency must be greater than 0.');
  if (mode === 'design' && !(p.duty > 0 && p.duty < 100)) errors.push('Duty cycle must be between 0 and 100 %.');
  const ok = errors.length === 0;

  const a = ok && mode === 'astable' ? astable(p.ra, p.rb, p.c, p.diode) : null;
  const d = ok && mode === 'design' ? designAstable(p.f, p.duty / 100, p.c, series) : null;
  const tw = ok && mode === 'mono' ? monostable(p.ra, p.c) : null;
  const timing: Astable | null = a ?? d?.std.timing ?? null;
  const rTotal = a ? p.ra + (p.diode ? 0 : p.rb) : d ? d.std.ra + d.std.rb : tw ? p.ra : 0;
  const raUsed = a || tw ? p.ra : d ? d.std.ra : 0;

  if (ok && mode === 'design' && !d) errors.push('No resistor pair gives that frequency and duty cycle with this capacitor.');
  if (timing && timing.freq > MAX_FREQ) notes.push(`${si(timing.freq, 'Hz', 3)} is above the 100 kHz TI recommends for the bipolar 555; use a CMOS 555 such as the TLC555.`);
  if (tw !== null && tw < MIN_PULSE) notes.push(`A ${si(tw, 's', 3)} pulse is shorter than the 10 µs minimum monostable pulse of the bipolar 555.`);
  if (rTotal > MAX_R_5V) notes.push(`RA + RB = ${si(rTotal, 'Ω', 3)}. The threshold current limits it to about ${si(MAX_R_5V, 'Ω', 2)} at 5 V and ${si(MAX_R_15V, 'Ω', 2)} at 15 V; use a smaller resistor and a larger capacitor.`);
  if (raUsed > 0 && raUsed < 1000) notes.push(`RA = ${si(raUsed, 'Ω', 3)}. TI characterises the timing with RA from 1 kΩ to 100 kΩ; a smaller RA lets the discharge transistor sink VCC / RA.`);
  if (a && p.diode) notes.push('With the diode, the high time assumes an ideal diode; its forward voltage makes the real high time somewhat longer.');

  const properties = (
    <>
      <Section title="Circuit">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <span className="text-muted">Mode</span>
          <Segmented
            label="Mode"
            value={mode}
            onChange={(v) => set({ mode: v })}
            options={[
              { value: 'astable', label: 'Astable' },
              { value: 'design', label: 'Design' },
              { value: 'mono', label: 'Monostable' },
            ]}
          />
        </div>
      </Section>
      {mode === 'design' ? (
        <Section title="Target">
          <SiField label="Frequency" symbol="f" value={p.f} onChange={(v) => set({ f: v })} unit="Hz" prefixes={['m', '', 'k']} digits={6} />
          <NumField label="Duty cycle (high)" symbol="D" value={p.duty} onChange={(v) => set({ duty: v })} unit="%" hint="Output high time as a share of the period. At 50 % and below a diode across RB is needed." />
          <SiField label="Timing capacitor" symbol="C" value={p.c} onChange={(v) => set({ c: v })} unit="F" prefixes={['p', 'n', 'µ']} digits={6} />
          <SelectField
            label="Resistor series"
            value={series}
            onChange={(v) => set({ series: v })}
            options={[
              { value: 'E12', label: 'E12 (10 %)' },
              { value: 'E24', label: 'E24 (5 %)' },
              { value: 'E96', label: 'E96 (1 %)' },
            ]}
          />
        </Section>
      ) : (
        <Section title="Components">
          <SiField label="Resistor RA" symbol="RA" value={p.ra} onChange={(v) => set({ ra: v })} unit="Ω" prefixes={['', 'k', 'M']} digits={6} />
          {mode === 'astable' && <SiField label="Resistor RB" symbol="RB" value={p.rb} onChange={(v) => set({ rb: v })} unit="Ω" prefixes={['', 'k', 'M']} digits={6} />}
          <SiField label="Timing capacitor" symbol="C" value={p.c} onChange={(v) => set({ c: v })} unit="F" prefixes={['p', 'n', 'µ']} digits={6} />
          {mode === 'astable' && <Check label="Diode across RB (duty below 50 %)" checked={p.diode} onChange={(v) => set({ diode: v })} />}
        </Section>
      )}
    </>
  );

  const status = timing ? `f = ${si(timing.freq, 'Hz', 4)}, duty ${fmt(timing.duty * 100, 3)} %` : tw !== null ? `Pulse ${si(tw, 's', 4)}` : 'Check the inputs';

  return (
    <ToolPage
      title="555 Timer Calculator"
      description="Frequency, duty cycle and high and low times of a 555 astable oscillator, resistor values for a target frequency and duty cycle, and the monostable pulse width, from the TI NE555 equations."
      onReset={reset}
      properties={properties}
      status={status}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      <Notes items={notes} />
      {d && (
        <Panel title="Resistors for the target">
          <table className="tbl">
            <thead>
              <tr>
                <th><span className="sr-only">Resistor</span></th>
                <th className="v">Exact</th>
                <th className="v">Nearest {series}</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>RA</td><td className="v">{si(d.ra, 'Ω', 4)}</td><td className="v font-semibold">{si(d.std.ra, 'Ω', 3)}</td></tr>
              <tr><td>RB</td><td className="v">{si(d.rb, 'Ω', 4)}</td><td className="v font-semibold">{si(d.std.rb, 'Ω', 3)}</td></tr>
              <tr><td>Frequency</td><td className="v">{si(d.exact.freq, 'Hz', 4)}</td><td className="v">{si(d.std.timing.freq, 'Hz', 4)} ({fmt((d.std.timing.freq / p.f - 1) * 100, 2)} %)</td></tr>
              <tr><td>Duty cycle</td><td className="v">{fmt(d.exact.duty * 100, 4)} %</td><td className="v">{fmt(d.std.timing.duty * 100, 4)} %</td></tr>
            </tbody>
          </table>
          <p className="px-3 py-2 text-muted">{d.diode ? 'At 50 % duty or below, fit a diode across RB (anode at DISCH): RA then sets the high time and RB the low time.' : 'Standard astable circuit: RA from VCC to DISCH, RB from DISCH to THRES/TRIG, C to ground.'}</p>
        </Panel>
      )}
      {timing && (
        <Panel title={mode === 'design' ? `Timing with the ${series} values` : 'Astable output'} className={d ? 'mt-3' : ''}>
          <div className="flex flex-wrap gap-8 px-3 py-3">
            <Big label="Frequency" value={split(timing.freq, 'Hz').num} unit={split(timing.freq, 'Hz').u} />
            <Big label="Duty cycle" value={fmt(timing.duty * 100, 4)} unit="%" />
            <Big label="Period" value={split(timing.period, 's').num} unit={split(timing.period, 's').u} />
          </div>
          <table className="tbl">
            <tbody>
              <Result label="High time tH" value={si(timing.tHigh, 's', 4)} sub={p.diode || d?.diode ? '0.693 · RA · C' : '0.693 · (RA + RB) · C'} />
              <Result label="Low time tL" value={si(timing.tLow, 's', 4)} sub="0.693 · RB · C" />
              <Result label="Discharge (low) duty" value={`${fmt((1 - timing.duty) * 100, 4)} %`} sub="share of the period the DISCH transistor is on" />
            </tbody>
          </table>
          <div className="px-3 pb-3">
            <Waveform t={timing} />
          </div>
        </Panel>
      )}
      {tw !== null && (
        <Panel title="Monostable pulse">
          <div className="flex flex-wrap gap-8 px-3 py-3">
            <Big label="Pulse width" value={split(tw, 's').num} unit={split(tw, 's').u} />
          </div>
          <table className="tbl">
            <tbody>
              <Result label="tw = ln 3 · RA · C" value={si(tw, 's', 5)} sub={`TI's rounded 1.1 · RA · C gives ${si(1.1 * p.ra * p.c, 's', 5)}`} />
              <Result label="Maximum trigger rate" value={`below ${si(1 / tw, 'Hz', 3)}`} sub="a trigger during the pulse is ignored" />
            </tbody>
          </table>
        </Panel>
      )}
    </ToolPage>
  );
}

/** Two periods of the output and of the capacitor voltage between 1/3 and 2/3 VCC. */
function Waveform({ t }: { t: Astable }) {
  const W = 640, H = 170, ml = 70, mr = 12;
  const span = 2 * t.period;
  const x = (s: number) => ml + ((W - ml - mr) * s) / span;
  const yOut = (hi: boolean) => (hi ? 20 : 70);
  const yCap = (v: number) => 160 - v * 105; // v as a share of VCC, 1/3…2/3 → 125…90
  const out: string[] = [];
  const cap: string[] = [];
  for (let k = 0; k < 2; k++) {
    const t0 = k * t.period;
    out.push(`${x(t0)},${yOut(true)} ${x(t0 + t.tHigh)},${yOut(true)} ${x(t0 + t.tHigh)},${yOut(false)} ${x(t0 + t.period)},${yOut(false)} ${x(t0 + t.period)},${yOut(true)}`);
    // RC charge toward VCC from 1/3 to 2/3, then discharge toward 0 from 2/3 to 1/3
    for (let i = 0; i <= 24; i++) {
      const s = (i / 24) * t.tHigh;
      cap.push(`${x(t0 + s)},${yCap(1 - (2 / 3) * 2 ** (-s / t.tHigh))}`);
    }
    for (let i = 0; i <= 24; i++) {
      const s = (i / 24) * t.tLow;
      cap.push(`${x(t0 + t.tHigh + s)},${yCap((2 / 3) * 2 ** (-s / t.tLow))}`);
    }
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full max-w-[760px]" role="img" aria-label="555 output and capacitor waveforms">
      <text x={4} y={48} className="fill-[var(--muted)] text-[11px]">Output</text>
      <text x={4} y={128} className="fill-[var(--muted)] text-[11px]">Capacitor</text>
      <line x1={ml} x2={W - mr} y1={yCap(2 / 3)} y2={yCap(2 / 3)} stroke="var(--line)" strokeDasharray="3 3" />
      <line x1={ml} x2={W - mr} y1={yCap(1 / 3)} y2={yCap(1 / 3)} stroke="var(--line)" strokeDasharray="3 3" />
      <text x={W - mr} y={yCap(2 / 3) - 3} textAnchor="end" className="fill-[var(--faint)] text-[10px]">⅔ VCC</text>
      <text x={W - mr} y={yCap(1 / 3) + 11} textAnchor="end" className="fill-[var(--faint)] text-[10px]">⅓ VCC</text>
      <polyline points={`${x(0)},${yOut(false)} ${out.join(' ')}`} fill="none" stroke="var(--accent)" strokeWidth={2} />
      <polyline points={cap.join(' ')} fill="none" stroke="#d08a3c" strokeWidth={2} />
    </svg>
  );
}

export function Method() {
  return (
    <>
      <h2>Astable oscillator</h2>
      <p>
        The capacitor charges through RA and RB until it reaches 2/3 VCC, then discharges through RB into the DISCH pin until it falls to 1/3 VCC. Each interval is an RC exponential between those two
        levels, which takes ln 2 ≈ 0.693 time constants, so the timing does not depend on the supply voltage:
      </p>
      <div className="eq">
        <span className="no">(1)</span>
        <i>t</i>
        <sub>H</sub> = 0.693 (<i>R</i>
        <sub>A</sub> + <i>R</i>
        <sub>B</sub>) <i>C</i>, <i>t</i>
        <sub>L</sub> = 0.693 <i>R</i>
        <sub>B</sub> <i>C</i>
      </div>
      <div className="eq">
        <span className="no">(2)</span>
        <i>f</i> = 1 / (<i>t</i>
        <sub>H</sub> + <i>t</i>
        <sub>L</sub>) ≈ 1.44 / ((<i>R</i>
        <sub>A</sub> + 2<i>R</i>
        <sub>B</sub>) <i>C</i>), duty = (<i>R</i>
        <sub>A</sub> + <i>R</i>
        <sub>B</sub>) / (<i>R</i>
        <sub>A</sub> + 2<i>R</i>
        <sub>B</sub>)
      </div>
      <p>
        The output is high while the capacitor charges, so its duty cycle is always above 50 % in this circuit. A diode across RB (anode at DISCH) bypasses RB during charging: the high time becomes
        0.693 RA C and any duty cycle is possible.
      </p>
      <h2>Monostable (one-shot)</h2>
      <p>A trigger below 1/3 VCC starts the pulse; the capacitor then charges through RA from 0 to 2/3 VCC, which takes ln 3 ≈ 1.1 time constants:</p>
      <div className="eq">
        <span className="no">(3)</span>
        <i>t</i>
        <sub>w</sub> = 1.1 <i>R</i>
        <sub>A</sub> <i>C</i>
      </div>
      <h2>Limits of the bipolar 555</h2>
      <ul>
        <li>TI recommends astable operation at 100 kHz or below; use a CMOS timer such as the TLC555 above that.</li>
        <li>The shortest monostable pulse is about 10 µs.</li>
        <li>The threshold input current flows through the timing resistors, which limits RA + RB to about 3.4 MΩ at 5 V and 10 MΩ at 15 V.</li>
        <li>Timing drifts by roughly 50 ppm/°C (monostable) to 150 ppm/°C (astable) for the NE555, before the capacitor's own tolerance and drift. Use a film or C0G capacitor for stable timing.</li>
      </ul>
      <h2>References</h2>
      <ol>
        <li>
          <a href="https://www.ti.com/lit/ds/symlink/ne555.pdf" target="_blank" rel="noopener noreferrer">
            TI SLFS022K, NA555, NE555, SA555, SE555 Precision Timers
          </a>
          , sections 5.5, 5.6 and 6.3.
        </li>
      </ol>
    </>
  );
}
