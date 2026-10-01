import { useId } from 'react';
import { SiField } from '../components/SiField';
import { Sources } from '../components/Sources';
import { ToolPage } from '../components/ToolPage';
import { Big, Check, LenField, Notes, NumField, Panel, Result, Section, Segmented, SelectField } from '../components/ui';
import type { DataSource } from '../data/source';
import { coaxLine, coaxLoss, geometryError, M_PER_FT, NP_TO_DB, solveInner, solveOuter } from '../lib/coax';
import { fmt, fromMm, si } from '../lib/units';
import { useSettings } from '../state/settings';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { solve: 'z0', D: 3, d: 0.9, ecc: false, s: 0.2, diel: 'er', er: 2.1, vf: 0.69, target: 50, f: 1e9, tand: 0.0002, sigma: 58 };
type Solve = 'z0' | 'D' | 'd';

export default function CoaxImpedance() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const { unit } = useSettings();
  const solve: Solve = p.solve === 'D' || p.solve === 'd' ? p.solve : 'z0';
  const fromVf = p.diel === 'vf';
  const L = (mm: number, sig = 4) => `${fmt(fromMm(mm, unit), sig)} ${unit}`;

  const errors: string[] = [];
  const notes: string[] = [];
  if (fromVf && !(p.vf > 0 && p.vf <= 1)) errors.push('The velocity factor must be greater than 0 and at most 1.');
  if (!fromVf && !(p.er >= 1)) errors.push('The relative permittivity εr must be 1 or more.');
  if (solve !== 'z0' && !(p.target > 0)) errors.push('The target impedance must be greater than 0.');
  if (!(p.f > 0)) errors.push('The frequency must be greater than 0.');
  if (!(p.tand >= 0)) errors.push('The loss tangent cannot be negative.');
  if (!(p.sigma > 0)) errors.push('The conductivity must be greater than 0.');
  const er = fromVf ? 1 / (p.vf * p.vf) : p.er;
  const s = p.ecc ? p.s : 0;

  // geometry: entered or solved
  let D = p.D, d = p.d;
  if (!errors.length) {
    if (solve === 'D') {
      if (!(p.d > 0)) errors.push('The centre conductor diameter d must be greater than 0.');
      else if (!(s >= 0)) errors.push('The offset must be 0 or more.');
      else D = solveOuter(p.target, p.d, er, s);
    } else if (solve === 'd') {
      if (!(p.D > 0)) errors.push('The outer conductor inner diameter D must be greater than 0.');
      else if (!(s >= 0 && 2 * s < p.D)) errors.push('The offset must be at least 0 and less than D/2.');
      else d = solveInner(p.target, p.D, er, s);
    }
  }
  if (!errors.length) {
    const g = geometryError(D, d, s);
    if (g) errors.push(g);
  }
  const ok = errors.length === 0;
  const line = ok ? coaxLine(D, d, er, s) : null;
  const loss = ok ? coaxLoss(D, d, er, p.tand, p.sigma * 1e6, p.f) : null;
  const alphaC = loss && s === 0 ? loss.alphaC : NaN;
  const alphaTot = loss ? (s === 0 ? loss.alphaC + loss.alphaD : NaN) : NaN;

  if (line && fromVf) notes.push(`εr = 1 / VF² = ${fmt(er, 5)} from the velocity factor ${fmt(p.vf, 4)}.`);
  if (line && p.f >= line.te11) notes.push(`${si(p.f, 'Hz', 4)} is at or above the TE11 cutoff (${si(line.te11, 'Hz', 4)}): the TE11 mode can propagate, so the line is no longer single-mode and the TEM results below do not describe it alone.`);
  if (loss && s === 0 && loss.skin > 0.1 * (d / 2) * 1e-3) notes.push(`The skin depth (${si(loss.skin, 'm', 3)}) is more than a tenth of the centre conductor radius. The surface-resistance formula assumes a skin depth much smaller than the conductor and underestimates the conductor loss here.`);
  if (line && s > 0) notes.push('With an offset centre conductor the current crowds on the narrow side, so the concentric conductor-loss formula does not apply and conductor loss is not shown. The TE11 cutoff shown is the concentric approximation.');

  const ft = unit === 'mil';
  const delaySub = line ? (ft ? `${fmt(line.delay * 0.0254 * 1e12, 4)} ps/in · ${fmt(line.delay * M_PER_FT * 1e9, 4)} ns/ft` : `${fmt(line.delay * 1e-3 * 1e12, 4)} ps/mm · ${fmt(line.delay * M_PER_FT * 1e9, 4)} ns/ft`) : '';
  const dbm = (np: number) => (Number.isFinite(np) ? fmt(np * NP_TO_DB, 4) : '—');
  const db100ft = (np: number) => (Number.isFinite(np) ? `${fmt(np * NP_TO_DB * 100 * M_PER_FT, 4)} dB/100 ft · ${fmt(np * NP_TO_DB * 100, 4)} dB/100 m` : 'not shown with an offset');

  const properties = (
    <>
      <Section title="Calculate">
        <SelectField
          label="Solve for"
          value={solve}
          onChange={(v) => set({ solve: v })}
          width={170}
          options={[
            { value: 'z0', label: 'Z0 from D and d' },
            { value: 'D', label: 'D for a target Z0' },
            { value: 'd', label: 'd for a target Z0' },
          ]}
        />
        {solve !== 'z0' && <NumField label="Target impedance" symbol="Z0" value={p.target} onChange={(v) => set({ target: v })} unit="Ω" />}
      </Section>
      <Section title="Geometry">
        {solve !== 'D' && <LenField label="Shield inner diameter" symbol="D" value={p.D} onChange={(v) => set({ D: v })} units={['mm', 'mil', 'in']} hint="Inside diameter of the shield, which is the outside diameter of the dielectric." />}
        {solve !== 'd' && <LenField label="Centre conductor" symbol="d" value={p.d} onChange={(v) => set({ d: v })} units={['mm', 'mil', 'in']} />}
        <Check label="Offset (eccentric) centre conductor" checked={p.ecc} onChange={(v) => set({ ecc: v })} />
        {p.ecc && <LenField label="Centre offset" symbol="s" value={p.s} onChange={(v) => set({ s: v })} units={['mm', 'mil', 'in']} allowZero />}
      </Section>
      <Section title="Dielectric">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <span className="text-muted">Enter</span>
          <Segmented
            label="Dielectric entered as"
            value={fromVf ? 'vf' : 'er'}
            onChange={(v) => set(v === 'vf' ? { diel: v, vf: Number((1 / Math.sqrt(Math.max(1, p.er))).toPrecision(4)) } : { diel: v, er: Number((1 / (p.vf * p.vf)).toPrecision(4)) })}
            options={[
              { value: 'er', label: 'εr' },
              { value: 'vf', label: 'Velocity factor' },
            ]}
          />
        </div>
        {fromVf ? (
          <NumField label="Velocity factor" symbol="VF" value={p.vf} onChange={(v) => set({ vf: v })} hint="Velocity of propagation as a fraction of c, as cable datasheets list it (0.66 for 66 %)." />
        ) : (
          <NumField label="Relative permittivity" symbol="εr" value={p.er} onChange={(v) => set({ er: v })} min={1} allowZero />
        )}
        <NumField label="Loss tangent" symbol="tan δ" value={p.tand} onChange={(v) => set({ tand: v })} allowZero />
      </Section>
      <Section title="Loss">
        <SiField label="Frequency" symbol="f" value={p.f} onChange={(v) => set({ f: v })} unit="Hz" prefixes={['k', 'M', 'G']} />
        <NumField label="Conductivity" symbol="σ" value={p.sigma} onChange={(v) => set({ sigma: v })} unit="MS/m" hint="58 MS/m is the IEC 60028 annealed copper standard. Both conductors use this value." />
      </Section>
    </>
  );

  const status = line ? `Z0 ${fmt(line.z0, 5)} Ω · VF ${fmt(line.vf, 4)} · TE11 ${si(line.te11, 'Hz', 4)}${solve === 'D' ? ` · D ${L(D)}` : solve === 'd' ? ` · d ${L(d)}` : ''}` : 'Check the inputs';
  const solved = solve === 'D' ? D : solve === 'd' ? d : NaN;

  return (
    <ToolPage
      title="Coaxial Line Impedance Calculator"
      description="Characteristic impedance of a coaxial line from its diameters and dielectric, or the diameter for a target impedance, with an offset centre conductor option, velocity factor, delay, capacitance, inductance, TE11 cutoff and conductor and dielectric loss."
      onReset={reset}
      properties={properties}
      status={status}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      <Notes items={notes} />
      {line && loss && (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Panel title="Line">
            <div className="flex flex-wrap gap-8 px-3 py-3">
              {solve === 'z0' ? (
                <Big label="Characteristic impedance" value={fmt(line.z0, 5)} unit="Ω" />
              ) : (
                <Big label={solve === 'D' ? 'Outer diameter D' : 'Centre conductor d'} value={fmt(fromMm(solved, unit), 5)} unit={unit} />
              )}
              <Big label="Velocity factor" value={fmt(line.vf * 100, 4)} unit="%" />
              <Big label="TE11 cutoff" value={si(line.te11, 'Hz', 4).split(' ')[0]} unit={si(line.te11, 'Hz', 4).split(' ')[1]} />
            </div>
            <table className="tbl">
              <tbody>
                <Result label="Characteristic impedance Z0" value={fmt(line.z0, 6)} unit="Ω" strong sub={s > 0 ? 'eccentric line, (η0 / 2π√εr) acosh((D² + d² − 4s²) / 2Dd)' : '(η0 / 2π√εr) ln(D/d)'} />
                {solve !== 'z0' && (
                  <Result label={solve === 'D' ? 'Outer conductor inner diameter D' : 'Centre conductor diameter d'} value={L(solved, 6)} strong sub={unit === 'mm' ? `${fmt(solved / 25.4, 5)} in` : `${fmt(solved, 5)} mm`} />
                )}
                <Result label="Diameter ratio D/d" value={fmt(D / d, 5)} />
                <Result label="Velocity factor" value={fmt(line.vf, 5)} sub={`1/√εr with εr = ${fmt(er, 5)}`} />
                <Result label="Delay" value={fmt(line.delay * 1e9, 5)} unit="ns/m" sub={delaySub} />
                <Result label="Capacitance" value={fmt(line.cPerM * 1e12, 5)} unit="pF/m" sub={`${fmt(line.cPerM * M_PER_FT * 1e12, 4)} pF/ft`} />
                <Result label="Inductance (external)" value={fmt(line.lPerM * 1e9, 5)} unit="nH/m" sub={`${fmt(line.lPerM * M_PER_FT * 1e9, 4)} nH/ft`} />
                <Result label="TE11 cutoff frequency" value={si(line.te11, 'Hz', 5)} strong sub="highest frequency for TEM-only (single-mode) operation, c / (π √εr (D + d)/2)" />
              </tbody>
            </table>
            {solve !== 'z0' && (
              <p className="px-3 py-2">
                <button type="button" className="btn" onClick={() => set({ solve: 'z0', D, d })}>
                  Use this {solve === 'D' ? 'D' : 'd'} and analyse
                </button>
              </p>
            )}
          </Panel>
          <Panel title="Cross-Section">
            <CoaxSection D={D} d={d} s={s} label={L} />
          </Panel>
        </div>
      )}
      {line && loss && (
        <Panel title={`Attenuation at ${si(p.f, 'Hz', 4)}`}>
          <table className="tbl">
            <tbody>
              <Result label="Skin depth" value={si(loss.skin, 'm', 4)} sub={`σ = ${fmt(p.sigma, 4)} MS/m`} />
              <Result label="Surface resistance Rs" value={si(loss.rs, 'Ω', 4)} sub="√(ωμ0 / 2σ)" />
              <Result label="Conductor loss αc" value={dbm(alphaC)} unit="dB/m" sub={db100ft(alphaC)} />
              <Result label="Dielectric loss αd" value={dbm(loss.alphaD)} unit="dB/m" sub={db100ft(loss.alphaD)} />
              <Result label="Total attenuation" value={dbm(alphaTot)} unit="dB/m" strong sub={s > 0 ? 'conductor loss not available with an offset' : db100ft(alphaTot)} />
            </tbody>
          </table>
          <p className="px-3 py-2 text-faint">Smooth, solid conductors. Braided shields, plating and surface roughness add loss, so treat αc as a lower bound for real cable.</p>
        </Panel>
      )}
    </ToolPage>
  );
}

