import { useId, useMemo, useState, type ReactNode } from 'react';
import { SiField } from '../components/SiField';
import { ToolPage } from '../components/ToolPage';
import { Big, Notes, NumField, Panel, Result, Section, Segmented, SelectField } from '../components/ui';
import {
  cascadeAt,
  chebyshevCornerRatio,
  designFilter,
  MAX_ORDER,
  requiredSlewRate,
  RESPONSE_LABEL,
  RIPPLE_DB,
  sectionPeak,
  type CapSeries,
  type FilterDesign,
  type FilterKind,
  type FilterResponse,
  type FilterTopology,
  type Parts,
  type SectionCircuit,
  type SectionDesign,
} from '../lib/activeFilter';
import type { ESeries } from '../lib/electronics';
import { fmt, si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = {
  kind: 'lowpass', resp: 'butterworth', order: 4, fc: 1000, topo: 'sallen-key', gain: 1,
  cap: 'auto', rl: 10e3, c: 10e-9, rser: 'E96', cser: 'E12', gbw: 1e6, sr: 0.5, vpp: 2,
};

const RESPONSES = Object.keys(RESPONSE_LABEL) as FilterResponse[];
const asResp = (s: string): FilterResponse => (RESPONSES.includes(s as FilterResponse) ? (s as FilterResponse) : 'butterworth');
const asR = (s: string): ESeries => (s === 'E12' || s === 'E24' ? s : 'E96');
const asC = (s: string): CapSeries => (s === 'E6' || s === 'E24' ? s : 'E12');
const pct = (e: number) => `${e >= 0 ? '+' : ''}${fmt(e * 100, 3)} %`;
const DB3 = 10 * Math.log10(2);
const CIRCUIT_LABEL: Record<SectionCircuit, string> = {
  lp1: '1st-order low-pass',
  hp1: '1st-order high-pass',
  'lp-sk': 'Sallen-Key low-pass',
  'lp-mfb': 'MFB low-pass',
  'hp-sk': 'Sallen-Key high-pass',
  'hp-mfb': 'MFB high-pass',
};

export default function ActiveFilter() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const kind: FilterKind = p.kind === 'highpass' ? 'highpass' : 'lowpass';
  const resp = asResp(p.resp);
  const topo: FilterTopology = p.topo === 'mfb' ? 'mfb' : 'sallen-key';
  const capMode = p.cap === 'fixed' ? 'fixed' : 'auto';
  const rSeries = asR(p.rser);
  const cSeries = asC(p.cser);
  const order = Math.round(p.order);

  const errors: string[] = [];
  if (!(Number.isInteger(p.order) && p.order >= 1 && p.order <= MAX_ORDER)) errors.push(`Order must be a whole number from 1 to ${MAX_ORDER}.`);
  if (!(p.fc >= 1e-3 && p.fc <= 1e9)) errors.push('Corner frequency must be between 1 mHz and 1 GHz.');
  if (topo === 'mfb' && !(p.gain >= 0.1 && p.gain <= 100)) errors.push('MFB section gain must be between 0.1 and 100.');
  if (capMode === 'auto' && !(p.rl >= 1 && p.rl <= 100e6)) errors.push('Resistance level must be between 1 Ω and 100 MΩ.');
  if (capMode === 'fixed' && !(p.c >= 1e-15 && p.c <= 1)) errors.push('Capacitor must be between 1 fF and 1 F.');
  if (!(p.gbw > 0 && p.sr > 0 && p.vpp > 0)) errors.push('GBW, slew rate and output swing must be greater than 0.');

  const inputs = errors.length === 0 ? { kind, response: resp, order, fc: p.fc, topology: topo, mfbGain: p.gain, capMode, rLevel: p.rl, cFixed: p.c, rSeries, cSeries } as const : null;
  const key = inputs ? JSON.stringify(inputs) : '';
  const design = useMemo((): FilterDesign | string | null => {
    if (!inputs) return null;
    try {
      return designFilter(inputs);
    } catch (e) {
      return e instanceof Error ? e.message : 'Unable to design this filter.';
    }
    // inputs is fully described by key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const d = typeof design === 'object' ? design : null;
  if (typeof design === 'string') errors.push(design);

  const notes: string[] = [];
  if (d) {
    const ripple = RIPPLE_DB[resp];
    if (topo === 'sallen-key' && d.sections.some((s) => s.q >= 3)) notes.push('A section has Q ≥ 3. TI applies the unity-gain Sallen-Key to low-Q sections (Q < 3) and the MFB topology to high-Q sections.');
    const slow = d.sections.filter((s) => s.gbw !== null && s.gbw > p.gbw);
    if (slow.length) notes.push(`Section${slow.length > 1 ? 's' : ''} ${slow.map((s) => s.index + 1).join(', ')} need${slow.length > 1 ? '' : 's'} more than the entered GBW of ${si(p.gbw, 'Hz', 3)} (TI rule, below).`);
    if (kind === 'lowpass' && requiredSlewRate(p.vpp, p.fc) > p.sr * 1e6) notes.push(`A ${fmt(p.vpp, 3)} Vpp output at fc needs ${fmt(requiredSlewRate(p.vpp, p.fc) / 1e6, 3)} V/µs; the entered slew rate is ${fmt(p.sr, 3)} V/µs.`);
    const rs = d.sections.flatMap((s) => Object.entries(s.std).filter(([n, v]) => n.startsWith('R') && (v < 1e3 || v > 100e3)));
    if (rs.length) notes.push('Some resistors are outside the 1 kΩ to 100 kΩ range TI recommends (op amp output current below, resistor noise above). Change the resistance level or the capacitors.');
    const cs = d.sections.flatMap((s) => Object.entries(s.std).filter(([n, v]) => n.startsWith('C') && v < 1e-9));
    if (cs.length) notes.push('Some capacitors are below 1 nF, where op amp input and PCB capacitance start to shift the response (TI: Sallen-Key input capacitance matters above C1/400).');
    if (kind === 'highpass') notes.push("TI's bandwidth rules are written for low-pass sections. A high-pass passband ends where the op amp's own closed-loop gain falls, about GBW / noise gain; choose GBW well above the highest signal frequency.");
    if (Math.abs(d.gainReal / d.gainIdeal - 1) > 0.01) notes.push(`The passband gain with standard values is ${fmt(d.gainReal, 4)} V/V against ${fmt(d.gainIdeal, 4)} V/V ideal: the gain-setting ${kind === 'highpass' ? 'capacitors (C1/C2)' : 'resistors (R2/R1)'} are rounded independently.`);
    if (ripple > 0 && order > 1 && order % 2 === 0) notes.push(`Even-order Chebyshev: the passband peaks are ${fmt(ripple, 2)} dB above the DC gain, so the output can exceed the input by that much.`);
  }

  const plot = useMemo(() => {
    if (!d) return null;
    const lo = Math.log10(p.fc / 30);
    const hi = Math.log10(p.fc * 30);
    const fs = Array.from({ length: 301 }, (_, i) => 10 ** (lo + ((hi - lo) * i) / 300));
    return { fs, ideal: fs.map((f) => cascadeAt(d.ideal, f)), real: fs.map((f) => cascadeAt(d.real, f)) };
  }, [d, p.fc]);

  const properties = (
    <>
      <Section title="Filter">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <span className="text-muted">Type</span>
          <Segmented label="Filter type" value={kind} onChange={(v) => set({ kind: v })} options={[{ value: 'lowpass', label: 'Low-pass' }, { value: 'highpass', label: 'High-pass' }]} />
        </div>
        <SelectField label="Response" value={resp} onChange={(v) => set({ resp: v })} options={RESPONSES.map((value) => ({ value, label: RESPONSE_LABEL[value] }))} width={150} />
        <SelectField label="Order" value={String(order)} onChange={(v) => set({ order: Number(v) })} options={Array.from({ length: MAX_ORDER }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} width={150} />
        <SiField label="Corner frequency" symbol="fc" value={p.fc} onChange={(v) => set({ fc: v })} unit="Hz" prefixes={['m', '', 'k', 'M']} hint="Gain 3.01 dB below the passband gain, for every response type (TI normalisation)." />
        <SelectField label="Topology" value={topo} onChange={(v) => set({ topo: v })} options={[{ value: 'sallen-key', label: 'Sallen-Key, unity gain' }, { value: 'mfb', label: 'Multiple feedback' }]} width={150} />
        {topo === 'mfb' && <NumField label="Gain per MFB section" symbol="|A|" value={p.gain} onChange={(v) => set({ gain: v })} unit="V/V" hint="Passband gain magnitude of each second-order MFB section (inverting). First-order sections are unity-gain buffers." />}
      </Section>
      <Section title="Components">
        <SelectField label="Capacitors" value={capMode} onChange={(v) => set({ cap: v })} options={[{ value: 'auto', label: 'From resistance level' }, { value: 'fixed', label: 'Fixed C1' }]} width={150} />
        {capMode === 'auto' ? (
          <SiField label="Resistance level" symbol="R0" value={p.rl} onChange={(v) => set({ rl: v })} unit="Ω" prefixes={['', 'k', 'M']} hint="Capacitors are chosen so that the resistors setting each section's natural frequency come out near R0." />
        ) : (
          <SiField label="Capacitor C1" symbol="C1" value={p.c} onChange={(v) => set({ c: v })} unit="F" prefixes={['p', 'n', 'µ']} hint="Used as C1 in every section (C1 = C3 = C in the high-pass circuits)." />
        )}
        <SelectField label="Resistor series" value={rSeries} onChange={(v) => set({ rser: v })} options={['E12', 'E24', 'E96'].map((value) => ({ value, label: value }))} />
        <SelectField label="Capacitor series" value={cSeries} onChange={(v) => set({ cser: v })} options={['E6', 'E12', 'E24'].map((value) => ({ value, label: value }))} />
        <p className="text-faint">C2 is the next standard value at or above the minimum ratio; resistors are then calculated and rounded to the nearest series value.</p>
      </Section>
      <Section title="Op amp">
        <SiField label="Gain-bandwidth product" symbol="GBW" value={p.gbw} onChange={(v) => set({ gbw: v })} unit="Hz" prefixes={['k', 'M', 'G']} />
        <NumField label="Slew rate" symbol="SR" value={p.sr} onChange={(v) => set({ sr: v })} unit="V/µs" />
        <NumField label="Output swing" value={p.vpp} onChange={(v) => set({ vpp: v })} unit="Vpp" />
        <p className="text-faint">From the op amp datasheet. The response plots assume an ideal op amp.</p>
      </Section>
    </>
  );

  const status = d ? `${kind === 'lowpass' ? 'Low-pass' : 'High-pass'} ${RESPONSE_LABEL[resp]}, order ${order}: fc ${si(d.fcReal, 'Hz', 4)} with standard values (target ${si(p.fc, 'Hz', 4)})` : 'Check the inputs';
  const worstGbw = d ? Math.max(0, ...d.sections.map((s) => s.gbw ?? 0)) : 0;

  return (
    <ToolPage
      title="Active Filter Designer"
      description="Sallen-Key and multiple-feedback low-pass and high-pass filters up to 8th order with Butterworth, Bessel and Chebyshev responses: section coefficients, standard component values, the resulting response and op amp requirements, from the TI active filter design equations."
      onReset={reset}
      properties={properties}
      status={status}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      <Notes items={notes} />
      {d && plot && (
        <>
          <div className="grid gap-3 xl:grid-cols-2">
            <Panel title="Filter result">
              <div className="flex flex-wrap gap-8 px-3 py-3">
                <Big label="Corner with standard values" value={si(d.fcReal, 'Hz', 4).split(' ')[0]} unit={si(d.fcReal, 'Hz', 4).split(' ').slice(1).join(' ')} />
                <Big label="Passband gain" value={fmt(d.gainReal, 4)} unit={`V/V (${fmt(20 * Math.log10(d.gainReal), 3)} dB)`} />
                <Big label="Sections" value={String(d.sections.length)} unit={`op amp${d.sections.length > 1 ? 's' : ''}`} />
              </div>
              <table className="tbl">
                <tbody>
                  <Result label="Corner error" value={pct(d.fcReal / p.fc - 1)} sub="−3.01 dB point relative to the passband gain" strong />
                  {RIPPLE_DB[resp] > 0 && order > 1 && <Result label="Ripple band edge" value={si(kind === 'lowpass' ? p.fc / chebyshevCornerRatio(order, RIPPLE_DB[resp]) : p.fc * chebyshevCornerRatio(order, RIPPLE_DB[resp]), 'Hz', 4)} sub={`passband ripple ${fmt(RIPPLE_DB[resp], 2)} dB ends here (ideal)`} />}
                  <Result label="Ideal passband gain" value={`${fmt(d.gainIdeal, 5)} V/V`} sub={d.sections.some((s) => s.real.gain < 0) ? `${d.sections.filter((s) => s.real.gain < 0).length} inverting section(s)` : 'non-inverting'} />
                  {kind === 'lowpass' && <Result label="Op amp GBW needed (worst section)" value={si(worstGbw, 'Hz', 3)} sub={`TI rule; entered ${si(p.gbw, 'Hz', 3)}`} strong />}
                  {kind === 'lowpass' && <Result label="Slew rate needed" value={`${fmt(requiredSlewRate(p.vpp, p.fc) / 1e6, 3)} V/µs`} sub={`π · ${fmt(p.vpp, 3)} Vpp · fc`} />}
                </tbody>
              </table>
            </Panel>
            <Panel title="Gain">
              <ResponsePlot fs={plot.fs} ideal={plot.ideal.map((x) => 20 * Math.log10(x.mag))} real={plot.real.map((x) => 20 * Math.log10(x.mag))} fc={p.fc} unit="dB" floorAt={20 * Math.log10(d.gainIdeal) - 100} refLine={20 * Math.log10(d.gainIdeal) - DB3} />
            </Panel>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            <Panel title="Phase">
              <ResponsePlot fs={plot.fs} ideal={plot.ideal.map((x) => (x.phase * 180) / Math.PI)} real={plot.real.map((x) => (x.phase * 180) / Math.PI)} fc={p.fc} unit="°" />
            </Panel>
            <Panel title="Group delay">
              <ResponsePlot fs={plot.fs} ideal={plot.ideal.map((x) => x.delay)} real={plot.real.map((x) => x.delay)} fc={p.fc} unit="s" />
            </Panel>
          </div>
          <p className="text-faint">Dashed: ideal design. Solid: with the standard values listed below. Ideal op amps. Vertical line: target fc; horizontal line on the gain plot: −3.01 dB.</p>
          <Panel title="Sections (lowest Q first)">
            <table className="tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Circuit</th>
                  <th className="v">a</th>
                  <th className="v">b</th>
                  <th className="v">Q</th>
                  <th className="v">{kind === 'lowpass' ? 'f0' : 'f0'} target</th>
                  <th className="v">f0 actual</th>
                  <th className="v">Q actual</th>
                  <th className="v">Peak</th>
                  {kind === 'lowpass' && <th className="v">GBW needed</th>}
                </tr>
              </thead>
              <tbody>
                {d.sections.map((s) => (
                  <tr key={s.index}>
                    <td>{s.index + 1}</td>
                    <td>{CIRCUIT_LABEL[s.circuit]}</td>
                    <td className="v">{fmt(s.coef.a, 5)}</td>
                    <td className="v">{fmt(s.coef.b, 5)}</td>
                    <td className="v">{s.q ? fmt(s.q, 4) : '—'}</td>
                    <td className="v">{si(s.f0, 'Hz', 4)}</td>
                    <td className="v">{si(s.f0Real, 'Hz', 4)} ({pct(s.f0Real / s.f0 - 1)})</td>
                    <td className="v">{s.q ? `${fmt(s.qReal, 4)} (${pct(s.qReal / s.q - 1)})` : '—'}</td>
                    <td className="v">{s.q > Math.SQRT1_2 ? `${fmt(20 * Math.log10(sectionPeak(s.q) * s.gainMag), 3)} dB` : `${fmt(20 * Math.log10(s.gainMag), 3)} dB`}</td>
                    {kind === 'lowpass' && <td className={`v ${s.gbw !== null && s.gbw > p.gbw ? 'text-[var(--err-line)]' : ''}`}>{s.gbw !== null ? si(s.gbw, 'Hz', 3) : '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-2 text-faint">
              a, b: section coefficients normalised to fc. f0 is the natural frequency of a second-order section ({kind === 'lowpass' ? 'fc/√b' : 'fc·√b'}) or the corner of a first-order section ({kind === 'lowpass' ? 'fc/a' : 'fc·a'}). Peak: highest gain of the section
              on its own, which sets the signal level inside the filter.
            </p>
          </Panel>
          <Panel title="Components">
            <div className="grid gap-x-3 sm:grid-cols-2 2xl:grid-cols-4">
              {d.sections.map((s) => (
                <StageCard key={s.index} s={s} />
              ))}
            </div>
            <p className="px-3 py-2 text-faint">
              Signal flows from section 1 to the last. Values are the standard values used for the solid curves; the calculated resistor before rounding is shown below each part. C2/C1 must be at least the minimum ratio for
              real resistor values.
            </p>
          </Panel>
        </>
      )}
    </ToolPage>
  );
}

/* ------------------------------------------------------------------ plots */

function ResponsePlot({ fs, ideal, real, fc, unit, floorAt, refLine }: { fs: number[]; ideal: number[]; real: number[]; fc: number; unit: 'dB' | '°' | 's'; floorAt?: number; refLine?: number }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const W = 600, H = 240, left = 62, right = 14, top = 16, bottom = 34;
  const lo = Math.log10(fs[0]);
  const hi = Math.log10(fs[fs.length - 1]);
  const all = [...ideal, ...real].filter((v) => Number.isFinite(v) && (floorAt === undefined || v >= floorAt));
  let ymin = Math.min(...all);
  let ymax = Math.max(...all);
  const step = unit === 'dB' ? 20 : unit === '°' ? 90 : 0;
  if (step) {
    ymin = Math.floor(ymin / step) * step;
    ymax = Math.ceil(ymax / step) * step;
    if (unit === 'dB') ymax = Math.max(ymax, ymin + step);
  } else {
    ymin = 0;
    ymax = ymax > 0 ? ymax * 1.1 : 1;
  }
  if (ymax === ymin) ymax = ymin + 1;
  const X = (f: number) => left + ((Math.log10(f) - lo) / (hi - lo)) * (W - left - right);
  const Y = (v: number) => top + ((ymax - Math.max(ymin, Math.min(ymax, v))) / (ymax - ymin)) * (H - top - bottom);
  const path = (v: number[]) => v.map((y, i) => `${i ? 'L' : 'M'}${X(fs[i]).toFixed(1)},${Y(y).toFixed(1)}`).join(' ');
  const fmtY = (v: number) => (unit === 's' ? si(v, 's', 3) : `${fmt(v, 4)}${unit === 'dB' ? ' dB' : '°'}`);
  const yt = step ? Array.from({ length: Math.round((ymax - ymin) / step) + 1 }, (_, i) => ymin + i * step) : Array.from({ length: 5 }, (_, i) => (ymax * i) / 4);
  const xt: number[] = [];
  for (let e = Math.ceil(lo); e <= hi; e++) xt.push(10 ** e);
  const hi_ = hover === null ? null : Math.max(0, Math.min(fs.length - 1, Math.round(((Math.log10(hover) - lo) / (hi - lo)) * (fs.length - 1))));
  const labelTicks = yt.length > 9 ? yt.filter((_, i) => i % 2 === 0) : yt;
  return (
    <div className="min-w-0 px-2 pt-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${unit === 'dB' ? 'Gain' : unit === '°' ? 'Phase' : 'Group delay'} versus frequency, ideal and with standard values`}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * W;
          setHover(10 ** (lo + Math.max(0, Math.min(1, (x - left) / (W - left - right))) * (hi - lo)));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id={id}>
            <rect x={left} y={top} width={W - left - right} height={H - top - bottom} />
          </clipPath>
        </defs>
        {xt.map((f) => (
          <g key={f}>
            <line x1={X(f)} x2={X(f)} y1={top} y2={H - bottom} stroke="var(--line)" />
            <text x={X(f)} y={H - bottom + 15} textAnchor="middle" fontSize={11} fill="var(--muted)">{si(f, 'Hz', 2)}</text>
          </g>
        ))}
        {yt.map((v) => (
          <line key={v} x1={left} x2={W - right} y1={Y(v)} y2={Y(v)} stroke="var(--line)" />
        ))}
        {labelTicks.map((v) => (
          <text key={v} x={left - 5} y={Y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{unit === 's' ? si(v, 's', 2) : fmt(v, 4)}</text>
        ))}
        <g clipPath={`url(#${id})`}>
          <line x1={X(fc)} x2={X(fc)} y1={top} y2={H - bottom} stroke="var(--muted)" strokeDasharray="5 4" />
          {refLine !== undefined && <line x1={left} x2={W - right} y1={Y(refLine)} y2={Y(refLine)} stroke="var(--muted)" strokeDasharray="5 4" />}
          <path d={path(ideal)} fill="none" stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="6 4" />
          <path d={path(real)} fill="none" stroke={unit === 'dB' ? 'var(--accent)' : 'var(--copper)'} strokeWidth={2} />
          {hi_ !== null && <line x1={X(fs[hi_])} x2={X(fs[hi_])} y1={top} y2={H - bottom} stroke="var(--ink)" strokeDasharray="2 3" />}
        </g>
        <rect x={left} y={top} width={W - left - right} height={H - top - bottom} fill="none" stroke="var(--line)" />
        <text x={(left + W - right) / 2} y={H - 3} textAnchor="middle" fontSize={11} fill="var(--muted)">Frequency</text>
      </svg>
      <p className="px-2 pb-2 text-muted">{hi_ !== null ? `${si(fs[hi_], 'Hz', 4)} · ideal ${fmtY(ideal[hi_])} · standard values ${fmtY(real[hi_])}` : 'Point at the plot to read values.'}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ schematics */

const label = (n: string, v: number) => `${n} ${si(v, n.startsWith('R') ? 'Ω' : 'F', 3)}`;

function Rh({ x, y, t }: { x: number; y: number; t: string }) {
  return (
    <g>
      <rect x={x - 18} y={y - 6} width={36} height={12} fill="var(--sheet)" stroke="var(--ink)" strokeWidth={1.4} />
      <text x={x} y={y - 10} textAnchor="middle" fontSize={11} fill="var(--ink)">{t}</text>
    </g>
  );
}
function Rv({ x, y, t, left = false }: { x: number; y: number; t: string; left?: boolean }) {
  return (
    <g>
      <rect x={x - 6} y={y - 15} width={12} height={30} fill="var(--sheet)" stroke="var(--ink)" strokeWidth={1.4} />
      <text x={left ? x - 10 : x + 10} y={y + 4} textAnchor={left ? 'end' : 'start'} fontSize={11} fill="var(--ink)">{t}</text>
    </g>
  );
}
function Ch({ x, y, t }: { x: number; y: number; t: string }) {
  return (
    <g>
      <path d={`M${x - 3} ${y - 10}V${y + 10} M${x + 3} ${y - 10}V${y + 10}`} stroke="var(--ink)" strokeWidth={1.6} />
      <text x={x} y={y - 13} textAnchor="middle" fontSize={11} fill="var(--ink)">{t}</text>
    </g>
  );
}
function Cv({ x, y, t, left = false }: { x: number; y: number; t: string; left?: boolean }) {
  return (
    <g>
      <path d={`M${x - 10} ${y - 3}H${x + 10} M${x - 10} ${y + 3}H${x + 10}`} stroke="var(--ink)" strokeWidth={1.6} />
      <text x={left ? x - 13 : x + 13} y={y + 4} textAnchor={left ? 'end' : 'start'} fontSize={11} fill="var(--ink)">{t}</text>
    </g>
  );
}
const gnd = (x: number, y: number) => `M${x - 8} ${y}H${x + 8} M${x - 5} ${y + 3}H${x + 5} M${x - 2} ${y + 6}H${x + 2}`;

/** One section drawn after the TI SLOA088 figures (16-14, 16-16, 16-19, 16-25, 16-28, 16-29). */
function StageSchematic({ circuit, v }: { circuit: SectionCircuit; v: Parts }) {
  const minusTop = circuit === 'lp-mfb' || circuit === 'hp-mfb';
  const w: string[] = ['M270 100H300'];
  const parts: ReactNode[] = [];
  // op amp: inputs at (210, 85) and (210, 115), output (270, 100); output node at x = 285
  if (!minusTop) w.push('M210 115H200V145H285V100'); // unity-gain buffer
  else w.push('M210 115H200V128', gnd(200, 128));
  switch (circuit) {
    case 'lp1':
      w.push('M20 85H82', 'M118 85H210', 'M170 85V107', 'M170 113V128', gnd(170, 128));
      parts.push(<Rh key="r" x={100} y={85} t={label('R1', v.R1)} />, <Cv key="c" x={170} y={110} t={label('C1', v.C1)} left />);
      break;
    case 'hp1':
      w.push('M20 85H97', 'M103 85H210', 'M170 85V95', 'M170 125V132', gnd(170, 132));
      parts.push(<Ch key="c" x={100} y={85} t={label('C1', v.C1)} />, <Rv key="r" x={170} y={110} t={label('R1', v.R1)} left />);
      break;
    case 'lp-sk':
      w.push('M20 85H37', 'M73 85H122', 'M158 85H210', 'M100 85V35H137', 'M143 35H285V100', 'M180 85V107', 'M180 113V128', gnd(180, 128));
      parts.push(<Rh key="r1" x={55} y={85} t={label('R1', v.R1)} />, <Rh key="r2" x={140} y={85} t={label('R2', v.R2)} />, <Ch key="c2" x={140} y={35} t={label('C2', v.C2)} />, <Cv key="c1" x={180} y={110} t={label('C1', v.C1)} left />);
      break;
    case 'hp-sk':
      w.push('M20 85H52', 'M58 85H137', 'M143 85H210', 'M100 85V35H122', 'M158 35H285V100', 'M180 85V95', 'M180 125V132', gnd(180, 132));
      parts.push(<Ch key="c1" x={55} y={85} t={label('C1', v.C1)} />, <Ch key="c2" x={140} y={85} t={label('C2', v.C2)} />, <Rh key="r2" x={140} y={35} t={label('R2', v.R2)} />, <Rv key="r1" x={180} y={110} t={label('R1', v.R1)} left />);
      break;
    case 'lp-mfb':
      w.push('M20 85H37', 'M73 85H122', 'M158 85H210', 'M100 85V107', 'M100 113V128', gnd(100, 128), 'M100 85V22H172', 'M208 22H285V100', 'M185 85V55H237', 'M243 55H285');
      parts.push(
        <Rh key="r1" x={55} y={85} t={label('R1', v.R1)} />,
        <Rh key="r3" x={140} y={85} t={label('R3', v.R3)} />,
        <Cv key="c2" x={100} y={110} t={label('C2', v.C2)} />,
        <Rh key="r2" x={190} y={22} t={label('R2', v.R2)} />,
        <Ch key="c1" x={240} y={55} t={label('C1', v.C1)} />,
      );
      break;
    case 'hp-mfb':
      w.push('M20 85H52', 'M58 85H137', 'M143 85H210', 'M100 85V100', 'M100 130V136', gnd(100, 136), 'M100 85V22H237', 'M243 22H285V100', 'M185 85V55H207', 'M243 55H285');
      parts.push(
        <Ch key="c1" x={55} y={85} t={label('C1', v.C1)} />,
        <Ch key="c3" x={140} y={85} t={label('C3', v.C3)} />,
        <Rv key="r2" x={100} y={115} t={label('R2', v.R2)} />,
        <Ch key="c2" x={240} y={22} t={label('C2', v.C2)} />,
        <Rh key="r1" x={225} y={55} t={label('R1', v.R1)} />,
      );
      break;
  }
  return (
    <svg viewBox="0 0 330 160" className="block h-auto w-full max-w-[420px]" role="img" aria-label={`${CIRCUIT_LABEL[circuit]} section with component values`}>
      <path d={w.join(' ')} fill="none" stroke="var(--ink)" strokeWidth={1.4} />
      <path d="M210 70V130L270 100Z" fill="var(--sheet)" stroke="var(--ink)" strokeWidth={1.4} />
      <text x={216} y={90} fontSize={13} fill="var(--ink)">{minusTop ? '−' : '+'}</text>
      <text x={216} y={120} fontSize={13} fill="var(--ink)">{minusTop ? '+' : '−'}</text>
      <circle cx={20} cy={85} r={3} fill="var(--accent)" />
      <circle cx={300} cy={100} r={3} fill="var(--accent)" />
      <circle cx={285} cy={100} r={2.5} fill="var(--ink)" />
      <text x={20} y={73} textAnchor="middle" fontSize={11} fill="var(--accent)">in</text>
      <text x={300} y={88} textAnchor="middle" fontSize={11} fill="var(--accent)">out</text>
      {parts}
    </svg>
  );
}

function StageCard({ s }: { s: SectionDesign }) {
  const names = Object.keys(s.std).sort();
  return (
    <div className="min-w-0 border-b border-line py-2">
      <div className="px-3 font-semibold">
        Section {s.index + 1}: {CIRCUIT_LABEL[s.circuit]}
        {s.real.gain < 0 ? `, gain −${fmt(Math.abs(s.real.gain), 4)}` : ''}
      </div>
      <StageSchematic circuit={s.circuit} v={s.std} />
      <table className="tbl">
        <tbody>
          {names.map((n) => (
            <tr key={n}>
              <td>{n}</td>
              <td className="v font-semibold">{si(s.std[n], n.startsWith('R') ? 'Ω' : 'F', 3)}</td>
              <td className="v text-faint">{n.startsWith('R') ? `calc. ${si(s.exact[n], 'Ω', 4)}` : ''}</td>
            </tr>
          ))}
          {s.minRatio > 0 && (
            <tr>
              <td>C2/C1</td>
              <td className="v">{fmt(s.capRatio, 4)}</td>
              <td className="v text-faint">min. {fmt(s.minRatio, 4)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ method */

export function Method() {
  return (
    <>
      <h2>Cascaded sections</h2>
      <p>
        An nth-order filter is a cascade of second-order sections and, for odd n, one first-order section. Each low-pass section has the transfer function A0 / (1 + a s + b s²) with s normalised to the
        corner, s = jf/fc; a first-order section has b = 0. The high-pass equivalent replaces s by 1/s. The coefficients set the pole positions; the pole quality of a section is Q = √b / a. As in TI's
        design method the sections are ordered by rising Q, with the first-order section first, so that a high-Q section does not saturate on a signal it has already amplified.
      </p>
      <h2>Coefficients</h2>
      <p>
        The coefficients are computed from the poles, then checked against TI SLOA088 tables 16-4 to 16-9 for orders 1 to 8 (all agree to the four printed decimals except three misprints noted below):
      </p>
      <ul>
        <li>Butterworth: poles on the unit circle at angles (2k − 1)π/2n; a = 2 sin((2k − 1)π/2n), b = 1.</li>
        <li>
          Chebyshev (0.5, 1, 2, 3 dB ripple): ε = √(10^(r/10) − 1), poles −sinh(μ) sin θk ± j cosh(μ) cos θk with μ = asinh(1/ε)/n. These are normalised to the ripple band edge; they are rescaled so the
          gain at fc is 3.01 dB below the DC gain. For odd n that frequency is cosh(acosh(1/ε)/n) times the band edge; for even n, where DC sits at a ripple trough, cosh(acosh(√(1 + 2ε²)/ε)/n).
        </li>
        <li>Bessel: roots of the reverse Bessel polynomial θn(s), found numerically and rescaled so the gain at fc is −3.01 dB.</li>
      </ul>
      <p>
        So fc is the −3.01 dB frequency for every response, as in the TI tables; for a Chebyshev filter it lies above the edge of the ripple band, which is shown separately. The even-order Chebyshev filter
        has its DC gain at a ripple trough, so its passband peaks are the ripple value above the DC gain.
      </p>
      <h2>Section circuits and design equations (TI SLOA088 sections 16.3, 16.4)</h2>
      <p>The first-order sections are an RC network buffered by a voltage follower: R1 = a / (2π fc C1) for the low-pass and R1 = 1 / (2π fc a C1) for the high-pass.</p>
      <p>Unity-gain Sallen-Key low-pass (figure 16-16), C1 to ground, C2 in the feedback path. Given C1, C2 must satisfy the first condition for real resistors:</p>
      <div className="eq"><span className="no">(1)</span>C2 ≥ C1 · 4b / a², R1,2 = (a C2 ∓ √(a² C2² − 4 b C1 C2)) / (4π fc C1 C2)</div>
      <p>Multiple-feedback low-pass (figure 16-19) with passband gain A0 = −R2/R1:</p>
      <div className="eq"><span className="no">(2)</span>C2 ≥ C1 · 4b(1 − A0) / a², R2 = (a C2 − √(a² C2² − 4 b C1 C2 (1 − A0))) / (4π fc C1 C2), R1 = R2 / (−A0), R3 = b / (4π² fc² C1 C2 R2)</div>
      <p>Unity-gain Sallen-Key high-pass (figure 16-28) with C1 = C2 = C:</p>
      <div className="eq"><span className="no">(3)</span>R1 = 1 / (π fc C a), R2 = a / (4π fc C b)</div>
      <p>Multiple-feedback high-pass (figure 16-29) with C1 = C3 = C and passband gain A∞ = −C/C2:</p>
      <div className="eq"><span className="no">(4)</span>R1 = (1 − 2A∞) / (2π fc C a), R2 = a / (2π fc b C2 (1 − 2A∞))</div>
      <p>
        TI prints b = (2C + C2) / (ωc R1 C C2) for this circuit, which repeats the expression for a. Nodal analysis of figure 16-29 gives H(s) = −(C1/C2) / (1 + (C1 + C2 + C3)/(s C2 C3 R1) + 1/(s² C2 C3 R1 R2)),
        so b = 1 / (ωc² R1 R2 C C2); TI's resistor equations (4) agree with this corrected b.
      </p>
      <h2>Choosing components</h2>
      <p>
        C1 is either the entered capacitor or, from the resistance level R0, the standard value nearest 1 / (2π f0 R0 √m), where f0 is the section's natural frequency and m the capacitor ratio C2/C1 the
        section uses (the minimum of (1) or (2) for the low-pass circuits, 1/|A∞| for the MFB high-pass, otherwise 1). The two resistors that set f0 then have a geometric mean near R0. C2 of the low-pass sections is the next
        standard value at or above the minimum of (1) or (2), and C2 of the MFB high-pass is the standard value nearest C/|A∞|, which sets the realised gain; for that circuit the automatic choice takes, among
        the series values within √10 of the target C1, the one whose C1/C2 comes closest to |A∞|. The resistors are then calculated exactly for
        these capacitors and rounded to the nearest value of the resistor series. The solid curves, f0 and Q actual use the rounded values; nothing else is adjusted. TI recommends resistors from 1 kΩ to
        100 kΩ and capacitors from 1 nF upward, preferably C0G (NP0) ceramic or film.
      </p>
      <h2>Response</h2>
      <p>
        Each section is evaluated exactly as gain · s^m / (d0 + d1 s + d2 s²) from its component values. The magnitude and phase are the products and sums over the sections (an inverting MFB section adds
        −180°), and the group delay is the sum of d1 (d0 + d2 ω²) / ((d0 − d2 ω²)² + d1² ω²) over the sections. The corner with standard values is the highest frequency (lowest for a high-pass) where the
        gain is 3.01 dB below the passband gain. The op amp is ideal in these curves.
      </p>
      <h2>Op amp requirements (TI SLOA088 section 16.8.4)</h2>
      <p>TI asks for open-loop gain 40 dB above the peak gain of each section, which gives these minimum unity-gain bandwidths for a low-pass section of gain A:</p>
      <div className="eq"><span className="no">(5)</span>first order: fT = 100 · A · fc; Q &lt; 1: fT = 100 · A · fc · k; Q &gt; 1: fT = 100 · A · (fc / a) · √((Q² − 0.5) / (Q² − 0.25))</div>
      <p>
        k = fci/fc is the ratio of the section's own −3.01 dB frequency to fc (the k column of the TI tables). For a first-order section the tool uses its own corner fc/a in place of fc. A section with Q = 1
        exactly uses the Q &lt; 1 rule. The slew rate for full-power output at fc is SR = π · Vpp · fc. TI gives no corresponding rule for high-pass filters.
      </p>
      <h2>Sensitivity</h2>
      <p>
        TI gives the approximate sensitivity of Q and fc of a Sallen-Key or MFB section to each R and C as ±0.5 %/% (section 16.8.2). The errors add up across the sections, and TI shows an 8th-order
        Butterworth turning into a Chebyshev-like response with 0.35 dB of peaking through capacitor tolerance alone. Compare the dashed and solid curves, and use tighter tolerances for high-Q and
        high-order filters.
      </p>
      <h2>Differences from the TI document</h2>
      <ul>
        <li>Table 16-6 (0.5 dB), n = 3: a2 is printed 0.0640; the poles and the printed Q = 1.71 give 0.6402.</li>
        <li>Table 16-7 (1 dB), n = 7: b4 is printed 1.0432; the poles and the printed k = 1.520 give 1.0423.</li>
        <li>Table 16-8 (2 dB), n = 8: Q4 is printed 18.39; the printed a4 and b4 give 18.70.</li>
        <li>Example 16-2 prints R1 = 1.26 kΩ and R2 = 1.30 kΩ. TI's own equation with C1 = 22 nF, C2 = 150 nF gives 1.235 kΩ and 1.333 kΩ (same sum); only these give back a = 1.065, b = 1.9305.</li>
      </ul>
      <h2>References</h2>
      <ol>
        <li>
          <a href="https://www.ti.com/lit/ml/sloa088/sloa088.pdf" target="_blank" rel="noopener noreferrer">
            TI SLOA088, Active Filter Design Techniques (T. Kugelstadt), excerpted from Op Amps for Everyone, SLOD006
          </a>
          <div className="text-[12px] text-muted">Sections 16.2–16.4 (transfer functions, figures 16-12 to 16-29, design equations, examples 16-1 to 16-4), 16.8.2–16.8.4 (sensitivity, component values, op amp selection), 16.9 (tables 16-4 to 16-9).</div>
        </li>
        <li>IEC 60063, Preferred number series for resistors and capacitors (E6, E12, E24, E96).</li>
      </ol>
    </>
  );
}
