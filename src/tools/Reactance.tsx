import { SiField } from '../components/SiField';
import { ToolPage } from '../components/ToolPage';
import { Big, Notes, Panel, Result, Section, SelectField } from '../components/ui';
import { cForResonance, lcImpedance, lForResonance, resonantFreq } from '../lib/electronics';
import { fmt, si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { mode: 'f0', L: 10e-6, C: 100e-12, f0: 10e6, f: 1e6, rs: 0, rp: 0 };
type Mode = 'f0' | 'L' | 'C';

export default function Reactance() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const mode = (['f0', 'L', 'C'].includes(p.mode) ? p.mode : 'f0') as Mode;
  const errors: string[] = [];
  if (mode !== 'L' && !(p.L > 0)) errors.push('Inductance must be greater than 0.');
  if (mode !== 'C' && !(p.C > 0)) errors.push('Capacitance must be greater than 0.');
  if (mode !== 'f0' && !(p.f0 > 0)) errors.push('Target resonant frequency must be greater than 0.');
  if (!(p.f > 0)) errors.push('Frequency must be greater than 0.');
  if (!(p.rs >= 0) || !(p.rp >= 0)) errors.push('Resistances cannot be negative.');
  const ok = errors.length === 0;
  const L = mode === 'L' ? lForResonance(p.f0, p.C) : p.L;
  const C = mode === 'C' ? cForResonance(p.f0, p.L) : p.C;
  const f0 = ok ? resonantFreq(L, C) : NaN;
  const z = ok ? lcImpedance(p.f, L, C, p.rs, p.rp) : null;
  const z0 = ok ? lcImpedance(f0, L, C, p.rs, p.rp) : null;
  const phase = (deg: number) => `${fmt(deg, 4)}°`;
  const q = (v: number) => (Number.isFinite(v) ? fmt(v, 4) : '∞ (ideal)');

  const properties = (
    <>
      <Section title="Circuit">
        <SelectField
          label="Calculate"
          value={mode}
          onChange={(v) => set({ mode: v })}
          options={[
            { value: 'f0', label: 'Resonance from L, C' },
            { value: 'L', label: 'L for target f₀' },
            { value: 'C', label: 'C for target f₀' },
          ]}
          width={160}
        />
        {mode !== 'f0' && <SiField label="Target resonance" symbol="f₀" value={p.f0} onChange={(v) => set({ f0: v })} unit="Hz" prefixes={['', 'k', 'M', 'G']} />}
        {mode !== 'L' && <SiField label="Inductance" symbol="L" value={p.L} onChange={(v) => set({ L: v })} unit="H" prefixes={['p', 'n', 'µ', 'm', '']} />}
        {mode !== 'C' && <SiField label="Capacitance" symbol="C" value={p.C} onChange={(v) => set({ C: v })} unit="F" prefixes={['p', 'n', 'µ', 'm']} />}
      </Section>
      <Section title="Analysis">
        <SiField label="Frequency" symbol="f" value={p.f} onChange={(v) => set({ f: v })} unit="Hz" prefixes={['', 'k', 'M', 'G']} />
        <SiField label="Series loss R" symbol="Rs" value={p.rs} onChange={(v) => set({ rs: v })} unit="Ω" prefixes={['m', '', 'k']} allowZero hint="Resistance in series with L and C for the series circuit. 0 = ideal." />
        <SiField label="Parallel loss R" symbol="Rp" value={p.rp} onChange={(v) => set({ rp: v })} unit="Ω" prefixes={['', 'k', 'M']} allowZero hint="Resistance across the parallel tank. 0 = none (ideal tank)." />
      </Section>
    </>
  );

  return (
    <ToolPage
      title="Reactance & LC Resonance"
      description="Capacitive and inductive reactance at a frequency, the resonant frequency of an LC pair, the L or C needed for a target frequency, and the impedance of series and parallel LC circuits."
      onReset={reset}
      properties={properties}
      status={ok ? `f₀ = ${si(f0, 'Hz')}, L = ${si(L, 'H')}, C = ${si(C, 'F')}` : 'Check the inputs'}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      {z && z0 && (
        <>
          <Panel title="Resonance">
            <div className="flex flex-wrap gap-8 px-3 py-3">
              <SiBig label="Resonant frequency f₀" v={f0} unit="Hz" />
              {mode === 'L' && <SiBig label="Required inductance" v={L} unit="H" />}
              {mode === 'C' && <SiBig label="Required capacitance" v={C} unit="F" />}
              <Big label="Characteristic impedance √(L/C)" value={fmt(z.z0, 4)} unit="Ω" />
            </div>
          </Panel>
          <div className="grid gap-3 xl:grid-cols-2">
            <Panel title={`Reactance at ${si(p.f, 'Hz')}`}>
              <table className="tbl">
                <tbody>
                  <Result label="Inductive reactance XL = 2πfL" value={si(z.XL, 'Ω')} strong />
                  <Result label="Capacitive reactance XC = 1/(2πfC)" value={si(z.XC, 'Ω')} strong />
                  <Result label="f / f₀" value={fmt(p.f / f0, 4)} sub={p.f < f0 ? 'below resonance' : p.f > f0 ? 'above resonance' : 'at resonance'} />
                  <Result label="Reactance at f₀" value={si(z0.XL, 'Ω')} sub="XL = XC" />
                  <Result label="Period at f₀" value={si(1 / f0, 's')} />
                </tbody>
              </table>
            </Panel>
            <Panel title={`LC impedance at ${si(p.f, 'Hz')}`}>
              <table className="tbl">
                <tbody>
                  <Result label="Series LC |Z|" value={si(z.series, 'Ω')} strong sub={`phase ${phase(z.seriesPhaseDeg)}, ${z.seriesPhaseDeg > 0 ? 'inductive' : z.seriesPhaseDeg < 0 ? 'capacitive' : 'resistive'}`} />
                  <Result label="Parallel LC |Z|" value={si(z.parallel, 'Ω')} strong sub={`phase ${phase(z.parallelPhaseDeg)}, ${z.parallelPhaseDeg > 0 ? 'inductive' : z.parallelPhaseDeg < 0 ? 'capacitive' : 'resistive'}`} />
                  <Result label="Series |Z| at f₀" value={p.rs > 0 ? si(z0.series, 'Ω') : '0 (ideal)'} />
                  <Result label="Parallel |Z| at f₀" value={p.rp > 0 ? si(z0.parallel, 'Ω') : '∞ (ideal)'} />
                  <Result label="Q series = √(L/C) / Rs" value={q(z.qSeries)} sub={p.rs > 0 ? `−3 dB bandwidth ${si(f0 / z.qSeries, 'Hz')}` : undefined} />
                  <Result label="Q parallel = Rp / √(L/C)" value={q(z.qParallel)} sub={p.rp > 0 ? `−3 dB bandwidth ${si(f0 / z.qParallel, 'Hz')}` : undefined} />
                </tbody>
              </table>
            </Panel>
          </div>
        </>
      )}
    </ToolPage>
  );
}