/** To-scale cross-section: shield bore D, centre conductor d displaced by s to the right. */
function CoaxSection({ D, d, s, label }: { D: number; d: number; s: number; label: (mm: number, sig?: number) => string }) {
  const id = useId();
  const W = 340, H = 330, cx = 170, cy = 160;
  const R = 120; // px for D/2
  const k = R / (D / 2);
  const r = Math.max(0.6, (d / 2) * k);
  const x = cx + s * k;
  const shield = 9; // drawn wall, not to scale
  const dimY = cy + R + shield + 22;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block h-auto w-full max-w-[380px]" role="img" aria-label={`Coaxial cross-section, D ${label(D)}, d ${label(d)}${s > 0 ? `, offset ${label(s)}` : ''}`}>
      <style>{`
        .cxd{stroke:var(--ink);stroke-width:.8;fill:none}
        .cxt{fill:var(--ink);font-size:11px;font-family:var(--font-sans);paint-order:stroke;stroke:var(--sheet);stroke-width:3px;stroke-linejoin:round}
      `}</style>
      <defs>
        <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,1 L9,5 L0,9 z" fill="var(--ink)" />
        </marker>
      </defs>
      <circle cx={cx} cy={cy} r={R + shield / 2} fill="none" stroke="var(--copper)" strokeWidth={shield} />
      <circle cx={cx} cy={cy} r={R} fill="var(--prepreg)" />
      <circle cx={x} cy={cy} r={r} fill="var(--copper)" stroke="var(--ink)" strokeWidth={0.6} />
      {/* D */}
      <line x1={cx - R} x2={cx - R} y1={cy} y2={dimY + 4} stroke="var(--faint)" strokeWidth={0.6} strokeDasharray="2 2" />
      <line x1={cx + R} x2={cx + R} y1={cy} y2={dimY + 4} stroke="var(--faint)" strokeWidth={0.6} strokeDasharray="2 2" />
      <line x1={cx - R} x2={cx + R} y1={dimY} y2={dimY} className="cxd" markerStart={`url(#${id})`} markerEnd={`url(#${id})`} />
      <text x={cx} y={dimY - 4} textAnchor="middle" className="cxt">D {label(D)}</text>
      {/* d, drawn across the centre conductor above its centre line */}
      <line x1={x - r} x2={x - r} y1={cy} y2={cy - r - 18} stroke="var(--faint)" strokeWidth={0.6} strokeDasharray="2 2" />
      <line x1={x + r} x2={x + r} y1={cy} y2={cy - r - 18} stroke="var(--faint)" strokeWidth={0.6} strokeDasharray="2 2" />
      {r >= 6 ? (
        <line x1={x - r} x2={x + r} y1={cy - r - 14} y2={cy - r - 14} className="cxd" markerStart={`url(#${id})`} markerEnd={`url(#${id})`} />
      ) : (
        <line x1={x - r} x2={x + r} y1={cy - r - 14} y2={cy - r - 14} className="cxd" />
      )}
      <text x={x} y={cy - r - 19} textAnchor="middle" className="cxt">d {label(d)}</text>
      {/* offset between centres */}
      {s > 0 && (
        <>
          <path d={`M${cx - 5},${cy} H${cx + 5} M${cx},${cy - 5} V${cy + 5}`} stroke="var(--ink)" strokeWidth={0.8} />
          <path d={`M${x},${cy - 4} V${cy + 4}`} stroke="var(--ink)" strokeWidth={0.8} />
          <line x1={cx} x2={x} y1={cy + r + 14} y2={cy + r + 14} className="cxd" />
          <line x1={cx} x2={cx} y1={cy} y2={cy + r + 18} stroke="var(--faint)" strokeWidth={0.6} strokeDasharray="2 2" />
          <line x1={x} x2={x} y1={cy} y2={cy + r + 18} stroke="var(--faint)" strokeWidth={0.6} strokeDasharray="2 2" />
          <text x={(cx + x) / 2} y={cy + r + 28} textAnchor="middle" className="cxt">s {label(s)}</text>
        </>
      )}
      <text x={W - 6} y={H - 4} textAnchor="end" fontSize={10.5} fill="var(--muted)">to scale; shield wall thickness not drawn to scale</text>
    </svg>
  );
}

