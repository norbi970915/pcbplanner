import { useMemo, useState } from 'react';
import { ToolPage } from '../components/ToolPage';
import { Big, LenField, Notes, NumField, Panel, Result, Section, SelectField } from '../components/ui';
import { K_CU } from '../lib/copper';
import { spread, type Orientation, type SpreadInput } from '../lib/spreading';
import { fmt, MM_PER_OZ } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { p: 1, ta: 40, tj: 125, jb: 12, src: 5, pour: 25.4, t: 2 * MM_PER_OZ, n: 1, orient: 'horizontal', air: 'natural', h: 25, eps: 0.9 };

export default function CopperSpreading() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const errors: string[] = [];
  if (!(p.p > 0)) errors.push('Power must be greater than 0.');
  if (!(p.jb >= 0)) errors.push('θJB cannot be negative.');
  if (!(p.src > 0)) errors.push('Heat-source size must be greater than 0.');
  if (!(p.pour >= p.src)) errors.push('The copper pour must be at least as large as the heat source.');
  if (!(p.pour <= 1000)) errors.push('Copper pour must be at most 1000 mm.');
  if (!(p.t > 0)) errors.push('Copper thickness must be greater than 0.');
  if (!(Number.isInteger(p.n) && p.n >= 1 && p.n <= 32)) errors.push('Connected copper layers must be a whole number from 1 to 32.');
  if (!(p.eps >= 0 && p.eps <= 1)) errors.push('Emissivity must be between 0 and 1.');
  if (p.air === 'forced' && !(p.h > 0)) errors.push('The heat-transfer coefficient must be greater than 0.');
  if (!(p.tj > p.ta)) errors.push('Tj,max must be above the ambient temperature.');

  const base = (pourMm: number): SpreadInput => ({
    power: p.p,
    taC: p.ta,
    sourceSide: p.src * 1e-3,
    pourSide: pourMm * 1e-3,
    copperT: p.t * 1e-3,
    layers: p.n,
    kCu: K_CU,
    emissivity: p.eps,
    orient: p.orient as Orientation,
    hForced: p.air === 'forced' ? p.h : undefined,
  });
  const ok = errors.length === 0;
  const r = ok ? spread(base(p.pour)) : null;
  const tj = r ? r.tBoard + p.p * p.jb : NaN;

  // smallest square pour that keeps Tj ≤ Tj,max (θ falls monotonically with the pour size)
  const needed = useMemo(() => {
    if (!ok) return null;
    const tjAt = (s: number) => spread(base(s)).tBoard + p.p * p.jb;
    if (tjAt(p.src) <= p.tj) return p.src;
    let hi = Math.max(p.pour, p.src * 2);
    while (tjAt(hi) > p.tj && hi < 1000) hi *= 1.6;
    if (tjAt(Math.min(hi, 1000)) > p.tj) return Infinity;
    let lo = p.src;
    for (let i = 0; i < 50; i++) {
      const mid = Math.sqrt(lo * hi);
      if (tjAt(mid) > p.tj) lo = mid;
      else hi = mid;
    }
    return hi;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ok, JSON.stringify(p)]);

  const sweep = useMemo(() => {
    if (!ok) return [];
    const top = Math.max(p.pour * 2, 60, needed && Number.isFinite(needed) ? needed * 1.3 : 0);
    const pts: { s: number; theta: number; tj: number }[] = [];
    for (let i = 0; i <= 60; i++) {
      const s = p.src * (top / p.src) ** (i / 60);
      const q = spread(base(s));
      pts.push({ s, theta: q.theta, tj: q.tBoard + p.p * p.jb });
    }
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ok, JSON.stringify(p), needed]);

  const notes: string[] = [];
  if (r && tj > p.tj) notes.push(`The junction reaches ${fmt(tj, 4)} °C, above Tj,max. ${needed && Number.isFinite(needed) ? `A pour of about ${fmt(needed, 3)} × ${fmt(needed, 3)} mm is needed` : 'No copper pour alone is enough'}: add copper layers with thermal vias, airflow or a heatsink.`);
  if (r && r.efficiency < 0.5) notes.push(`Fin efficiency ${fmt(100 * r.efficiency, 3)} %: the outer copper is much cooler than the part and adds little. Thicker copper or more connected layers help more than a wider pour.`);

  const properties = (
    <>
      <Section title="Component">
        <NumField label="Power dissipation" symbol="P" value={p.p} onChange={(v) => set({ p: v })} unit="W" />
        <NumField label="Junction to board" symbol="θJB" value={p.jb} onChange={(v) => set({ jb: v })} unit="°C/W" allowZero hint="From the datasheet: θJB, or θJC(bottom) for parts with an exposed pad." />
        <LenField label="Heat-source footprint" value={p.src} onChange={(v) => set({ src: v })} units={['mm', 'mil', 'in']} hint="Side of a square with the area of the exposed pad or tab soldered to the copper." />
        <NumField label="Ambient temperature" symbol="Ta" value={p.ta} onChange={(v) => set({ ta: v })} unit="°C" allowNegative />
        <NumField label="Max. junction temp." symbol="Tj,max" value={p.tj} onChange={(v) => set({ tj: v })} unit="°C" />
      </Section>
      <Section title="Copper">
        <LenField label="Copper pour (square side)" value={p.pour} onChange={(v) => set({ pour: v })} units={['mm', 'in', 'mil']} />
        <LenField label="Copper thickness" symbol="T" value={p.t} onChange={(v) => set({ t: v })} units={['oz', 'um', 'mil', 'mm']} />
        <NumField label="Connected copper layers" value={p.n} onChange={(v) => set({ n: v })} hint="Layers of the same pour size tied together with enough thermal vias to share the heat." />
      </Section>
      <Section title="Cooling">
        <SelectField
          label="Air"
          value={p.air as 'natural' | 'forced'}
          onChange={(v) => set({ air: v })}
          options={[
            { value: 'natural', label: 'Still air (natural)' },
            { value: 'forced', label: 'Forced air (enter h)' },
          ]}
        />
        {p.air === 'natural' ? (
          <SelectField
            label="Board orientation"
            value={p.orient as Orientation}
            onChange={(v) => set({ orient: v })}
            options={[
              { value: 'horizontal', label: 'Horizontal' },
              { value: 'vertical', label: 'Vertical' },
            ]}
          />
        ) : (
          <NumField label="Convection coefficient" symbol="h" value={p.h} onChange={(v) => set({ h: v })} unit="W/m²K" hint="Per face. Roughly 20–60 W/m²K for 1–3 m/s airflow over a board." />
        )}
        <NumField label="Surface emissivity" symbol="ε" value={p.eps} onChange={(v) => set({ eps: v })} allowZero hint="Solder mask ≈ 0.9; bare shiny copper ≈ 0.05." />
      </Section>
    </>
  );

  return (
    <ToolPage
      title="Copper Area for Heat Spreading"
      description="How much PCB copper a hot component needs: thermal resistance of a copper pour to ambient by still-air convection and radiation, junction temperature, the smallest pour for a Tj limit, and the effect of thicker copper and extra layers."
      onReset={reset}
      properties={properties}
      status={r ? `θ(board→air) = ${fmt(r.theta, 4)} °C/W · Tj = ${fmt(tj, 4)} °C · fin efficiency ${fmt(100 * r.efficiency, 3)} %` : 'Check the inputs'}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      <Notes items={notes} />
      {r && (
        <div className="grid gap-3 xl:grid-cols-2">
          <Panel title="Results">
            <div className="flex flex-wrap gap-8 px-2.5 py-2">
              <Big label="Junction temperature" value={fmt(tj, 4)} unit="°C" />
              <Big label="Copper to ambient" value={fmt(r.theta, 4)} unit="°C/W" />
            </div>
            <table className="tbl">
              <tbody>
                <Result label="Board temperature under the part" value={fmt(r.tBoard, 4)} unit="°C" />
                <Result label="Total θJA (θJB + copper)" value={fmt(p.jb + r.theta, 4)} unit="°C/W" strong />
                <Result
                  label="Smallest pour for Tj,max"
                  value={needed === null ? '—' : Number.isFinite(needed) ? `${fmt(needed, 3)} × ${fmt(needed, 3)}` : 'not reachable'}
                  unit={needed !== null && Number.isFinite(needed) ? 'mm' : ''}
                  sub={needed !== null && Number.isFinite(needed) ? `${fmt((needed / 25.4) ** 2, 3)} in²` : 'up to 1 m square'}
                />
                <Result label="Fin efficiency" value={`${fmt(100 * r.efficiency, 3)} %`} sub="how evenly the copper is heated (100 % = all at the part's temperature)" />
                <Result label="Convection coefficient" value={fmt(r.hConv, 3)} unit="W/m²K" sub={p.air === 'natural' ? 'per face, averaged over top and bottom' : 'per face, entered'} />
                <Result label="Radiation coefficient" value={fmt(r.hRad, 3)} unit="W/m²K" />
              </tbody>
            </table>
          </Panel>
          <Panel title="Junction Temperature vs. Copper Pour Size">
            <SweepPlot pts={sweep} tjMax={p.tj} mark={p.pour} />
          </Panel>
        </div>
      )}
    </ToolPage>
  );
}

