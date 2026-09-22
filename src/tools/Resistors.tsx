import { useId } from 'react';
import { SiField } from '../components/SiField';
import { ToolPage } from '../components/ToolPage';
import { Notes, NumField, Panel, Result, Section, SelectField } from '../components/ui';
import { combine, divider, dividerPairs, eNearest, eNeighbors, ledResistor, parseList, powerRating, type ESeries } from '../lib/electronics';
import { fmt, si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = {
  vin: 5, r1: 10e3, r2: 10e3, rl: 0,
  vt: 3.3, rt: 10e3, ser: 'E24',
  vs: 5, vf: 2, ifw: 0.02, n: 1, lser: 'E24',
  kind: 'R', list: '1k, 2.2k, 4.7k',
};

const SERIES: { value: ESeries; label: string }[] = [
  { value: 'E12', label: 'E12 (10 %)' },
  { value: 'E24', label: 'E24 (5 %)' },
  { value: 'E96', label: 'E96 (1 %)' },
];
const asSeries = (s: string): ESeries => (s === 'E12' || s === 'E96' ? s : 'E24');
const UNIT = { R: 'Ω', C: 'F', L: 'H' } as const;
const pct = (e: number) => `${e >= 0 ? '+' : ''}${fmt(e * 100, 3)} %`;
const watts = (w: number) => (Number.isFinite(w) ? (w < 1 && Number.isInteger(1 / w) ? `1/${1 / w} W` : si(w, 'W', 3)) : '> 10 W');

export default function Resistors() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const listId = useId();
  const kind = (p.kind === 'C' || p.kind === 'L' ? p.kind : 'R') as 'R' | 'C' | 'L';

  // voltage divider
  const errDiv: string[] = [];
  if (!(p.r1 > 0) || !(p.r2 > 0)) errDiv.push('R1 and R2 must be greater than 0.');
  if (!(p.rl >= 0)) errDiv.push('Load resistance cannot be negative.');
  const div = errDiv.length ? null : divider(p.vin, p.r1, p.r2, p.rl);

  // divider synthesis
  const errSyn: string[] = [];
  if (!(p.vin > 0)) errSyn.push('Input voltage must be greater than 0 to choose a divider.');
  else if (!(p.vt > 0 && p.vt < p.vin)) errSyn.push('Target output must be between 0 and the input voltage.');
  if (!(p.rt > 0)) errSyn.push('Approximate total resistance must be greater than 0.');
  const pairs = errSyn.length ? [] : dividerPairs(p.vt / p.vin, p.rt, asSeries(p.ser), 10);

  // LED
  const errLed: string[] = [];
  if (!(p.ifw > 0)) errLed.push('LED current must be greater than 0.');
  if (!(p.n >= 1) || !Number.isInteger(p.n)) errLed.push('Number of LEDs must be a whole number of at least 1.');
  if (!(p.vf > 0)) errLed.push('Forward voltage must be greater than 0.');
  else if (!(p.vs > p.n * p.vf)) errLed.push(`Supply must exceed the total forward voltage (${fmt(p.n * p.vf, 4)} V).`);
  const led = errLed.length ? null : ledResistor(p.vs, p.vf, p.ifw, p.n);
  const lser = asSeries(p.lser);
  const ledRows = led
    ? [
        { label: 'Exact', ...led.ideal },
        { label: `Nearest ${lser}`, ...led.at(eNearest(led.r, lser)) },
        { label: `Next higher ${lser}`, ...led.at(eNeighbors(led.r, lser).above) },
      ]
    : [];

  // series / parallel
  const items = parseList(p.list);
  const bad = items.filter((i) => !(i.value > 0)).map((i) => i.text);
  const good = items.filter((i) => i.value > 0).map((i) => i.value);
  const comb = good.length ? combine(kind, good) : null;

  const properties = (
    <>
      <Section title="Voltage divider">
        <SiField label="Input voltage" symbol="Vin" value={p.vin} onChange={(v) => set({ vin: v })} unit="V" prefixes={['m', '', 'k']} allowNegative />
        <SiField label="Top resistor" symbol="R1" value={p.r1} onChange={(v) => set({ r1: v })} unit="Ω" prefixes={['', 'k', 'M']} />
        <SiField label="Bottom resistor" symbol="R2" value={p.r2} onChange={(v) => set({ r2: v })} unit="Ω" prefixes={['', 'k', 'M']} />
        <SiField label="Load" symbol="RL" value={p.rl} onChange={(v) => set({ rl: v })} unit="Ω" prefixes={['', 'k', 'M']} allowZero hint="Load across R2. 0 = no load." />
      </Section>
      <Section title="Divider from standard values">
        <SiField label="Target output" symbol="Vout" value={p.vt} onChange={(v) => set({ vt: v })} unit="V" prefixes={['m', '', 'k']} />
        <SiField label="Approx. R1 + R2" value={p.rt} onChange={(v) => set({ rt: v })} unit="Ω" prefixes={['', 'k', 'M']} hint="Pairs are searched with R1 + R2 within a factor of √10 of this value." />
        <SelectField label="Series" value={asSeries(p.ser)} onChange={(v) => set({ ser: v })} options={SERIES} />
      </Section>
      <Section title="LED series resistor">
        <SiField label="Supply voltage" symbol="Vs" value={p.vs} onChange={(v) => set({ vs: v })} unit="V" prefixes={['m', '']} />
        <NumField label="LED forward voltage" symbol="Vf" value={p.vf} onChange={(v) => set({ vf: v })} unit="V" />
        <SiField label="LED current" symbol="If" value={p.ifw} onChange={(v) => set({ ifw: v })} unit="A" prefixes={['µ', 'm', '']} />
        <NumField label="LEDs in series" value={p.n} onChange={(v) => set({ n: v })} min={1} allowZero />
        <SelectField label="Series" value={lser} onChange={(v) => set({ lser: v })} options={SERIES} />
      </Section>
      <Section title="Series / parallel">
        <SelectField
          label="Component"
          value={kind}
          onChange={(v) => set({ kind: v })}
          options={[
            { value: 'R', label: 'Resistors' },
            { value: 'C', label: 'Capacitors' },
            { value: 'L', label: 'Inductors' },
          ]}
        />
        <label htmlFor={listId} className="block pt-1 text-muted">
          Values ({UNIT[kind]}), separated by commas
        </label>
        <input id={listId} className="fld w-full" value={p.list} aria-invalid={bad.length > 0} onChange={(e) => set({ list: e.target.value })} placeholder="e.g. 4k7, 10k, 2.2M" />
      </Section>
    </>
  );

  return (
    <ToolPage
      title="Resistor Tools"
      description="Voltage divider output and standard-value divider pairs, LED series resistor with the nearest E-series value and its power, and series or parallel combinations of resistors, capacitors and inductors."
      onReset={reset}
      properties={properties}
      status={div ? `Vout = ${si(div.vout, 'V')}${led ? `, LED R = ${si(led.r, 'Ω')}` : ''}${comb ? `, series ${si(comb.series, UNIT[kind])}, parallel ${si(comb.parallel, UNIT[kind])}` : ''}` : 'Check the inputs'}
      method={<Method />}
    >
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="Voltage divider">
          <Notes kind="error" items={errDiv} />
          {div && (
            <table className="tbl">
              <tbody>
                <Result label="Output voltage" value={si(div.vout, 'V')} strong sub={p.rl > 0 ? `unloaded ${si(div.unloaded, 'V')}` : undefined} />
                <Result label="Ratio Vout / Vin" value={fmt(div.ratio, 5)} />
                <Result label="Current through R1" value={si(div.current, 'A')} />
                <Result label="Power in R1" value={si(div.pR1, 'W')} />
                <Result label="Power in R2" value={si(div.pR2, 'W')} />
                <Result label="Output resistance R1 ∥ R2" value={si(div.rOut, 'Ω')} sub={p.rl > 0 ? 'including the load' : 'Thevenin source resistance'} />
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="LED series resistor">
          <Notes kind="error" items={errLed} />
          {led && (
            <table className="tbl">
              <thead>
                <tr>
                  <th />
                  <th className="v">R</th>
                  <th className="v">LED current</th>
                  <th className="v">Power in R</th>
                  <th className="v">Rating (2× margin)</th>
                </tr>
              </thead>
              <tbody>
                {ledRows.map((r) => (
                  <tr key={r.label}>
                    <th scope="row" className="text-left font-normal">
                      {r.label}
                    </th>
                    <td className="v">{si(r.r, 'Ω')}</td>
                    <td className="v">{si(r.current, 'A')}</td>
                    <td className="v">{si(r.pR, 'W')}</td>
                    <td className="v">{watts(powerRating(r.pR))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {led && <p className="px-3 py-2 text-muted">Voltage across the resistor: {si(led.vR, 'V')}. LED power at the exact value: {si(led.ideal.pLed, 'W')} in total.</p>}
        </Panel>
      </div>

      <Panel title={`Divider pairs from ${asSeries(p.ser)} for ${si(p.vt, 'V')} out of ${si(p.vin, 'V')}`}>
        <Notes kind="error" items={errSyn} />
        {pairs.length > 0 && (
          <table className="tbl">
            <thead>
              <tr>
                <th className="text-left">#</th>
                <th className="v">R1 (top)</th>
                <th className="v">R2 (bottom)</th>
                <th className="v">Vout</th>
                <th className="v">Ratio error</th>
                <th className="v">R1 + R2</th>
                <th className="v">Current</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((q, i) => (
                <tr key={`${q.r1}/${q.r2}`}>
                  <td className={i === 0 ? 'font-semibold' : ''}>{i + 1}</td>
                  <td className="v">{si(q.r1, 'Ω')}</td>
                  <td className="v">{si(q.r2, 'Ω')}</td>
                  <td className="v">{si(p.vin * q.ratio, 'V', 5)}</td>
                  <td className="v">{pct(q.error)}</td>
                  <td className="v">{si(q.r1 + q.r2, 'Ω')}</td>
                  <td className="v">{si(p.vin / (q.r1 + q.r2), 'A')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title={`Series / parallel ${kind === 'R' ? 'resistance' : kind === 'C' ? 'capacitance' : 'inductance'}`}>
        <Notes kind="error" items={bad.length ? [`Cannot read: ${bad.join(', ')}. Use numbers with an optional prefix, e.g. 4.7k, 4k7, 100n, 2.2u.`] : []} />
        {!items.length && <Notes items={['Enter two or more values in the Properties panel, separated by commas or spaces (e.g. 10k, 4k7, 2.2k).']} />}
        {comb && (
          <table className="tbl">
            <tbody>
              <Result label="Values" value={good.map((v) => si(v, UNIT[kind], 4)).join(' + ')} sub={`${good.length} parts`} />
              <Result label="Series" value={si(comb.series, UNIT[kind])} strong sub={kind === 'C' ? '1 / Σ(1/C)' : 'Σ'} />
              <Result label="Parallel" value={si(comb.parallel, UNIT[kind])} strong sub={kind === 'C' ? 'Σ' : '1 / Σ(1/x)'} />
              {kind === 'R' && <Result label="Parallel as conductance" value={si(1 / comb.parallel, 'S')} />}
            </tbody>
          </table>
        )}
        {kind === 'L' && comb && <p className="px-3 py-2 text-muted">Assumes no mutual coupling between the inductors.</p>}
      </Panel>
    </ToolPage>
  );
}

function Method() {
  return (
    <>
      <h2>Voltage divider</h2>
      <div className="eq">
        <span className="no">(1)</span>
        <i>V</i>
        <sub>out</sub> = <i>V</i>
        <sub>in</sub> · <i>R</i>
        <sub>2</sub> / (<i>R</i>
        <sub>1</sub> + <i>R</i>
        <sub>2</sub>)
      </div>
      <p>
        With a load, <i>R</i>
        <sub>2</sub> is replaced by <i>R</i>
        <sub>2</sub> ∥ <i>R</i>
        <sub>L</sub>. The output behaves as a source of <i>V</i>
        <sub>out</sub> behind <i>R</i>
        <sub>1</sub> ∥ <i>R</i>
        <sub>2</sub> (Thevenin equivalent). For standard values, every <i>R</i>
        <sub>2</sub> of the chosen series within a decade around the ideal value is paired with the two series values on either side of the ideal <i>R</i>
        <sub>1</sub>, and the pairs are ranked by ratio error. Resistor tolerance adds to this error.
      </p>
      <h2>LED resistor</h2>
      <div className="eq">
        <span className="no">(2)</span>
        <i>R</i> = (<i>V</i>
        <sub>s</sub> − <i>n V</i>
        <sub>f</sub>) / <i>I</i>
        <sub>f</sub>, <i>P</i>
        <sub>R</sub> = <i>I</i>
        <sup>2</sup> <i>R</i>
      </div>
      <p>
        The next higher standard value keeps the current at or below the target. <i>V</i>
        <sub>f</sub> varies with current, temperature and part; take it from the datasheet at the intended current. The suggested rating is the smallest standard rating at least twice the
        dissipation.
      </p>
      <h2>Series and parallel</h2>
      <p>
        Resistors and inductors add in series and combine as the reciprocal of the sum of reciprocals in parallel; capacitors do the opposite. Inductor results assume no mutual coupling.
      </p>
      <p>Standard values are the IEC 60063 E12, E24 and E96 series.</p>
      <h2>References</h2>
      <ol>
        <li>P. Horowitz, W. Hill, <i>The Art of Electronics</i>, 3rd ed., Cambridge University Press, 2015, ch. 1.2.</li>
        <li>C. K. Alexander, M. N. O. Sadiku, <i>Fundamentals of Electric Circuits</i>, McGraw-Hill, ch. 2 and 6.</li>
        <li>IEC 60063:2015, Preferred number series for resistors and capacitors.</li>
      </ol>
    </>
  );
}