const SOURCES: readonly DataSource[] = [
  {
    title: 'K. T. McDonald, "An Off-Center \'Coaxial\' Cable", Joseph Henry Laboratories, Princeton University, 1999',
    url: 'http://kirkmcd.princeton.edu/examples/coax.pdf',
    note: 'Eq. (14): capacitance of eccentric cylinders, C = 1/(2 cosh⁻¹((a² + b² − δ²)/2ab)) in Gaussian units, i.e. 2πε / acosh(…) in SI; eq. (12) small-offset expansion, used as a test case.',
  },
  {
    title: 'NBS Handbook 100, Copper Wire Tables (1966)',
    url: 'https://nvlpubs.nist.gov/nistpubs/Legacy/hb/nbshandbook100.pdf',
    note: 'International Annealed Copper Standard: 1/58 Ω·mm²/m at 20 °C, the default conductivity of 58 MS/m (the same value as IEC 60028).',
  },
  {
    title: 'NIST CODATA: characteristic impedance of vacuum',
    url: 'https://physics.nist.gov/cgi-bin/cuu/Value?z0',
    note: 'η0 = 376.730313668 Ω (CODATA 2018), with c = 299 792 458 m/s; μ0 = η0/c and ε0 = 1/(η0 c) follow.',
  },
];

