import { useMemo, useState } from 'react';
import { SiField } from '../components/SiField';
import { SmithChart, type SmithMarker, type SmithTrace } from '../components/SmithChart';
import { Sources } from '../components/Sources';
import { ToolPage } from '../components/ToolPage';
import { Check, Notes, NumField, Panel, Result, Section, SelectField } from '../components/ui';
import type { DataSource } from '../data/source';
import type { ESeries } from '../lib/electronics';
import {
  bandAround, cAbs, cx, lNetworks, logSweep, networkGamma, networkName, returnLoss, smithPath, smithPoint, standardNetwork, type Band, type Cx, type LSolution, type Network, type Part, type StdNetwork,
} from '../lib/matching';
import { fmt, si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { f: 1e9, rs: 50, xs: 0, rl: 10, xl: -30, series: 'E24', rlMin: 10, sel: 0, adm: false };

/** One colour per solution, in a fixed order; solutions are also numbered on the chart and in the table. */
const COLORS = ['var(--accent)', 'var(--copper)', '#9a62c8', 'var(--ok)'];
const FLOOR_DB = -60;

const ohms = (z: Cx, sig = 4) => `${fmt(z.re, sig)} ${z.im < 0 ? '−' : '+'} j${fmt(Math.abs(z.im), sig)} Ω`;
const partText = (p: Part, sig = 4) => (p.kind === 'L' ? si(p.value, 'H', sig) : p.kind === 'C' ? si(p.value, 'F', sig) : '—');
const dbText = (v: number) => (v === Infinity ? '∞ dB' : `${fmt(v, 3)} dB`);
/** Return loss read from a clamped 20 log|Γ| curve. */
const rlText = (db: number) => (db <= FLOOR_DB ? `≥ ${-FLOOR_DB} dB` : dbText(-db));
const bandText = (b: Band | null, f0: number) => {
  if (!b) return 'not met at f0';
  if (b.lo === null || b.hi === null) return `${b.lo === null ? `below ${si(f0 / 100, 'Hz', 3)}` : si(b.lo, 'Hz', 4)} – ${b.hi === null ? `above ${si(f0 * 100, 'Hz', 3)}` : si(b.hi, 'Hz', 4)}`;
  return `${si(b.lo, 'Hz', 4)} – ${si(b.hi, 'Hz', 4)}`;
};
const fracText = (b: Band | null, f0: number) => (b && b.lo !== null && b.hi !== null ? `${fmt(((b.hi - b.lo) / f0) * 100, 3)} %` : '—');

interface Row {
  s: LSolution;
  std: StdNetwork;
  band: Band | null;
  stdBand: Band | null;
}

export default function ImpedanceMatching() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const series = (['E12', 'E24', 'E96'].includes(p.series) ? p.series : 'E24') as ESeries;

  const errors: string[] = [];
  if (!(p.f > 0 && p.f < 1e13)) errors.push('Frequency must be greater than 0.');
  if (!(p.rs > 0)) errors.push('Source resistance Rs must be greater than 0.');
  if (!Number.isFinite(p.xs) || !Number.isFinite(p.xl)) errors.push('Reactances must be numbers.');
  if (!(p.rl >= 0)) errors.push('Load resistance RL cannot be negative.');
  if (!(p.rlMin >= 1 && p.rlMin <= 60)) errors.push('The return-loss limit must be between 1 and 60 dB.');
  const ok = errors.length === 0;

  const res = useMemo(() => (ok ? lNetworks(p.f, cx(p.rs, p.xs), cx(p.rl, p.xl)) : null), [ok, p.f, p.rs, p.xs, p.rl, p.xl]);

  const rows: Row[] = useMemo(() => {
    if (!res) return [];
    const zs = cx(p.rs, p.xs), zl = cx(p.rl, p.xl);
    return res.solutions.map((s) => {
      const std = standardNetwork(s, series, zs, zl, p.f);
      const rlOf = (n: Network) => (f: number) => returnLoss(networkGamma(n, zs, zl, p.f, f));
      return { s, std, band: bandAround(rlOf(s), p.f, p.rlMin), stdBand: bandAround(rlOf(std), p.f, p.rlMin) };
    });
  }, [res, series, p.f, p.rs, p.xs, p.rl, p.xl, p.rlMin]);

  const sel = rows.length ? Math.min(Math.max(0, Math.round(p.sel)), rows.length - 1) : 0;
  const row = rows[sel] as Row | undefined;
  const trivial = rows.length > 0 && rows.every((r) => r.s.series.kind === 'none' && r.s.shunt.kind === 'none');

  const notes: string[] = [];
  if (res?.reason) errors.push(res.reason);
  if (res?.matched) notes.push('The load already equals the conjugate of the source impedance, so no matching network is needed.');
  if (p.xs !== 0) notes.push(`The source is complex, so the network presents its conjugate, ${ohms(cx(p.rs, -p.xs))}, and the Smith chart ends on that point rather than the centre.`);
  if (rows.some((r) => r.s.qNode > 10)) notes.push('A node Q above about 10 makes the match narrow-band and sensitive to component tolerance and parasitics.');

  const properties = (
    <>
      <Section title="Design">
        <SiField label="Frequency" symbol="f0" value={p.f} onChange={(v) => set({ f: v })} unit="Hz" prefixes={['k', 'M', 'G']} />
      </Section>
      <Section title="Source impedance">
        <NumField label="Resistance" symbol="Rs" value={p.rs} onChange={(v) => set({ rs: v })} unit="Ω" />
        <NumField label="Reactance" symbol="Xs" value={p.xs} onChange={(v) => set({ xs: v })} unit="Ω" allowNegative hint="Positive for inductive, negative for capacitive." />
      </Section>
      <Section title="Load impedance">
        <NumField label="Resistance" symbol="RL" value={p.rl} onChange={(v) => set({ rl: v })} unit="Ω" allowZero />
        <NumField label="Reactance" symbol="XL" value={p.xl} onChange={(v) => set({ xl: v })} unit="Ω" allowNegative hint="Positive for inductive, negative for capacitive." />
        <p className="text-faint">Both impedances are values at f0. For the sweep they are modelled as R in series with the L or C that gives X at f0.</p>
      </Section>
      <Section title="Components">
        <SelectField
          label="Standard values"
          value={series}
          onChange={(v) => set({ series: v })}
          options={[
            { value: 'E12', label: 'E12' },
            { value: 'E24', label: 'E24' },
            { value: 'E96', label: 'E96' },
          ]}
        />
        <NumField label="Return-loss limit" symbol="RL" value={p.rlMin} onChange={(v) => set({ rlMin: v })} unit="dB" hint="Bandwidth is the band around f0 where the return loss is at least this value. 10 dB ≈ VSWR 1.92, 20 dB ≈ VSWR 1.22." />
      </Section>
      <Section title="Smith chart">
        <Check label="Show admittance grid" checked={p.adm} onChange={(v) => set({ adm: v })} />
      </Section>
    </>
  );

  const status = !ok || !res ? 'Check the inputs' : rows.length === 0 ? 'No L-network solution' : trivial ? 'Already matched' : `${rows.length} network${rows.length > 1 ? 's' : ''} · ${networkName(rows[sel].s)}`;

  return (
    <ToolPage
      title="L-Network Impedance Matching & Smith Chart"
      description="Two-element L-section matching networks between a source and a complex load: every low-pass and high-pass solution with component values, node Q, swept return loss and bandwidth, nearest standard values and the path on a Smith chart."
      onReset={reset}
      properties={properties}
      status={status}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      <Notes items={notes} />
      {ok && rows.length > 0 && !trivial && (
        <>
          <Panel title="Matching networks">
            <table className="tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Network</th>
                  <th>Next to the load</th>
                  <th className="v">Series</th>
                  <th className="v">Shunt</th>
                  <th className="v">Node Q</th>
                  <th className="v">Band, RL ≥ {fmt(p.rlMin, 3)} dB</th>
                  <th className="v">{series} values</th>
                  <th className="v">RL at f0 ({series})</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={i === sel ? 'bg-sel' : 'cursor-pointer hover:bg-hover'} onClick={() => set({ sel: i })}>
                    <td>
                      <button type="button" className="font-semibold" style={{ color: COLORS[i] }} aria-pressed={i === sel} aria-label={`Show network ${i + 1}`} onClick={() => set({ sel: i })}>
                        {i + 1}
                      </button>
                    </td>
                    <td>{networkName(r.s)}</td>
                    <td>{r.s.series.kind === 'none' || r.s.shunt.kind === 'none' ? '—' : r.s.topology === 'shunt-load' ? 'shunt' : 'series'}</td>
                    <td className="v">{r.s.series.kind === 'none' ? '—' : `${r.s.series.kind} ${partText(r.s.series)}`}</td>
                    <td className="v">{r.s.shunt.kind === 'none' ? '—' : `${r.s.shunt.kind} ${partText(r.s.shunt)}`}</td>
                    <td className="v">{fmt(r.s.qNode, 3)}</td>
                    <td className="v">{fracText(r.band, p.f)}</td>
                    <td className="v">{[r.std.series, r.std.shunt].filter((x) => x.kind !== 'none').map((x) => `${x.kind} ${partText(x, 3)}`).join(', ')}</td>
                    <td className="v">{dbText(r.std.rl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-2 text-faint">Select a row to show that network on the Smith chart and in the details. Band is the swept bandwidth of the ideal network as a share of f0.</p>
          </Panel>
          <div className="grid gap-3 xl:grid-cols-2">
            <Panel title="Smith chart">
              <div className="px-3 py-2">
                <Chart rows={rows} sel={sel} zl={cx(p.rl, p.xl)} zs={cx(p.rs, p.xs)} admittance={p.adm} />
                <p className="text-faint">
                  Normalised to Rs = {si(p.rs, 'Ω', 4)}. Square: load. Ring: Zs* (the centre for a real source). Dots: the node between the two parts. A series part moves along a constant-r
                  circle, a shunt part along a constant-g circle{p.adm ? ' (dashed admittance grid)' : ''}.
                </p>
              </div>
            </Panel>
            {row && (
              <Panel title={`Network ${sel + 1}: ${networkName(row.s)}`}>
                <Schematic n={row.s} />
                <table className="tbl">
                  <tbody>
                    {row.s.series.kind !== 'none' && <Result label={`Series ${row.s.series.kind}`} value={partText(row.s.series, 5)} strong sub={`X = ${fmt(row.s.x, 5)} Ω at f0`} />}
                    {row.s.shunt.kind !== 'none' && <Result label={`Shunt ${row.s.shunt.kind}`} value={partText(row.s.shunt, 5)} strong sub={`B = ${si(row.s.b, 'S', 5)} at f0`} />}
                    <Result label="Node impedance" value={ohms(row.s.zMid)} sub="between the two parts, looking towards the load" />
                    <Result label="Node Q" value={fmt(row.s.qNode, 4)} sub={`largest |X|/R on the path; middle node ${fmt(row.s.qMid, 4)}`} />
                    <Result label={`Band, RL ≥ ${fmt(p.rlMin, 3)} dB`} value={bandText(row.band, p.f)} sub={`ideal parts, ${fracText(row.band, p.f)} of f0`} />
                    <Result
                      label={`With ${series} values`}
                      value={[row.std.series, row.std.shunt].filter((x) => x.kind !== 'none').map((x) => `${x.kind} ${partText(x, 3)}`).join(', ')}
                      sub="best of the values just below and above each part"
                    />
                    <Result label={`Return loss at f0 (${series})`} value={dbText(row.std.rl)} sub={`|Γ| = ${fmt(10 ** (-row.std.rl / 20), 3)}`} />
                    <Result label={`Band with ${series} values`} value={bandText(row.stdBand, p.f)} />
                  </tbody>
                </table>
              </Panel>
            )}
          </div>
          <Panel title="Return loss versus frequency">
            <Sweep rows={rows} sel={sel} f0={p.f} zs={cx(p.rs, p.xs)} zl={cx(p.rl, p.xl)} rlMin={p.rlMin} series={series} />
          </Panel>
        </>
      )}
    </ToolPage>
  );
}

function Chart({ rows, sel, zl, zs, admittance }: { rows: Row[]; sel: number; zl: Cx; zs: Cx; admittance: boolean }) {
  const zRef = zs.re;
  const traces: SmithTrace[] = [];
  const markers: SmithMarker[] = [];
  rows.forEach((r, i) => {
    if (i === sel) return;
    for (const arc of smithPath(r.s, zl, zRef)) traces.push({ points: arc, color: COLORS[i], width: 1.5, opacity: 0.55 });
  });
  const r = rows[sel];
  if (r) for (const arc of smithPath(r.s, zl, zRef)) traces.push({ points: arc, color: COLORS[sel], width: 3 });
  rows.forEach((x, i) => {
    if (x.s.series.kind !== 'none' && x.s.shunt.kind !== 'none') markers.push({ g: smithPoint(x.s.zMid, zRef), color: COLORS[i], label: String(i + 1), title: `Network ${i + 1} node: ${ohms(x.s.zMid)}` });
  });
  markers.push({ g: smithPoint(zl, zRef), color: 'var(--ink)', shape: 'square', label: 'ZL', title: `Load ${ohms(zl)}` });
  markers.push({ g: smithPoint(cx(zs.re, -zs.im), zRef), color: 'var(--ink)', shape: 'ring', label: zs.im === 0 ? undefined : 'Zs*', title: `Zs* = ${ohms(cx(zs.re, -zs.im))}` });
  return <SmithChart traces={traces} markers={markers} admittance={admittance} label="Smith chart with the load, the path of each matching network and the matched point" />;
}

/** Ladder drawing of the selected network: source on the left, load on the right. */
function Schematic({ n }: { n: Network }) {
  const y = 40, gy = 110;
  const hasSer = n.series.kind !== 'none', hasSh = n.shunt.kind !== 'none';
  // series part between 150 and 210; shunt branch at x = 250 (next to the load) or x = 110 (next to the source)
  const shX = n.topology === 'shunt-load' ? 250 : 110;
  const serX = 150;
  const serLabel = `${n.series.kind} ${partText(n.series, 3)}`;
  const shLabel = `${n.shunt.kind} ${partText(n.shunt, 3)}`;
  const coilH = (x: number) => `M${x} ${y}a5 5 0 0 1 10 0a5 5 0 0 1 10 0a5 5 0 0 1 10 0a5 5 0 0 1 10 0`;
  const coilV = (x: number, y0: number) => `M${x} ${y0}a5 5 0 0 1 0 10a5 5 0 0 1 0 10a5 5 0 0 1 0 10a5 5 0 0 1 0 10`;
  return (
    <svg viewBox="0 0 360 140" className="block h-auto w-full max-w-[460px]" role="img" aria-label={`Schematic: ${networkName(n)}`}>
      <g fill="none" stroke="var(--ink)" strokeWidth={1.5}>
        {/* source */}
        <circle cx={30} cy={75} r={14} />
        <path d={`M30 61V${y}H${serX} M30 89V${gy}H330 M${serX + 40} ${y}H330 M330 ${y}V58 M330 92V${gy}`} />
        <rect x={322} y={58} width={16} height={34} />
        {hasSer ? n.series.kind === 'L' ? <path d={coilH(serX)} /> : <path d={`M${serX} ${y}H${serX + 16} M${serX + 16} ${y - 12}V${y + 12} M${serX + 24} ${y - 12}V${y + 12} M${serX + 24} ${y}H${serX + 40}`} /> : <path d={`M${serX} ${y}H${serX + 40}`} />}
        {hasSh && (
          <>
            <path d={`M${shX} ${y}V55 M${shX} 95V${gy}`} />
            {n.shunt.kind === 'L' ? <path d={coilV(shX, 55)} /> : <path d={`M${shX} 55V71 M${shX - 12} 71H${shX + 12} M${shX - 12} 79H${shX + 12} M${shX} 79V95`} />}
          </>
        )}
        <path d={`M180 ${gy}V118 M170 118H190 M174 122H186 M178 126H182`} />
      </g>
      <g fill="var(--accent)">{hasSh && <circle cx={shX} cy={y} r={3} />}</g>
      <g fontSize={11} fill="var(--muted)">
        <text x={30} y={20} textAnchor="middle">Source</text>
        <text x={330} y={20} textAnchor="middle">Load</text>
        {hasSer && <text x={serX + 20} y={20} textAnchor="middle" fill="var(--ink)">{serLabel}</text>}
        {hasSh && <text x={shX + 18} y={78} fill="var(--ink)">{shLabel}</text>}
      </g>
    </svg>
  );
}

function Sweep({ rows, sel, f0, zs, zl, rlMin, series }: { rows: Row[]; sel: number; f0: number; zs: Cx; zl: Cx; rlMin: number; series: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const data = useMemo(() => {
    // span: about twice the widest band, from ±25 % up to a decade either side
    let w = 1;
    for (const r of rows) {
      const b = r.band;
      w = Math.max(w, b && b.hi !== null ? b.hi / f0 : 100, b && b.lo !== null ? f0 / b.lo : 100);
    }
    const k = Math.min(10, Math.max(1.25, w * w));
    const fs = logSweep(f0 / k, f0 * k, 401, f0);
    const db = (n: Network) => fs.map((f) => Math.max(FLOOR_DB, -returnLoss(cAbs(networkGamma(n, zs, zl, f0, f)))));
    return { fs, k, curves: rows.map((r) => ({ ideal: db(r.s), std: db(r.std) })) };
  }, [rows, f0, zs.re, zs.im, zl.re, zl.im]); // eslint-disable-line react-hooks/exhaustive-deps

  const W = 640, H = 280, ml = 50, mr = 30, mt = 14, mb = 34;
  const la = Math.log10(f0 / data.k), lb = Math.log10(f0 * data.k);
  const X = (f: number) => ml + ((Math.log10(f) - la) / (lb - la)) * (W - ml - mr);
  const Y = (db: number) => mt + (-db / -FLOOR_DB) * (H - mt - mb);
  const path = (v: number[]) => v.map((d, i) => `${i ? 'L' : 'M'}${X(data.fs[i]).toFixed(1)},${Y(d).toFixed(1)}`).join(' ');
  const xticks = [f0 / data.k, f0 / Math.sqrt(data.k), f0, f0 * Math.sqrt(data.k), f0 * data.k];
  const yticks = [0, -10, -20, -30, -40, -50, -60];
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    if (x < ml || x > W - mr) return setHover(null);
    const f = 10 ** (la + ((x - ml) / (W - ml - mr)) * (lb - la));
    let best = 0;
    for (let i = 1; i < data.fs.length; i++) if (Math.abs(data.fs[i] - f) < Math.abs(data.fs[best] - f)) best = i;
    setHover(best);
  };
  const hi = hover ?? data.fs.indexOf(f0);
  return (
    <div className="px-2 pt-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full max-w-[740px]" role="img" aria-label="Reflection in dB versus frequency for each network" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {yticks.map((d) => (
          <g key={d}>
            <line x1={ml} x2={W - mr} y1={Y(d)} y2={Y(d)} stroke="var(--line)" />
            <text x={ml - 6} y={Y(d) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{d}</text>
          </g>
        ))}
        {xticks.map((f) => (
          <g key={f}>
            <line x1={X(f)} x2={X(f)} y1={mt} y2={H - mb} stroke="var(--line)" />
            <text x={X(f)} y={H - mb + 15} textAnchor="middle" fontSize={11} fill="var(--muted)">{si(f, 'Hz', 3)}</text>
          </g>
        ))}
        <line x1={ml} x2={W - mr} y1={Y(-rlMin)} y2={Y(-rlMin)} stroke="var(--err-line)" strokeDasharray="6 3" />
        <g fill="none" strokeWidth={2} strokeLinejoin="round">
          {data.curves.map((c, i) => (
            <g key={i} opacity={i === sel ? 1 : 0.5}>
              <path d={path(c.ideal)} stroke={COLORS[i]} strokeWidth={i === sel ? 2.2 : 1.5} />
              <path d={path(c.std)} stroke={COLORS[i]} strokeWidth={i === sel ? 2.2 : 1.5} strokeDasharray="5 4" />
            </g>
          ))}
        </g>
        {hi >= 0 && <line x1={X(data.fs[hi])} x2={X(data.fs[hi])} y1={mt} y2={H - mb} stroke="var(--ink)" strokeDasharray="2 3" opacity={0.6} />}
        <rect x={ml} y={mt} width={W - ml - mr} height={H - mt - mb} fill="none" stroke="var(--line)" />
        <text x={(ml + W - mr) / 2} y={H - 3} textAnchor="middle" fontSize={11} fill="var(--muted)">Frequency</text>
        <text x={12} y={(mt + H - mb) / 2} transform={`rotate(-90 12 ${(mt + H - mb) / 2})`} textAnchor="middle" fontSize={11} fill="var(--muted)">20 log|Γ| (dB)</text>
      </svg>
      <div className="flex flex-wrap gap-x-5 gap-y-1 px-2 pb-2 text-muted">
        <span className="font-semibold text-ink">Return loss at {si(data.fs[hi] ?? f0, 'Hz', 4)}</span>
        {data.curves.map((c, i) => (
          <span key={i}>
            <span className="inline-block h-[3px] w-4 align-middle" style={{ background: COLORS[i] }} /> {i + 1}: {rlText(c.ideal[hi])} ideal, {rlText(c.std[hi])} {series}
          </span>
        ))}
      </div>
      <p className="px-2 pb-2 text-faint">Solid: ideal parts. Dashed: nearest {series} values. Red dashed line: the {fmt(rlMin, 3)} dB return-loss limit. The plot floor is {-FLOOR_DB} dB.</p>
    </div>
  );
}

const SOURCES: DataSource[] = [
  {
    title: 'D. M. Pozar, Microwave Engineering, 4th ed., Wiley, 2012',
    url: 'https://openlibrary.org/isbn/9780470631553',
    note: '§2.4 (Smith chart, Γ = (z − 1)/(z + 1)), §5.1 (L-section matching, eqs. for Fig. 5.2a and 5.2b, Example 5.1 used in the tests), §5.9 (Bode–Fano limit).',
  },
  {
    title: 'K. Kurokawa, “Power Waves and the Scattering Matrix”, IEEE Trans. Microwave Theory Tech., vol. 13, no. 2, pp. 194–202, 1965',
    url: 'https://doi.org/10.1109/TMTT.1965.1125964',
    note: 'Power-wave reflection coefficient (Z − Zs*)/(Z + Zs) for a complex source impedance.',
  },
  {
    title: 'R. Ludwig, G. Bogdanov, RF Circuit Design: Theory and Applications, 2nd ed., Pearson Prentice Hall, 2009',
    url: 'https://openlibrary.org/isbn/9780131471375',
    note: '§8.1 (two-component matching networks, node quality factor Qn = |X|/R and the relation QL = Qn/2 for L-sections).',
  },
];

export function Method() {
  return (
    <>
      <h2>Problem</h2>
      <p>
        A lossless two-element network transfers all the available power from a source Zs = Rs + jXs to a load ZL = RL + jXL when its input impedance, with the load connected, is the
        complex conjugate of the source impedance:
      </p>
      <div className="eq">
        <span className="no">(1)</span>
        <i>Z</i>
        <sub>in</sub> = <i>Z</i>
        <sub>s</sub>* = <i>R</i>
        <sub>s</sub> − j<i>X</i>
        <sub>s</sub>
      </div>
      <p>For a real source (Xs = 0) this is Pozar's L-section problem of matching ZL to a line of impedance Z0 = Rs. The load must have some resistance; a purely reactive load cannot absorb power, so it cannot be matched.</p>
      <h2>Two topologies</h2>
      <p>
        <b>Shunt part next to the load</b> (Pozar Fig. 5.2a). The shunt susceptance B moves the load admittance YL = GL + jBL until the real part of its inverse equals Rs, then the series
        reactance X cancels what is left:
      </p>
      <div className="eq">
        <span className="no">(2)</span>
        <i>B</i> = −<i>B</i>
        <sub>L</sub> ± √(<i>G</i>
        <sub>L</sub>/<i>R</i>
        <sub>s</sub> − <i>G</i>
        <sub>L</sub>²), <i>X</i> = −<i>X</i>
        <sub>s</sub> − Im[1/(<i>Y</i>
        <sub>L</sub> + j<i>B</i>)]
      </div>
      <p>
        It exists when GL·Rs ≤ 1. <b>Series part next to the load</b> (Pozar Fig. 5.2b). With the target admittance Yt = 1/Zs* = Gt + jBt, the series reactance moves the load until the
        real part of its admittance equals Gt, then the shunt part adds the missing susceptance:
      </p>
      <div className="eq">
        <span className="no">(3)</span>
        <i>X</i> = −<i>X</i>
        <sub>L</sub> ± √(<i>R</i>
        <sub>L</sub>/<i>G</i>
        <sub>t</sub> − <i>R</i>
        <sub>L</sub>²), <i>B</i> = <i>B</i>
        <sub>t</sub> − Im[1/(<i>Z</i>
        <sub>L</sub> + j<i>X</i>)]
      </div>
      <p>
        It exists when RL·Gt ≤ 1. With a real source these reduce to Pozar's equations: the first case is the load inside the r = 1 (1 + jx) circle, or outside it with enough reactance that
        its conductance is below 1/Z0; the second is RL &lt; Z0. When both apply there are four networks, otherwise two. When a square root is zero, or a part comes out as zero, the
        network has one part (for example RL = Rs only needs the load reactance cancelled) and duplicates are dropped. Each result is checked by computing Zin from the parts.
      </p>
      <h2>Component values</h2>
      <p>
        At ω = 2π<i>f</i>
        <sub>0</sub>, a positive series reactance is an inductor L = X/ω and a negative one a capacitor C = −1/(ωX). A positive shunt susceptance is a capacitor C = B/ω and a negative one an
        inductor L = −1/(ωB). A series inductor with a shunt capacitor is a low-pass network; a series capacitor with a shunt inductor is a high-pass network. The low-pass form helps with
        harmonic suppression; the high-pass form also blocks DC.
      </p>
      <h2>Q and bandwidth</h2>
      <p>
        The node quality factor is Qn = |X|/R of the impedance at a node of the network. The page reports the largest Qn of the load, the node between the two parts and the input. For
        resistive terminations it is set by the impedance ratio alone:
      </p>
      <div className="eq">
        <span className="no">(4)</span>
        <i>Q</i>
        <sub>n</sub> = √(<i>R</i>
        <sub>high</sub>/<i>R</i>
        <sub>low</sub> − 1)
      </div>
      <p>
        Ludwig and Bogdanov give the loaded Q of an L-section as Qn/2, so the half-power bandwidth is roughly 2<i>f</i>
        <sub>0</sub>/Qn. The reported bandwidth does not rely on that estimate: it is the band around f0 where the swept return loss stays at or above the chosen limit, found by stepping
        outwards from f0 and refining each edge by bisection. Higher Q means a narrower band; the Bode–Fano criterion (Pozar §5.9) limits how much any network can widen it for a reactive
        load.
      </p>
      <h2>Frequency sweep</h2>
      <p>
        The sweep uses ideal, lossless parts. The source and load impedances entered at f0 are modelled as their resistance in series with the inductor or capacitor that has the entered
        reactance at f0, so their reactance changes with frequency. The plotted quantity is the power-wave reflection coefficient at the source:
      </p>
      <div className="eq">
        <span className="no">(5)</span>Γ = (<i>Z</i>
        <sub>in</sub> − <i>Z</i>
        <sub>s</sub>*) / (<i>Z</i>
        <sub>in</sub> + <i>Z</i>
        <sub>s</sub>), RL = −20 log₁₀|Γ|
      </div>
      <p>1 − |Γ|² is the fraction of the available power that reaches the load. For a real source this is the ordinary reflection coefficient.</p>
      <h2>Standard values</h2>
      <p>
        Each part is rounded to the series value just below and just above it (IEC 60063 E12, E24 or E96), and of the up to four combinations the one with the highest return loss at f0 is
        shown. Inductors are commonly sold in E12 or E24 steps; small RF capacitors in E24 steps or finer.
      </p>
      <h2>Smith chart</h2>
      <p>
        The chart is normalised to Rs: z = Z/Rs and Γ = (z − 1)/(z + 1). With a real source the matched point is the centre. With a complex source it is z = 1 − jXs/Rs, still on the r = 1
        circle, and is marked with a ring. A series reactance moves the point along a circle of constant resistance; a shunt susceptance moves it along a circle of constant conductance
        (the admittance grid is the impedance grid rotated by 180°). The arcs are computed point by point from the actual part values.
      </p>
      <h3>Limits</h3>
      <p>
        Real parts have loss, self-resonance, pad and via parasitics and tolerance; above a few hundred megahertz a chip inductor or capacitor can differ noticeably from its nominal value.
        Check the selected parts with their S-parameter models, and keep each part's self-resonant frequency well above f0. A high-Q network is more sensitive to all of this.
      </p>
      <Sources items={SOURCES} />
    </>
  );
}
