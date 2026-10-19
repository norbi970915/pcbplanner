import { useState } from 'react';
import { KicadPlaneSource, type KicadPlaneApplied } from '../components/KicadPlaneSource';
import { ToolPage } from '../components/ToolPage';
import { Check, LenField, Notes, NumField, Panel, Result, Section } from '../components/ui';
import { capBand, capImpedance, capsNeeded, logSpace, pdnImpedance, planeCapacitance, planeCapPerCm2, srf, targetImpedance, type CapModel } from '../lib/pdn';
import { fmt, si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = {
  v: 1.0,
  ripple: 5,
  step: 2,
  useMax: false,
  imax: 4,
  pl: 100,
  pw: 100,
  pd: 0.1,
  er: 4.3,
  c: 100, // nF
  esr: 20, // mΩ
  esl: 1, // nH, mounted
  f: 10, // MHz
  auto: true,
  n: 4,
};

export default function Pdn() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const [kicad, setKicad] = useState<KicadPlaneApplied | null>(null);
  const errors: string[] = [];
  if (!(p.v > 0)) errors.push('Supply voltage must be greater than 0.');
  if (!(p.ripple > 0)) errors.push('Allowed ripple must be greater than 0 %.');
  if (p.useMax ? !(p.imax > 0) : !(p.step > 0)) errors.push('Transient current must be greater than 0.');
  if (!(p.pl > 0 && p.pw > 0)) errors.push('Plane dimensions must be greater than 0.');
  if (!(p.pd > 0)) errors.push('Dielectric thickness must be greater than 0.');
  if (!(p.er >= 1)) errors.push('Dielectric constant must be at least 1.');
  if (!(p.c > 0)) errors.push('Capacitance must be greater than 0.');
  if (!(p.esr >= 0)) errors.push('ESR cannot be negative.');
  if (!(p.esl > 0)) errors.push('Mounted ESL must be greater than 0.');
  if (!(p.f > 0)) errors.push('Frequency must be greater than 0.');
  if (!p.auto && !(p.n >= 1 && Number.isInteger(p.n))) errors.push('Capacitor count must be a whole number ≥ 1.');
  const ok = errors.length === 0;

  const dI = p.useMax ? p.imax / 2 : p.step;
  const zt = targetImpedance(p.v, p.ripple, dI);
  const cp = planeCapacitance(p.pl * p.pw, p.pd, p.er);
  const cpCm2 = planeCapPerCm2(p.pd, p.er);
  const cap: CapModel = { c: p.c * 1e-9, esr: p.esr * 1e-3, esl: p.esl * 1e-9 };
  const fHz = p.f * 1e6;
  const f0 = srf(cap);
  const z1 = capImpedance(cap, fHz);
  const needed = capsNeeded(cap, fHz, zt);
  const n = p.auto ? needed : Math.max(1, Math.round(p.n));
  const band = capBand(cap, n, zt);
  const zTotal = pdnImpedance(cap, n, cp, fHz);
  const zPlane = 1 / (2 * Math.PI * fHz * cp);

  // From KiCad project: the plane pair's overlap area (as L × W), dielectric thickness and series εr
  const applyKicad = (v: KicadPlaneApplied) => {
    set(v.fields);
    setKicad(v);
  };
  const f = kicad?.fields;
  const kicadCurrent = !!f && f.pl === p.pl && f.pw === p.pw && (f.pd === undefined || f.pd === p.pd) && (f.er === undefined || f.er === p.er);
  const kicadNote = kicad && f && (
    <>
      Applied: L {fmt(f.pl, 6)} mm × W {fmt(f.pw, 6)} mm (the x extent of the overlap, and the area divided by L){f.pd !== undefined ? `, d ${fmt(f.pd, 6)} mm, εr ${fmt(f.er ?? NaN, 6)}` : ''}.
      {Number.isFinite(kicad.c) && <> The pair: {si(kicad.c, 'F', 5)}; equation (2) with these inputs: {si(planeCapacitance(f.pl * f.pw, f.pd ?? p.pd, f.er ?? p.er), 'F', 5)}.</>}
      {!kicadCurrent && ' The plane inputs have been changed since.'}
    </>
  );

  const notes: string[] = [];
  if (ok && p.esr * 1e-3 > zt) notes.push(`ESR alone (${si(cap.esr, 'Ω', 3)}) is above the target, so even at resonance each capacitor needs company: at least ${Math.ceil(cap.esr / zt)} in parallel.`);
  if (ok && zTotal > zt * 1.0001) notes.push(`With the plane capacitance included, |Z| at ${si(fHz, 'Hz', 3)} is ${si(zTotal, 'Ω', 3)}, above the target. Look for a parallel-resonance peak in the plot.`);

  const properties = (
    <>
      <Section title="Target impedance">
        <NumField label="Supply voltage" symbol="V" value={p.v} onChange={(v) => set({ v })} unit="V" />
        <NumField label="Allowed ripple" value={p.ripple} onChange={(v) => set({ ripple: v })} unit="%" />
        <Check label="ΔI = 50 % of max current" checked={p.useMax} onChange={(v) => set({ useMax: v })} hint="Bogatin's rule of thumb when the transient step is unknown" />
        {p.useMax ? (
          <NumField label="Max current" symbol="Imax" value={p.imax} onChange={(v) => set({ imax: v })} unit="A" />
        ) : (
          <NumField label="Transient step" symbol="ΔI" value={p.step} onChange={(v) => set({ step: v })} unit="A" />
        )}
      </Section>
      <Section title="Plane pair">
        <LenField label="Length" symbol="L" value={p.pl} onChange={(v) => set({ pl: v })} units={['mm', 'cm', 'in', 'mil']} />
        <LenField label="Width" symbol="W" value={p.pw} onChange={(v) => set({ pw: v })} units={['mm', 'cm', 'in', 'mil']} />
        <LenField label="Dielectric thickness" symbol="d" value={p.pd} onChange={(v) => set({ pd: v })} units={['mm', 'mil', 'um']} />
        <NumField label="Dielectric constant" symbol="εr" value={p.er} onChange={(v) => set({ er: v })} min={1} allowZero />
      </Section>
      <KicadPlaneSource onApply={applyKicad} note={kicadNote} />
      <Section title="Decoupling capacitor">
        <NumField label="Capacitance" symbol="C" value={p.c} onChange={(v) => set({ c: v })} unit="nF" />
        <NumField label="ESR" value={p.esr} onChange={(v) => set({ esr: v })} unit="mΩ" allowZero />
        <NumField label="Mounted ESL" value={p.esl} onChange={(v) => set({ esl: v })} unit="nH" hint="Capacitor ESL plus pads, vias and the path to the planes" />
        <NumField label="Frequency of interest" symbol="f" value={p.f} onChange={(v) => set({ f: v })} unit="MHz" />
        <Check label="Plot the required count" checked={p.auto} onChange={(v) => set({ auto: v })} />
        {!p.auto && <NumField label="Capacitors in parallel" symbol="N" value={p.n} onChange={(v) => set({ n: v })} />}
      </Section>
    </>
  );

  return (
    <ToolPage
      title="PDN Impedance Calculator"
      description="Power distribution network: target impedance, plane-pair capacitance, decoupling-capacitor resonance and impedance, the number of capacitors needed, and an impedance-versus-frequency plot."
      onReset={reset}
      properties={properties}
      status={ok ? `Ztarget ${si(zt, 'Ω', 3)}, ${needed} × ${si(cap.c, 'F', 3)} at ${si(fHz, 'Hz', 3)}, plane ${si(cp, 'F', 3)}` : 'Check the inputs'}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      <Notes items={notes} />
      {ok && (
        <>
          <div className="grid gap-3 xl:grid-cols-3">
            <Panel title="Target Impedance">
              <table className="tbl">
                <tbody>
                  <Result label="Target impedance" value={si(zt, 'Ω')} strong />
                  <Result label="Transient current step" value={fmt(dI, 4)} unit="A" sub={p.useMax ? '50 % of the maximum current' : undefined} />
                  <Result label="Allowed ripple" value={si((p.v * p.ripple) / 100, 'V')} />
                </tbody>
              </table>
            </Panel>
            <Panel title="Plane Pair">
              <table className="tbl">
                <tbody>
                  <Result label="Plane capacitance" value={si(cp, 'F')} strong />
                  <Result label="Per unit area" value={si(cpCm2, 'F')} unit="/cm²" />
                  <Result label="Area" value={fmt((p.pl * p.pw) / 100, 4)} unit="cm²" />
                  {kicadCurrent && kicad && Number.isFinite(kicad.c) && (
                    <Result label="KiCad plane pair" value={si(kicad.c, 'F')} sub={`${kicad.label}; ${Math.abs(cp - kicad.c) <= 1e-4 * kicad.c ? 'agrees with the line above within 0.01 %' : `${fmt((100 * (cp - kicad.c)) / kicad.c, 3)} % from the line above`}`} />
                  )}
                  <Result label={`|Z| at ${si(fHz, 'Hz', 3)}`} value={si(zPlane, 'Ω')} sub="ideal capacitor, no spreading inductance" />
                </tbody>
              </table>
            </Panel>
            <Panel title="Decoupling Capacitor">
              <table className="tbl">
                <tbody>
                  <Result label="Series resonance" value={si(f0, 'Hz')} strong />
                  <Result label={`|Z| of one capacitor at ${si(fHz, 'Hz', 3)}`} value={si(z1, 'Ω')} sub={fHz < f0 ? 'capacitive region' : 'inductive region'} />
                  <Result label="Capacitors needed" value={String(needed)} strong sub={`so that |Z|/N ≤ Ztarget at ${si(fHz, 'Hz', 3)}`} />
                  <Result
                    label={`Band where ${n} capacitor${n > 1 ? 's' : ''} meet the target`}
                    value={band ? `${si(band.fLow, 'Hz', 3)} – ${si(band.fHigh, 'Hz', 3)}` : 'none'}
                    sub="capacitors only, plane not included"
                  />
                  <Result label={`PDN |Z| at ${si(fHz, 'Hz', 3)}`} value={si(zTotal, 'Ω')} sub={`${n} capacitor${n > 1 ? 's' : ''} ∥ plane`} />
                </tbody>
              </table>
            </Panel>
          </div>
          <Panel title={`|Z| versus frequency: ${n} × ${si(cap.c, 'F', 3)} ∥ ${si(cp, 'F', 3)} plane`}>
            <PdnPlot cap={cap} n={n} planeC={cp} zt={zt} fMark={fHz} />
          </Panel>
        </>
      )}
    </ToolPage>
  );
}

