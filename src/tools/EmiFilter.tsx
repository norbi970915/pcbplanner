import { useId, useState } from 'react';
import { SiField } from '../components/SiField';
import { ToolPage } from '../components/ToolPage';
import { Big, Check, Notes, NumField, Panel, Result, Section, SelectField } from '../components/ui';
import type { ESeries } from '../lib/electronics';
import { emiLcFrequency, emiResponse, emiSize, emiStandard, emiSweep, type EmiCap, type EmiCircuit, type EmiPoint } from '../lib/emiFilter';
import { fmt, si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = {
  topology: 'lc', part: 'inductor', mode: 'analyse', direction: 'voltage',
  l: 4.7e-6, rdc: 0.08, cp: 5e-12, rac: 1082,
  c1: 1e-6, esr1: 0.02, esl1: 1e-9, c2: 1e-6, esr2: 0.02, esl2: 1e-9,
  rs: 0.1, rl: 10, damping: false, rd: 2.2, cd: 4.7e-6,
  current: 1, f0: 100e3, f: 1e6, target: 40, lo: 100, hi: 100e6, series: 'E24',
};
const db = (v: number) => `${fmt(v, 4)} dB`;
const split = (v: number, u: string) => { const [value, ...unit] = si(v, u, 4).split(' '); return { value, unit: unit.join(' ') }; };

export default function EmiFilter() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const [resetKey, setResetKey] = useState(0);
  const part = p.part === 'ferrite' ? 'ferrite' : 'inductor';
  const topology = p.topology === 'pi' ? 'pi' : 'lc';
  const mode = part === 'inductor' && (p.mode === 'l' || p.mode === 'c') ? p.mode : 'analyse';
  const series = (['E12', 'E24', 'E96'].includes(p.series) ? p.series : 'E24') as ESeries;
  const reverse = p.direction === 'current';
  const errors: string[] = [], notes: string[] = [];
  let circuit: EmiCircuit | null = null;
  let sweep: ReturnType<typeof emiSweep> | null = null;
  let undamped: ReturnType<typeof emiSweep> | null = null;
  let probe: EmiPoint | null = null;
  let standard: ReturnType<typeof emiStandard> = [];
  try {
    if (!Number.isFinite(p.current) || p.current < 0 || p.current > 1e4) throw new RangeError('DC load current must be between 0 and 10 kA.');
    if (!Number.isFinite(p.target) || p.target < 0 || p.target > 200) throw new RangeError('Required attenuation must be between 0 and 200 dB.');
    const l = mode === 'l' ? emiSize(p.f0, p.c2, 'l') : p.l;
    const c2 = mode === 'c' ? emiSize(p.f0, p.l, 'c') : p.c2;
    const candidate: EmiCircuit = {
      topology, part, l, rdc: p.rdc, cp: p.cp, rac: p.rac,
      c1: { c: p.c1, esr: p.esr1, esl: p.esl1 }, c2: { c: c2, esr: p.esr2, esl: p.esl2 },
      rs: p.rs, rl: p.rl, damping: p.damping, rd: p.rd, cd: p.cd,
    };
    probe = emiResponse(candidate, p.f);
    sweep = emiSweep(candidate, p.lo, p.hi);
    if (p.damping) undamped = emiSweep({ ...candidate, damping: false }, p.lo, p.hi);
    standard = emiStandard(candidate, series, p.f);
    circuit = candidate;
  } catch (e) { errors.push(e instanceof Error ? e.message : 'Unable to analyse this filter.'); }
  if (circuit && sweep && probe) {
    if (sweep.peakingDb > 1) notes.push(`The response peaks ${db(sweep.peakingDb)} above its DC value at ${si(sweep.peak.f, 'Hz')}. Try an RC damping branch and compare the curves.`);
    if (probe.attenuation < p.target) notes.push(`At ${si(p.f, 'Hz')}, insertion attenuation is ${db(probe.attenuation)} against the requested ${db(p.target)}. ${probe.attenuation < 0 ? 'A negative value means the filter amplifies this frequency relative to the circuit without a filter.' : 'Check the loaded response after changing values.'}`);
    if (p.f < p.lo || p.f > p.hi) notes.push('The probe frequency is outside the plotted band. Its result is calculated separately; extend the sweep to include it.');
    if (part === 'ferrite') notes.push('Enter ferrite model parameters fitted at your operating current. A bead’s rated current or its impedance at 100 MHz alone cannot establish this response. The AN-1368 example uses a zero-bias model.');
    if (p.damping && p.cd <= circuit.c2.c) notes.push('The damping capacitor is no larger than C2. The branch may have little resistive effect near the LC reference; inspect the comparison rather than assuming it removes peaking.');
    if (topology === 'pi' && p.rs < 0.01) notes.push('With a very low source resistance, C1 has little effect on the forward voltage response. The π filter includes this loading; it is not two independent LC stages.');
  }
  const properties = <div key={resetKey}>
    <Section title="Filter">
      <SelectField label="Topology" value={topology} onChange={topology => set({ topology })} options={[{ value: 'lc', label: 'LC (series–shunt)' }, { value: 'pi', label: 'π (C–L–C)' }]} />
      <SelectField label="Series component" value={part} onChange={part => set({ part })} options={[{ value: 'inductor', label: 'Inductor' }, { value: 'ferrite', label: 'Ferrite bead' }]} />
      <SelectField label="Noise path" value={reverse ? 'current' : 'voltage'} onChange={direction => set({ direction })} options={[{ value: 'voltage', label: 'Supply → load (V)' }, { value: 'current', label: 'Load → supply (I)' }]} />
      {part === 'inductor' && <SelectField label="Calculate" value={mode} onChange={mode => set({ mode })} options={[{ value: 'analyse', label: 'Analyse parts' }, { value: 'l', label: 'L from f₀ and C2' }, { value: 'c', label: 'C2 from f₀ and L' }]} />}
      {mode !== 'analyse' && <><SiField label="LC reference" symbol="f₀" value={p.f0} onChange={f0 => set({ f0 })} unit="Hz" prefixes={['', 'k', 'M']} /><p className="text-faint">f₀ = 1/(2π√LC2). This sizes a starting point; it is not the loaded −3 dB cutoff.</p></>}
    </Section>
    <Section title={part === 'ferrite' ? 'Ferrite Equivalent Model' : 'Series Inductor'}>
      {mode !== 'l' && <SiField label={part === 'ferrite' ? 'Model inductance' : 'Inductance'} symbol="L" value={p.l} onChange={l => set({ l })} unit="H" prefixes={['n', 'µ', 'm']} />}
      <SiField label="DC resistance" symbol="Rdc" value={p.rdc} onChange={rdc => set({ rdc })} unit="Ω" prefixes={['m', '', 'k']} allowZero />
      <SiField label="Parallel capacitance" symbol="Cp" value={p.cp} onChange={cp => set({ cp })} unit="F" prefixes={['p', 'n']} allowZero />
      {part === 'ferrite' && <>
        <SiField label="AC loss resistance" symbol="Rac" value={p.rac} onChange={rac => set({ rac })} unit="Ω" prefixes={['', 'k']} />
        <p className="text-faint">Rdc in series with L ∥ Rac ∥ Cp. Fit the whole impedance curve at the operating current.</p>
        <button type="button" className="btn" onClick={() => set({ part: 'ferrite', mode: 'analyse', topology: 'lc', l: 1.208e-6, rdc: 0.3, cp: 1.678e-12, rac: 1082, c2: 10e-9, esr2: 0.001, esl2: 0, rs: 0.1, rl: 1e6, current: 0, damping: false, f: 100e6, lo: 100e3, hi: 1e9 })}>Load AN-1368 bead example</button>
        <p className="text-faint">Published zero-bias bead fit. The surrounding circuit values are illustrative, not a measured filter preset.</p>
      </>}
    </Section>
    {topology === 'pi' && <CapFields title="Input Capacitor C1" cap={{ c: p.c1, esr: p.esr1, esl: p.esl1 }} onChange={c => set({ c1: c.c, esr1: c.esr, esl1: c.esl })} />}
    <CapFields title="Output Capacitor C2" cap={{ c: p.c2, esr: p.esr2, esl: p.esl2 }} hideC={mode === 'c'} onChange={c => set({ c2: c.c, esr2: c.esr, esl2: c.esl })} />
    <Section title="Source and Load">
      <SiField label="Source resistance" symbol="Rs" value={p.rs} onChange={rs => set({ rs })} unit="Ω" prefixes={['m', '', 'k']} hint="Small-signal Thevenin resistance. Use at least 1 µΩ; not a fixed 50 Ω test fixture unless that matches your setup." />
      <SiField label="Load resistance" symbol="RL" value={p.rl} onChange={rl => set({ rl })} unit="Ω" prefixes={['', 'k', 'M']} allowZero hint="Small-signal resistive load. 0 disconnects the load; it is not a short circuit." />
      <SiField label="DC load current" value={p.current} onChange={current => set({ current })} unit="A" prefixes={['m', '']} allowZero />
      <p className="text-faint">RL is the AC termination; current is used only for Rdc voltage drop and heat. Neither sets saturation or magnetic bias automatically.</p>
    </Section>
    <Section title="Resonance Damping">
      <Check label="Add series RC branch across C2" checked={p.damping} onChange={damping => set({ damping })} />
      {p.damping && <>
        <SiField label="Damping resistor" symbol="Rd" value={p.rd} onChange={rd => set({ rd })} unit="Ω" prefixes={['m', '', 'k']} />
        <SiField label="Blocking capacitor" symbol="Cd" value={p.cd} onChange={cd => set({ cd })} unit="F" prefixes={['n', 'µ', 'm']} />
        <p className="text-faint">Cd blocks DC through Rd. Enter Cd’s total series resistance in Rd; this branch assumes negligible ESL.</p>
      </>}
    </Section>
    <Section title="Frequency Check">
      <SiField label="Noise / probe frequency" value={p.f} onChange={f => set({ f })} unit="Hz" prefixes={['', 'k', 'M', 'G']} />
      <NumField label="Required attenuation" value={p.target} onChange={target => set({ target })} unit="dB" allowZero />
      <SiField label="Sweep start" value={p.lo} onChange={lo => set({ lo })} unit="Hz" prefixes={['', 'k', 'M', 'G']} />
      <SiField label="Sweep end" value={p.hi} onChange={hi => set({ hi })} unit="Hz" prefixes={['', 'k', 'M', 'G']} />
      {part === 'inductor' && <SelectField label="Preferred values" value={series} onChange={series => set({ series })} options={['E12', 'E24', 'E96'].map(value => ({ value, label: value }))} />}
    </Section>
  </div>;

  return <ToolPage title="EMI Filter Designer" description="Design and analyse differential-mode LC, π and ferrite-bead filters for DC rails, including source/load impedance, component parasitics, resonance and RC damping."
    properties={properties} onReset={() => { reset(); setResetKey(k => k + 1); }} method={<Method />}
    status={circuit && probe ? `${topology === 'pi' ? 'π' : 'LC'} · ${part === 'ferrite' ? 'Ferrite' : 'Inductor'} · ${db(probe.attenuation)} insertion attenuation at ${si(p.f, 'Hz')}` : 'Check the inputs'}>
    <Notes kind="error" items={errors} /><Notes items={notes} />
    {circuit && probe && sweep && <>
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="Filter Check" right={<span className={`text-[11px] ${probe.attenuation >= p.target ? 'text-accent-ink' : 'text-muted'}`}>{probe.attenuation >= p.target ? 'Probe target met' : 'Below probe target'}</span>}>
          <div className="flex flex-wrap gap-8 px-3 py-3">
            <Big label="Insertion attenuation" value={fmt(probe.attenuation, 4)} unit="dB" />
            <Big label="LC reference f₀" {...split(emiLcFrequency(circuit.l, circuit.c2.c), 'Hz')} />
          </div>
          <table className="tbl"><tbody>
            <Result label="Probe frequency" value={si(p.f, 'Hz', 5)} />
            <Result label="Required / achieved attenuation" value={`${db(p.target)} / ${db(probe.attenuation)}`} strong sub="Relative to the same source and load without a filter." />
            <Result label={reverse ? 'Reverse-current ratio Is / Inoise' : 'Voltage ratio Vout / Vs'} value={`${fmt(probe.gain, 5)} ${reverse ? 'A/A' : 'V/V'}`} sub={`${db(probe.gainDb)} · phase ${fmt(probe.phase, 4)}°`} />
            <Result label="Series part L" value={si(circuit.l, 'H', 5)} sub={mode === 'l' ? 'Calculated from the LC reference.' : undefined} />
            <Result label="Output capacitor C2" value={si(circuit.c2.c, 'F', 5)} sub={mode === 'c' ? 'Calculated from the LC reference.' : undefined} />
            <Result label="Resonance peaking in sweep" value={db(sweep.peakingDb)} sub={`${si(sweep.peak.f, 'Hz', 4)} · relative to the DC response`} />
            {undamped && <Result label="Peaking without damping" value={db(undamped.peakingDb)} sub={`At ${si(undamped.peak.f, 'Hz', 4)}`} />}
          </tbody></table>
        </Panel>
        <Panel title="Circuit and DC Loss">
          <Circuit i={circuit} reverse={reverse} />
          <table className="tbl"><tbody>
            <Result label="Series-part DC voltage drop" value={si(p.current * circuit.rdc, 'V', 4)} sub="I × Rdc; source resistance is excluded." />
            <Result label="Series-part DC dissipation" value={si(p.current ** 2 * circuit.rdc, 'W', 4)} sub="I² × Rdc; AC/core losses are excluded." />
            <Result label="Unloaded filter output |Z| at probe" value={si(probe.zout, 'Ω', 4)} />
            <Result label="Peak unloaded output |Z| in sweep" value={si(sweep.peakZout.zout, 'Ω', 4)} sub={`At ${si(sweep.peakZout.f, 'Hz', 4)}`} />
            <Result label="Series-part |Z| at probe" value={si(probe.seriesZ, 'Ω', 4)} />
            {circuit.cp > 0 && <Result label="Series-part L/Cp reference" value={si(emiLcFrequency(circuit.l, circuit.cp), 'Hz', 4)} sub="Parasitic resonance reference; losses shift the impedance peak." />}
            {circuit.c2.esl > 0 && <Result label="C2 series resonance" value={si(emiLcFrequency(circuit.c2.esl, circuit.c2.c), 'Hz', 4)} sub="Capacitor behaves inductively above this model frequency." />}
          </tbody></table>
          <p className="px-3 py-2 text-faint">Use effective capacitance at the rail voltage and magnetic data at the load current. Verify current, saturation, voltage and thermal ratings separately.</p>
        </Panel>
      </div>
      <Panel title="Frequency Response">
        <div className="grid gap-3 xl:grid-cols-2">
          <FilterPlot circuit={circuit} points={sweep.points} comparison={undamped?.points} f={p.f} target={p.target} onFrequency={f => set({ f })} />
          <FilterPlot circuit={circuit} points={sweep.points} comparison={undamped?.points} f={p.f} target={p.target} onFrequency={f => set({ f })} impedance />
        </div>
        <p className="px-3 pb-2 text-faint">Solid: selected circuit. {undamped ? 'Dashed: damping branch removed. ' : ''}Click a plot to move the probe; arrow keys adjust frequency. Peaks refer only to the displayed band. Negative insertion attenuation means amplification.</p>
      </Panel>
      {standard.length > 0 && <Panel title={`Nearby Standard L and C2 (${series})`}>
        <table className="tbl"><thead><tr><th>L</th><th>C2</th><th className="v">LC reference</th><th className="v">Reference error</th><th className="v">Attenuation at probe</th><th /></tr></thead><tbody>
          {standard.map(row => <tr key={`${row.l}/${row.c}`}><td>{si(row.l, 'H', 5)}</td><td>{si(row.c, 'F', 5)}</td><td className="v">{si(row.f0, 'Hz', 5)}</td><td className="v">{fmt(row.errorPct, 4)} %</td><td className="v">{db(row.attenuation)}</td>
            <td><button type="button" className="btn" onClick={() => set({ l: row.l, c2: row.c, mode: 'analyse' })} aria-label={`Use ${si(row.l, 'H')} and ${si(row.c, 'F')}`}>Use</button></td></tr>)}
        </tbody></table>
        <p className="px-3 py-2 text-faint">Ranked by LC reference error, not attenuation. Use recalculates the complete filter; entered losses and parasitics stay fixed. Preferred values do not establish part availability or tolerance.</p>
      </Panel>}
      <Panel title="How to Use the Result"><ol className="list-decimal space-y-1 px-3 py-3 pl-8 text-muted">
        <li>Choose the topology and enter effective component values and source/load impedances.</li>
        <li>Probe the noise frequency and compare insertion attenuation with your target. Sweep beyond that frequency to inspect resonance and parasitic leakage.</li>
        <li>Enable damping if a peak is troublesome, then check the response and unloaded output impedance again.</li>
        <li>For a switching-converter input, compare filter output impedance with the converter’s frequency-dependent input impedance. A resistive RL does not model its negative incremental input resistance.</li>
      </ol></Panel>
    </>}
  </ToolPage>;
}

