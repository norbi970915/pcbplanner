import { ToolPage } from '../components/ToolPage';
import { LenField, Notes, NumField, Panel, Result, Section, Segmented, SelectField } from '../components/ui';
import { CURRENT_SHEET, innerFromOuter, outerFromInner, SIDES, spiral, WHEELER, type SpiralShape } from '../lib/inductor';
import { fmt, fromMm, si } from '../lib/units';
import { useSettings } from '../state/settings';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { shape: 'square', n: 5, w: 0.2, s: 0.2, mode: 'out', dOut: 10, dIn: 6.4, t: 0.035, f: 10 };

const SHAPES: { value: SpiralShape; label: string }[] = [
  { value: 'square', label: 'Square' },
  { value: 'hexagonal', label: 'Hexagonal' },
  { value: 'octagonal', label: 'Octagonal' },
  { value: 'circular', label: 'Circular' },
];

export default function PlanarInductor() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const { unit } = useSettings();
  const shape = (SHAPES.some((s) => s.value === p.shape) ? p.shape : 'square') as SpiralShape;
  const fromOuter = p.mode !== 'in';
  const dOut = fromOuter ? p.dOut : outerFromInner(p.dIn, p.n, p.w, p.s);
  const dIn = fromOuter ? innerFromOuter(p.dOut, p.n, p.w, p.s) : p.dIn;

  const errors: string[] = [];
  if (!(p.n >= 1 && p.n <= 200)) errors.push('Number of turns must be between 1 and 200.');
  if ([p.w, p.s, p.t, p.dOut, p.dIn].some((v) => v > 10000)) errors.push('Dimensions must be below 10 m.');
  if (!(p.w > 0)) errors.push('Trace width must be greater than 0.');
  if (!(p.s > 0)) errors.push('Spacing must be greater than 0.');
  if (!(p.t > 0)) errors.push('Copper thickness must be greater than 0.');
  if (!(p.f > 0)) errors.push('Frequency must be greater than 0.');
  if (fromOuter && !(p.dOut > 0)) errors.push('Outer diameter must be greater than 0.');
  if (!fromOuter && !(p.dIn >= 0)) errors.push('Inner diameter cannot be negative.');
  if (errors.length === 0 && !(dIn > 0)) errors.push(`The turns do not fit: the inner diameter would be ${fmt(dIn, 3)} mm. Reduce turns, width or spacing, or enlarge the outer diameter.`);
  const r = errors.length ? null : spiral({ shape, n: p.n, wMm: p.w, sMm: p.s, dOutMm: dOut, tMm: p.t, freqHz: p.f * 1e6 });

  const notes: string[] = [];
  if (r && r.spacingRatio > 3) notes.push(`Spacing is ${fmt(r.spacingRatio, 3)}× the width. Mohan et al. quote the current-sheet error as up to 8 % only for s ≤ 3w; expect larger errors here.`);
  if (r && (dIn / dOut < 0.1 || dIn / dOut > 0.9)) notes.push(`d_in/d_out = ${fmt(dIn / dOut, 3)} is outside the 0.1–0.9 range the expressions were fitted over.`);
  const L = (mm: number) => `${fmt(fromMm(mm, unit), 4)} ${unit}`;
  const lMain = r ? (Number.isFinite(r.lWheeler) ? r.lWheeler : r.lSheet) : NaN;

  const properties = (
    <>
      <Section title="Shape">
        <SelectField label="Layout" value={shape} onChange={(v) => set({ shape: v })} options={SHAPES} />
        <NumField label="Turns" symbol="n" value={p.n} onChange={(v) => set({ n: v })} />
        <LenField label="Trace width" symbol="w" value={p.w} onChange={(v) => set({ w: v })} />
        <LenField label="Spacing" symbol="s" value={p.s} onChange={(v) => set({ s: v })} />
      </Section>
      <Section title="Size">
        <div className="flex items-center justify-between">
          <span className="text-muted">Given</span>
          <Segmented
            label="Given diameter"
            value={fromOuter ? 'out' : 'in'}
            onChange={(v) => set(v === 'out' ? { mode: v, dOut } : { mode: v, dIn: Math.max(0, dIn) })}
            options={[
              { value: 'out', label: 'Outer d' },
              { value: 'in', label: 'Inner d' },
            ]}
          />
        </div>
        {fromOuter ? (
          <LenField label="Outer diameter" symbol="dout" value={p.dOut} onChange={(v) => set({ dOut: v })} />
        ) : (
          <LenField label="Inner diameter" symbol="din" value={p.dIn} onChange={(v) => set({ dIn: v })} allowZero />
        )}
      </Section>
      <Section title="Copper and frequency">
        <LenField label="Copper thickness" symbol="t" value={p.t} onChange={(v) => set({ t: v })} units={['oz', 'um', 'mil', 'mm']} />
        <NumField label="Frequency for Q" symbol="f" value={p.f} onChange={(v) => set({ f: v })} unit="MHz" />
      </Section>
    </>
  );

  return (
    <ToolPage
      title="Planar Spiral Inductor"
      description="Inductance of square, hexagonal, octagonal and circular PCB spiral inductors from the Mohan–Hershenson–Boyd–Lee expressions, with DC resistance and a Q estimate."
      onReset={reset}
      properties={properties}
      status={r ? `L ≈ ${si(lMain, 'H', 3)}, Rdc ${si(r.rDc, 'Ω', 3)}, d_in ${fmt(dIn, 3)} mm` : 'Check the inputs'}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      <Notes items={notes} />
      {r && (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            <Panel title="Inductance">
              <table className="tbl">
                <tbody>
                  <Result
                    label="Modified Wheeler"
                    value={Number.isFinite(r.lWheeler) ? si(r.lWheeler, 'H') : '—'}
                    strong
                    sub={Number.isFinite(r.lWheeler) ? `K1 = ${WHEELER[shape as Exclude<SpiralShape, 'circular'>].k1}, K2 = ${WHEELER[shape as Exclude<SpiralShape, 'circular'>].k2}` : 'no coefficients for a circle in Mohan et al.'}
                  />
                  <Result
                    label="Current sheet"
                    value={si(r.lSheet, 'H')}
                    strong
                    sub={`c1…c4 = ${CURRENT_SHEET[shape].c1}, ${CURRENT_SHEET[shape].c2}, ${CURRENT_SHEET[shape].c3}, ${CURRENT_SHEET[shape].c4}`}
                  />
                  {Number.isFinite(r.lWheeler) && <Result label="Difference between the models" value={fmt((100 * (r.lSheet - r.lWheeler)) / r.lWheeler, 3)} unit="%" />}
                </tbody>
              </table>
            </Panel>
            <Panel title="Geometry">
              <table className="tbl">
                <tbody>
                  <Result label="Outer diameter" value={L(dOut)} />
                  <Result label="Inner diameter" value={L(dIn)} />
                  <Result label="Average diameter" value={L(r.dAvg)} />
                  <Result label="Fill ratio ρ" value={fmt(r.rho, 4)} />
                  <Result label="Trace length" value={L(r.lengthMm)} sub="turns only, leads excluded" />
                </tbody>
              </table>
            </Panel>
            <Panel title="Loss">
              <table className="tbl">
                <tbody>
                  <Result label="DC resistance" value={si(r.rDc, 'Ω')} strong sub="copper at 20 °C" />
                  <Result
                    label={`Q at ${si(p.f * 1e6, 'Hz', 3)} (optimistic)`}
                    value={fmt(r.q, 4)}
                    sub="ωL/Rdc: skin and proximity effect, dielectric and substrate loss are ignored"
                  />
                </tbody>
              </table>
            </Panel>
          </div>
          <Panel title="Layout">
            <SpiralDrawing shape={shape} n={p.n} w={p.w} s={p.s} dOut={dOut} />
          </Panel>
        </div>
      )}
    </ToolPage>
  );
}