function SiBig({ label, v, unit }: { label: string; v: number; unit: string }) {
  const [num, u] = si(v, unit).split(' ');
  return <Big label={label} value={num} unit={u} />;
}

export function Method() {
  return (
    <>
      <h2>Reactance</h2>
      <div className="eq">
        <span className="no">(1)</span>
        <i>X</i>
        <sub>L</sub> = 2π<i>fL</i>, <i>X</i>
        <sub>C</sub> = 1 / (2π<i>fC</i>)
      </div>
      <h2>Resonance</h2>
      <p>
        An LC pair resonates where <i>X</i>
        <sub>L</sub> = <i>X</i>
        <sub>C</sub>:
      </p>
      <div className="eq">
        <span className="no">(2)</span>
        <i>f</i>
        <sub>0</sub> = 1 / (2π √(<i>LC</i>)), <i>L</i> = 1 / ((2π<i>f</i>
        <sub>0</sub>)<sup>2</sup> <i>C</i>), <i>C</i> = 1 / ((2π<i>f</i>
        <sub>0</sub>)<sup>2</sup> <i>L</i>)
      </div>
      <h2>Series and parallel LC</h2>
      <div className="eq">
        <span className="no">(3)</span>
        |<i>Z</i>
        <sub>series</sub>| = √(<i>R</i>
        <sub>s</sub>
        <sup>2</sup> + (<i>X</i>
        <sub>L</sub> − <i>X</i>
        <sub>C</sub>)<sup>2</sup>)
      </div>
      <div className="eq">
        <span className="no">(4)</span>
        |<i>Z</i>
        <sub>parallel</sub>| = 1 / √(1/<i>R</i>
        <sub>p</sub>
        <sup>2</sup> + (1/<i>X</i>
        <sub>C</sub> − 1/<i>X</i>
        <sub>L</sub>)<sup>2</sup>)
      </div>
      <p>
        With no loss the series circuit is a short at <i>f</i>
        <sub>0</sub> and the parallel tank is an open; the ideal parallel |<i>Z</i>| reduces to <i>X</i>
        <sub>L</sub>
        <i>X</i>
        <sub>C</sub> / |<i>X</i>
        <sub>L</sub> − <i>X</i>
        <sub>C</sub>|. The quality factor is <i>Q</i> = √(<i>L</i>/<i>C</i>)/<i>R</i>
        <sub>s</sub> for the series circuit and <i>Q</i> = <i>R</i>
        <sub>p</sub>/√(<i>L</i>/<i>C</i>) for the parallel one, and the −3 dB bandwidth is <i>f</i>
        <sub>0</sub>/<i>Q</i>. Real inductors and capacitors have their own self-resonance and ESR; the model here uses ideal parts plus the loss resistance you enter.
      </p>
      <h2>References</h2>
      <ol>
        <li>C. K. Alexander, M. N. O. Sadiku, <i>Fundamentals of Electric Circuits</i>, McGraw-Hill, ch. 9 and 14 (resonant circuits).</li>
        <li>P. Horowitz, W. Hill, <i>The Art of Electronics</i>, 3rd ed., Cambridge University Press, 2015, ch. 1.7.</li>
      </ol>
    </>
  );
}