function CapFields({ title, cap, onChange, hideC = false }: { title: string; cap: EmiCap; onChange: (c: EmiCap) => void; hideC?: boolean }) {
  return <Section title={title}>
    {!hideC && <SiField label="Effective capacitance" value={cap.c} onChange={c => onChange({ ...cap, c })} unit="F" prefixes={['p', 'n', 'µ', 'm']} />}
    <SiField label="Series resistance" symbol="ESR" value={cap.esr} onChange={esr => onChange({ ...cap, esr })} unit="Ω" prefixes={['m', '']} allowZero />
    <SiField label="Series inductance" symbol="ESL" value={cap.esl} onChange={esl => onChange({ ...cap, esl })} unit="H" prefixes={['n', 'µ']} allowZero />
  </Section>;
}

function Circuit({ i, reverse }: { i: EmiCircuit; reverse: boolean }) {
  const shuntCap = (x: number, label: string) => <g key={x}><path d={`M${x} 55V98 M${x - 12} 98H${x + 12} M${x - 12} 108H${x + 12} M${x} 108V166`} /><text x={x - 18} y={139} textAnchor="end" stroke="none" fill="var(--muted)">{label}</text><circle cx={x} cy={55} r={2.5} fill="var(--accent)" stroke="none" /></g>;
  return <div className="px-2 pt-2"><svg viewBox="0 0 540 205" className="w-full max-w-[640px]" role="img" aria-label={`${i.topology === 'pi' ? 'C1 shunt, series part, C2 shunt' : 'Series part then C2 shunt'}, resistive source and load${i.damping ? ', with series Rd Cd across the output' : ''}.`}>
    <g fill="none" stroke="var(--ink)" strokeWidth={1.5} fontSize={12}>
      <circle cx={28} cy={105} r={17} /><path d="M28 88V55H65 M28 122V166H506 M95 55H225 M287 55H506 M260 166V176 M246 176H274 M251 182H269 M256 188H264" />
      <rect x={65} y={47} width={30} height={16} />
      {i.part === 'ferrite' ? <rect x={225} y={46} width={62} height={18} /> : <path d="M225 55h2 a7 7 0 0 1 14 0 a7 7 0 0 1 14 0 a7 7 0 0 1 14 0 a7 7 0 0 1 14 0h4" />}
      {i.topology === 'pi' && shuntCap(154, 'C1')}{shuntCap(332, 'C2')}
      {i.damping && <><path d="M411 55V78 M411 104V120 M397 120H425 M397 132H425 M411 132V166" /><rect x={403} y={78} width={16} height={26} /><text x={435} y={96} stroke="none" fill="var(--muted)">Rd</text><text x={435} y={137} stroke="none" fill="var(--muted)">Cd</text></>}
      {i.rl > 0 && <><path d="M506 55V91 M506 125V166" /><rect x={498} y={91} width={16} height={34} /><text x={490} y={143} textAnchor="end" stroke="none" fill="var(--muted)">RL</text></>}
      <path d="M23 100H33 M28 95V105 M23 113H33" />
    </g>
    <g fontSize={12} fill="var(--muted)" textAnchor="middle"><text x={28} y={40}>Vs</text><text x={80} y={38}>Rs</text><text x={256} y={38}>{i.part === 'ferrite' ? 'Bead model' : 'L + parasitics'}</text><text x={492} y={40}>Vout</text></g>
    <path d={reverse ? 'M355 14H192 M192 14l8 -5 M192 14l8 5' : 'M192 14H355 M355 14l-8 -5 M355 14l-8 5'} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
  </svg><p className="px-1 pb-2 text-muted">{reverse ? 'Current noise is injected at Vout. The ratio reports current reaching the source branch, with Vs shorted and RL retained.' : 'Vs is the ideal source before Rs. Voltage noise is applied at Vs and measured at Vout.'} ESR/ESL are included in each capacitor.</p></div>;
}