const F0 = 1e5;
const F1 = 1e9;

function PdnPlot({ cap, n, planeC, zt, fMark }: { cap: CapModel; n: number; planeC: number; zt: number; fMark: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 300, ml = 58, mr = 14, mt = 30, mb = 34;
  const fs = logSpace(F0, F1, 241);
  const total = fs.map((f) => pdnImpedance(cap, n, planeC, f));
  const caps = fs.map((f) => capImpedance(cap, f) / n);
  const plane = fs.map((f) => 1 / (2 * Math.PI * f * planeC));

  const lo = Math.min(...total, ...caps, zt);
  const hi = Math.max(...total, ...caps, zt);
  const y0 = Math.floor(Math.log10(lo) - 0.05);
  const y1 = Math.max(y0 + 1, Math.ceil(Math.log10(hi) + 0.05));
  const x0 = Math.log10(F0), x1 = Math.log10(F1);
  const X = (f: number) => ml + ((Math.log10(f) - x0) / (x1 - x0)) * (W - ml - mr);
  const Y = (z: number) => mt + ((y1 - Math.log10(z)) / (y1 - y0)) * (H - mt - mb);
  const path = (zs: number[]) => zs.map((z, i) => `${i ? 'L' : 'M'}${X(fs[i]).toFixed(1)},${Y(z).toFixed(1)}`).join('');

  const decadesX = Array.from({ length: x1 - x0 + 1 }, (_, i) => 10 ** (x0 + i));
  const decadesY = Array.from({ length: y1 - y0 + 1 }, (_, i) => 10 ** (y0 + i));
  const minor = (a: number, b: number) => {
    const out: number[] = [];
    for (let d = a; d < b; d++) for (let k = 2; k <= 9; k++) out.push(k * 10 ** d);
    return out;
  };

  const hf = hover === null ? null : fs[hover];
  const legend = [
    { label: 'PDN total', stroke: 'var(--accent)', dash: undefined },
    { label: `${n} capacitor${n > 1 ? 's' : ''}`, stroke: 'var(--copper)', dash: '6 4' },
    { label: 'Plane', stroke: 'var(--muted)', dash: '2 3' },
    { label: 'Ztarget', stroke: 'var(--err-line)', dash: '8 3 2 3' },
  ];

  return (
    <div className="px-2 py-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full max-w-[900px]"
        role="img"
        aria-label="PDN impedance magnitude versus frequency, log-log"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * W;
          if (x < ml || x > W - mr) return setHover(null);
          setHover(Math.round(((x - ml) / (W - ml - mr)) * (fs.length - 1)));
        }}
      >
        <defs>
          <clipPath id="pdn-clip">
            <rect x={ml} y={mt} width={W - ml - mr} height={H - mt - mb} />
          </clipPath>
        </defs>
        {minor(x0, x1).map((f) => (
          <line key={`mx${f}`} x1={X(f)} x2={X(f)} y1={mt} y2={H - mb} stroke="var(--line)" strokeWidth={0.5} opacity={0.5} />
        ))}
        {minor(y0, y1).map((z) => (
          <line key={`my${z}`} x1={ml} x2={W - mr} y1={Y(z)} y2={Y(z)} stroke="var(--line)" strokeWidth={0.5} opacity={0.5} />
        ))}
        {decadesX.map((f) => (
          <g key={`x${f}`}>
            <line x1={X(f)} x2={X(f)} y1={mt} y2={H - mb} stroke="var(--line)" strokeWidth={1} />
            <text x={X(f)} y={H - mb + 14} textAnchor="middle" fontSize={11} fill="var(--muted)">
              {si(f, 'Hz', 3)}
            </text>
          </g>
        ))}
        {decadesY.map((z) => (
          <g key={`y${z}`}>
            <line x1={ml} x2={W - mr} y1={Y(z)} y2={Y(z)} stroke="var(--line)" strokeWidth={1} />
            <text x={ml - 5} y={Y(z) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
              {si(z, 'Ω', 3)}
            </text>
          </g>
        ))}
        <text x={(ml + W - mr) / 2} y={H - 4} textAnchor="middle" fontSize={11} fill="var(--muted)">
          Frequency
        </text>
        <g clipPath="url(#pdn-clip)" fill="none" strokeWidth={2} strokeLinejoin="round">
          <line x1={ml} x2={W - mr} y1={Y(zt)} y2={Y(zt)} stroke="var(--err-line)" strokeDasharray="8 3 2 3" strokeWidth={1.5} />
          <path d={path(plane)} stroke="var(--muted)" strokeDasharray="2 3" />
          <path d={path(caps)} stroke="var(--copper)" strokeDasharray="6 4" />
          <path d={path(total)} stroke="var(--accent)" />
          {fMark >= F0 && fMark <= F1 && <line x1={X(fMark)} x2={X(fMark)} y1={mt} y2={H - mb} stroke="var(--muted)" strokeWidth={1} strokeDasharray="1 3" />}
        </g>
        <rect x={ml} y={mt} width={W - ml - mr} height={H - mt - mb} fill="none" stroke="var(--line)" />
        {legend.map((l, i) => (
          <g key={l.label} transform={`translate(${ml + i * 140}, 12)`}>
            <line x1={0} x2={22} y1={0} y2={0} stroke={l.stroke} strokeWidth={2} strokeDasharray={l.dash} />
            <text x={28} y={4} fontSize={11} fill="var(--ink)">
              {l.label}
            </text>
          </g>
        ))}
        {hover !== null && hf !== null && (
          <g pointerEvents="none">
            <line x1={X(hf)} x2={X(hf)} y1={mt} y2={H - mb} stroke="var(--ink)" strokeWidth={1} opacity={0.6} />
            <circle cx={X(hf)} cy={Y(total[hover])} r={4} fill="var(--accent)" stroke="var(--sheet)" strokeWidth={2} />
            {(() => {
              const right = X(hf) < W / 2;
              const bx = right ? X(hf) + 8 : X(hf) - 168;
              return (
                <g transform={`translate(${bx}, ${mt + 6})`}>
                  <rect width={160} height={62} fill="var(--sheet)" stroke="var(--line-strong)" />
                  <text x={8} y={15} fontSize={11} fill="var(--ink)" fontWeight={600}>
                    {si(hf, 'Hz', 3)}
                  </text>
                  <text x={8} y={30} fontSize={11} fill="var(--ink)">
                    PDN {si(total[hover], 'Ω', 3)}
                  </text>
                  <text x={8} y={44} fontSize={11} fill="var(--muted)">
                    caps {si(caps[hover], 'Ω', 3)}
                  </text>
                  <text x={8} y={57} fontSize={11} fill="var(--muted)">
                    plane {si(plane[hover], 'Ω', 3)}
                  </text>
                </g>
              );
            })()}
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
        This is a first-order, lumped frequency-domain model. The supply must hold its ripple within a band while the load current steps by Δ<i>I</i>, so the PDN impedance seen by the load
        must stay below a flat target impedance:
      </p>
      <div className="eq">
        <span className="no">(1)</span>
        <i>Z</i>
        <sub>target</sub> = <i>V</i> · ripple / Δ<i>I</i>
      </div>
      <p>
        When the transient step is unknown, Bogatin suggests assuming it is half the maximum current. The plane pair is an ideal parallel-plate capacitor (fringing is ignored):
      </p>
      <div className="eq">
        <span className="no">(2)</span>
        <i>C</i>
        <sub>plane</sub> = ε<sub>0</sub> ε<sub>r</sub> <i>A</i> / <i>d</i>
      </div>
      <p>Each decoupling capacitor is a series RLC. Its ESL is the <i>mounted</i> inductance, which includes the pads, vias and the path to the planes:</p>
      <div className="eq">
        <span className="no">(3)</span>
        <i>Z</i>(<i>f</i>) = ESR + j(ω<i>L</i> − 1/ω<i>C</i>),&nbsp;&nbsp; <i>f</i>
        <sub>SRF</sub> = 1 / (2π√(<i>LC</i>))
      </div>
      <p>
        <i>N</i> identical capacitors in parallel give |<i>Z</i>|/<i>N</i>, so the count needed at a frequency is ⌈|<i>Z</i>(<i>f</i>)| / <i>Z</i>
        <sub>target</sub>⌉. The band edges come from solving |ESR + j<i>X</i>| = <i>N</i>·<i>Z</i>
        <sub>target</sub> for ω. The plot combines the capacitors and the plane in parallel: 1/<i>Z</i> = <i>N</i>/<i>Z</i>
        <sub>cap</sub> + jω<i>C</i>
        <sub>plane</sub>. The capacitor inductance and the plane capacitance form a parallel resonance, and the impedance peaks there.
      </p>
      <h3>Limits</h3>
      <p>
        The model leaves out the voltage regulator (which dominates below roughly 100 kHz), the spreading inductance and cavity resonances of the planes, the package and on-die
        capacitance (which dominate above roughly 100 MHz), and differences in the position of each capacitor. A real design mixes capacitor values and should be checked with a PDN
        simulator or a measurement. Use this page to check that the numbers are the right order of magnitude.
      </p>
      <h3>From a KiCad project</h3>
      <p>
        With a KiCad project loaded, the From KiCad Project section takes the plane pair from the board. Choose the power net and the ground net (it starts at the largest net
        whose name reads as ground: GND, AGND, VSS and the like). A plane pair is two neighbouring copper layers in the stackup, one with a zone of the power net and the other
        with a zone of the ground net. Its area is the overlap of the two nets’ zone outlines inside the board outline (Edge.Cuts). A zone’s cut-outs are removed, and so are
        higher-priority zones of other nets and keepouts that forbid pours on the same layer. The area is computed exactly for polygons: the board is cut into horizontal strips
        at every vertex and every crossing of two edges, and inside each strip the covered width changes linearly, so its mid-height value times the strip height is the
        strip’s area. Arcs are split into chords of at most 5°, which makes a circle 0.13 % small.
      </p>
      <p>
        The dielectric thickness <i>d</i> is the sum of the plies between the two copper layers in the stackup. The plies are capacitors in series, so <i>ε</i>
        <sub>r</sub> is their thickness-weighted harmonic mean, <i>d</i> / Σ(<i>t</i>
        <sub>i</sub>/<i>ε</i>
        <sub>ri</sub>); with one ply that is the ply’s own <i>ε</i>
        <sub>r</sub>, and with several it makes equation (2) give the series capacitance. Apply sets <i>L</i> to the width of the overlap in x and <i>W</i> to the area divided
        by <i>L</i>, so <i>L</i> × <i>W</i> is the overlap area. When the two nets form several pairs on the same dielectric they can be summed into one; pairs on different
        dielectrics are taken one at a time, because the calculator models one plane pair.
      </p>
      <p>
        Limits: the area comes from zone outlines, not from the filled copper, so anti-pads, clearances around other nets’ pads and vias, thermal reliefs, islands removed
        by the fill and hatched fills are not subtracted unless the outline itself leaves them out. Fringing is ignored, as in equation (2). Without the saved board text (a
        project that is not saved in this browser) only the zone areas per layer are known, and the overlap is taken as the smaller of the two: an upper bound.
      </p>
      <h2>References</h2>
      <ol>
        <li>E. Bogatin, <i>Signal and Power Integrity – Simplified</i>, 2nd ed., Prentice Hall, 2009, ch. 13 (the power distribution network).</li>
        <li>
          L. D. Smith, R. E. Anderson, D. W. Forehand, T. J. Pelc, T. Roy, “Power distribution system design methodology and capacitor selection for modern CMOS technology”,
          <i>IEEE Trans. Advanced Packaging</i>, vol. 22, no. 3, pp. 284–291, Aug. 1999.
        </li>
        <li>I. Novak, J. R. Miller, <i>Frequency-Domain Characterization of Power Distribution Networks</i>, Artech House, 2007.</li>
      </ol>
    </>
  );
}
