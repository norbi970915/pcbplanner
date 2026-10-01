import { SiField } from '../components/SiField';
import { Sources } from '../components/Sources';
import { ToolPage } from '../components/ToolPage';
import { Big, Notes, NumField, Panel, Result, Section, SelectField } from '../components/ui';
import type { DataSource } from '../data/source';
import { crystalCL, crystalLoadCap, crystalPullPpm, driftSecondsPerDay, eNearest, eNeighbors, freqErrorFromPpm, ppmFromFreq } from '../lib/electronics';
import { agingPpm, CLOCK_TOLERANCES, compliance, loadPull, ppmBudget, toleranceById, type BudgetTerm } from '../lib/ppmBudget';
import { fmt, si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

// Capacitances in pF, Cm in fF. The measured frequency is stored as an offset
// from nominal (df, Hz) so the URL keeps full precision.
// Budget (b…): fitted capacitors, ± load uncertainty (pF), initial, temperature, aging (first year,
// per year after, years), other (ppm), interface and the far-end clock error (ppm).
const DEFAULTS = {
  cl: 18, cs: 4, cm: 0, c0: 2, f: 25e6, pmode: 'meas', df: 250, ppm: 20,
  bfit: 'e12', bcap: 22, bdcl: 1, bini: 10, btmp: 10, bag1: 3, bagn: 1, byr: 5, both: 0, bif: 'usb-hs', bfar: 50,
};

const FITS = ['e12', 'e24', 'exact', 'custom', 'osc'] as const;
type Fit = (typeof FITS)[number];

/** Every source behind the interface tolerances, once each. */
const TOL_SOURCES: DataSource[] = [...new Map(CLOCK_TOLERANCES.flatMap((t) => t.sources).map((s) => [s.url + s.title, s])).values()];

const signed = (v: number, sig = 3) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v), sig)}`;

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

  // ppm budget: the fitted capacitors set the actual load, so their pulling enters as a signed offset
  const fit: Fit = (FITS as readonly string[]).includes(p.bfit) ? (p.bfit as Fit) : 'e12';
  const errB: string[] = [];
  for (const [v, name] of [[p.bini, 'Initial tolerance'], [p.btmp, 'Temperature stability'], [p.bag1, 'First-year aging'], [p.bagn, 'Aging per year'], [p.byr, 'Service life'], [p.both, 'Other terms'], [p.bdcl, 'Load uncertainty']] as const) {
    if (!(v >= 0)) errB.push(`${name} cannot be negative.`);
  }
  if (fit === 'custom' && !(p.bcap > 0)) errB.push('The fitted capacitor must be greater than 0.');
  const capFit = fit === 'osc' || !okCap ? NaN : fit === 'e12' ? eNearest(c, 'E12') : fit === 'e24' ? eNearest(c, 'E24') : fit === 'exact' ? c : p.bcap;
  const clFit = fit === 'osc' ? NaN : fit === 'exact' && okCap ? p.cl : crystalCL(capFit, capFit, p.cs);
  const pullB = fit !== 'osc' && okCap && p.cm > 0 && clFit > 0 ? loadPull(p.cm * 1e-3, p.c0, p.cl, clFit, p.bdcl) : null;
  if (fit !== 'osc' && okCap && p.cm > 0 && !pullB && errB.length === 0) errB.push('The load uncertainty is larger than the load capacitance.');
  const aging = agingPpm(p.bag1, p.bagn, p.byr);
  const terms: BudgetTerm[] = [
    { key: 'ini', label: 'Initial tolerance at 25 °C', ppm: p.bini, kind: 'tol' },
    { key: 'tmp', label: 'Temperature stability', ppm: p.btmp, kind: 'tol' },
    { key: 'age', label: `Aging over ${fmt(p.byr, 3)} ${p.byr === 1 ? 'year' : 'years'}`, ppm: aging, kind: 'tol' },
    ...(pullB
      ? [
          { key: 'pull', label: `Load capacitance ${fmt(clFit, 4)} pF instead of ${fmt(p.cl, 4)} pF`, ppm: pullB.offset, kind: 'offset' as const },
          { key: 'dcl', label: `Load uncertainty ±${fmt(p.bdcl, 3)} pF (stray, capacitor tolerance)`, ppm: pullB.tol, kind: 'tol' as const },
        ]
      : []),
    ...(p.both > 0 ? [{ key: 'oth', label: 'Other (supply, load, drive level)', ppm: p.both, kind: 'tol' as const }] : []),
  ];
  const budget = errB.length === 0 && p.f > 0 ? ppmBudget(terms) : null;
  const tolIf = p.bif === 'none' ? undefined : toleranceById(p.bif);
  const comp = budget && tolIf ? compliance(tolIf, budget.worst, p.bfar) : null;
  const compRss = budget && tolIf ? compliance(tolIf, budget.rss, p.bfar) : null;
  const notesB: string[] = [];
  if (budget && fit !== 'osc' && !(p.cm > 0)) notesB.push('Enter the motional capacitance Cm under Crystal model to include the pulling caused by the fitted capacitors.');
  if (budget && fit === 'osc') notesB.push('Oscillator module: its datasheet stability usually already includes the initial tolerance, temperature, supply and load terms (and sometimes aging) as one figure. Enter it once, as the initial tolerance, and set the other terms to zero, unless the datasheet lists them separately.');

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
      <Section title="PPM budget">
        <SelectField
          label="Fitted capacitors"
          value={fit}
          onChange={(v) => set({ bfit: v })}
          options={[
            { value: 'e12', label: 'Nearest E12' },
            { value: 'e24', label: 'Nearest E24' },
            { value: 'exact', label: 'Exact value' },
            { value: 'custom', label: 'Custom value' },
            { value: 'osc', label: 'None (oscillator module)' },
          ]}
          width={160}
        />
        {fit === 'custom' && <NumField label="C1 = C2" value={p.bcap} onChange={(v) => set({ bcap: v })} unit="pF" />}
        {fit !== 'osc' && (
          <NumField label="Load uncertainty" symbol="±ΔCL" value={p.bdcl} onChange={(v) => set({ bdcl: v })} unit="pF" allowZero hint="How far the real load may differ from the calculated one: stray-capacitance estimate and capacitor tolerance (half of each C, since they are in series)." />
        )}
        <NumField label="Initial tolerance" value={p.bini} onChange={(v) => set({ bini: v })} unit="± ppm" allowZero hint="Frequency tolerance at 25 °C from the datasheet." />
        <NumField label="Temperature stability" value={p.btmp} onChange={(v) => set({ btmp: v })} unit="± ppm" allowZero hint="Over the operating temperature range, from the datasheet." />
        <NumField label="Aging, first year" value={p.bag1} onChange={(v) => set({ bag1: v })} unit="± ppm" allowZero />
        <NumField label="Aging, each year after" value={p.bagn} onChange={(v) => set({ bagn: v })} unit="± ppm" allowZero hint="If the datasheet gives one figure per year, enter it in both fields." />
        <NumField label="Service life" value={p.byr} onChange={(v) => set({ byr: v })} unit="years" allowZero />
        <NumField label="Other terms" value={p.both} onChange={(v) => set({ both: v })} unit="± ppm" allowZero hint="Supply, drive level or anything else the datasheet lists separately." />
        <SelectField
          label="Check against"
          value={tolIf ? tolIf.id : 'none'}
          onChange={(v) => set({ bif: v })}
          options={[{ value: 'none', label: 'No interface' }, ...CLOCK_TOLERANCES.map((t) => ({ value: t.id, label: t.label }))]}
          width={160}
        />
        <NumField label="Far-end clock error" value={p.bfar} onChange={(v) => set({ bfar: v })} unit="± ppm" allowZero hint="The worst-case error of the clock at the other end of the link, for the offset between the two ends." />
      </Section>
    </>
  );

  return (
    <ToolPage
      title="Crystal Load Capacitors & PPM Budget"
      description="Load capacitor values for a Pierce crystal oscillator with the nearest E12 and E24 parts, the frequency pulling they cause, a ppm budget of tolerance, temperature, aging and load checked against USB, Ethernet, PCIe and SATA clock limits, and conversion between frequency error, ppm and clock drift."
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
      <Notes kind="error" items={errB} />
      <Notes items={notesB} />
      {budget && (
        <Panel title="PPM budget">
          <div className="flex flex-wrap gap-8 px-3 py-3">
            <Big label="Worst case" value={`±${fmt(budget.worst, 4)}`} unit="ppm" />
            <Big label="RSS" value={`±${fmt(budget.rss, 4)}`} unit="ppm" />
            <Big label="Worst-case error" value={`±${si(freqErrorFromPpm(p.f, budget.worst), 'Hz', 4)}`} unit={`at ${si(p.f, 'Hz', 6)}`} />
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th className="text-left">Term</th>
                <th className="v">ppm</th>
                <th className="v">Hz</th>
              </tr>
            </thead>
            <tbody>
              {budget.terms.map((t) => (
                <tr key={t.key}>
                  <td>
                    {t.label}
                    {t.kind === 'offset' && <span className="text-muted"> (offset)</span>}
                  </td>
                  <td className="v">{t.kind === 'offset' ? signed(t.ppm, 3) : `±${fmt(t.ppm, 3)}`}</td>
                  <td className="v">{t.kind === 'offset' ? signed(freqErrorFromPpm(p.f, t.ppm), 3) : `±${fmt(freqErrorFromPpm(p.f, t.ppm), 3)}`}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td>Worst case: offset + linear sum of the ± terms</td>
                <td className="v">{signed(budget.min, 4)} … {signed(budget.max, 4)}</td>
                <td className="v">
                  {signed(freqErrorFromPpm(p.f, budget.min), 4)} … {signed(freqErrorFromPpm(p.f, budget.max), 4)}
                </td>
              </tr>
              <tr>
                <td>RSS: offset + root-sum-square of the ± terms</td>
                <td className="v">
                  {signed(budget.offset - budget.tolRss, 4)} … {signed(budget.offset + budget.tolRss, 4)}
                </td>
                <td className="v">
                  {signed(freqErrorFromPpm(p.f, budget.offset - budget.tolRss), 4)} … {signed(freqErrorFromPpm(p.f, budget.offset + budget.tolRss), 4)}
                </td>
              </tr>
            </tbody>
          </table>
          <table className="tbl mt-2">
            <tbody>
              <Result label="Clock drift per day, worst case" value={fmt(driftSecondsPerDay(budget.worst), 4)} unit="s" sub={`${fmt((driftSecondsPerDay(budget.worst) * 365.25) / 60, 4)} min per year`} />
              <Result label="Offset to the far-end clock" value={`±${fmt(budget.worst + p.bfar, 4)}`} unit="ppm" sub={`this clock ±${fmt(budget.worst, 4)} ppm + far end ±${fmt(p.bfar, 4)} ppm, worst case`} />
            </tbody>
          </table>
          <p className="px-3 py-2 text-muted">
            A PLL multiplies the frequency and its error together, so the ppm figure is the same at every clock derived from this crystal. The offset term is the pulling of the fitted capacitors
            {pullB ? ` (CL = ${fmt(clFit, 4)} pF)` : ''}; trim it out with a different capacitor value if the budget is tight.
          </p>
        </Panel>
      )}
      {comp && compRss && tolIf && (
        <Panel title={`Check: ${tolIf.label}`}>
          <table className="tbl">
            <tbody>
              <Result
                label={tolIf.scope === 'link' ? 'Limit between the two ends' : 'Limit for each clock'}
                value={`±${fmt(tolIf.ppm, 4)}`}
                unit="ppm"
                sub={tolIf.detail}
              />
              <Result
                label={tolIf.scope === 'link' ? 'This clock + far end, worst case' : 'This clock, worst case'}
                value={<span className={comp.pass ? 'text-ok' : 'text-[var(--err-line)]'}>{`±${fmt(comp.error, 4)} ppm · ${comp.pass ? 'pass' : 'fail'}`}</span>}
                strong
                sub={`margin ${signed(comp.margin, 4)} ppm`}
              />
              <Result
                label={tolIf.scope === 'link' ? 'This clock (RSS) + far end' : 'This clock, RSS'}
                value={<span className={compRss.pass ? 'text-ok' : 'text-[var(--err-line)]'}>{`±${fmt(compRss.error, 4)} ppm · ${compRss.pass ? 'pass' : 'fail'}`}</span>}
                sub={`margin ${signed(compRss.margin, 4)} ppm`}
              />
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
      <h2>PPM budget</h2>
      <p>
        A crystal datasheet gives its frequency error as separate terms: the tolerance at 25 °C, the stability over temperature and the aging per year. Each is a ± limit. The budget adds them
        two ways: the worst case adds them linearly, which is what a specification check needs, and the root-sum-square (RSS) assumes they are independent and do not all reach their limits
        together, which is closer to a typical board.
      </p>
      <p>
        Aging is counted as the first-year figure plus the per-year figure for every year after it, because crystals age fastest at the start. A life shorter than one year still counts the
        whole first-year figure.
      </p>
      <p>
        The fitted capacitors give a load capacitance other than the specified <i>C</i>
        <sub>L</sub> unless the exact value is fitted. Its pulling, from equation (2), is a signed offset that moves the whole error window rather than widening it, so it is added to both
        totals as it is. The load uncertainty ±Δ<i>C</i>
        <sub>L</sub> (the stray-capacitance estimate and the capacitor tolerance) is a ± term; the larger of the two excursions is used, because the pulling curve is steeper at the smaller load.
      </p>
      <p>
        A PLL or clock multiplier scales the frequency error with the frequency, so the error in ppm is the same for every clock derived from the crystal. For an oscillator module the datasheet
        stability usually already combines the initial, temperature, supply and load terms; enter it once.
      </p>
      <h2>Two ends of a link</h2>
      <p>
        Interface specifications limit each clock against its nominal frequency. Two independent clocks at opposite limits then differ by twice that: two USB high-speed clocks at ±500 ppm may
        be 1000 ppm apart, and PCI Express allows 600 ppm between the two ends without a common reference clock. The far-end offset shows the worst case for this board against the other end.
      </p>
      <p>
        UART has no specified tolerance; the limit is derived here for an ideal receiver that finds the start edge within one sample, 1/<i>n</i> of a bit at <i>n</i>× oversampling, and
        samples the middle of every bit. The middle of the stop bit, 9.5 bits after the start edge for 8N1, must stay inside the stop bit, so the two clocks may differ by at most (½ − 1/
        <i>n</i>) / 9.5: 4.6 % at 16× oversampling. Receivers that vote over three samples tolerate less, so prefer the figure in the UART datasheet where it gives one.
      </p>
      <h2>References</h2>
      <ol>
        <li>E. A. Vittoz, M. G. R. Degrauwe, S. Bitz, "High-performance crystal oscillator circuits: theory and application", IEEE J. Solid-State Circuits, vol. 23, no. 3, 1988.</li>
        <li>STMicroelectronics AN2867, Guidelines for oscillator design on STM8AF/AL/S and STM32 MCUs/MPUs.</li>
        <li>IEC 60063, Preferred number series for resistors and capacitors.</li>
      </ol>
      <Sources items={TOL_SOURCES} />
    </>
  );
}
