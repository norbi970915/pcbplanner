import { useId, useState } from 'react';
import { SiField } from '../components/SiField';
import { ToolPage } from '../components/ToolPage';
import { Big, Notes, NumField, Panel, Result, Section, SelectField } from '../components/ui';
import type { ESeries } from '../lib/electronics';
import { rcCorners, rcDesign, rcFilter, rcResponse, rcStandard, type RcCircuit, type RcKind, type RcResult } from '../lib/rcFilter';
import { fmt, si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { kind: 'lowpass', mode: 'analyse', r: 1000, c: 100e-9, target: 1000, rs: 0, rl: 0, f: 1000, rt: 1, ct: 10, rSeries: 'E24', cSeries: 'E12' };
type Mode = 'analyse' | 'r' | 'c';
const series = (s: string): ESeries => s === 'E12' || s === 'E96' ? s : 'E24';
const rangeText = (lo: number, hi: number, unit: string) => `${si(lo, unit, 4)} – ${si(hi, unit, 4)}`;
const dbText = (v: number) => `${fmt(v, 4)} dB`;

export default function RcFilter() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const [resetKey, setResetKey] = useState(0);
  const kind: RcKind = p.kind === 'highpass' ? 'highpass' : 'lowpass';
  const mode: Mode = p.mode === 'r' || p.mode === 'c' ? p.mode : 'analyse';
  const errors: string[] = [];
  const bounded = (v: number, lo: number, hi: number, label: string) => {
    if (!Number.isFinite(v) || v < lo || v > hi) errors.push(label);
  };
  if (mode !== 'r') bounded(p.r, 1e-3, 1e12, 'Filter resistance must be between 1 mΩ and 1 TΩ.');
  if (mode !== 'c') bounded(p.c, 1e-15, 1, 'Capacitance must be between 1 fF and 1 F.');
  bounded(p.rs, 0, 1e12, 'Source resistance must be between 0 and 1 TΩ.');
  bounded(p.rl, 0, 1e12, 'Load resistance must be between 0 and 1 TΩ; 0 means no load.');
  if (p.rl > 0 && p.rl < 1e-3) errors.push('Use at least 1 mΩ for a connected load.');
  bounded(p.f, 1e-6, 1e15, 'Analysis frequency must be between 1 µHz and 1 PHz.');
  if (mode !== 'analyse') bounded(p.target, 1e-6, 1e15, 'Target cutoff must be between 1 µHz and 1 PHz.');
  if (!(p.rt >= 0 && p.rt < 100 && p.ct >= 0 && p.ct < 100)) errors.push('R and C tolerances must be from 0 to less than 100 %.');

  let result: RcResult | null = null;
  let corners: RcResult[] = [];
  let candidates: ReturnType<typeof rcStandard> = [];
  if (!errors.length) {
    try {
      const circuit: RcCircuit = { kind, r: p.r, c: p.c, rs: p.rs, rl: p.rl };
      const calculated = mode === 'analyse' ? rcFilter(circuit) : rcDesign(circuit, p.target, mode);
      if (calculated.r < 1e-3 || calculated.r > 1e12 || calculated.c < 1e-15 || calculated.c > 1) {
        throw new RangeError('The required component is outside the supported range (1 mΩ–1 TΩ, 1 fF–1 F). Change the target or the fixed component.');
      }
      corners = rcCorners(calculated, p.rt, p.ct);
      candidates = rcStandard(calculated, series(p.rSeries), series(p.cSeries)).filter(row => row.r >= 1e-3 && row.r <= 1e12 && row.c >= 1e-15 && row.c <= 1);
      result = calculated;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'Unable to calculate this circuit.');
    }
  }
  const response = result ? rcResponse(result, p.f) : null;
  const responseCorners = result ? corners.map(c => rcResponse(c, p.f)) : [];
  const fcMin = Math.min(...corners.map(c => c.fc)), fcMax = Math.max(...corners.map(c => c.fc));
  const notes: string[] = [];
  if (result && result.passbandDb < -1) notes.push(`Source/load division causes ${fmt(-result.passbandDb, 3)} dB of passband loss. Cutoff is measured 3.0103 dB below that passband, not below unity gain.`);

  const properties = (
    <div key={resetKey}>
      <Section title="Filter">
        <SelectField label="Response" value={kind} onChange={kind => set({ kind })} options={[{ value: 'lowpass', label: 'Low-pass' }, { value: 'highpass', label: 'High-pass' }]} />
        <SelectField label="Calculate" value={mode} onChange={mode => set({ mode })} width={160} options={[
          { value: 'analyse', label: 'Cutoff from R and C' }, { value: 'r', label: 'R for target cutoff' }, { value: 'c', label: 'C for target cutoff' },
        ]} />
        {mode !== 'analyse' && <SiField label="Target cutoff" symbol="fc" value={p.target} onChange={target => set({ target })} unit="Hz" prefixes={['µ', 'm', '', 'k', 'M', 'G']} hint="−3.0103 dB relative to the loaded passband." />}
        {mode !== 'r' && <SiField label="Filter resistor" symbol="R" value={p.r} onChange={r => set({ r })} unit="Ω" prefixes={['m', '', 'k', 'M', 'G']} />}
        {mode !== 'c' && <SiField label="Capacitor" symbol="C" value={p.c} onChange={c => set({ c })} unit="F" prefixes={['p', 'n', 'µ', 'm', '']} />}
      </Section>
      <Section title="Source and Load">
        <SiField label="Source resistance" symbol="Rs" value={p.rs} onChange={rs => set({ rs })} unit="Ω" prefixes={['', 'k', 'M']} allowZero hint="Thevenin resistance of the source. 0 = ideal voltage source." />
        <SiField label="Load resistance" symbol="RL" value={p.rl} onChange={rl => set({ rl })} unit="Ω" prefixes={['', 'k', 'M']} allowZero hint="Resistance from the output to ground. 0 = open circuit, not a short." />
        <p className="text-faint">RL = 0 means no load. Source and load are purely resistive.</p>
      </Section>
      <Section title="Analysis">
        <SiField label="Probe frequency" symbol="f" value={p.f} onChange={f => set({ f })} unit="Hz" prefixes={['µ', 'm', '', 'k', 'M', 'G']} />
        <NumField label="Resistor tolerance" value={p.rt} onChange={rt => set({ rt })} unit="%" allowZero />
        <NumField label="Capacitor tolerance" value={p.ct} onChange={ct => set({ ct })} unit="%" allowZero />
        <p className="text-faint">Tolerances vary R and C independently; Rs and RL stay fixed.</p>
      </Section>
      <Section title="Standard Values">
        <SelectField label="Resistor series" value={series(p.rSeries)} onChange={rSeries => set({ rSeries })} options={['E12', 'E24', 'E96'].map(value => ({ value, label: value }))} />
        <SelectField label="Capacitor series" value={series(p.cSeries)} onChange={cSeries => set({ cSeries })} options={['E12', 'E24', 'E96'].map(value => ({ value, label: value }))} />
        <p className="text-faint">Preferred values do not specify part tolerance or availability.</p>
      </Section>
    </div>
  );

  return (
    <ToolPage
      title="RC Low-Pass & High-Pass Filter Calculator"
      description="Design and analyse passive RC low-pass and high-pass filters with source and load resistance, standard component values, tolerance bounds and interactive gain and phase plots."
      properties={properties}
      onReset={() => { reset(); setResetKey(k => k + 1); }}
      status={result ? `${kind === 'lowpass' ? 'Low-pass' : 'High-pass'} · fc ${si(result.fc, 'Hz')} · ${response ? dbText(response.db) : ''} at ${si(p.f, 'Hz')}` : 'Check the inputs'}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      <Notes items={notes} />
      {result && response && (
        <>
          <div className="grid gap-3 xl:grid-cols-2">
            <Panel title="Filter Result">
              <div className="flex flex-wrap gap-8 px-3 py-3">
                <Big label="Loaded cutoff" value={si(result.fc, 'Hz', 4).split(' ')[0]} unit={si(result.fc, 'Hz').split(' ').slice(1).join(' ')} />
                <Big label="Passband gain" value={fmt(result.gain, 4)} unit="V/V" />
              </div>
              <table className="tbl"><tbody>
                <Result label="Filter resistor R" value={si(result.r, 'Ω', 5)} strong />
                <Result label="Capacitor C" value={si(result.c, 'F', 5)} strong />
                <Result label="Passband gain" value={dbText(result.passbandDb)} sub={kind === 'lowpass' ? 'DC limit' : 'high-frequency limit of this ideal model'} />
                <Result label="Gain at cutoff" value={dbText(result.passbandDb - 10 * Math.log10(2))} sub="−3.0103 dB relative to the passband" />
                <Result label="Cutoff with R/C tolerance" value={rangeText(fcMin, fcMax, 'Hz')} />
                <Result label="Time constant τ" value={si(result.tau, 's')} sub={`Resistance seen by C: ${si(result.req, 'Ω')}`} />
                <Result label={kind === 'lowpass' ? 'Step rise time (10–90 %)' : 'Step decay to 1 %'} value={si(kind === 'lowpass' ? result.rise1090 : result.settling1, 's')} />
                {kind === 'lowpass' && <Result label="Step settling to 1 %" value={si(result.settling1, 's')} sub="Relative to the final output, for an ideal voltage step." />}
              </tbody></table>
            </Panel>
            <Panel title="Circuit">
              <Circuit result={result} />
              <p className="px-3 py-2 text-muted">Vin is the ideal source voltage before Rs. Vout is measured to ground. {kind === 'lowpass' ? 'R and Rs feed the capacitor and load in parallel.' : 'The capacitor feeds R and RL in parallel.'}</p>
              <table className="tbl"><tbody>
                <Result label={`Gain at ${si(p.f, 'Hz')}`} value={dbText(response.db)} strong sub={`${fmt(response.magnitude, 5)} V/V`} />
                <Result label="Attenuation from Vin" value={dbText(-response.db)} />
                <Result label="Phase" value={`${fmt(response.phase, 4)}°`} />
                <Result label="Gain with R/C tolerance" value={`${fmt(Math.min(...responseCorners.map(x => x.db)), 4)} to ${fmt(Math.max(...responseCorners.map(x => x.db)), 4)} dB`} />
                <Result label="Phase with R/C tolerance" value={`${fmt(Math.min(...responseCorners.map(x => x.phase)), 4)}° to ${fmt(Math.max(...responseCorners.map(x => x.phase)), 4)}°`} />
              </tbody></table>
            </Panel>
          </div>
          <Panel title="Frequency Response">
            <div className="grid gap-3 xl:grid-cols-2">
              <ResponsePlot result={result} corners={corners} f={p.f} onFrequency={f => set({ f })} phase={false} />
              <ResponsePlot result={result} corners={corners} f={p.f} onFrequency={f => set({ f })} phase />
            </div>
            <p className="px-3 pb-2 text-faint">Solid: nominal. Shaded: R/C tolerance envelope. Dashed: nominal cutoff. Click a plot to move the probe; arrow keys adjust it when the plot is focused.</p>
          </Panel>
          <Panel title="Nearby Standard Values">
            <table className="tbl">
              <thead><tr><th>R ({series(p.rSeries)})</th><th>C ({series(p.cSeries)})</th><th className="v">Cutoff</th><th className="v">Error</th><th className="v">Passband</th><th /></tr></thead>
              <tbody>{candidates.map(row => (
                <tr key={`${row.r}/${row.c}`}>
                  <td className="v">{si(row.r, 'Ω', 5)}</td><td className="v">{si(row.c, 'F', 5)}</td>
                  <td className="v">{si(row.fc, 'Hz', 5)}</td><td className="v">{fmt(row.errorPct, 4)} %</td><td className="v">{dbText(row.passbandDb)}</td>
                  <td><button type="button" className="btn" onClick={() => set({ r: row.r, c: row.c, mode: 'analyse' })} aria-label={`Use ${si(row.r, 'Ω')} and ${si(row.c, 'F')}`}>Use</button></td>
                </tr>
              ))}</tbody>
            </table>
            <p className="px-3 py-2 text-faint">Values immediately above and below each calculated component, ranked by cutoff ratio error. Error is relative to {si(result.fc, 'Hz', 5)}. Use applies both parts and recalculates loading and tolerances.</p>
          </Panel>
        </>
      )}
    </ToolPage>
  );
}

