import { useRef, useState } from 'react';
import { KicadProjectSource, type KicadPickValues } from '../components/KicadProjectSource';
import { ToolPage } from '../components/ToolPage';
import { LenField, NumField, Panel, Result, Section, SelectField } from '../components/ui';
import { microstripHJ } from '../lib/closedform';
import { timingPatch, timingSource } from '../lib/kicadLossTiming';
import { cachedSolve } from '../lib/kicadRoutingSolve';
import { bandwidthFromRise, delayPsPerMm, kneeFrequency, lineVerdict, serpentine, wavelength } from '../lib/signal';
import { fmt, fromMm, si } from '../lib/units';
import { useSettings } from '../state/settings';
import { useUrlState } from '../state/useUrlState';

type Src = 'direct' | 'microstrip' | 'stripline';
const DEFAULTS = { src: 'direct', eeff: 3.2, er: 4.2, w: 0.2, h: 0.1, t: 0.035, len: 100, lenB: 98, skew: 5, tr: 100, f: 1000, msrc: 'mismatch', madd: 2, mh: 1, mw: 0.1, mg: 0.5 };

const VERDICT = {
  lumped: { label: 'Lumped', note: 'Its delay is within 1/6 of the rise time: reflections settle within the edge, and impedance and termination hardly matter.' },
  borderline: {
    label: 'Borderline',
    note: 'Lumped by the common 1/3 rule but not by the conservative 1/6 rule. An unterminated push-pull net (SPI, a fast GPIO) may ring: consider a series resistor at the driver.',
  },
  line: { label: 'Transmission line', note: 'Its delay is more than 1/3 of the rise time: control the impedance and terminate it, or the reflections will show on the edge.' },
};

/** A serpentine of a few bumps, to scale in its own frame, with its dimensions named. */
function SerpentineSketch({ h, w, gap }: { h: number; w: number; gap: number }) {
  const n = 3;
  const p = gap + w; // leg pitch
  const unit = 100 / Math.max(h + 2 * p, 2 * n * p + 2 * p);
  const x0 = 26; // room on the left for the height dimension
  const y0 = 10 + h * unit;
  let d = `M ${x0 - p * unit} ${y0}`;
  for (let i = 0; i < n; i++) {
    const x = x0 + 2 * i * p * unit;
    d += ` L ${x} ${y0} L ${x} ${y0 - h * unit} L ${x + p * unit} ${y0 - h * unit} L ${x + p * unit} ${y0}`;
  }
  d += ` L ${x0 + 2 * n * p * unit} ${y0}`;
  const width = x0 + 2 * n * p * unit + 10;
  const height = y0 + 18;
  const sw = Math.max(1, w * unit);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full max-w-[340px]" role="img" aria-label="Serpentine: bump height H, gap S between legs, trace width W">
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={sw} strokeLinejoin="miter" />
      <line x1={x0 - 9} y1={y0} x2={x0 - 9} y2={y0 - h * unit} stroke="currentColor" strokeWidth={0.6} />
      <text x={x0 - 16} y={y0 - (h * unit) / 2} fontSize={6} textAnchor="middle" dominantBaseline="middle" fill="currentColor">H</text>
      <line x1={x0 + p * unit + sw / 2} y1={y0 + 6} x2={x0 + 2 * p * unit - sw / 2} y2={y0 + 6} stroke="currentColor" strokeWidth={0.6} />
      <text x={x0 + 1.5 * p * unit} y={y0 + 13} fontSize={6} textAnchor="middle" fill="currentColor">S</text>
      <text x={x0 + 2 * n * p * unit} y={y0 - 4} fontSize={6} textAnchor="end" fill="currentColor">W</text>
    </svg>
  );
}

