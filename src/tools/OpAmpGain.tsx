import type { ReactNode } from 'react';
import { SiField } from '../components/SiField';
import { ToolPage } from '../components/ToolPage';
import { Big, Check, Notes, NumField, Panel, Result, Section, Segmented, SelectField } from '../components/ui';
import type { ESeries } from '../lib/electronics';
import {
  biasCompR,
  closedLoopAt,
  closedLoopBw,
  closedLoopBwSinglePole,
  compStandard,
  db,
  finiteGain,
  fromDb,
  fullPowerBw,
  gainPairs,
  gains,
  noiseBandwidth,
  noiseSources,
  outputOffset,
  outputRange,
  plusInputRange,
  rss,
  tolerance,
  type Circuit,
  type Gains,
  type Topology,
} from '../lib/opamp';
import { fmt, si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = {
  mode: 'analyse', topo: 'inverting',
  r1: 10e3, r2: 100e3, r3: 10e3, r4: 100e3, rs: 0, comp: false,
  target: 10, rt: 110e3, ser: 'E24', tol: 1,
  vinLo: -0.5, vinHi: 0.5, vcmLo: 0, vcmHi: 0, vref: 0, fsig: 1000,
  gbw: 1e6, aol: 100, sr: 0.5, vos: 2e-3, ib: 100e-9, ios: 10e-9, en: 20, inn: 0.5,
  vpos: 15, vneg: -15, oLo: 1.5, oHi: 1.5, cmLo: 2, cmHi: 2, temp: 25, nbw: 0,
};

const TOPOLOGIES: { value: Topology; label: string }[] = [
  { value: 'inverting', label: 'Inverting' },
  { value: 'noninverting', label: 'Non-inverting' },
  { value: 'difference', label: 'Difference' },
  { value: 'summing', label: 'Summing (inverting)' },
];
const SERIES: { value: ESeries; label: string }[] = [
  { value: 'E12', label: 'E12 (10 %)' },
  { value: 'E24', label: 'E24 (5 %)' },
  { value: 'E96', label: 'E96 (1 %)' },
];
const asSeries = (s: string): ESeries => (s === 'E12' || s === 'E96' ? s : 'E24');
const asTopo = (s: string): Topology => (TOPOLOGIES.some((t) => t.value === s) ? (s as Topology) : 'inverting');
const pct = (e: number) => `${e >= 0 ? '+' : ''}${fmt(e * 100, 3)} %`;
const vv = (g: number) => `${fmt(g, 5)} V/V`;
const ok = (b: boolean) => (b ? 'OK' : 'Outside the limit');
const split = (v: number, unit: string) => {
  const [num, ...u] = si(v, unit, 4).split(' ');
  return { num, u: u.join(' ') };
};

export default function OpAmpGain() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const topo = asTopo(p.topo);
  const series = asSeries(p.ser);
  const mode = p.mode === 'design' && topo !== 'summing' ? 'design' : 'analyse';

  const errors: string[] = [];
  const notes: string[] = [];
  const fin = (...v: number[]) => v.every((x) => Number.isFinite(x));
  if (!fin(p.r1, p.r2, p.r3, p.r4, p.rs, p.target, p.rt, p.tol, p.vinLo, p.vinHi, p.vcmLo, p.vcmHi, p.vref, p.fsig, p.gbw, p.aol, p.sr, p.vos, p.ib, p.ios, p.en, p.inn, p.vpos, p.vneg, p.oLo, p.oHi, p.cmLo, p.cmHi, p.temp, p.nbw))
    errors.push('Every input must be a finite number.');
  if (mode === 'analyse') {
    if (!(p.r1 > 0)) errors.push(topo === 'summing' ? 'Input resistor R1 must be greater than 0.' : 'R1 must be greater than 0.');
    if (topo === 'noninverting' ? !(p.r2 >= 0) : !(p.r2 > 0)) errors.push(topo === 'noninverting' ? 'Rf cannot be negative (0 makes a voltage follower).' : 'The feedback resistor must be greater than 0.');
    if (topo === 'difference' && !(p.r3 > 0 && p.r4 > 0)) errors.push("R1′ and R2′ must be greater than 0.");
    if (topo === 'summing' && !(p.r3 >= 0 && p.r4 >= 0)) errors.push('Input resistors cannot be negative (0 = input not used).');
  } else {
    if (topo === 'noninverting' ? !(p.target > 1) : !(p.target > 0)) errors.push(topo === 'noninverting' ? 'A non-inverting gain must be greater than 1 (use a follower for 1).' : 'Target gain must be greater than 0.');
    if (!(p.rt > 0)) errors.push('Approximate Rin + Rf must be greater than 0.');
  }
  if (!(p.rs >= 0)) errors.push('Source resistance cannot be negative.');
  if (!(p.tol >= 0 && p.tol < 100)) errors.push('Resistor tolerance must be from 0 to less than 100 %.');
  if (!(p.gbw > 0)) errors.push('Gain-bandwidth product must be greater than 0.');
  if (!(p.aol > 0)) errors.push('Open-loop gain must be greater than 0 dB.');
  else if (p.aol > 200) errors.push('Open-loop gain above 200 dB is outside the range of real op amps (typically 80–140 dB); check the datasheet value.');
  if (!(p.sr > 0)) errors.push('Slew rate must be greater than 0.');
  if (!(p.ib >= 0 && p.ios >= 0 && p.en >= 0 && p.inn >= 0)) errors.push('Bias current, offset current and noise densities cannot be negative.');
  if (!(p.vpos > p.vneg)) errors.push('V+ must be above V−.');
  if (!(p.vpos - p.oHi > p.vneg + p.oLo)) errors.push('The output headroom leaves no output range between the rails.');
  if (!(p.vpos - p.cmHi >= p.vneg + p.cmLo)) errors.push('The common-mode headroom leaves no input range between the rails.');
  if (!(p.fsig > 0)) errors.push('Signal frequency must be greater than 0.');
  if (!(p.temp > -273.15)) errors.push('Temperature must be above absolute zero.');
  if (!(p.nbw >= 0)) errors.push('Noise bandwidth cannot be negative (0 = from the closed-loop bandwidth).');

  const pairs = mode === 'design' && topo !== 'summing' && errors.length === 0 ? gainPairs(topo, p.target, p.rt, series, 10) : [];
  if (mode === 'design' && errors.length === 0 && pairs.length === 0) errors.push('No standard-value pair found; change the target gain or the resistance level.');

  const ready = errors.length === 0;
  // resistors for the analysis: entered values, or the best standard pair in design mode
  const best = pairs[0];
  const rin = mode === 'design' && best ? best.rin : p.r1;
  const rf = mode === 'design' && best ? best.rf : p.r2;
  const base: Circuit = {
    topology: topo,
    r1: rin,
    r2: rf,
    r3: topo === 'difference' && mode === 'design' ? rin : p.r3,
    r4: topo === 'difference' && mode === 'design' ? rf : p.r4,
    rs: topo === 'noninverting' ? p.rs : 0,
    rcomp: 0,
  };

  let g: Gains | null = null;
  let rcomp = 0;
  if (ready) {
    const g0 = gains(base);
    if (p.comp && topo !== 'difference' && g0.rf > 0) {
      const want = biasCompR(g0.rg, g0.rf) - base.rs;
      rcomp = compStandard(want, series);
      if (!(want > 0)) notes.push('The source resistance already exceeds R1 ∥ Rf, so no compensation resistor is added.');
    }
    g = gains({ ...base, rcomp });
  }
  const circuit: Circuit = { ...base, rcomp };

  const aolVV = fromDb(p.aol);
  const sig = { vin: { lo: p.vinLo, hi: p.vinHi }, vcm: { lo: p.vcmLo, hi: p.vcmHi }, vref: p.vref };
  const r = g
    ? (() => {
        const actual = finiteGain(g.signal, g.noise, aolVV);
        const bw = closedLoopBw(p.gbw, g.noise);
        const bwExact = closedLoopBwSinglePole(p.gbw, g.noise, aolVV);
        const out = outputRange(circuit, sig);
        const cm = plusInputRange(circuit, sig);
        const outMin = p.vneg + p.oLo;
        const outMax = p.vpos - p.oHi;
        const cmMin = p.vneg + p.cmLo;
        const cmMax = p.vpos - p.cmHi;
        const vpk = (out.hi - out.lo) / 2;
        const fpbw = vpk > 0 ? fullPowerBw(p.sr * 1e6, vpk) : Infinity;
        const off = outputOffset(g, p.vos, p.ib, p.ios);
        const src = noiseSources(g, p.en * 1e-9, p.inn * 1e-12, p.temp);
        const dens = rss(src.map((s) => s.out));
        const nb = p.nbw > 0 ? p.nbw : noiseBandwidth(bwExact);
        const tol = tolerance(circuit, p.tol / 100);
        return { actual, bw, bwExact, out, cm, outMin, outMax, cmMin, cmMax, vpk, fpbw, off, src, dens, nb, tol };
      })()
    : null;

  if (r && g) {
    if (r.out.lo < r.outMin || r.out.hi > r.outMax)
      notes.push(`The ideal output spans ${si(r.out.lo, 'V', 4)} to ${si(r.out.hi, 'V', 4)}, outside the output swing ${si(r.outMin, 'V', 4)} to ${si(r.outMax, 'V', 4)}: the output will clip.`);
    if (r.cm.lo < r.cmMin || r.cm.hi > r.cmMax)
      notes.push(`The op amp inputs sit at ${si(r.cm.lo, 'V', 4)} to ${si(r.cm.hi, 'V', 4)}, outside the common-mode input range ${si(r.cmMin, 'V', 4)} to ${si(r.cmMax, 'V', 4)}.`);
    if (p.fsig > r.bwExact) notes.push(`The signal frequency ${si(p.fsig, 'Hz', 3)} is above the closed-loop bandwidth ${si(r.bwExact, 'Hz', 3)}.`);
    else if (p.fsig > r.bwExact / 10) notes.push(`The signal frequency is within a decade of the closed-loop bandwidth, so the gain at ${si(p.fsig, 'Hz', 3)} is already reduced (see the Bode plot).`);
    if (p.fsig > r.fpbw) notes.push(`A ${si(2 * r.vpk, 'V', 3)} peak-to-peak output at ${si(p.fsig, 'Hz', 3)} needs ${fmt((2 * Math.PI * p.fsig * r.vpk) / 1e6, 3)} V/µs; the op amp slews at ${fmt(p.sr, 3)} V/µs.`);
    if (g.noise < 2 && topo !== 'noninverting') notes.push('Check that the op amp is stable at this noise gain; decompensated op amps need a minimum gain (MT-033).');
    if (topo === 'noninverting' && rf === 0) notes.push('Rf = 0: the stage is a voltage follower and R1 has no effect.');
  }

  const status = g && r ? `G = ${fmt(g.signal, 5)} V/V (${fmt(db(g.signal), 4)} dB), NG ${fmt(g.noise, 4)}, BW ≈ ${si(r.bwExact, 'Hz', 3)}, offset ±${si(r.off.total, 'V', 3)}` : 'Check the inputs';

  const resistorFields = (
    <Section title="Resistors">
      {topo === 'summing' ? (
        <>
          <SiField label="Feedback resistor" symbol="Rf" value={p.r2} onChange={(v) => set({ r2: v })} unit="Ω" prefixes={['', 'k', 'M']} />
          <SiField label="Input 1 resistor" symbol="R1" value={p.r1} onChange={(v) => set({ r1: v })} unit="Ω" prefixes={['', 'k', 'M']} />
          <SiField label="Input 2 resistor" symbol="R2" value={p.r3} onChange={(v) => set({ r3: v })} unit="Ω" prefixes={['', 'k', 'M']} allowZero hint="0 = input not used." />
          <SiField label="Input 3 resistor" symbol="R3" value={p.r4} onChange={(v) => set({ r4: v })} unit="Ω" prefixes={['', 'k', 'M']} allowZero hint="0 = input not used." />
        </>
      ) : topo === 'difference' ? (
        <>
          <SiField label="Inverting input" symbol="R1" value={p.r1} onChange={(v) => set({ r1: v })} unit="Ω" prefixes={['', 'k', 'M']} />
          <SiField label="Feedback" symbol="R2" value={p.r2} onChange={(v) => set({ r2: v })} unit="Ω" prefixes={['', 'k', 'M']} />
          <SiField label="Non-inverting input" symbol="R1′" value={p.r3} onChange={(v) => set({ r3: v })} unit="Ω" prefixes={['', 'k', 'M']} />
          <SiField label="To reference" symbol="R2′" value={p.r4} onChange={(v) => set({ r4: v })} unit="Ω" prefixes={['', 'k', 'M']} />
        </>
      ) : (
        <>
          <SiField label={topo === 'inverting' ? 'Input resistor' : 'Resistor to ground/Vref'} symbol="R1" value={p.r1} onChange={(v) => set({ r1: v })} unit="Ω" prefixes={['', 'k', 'M']} />
          <SiField label="Feedback resistor" symbol="Rf" value={p.r2} onChange={(v) => set({ r2: v })} unit="Ω" prefixes={['', 'k', 'M']} allowZero={topo === 'noninverting'} hint={topo === 'noninverting' ? '0 = voltage follower.' : undefined} />
        </>
      )}
    </Section>
  );

  const properties = (
    <>
      <Section title="Circuit">
        <SelectField label="Topology" value={topo} onChange={(v) => set({ topo: v })} options={TOPOLOGIES} width={150} />
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <span className="text-muted">Mode</span>
          <Segmented
            label="Mode"
            value={mode}
            onChange={(v) => set({ mode: v })}
            options={topo === 'summing' ? [{ value: 'analyse', label: 'Analyse' }] : [{ value: 'analyse', label: 'Analyse' }, { value: 'design', label: 'Design' }]}
          />
        </div>
        {topo === 'summing' && <p className="text-faint">Design mode covers the single-input stages.</p>}
      </Section>
      {mode === 'design' ? (
        <Section title="Target">
          <NumField label={topo === 'difference' ? 'Differential gain' : topo === 'inverting' ? 'Gain magnitude' : 'Gain'} symbol="|G|" value={p.target} onChange={(v) => set({ target: v })} unit="V/V" />
          <SiField label="Approx. Rin + Rf" value={p.rt} onChange={(v) => set({ rt: v })} unit="Ω" prefixes={['', 'k', 'M']} hint="Pairs are searched with Rin + Rf within a factor of √10 of this value." />
        </Section>
      ) : (
        resistorFields
      )}
      <Section title="Standard values and tolerance">
        <SelectField label="Resistor series" value={series} onChange={(v) => set({ ser: v })} options={SERIES} />
        <NumField label="Resistor tolerance" value={p.tol} onChange={(v) => set({ tol: v })} unit="%" allowZero />
        {topo !== 'difference' && (
          <Check label="Bias-current compensation resistor" checked={p.comp} onChange={(v) => set({ comp: v })} hint="Adds R1 ∥ Rf (nearest standard value) at the + input. Only helps when the two bias currents match (MT-038)." />
        )}
      </Section>
      <Section title="Signal">
        <SiField label={topo === 'difference' ? 'Differential input, min' : 'Input, min'} value={p.vinLo} onChange={(v) => set({ vinLo: v })} unit="V" prefixes={['µ', 'm', '']} allowNegative allowZero />
        <SiField label={topo === 'difference' ? 'Differential input, max' : 'Input, max'} value={p.vinHi} onChange={(v) => set({ vinHi: v })} unit="V" prefixes={['µ', 'm', '']} allowNegative allowZero />
        {topo === 'difference' && (
          <>
            <SiField label="Common-mode input, min" value={p.vcmLo} onChange={(v) => set({ vcmLo: v })} unit="V" prefixes={['m', '']} allowNegative allowZero />
            <SiField label="Common-mode input, max" value={p.vcmHi} onChange={(v) => set({ vcmHi: v })} unit="V" prefixes={['m', '']} allowNegative allowZero />
          </>
        )}
        <SiField label="Reference voltage" symbol="Vref" value={p.vref} onChange={(v) => set({ vref: v })} unit="V" prefixes={['m', '']} allowNegative allowZero hint="Voltage at the grounded end of the gain network (+ input for inverting stages, foot of R1 for non-inverting, REF for the difference amplifier). Mid-supply for single-supply circuits." />
        {topo === 'noninverting' && <SiField label="Source resistance" symbol="Rs" value={p.rs} onChange={(v) => set({ rs: v })} unit="Ω" prefixes={['', 'k', 'M']} allowZero />}
        <SiField label="Highest signal frequency" symbol="f" value={p.fsig} onChange={(v) => set({ fsig: v })} unit="Hz" prefixes={['', 'k', 'M']} />
        {topo === 'summing' && <p className="text-faint">Every input spans the same range.</p>}
      </Section>
      <Section title="Op amp (from its datasheet)">
        <SiField label="Gain-bandwidth product" symbol="GBW" value={p.gbw} onChange={(v) => set({ gbw: v })} unit="Hz" prefixes={['k', 'M', 'G']} />
        <NumField label="Open-loop gain" symbol="AOL" value={p.aol} onChange={(v) => set({ aol: v })} unit="dB" />
        <NumField label="Slew rate" symbol="SR" value={p.sr} onChange={(v) => set({ sr: v })} unit="V/µs" />
        <SiField label="Offset voltage" symbol="Vos" value={p.vos} onChange={(v) => set({ vos: v })} unit="V" prefixes={['µ', 'm']} allowZero />
        <SiField label="Bias current" symbol="IB" value={p.ib} onChange={(v) => set({ ib: v })} unit="A" prefixes={['p', 'n', 'µ']} allowZero />
        <SiField label="Offset current" symbol="Ios" value={p.ios} onChange={(v) => set({ ios: v })} unit="A" prefixes={['p', 'n', 'µ']} allowZero />
        <NumField label="Voltage noise" symbol="en" value={p.en} onChange={(v) => set({ en: v })} unit="nV/√Hz" allowZero />
        <NumField label="Current noise" symbol="in" value={p.inn} onChange={(v) => set({ inn: v })} unit="pA/√Hz" allowZero />
        <NumField label="Positive supply" symbol="V+" value={p.vpos} onChange={(v) => set({ vpos: v })} unit="V" allowNegative allowZero />
        <NumField label="Negative supply" symbol="V−" value={p.vneg} onChange={(v) => set({ vneg: v })} unit="V" allowNegative allowZero />
        <NumField label="Output headroom to V−" value={p.oLo} onChange={(v) => set({ oLo: v })} unit="V" allowZero hint="How close the output swings to V− at your load (VOL above V−)." />
        <NumField label="Output headroom to V+" value={p.oHi} onChange={(v) => set({ oHi: v })} unit="V" allowZero hint="How close the output swings to V+ at your load (V+ − VOH)." />
        <NumField label="Input range above V−" value={p.cmLo} onChange={(v) => set({ cmLo: v })} unit="V" allowNegative allowZero hint="Common-mode input range: lowest input = V− + this value. Negative if the input range extends below V−." />
        <NumField label="Input range below V+" value={p.cmHi} onChange={(v) => set({ cmHi: v })} unit="V" allowNegative allowZero hint="Highest input = V+ − this value. Negative if the input range extends above V+." />
        <p className="text-faint">The defaults are generic placeholders, not a particular part. Enter the values from your op amp's datasheet at your supply, load and temperature.</p>
      </Section>
      <Section title="Noise" defaultOpen={false}>
        <NumField label="Temperature" value={p.temp} onChange={(v) => set({ temp: v })} unit="°C" allowNegative allowZero />
        <SiField label="Noise bandwidth" value={p.nbw} onChange={(v) => set({ nbw: v })} unit="Hz" prefixes={['', 'k', 'M']} allowZero hint="0 = equivalent noise bandwidth of the closed loop, 1.57 × f−3dB. Enter a value when a filter after the stage limits the bandwidth." />
      </Section>
    </>
  );

  return (
    <ToolPage
      title="Op-Amp Gain Calculator"
      description="Gain, noise gain, bandwidth, output swing, DC offset, noise and resistor-tolerance effects of inverting, non-inverting, difference and summing op-amp stages, with standard-value resistor pairs for a target gain."
      onReset={reset}
      properties={properties}
      status={status}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      <Notes items={notes} />
      {mode === 'design' && pairs.length > 0 && (
        <Panel title={`Resistor pairs for |G| = ${fmt(p.target, 5)} (${series})`}>
          <table className="tbl">
            <thead>
              <tr>
                <th>{topo === 'difference' ? 'R1 = R1′' : 'Rin (R1)'}</th>
                <th>{topo === 'difference' ? 'R2 = R2′' : 'Rf'}</th>
                <th className="v">Gain</th>
                <th className="v">Error</th>
                <th className="v">Rin + Rf</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((q, i) => (
                <tr key={`${q.rin}/${q.rf}`} className={i === 0 ? 'font-semibold' : ''}>
                  <td className="v">{si(q.rin, 'Ω', 3)}</td>
                  <td className="v">{si(q.rf, 'Ω', 3)}</td>
                  <td className="v">{fmt(q.gain, 6)}</td>
                  <td className="v">{pct(q.error)}</td>
                  <td className="v">{si(q.rin + q.rf, 'Ω', 3)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => set({ mode: 'analyse', r1: q.rin, r2: q.rf, ...(topo === 'difference' ? { r3: q.rin, r4: q.rf } : {}) })}
                      aria-label={`Use ${si(q.rin, 'Ω')} and ${si(q.rf, 'Ω')}`}
                    >
                      Use
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-faint">Ranked by gain error from the nominal values; the analysis below uses the first pair. Use copies a pair into the analysis inputs.</p>
        </Panel>
      )}
      {g && r && (
        <>
          <Panel title="Gain and bandwidth">
            <div className="flex flex-wrap gap-8 px-3 py-3">
              <Big label={topo === 'difference' ? 'Differential gain' : 'Signal gain'} value={fmt(g.signal, 5)} unit={`V/V (${fmt(db(g.signal), 4)} dB)`} />
              <Big label="Closed-loop bandwidth" value={split(r.bwExact, 'Hz').num} unit={split(r.bwExact, 'Hz').u} />
              <Big label="Noise gain" value={fmt(g.noise, 5)} unit="V/V" />
            </div>
            <div className="grid gap-3 xl:grid-cols-2">
              <table className="tbl">
                <tbody>
                  {g.terms.length > 1 &&
                    g.terms.map((t) => <Result key={t.name} label={topo === 'difference' ? (t.name === 'Vcm' ? 'Common-mode gain' : 'Differential gain') : `Gain from ${t.name}`} value={vv(t.k)} />)}
                  <Result label="Gain from Vref" value={vv(g.kRef)} />
                  <Result label="Noise gain 1 + Rf / Rg" value={vv(g.noise)} sub={`Rg = ${si(g.rg, 'Ω', 4)} at the − input`} />
                  <Result label="DC gain with finite AOL" value={vv(r.actual)} strong sub={`error ${pct(r.actual / g.signal - 1)} for AOL = ${fmt(p.aol, 4)} dB`} />
                  <Result label={`Gain with ±${fmt(p.tol, 3)} % resistors`} value={`${fmt(r.tol.gain.lo, 5)} … ${fmt(r.tol.gain.hi, 5)}`} unit="V/V" sub={`${pct(r.tol.gain.lo / g.signal - 1)} / ${pct(r.tol.gain.hi / g.signal - 1)}, worst-case corners`} />
                  {topo === 'difference' && (
                    <>
                      <Result label="CMRR, worst-case resistor corners" value={Number.isFinite(r.tol.cmrrWorst!) ? `${fmt(r.tol.cmrrWorst!, 4)} dB` : '∞ (exact match)'} strong />
                      <Result label="CMRR, MT-068 eq. 1" value={Number.isFinite(r.tol.cmrrMt068!) ? `${fmt(r.tol.cmrrMt068!, 4)} dB` : '—'} sub="20 log((1 + R2/R1) / 4Kr), four discrete resistors" />
                      <Result label="CMRR of the nominal values" value={Math.abs(g.terms[1].k) > 1e-12 ? `${fmt(db(g.signal / g.terms[1].k), 4)} dB` : '∞ (ratios match)'} />
                    </>
                  )}
                </tbody>
              </table>
              <table className="tbl">
                <tbody>
                  <Result label="Bandwidth GBW / NG" value={si(r.bw, 'Hz', 4)} sub="MT-033 estimate" />
                  <Result label="Bandwidth, single-pole model" value={si(r.bwExact, 'Hz', 4)} sub="GBW / NG + GBW / AOL" />
                  <Result label={`Gain at ${si(p.fsig, 'Hz', 3)}`} value={vv(closedLoopAt(g.signal, g.noise, fromDb(p.aol), p.gbw, p.fsig).closed)} sub="magnitude, single-pole model" />
                  <Result label="Full-power bandwidth" value={Number.isFinite(r.fpbw) ? si(r.fpbw, 'Hz', 4) : '—'} sub={`SR / (2π · ${si(r.vpk, 'V', 3)} peak)`} />
                  <Result label="Slew rate needed at f" value={`${fmt((2 * Math.PI * p.fsig * r.vpk) / 1e6, 4)} V/µs`} sub="2π · f · Vpk" />
                </tbody>
              </table>
            </div>
          </Panel>
          <div className="grid gap-3 xl:grid-cols-2">
            <Panel title="Circuit">
              <Schematic c={circuit} vref={p.vref} />
            </Panel>
            <Panel title="Bode plot (single-pole op amp model)">
              <Bode g={g} aol={fromDb(p.aol)} gbw={p.gbw} f3={r.bwExact} />
            </Panel>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            <Panel title="Signal range">
              <table className="tbl">
                <tbody>
                  <Result label="Ideal output range" value={`${si(r.out.lo, 'V', 4)} … ${si(r.out.hi, 'V', 4)}`} />
                  <Result label="Output swing available" value={`${si(r.outMin, 'V', 4)} … ${si(r.outMax, 'V', 4)}`} sub={ok(r.out.lo >= r.outMin && r.out.hi <= r.outMax)} strong />
                  <Result label="Op amp input voltage" value={`${si(r.cm.lo, 'V', 4)} … ${si(r.cm.hi, 'V', 4)}`} sub={topo === 'inverting' || topo === 'summing' ? 'both inputs sit at Vref' : '+ input; the − input follows it'} />
                  <Result label="Common-mode input range" value={`${si(r.cmMin, 'V', 4)} … ${si(r.cmMax, 'V', 4)}`} sub={ok(r.cm.lo >= r.cmMin && r.cm.hi <= r.cmMax)} strong />
                </tbody>
              </table>
            </Panel>
            <Panel title="DC output offset (worst case)">
              <table className="tbl">
                <tbody>
                  <Result label="From Vos × noise gain" value={si(r.off.fromVos, 'V', 4)} />
                  <Result label="From bias current" value={si(r.off.fromIb, 'V', 4)} sub={`IB · |Rf − NG · R+|, R+ = ${si(g.rPlus, 'Ω', 4)}`} />
                  <Result label="From offset current" value={si(r.off.fromIos, 'V', 4)} sub="(Ios / 2)(Rf + NG · R+)" />
                  <Result label="Total at the output" value={`±${si(r.off.total, 'V', 4)}`} strong sub={`±${si(r.off.total / Math.abs(g.signal), 'V', 3)} referred to the signal input`} />
                  {topo !== 'difference' && <Result label="Bias-compensation resistor R1 ∥ Rf" value={g.rf > 0 ? si(biasCompR(g.rg, g.rf), 'Ω', 4) : '—'} sub={p.comp ? `fitted: ${si(rcomp, 'Ω', 3)} (${series})` : 'not fitted'} />}
                </tbody>
              </table>
            </Panel>
          </div>
          <Panel title="Noise (white noise, single-pole bandwidth)">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Source</th>
                  <th className="v">At the output</th>
                  <th className="v">Share of power</th>
                </tr>
              </thead>
              <tbody>
                {r.src.map((s) => (
                  <tr key={s.name}>
                    <td>{s.name}</td>
                    <td className="v">{si(s.out, 'V/√Hz', 3)}</td>
                    <td className="v">{r.dens > 0 ? `${fmt(((s.out / r.dens) ** 2) * 100, 3)} %` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="tbl">
              <tbody>
                <Result label="Output noise density" value={si(r.dens, 'V/√Hz', 4)} strong />
                <Result label="Noise bandwidth" value={si(r.nb, 'Hz', 4)} sub={p.nbw > 0 ? 'entered' : '1.57 × closed-loop bandwidth (MT-048, MT-049)'} />
                <Result label="Output noise, rms" value={si(r.dens * Math.sqrt(r.nb), 'V', 4)} strong sub={`≈ ${si(6.6 * r.dens * Math.sqrt(r.nb), 'V', 3)} peak-to-peak (6.6 × rms)`} />
                <Result label="Referred to the input (÷ noise gain)" value={si((r.dens * Math.sqrt(r.nb)) / g.noise, 'V', 4)} sub={`${si(r.dens / g.noise, 'V/√Hz', 3)}, MT-049 convention`} />
                <Result label="Referred to the signal input (÷ |gain|)" value={si((r.dens * Math.sqrt(r.nb)) / Math.abs(g.signal), 'V', 4)} />
              </tbody>
            </table>
            <p className="px-3 py-2 text-faint">1/f noise, the noise of the source driving the stage and of the Vref source are not included.</p>
          </Panel>
        </>
      )}
    </ToolPage>
  );
}

/* ------------------------------------------------------------------ drawings */

function Res({ x, y, vertical = false, label, sub }: { x: number; y: number; vertical?: boolean; label: string; sub?: string }) {
  // (x, y) is the centre; 50 × 14 horizontal, 14 × 40 vertical
  return (
    <g>
      {vertical ? <rect x={x - 7} y={y - 20} width={14} height={40} fill="var(--sheet)" stroke="var(--ink)" strokeWidth={1.5} /> : <rect x={x - 25} y={y - 7} width={50} height={14} fill="var(--sheet)" stroke="var(--ink)" strokeWidth={1.5} />}
      <text x={vertical ? x + 12 : x} y={vertical ? y - 2 : y - 12} textAnchor={vertical ? 'start' : 'middle'} fontSize={12} fill="var(--ink)">
        {label}
      </text>
      {sub && (
        <text x={vertical ? x + 12 : x} y={vertical ? y + 12 : y + 22} textAnchor={vertical ? 'start' : 'middle'} fontSize={11} fill="var(--muted)">
          {sub}
        </text>
      )}
    </g>
  );
}

function Ground({ x, y, vref }: { x: number; y: number; vref: number }) {
  if (vref !== 0)
    return (
      <g>
        <circle cx={x} cy={y + 4} r={3} fill="var(--accent)" />
        <text x={x} y={y + 20} textAnchor="middle" fontSize={11} fill="var(--accent)">
          Vref {si(vref, 'V', 3)}
        </text>
      </g>
    );
  return <path d={`M${x - 10} ${y}H${x + 10} M${x - 6} ${y + 4}H${x + 6} M${x - 2} ${y + 8}H${x + 2}`} stroke="var(--ink)" strokeWidth={1.5} />;
}

function Terminal({ x, y, label, right = false }: { x: number; y: number; label: string; right?: boolean }) {
  return (
    <g>
      <circle cx={x} cy={y} r={3} fill="var(--accent)" />
      <text x={right ? x + 8 : x - 8} y={y + 4} textAnchor={right ? 'start' : 'end'} fontSize={12} fill="var(--accent)">
        {label}
      </text>
    </g>
  );
}

function Schematic({ c, vref }: { c: Circuit; vref: number }) {
  const R = (v: number) => si(v, 'Ω', 3);
  const wires: string[] = [];
  const parts: ReactNode[] = [];
  // op amp: − input (300,100), + input (300,140), output (380,120)
  const node = 200;
  wires.push('M300 100H' + node, 'M380 120H470', `M${node} 100V40H${node + 65}`, `M${node + 115} 40H430V120`);
  const fb = c.r2 > 0 || c.topology !== 'noninverting';
  if (fb) parts.push(<Res key="rf" x={node + 90} y={40} label={c.topology === 'difference' ? 'R2' : 'Rf'} sub={R(c.r2)} />);
  else wires.push(`M${node + 65} 40H${node + 115}`);
  const plus = (fromX: number) => wires.push(`M300 140H${fromX}`);
  switch (c.topology) {
    case 'inverting':
    case 'summing': {
      const ins = c.topology === 'inverting' ? [{ r: c.r1, n: 'R1', v: 'Vin' }] : [{ r: c.r1, n: 'R1', v: 'V1' }, { r: c.r3, n: 'R2', v: 'V2' }, { r: c.r4, n: 'R3', v: 'V3' }].filter((x) => x.r > 0);
      ins.forEach((x, i) => {
        const y = 100 + i * 40;
        wires.push(`M60 ${y}H95`, `M145 ${y}H${node}`);
        if (i > 0) wires.push(`M${node} ${y}V${y - 40}`);
        parts.push(<Res key={x.n} x={120} y={y} label={x.n} sub={R(x.r)} />, <Terminal key={x.v} x={60} y={y} label={x.v} />);
      });
      plus(270);
      if (c.rcomp > 0) {
        wires.push('M270 140V160', 'M270 200V215');
        parts.push(<Res key="rc" x={270} y={180} vertical label="Rcomp" sub={R(c.rcomp)} />);
      } else wires.push('M270 140V215');
      parts.push(<Ground key="g" x={270} y={215} vref={vref} />);
      break;
    }
    case 'noninverting': {
      wires.push(`M${node} 100H145`, 'M95 100H70V115');
      parts.push(<Res key="r1" x={120} y={100} label="R1" sub={R(c.r1)} />, <Ground key="g" x={70} y={115} vref={vref} />);
      const rsrc = c.rs + c.rcomp;
      if (rsrc > 0) {
        wires.push('M60 170H95', 'M145 170H260V140');
        parts.push(<Res key="rs" x={120} y={170} label={c.rcomp > 0 ? 'Rs + Rcomp' : 'Rs'} sub={R(rsrc)} />);
      } else wires.push('M60 170H260V140');
      plus(260);
      parts.push(<Terminal key="vin" x={60} y={170} label="Vin" />);
      break;
    }
    case 'difference': {
      wires.push('M60 100H95', `M145 100H${node}`, 'M60 170H95', 'M145 170H260V140', 'M260 170V185', 'M260 225V235');
      plus(260);
      parts.push(
        <Res key="r1" x={120} y={100} label="R1" sub={R(c.r1)} />,
        <Res key="r3" x={120} y={170} label="R1′" sub={R(c.r3)} />,
        <Res key="r4" x={260} y={205} vertical label="R2′" sub={R(c.r4)} />,
        <Terminal key="v1" x={60} y={100} label="V1" />,
        <Terminal key="v2" x={60} y={170} label="V2" />,
        <Ground key="g" x={260} y={235} vref={vref} />,
      );
      break;
    }
  }
  return (
    <svg viewBox="0 0 520 270" className="block h-auto w-full max-w-[640px]" role="img" aria-label={`${c.topology} op amp stage with its resistor values`}>
      <path d={wires.join(' ')} fill="none" stroke="var(--ink)" strokeWidth={1.5} />
      <path d="M300 80V160L380 120Z" fill="var(--sheet)" stroke="var(--ink)" strokeWidth={1.5} />
      <text x={308} y={104} fontSize={14} fill="var(--ink)">−</text>
      <text x={307} y={145} fontSize={14} fill="var(--ink)">+</text>
      <circle cx={node} cy={100} r={3} fill="var(--ink)" />
      <circle cx={430} cy={120} r={3} fill="var(--ink)" />
      {parts}
      <Terminal x={470} y={120} label="Vout" right />
    </svg>
  );
}

function Bode({ g, aol, gbw, f3 }: { g: Gains; aol: number; gbw: number; f3: number }) {
  const W = 600, H = 250, left = 50, right = 14, top = 18, bottom = 36;
  const fp = gbw / aol;
  const lo = Math.log10(Math.max(1e-3, Math.min(fp / 10, f3 / 1e4)));
  const hi = Math.log10(gbw * 10);
  const ymax = Math.ceil((db(aol) + 10) / 20) * 20;
  const ymin = -20;
  const X = (f: number) => left + ((Math.log10(f) - lo) / (hi - lo)) * (W - left - right);
  const Y = (v: number) => top + ((ymax - Math.max(ymin, Math.min(ymax, v))) / (ymax - ymin)) * (H - top - bottom);
  const N = 240;
  const fs = Array.from({ length: N + 1 }, (_, i) => 10 ** (lo + ((hi - lo) * i) / N));
  const pts = fs.map((f) => closedLoopAt(g.signal, g.noise, aol, gbw, f));
  const line = (v: number[]) => v.map((y, i) => `${i ? 'L' : 'M'}${X(fs[i]).toFixed(1)},${Y(y).toFixed(1)}`).join(' ');
  const xt: number[] = [];
  const step = Math.max(1, Math.ceil((hi - lo) / 7));
  for (let d = Math.ceil(lo); d <= hi; d += step) xt.push(10 ** d);
  const yt: number[] = [];
  const ystep = Math.max(20, Math.ceil((ymax - ymin) / 8 / 20) * 20);
  for (let v = ymin; v <= ymax; v += ystep) yt.push(v);
  return (
    <div className="px-2 pt-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Open-loop gain, noise gain and closed-loop gain versus frequency">
        {xt.map((f) => (
          <g key={f}>
            <line x1={X(f)} x2={X(f)} y1={top} y2={H - bottom} stroke="var(--line)" />
            <text x={X(f)} y={H - bottom + 15} textAnchor="middle" fontSize={11} fill="var(--muted)">{si(f, 'Hz', 2)}</text>
          </g>
        ))}
        {yt.map((v) => (
          <g key={v}>
            <line x1={left} x2={W - right} y1={Y(v)} y2={Y(v)} stroke="var(--line)" />
            <text x={left - 5} y={Y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{v}</text>
          </g>
        ))}
        <path d={line(pts.map((q) => db(q.open)))} fill="none" stroke="var(--muted)" strokeWidth={1.5} />
        <line x1={left} x2={W - right} y1={Y(db(g.noise))} y2={Y(db(g.noise))} stroke="var(--copper)" strokeDasharray="5 4" />
        <path d={line(pts.map((q) => db(q.closed)))} fill="none" stroke="var(--accent)" strokeWidth={2} />
        <line x1={X(f3)} x2={X(f3)} y1={top} y2={H - bottom} stroke="var(--ink)" strokeDasharray="2 3" />
        <rect x={left} y={top} width={W - left - right} height={H - top - bottom} fill="none" stroke="var(--line)" />
        <text x={left} y={12} fontSize={12} fill="var(--ink)">Gain (dB)</text>
        <text x={(left + W - right) / 2} y={H - 4} textAnchor="middle" fontSize={11} fill="var(--muted)">Frequency</text>
      </svg>
      <p className="px-2 pb-2 text-faint">
        Grey: open-loop gain AOL / (1 + j f/fp), fp = GBW / AOL = {si(fp, 'Hz', 3)}. Dashed: noise gain {fmt(db(g.noise), 3)} dB. Blue: |closed-loop signal gain|. Dotted: −3 dB at {si(f3, 'Hz', 3)}.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ method */

const REFS: { title: string; url: string; note: string }[] = [
  { title: 'ADI MT-033, Voltage Feedback Op Amp Gain and Bandwidth (Rev. 0, 10/08)', url: 'https://www.analog.com/media/en/training-seminars/tutorials/MT-033.pdf', note: 'Signal gain, noise gain (eq. 2–4), closed-loop gain with finite AVOL (eq. 1), gain-bandwidth product and closed-loop bandwidth (figure 5).' },
  { title: 'TI SLOD006B, Op Amps for Everyone, chapter 6', url: 'https://www.ti.com/lit/pdf/slod006', note: 'Inverting and non-inverting transfer functions with finite op amp gain a (eq. 6-11, 6-18) and their common loop gain (eq. 6-15, 6-19).' },
  { title: 'ADI MT-037, Op Amp Input Offset Voltage (Rev. 0, 10/08)', url: 'https://www.analog.com/media/en/training-seminars/tutorials/MT-037.pdf', note: 'Vos modelled in series with an input and amplified by the noise gain.' },
  { title: 'ADI MT-038, Op Amp Input Bias Current (Rev. 0, 10/08)', url: 'https://www.analog.com/media/en/training-seminars/tutorials/MT-038.pdf', note: 'IB+, IB−, Ios = IB+ − IB−; compensation resistor R3 = R1 ∥ R2 leaves VO = R2 · Ios (figure 3); not useful with bias-compensated inputs.' },
  { title: 'ADI MT-048, Op Amp Noise Relationships: 1/f Noise, RMS Noise, and Equivalent Noise Bandwidth (Rev. 0, 10/08)', url: 'https://www.analog.com/media/en/training-seminars/tutorials/MT-048.pdf', note: 'Equivalent noise bandwidth of a single pole, 1.57 fc (figure 4).' },
  { title: 'ADI MT-049, Op Amp Total Output Noise Calculations for Single-Pole System (Rev. 0, 10/08)', url: 'https://www.analog.com/media/en/training-seminars/tutorials/MT-049.pdf', note: 'Six noise sources, their gains to the output (figure 2) and the RTI expression with BW = 1.57 fCL (figure 1).' },
  { title: 'ADI MT-068, Difference and Current Sense Amplifiers (Rev. 0, 10/08)', url: 'https://www.analog.com/media/en/training-seminars/tutorials/MT-068.pdf', note: 'Four-resistor difference amplifier (figure 1) and worst-case CMR with resistor tolerance (eq. 1, 2).' },
  { title: 'TI SLOA088, Active Filter Design Techniques (Op Amps for Everyone, chapter 16), section 16.8.4', url: 'https://www.ti.com/lit/ml/sloa088/sloa088.pdf', note: 'Slew rate for full-power output, SR = π · Vpp · f.' },
];

export function Method() {
  return (
    <>
      <h2>Signal gain and noise gain</h2>
      <p>
        Rg is the resistance from the inverting input to the signal sources (R1, or R1 ∥ R2 ∥ R3 for the summer) and Rf the feedback resistor. The signal gain is −Rf/R1 for the inverting stage and 1 + Rf/R1
        for the non-inverting stage; the noise gain, the gain seen by a voltage in series with an op amp input, is the same for both:
      </p>
      <div className="eq"><span className="no">(1)</span>NG = 1 + Rf / Rg</div>
      <p>
        The difference amplifier (MT-068 figure 1) gives Vout = V2 · R2′/(R1′ + R2′) · NG − V1 · R2/R1 + Vref · R1′/(R1′ + R2′) · NG with NG = 1 + R2/R1. Writing V1 = Vcm − Vd/2 and V2 = Vcm + Vd/2
        splits this into the differential gain (a1 + a2)/2 and the common-mode gain a2 − a1, where a1 = R2/R1 and a2 = R2′/(R1′ + R2′) · NG. Vref is the voltage at the grounded end of the network: the + input
        of the inverting stages (output term NG · Vref), the foot of R1 of the non-inverting stage (−Rf/R1 · Vref) and the REF terminal of the difference amplifier.
      </p>
      <h2>Finite open-loop gain and bandwidth</h2>
      <p>With an open-loop gain AOL the loop gain is AOL/NG for every topology, and the closed-loop gain is the ideal gain divided by 1 + NG/AOL (MT-033 eq. 1; SLOD006B eq. 6-18 for the inverting stage):</p>
      <div className="eq"><span className="no">(2)</span>G = G<sub>ideal</sub> / (1 + NG / AOL)</div>
      <p>
        For a single-pole op amp, AOL(f) = AOL / (1 + j f/fp) with fp = GBW / AOL. The closed loop then has one pole; its −3 dB frequency is GBW/NG + GBW/AOL, which is the MT-033 estimate GBW/NG when AOL ≫ NG.
        Real op amps have further poles, so treat the bandwidth as an estimate and check stability at low noise gain for decompensated parts. The full-power bandwidth for an output of peak amplitude
        Vpk is SR/(2π Vpk), the TI rule SR = π · Vpp · f solved for f. Vpk is taken as half the span of the ideal output range.
      </p>
      <h2>Output and input range</h2>
      <p>
        The output range is the ideal output over the entered input range (the output is linear in each input, so the end points are enough). It is compared with V− + headroom … V+ − headroom. The op amp input
        voltage is Vref for the inverting stages, the input voltage for the non-inverting stage and (V2 R2′ + Vref R1′)/(R1′ + R2′) for the difference amplifier; it is compared with the common-mode input
        range. Take both headroom figures from the datasheet at your supply voltage and load.
      </p>
      <h2>DC offset</h2>
      <p>
        Vos appears at the output multiplied by NG (MT-037). The bias currents give IB− · Rf − NG · R+ · IB+, where R+ is the DC resistance at the + input. With IB± = IB ± Ios/2 the worst case is
      </p>
      <div className="eq"><span className="no">(3)</span>|Vout| ≤ NG |Vos| + IB |Rf − NG R+| + (Ios/2)(Rf + NG R+)</div>
      <p>
        With R+ = Rg ∥ Rf the IB term vanishes and the bias error is Rf · Ios (MT-038 figure 3); the tool can add that resistor, rounded to the selected series. The difference amplifier has this balance
        when R1′ ∥ R2′ = R1 ∥ R2. Compensation does not help op amps with internally bias-compensated or rail-to-rail inputs, whose two bias currents are not matched (MT-038).
      </p>
      <h2>Noise</h2>
      <p>
        The six white-noise sources of MT-049 are referred to the output: en, the current noise in R+ and the Johnson noise √(4kTR+) times NG; the current noise at the − input times Rf; the Johnson noise of
        Rg times Rf/Rg; and the Johnson noise of Rf directly. They are uncorrelated and add as a root sum of squares. The rms value uses the equivalent noise bandwidth 1.57 × f−3dB of the closed loop
        (MT-048), unless a noise bandwidth is entered. Referred-to-input noise follows MT-049 (divide by NG); dividing by the signal gain gives the noise relative to the signal source instead. k = 1.380649 ×
        10⁻²³ J/K. Peak-to-peak is estimated as 6.6 × rms, the usual figure for Gaussian noise.
      </p>
      <h2>Resistor tolerance and CMRR</h2>
      <p>
        The gain range evaluates every combination of resistors at nominal × (1 ± tolerance). For the difference amplifier all 16 corners are evaluated and the lowest |Ad/Acm| is the worst-case CMRR. MT-068
        eq. 1 gives the first-order result for four discrete resistors of tolerance Kr, which the corner calculation reproduces for small Kr:
      </p>
      <div className="eq"><span className="no">(4)</span>CMR = 20 log₁₀((1 + R2/R1) / (4 Kr))</div>
      <p>Four unselected 1 % resistors at unity gain give about 34 dB. The op amp's own CMRR, assumed much higher, is not included.</p>
      <h2>Standard-value pairs</h2>
      <p>
        Design mode searches the selected E series for Rin with Rin + Rf within a factor of √10 of the entered total, takes the two series values either side of the exact Rf, and ranks the pairs by gain
        error from the nominal values. For the difference amplifier the same pair is used for R1 = R1′ and R2 = R2′.
      </p>
      <h2>References</h2>
      <ol>
        {REFS.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noopener noreferrer">
              {s.title}
            </a>
            <div className="text-[12px] text-muted">{s.note}</div>
          </li>
        ))}
      </ol>
    </>
  );
}