export function Method() {
  return (
    <>
      <h2>Concentric line</h2>
      <p>
        For a centre conductor of diameter <i>d</i> inside a shield of inner diameter <i>D</i>, filled with a dielectric of relative permittivity ε<sub>r</sub> (μ<sub>r</sub> = 1), the
        line constants per metre are (Pozar §2.2, Table 2.1):
      </p>
      <div className="eq">
        <span className="no">(1)</span>
        <i>L</i>′ = (μ<sub>0</sub> / 2π) ln(<i>D</i>/<i>d</i>), <i>C</i>′ = 2π ε<sub>0</sub> ε<sub>r</sub> / ln(<i>D</i>/<i>d</i>)
      </div>
      <div className="eq">
        <span className="no">(2)</span>
        <i>Z</i>
        <sub>0</sub> = √(<i>L</i>′/<i>C</i>′) = (η<sub>0</sub> / 2π√ε<sub>r</sub>) ln(<i>D</i>/<i>d</i>) ≈ (59.96 / √ε<sub>r</sub>) ln(<i>D</i>/<i>d</i>) Ω
      </div>
      <p>
        with η<sub>0</sub> = 376.730 Ω. The wave travels at <i>c</i>/√ε<sub>r</sub>, so the velocity factor is 1/√ε<sub>r</sub> and the delay is √ε<sub>r</sub>/<i>c</i> per metre.{' '}
        <i>L</i>′ is the external inductance; at radio frequencies the field inside the conductors is confined to the skin depth and adds little. Cable datasheets give the velocity of
        propagation rather than ε<sub>r</sub>; the velocity factor input uses ε<sub>r</sub> = 1/VF².
      </p>
      <p>
        To solve for a target impedance, (2) is inverted: <i>D</i> = <i>d</i> e<sup><i>G</i></sup> or <i>d</i> = <i>D</i> e<sup>−<i>G</i></sup> with <i>G</i> = 2π√ε<sub>r</sub>{' '}
        <i>Z</i>
        <sub>0</sub>/η<sub>0</sub>.
      </p>
      <h2>Offset (eccentric) centre conductor</h2>
      <p>
        If the centre of the inner conductor is displaced by <i>s</i> from the axis of the shield, the capacitance of the two eccentric cylinders (McDonald, eq. 14, from the image method) gives
      </p>
      <div className="eq">
        <span className="no">(3)</span>
        <i>Z</i>
        <sub>0</sub> = (η<sub>0</sub> / 2π√ε<sub>r</sub>) acosh[(<i>D</i>² + <i>d</i>² − 4<i>s</i>²) / (2<i>Dd</i>)]
      </div>
      <p>
        This is the familiar handbook form (60/√ε<sub>r</sub>) acosh(…) with the exact η<sub>0</sub>/2π = 59.958 Ω instead of 60. At <i>s</i> = 0 the argument equals cosh(ln(
        <i>D</i>/<i>d</i>)), so (3) reduces to (2). The offset always lowers <i>Z</i>
        <sub>0</sub>, slowly at first (by about (η<sub>0</sub>/2π√ε<sub>r</sub>) · 4<i>s</i>²/(<i>D</i>² − <i>d</i>²) for a small offset) and towards zero as the conductors touch at{' '}
        <i>s</i> = (<i>D</i> − <i>d</i>)/2. For a target impedance the quadratic in <i>D</i> or <i>d</i> is solved directly. The tests compare (3) with an independent image-charge
        solution of the same geometry.
      </p>
      <h2>Highest usable frequency</h2>
      <p>The first higher-order mode of a coaxial line is TE11. Pozar (§3.5) gives the approximate cutoff wavenumber <i>k</i><sub>c</sub> ≈ 2/(<i>a</i> + <i>b</i>) for radii <i>a</i> and <i>b</i>, so</p>
      <div className="eq">
        <span className="no">(4)</span>
        <i>f</i>
        <sub>c</sub> ≈ <i>c</i> / (π √ε<sub>r</sub> (<i>D</i> + <i>d</i>)/2)
      </div>
      <p>Above this frequency the line can carry TE11 as well as TEM, and connectors and bends convert energy between them. The value shown with an offset is the concentric approximation.</p>
      <h2>Attenuation</h2>
      <p>For smooth conductors of conductivity σ, Pozar (§2.7, attenuation of a coaxial line) gives the conductor loss, and the dielectric loss of any TEM line filled with one dielectric is (§3.1):</p>
      <div className="eq">
        <span className="no">(5)</span>α<sub>c</sub> = <i>R</i>
        <sub>s</sub> (2/<i>d</i> + 2/<i>D</i>) / (2η ln(<i>D</i>/<i>d</i>)) Np/m, <i>R</i>
        <sub>s</sub> = √(ωμ<sub>0</sub> / 2σ), η = η<sub>0</sub>/√ε<sub>r</sub>
      </div>
      <div className="eq">
        <span className="no">(6)</span>α<sub>d</sub> = <i>k</i> tan δ / 2 = π <i>f</i> √ε<sub>r</sub> tan δ / <i>c</i> Np/m
      </div>
      <p>
        One neper is 20 log₁₀ e = 8.686 dB. α<sub>c</sub> rises with √<i>f</i> and α<sub>d</sub> with <i>f</i>. Equation (5) needs the skin depth δ = 1/√(π<i>f</i>μ<sub>0</sub>σ) to be small
        compared with the centre conductor; the tool warns when δ exceeds a tenth of its radius. It also assumes solid, smooth conductors with the current spread evenly around each, so it
        is not used with an offset, and braided shields, plating and roughness make real cable lossier. The default σ = 58 MS/m is annealed copper (1/58 Ω·mm²/m at 20 °C).
      </p>
      <h2>No cable presets</h2>
      <p>
        Cable datasheets list conductor and dielectric diameters and the velocity of propagation, but seldom ε<sub>r</sub> itself, and nominal dimensions carry tolerances that move{' '}
        <i>Z</i>
        <sub>0</sub> by an ohm or more. Rather than ship unverified preset values, enter the dimensions from the datasheet of the cable you use, with its velocity factor.
      </p>
      <h2>References</h2>
      <ol>
        <li>
          D. M. Pozar, <i>Microwave Engineering</i>, 4th ed., Wiley, 2012: §2.2 and Table 2.1 (coaxial line parameters), §2.7 (attenuation of a coaxial line), §3.1 (dielectric loss of
          TEM lines) and §3.5 (coaxial line, higher-order modes).
        </li>
      </ol>
      <Sources items={SOURCES} />
    </>
  );
}
