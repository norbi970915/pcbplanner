import { ToolPage } from '../components/ToolPage';
import { LenField, NumField, Panel, Result, Section, SelectField } from '../components/ui';
import { microstripHJ } from '../lib/closedform';
import { bandwidthFromRise, delayPsPerMm, kneeFrequency, wavelength } from '../lib/signal';
import { fmt, fromMm, si } from '../lib/units';
import { useSettings } from '../state/settings';
import { useUrlState } from '../state/useUrlState';

type Src = 'direct' | 'microstrip' | 'stripline';
const DEFAULTS = { src: 'direct', eeff: 3.2, er: 4.2, w: 0.2, h: 0.1, t: 0.035, len: 100, lenB: 98, skew: 5, tr: 100, f: 1000 };

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
      <Section title="Edge Rate and Frequency">
        <NumField label="Rise time (10–90 %)" symbol="tr" value={p.tr} onChange={(v) => set({ tr: v })} unit="ps" />
        <NumField label="Frequency" symbol="f" value={p.f} onChange={(v) => set({ f: v })} unit="MHz" />
      </Section>
    </>
  );

  return (
    <ToolPage
      title="Propagation Delay, εeff & Timing"
      description="Effective dielectric constant, propagation delay per length, trace length matching from a skew budget, rise time to bandwidth and knee frequency, critical length and wavelength on the board."
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
              <Result label="Critical length (tr/6 rule)" value={L(critical / 6)} sub="treat longer traces as transmission lines" />
            </tbody>
          </table>
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

function Method() {
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
      <p>The critical length is a rule of thumb: once a trace's delay exceeds about one sixth of the rise time, reflections become visible and the line should be terminated and impedance-controlled.</p>
      <h2>References</h2>
      <ol>
        <li>E. Hammerstad, Ø. Jensen, “Accurate Models for Microstrip Computer-Aided Design,” IEEE MTT-S, 1980.</li>
        <li>H. Johnson, M. Graham, <i>High-Speed Digital Design</i>, Prentice Hall, 1993.</li>
        <li>E. Bogatin, <i>Signal and Power Integrity – Simplified</i>, 3rd ed., 2018.</li>
      </ol>
    </>
  );
}