export default function Timing() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const { unit } = useSettings();
  const src = p.src as Src;
  const eeff = src === 'direct' ? p.eeff : src === 'stripline' ? p.er : p.w > 0 && p.h > 0 ? microstripHJ(p.w, p.h, p.t, p.er).eeff : NaN;
  const ok = eeff >= 1;
  const tpd = ok ? delayPsPerMm(eeff) : NaN; // ps/mm
  const L = (mm: number) => `${fmt(fromMm(mm, unit), 4)} ${unit}`;
  const trS = p.tr * 1e-12;
  const critical = trS / (tpd * 1e-12);
  const lambda = wavelength(p.f * 1e6, eeff) * 1e3;
  const verdict = ok && p.tr > 0 && p.len > 0 ? lineVerdict(tpd * p.len * 1e-12, trS) : null;
  const mismatch = Math.abs(p.len - p.lenB);
  const toAdd = p.msrc === 'enter' ? p.madd : mismatch;
  const serp = serpentine(toAdd, p.mh, p.mw, p.mg);

  // From KiCad Project: εeff is solved on the worker (the routing check's solve, shared cache), then everything is set at once
  const [kicadNote, setKicadNote] = useState<string | null>(null);
  const applyRun = useRef(0);
  const applyKicad = async (v: KicadPickValues) => {
    const run = ++applyRun.current;
    const src = timingSource(v, L);
    if ('error' in src) {
      setKicadNote(src.error);
      return;
    }
    setKicadNote(`Solving the line on ${src.layer}…`);
    const r = await cachedSolve(src.req);
    if (run !== applyRun.current) return;
    const e = r.ok && r.result ? (src.diff ? r.result.odd?.eeff : r.result.se?.eeff) : undefined;
    if (!e) {
      setKicadNote(`The field solver found no εeff for ${src.what}${r.ok ? '' : `: ${r.error}`}.`);
      return;
    }
    const out = timingPatch(v, src, e, L);
    set(out.patch);
    setKicadNote(out.note);
  };

  const properties = (
    <>
      <Section title="Effective Dielectric Constant">
        <SelectField
          label="Source"
          value={src}
          onChange={(v) => set({ src: v })}
          options={[
            { value: 'direct', label: 'Enter εeff' },
            { value: 'microstrip', label: 'Microstrip (H&J)' },
            { value: 'stripline', label: 'Stripline (εeff = εr)' },
          ]}
        />
        {src === 'direct' ? (
          <NumField label="Effective εr" symbol="εeff" value={p.eeff} onChange={(v) => set({ eeff: v })} min={1} allowZero hint="Take εeff from the impedance calculator for the most accurate value." />
        ) : (
          <NumField label="Laminate εr" symbol="εr" value={p.er} onChange={(v) => set({ er: v })} min={1} allowZero />
        )}
        {src === 'microstrip' && (
          <>
            <LenField label="Trace width" symbol="W" value={p.w} onChange={(v) => set({ w: v })} />
            <LenField label="Height to plane" symbol="H" value={p.h} onChange={(v) => set({ h: v })} />
            <LenField label="Copper thickness" symbol="T" value={p.t} onChange={(v) => set({ t: v })} units={['mm', 'mil', 'um', 'oz']} />
          </>
        )}
      </Section>
      <Section title="Length and Skew">
        <LenField label="Trace length" value={p.len} onChange={(v) => set({ len: v })} units={['mm', 'mil', 'in', 'cm']} />
        <LenField label="Second trace length" value={p.lenB} onChange={(v) => set({ lenB: v })} units={['mm', 'mil', 'in', 'cm']} />
        <NumField label="Allowed skew" value={p.skew} onChange={(v) => set({ skew: v })} unit="ps" />
      </Section>
      <Section title="Serpentine (Meander)">
        <SelectField
          label="Length to add"
          value={p.msrc}
          onChange={(v) => set({ msrc: v })}
          options={[
            { value: 'mismatch', label: 'Mismatch of the traces' },
            { value: 'enter', label: 'Enter a length' },
          ]}
        />
        {p.msrc === 'enter' && <LenField label="Length to add" symbol="ΔL" value={p.madd} onChange={(v) => set({ madd: v })} units={['mm', 'mil', 'in']} />}
        <LenField label="Bump height" symbol="H" value={p.mh} onChange={(v) => set({ mh: v })} hint="How far the trace swings out from its path, centre line to centre line." />
        <LenField label="Trace width" symbol="W" value={p.mw} onChange={(v) => set({ mw: v })} />
        <LenField label="Gap between legs" symbol="S" value={p.mg} onChange={(v) => set({ mg: v })} hint="Edge to edge between the parallel runs of the serpentine. TI's guideline is at least 5 trace widths." />
      </Section>
      <Section title="Edge Rate and Frequency">
        <NumField label="Rise time (10–90 %)" symbol="tr" value={p.tr} onChange={(v) => set({ tr: v })} unit="ps" />
        <NumField label="Frequency" symbol="f" value={p.f} onChange={(v) => set({ f: v })} unit="MHz" />
      </Section>
      <KicadProjectSource
        pick={['layer', 'pair', 'net']}
        labels={{ layer: 'εeff from layer' }}
        onApply={(v) => void applyKicad(v)}
        note={kicadNote ?? 'Apply sets εeff of the line on the layer (field solver, as the routing check), and the lengths: P and N of a pair, the length of a net, or a pair against a net.'}
      />
    </>
  );

  return (
    <ToolPage
      title="Propagation Delay, Rise Time & Length Matching"
      description="Propagation delay and effective εr, whether a trace is a transmission line for its rise time, length matching from a skew budget with the serpentine that makes it up, rise time to bandwidth, and wavelength on the board."
      onReset={reset}
      properties={properties}
      status={ok ? `εeff ${fmt(eeff, 4)} · ${fmt(tpd, 4)} ps/mm · ${fmt(tpd * 25.4, 4)} ps/in` : 'Check the inputs'}
      method={<Method />}
    >
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="Propagation">
          <table className="tbl">
            <tbody>
              <Result label="Effective dielectric constant" value={fmt(eeff, 4)} strong sub={src === 'microstrip' ? 'Hammerstad–Jensen, no solder mask' : undefined} />
              <Result label="Delay per length" value={fmt(tpd, 4)} unit="ps/mm" strong sub={`${fmt(tpd * 25.4, 4)} ps/in · ${fmt(tpd, 4)} ns/m`} />
              <Result label="Velocity" value={fmt(100 / Math.sqrt(eeff), 3)} unit="% of c" sub={`${fmt(299.792458 / Math.sqrt(eeff), 4)} mm/ns`} />
              <Result label="Delay of the trace" value={si(tpd * p.len * 1e-12, 's')} />
            </tbody>
          </table>
        </Panel>
        <Panel title="Length Matching">
          <table className="tbl">
            <tbody>
              <Result label="Length for the skew budget" value={L(p.skew / tpd)} strong sub={`maximum mismatch for ${fmt(p.skew, 4)} ps`} />
              <Result label="Mismatch of the two traces" value={L(Math.abs(p.len - p.lenB))} sub={`${fmt(Math.abs(p.len - p.lenB) * tpd, 4)} ps skew`} />
            </tbody>
          </table>
        </Panel>
        <Panel title="Edge Rate">
          <table className="tbl">
            <tbody>
              <Result label="Bandwidth (0.35 / tr)" value={si(bandwidthFromRise(trS), 'Hz')} strong />
              <Result label="Knee frequency (0.5 / tr)" value={si(kneeFrequency(trS), 'Hz')} />
              <Result label="Rise-time length" value={L(critical)} sub="distance the edge travels during tr" />
            </tbody>
          </table>
        </Panel>
        <Panel title="Transmission Line or Lumped?">
          <table className="tbl">
            <tbody>
              <Result label="This trace" value={verdict ? VERDICT[verdict.kind].label : '—'} strong sub={verdict ? `delay ${si(tpd * p.len * 1e-12, 's')} = ${fmt(verdict.ratio, 3)} × tr` : undefined} />
              <Result label="Critical length (tr/6, conservative)" value={L(critical / 6)} />
              <Result label="Critical length (tr/3, common)" value={L(critical / 3)} />
            </tbody>
          </table>
          {verdict && <p className="px-2.5 pb-2 text-muted">{VERDICT[verdict.kind].note} A rule of thumb: on an impedance-controlled bus, design to the impedance whatever the length.</p>}
        </Panel>
        <Panel title="Serpentine Tuning">
          <table className="tbl">
            <tbody>
              <Result label="Length to add" value={L(toAdd)} sub={`${fmt(toAdd * tpd, 4)} ps at this delay${p.msrc === 'enter' ? '' : ', the mismatch of the two traces'}`} />
              <Result label="Added per bump" value={serp.perBump > 0 ? L(serp.perBump) : '—'} sub="2H, less (√2 − 1)·d at each of the 4 corners, d = 1.5 W" />
              <Result label="Bumps needed" value={serp.perBump > 0 ? String(serp.bumps) : '—'} strong sub={serp.bumps ? `adds ${L(serp.added)} (${fmt(serp.added * tpd, 4)} ps)` : undefined} />
              <Result label="Serpentine section" value={L(serp.sectionLength)} sub={`along the route, ${L(serp.pitch)} per bump; ${L(p.mh + p.mw)} wide`} />
            </tbody>
          </table>
          <div className="px-2.5 pb-2">
            <SerpentineSketch h={Math.max(p.mh, 0.01)} w={Math.max(p.mw, 0.001)} gap={Math.max(p.mg, 0.001)} />
            {!serp.gapOk && <p className="text-[var(--accent-ink)]">The gap is under 5 trace widths ({L(5 * p.mw)}): the legs couple, and the coupled serpentine arrives earlier than its length says.</p>}
            {!serp.fits && <p className="text-[var(--accent-ink)]">The bump is too small for its 45° corners: make H and S + W at least {L(2 * (1.5 * p.mw) / Math.SQRT2)}.</p>}
            <p className="text-muted">Put the serpentine near the end where the mismatch arises, with bends of 135° or more.</p>
          </div>
        </Panel>
        <Panel title="Wavelength on the Board">
          <table className="tbl">
            <tbody>
              <Result label={`λ at ${fmt(p.f, 4)} MHz`} value={L(lambda)} strong />
              <Result label="λ / 4" value={L(lambda / 4)} />
              <Result label="λ / 10" value={L(lambda / 10)} />
              <Result label="λ / 20" value={L(lambda / 20)} sub="common stitching-via pitch rule" />
            </tbody>
          </table>
        </Panel>
      </div>
    </ToolPage>
  );
}

