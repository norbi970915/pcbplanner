import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SiField } from '../components/SiField';
import { Sources } from '../components/Sources';
import { ToolPage } from '../components/ToolPage';
import { Big, LenField, Notes, NumField, Panel, Result, Section, Segmented, SelectField } from '../components/ui';
import type { DataSource } from '../data/source';
import { bandAround, cAbs, cAdd, cDiv, cSub, cx, returnLoss, termAt } from '../lib/matching';
import {
  binomialBandwidth, binomialZ, cascadeGamma, chebyshevDesign, exactBand, microstripWidth, quarterWaveZ, singleBandwidth, singleStub, smallReflectionGamma, striplineWidth, stubLengthForX,
  stubMatchZin, stubX, wavelengthMm, type StubEnd,
} from '../lib/quarterWave';
import { C0, fmt, fromMm, MM_PER_OZ, si, type LenUnit } from '../lib/units';
import { useSettings } from '../state/settings';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = {
  mode: 'transformer',
  f: 1e9,
  line: 'microstrip',
  eeff: 3,
  er: 4.1,
  h: 0.2,
  t: MM_PER_OZ,
  z0: 50,
  zl: 100,
  n: 3,
  kind: 'binomial',
  rl: 20,
  end: 'open',
  zs: 50,
  calc: 'analyse',
  len: 20,
  target: 'x',
  tx: -50,
  tl: 5e-9,
  tc: 2e-12,
  mrl: 60,
  mxl: -80,
};
type Params = typeof DEFAULTS;
type Mode = 'transformer' | 'stub' | 'match';
type LineKind = 'eeff' | 'microstrip' | 'stripline';

const COLORS = ['var(--accent)', 'var(--copper)'];
/** Reactance as an imaginary impedance: j50 Ω, −j50 Ω. */
const jx = (x: number, sig = 4) => `${x < 0 ? '−' : ''}j${fmt(Math.abs(x), sig)} Ω`;
/** |Γ| for the readouts; numerical noise at a perfect match shows as 0. */
const gText = (g: number) => (g < 1e-6 ? '0' : fmt(g, 3));
const TAU = 2 * Math.PI;

interface LineInfo {
  z: number;
  /** effective permittivity, null when the closed-form synthesis has no width for this impedance */
  eeff: number | null;
  /** closed-form width in mm */
  w: number | null;
  link: string;
}

/** εeff, closed-form width and impedance-calculator link of a line with impedance z. */
function lineInfo(p: Params, kind: LineKind, z: number): LineInfo {
  const q = new URLSearchParams({ mode: 'se', target: String(Number(z.toPrecision(5))), fq: String(Number((p.f / 1e9).toPrecision(6))) });
  if (kind === 'eeff') return { z, eeff: p.eeff, w: null, link: `/impedance?${q}` };
  const tr = kind === 'microstrip' ? microstripWidth(z, p.h, p.t, p.er) : striplineWidth(z, p.h, p.t, p.er);
  q.set('type', kind);
  if (kind === 'microstrip') q.set('mask', '0');
  q.set('etch', '0');
  q.set('t', String(p.t));
  q.set('h', String(p.h));
  q.set('er', String(p.er));
  if (kind === 'stripline') {
    q.set('h2', String(p.h));
    q.set('er2', String(p.er));
  }
  if (tr) q.set('w', String(Number(tr.w.toPrecision(4))));
  return { z, eeff: kind === 'stripline' ? p.er : (tr?.eeff ?? null), w: tr?.w ?? null, link: `/impedance?${q}` };
}

