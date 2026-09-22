import { ToolPage } from '../components/ToolPage';
import { Big, Notes, NumField, Panel, Result, Section, SelectField } from '../components/ui';
import type { ESeries } from '../lib/electronics';
import { feedbackPairs } from '../lib/power';
import { fmt, si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { vfb: 0.8, vout: 3.3, idiv: 100, ifb: 0, tol: 1, series: 'E96' };

export default function FeedbackDivider() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const errors: string[] = [];
  if (!(p.vfb > 0)) errors.push('Feedback voltage must be greater than 0.');
  if (!(p.vout > p.vfb)) errors.push('Output voltage must be above the feedback voltage.');
  if (!(p.idiv > 0)) errors.push('Divider current must be greater than 0.');
  if (p.tol < 0 || p.tol > 20) errors.push('Tolerance must be between 0 and 20 %.');
  const ifb = p.ifb * 1e-9;
  const pairs = errors.length ? [] : feedbackPairs(p.vfb, p.vout, p.idiv * 1e-6, p.series as ESeries, ifb, 10);
  const best = pairs[0];
  const r2Ideal = p.vfb / (p.idiv * 1e-6);
  const r1Ideal = r2Ideal * (p.vout / p.vfb - 1);
  // worst-case Vout from resistor tolerance (R1 high/R2 low and vice versa)
  const tol = p.tol / 100;
  const worst = best
    ? {
        hi: p.vfb * (1 + (best.r1 * (1 + tol)) / (best.r2 * (1 - tol))) + ifb * best.r1 * (1 + tol),
        lo: p.vfb * (1 + (best.r1 * (1 - tol)) / (best.r2 * (1 + tol))) + ifb * best.r1 * (1 - tol),
      }
    : null;
  const notes: string[] = [];
  if (ifb > 0 && p.idiv * 1e-6 < 100 * ifb) notes.push('The divider current is less than 100 × the FB bias current (TI guideline). The bias current then shifts Vout noticeably.');
  notes.push('Vref tolerance of the IC adds to the resistor error. Check the datasheet VFB accuracy.');

  const properties = (
    <>
      <Section title="Regulator">
        <NumField label="Feedback (reference) voltage" symbol="VFB" value={p.vfb} onChange={(v) => set({ vfb: v })} unit="V" />
        <NumField label="Target output voltage" symbol="Vout" value={p.vout} onChange={(v) => set({ vout: v })} unit="V" />
        <NumField label="FB bias current" symbol="IFB" value={p.ifb} onChange={(v) => set({ ifb: v })} unit="nA" allowZero allowNegative hint="Current flowing into the FB pin. Leave 0 if it is negligible." />
      </Section>
      <Section title="Divider">
        <NumField label="Divider current" value={p.idiv} onChange={(v) => set({ idiv: v })} unit="µA" hint="Sets R2 = VFB / I. Higher current = better noise immunity, more loss." />
        <SelectField
          label="Resistor series"
          value={p.series as ESeries}
          onChange={(v) => set({ series: v })}
          options={[
            { value: 'E12', label: 'E12 (10 %)' },
            { value: 'E24', label: 'E24 (5 %)' },
            { value: 'E96', label: 'E96 (1 %)' },
          ]}
        />
        <NumField label="Resistor tolerance" value={p.tol} onChange={(v) => set({ tol: v })} unit="%" allowZero />
      </Section>
    </>
  );

  return (
    <ToolPage
      title="Feedback Resistor Divider"
      description="Standard-value feedback resistors for adjustable regulators and DC/DC converters: Vout = VFB·(1 + R1/R2), the best E12/E24/E96 pairs, the output-voltage error, the FB bias-current effect and the worst case with resistor tolerance."
      onReset={reset}
      properties={properties}
      status={best ? `R1 = ${si(best.r1, 'Ω', 3)}, R2 = ${si(best.r2, 'Ω', 3)} → ${fmt(best.vout, 5)} V (${fmt(100 * best.error, 3)} %)` : 'Check the inputs'}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      <Notes items={errors.length ? [] : notes} />
      {best && worst && (
        <div className="grid gap-3 xl:grid-cols-2">
          <Panel title="Best Pair">
            <div className="flex flex-wrap gap-8 px-2.5 py-2">
              <Big label="R1 (Vout to FB)" value={si(best.r1, 'Ω', 3).replace(/Ω$/, '')} unit="Ω" />
              <Big label="R2 (FB to GND)" value={si(best.r2, 'Ω', 3).replace(/Ω$/, '')} unit="Ω" />
              <Big label="Output voltage" value={fmt(best.vout, 5)} unit="V" />
            </div>
            <table className="tbl">
              <tbody>
                <Result label="Error from the target" value={`${best.error >= 0 ? '+' : ''}${fmt(100 * best.error, 3)} %`} strong />
                <Result label={`Worst case with ±${fmt(p.tol, 3)} % resistors`} value={`${fmt(worst.lo, 5)} … ${fmt(worst.hi, 5)}`} unit="V" />
                <Result label="Divider current" value={fmt(best.iDivider * 1e6, 4)} unit="µA" />
                <Result label="Divider dissipation" value={si(p.vout * best.iDivider, 'W', 3)} />
                <Result label="Exact values" value={`${si(r1Ideal, 'Ω', 4)} / ${si(r2Ideal, 'Ω', 4)}`} sub="R1 / R2 before rounding to the series" />
              </tbody>
            </table>
          </Panel>
          <Panel title="Other Pairs">
            <table className="tbl">
              <thead>
                <tr>
                  <th>R1</th>
                  <th>R2</th>
                  <th className="v">Vout</th>
                  <th className="v">Error</th>
                  <th className="v">Current</th>
                </tr>
              </thead>
              <tbody>
                {pairs.map((x) => (
                  <tr key={`${x.r1}/${x.r2}`}>
                    <td>{si(x.r1, 'Ω', 3)}</td>
                    <td>{si(x.r2, 'Ω', 3)}</td>
                    <td className="v">{fmt(x.vout, 5)} V</td>
                    <td className="v">{fmt(100 * x.error, 3)} %</td>
                    <td className="v">{fmt(x.iDivider * 1e6, 3)} µA</td>
                  </tr>
                ))}
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
      <h2>Equations</h2>
      <p>Adjustable regulators hold their feedback pin at the reference voltage. The divider from the output sets the ratio:</p>
      <div className="eq">
        <span className="no">(1)</span>
        <i>V</i>
        <sub>out</sub> = <i>V</i>
        <sub>FB</sub> · (1 + <i>R</i>
        <sub>1</sub>/<i>R</i>
        <sub>2</sub>) + <i>I</i>
        <sub>FB</sub> · <i>R</i>
        <sub>1</sub>
      </div>
      <p>
        TI recommends a divider current of at least 100 times the FB bias current, which keeps the bias error below 1 %. The tool sets <i>R</i>
        <sub>2</sub> = <i>V</i>
        <sub>FB</sub>/<i>I</i> and then searches the chosen E-series for the pairs with the smallest output error, keeping the total resistance near the target current.
      </p>
      <h2>References</h2>
      <ol>
        <li>Texas Instruments SLVA477B and SLVA372D, section “Output Voltage Setting.”</li>
        <li>IEC 60063, Preferred number series for resistors and capacitors.</li>
      </ol>
    </>
  );
}