function Circuit({ result: r }: { result: RcResult }) {
  const low = r.kind === 'lowpass';
  return (
    <svg viewBox="0 0 520 185" className="w-full" role="img" aria-label={low ? 'Low-pass: source resistance and filter resistor in series; capacitor and load shunt to ground.' : 'High-pass: source resistance and capacitor in series; filter resistor and load shunt to ground.'}>
      <g fill="none" stroke="var(--ink)" strokeWidth={1.5}>
        <circle cx={38} cy={80} r={18} /><path d="M38 62V48H80 M38 98V156H470 M80 48H90 M134 48H194 M238 48H470" />
        <rect x={90} y={39} width={44} height={18} />
        {low ? <rect x={194} y={39} width={44} height={18} /> : <path d="M194 48H209 M209 34V62 M222 34V62 M222 48H238" />}
        <path d="M325 48V83 M325 119V156" />
        {low ? <path d="M310 93H340 M310 105H340 M325 83V93 M325 105V119" /> : <rect x={316} y={83} width={18} height={36} />}
        {r.rl > 0 && <><path d="M435 48V83 M435 119V156" /><rect x={426} y={83} width={18} height={36} /></>}
        <path d="M245 156V165 M232 165H258 M237 170H253 M242 175H248" />
        <path d="M33 75H43 M38 70V80 M33 88H43" />
      </g>
      <g fill="var(--accent)"><circle cx={325} cy={48} r={3} /><circle cx={470} cy={48} r={3} /></g>
      <g fill="var(--muted)" fontSize={12} textAnchor="middle">
        <text x={38} y={25}>Vin</text><text x={112} y={25}>Rs {si(r.rs, 'Ω', 3)}</text>
        <text x={216} y={25}>{low ? `R ${si(r.r, 'Ω', 3)}` : `C ${si(r.c, 'F', 3)}`}</text>
        <text x={310} y={137}>{low ? `C ${si(r.c, 'F', 3)}` : `R ${si(r.r, 'Ω', 3)}`}</text>
        <text x={435} y={137}>{r.rl > 0 ? `RL ${si(r.rl, 'Ω', 3)}` : 'RL open'}</text>
        <text x={470} y={25} fill="var(--accent)">Vout</text>
      </g>
    </svg>
  );
}

