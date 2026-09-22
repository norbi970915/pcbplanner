import { SiField } from '../components/SiField';
import { ToolPage } from '../components/ToolPage';
import { Big, Notes, Panel, Result, Section, SelectField } from '../components/ui';
import { ohmsLaw, type OhmPair } from '../lib/electronics';
import { si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { mode: 'VR', V: 12, I: 0.1, R: 120, P: 1 };

const PAIRS: { value: OhmPair; label: string }[] = [
  { value: 'VI', label: 'Voltage and current' },
  { value: 'VR', label: 'Voltage and resistance' },
  { value: 'VP', label: 'Voltage and power' },
  { value: 'IR', label: 'Current and resistance' },
  { value: 'IP', label: 'Current and power' },
  { value: 'RP', label: 'Resistance and power' },
];

const FORMULAS: Record<OhmPair, [string, string]> = {
  VI: ['R = V / I', 'P = V · I'],
  VR: ['I = V / R', 'P = V² / R'],
  VP: ['I = P / V', 'R = V² / P'],
  IR: ['V = I · R', 'P = I² · R'],
  IP: ['V = P / I', 'R = P / I²'],
  RP: ['V = √(P · R)', 'I = √(P / R)'],
};

const NAMES = { V: 'Voltage', I: 'Current', R: 'Resistance', P: 'Power' } as const;

export default function OhmsLaw() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const mode = (PAIRS.some((o) => o.value === p.mode) ? p.mode : 'VR') as OhmPair;
  const known = mode.split('') as ('V' | 'I' | 'R' | 'P')[];
  const errors: string[] = [];
  for (const k of known) if (!(p[k] > 0)) errors.push(`${NAMES[k]} must be greater than 0.`);
  const r = errors.length ? null : ohmsLaw(mode, { V: p.V, I: p.I, R: p.R, P: p.P });

  const properties = (
    <>
      <Section title="Known quantities">
        <SelectField label="Given" value={mode} onChange={(v) => set({ mode: v })} options={PAIRS} width={160} />
      </Section>
      <Section title="Values">
        {known.includes('V') && <SiField label="Voltage" symbol="V" value={p.V} onChange={(v) => set({ V: v })} unit="V" prefixes={['µ', 'm', '', 'k']} />}
        {known.includes('I') && <SiField label="Current" symbol="I" value={p.I} onChange={(v) => set({ I: v })} unit="A" prefixes={['n', 'µ', 'm', '']} />}
        {known.includes('R') && <SiField label="Resistance" symbol="R" value={p.R} onChange={(v) => set({ R: v })} unit="Ω" prefixes={['m', '', 'k', 'M']} />}
        {known.includes('P') && <SiField label="Power" symbol="P" value={p.P} onChange={(v) => set({ P: v })} unit="W" prefixes={['n', 'µ', 'm', '', 'k']} />}
      </Section>
    </>
  );

  return (
    <ToolPage
      title="Ohm's Law & Power"
      description="Enter any two of voltage, current, resistance and power for a resistive DC circuit; the other two are calculated."
      onReset={reset}
      properties={properties}
      status={r ? `${si(r.V, 'V')}, ${si(r.I, 'A')}, ${si(r.R, 'Ω')}, ${si(r.P, 'W')}` : 'Check the inputs'}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      {r && (
        <div className="grid gap-3 xl:grid-cols-2">
          <Panel title="Result">
            <div className="flex flex-wrap gap-8 px-3 py-3">
              {(['V', 'I', 'R', 'P'] as const)
                .filter((k) => !known.includes(k))
                .map((k) => {
                  const [num, unit] = si(r[k], k === 'V' ? 'V' : k === 'I' ? 'A' : k === 'R' ? 'Ω' : 'W').split(' ');
                  return <Big key={k} label={NAMES[k]} value={num} unit={unit} />;
                })}
            </div>
            <p className="px-3 pb-3 text-muted">
              {FORMULAS[mode][0]}, {FORMULAS[mode][1]}
            </p>
          </Panel>
          <Panel title="All quantities">
            <table className="tbl">
              <tbody>
                <Result label="Voltage V" value={si(r.V, 'V')} strong={!known.includes('V')} />
                <Result label="Current I" value={si(r.I, 'A')} strong={!known.includes('I')} />
                <Result label="Resistance R" value={si(r.R, 'Ω')} strong={!known.includes('R')} />
                <Result label="Power P" value={si(r.P, 'W')} strong={!known.includes('P')} />
                <Result label="Conductance G = 1/R" value={si(1 / r.R, 'S')} />
                <Result label="Energy in 1 hour" value={si(r.P * 3600, 'J')} sub={`${si(r.P, 'Wh')}`} />
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
      <h2>Formulas</h2>
      <p>Ohm's law and Joule's law for a linear resistance at DC (or RMS values for a purely resistive AC load):</p>
      <div className="eq">
        <span className="no">(1)</span>
        <i>V</i> = <i>I</i> · <i>R</i>
      </div>
      <div className="eq">
        <span className="no">(2)</span>
        <i>P</i> = <i>V</i> · <i>I</i> = <i>I</i>
        <sup>2</sup> <i>R</i> = <i>V</i>
        <sup>2</sup> / <i>R</i>
      </div>
      <p>
        Any two of the four quantities fix the other two. With power and resistance known, <i>V</i> = √(<i>PR</i>) and <i>I</i> = √(<i>P</i>/<i>R</i>). The power is what the resistance
        dissipates as heat; for a part, compare it with the rated power after derating for temperature.
      </p>
      <h2>References</h2>
      <ol>
        <li>P. Horowitz, W. Hill, <i>The Art of Electronics</i>, 3rd ed., Cambridge University Press, 2015, ch. 1.</li>
        <li>C. K. Alexander, M. N. O. Sadiku, <i>Fundamentals of Electric Circuits</i>, McGraw-Hill, ch. 2.</li>
      </ol>
    </>
  );
}