function SweepPlot({ pts, tjMax, mark }: { pts: { s: number; theta: number; tj: number }[]; tjMax: number; mark: number }) {
  const [hover, setHover] = useState<number | null>(null);
  if (pts.length < 2) return null;
  const W = 560, H = 270, ml = 46, mr = 12, mt = 26, mb = 34;
  const x0 = Math.log10(pts[0].s), x1 = Math.log10(pts[pts.length - 1].s);
  const lo = Math.min(tjMax, ...pts.map((q) => q.tj));
  const hiRaw = Math.max(tjMax, ...pts.map((q) => q.tj));
  const yLo = Math.floor(lo / 10) * 10;
  const yHi = Math.min(Math.ceil(hiRaw / 10) * 10, yLo + Math.max(50, (tjMax - yLo) * 3));
  const X = (s: number) => ml + ((Math.log10(s) - x0) / (x1 - x0)) * (W - ml - mr);
  const Y = (t: number) => mt + (1 - (Math.min(t, yHi) - yLo) / (yHi - yLo)) * (H - mt - mb);
  const path = pts.map((q, i) => `${i ? 'L' : 'M'}${X(q.s).toFixed(1)},${Y(q.tj).toFixed(1)}`).join('');
  const xt = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].filter((s) => s >= pts[0].s && s <= pts[pts.length - 1].s);
  const step = (yHi - yLo) / 5;
  const yt = Array.from({ length: 6 }, (_, i) => yLo + i * step);
  const hq = hover === null ? null : pts[hover];
  return (
    <div className="px-2 py-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role="img"
        aria-label="Junction temperature versus copper pour size"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const b = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - b.left) / b.width) * W;
          if (x < ml || x > W - mr) return setHover(null);
          setHover(Math.round(((x - ml) / (W - ml - mr)) * (pts.length - 1)));
        }}
      >
        {xt.map((s) => (
          <g key={s}>
            <line x1={X(s)} x2={X(s)} y1={mt} y2={H - mb} stroke="var(--line)" />
            <text x={X(s)} y={H - mb + 14} textAnchor="middle" fontSize={11} fill="var(--muted)">
              {s}
            </text>
          </g>
        ))}
        {yt.map((t) => (
          <g key={t}>
            <line x1={ml} x2={W - mr} y1={Y(t)} y2={Y(t)} stroke="var(--line)" strokeWidth={0.5} />
            <text x={ml - 5} y={Y(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
              {fmt(t, 3)}
            </text>
          </g>
        ))}
        <text x={(ml + W - mr) / 2} y={H - 4} textAnchor="middle" fontSize={11} fill="var(--muted)">
          Copper pour side (mm, log scale)
        </text>
        <text x={4} y={12} fontSize={11} fill="var(--muted)">
          Tj °C
        </text>
        <line x1={ml} x2={W - mr} y1={Y(tjMax)} y2={Y(tjMax)} stroke="var(--err-line)" strokeDasharray="8 3 2 3" strokeWidth={1.5} />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} />
        <line x1={X(mark)} x2={X(mark)} y1={mt} y2={H - mb} stroke="var(--muted)" strokeDasharray="1 3" />
        <rect x={ml} y={mt} width={W - ml - mr} height={H - mt - mb} fill="none" stroke="var(--line)" />
        {hq && (
          <g pointerEvents="none">
            <circle cx={X(hq.s)} cy={Y(hq.tj)} r={4} fill="var(--accent)" stroke="var(--sheet)" strokeWidth={2} />
            <g transform={`translate(${X(hq.s) < W / 2 ? X(hq.s) + 8 : X(hq.s) - 148}, ${mt + 6})`}>
              <rect width={140} height={48} fill="var(--sheet)" stroke="var(--line-strong)" />
              <text x={8} y={15} fontSize={11} fill="var(--ink)" fontWeight={600}>
                {fmt(hq.s, 3)} × {fmt(hq.s, 3)} mm
              </text>
              <text x={8} y={30} fontSize={11} fill="var(--ink)">
                Tj {fmt(hq.tj, 4)} °C
              </text>
              <text x={8} y={43} fontSize={11} fill="var(--muted)">
                θ copper {fmt(hq.theta, 3)} °C/W
              </text>
            </g>
          </g>
        )}
      </svg>
    </div>
  );
}