export default function QuarterWave() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const { unit } = useSettings();
  const L = (mm: number | null) => (mm === null || !Number.isFinite(mm) ? '—' : `${fmt(fromMm(mm, unit), 4)} ${unit}`);
  const mode: Mode = p.mode === 'stub' || p.mode === 'match' ? p.mode : 'transformer';
  const lk: LineKind = p.line === 'eeff' || p.line === 'stripline' ? p.line : 'microstrip';
  const end: StubEnd = p.end === 'short' ? 'short' : 'open';
  const cheb = p.kind === 'chebyshev';
  const n = Math.round(p.n);

  const errors: string[] = [];
  if (!(p.f > 0 && p.f < 1e13)) errors.push('Frequency must be greater than 0.');
  if (lk === 'eeff' && !(p.eeff >= 1)) errors.push('εeff must be at least 1.');
  if (lk !== 'eeff') {
    if (!(p.er >= 1)) errors.push('εr must be at least 1.');
    if (!(p.h > 0)) errors.push('Dielectric height must be greater than 0.');
    if (!(p.t >= 0)) errors.push('Copper thickness cannot be negative.');
  }
  if (!(p.z0 > 0)) errors.push('Line impedance Z0 must be greater than 0.');
  if (mode === 'transformer') {
    if (!(p.zl > 0)) errors.push('Load resistance must be greater than 0. The transformer matches real loads; use the stub or L-network matching for complex loads.');
    if (!(n >= 1 && n <= 8 && Math.abs(p.n - n) < 1e-9)) errors.push('Number of sections must be a whole number from 1 to 8.');
  }
  if (mode !== 'stub' && !(p.rl >= 1 && p.rl <= 60)) errors.push('The return-loss limit must be between 1 and 60 dB.');
  if (mode !== 'transformer' && !(p.zs > 0)) errors.push('Stub impedance must be greater than 0.');
  if (mode === 'stub' && p.calc === 'analyse' && !(p.len > 0)) errors.push('Stub length must be greater than 0.');
  if (mode === 'stub' && p.calc === 'design') {
    if (p.target === 'l' && !(p.tl > 0)) errors.push('Inductance must be greater than 0.');
    if (p.target === 'c' && !(p.tc > 0)) errors.push('Capacitance must be greater than 0.');
    if (p.target === 'x' && !(Number.isFinite(p.tx) && p.tx !== 0)) errors.push('Enter a non-zero reactance (positive for inductive, negative for capacitive).');
  }
  if (mode === 'match') {
    if (!(p.mrl > 0)) errors.push('Load resistance must be greater than 0: a stub cannot match a purely reactive load.');
    if (!Number.isFinite(p.mxl)) errors.push('Load reactance must be a number.');
  }
  const ok = errors.length === 0;
  const gm = 10 ** (-p.rl / 20);

  const lineSection = (
    <Section title="Line">
      <SiField label="Design frequency" symbol="f0" value={p.f} onChange={(v) => set({ f: v })} unit="Hz" prefixes={['M', 'G']} />
      <SelectField
        label="Medium"
        value={lk}
        onChange={(v) => set({ line: v })}
        options={[
          { value: 'microstrip', label: 'Microstrip' },
          { value: 'stripline', label: 'Stripline' },
          { value: 'eeff', label: 'Enter εeff' },
        ]}
      />
      {lk === 'eeff' ? (
        <NumField label="Effective permittivity" symbol="εeff" value={p.eeff} onChange={(v) => set({ eeff: v })} hint="Used for every line; microstrip εeff changes with width, so pick Microstrip for a per-section value." />
      ) : (
        <>
          <NumField label="Dielectric constant" symbol="εr" value={p.er} onChange={(v) => set({ er: v })} />
          <LenField label={lk === 'stripline' ? 'Trace to each plane' : 'Dielectric height'} symbol="h" value={p.h} onChange={(v) => set({ h: v })} />
          <LenField label="Copper thickness" symbol="t" value={p.t} onChange={(v) => set({ t: v })} units={['oz', 'um', 'mil', 'mm']} allowZero />
        </>
      )}
    </Section>
  );

  const properties = (
    <>
      <Section title="Calculation">
        <Segmented
          label="Calculation"
          value={mode}
          onChange={(v) => set({ mode: v })}
          options={[
            { value: 'transformer', label: 'λ/4 transformer' },
            { value: 'stub', label: 'Stub' },
            { value: 'match', label: 'Stub match' },
          ]}
        />
      </Section>
      {lineSection}
      {mode === 'transformer' && (
        <Section title="Transformer">
          <NumField label="Line impedance" symbol="Z0" value={p.z0} onChange={(v) => set({ z0: v })} unit="Ω" />
          <NumField label="Load resistance" symbol="ZL" value={p.zl} onChange={(v) => set({ zl: v })} unit="Ω" hint="Real load. Multisection designs need a resistive load." />
          <SelectField
            label="Response"
            value={cheb ? 'chebyshev' : 'binomial'}
            onChange={(v) => set({ kind: v })}
            options={[
              { value: 'binomial', label: 'Binomial (flat)' },
              { value: 'chebyshev', label: 'Chebyshev (ripple)' },
            ]}
          />
          <NumField label="Sections" symbol="N" value={p.n} onChange={(v) => set({ n: v })} hint="1 to 8. One section is the plain quarter-wave transformer." />
          <NumField label="Return-loss limit" symbol="RL" value={p.rl} onChange={(v) => set({ rl: v })} unit="dB" hint="Sets Γm = 10^(−RL/20) for the bandwidth and the Chebyshev ripple." />
        </Section>
      )}
      {mode === 'stub' && (
        <Section title="Stub">
          <NumField label="Stub impedance" symbol="Z0" value={p.zs} onChange={(v) => set({ zs: v })} unit="Ω" />
          <SelectField label="Far end" value={end} onChange={(v) => set({ end: v })} options={[{ value: 'open', label: 'Open circuit' }, { value: 'short', label: 'Short circuit' }]} />
          <SelectField label="Calculate" value={p.calc === 'design' ? 'design' : 'analyse'} onChange={(v) => set({ calc: v })} width={160} options={[{ value: 'analyse', label: 'Zin from length' }, { value: 'design', label: 'Length for a target' }]} />
          {p.calc === 'design' ? (
            <>
              <SelectField label="Target" value={p.target === 'l' || p.target === 'c' ? p.target : 'x'} onChange={(v) => set({ target: v })} options={[{ value: 'x', label: 'Reactance' }, { value: 'l', label: 'Inductance' }, { value: 'c', label: 'Capacitance' }]} />
              {p.target === 'l' ? (
                <SiField label="Inductance" symbol="L" value={p.tl} onChange={(v) => set({ tl: v })} unit="H" prefixes={['p', 'n', 'µ']} />
              ) : p.target === 'c' ? (
                <SiField label="Capacitance" symbol="C" value={p.tc} onChange={(v) => set({ tc: v })} unit="F" prefixes={['p', 'n']} />
              ) : (
                <NumField label="Reactance" symbol="X" value={p.tx} onChange={(v) => set({ tx: v })} unit="Ω" allowNegative hint="Positive for inductive, negative for capacitive." />
              )}
            </>
          ) : (
            <LenField label="Stub length" symbol="l" value={p.len} onChange={(v) => set({ len: v })} />
          )}
        </Section>
      )}
      {mode === 'match' && (
        <Section title="Single-stub match">
          <NumField label="Line impedance" symbol="Z0" value={p.z0} onChange={(v) => set({ z0: v })} unit="Ω" />
          <NumField label="Load resistance" symbol="RL" value={p.mrl} onChange={(v) => set({ mrl: v })} unit="Ω" />
          <NumField label="Load reactance" symbol="XL" value={p.mxl} onChange={(v) => set({ mxl: v })} unit="Ω" allowNegative hint="At f0. For the sweep the load is R in series with the L or C that gives XL at f0." />
          <NumField label="Stub impedance" symbol="Z0s" value={p.zs} onChange={(v) => set({ zs: v })} unit="Ω" />
          <SelectField label="Stub end" value={end} onChange={(v) => set({ end: v })} options={[{ value: 'open', label: 'Open circuit' }, { value: 'short', label: 'Short circuit (via)' }]} />
          <NumField label="Return-loss limit" symbol="RL" value={p.rl} onChange={(v) => set({ rl: v })} unit="dB" />
        </Section>
      )}
    </>
  );

  let body: React.ReactNode = null;
  let status = 'Check the inputs';
  if (ok && mode === 'transformer') {
    const r = transformer(p, n, cheb, gm);
    status = r.design ? `${n}-section ${cheb ? 'Chebyshev' : 'binomial'} · ${r.formulaBw === Infinity ? 'whole band' : `${fmt(r.formulaBw * 100, 3)} % bandwidth`}` : (r.note ?? status);
    body = <TransformerView p={p} lk={lk} n={n} cheb={cheb} gm={gm} r={r} L={L} unit={unit} />;
  } else if (ok && mode === 'stub') {
    body = <StubView p={p} lk={lk} end={end} L={L} unit={unit} />;
    status = stubStatus(p, lk, end, L);
  } else if (ok && mode === 'match') {
    body = <MatchView p={p} lk={lk} end={end} gm={gm} L={L} />;
    status = `Single-stub match, ${end} stub`;
  }

  return (
    <ToolPage
      title="Quarter-Wave Transformer & Stub Calculator"
      description="Single and multisection (binomial and Chebyshev) quarter-wave transformers with section impedances, bandwidth and exact response; open and short stubs; single-stub matching of a complex load, with physical lengths and trace widths."
      onReset={reset}
      properties={properties}
      status={status}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      {body}
    </ToolPage>
  );
}