export function Method() {
  return (
    <>
      <h2>Relations used</h2>
      <div className="eq">
        <span className="no">(1)</span>
        <i>t</i>
        <sub>pd</sub> = √ε<sub>eff</sub> / <i>c</i>
      </div>
      <p>
        A signal travels at <i>c</i>/√ε<sub>eff</sub>. In stripline ε<sub>eff</sub> equals the laminate εr. In microstrip part of the field is in air, so ε<sub>eff</sub> is lower. The
        microstrip option uses the Hammerstad–Jensen expressions with thickness correction. For coated or coupled lines, take ε<sub>eff</sub> from the impedance calculator's field solver.
      </p>
      <div className="eq">
        <span className="no">(2)</span>
        <i>f</i>
        <sub>3dB</sub> ≈ 0.35 / <i>t</i>
        <sub>r</sub>,&nbsp;&nbsp; <i>f</i>
        <sub>knee</sub> ≈ 0.5 / <i>t</i>
        <sub>r</sub>
      </div>
      <h2>Transmission line or lumped?</h2>
      <p>
        A trace whose delay <i>T</i>
        <sub>D</sub> = <i>t</i>
        <sub>pd</sub>·<i>L</i> is short against the rise time behaves as a lump: its reflections are over before the edge is. The page compares <i>T</i>
        <sub>D</sub> with <i>t</i>
        <sub>r</sub> by the two rules in use: within <i>t</i>
        <sub>r</sub>/6 (the conservative rule) the trace is lumped, beyond <i>t</i>
        <sub>r</sub>/3 (the common rule) it is a transmission line, and in between it is borderline [4]. Both are rules of thumb, and others from 1/2 to 1/20 are quoted: how long a
        trace may be really depends on how far its impedance is from the target and on the bandwidth the signal needs [5]. On an impedance-controlled bus, design to the impedance; the
        rule is useful for push-pull nets without an impedance specification, such as SPI, to decide whether a series resistor is needed.
      </p>
      <h2>Serpentine tuning</h2>
      <p>
        A serpentine adds length with bumps of height <i>H</i>: each replaces 2(<i>S</i> + <i>W</i>) of straight route with two legs of <i>H</i> and the runs across, so it adds 2<i>H</i>.
        Each of its four corners is two 45° bends with a diagonal <i>d</i> = 1.5 <i>W</i> (TI: bends of 135° or more, the diagonal at least 1.5 trace widths [6]), and a chamfered
        corner is (√2 − 1)·<i>d</i> shorter than a square one:
      </p>
      <div className="eq">
        <span className="no">(3)</span>
        Δ<i>L</i>
        <sub>bump</sub> = 2<i>H</i> − 4(√2 − 1)·<i>d</i>,&nbsp;&nbsp; <i>N</i> = ⌈Δ<i>L</i> / Δ<i>L</i>
        <sub>bump</sub>⌉,&nbsp;&nbsp; section = 2<i>N</i>(<i>S</i> + <i>W</i>)
      </div>
      <p>
        Keep the parallel runs at least 5 trace widths apart [6]: closer, the legs couple, part of the signal crosses between them, and the serpentine delays less than its length.
        Match a differential pair by adding the serpentine near the end where the mismatch arises [6]. The delay of a serpentine is taken as that of a straight trace of its length.
      </p>
      <h2>References</h2>
      <ol>
        <li>E. Hammerstad, Ø. Jensen, “Accurate Models for Microstrip Computer-Aided Design,” IEEE MTT-S, 1980.</li>
        <li>H. Johnson, M. Graham, <i>High-Speed Digital Design</i>, Prentice Hall, 1993.</li>
        <li>E. Bogatin, <i>Signal and Power Integrity – Simplified</i>, 3rd ed., 2018.</li>
        <li>
          Siemens EDA, “Fundamentals of SI (Part 2) – Transmission lines,” Electronic Systems Design blog, 3 May 2010: the 1/3 rise-time rule and the more conservative 1/6.
          https://blogs.sw.siemens.com/electronic-systems-design/2010/05/03/fundamentals-of-si-part-2-transmission-lines/
        </li>
        <li>
          Z. Peterson, “Can We All Stop Quoting the Critical Length Rule?”, Altium, 20 March 2023: the fractions quoted (1/2 to 1/20) and what the allowed length depends on.
          https://resources.altium.com/p/can-we-all-stop-quoting-critical-length-rule
        </li>
        <li>
          Texas Instruments SPRACP4A, “Jacinto7 AM6x, TDA4x, and DRA8x High-Speed Interface Design Guidelines,” June 2024: §2.3 (serpentine near the mismatched end), §2.14 and
          Figure 2-16 (bends of 135° or more, diagonal at least 1.5 × trace width, parallel runs at least 5 × trace width apart). https://www.ti.com/lit/an/spracp4/spracp4.pdf
        </li>
      </ol>
    </>
  );
}