export function Method() {
  return (
    <>
      <h2>Model</h2>
      <p>
        The heat flows from the junction into the board (θ<sub>JB</sub>), spreads sideways through the copper and leaves both faces of the board by convection and radiation. The copper
        pour is treated as a cooling fin around the part: a thin disc with the same area as the square pour, heated in the middle by a disc the size of the part's footprint. Its
        temperature falls with distance from the part, and the exact solution uses modified Bessel functions:
      </p>
      <div className="eq">
        <span className="no">(1)</span>η = 2<i>r</i>
        <sub>1</sub> / (<i>m</i>(<i>r</i>
        <sub>2</sub>² − <i>r</i>
        <sub>1</sub>²)) · [K<sub>1</sub>(<i>mr</i>
        <sub>1</sub>)I<sub>1</sub>(<i>mr</i>
        <sub>2</sub>) − I<sub>1</sub>(<i>mr</i>
        <sub>1</sub>)K<sub>1</sub>(<i>mr</i>
        <sub>2</sub>)] / [I<sub>0</sub>(<i>mr</i>
        <sub>1</sub>)K<sub>1</sub>(<i>mr</i>
        <sub>2</sub>) + K<sub>0</sub>(<i>mr</i>
        <sub>1</sub>)I<sub>1</sub>(<i>mr</i>
        <sub>2</sub>)]
      </div>
      <div className="eq">
        <span className="no">(2)</span>
        <i>m</i> = √(2(<i>h</i>
        <sub>c</sub> + <i>h</i>
        <sub>r</sub>) / (<i>k</i>
        <sub>Cu</sub> · <i>t</i> · <i>n</i>)),&nbsp;&nbsp; θ = 1 / (2(<i>h</i>
        <sub>c</sub> + <i>h</i>
        <sub>r</sub>) · (A<sub>source</sub> + η·A<sub>fin</sub>))
      </div>
      <p>
        The convection coefficient comes from the standard natural-convection correlations for a horizontal plate (hot upper face 0.54·Ra<sup>1/4</sup>, hot lower face 0.52·Ra
        <sup>1/5</sup>) or a vertical plate (Churchill–Chu), with air properties at the film temperature. Radiation uses εσ(<i>T</i>
        <sub>s</sub>² + <i>T</i>
        <sub>a</sub>²)(<i>T</i>
        <sub>s</sub> + <i>T</i>
        <sub>a</sub>). Both depend on the temperature, so the tool iterates until the temperature and the cooling agree.
      </p>
      <h3>What it does and does not include</h3>
      <ul>
        <li>The FR-4 is thin, so both faces of the board are assumed to be at the copper's temperature. FR-4's own sideways conduction is neglected, which is slightly conservative.</li>
        <li>Board area outside the pour, other hot parts, the enclosure and nearby boards are not included. In a closed box, use a higher ambient.</li>
        <li>
          “Connected layers” assumes enough thermal vias that the layers share the heat equally. Use the thermal-via tool to check the via array under the part.
        </li>
        <li>The fin solution matches a finite-difference solution within 0.2 % in the tests. For 1 in² of 2 oz copper it gives about 50 °C/W from the pad to still air; with θJB added this is in line with typical datasheet θJA values for SOT-223 parts on about 1 in² of copper.</li>
      </ul>
      <h2>References</h2>
      <ol>
        <li>T. L. Bergman, A. S. Lavine, F. P. Incropera, D. P. DeWitt, <i>Fundamentals of Heat and Mass Transfer</i>, 7th ed., Wiley, 2011: §3.6.4 (annular fins), §9.6 (vertical and horizontal plates), Table A.4 (air).</li>
        <li>M. Abramowitz, I. A. Stegun, <i>Handbook of Mathematical Functions</i>, 9.8.1–9.8.8 (Bessel function approximations).</li>
        <li>JEDEC JESD51-7 / Texas Instruments SPRA953, thermal metrics θJB and ΨJB.</li>
      </ol>
    </>
  );
}