function SpiralDrawing({ shape, n, w, s, dOut }: { shape: SpiralShape; n: number; w: number; s: number; dOut: number }) {
  const S = 280, pad = 16;
  const k = (S - 2 * pad) / dOut; // px per mm
  const c = S / 2;
  const N = SIDES[shape];
  const pitch = w + s;
  const r0 = (dOut - w) / 2; // centre-line radius of the outer turn (across flats)
  const steps = Number.isFinite(N) ? N : 72;
  // polygon vertices sit at the half-angle so flats face the axes (as in Fig. 1 of Mohan et al.)
  const phase = Number.isFinite(N) ? (N === 6 ? 0 : Math.PI / N) : 0;
  const scale = Number.isFinite(N) ? 1 / Math.cos(Math.PI / N) : 1;
  const pts: string[] = [];
  const total = Math.ceil(n * steps);
  for (let i = 0; i <= total; i++) {
    const t = Math.min(i / steps, n); // turns travelled
    const ang = phase + 2 * Math.PI * t;
    const rad = (r0 - pitch * t) * scale;
    pts.push(`${(c + rad * k * Math.cos(ang)).toFixed(2)},${(c - rad * k * Math.sin(ang)).toFixed(2)}`);
  }
  return (
    <div className="flex flex-col items-center gap-1 p-2">
      <svg viewBox={`0 0 ${S} ${S}`} className="h-auto w-full max-w-[300px]" role="img" aria-label={`${shape} spiral inductor with ${fmt(n, 3)} turns`}>
        <polyline points={pts.join(' ')} fill="none" stroke="var(--copper)" strokeWidth={Math.max(1, w * k)} strokeLinejoin="miter" strokeLinecap="butt" />
      </svg>
      <p className="text-[11px] text-muted">
        To scale: d<sub>out</sub> = {fmt(dOut, 4)} mm, {fmt(n, 3)} turns. Leads not drawn.
      </p>
    </div>
  );
}