/* ------------------------------------------------------------------ transformer */

interface TransformerResult {
  design: boolean;
  z: number[];
  formulaBw: number;
  note?: string;
  thetaM?: number;
}

function transformer(p: Params, n: number, cheb: boolean, gm: number): TransformerResult {
  if (Math.abs(p.zl - p.z0) <= 1e-12 * p.z0) return { design: false, z: [], formulaBw: NaN, note: 'The load already equals Z0; no transformer is needed.' };
  if (n === 1) return { design: true, z: [quarterWaveZ(p.z0, p.zl)], formulaBw: singleBandwidth(p.z0, p.zl, gm) };
  if (!cheb) return { design: true, z: binomialZ(p.z0, p.zl, n), formulaBw: binomialBandwidth(p.z0, p.zl, n, gm) };
  const d = chebyshevDesign(p.z0, p.zl, n, gm);
  if (!d) return { design: false, z: [], formulaBw: NaN, note: `The unmatched reflection, ½|ln(ZL/Z0)| = ${fmt(0.5 * Math.abs(Math.log(p.zl / p.z0)), 3)}, is already below Γm = ${fmt(gm, 3)}; a Chebyshev design needs a smaller Γm.` };
  return { design: true, z: d.z, formulaBw: d.bandwidth, thetaM: d.thetaM };
}