function FilterPlot({ circuit, points, comparison, f, target, onFrequency, impedance = false }: {
  circuit: EmiCircuit; points: EmiPoint[]; comparison?: EmiPoint[]; f: number; target: number; onFrequency: (f: number) => void; impedance?: boolean;
}) {
  const id = useId();
  const W = 640, H = 265, left = 62, right = 18, top = 28, bottom = 42;
  const a = Math.log10(points[0].f), b = Math.log10(points[points.length - 1].f);
  const value = (p: EmiPoint) => impedance ? Math.log10(p.zout) : p.attenuation;
  const all = [...points, ...(comparison ?? [])].map(value);
  let ymin = Math.min(...all, impedance ? 0 : target, 0), ymax = Math.max(...all, impedance ? 0 : target, 0);
  if (impedance) { ymin = Math.floor(ymin) - 0.25; ymax = Math.ceil(ymax) + 0.25; }
  else { ymin = Math.floor(ymin / 10) * 10 - 5; ymax = Math.ceil(ymax / 10) * 10 + 5; }
  const X = (v: number) => left + (Math.log10(v) - a) / (b - a) * (W - left - right);
  const Y = (v: number) => top + (ymax - v) / (ymax - ymin) * (H - top - bottom);
  const path = (rows: EmiPoint[]) => rows.map((p, n) => `${n ? 'L' : 'M'}${X(p.f).toFixed(2)},${Y(value(p)).toFixed(2)}`).join(' ');
  const xstep = Math.max(1, Math.ceil((b - a) / 5));
  const xticks = Array.from({ length: Math.floor((b - Math.ceil(a)) / xstep) + 1 }, (_, n) => 10 ** (Math.ceil(a) + n * xstep));
  const yticks = Array.from({ length: 5 }, (_, n) => ymin + (ymax - ymin) * n / 4);
  const probe = emiResponse(circuit, f);
  const pointerF = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width * W;
    return 10 ** (a + Math.max(0, Math.min(1, (x - left) / (W - left - right))) * (b - a));
  };
  const apply = (v: number) => onFrequency(Math.max(1, Math.min(3e9, v)));
  return <div className="min-w-0 px-2 pt-2"><svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[740px]" role="slider" tabIndex={0}
    aria-label={`${impedance ? 'Output impedance' : 'Insertion attenuation'} frequency probe`} aria-valuemin={1} aria-valuemax={3e9} aria-valuenow={f} aria-valuetext={si(f, 'Hz')}
    onPointerDown={e => apply(pointerF(e))} onKeyDown={e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); apply(e.key === 'Home' ? points[0].f : e.key === 'End' ? points[points.length - 1].f : f * 10 ** ((e.key === 'ArrowRight' ? 1 : -1) / 20)); } }}>
    <title>{impedance ? 'Unloaded filter output impedance versus frequency' : 'Insertion attenuation versus frequency'}</title>
    <defs><clipPath id={id}><rect x={left} y={top} width={W - left - right} height={H - top - bottom} /></clipPath></defs>
    <text x={left} y={15} fill="var(--ink)" fontSize={12}>{impedance ? 'Unloaded output |Z| (Ω)' : 'Insertion attenuation (dB)'}</text>
    {xticks.map(x => <g key={x}><line x1={X(x)} x2={X(x)} y1={top} y2={H - bottom} stroke="var(--line)" /><text x={X(x)} y={H - bottom + 17} textAnchor="middle" fontSize={11} fill="var(--muted)">{si(x, 'Hz', 2)}</text></g>)}
    {yticks.map(y => <g key={y}><line x1={left} x2={W - right} y1={Y(y)} y2={Y(y)} stroke="var(--line)" /><text x={left - 6} y={Y(y) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{impedance ? si(10 ** y, '', 2).trim() : fmt(y, 3)}</text></g>)}
    <g clipPath={`url(#${id})`}>
      {!impedance && <line x1={left} x2={W - right} y1={Y(target)} y2={Y(target)} stroke="var(--muted)" strokeDasharray="2 4" />}
      {comparison && <path d={path(comparison)} fill="none" stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="5 4" />}
      <path d={path(points)} fill="none" stroke={impedance ? 'var(--copper)' : 'var(--accent)'} strokeWidth={2} />
      <line x1={X(f)} x2={X(f)} y1={top} y2={H - bottom} stroke="var(--ink)" strokeDasharray="2 3" />
      <circle cx={X(f)} cy={Y(value(probe))} r={4} fill={impedance ? 'var(--copper)' : 'var(--accent)'} />
    </g>
    <rect x={left} y={top} width={W - left - right} height={H - top - bottom} fill="none" stroke="var(--line)" />
    <text x={(left + W - right) / 2} y={H - 3} fill="var(--muted)" fontSize={11} textAnchor="middle">Frequency</text>
  </svg><p className="px-2 pb-2 text-muted">{si(f, 'Hz', 4)} · {impedance ? si(probe.zout, 'Ω', 4) : `${db(probe.attenuation)} · required ${db(target)}`}</p></div>;
}