function ResponsePlot({ result, corners, f, onFrequency, phase }: { result: RcResult; corners: RcResult[]; f: number; onFrequency: (f: number) => void; phase: boolean }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const W = 600, H = 250, left = 58, right = 18, top = 25, bottom = 38;
  const lo = Math.min(result.fc / 100, f / 10), hi = Math.max(result.fc * 100, f * 10);
  const a = Math.log10(lo), b = Math.log10(hi);
  const frequencies = Array.from({ length: 181 }, (_, i) => 10 ** (a + (b - a) * i / 180));
  const value = (r: RcResult, frequency: number) => { const x = rcResponse(r, frequency); return phase ? x.phase : x.db; };
  const samples = frequencies.map(frequency => ({ f: frequency, nominal: value(result, frequency), low: Math.min(...corners.map(r => value(r, frequency))), high: Math.max(...corners.map(r => value(r, frequency))) }));
  const ymin = phase ? (result.kind === 'lowpass' ? -90 : 0) : Math.floor(Math.min(...samples.map(x => x.low)) / 10) * 10 - 10;
  const ymax = phase ? (result.kind === 'lowpass' ? 0 : 90) : 0;
  const X = (frequency: number) => left + (Math.log10(frequency) - a) / (b - a) * (W - left - right);
  const Y = (v: number) => top + (ymax - v) / (ymax - ymin) * (H - top - bottom);
  const path = (rows: { f: number; v: number }[]) => rows.map((r, i) => `${i ? 'L' : 'M'}${X(r.f).toFixed(2)},${Y(r.v).toFixed(2)}`).join(' ');
  const envelope = path(samples.map(r => ({ f: r.f, v: r.low }))) + ' ' + path([...samples].reverse().map(r => ({ f: r.f, v: r.high }))).replace(/^M/, 'L') + ' Z';
  const inspect = hover !== null && hover >= lo && hover <= hi ? hover : f;
  const inspected = rcResponse(result, inspect);
  const xstep = Math.max(1, Math.ceil((b - a) / 5));
  const xticks: number[] = [];
  for (let d = Math.ceil(a / xstep) * xstep; d <= b; d += xstep) xticks.push(10 ** d);
  const yticks = Array.from({ length: 5 }, (_, i) => ymin + (ymax - ymin) * i / 4);
  const pointerFrequency = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width * W;
    return 10 ** (a + Math.max(0, Math.min(1, (x - left) / (W - left - right))) * (b - a));
  };
  const apply = (frequency: number) => onFrequency(Math.max(1e-6, Math.min(1e15, frequency)));
  return (
    <div className="min-w-0 px-2 pt-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="slider" tabIndex={0}
        aria-label={phase ? 'Phase plot frequency probe' : 'Gain plot frequency probe'} aria-valuemin={Math.max(lo, 1e-6)} aria-valuemax={Math.min(hi, 1e15)} aria-valuenow={f} aria-valuetext={si(f, 'Hz')}
        onPointerMove={e => setHover(pointerFrequency(e))} onPointerLeave={() => setHover(null)} onPointerDown={e => { setHover(null); apply(pointerFrequency(e)); }}
        onKeyDown={e => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
            e.preventDefault(); setHover(null);
            apply(e.key === 'Home' ? lo : e.key === 'End' ? hi : f * 10 ** ((e.key === 'ArrowRight' ? 1 : -1) / 20));
          }
        }}
      >
        <title>{phase ? 'Phase in degrees' : 'Voltage gain in dB'} versus frequency, with component tolerance bounds</title>
        <defs><clipPath id={id}><rect x={left} y={top} width={W - left - right} height={H - top - bottom} /></clipPath></defs>
        <text x={left} y={14} fontSize={12} fill="var(--ink)">{phase ? 'Phase (°)' : 'Gain (dB)'}</text>
        {xticks.map(x => <g key={x}><line x1={X(x)} x2={X(x)} y1={top} y2={H - bottom} stroke="var(--line)" /><text x={X(x)} y={H - bottom + 16} textAnchor="middle" fontSize={11} fill="var(--muted)">{si(x, 'Hz', 2)}</text></g>)}
        {yticks.map(y => <g key={y}><line x1={left} x2={W - right} y1={Y(y)} y2={Y(y)} stroke="var(--line)" /><text x={left - 6} y={Y(y) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{fmt(y, 3)}</text></g>)}
        <g clipPath={`url(#${id})`}>
          <path d={envelope} fill="var(--accent)" fillOpacity={0.16} />
          <line x1={X(result.fc)} x2={X(result.fc)} y1={top} y2={H - bottom} stroke="var(--muted)" strokeDasharray="5 4" />
          <path d={path(samples.map(r => ({ f: r.f, v: r.nominal })))} fill="none" stroke={phase ? 'var(--copper)' : 'var(--accent)'} strokeWidth={2} />
          <line x1={X(inspect)} x2={X(inspect)} y1={top} y2={H - bottom} stroke="var(--ink)" strokeDasharray="2 3" />
          <circle cx={X(inspect)} cy={Y(phase ? inspected.phase : inspected.db)} r={4} fill={phase ? 'var(--copper)' : 'var(--accent)'} />
        </g>
        <rect x={left} y={top} width={W - left - right} height={H - top - bottom} fill="none" stroke="var(--line)" />
        <text x={(left + W - right) / 2} y={H - 3} textAnchor="middle" fontSize={11} fill="var(--muted)">Frequency</text>
      </svg>
      <p className="px-2 pb-2 text-muted">{si(inspect, 'Hz', 4)} · {dbText(inspected.db)} · {fmt(inspected.phase, 4)}°</p>
    </div>
  );
}