function TransformerView({ p, lk, n, cheb, gm, r, L, unit }: { p: Params; lk: LineKind; n: number; cheb: boolean; gm: number; r: TransformerResult; L: (mm: number | null) => string; unit: LenUnit }) {
  const exact = useMemo(() => (r.design ? exactBand(p.z0, p.zl, r.z, gm) : null), [r, p.z0, p.zl, gm]);
  const curves = useMemo(() => {
    if (!r.design) return null;
    const frs = Array.from({ length: 401 }, (_, i) => (2 * i) / 400);
    return {
      frs,
      exact: frs.map((fr) => cAbs(cascadeGamma(p.z0, p.zl, r.z, fr))),
      approx: frs.map((fr) => cAbs(smallReflectionGamma(p.z0, p.zl, r.z, fr))),
    };
  }, [r, p.z0, p.zl]);
  if (!r.design || !exact || !curves) return <Notes items={[r.note ?? 'No design for these inputs.']} />;
  const infos = r.z.map((z) => lineInfo(p, lk, z));
  const quarter = (i: LineInfo) => (i.eeff === null ? null : wavelengthMm(p.f, i.eeff) / 4);
  const total = infos.reduce((s, i) => s + (quarter(i) ?? NaN), 0);
  const notes: string[] = [];
  if (infos.some((i) => i.eeff === null)) notes.push('A section impedance is outside the closed-form width range (w/h from 0.01 to 100); its εeff and length are not shown. Use the impedance calculator for it.');
  if (exact.peak > gm * 1.001) notes.push(`The exact response rises to |Γ| = ${fmt(exact.peak, 3)} inside the band, above Γm = ${fmt(gm, 3)}: the Chebyshev synthesis uses the small-reflection approximation. Raise N or reduce the impedance ratio for closer agreement.`);
  const narrow = infos.filter((i) => i.w !== null && i.w < 0.1);
  if (narrow.length) notes.push(`${narrow.length === 1 ? 'One section is' : `${narrow.length} sections are`} narrower than 0.1 mm (4 mil) on this dielectric. Check your fabricator's minimum trace width, or use a thicker dielectric for the high-impedance sections.`);
  if (Math.max(p.zl / p.z0, p.z0 / p.zl) > 4) notes.push('For impedance ratios above about 4 the small-reflection formulas (bandwidth, section values) lose accuracy; the exact curve and exact bandwidth below remain correct for the listed sections.');
  const bwText = (v: number) => (v === Infinity || v >= 2 ? 'whole band' : `${fmt(v * 100, 4)} %`);
  return (
    <>
      <Notes items={notes} />
      <Panel title={`${n === 1 ? 'Quarter-wave transformer' : `${n}-section ${cheb ? 'Chebyshev' : 'binomial'} transformer`}: ${fmt(p.z0, 4)} Ω to ${fmt(p.zl, 4)} Ω`}>
        <div className="flex flex-wrap gap-8 px-3 py-3">
          {n === 1 && <Big label="Section impedance Z1" value={fmt(r.z[0], 5)} unit="Ω" />}
          <Big label={`Bandwidth, |Γ| ≤ ${fmt(gm, 3)}`} value={bwText(exact.bandwidth).replace(' %', '')} unit={exact.bandwidth >= 2 ? '' : '% of f0'} />
          <Big label="Total length" value={Number.isFinite(total) ? fmt(fromMm(total, unit), 4) : '—'} unit={Number.isFinite(total) ? unit : ''} />
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Section</th>
              <th className="v">Zn</th>
              <th className="v">εeff</th>
              <th className="v">λ/4 at f0</th>
              <th className="v">{lk === 'eeff' ? 'Width' : 'Width (closed form)'}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {infos.map((info, i) => (
              <tr key={i}>
                <td>{i + 1}{i === 0 ? ' (Z0 side)' : i === n - 1 ? ' (load side)' : ''}</td>
                <td className="v font-semibold">{fmt(info.z, 5)} Ω</td>
                <td className="v">{info.eeff === null ? '—' : fmt(info.eeff, 4)}</td>
                <td className="v">{L(quarter(info))}</td>
                <td className="v">{info.w === null ? '—' : L(info.w)}</td>
                <td>
                  <Link to={info.link}>Solve width →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="tbl">
          <tbody>
            <Result label="Bandwidth from the exact cascade" value={bwText(exact.bandwidth)} sub={exact.bandwidth < 2 ? `${si(exact.lo * p.f, 'Hz', 4)} – ${si((2 - exact.lo) * p.f, 'Hz', 4)}` : 'never exceeds Γm'} />
            <Result
              label={n === 1 ? 'Bandwidth, Pozar §5.4 (exact for TEM)' : cheb ? 'Bandwidth, 2 − 4θm/π (Pozar §5.7)' : 'Bandwidth, binomial formula (Pozar §5.6)'}
              value={bwText(r.formulaBw)}
              sub={r.thetaM !== undefined ? `θm = ${fmt((r.thetaM * 180) / Math.PI, 4)}°` : n === 1 ? undefined : 'small-reflection approximation'}
            />
            <Result label="Γm" value={`${fmt(gm, 4)} (VSWR ${fmt((1 + gm) / (1 - gm), 4)})`} sub={`return loss ${fmt(p.rl, 3)} dB`} />
            <Result label="Unmatched reflection" value={fmt(Math.abs(p.zl - p.z0) / (p.zl + p.z0), 4)} sub="|Γ| without the transformer, and at f = 0 with it" />
          </tbody>
        </table>
        <p className="px-3 py-2 text-faint">
          {lk === 'eeff'
            ? 'All sections use the entered εeff. '
            : lk === 'microstrip'
              ? 'Widths and εeff from the quasi-static Hammerstad–Jensen formulas (bare microstrip, no solder mask); each section has its own εeff, so its own λ/4 length. '
              : 'Widths from Wheeler’s stripline formula; in stripline εeff = εr. '}
          Solve width opens the field-solver impedance calculator with the target and, where available, this width and stackup filled in.
        </p>
      </Panel>
      <Panel title="Reflection versus frequency">
        <GammaPlot frs={curves.frs} f0={p.f} gm={gm} curves={[{ v: curves.exact, color: COLORS[0], label: 'Exact cascade' }, { v: curves.approx, color: COLORS[1], dash: '5 4', label: 'Small-reflection approximation' }]} />
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------------ stub */

function stubTarget(p: Params): number {
  const w = TAU * p.f;
  return p.target === 'l' ? w * p.tl : p.target === 'c' ? -1 / (w * p.tc) : p.tx;
}

function stubStatus(p: Params, lk: LineKind, end: StubEnd, L: (mm: number | null) => string): string {
  const info = lineInfo(p, lk, p.zs);
  if (info.eeff === null) return 'Stub impedance outside the closed-form range';
  const lam = wavelengthMm(p.f, info.eeff);
  if (p.calc === 'design') return `${end === 'open' ? 'Open' : 'Short'} stub ${L((stubLengthForX(end, p.zs, stubTarget(p)) / TAU) * lam)}`;
  const x = stubX(end, p.zs, (TAU * p.len) / lam);
  return Number.isFinite(x) ? `Zin = ${jx(x)}` : 'Stub at resonance';
}

function StubView({ p, lk, end, L, unit }: { p: Params; lk: LineKind; end: StubEnd; L: (mm: number | null) => string; unit: LenUnit }) {
  const info = lineInfo(p, lk, p.zs);
  if (info.eeff === null) return <Notes kind="error" items={['The stub impedance is outside the closed-form width range (w/h from 0.01 to 100). Choose another impedance or enter εeff.']} />;
  const w = TAU * p.f;
  const lam = wavelengthMm(p.f, info.eeff);
  const reactText = (x: number) => (x === Infinity || x === -Infinity ? 'open circuit (parallel resonance)' : Math.abs(x) < 1e-9 * p.zs ? 'short circuit (series resonance)' : jx(x, 5));
  const equiv = (x: number) => (!Number.isFinite(x) || Math.abs(x) < 1e-9 * p.zs ? '—' : x > 0 ? `L = ${si(x / w, 'H', 4)}` : `C = ${si(-1 / (w * x), 'F', 4)}`);
  const lineRow = (
    <>
      <Result label="Wavelength on the stub" value={L(lam)} sub={`εeff = ${fmt(info.eeff, 4)}`} />
      {info.w !== null && <Result label="Stub width (closed form)" value={L(info.w)} sub={<Link to={info.link}>Solve in the impedance calculator →</Link>} />}
      {info.w === null && <Result label="Stub width" value={<Link to={info.link}>Impedance calculator →</Link>} />}
    </>
  );
  if (p.calc === 'design') {
    const x = stubTarget(p);
    const rows = (['open', 'short'] as const).map((e) => {
      const bl = stubLengthForX(e, p.zs, x);
      return { e, bl, mm: (bl / TAU) * lam };
    });
    const sel = rows.find((r) => r.e === end)!;
    return (
      <Panel title={`Stub length for ${reactText(x)} at ${si(p.f, 'Hz', 4)}`}>
        <div className="flex flex-wrap gap-8 px-3 py-3">
          <Big label={`${end === 'open' ? 'Open' : 'Short'} stub length`} value={fmt(fromMm(sel.mm, unit), 4)} unit={unit} />
          <Big label="Electrical length" value={fmt((sel.bl * 180) / Math.PI, 4)} unit="°" />
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>End</th>
              <th className="v">βl</th>
              <th className="v">l / λ</th>
              <th className="v">Length</th>
              <th className="v">First λ/4 resonance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.e} className={r.e === end ? 'font-semibold' : ''}>
                <td>{r.e === 'open' ? 'Open' : 'Short'}</td>
                <td className="v">{fmt((r.bl * 180) / Math.PI, 4)}°</td>
                <td className="v">{fmt(r.bl / TAU, 4)}</td>
                <td className="v">{L(r.mm)}</td>
                <td className="v">{si(C0 / (4 * (r.mm / 1e3) * Math.sqrt(info.eeff!)), 'Hz', 4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="tbl">
          <tbody>
            <Result label="Target reactance" value={jx(x, 5)} sub={equiv(x)} />
            {lineRow}
          </tbody>
        </table>
        <p className="px-3 py-2 text-faint">The shortest length is shown; adding any multiple of λ/2 gives the same reactance at f0 but a narrower band. A short stub needs a via to ground, whose inductance lengthens it slightly.</p>
      </Panel>
    );
  }
  const bl = (TAU * p.len) / lam;
  const x = stubX(end, p.zs, bl);
  const fq = C0 / (4 * (p.len / 1e3) * Math.sqrt(info.eeff));
  return (
    <Panel title={`${end === 'open' ? 'Open' : 'Short'} stub, ${fmt(p.zs, 4)} Ω, ${L(p.len)}`}>
      <div className="flex flex-wrap gap-8 px-3 py-3">
        <Big label="Input impedance at f0" value={Number.isFinite(x) ? jx(x).replace(' Ω', '') : '∞'} unit="Ω" />
        <Big label="First resonance" value={si(fq, 'Hz', 4).split(' ')[0]} unit={si(fq, 'Hz', 4).split(' ')[1]} />
      </div>
      <table className="tbl">
        <tbody>
          <Result label="Zin" value={reactText(x)} sub={end === 'open' ? 'Zin = −j Z0 cot βl' : 'Zin = j Z0 tan βl'} />
          <Result label="Equivalent at f0" value={equiv(x)} sub="valid near f0 only; a stub is not a lumped part" />
          <Result label="Electrical length" value={`${fmt((bl * 180) / Math.PI, 4)}°`} sub={`l / λ = ${fmt(bl / TAU, 4)}`} />
          <Result label="Quarter-wave frequency" value={si(fq, 'Hz', 4)} sub={end === 'open' ? 'the open stub shorts the line (series resonance)' : 'the short stub looks open (parallel resonance)'} />
          <Result label="Half-wave frequency" value={si(2 * fq, 'Hz', 4)} sub={end === 'open' ? 'the stub looks open again' : 'the stub looks shorted again'} />
          {lineRow}
        </tbody>
      </table>
    </Panel>
  );
}

/* ------------------------------------------------------------------ single-stub match */

function MatchView({ p, lk, end, gm, L }: { p: Params; lk: LineKind; end: StubEnd; gm: number; L: (mm: number | null) => string }) {
  const zl = cx(p.mrl, p.mxl);
  const sols = useMemo(() => singleStub(p.z0, zl, p.zs, end), [p.z0, p.mrl, p.mxl, p.zs, end]); // eslint-disable-line react-hooks/exhaustive-deps
  const line = lineInfo(p, lk, p.z0);
  const stub = lineInfo(p, lk, p.zs);
  // |Γ| at f/f0 = fr, the load following its series R–L or R–C model
  const mag = (i: number, fr: number) => {
    const zin = stubMatchZin(p.z0, termAt(zl, 1, fr), p.zs, end, sols[i], fr);
    const g = cAbs(cDiv(cSub(zin, cx(p.z0)), cAdd(zin, cx(p.z0))));
    return Number.isFinite(g) ? g : 1;
  };
  const curves = useMemo(() => {
    const frs = Array.from({ length: 401 }, (_, i) => 0.5 + i / 400);
    return { frs, v: sols.map((_, i) => frs.map((fr) => mag(i, fr))) };
  }, [sols]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!sols.length) return <Notes kind="error" items={['No stub solution for these inputs.']} />;
  if (line.eeff === null || stub.eeff === null) return <Notes kind="error" items={['The line or stub impedance is outside the closed-form width range (w/h from 0.01 to 100). Choose another impedance or enter εeff.']} />;
  const lamLine = wavelengthMm(p.f, line.eeff), lamStub = wavelengthMm(p.f, stub.eeff);
  const bands = sols.map((_, i) => bandAround((f) => returnLoss(mag(i, f / p.f)), p.f, p.rl));
  if (sols.length === 1 && sols[0].d === 0 && Math.abs(sols[0].b) < 1e-12) return <Notes items={['The load already equals Z0; no stub is needed.']} />;
  return (
    <>
      <Panel title={`Single ${end} stub: ${fmt(p.mrl, 4)} ${p.mxl < 0 ? '−' : '+'} j${fmt(Math.abs(p.mxl), 4)} Ω to ${fmt(p.z0, 4)} Ω`}>
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th>
              <th className="v">Stub position d</th>
              <th className="v">d / λ</th>
              <th className="v">Line susceptance</th>
              <th className="v">Stub length l</th>
              <th className="v">l / λ</th>
              <th className="v">Band, RL ≥ {fmt(p.rl, 3)} dB</th>
            </tr>
          </thead>
          <tbody>
            {sols.map((s, i) => {
              const b = bands[i];
              return (
                <tr key={i}>
                  <td className="font-semibold" style={{ color: COLORS[i] }}>{i + 1}</td>
                  <td className="v font-semibold">{L(s.d * lamLine)}</td>
                  <td className="v">{fmt(s.d, 4)}</td>
                  <td className="v">{`y = 1 ${s.b * p.z0 < 0 ? '−' : '+'} j${fmt(Math.abs(s.b * p.z0), 4)}`}</td>
                  <td className="v font-semibold">{L(s.l * lamStub)}</td>
                  <td className="v">{fmt(s.l, 4)}</td>
                  <td className="v">{b && b.lo !== null && b.hi !== null ? `${fmt(((b.hi - b.lo) / p.f) * 100, 3)} %` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <table className="tbl">
          <tbody>
            <Result label="Wavelength on the line" value={L(lamLine)} sub={`Z0 = ${fmt(p.z0, 4)} Ω, εeff = ${fmt(line.eeff, 4)}${line.w !== null ? `, width ${L(line.w)}` : ''}`} />
            <Result label="Wavelength on the stub" value={L(lamStub)} sub={`Z0s = ${fmt(p.zs, 4)} Ω, εeff = ${fmt(stub.eeff, 4)}${stub.w !== null ? `, width ${L(stub.w)}` : ''}`} />
          </tbody>
        </table>
        <p className="px-3 py-2 text-faint">
          d is measured from the load towards the source; the stub is connected in shunt there. The solution with the shorter d and l usually has the wider band. Line widths:{' '}
          <Link to={line.link}>{fmt(p.z0, 4)} Ω line</Link>
          {p.zs !== p.z0 && (
            <>
              {' · '}
              <Link to={stub.link}>{fmt(p.zs, 4)} Ω stub</Link>
            </>
          )}
          .
        </p>
      </Panel>
      <Panel title="Reflection versus frequency">
        <GammaPlot frs={curves.frs} f0={p.f} gm={gm} curves={curves.v.map((v, i) => ({ v, color: COLORS[i], label: `Solution ${i + 1}` }))} />
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------------ plot */

function GammaPlot({ frs, f0, gm, curves }: { frs: number[]; f0: number; gm: number; curves: { v: number[]; color: string; dash?: string; label: string }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 260, ml = 48, mr = 30, mt = 14, mb = 34;
  const a = frs[0], b = frs[frs.length - 1];
  const vmax = Math.max(gm * 1.5, ...curves.flatMap((c) => c.v.filter(Number.isFinite)));
  const step = vmax > 0.5 ? 0.2 : vmax > 0.2 ? 0.1 : vmax > 0.1 ? 0.05 : 0.02;
  const ymax = Math.min(1, Math.ceil(vmax / step) * step);
  const X = (fr: number) => ml + ((fr - a) / (b - a)) * (W - ml - mr);
  const Y = (v: number) => mt + (1 - Math.min(v, ymax) / ymax) * (H - mt - mb);
  const path = (v: number[]) => v.map((d, i) => (Number.isFinite(d) ? `${i && Number.isFinite(v[i - 1]) ? 'L' : 'M'}${X(frs[i]).toFixed(1)},${Y(d).toFixed(1)}` : '')).join(' ');
  const yt: number[] = [];
  for (let v = 0; v <= ymax + 1e-9; v += step) yt.push(v);
  const xt = b - a > 1.2 ? [0, 0.5, 1, 1.5, 2] : [0.5, 0.75, 1, 1.25, 1.5];
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    if (x < ml || x > W - mr) return setHover(null);
    setHover(Math.round(((x - ml) / (W - ml - mr)) * (frs.length - 1)));
  };
  const hi = hover ?? frs.findIndex((f) => Math.abs(f - 1) < 1e-9);
  return (
    <div className="px-2 pt-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full max-w-[740px]" role="img" aria-label="Reflection coefficient magnitude versus frequency" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {yt.map((v) => (
          <g key={v}>
            <line x1={ml} x2={W - mr} y1={Y(v)} y2={Y(v)} stroke="var(--line)" />
            <text x={ml - 6} y={Y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{fmt(v, 2)}</text>
          </g>
        ))}
        {xt.map((fr) => (
          <g key={fr}>
            <line x1={X(fr)} x2={X(fr)} y1={mt} y2={H - mb} stroke="var(--line)" />
            <text x={X(fr)} y={H - mb + 15} textAnchor="middle" fontSize={11} fill="var(--muted)">{fr === 1 ? `f0 = ${si(f0, 'Hz', 3)}` : si(fr * f0, 'Hz', 3)}</text>
          </g>
        ))}
        <line x1={ml} x2={W - mr} y1={Y(gm)} y2={Y(gm)} stroke="var(--err-line)" strokeDasharray="6 3" />
        <g fill="none" strokeWidth={2} strokeLinejoin="round">
          {curves.map((c, i) => <path key={i} d={path(c.v)} stroke={c.color} strokeDasharray={c.dash} />)}
        </g>
        {hi >= 0 && <line x1={X(frs[hi])} x2={X(frs[hi])} y1={mt} y2={H - mb} stroke="var(--ink)" strokeDasharray="2 3" opacity={0.6} />}
        <rect x={ml} y={mt} width={W - ml - mr} height={H - mt - mb} fill="none" stroke="var(--line)" />
        <text x={12} y={(mt + H - mb) / 2} transform={`rotate(-90 12 ${(mt + H - mb) / 2})`} textAnchor="middle" fontSize={11} fill="var(--muted)">|Γ|</text>
        <text x={(ml + W - mr) / 2} y={H - 3} textAnchor="middle" fontSize={11} fill="var(--muted)">Frequency</text>
      </svg>
      <div className="flex flex-wrap gap-x-5 gap-y-1 px-2 pb-2 text-muted">
        {hi >= 0 && <span className="font-semibold text-ink">{si(frs[hi] * f0, 'Hz', 4)}</span>}
        {curves.map((c, i) => (
          <span key={i}>
            <span className="inline-block h-[3px] w-4 align-middle" style={{ background: c.color }} /> {c.label}
            {hi >= 0 && Number.isFinite(c.v[hi]) ? `: |Γ| = ${gText(c.v[hi])}` : ''}
          </span>
        ))}
      </div>
      <p className="px-2 pb-2 text-faint">Red dashed line: Γm = {fmt(gm, 3)}. Lossless TEM lines; electrical lengths scale with frequency.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ method */

const SOURCES: DataSource[] = [
  {
    title: 'D. M. Pozar, Microwave Engineering, 4th ed., Wiley, 2012',
    url: 'https://openlibrary.org/isbn/9780470631553',
    note: '§2.3 (input impedance of a terminated line, open and short stubs), §5.2 (single-stub shunt tuning), §5.4 (quarter-wave transformer and its bandwidth), §5.5 (theory of small reflections), §5.6 (binomial) and §5.7 (Chebyshev multisection transformers). Worked examples of §5.2, §5.4, §5.6 and §5.7 are reproduced in the tests.',
  },
  {
    title: 'E. Hammerstad, Ø. Jensen, “Accurate Models for Microstrip Computer-Aided Design”, IEEE MTT-S International Microwave Symposium Digest, pp. 407–409, 1980',
    url: 'https://doi.org/10.1109/MWSYM.1980.1124303',
    note: 'Quasi-static microstrip impedance and εeff with thickness correction, inverted here by bisection to give an approximate width.',
  },
  {
    title: 'H. A. Wheeler, “Transmission-Line Properties of a Strip Line Between Parallel Planes”, IEEE Trans. Microwave Theory Tech., vol. 26, no. 11, pp. 866–876, 1978',
    url: 'https://doi.org/10.1109/TMTT.1978.1129505',
    note: 'Symmetric stripline impedance with thickness, inverted by bisection for the approximate stripline width.',
  },
];

export function Method() {
  return (
    <>
      <h2>Lines</h2>
      <p>All lines are lossless and TEM, so the electrical length θ = βl grows in proportion to frequency. A line of impedance Z0 and length l terminated in ZL has the input impedance</p>
      <div className="eq">
        <span className="no">(1)</span>
        <i>Z</i>
        <sub>in</sub> = <i>Z</i>
        <sub>0</sub> (<i>Z</i>
        <sub>L</sub> + j<i>Z</i>
        <sub>0</sub> tan β<i>l</i>) / (<i>Z</i>
        <sub>0</sub> + j<i>Z</i>
        <sub>L</sub> tan β<i>l</i>), λ = <i>c</i> / (<i>f</i>√ε<sub>eff</sub>)
      </div>
      <p>
        For microstrip, εeff and an approximate width come from the quasi-static Hammerstad–Jensen formulas for each impedance, so sections of different impedance have different λ/4 lengths.
        For stripline εeff = εr and the width comes from Wheeler's formula. Both are closed-form estimates for bare lines; the Solve width link opens the field-solver impedance calculator
        with the target impedance and the stackup filled in. Microstrip dispersion, solder mask and conductor loss are not included.
      </p>
      <h2>Quarter-wave transformer</h2>
      <p>A λ/4 section of impedance Z1 transforms a resistive load to Z1²/ZL, so it matches ZL to Z0 when</p>
      <div className="eq">
        <span className="no">(2)</span>
        <i>Z</i>
        <sub>1</sub> = √(<i>Z</i>
        <sub>0</sub>
        <i>Z</i>
        <sub>L</sub>)
      </div>
      <p>Pozar (§5.4) gives the fractional bandwidth over which |Γ| ≤ Γm, exact for TEM lines:</p>
      <div className="eq">
        <span className="no">(3)</span>
        Δ<i>f</i>/<i>f</i>
        <sub>0</sub> = 2 − (4/π) cos⁻¹[ Γ<sub>m</sub>/√(1 − Γ<sub>m</sub>²) · 2√(<i>Z</i>
        <sub>0</sub>
        <i>Z</i>
        <sub>L</sub>)/|<i>Z</i>
        <sub>L</sub> − <i>Z</i>
        <sub>0</sub>| ]
      </div>
      <h2>Binomial transformer</h2>
      <p>
        The small-reflection response of N equal-length sections is Γ(θ) ≈ Σ Γn e<sup>−2jnθ</sup> with Γn ≈ ½ ln(Zn+1/Zn) (Pozar §5.5). The binomial design makes it maximally flat at f0,
        Γ(θ) = A(1 + e<sup>−2jθ</sup>)<sup>N</sup>, and Pozar recommends computing the sections from
      </p>
      <div className="eq">
        <span className="no">(4)</span>
        ln(<i>Z</i>
        <sub>n+1</sub>/<i>Z</i>
        <sub>n</sub>) = 2<sup>−N</sup>
        <i>C</i>(<i>N</i>, <i>n</i>) ln(<i>Z</i>
        <sub>L</sub>/<i>Z</i>
        <sub>0</sub>)
      </div>
      <p>which ends exactly on ZL. With A ≈ 2<sup>−(N+1)</sup> ln(ZL/Z0), the bandwidth for |Γ| ≤ Γm is</p>
      <div className="eq">
        <span className="no">(5)</span>
        Δ<i>f</i>/<i>f</i>
        <sub>0</sub> = 2 − (4/π) cos⁻¹[ ½ (Γ<sub>m</sub>/|<i>A</i>|)<sup>1/N</sup> ]
      </div>
      <h2>Chebyshev transformer</h2>
      <p>The equal-ripple design (Pozar §5.7) sets the response to a Chebyshev polynomial with ripple Γm in the passband θm ≤ θ ≤ π − θm:</p>
      <div className="eq">
        <span className="no">(6)</span>
        Γ(θ) = Γ<sub>m</sub> e<sup>−jNθ</sup> T<sub>N</sub>(sec θ<sub>m</sub> cos θ), sec θ<sub>m</sub> = cosh[ (1/N) cosh⁻¹( |ln(<i>Z</i>
        <sub>L</sub>/<i>Z</i>
        <sub>0</sub>)| / 2Γ<sub>m</sub> ) ]
      </div>
      <p>
        T<sub>N</sub>(sec θm cos θ) is expanded into cos(N − 2n)θ terms using cos<sup>k</sup>θ = 2<sup>−k</sup> Σ C(k, j) cos(k − 2j)θ and matched term by term to
        2[Γ0 cos Nθ + Γ1 cos(N − 2)θ + …] (for even N the last term is ΓN/2), giving the symmetric Γn; then ln(Zn+1/Zn) = 2Γn. The bandwidth is Δf/f0 = 2 − 4θm/π. This works for any N,
        not only the tabulated N ≤ 4.
      </p>
      <h2>Exact response</h2>
      <p>
        Equations (4)–(6) rest on the small-reflection approximation. The plot and the exact bandwidth instead cascade the actual sections with equation (1), from the load to the input. For
        a Chebyshev design the exact ripple can exceed Γm slightly; the page reports it when it does. The response of real-impedance TEM sections is symmetrical about f0 and repeats
        every 2f0.
      </p>
      <h2>Stubs</h2>
      <p>With equation (1), a short-circuited stub has Zin = jZ0 tan βl and an open-circuited stub Zin = −jZ0 cot βl (Pozar §2.3). The shortest lengths for a reactance X are</p>
      <div className="eq">
        <span className="no">(7)</span>
        short: β<i>l</i> = tan⁻¹(<i>X</i>/<i>Z</i>
        <sub>0</sub>) (+π if <i>X</i> &lt; 0), open: β<i>l</i> = π/2 + tan⁻¹(<i>X</i>/<i>Z</i>
        <sub>0</sub>)
      </div>
      <p>
        A target L or C is converted with X = ωL or X = −1/(ωC) at f0; the stub only mimics it near f0. At the quarter-wave frequency f = c/(4l√εeff) an open stub becomes a short (series
        resonance) and a short stub becomes an open (parallel resonance).
      </p>
      <h2>Single-stub shunt matching</h2>
      <p>
        A shunt stub is placed at the distance d from the load where the line admittance is Y0 + jB, and cancels jB (Pozar §5.2). With t = tan βd and ZL = RL + jXL on a line of
        impedance Z0:
      </p>
      <div className="eq">
        <span className="no">(8)</span>
        <i>t</i> = [<i>X</i>
        <sub>L</sub> ± √(<i>R</i>
        <sub>L</sub>((<i>Z</i>
        <sub>0</sub> − <i>R</i>
        <sub>L</sub>)² + <i>X</i>
        <sub>L</sub>²)/<i>Z</i>
        <sub>0</sub>)] / (<i>R</i>
        <sub>L</sub> − <i>Z</i>
        <sub>0</sub>), or <i>t</i> = −<i>X</i>
        <sub>L</sub>/2<i>Z</i>
        <sub>0</sub> when <i>R</i>
        <sub>L</sub> = <i>Z</i>
        <sub>0</sub>
      </div>
      <p>
        d/λ = tan⁻¹(t)/2π, plus ½ when t &lt; 0. The susceptance B at d is computed from equation (1), and the stub length follows from jY0s tan βl = −jB (open) or −jY0s cot βl = −jB
        (short), where Y0s is the stub admittance, which may differ from the line's. Each solution is checked by computing the input impedance. For the sweep, the load is its resistance in
        series with the L or C that gives XL at f0.
      </p>
      <h3>Limits</h3>
      <p>
        Lines are lossless and dispersion-free and junctions are ideal. Real step discontinuities, T-junctions, open-end fringing (which makes an open stub electrically longer) and the via
        inductance of a short stub shift the response; check the final layout with an EM simulator.
      </p>
      <Sources items={SOURCES} />
    </>
  );
}