export function Method() {
  return <>
    <h2>Scope and noise direction</h2>
    <p>A lumped differential-mode filter for a DC rail and its return conductor. LC has one series part followed by shunt C2; π adds shunt C1 before the series part. The source is a Thevenin voltage Vs with a positive, purely resistive Rs. RL = 0 removes the load. All capacitors share the same ideal return.</p>
    <p>Forward voltage gain is H = Vout/Vs. For reverse conducted noise, a current source Inoise is placed across the output, Vs is shorted and RL remains connected. Reciprocity gives Isource/Inoise = H for this circuit. This is a current ratio into the source branch, not a reverse voltage ratio or a radiated-emissions prediction.</p>
    <h2>Component models</h2>
    <div className="eq">ZC = ESR + jωESL + 1/(jωC), ω = 2πf</div>
    <p>Capacitance is the effective value at the operating voltage. The inductor model is (Rdc + jωL) in parallel with Cp. It includes winding resistance and self-capacitance, but not frequency-dependent core loss. The ferrite model uses Rdc in series with the parallel combination of jωL, Rac and 1/(jωCp), following AN-1368. Cp = 0 removes that branch.</p>
    <p>The AN-1368 bead example uses L = 1.208 µH, Rdc = 0.3 Ω, Rac = 1.082 kΩ and Cp = 1.678 pF, extracted at zero DC bias. Its illustrative capacitor and terminations are not measured data. Model parameters should be fitted to the manufacturer’s complex impedance curve at the actual operating current. A single impedance specification at 100 MHz does not determine L, Rac and Cp; no universal current-based derating law is applied.</p>
    <h2>Loaded network calculation</h2>
    <p>Let Z be the series-part impedance, Y1 = 1/ZC1 for π (0 for LC), Y2 = 1/ZC2 + Yd and YL = 1/RL (0 for a disconnected load). With damping enabled, Yd = 1/[Rd + 1/(jωCd)]. Rd includes the damping capacitor’s ESR; its ESL is neglected.</p>
    <div className="eq">H = 1 / [(1 + RsY1)(1 + Z(Y2 + YL)) + Rs(Y2 + YL)]</div>
    <p>This follows from the two node current equations. It includes the interaction of C1 and C2; individual stage responses are not multiplied. With the filter removed, Hbare = RL/(Rs + RL), or 1 without a load.</p>
    <div className="eq">Insertion attenuation = 20 log₁₀(|Hbare|/|H|); phase = arg(H)</div>
    <p>Positive attenuation means suppression relative to the unfiltered circuit; negative means amplification. This is voltage/current insertion attenuation for the entered impedances, not a matched 50 Ω S21 measurement. The probe target is a comparison at one frequency, not a compliance limit.</p>
    <h2>Reference sizing and damping</h2>
    <div className="eq">f₀ = 1/(2π√LC2); L = 1/[(2πf₀)²C2]; C2 = 1/[(2πf₀)²L]</div>
    <p>These equations size a starting point. Loading, π capacitance, losses, parasitics and damping shift the response, so f₀ is not labelled an exact −3 dB cutoff. Preferred-value pairs bracket L and C2 and are ranked by LC reference error. Their entered parasitics remain fixed; inspect the selected parts’ data afterwards.</p>
    <p>A resistor Rd in series with blocking capacitor Cd, across C2, provides an AC damping path without steady DC resistor loss. The plot compares this network with the same circuit without that branch. A larger Cd lets the branch act resistively closer to resonance; damping trades peak suppression against the wider frequency response.</p>
    <h2>Output impedance and DC loss</h2>
    <div className="eq">Zout = 1 / [Y2 + 1/(Z + Rs/(1 + RsY1))]</div>
    <p>Zout is evaluated with Vs shorted and RL disconnected. For a switching-converter input, compare this filter output impedance with the converter input impedance across the relevant band, as described by TI SNVA538. A positive resistive RL cannot represent negative incremental converter input impedance or establish closed-loop stability.</p>
    <div className="eq">DC drop = I·Rdc; DC loss = I²·Rdc</div>
    <p>These use the separately entered DC current, exclude Rs, and omit core loss, ripple loss and temperature dependence. They do not establish component current, saturation, thermal or voltage ratings.</p>
    <h2>Sweep and limits</h2>
    <p>The sweep uses 401 logarithmic samples plus LC reference points, then refines bracketed gain and output-impedance maxima. Peaking is relative to the analytic DC response and is reported only inside the displayed band. Extremely narrow additional resonances may require a narrower sweep or circuit simulation. ESR/ESL models need non-zero loss when their parasitic resonance is enabled.</p>
    <p>The model excludes common-mode currents, chassis coupling, cables, distributed PCB structures, regulator control loops and a complete LISN/test receiver. It does not predict an EMC test pass. Real layout inductance, component impedance data and measurement remain necessary for final selection.</p>
    <h2>References</h2><ol>
      <li><a href="https://www.ti.com/lit/an/snva538/snva538.pdf" target="_blank" rel="noopener noreferrer">Texas Instruments, SNVA538: Input Filter Design for Switching Power Supplies.</a></li>
      <li><a href="https://www.analog.com/en/resources/app-notes/an-1368.html" target="_blank" rel="noopener noreferrer">Analog Devices, AN-1368: Ferrite Bead Demystified.</a></li>
      <li>IEC 60063, Preferred number series for resistors and capacitors.</li>
    </ol>
  </>;
}