export function Method() {
  return (
    <>
      <h2>Topology and reference voltage</h2>
      <p>Vin is the ideal Thevenin source before its resistance Rs. The load RL is connected from Vout to ground; entering 0 removes it. All gains are Vout/Vin. A disconnected load is represented by RL → ∞ in the equations below.</p>
      <h2>Loaded low-pass</h2>
      <p>The source resistance Rs and filter resistor R are in series. The capacitor C and load RL are in parallel at the output. Let A = Rs + R.</p>
      <div className="eq"><span className="no">(1)</span>K = RL / (A + RL), τ = (A ∥ RL) C, H(s) = K / (1 + sτ)</div>
      <h2>Loaded high-pass</h2>
      <p>The source resistance Rs and capacitor C are in series. The filter resistor R and load RL both connect the output to ground. Let B = R ∥ RL.</p>
      <div className="eq"><span className="no">(2)</span>K = B / (Rs + B), τ = (Rs + B) C, H(s) = K sτ / (1 + sτ)</div>
      <p>Parallel resistance X ∥ Y = 1 / (1/X + 1/Y). Without a load, the low-pass uses τ = (Rs + R) C and K = 1; the high-pass uses τ = (Rs + R) C and K = R / (Rs + R).</p>
      <h2>Cutoff, gain and phase</h2>
      <div className="eq"><span className="no">(3)</span>fc = 1 / (2πτ), x = f/fc; low-pass |H| = K/√(1 + x²), high-pass |H| = Kx/√(1 + x²)</div>
      <p>Phase is −atan(x) for low-pass and atan(1/x) for high-pass. Gain in dB is 20 log₁₀|H|. At fc, gain is K/√2, or 3.0103 dB below the passband; it need not be −3 dB relative to Vin. Stopband slope approaches 20 dB per decade in magnitude.</p>
      <h2>Designing R or C</h2>
      <p>For a target fc, let Q = 1/(2πfc C). Low-pass requires R = Q RL/(RL − Q) − Rs. High-pass requires R = (Q − Rs) RL/[RL − (Q − Rs)]. With no load these both reduce to R = Q − Rs. The target must give a finite, positive R; impossible loading conditions are reported rather than rounded to zero. To solve for C, divide 1/(2πfc) by the resistance seen by the capacitor.</p>
      <h2>Tolerance and time response</h2>
      <p>Four combinations of R(1 ± tR) and C(1 ± tC) give the displayed bounds and plot envelope. Rs and RL stay fixed. These are worst-case component limits, not a statistical confidence interval. Standard-value candidates bracket both calculated parts and are ranked by |ln(fc,actual/fc,target)|; component tolerances are entered separately.</p>
      <p>For a unit voltage step and an initially uncharged capacitor, low-pass output is K(1 − e^(−t/τ)); high-pass output is K e^(−t/τ). Low-pass 10–90 % rise time is ln(9)τ. Settling within 1 % of the final low-pass value, or high-pass decay to 1 % of its initial amplitude, takes ln(100)τ.</p>
      <h2>Limits</h2>
      <p>This is a single passive stage with an ideal capacitor and purely resistive source/load. Capacitor ESR, ESL, leakage, voltage dependence, amplifier bandwidth and PCB parasitics are excluded. Cascaded unbuffered stages load each other and require a full network calculation; multiplying the isolated stage responses does not include that interaction. ADC sampling inputs are not generally a fixed resistive load.</p>
      <h2>References</h2>
      <ol>
        <li><a href="https://www.ti.com/content/dam/videos/external-videos/en-us/4/3816841626001/6119035031001.mp4/subassets/passive_components_and_circuits_2.pdf" target="_blank" rel="noopener noreferrer">Texas Instruments Precision Labs, Passive components and circuits: RC filters and time constants.</a></li>
        <li><a href="https://www.analog.com/en/resources/technical-articles/a-beginners-guide-to-filter-topologies.html" target="_blank" rel="noopener noreferrer">Analog Devices, A Beginner's Guide to Filter Topologies: passive first-order filters and their limits.</a></li>
        <li><a href="https://wiki.analog.com/university/labs/cascaded_rc_adalm2000" target="_blank" rel="noopener noreferrer">Analog Devices, Cascaded RC low-pass filters: loading between passive stages.</a></li>
        <li>IEC 60063, Preferred number series for resistors and capacitors.</li>
      </ol>
    </>
  );
}