function Method() {
  return (
    <>
      <h2>Inductance</h2>
      <p>
        The spiral is described by the number of turns <i>n</i>, the trace width <i>w</i>, the spacing <i>s</i> and the outer diameter <i>d</i>
        <sub>out</sub> (across flats for the polygons). The inner diameter follows from these:
      </p>
      <div className="eq">
        <span className="no">(1)</span>
        <i>d</i>
        <sub>in</sub> = <i>d</i>
        <sub>out</sub> − 2<i>n w</i> − 2(<i>n</i> − 1)<i>s</i>,&nbsp;&nbsp; <i>d</i>
        <sub>avg</sub> = (<i>d</i>
        <sub>out</sub> + <i>d</i>
        <sub>in</sub>)/2,&nbsp;&nbsp; ρ = (<i>d</i>
        <sub>out</sub> − <i>d</i>
        <sub>in</sub>)/(<i>d</i>
        <sub>out</sub> + <i>d</i>
        <sub>in</sub>)
      </div>
      <p>Mohan et al. give two simple expressions for the DC inductance. The first is a modified Wheeler formula:</p>
      <div className="eq">
        <span className="no">(2)</span>
        <i>L</i>
        <sub>mw</sub> = <i>K</i>
        <sub>1</sub> μ<sub>0</sub> <i>n</i>
        <sup>2</sup> <i>d</i>
        <sub>avg</sub> / (1 + <i>K</i>
        <sub>2</sub> ρ)
      </div>
      <p>The second comes from a current-sheet approximation:</p>
      <div className="eq">
        <span className="no">(3)</span>
        <i>L</i>
        <sub>gmd</sub> = μ<sub>0</sub> <i>n</i>
        <sup>2</sup> <i>d</i>
        <sub>avg</sub> <i>c</i>
        <sub>1</sub>/2 · [ ln(<i>c</i>
        <sub>2</sub>/ρ) + <i>c</i>
        <sub>3</sub>ρ + <i>c</i>
        <sub>4</sub>ρ<sup>2</sup> ]
      </div>
      <table className="tbl my-2 max-w-[520px]">
        <thead>
          <tr>
            <th className="text-left">Layout</th>
            <th className="v">K1</th>
            <th className="v">K2</th>
            <th className="v">c1</th>
            <th className="v">c2</th>
            <th className="v">c3</th>
            <th className="v">c4</th>
          </tr>
        </thead>
        <tbody>
          {SHAPES.map(({ value, label }) => {
            const wh = value === 'circular' ? null : WHEELER[value];
            const cs = CURRENT_SHEET[value];
            return (
              <tr key={value}>
                <td>{label}</td>
                <td className="v">{wh ? wh.k1.toFixed(2) : '—'}</td>
                <td className="v">{wh ? wh.k2.toFixed(2) : '—'}</td>
                <td className="v">{cs.c1.toFixed(2)}</td>
                <td className="v">{cs.c2.toFixed(2)}</td>
                <td className="v">{cs.c3.toFixed(2)}</td>
                <td className="v">{cs.c4.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p>
        The coefficients are Tables I and II of the paper, checked against the published PDF. The authors report typical errors of 2–3 % against the ASITIC field solver. The
        current-sheet error rises as <i>s</i>/<i>w</i> grows, with a maximum of 8 % for <i>s</i> ≤ 3<i>w</i>. The fit covered <i>d</i>
        <sub>in</sub> from 0.1 to 0.9 <i>d</i>
        <sub>out</sub>. The expressions were derived for on-chip spirals, but they contain only length ratios and ignore conductor thickness, so they scale to PCB dimensions. A copper
        plane close under the spiral carries eddy currents and lowers the inductance. The expressions do not include this effect, so keep planes away from the coil or model it with a
        field solver.
      </p>
      <h2>Resistance and Q</h2>
      <p>
        Turn <i>k</i> has a centre-line diameter of <i>d</i>
        <sub>out</sub> − <i>w</i> − 2<i>k</i>(<i>w</i> + <i>s</i>). The average over all turns is exactly <i>d</i>
        <sub>avg</sub>, so the trace length is <i>n</i> · <i>P</i> · <i>d</i>
        <sub>avg</sub>. Here <i>P</i> = <i>N</i> tan(π/<i>N</i>) is the perimeter of a regular <i>N</i>-gon per unit across-flats diameter: 4 for a square, 3.464 for a hexagon,
        3.314 for an octagon and π for a circle. The leads to the centre are not included. Resistance is ρ<sub>Cu</sub>
        <i>l</i>/(<i>w t</i>) with ρ<sub>Cu</sub> = 1.7241 µΩ·cm at 20 °C. The quality factor <i>Q</i> = ω<i>L</i>/<i>R</i>
        <sub>DC</sub> is optimistic. Skin and proximity effects raise the resistance well above its DC value at MHz frequencies, and the self-resonance of the coil is not modelled.
      </p>
      <h2>References</h2>
      <ol>
        <li>
          S. S. Mohan, M. del Mar Hershenson, S. P. Boyd, T. H. Lee, “Simple Accurate Expressions for Planar Spiral Inductances”, <i>IEEE J. Solid-State Circuits</i>, vol. 34, no. 10,
          pp. 1419–1424, Oct. 1999.
        </li>
        <li>H. A. Wheeler, “Simple inductance formulas for radio coils”, <i>Proc. IRE</i>, vol. 16, no. 10, pp. 1398–1400, Oct. 1928.</li>
      </ol>
    </>
  );
}
