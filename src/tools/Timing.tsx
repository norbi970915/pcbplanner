import { ToolPage } from '../components/ToolPage';
import { Group, LenField, NumField, Panel, Result } from '../components/ui';
import { bandwidthFromRise, delayPsPerMm, kneeFrequency, wavelength } from '../lib/signal';
import { fmt, fromMm, si } from '../lib/units';
import { useSettings } from '../state/settings';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { eeff: 3.2, len: 100, skew: 5, tr: 100, f: 1000, lenB: 98 };

export default function Timing() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const { unit } = useSettings();
  const ok = p.eeff >= 1;
  const tpd = ok ? delayPsPerMm(p.eeff) : NaN; // ps/mm
  const L = (mm: number) => `${fmt(fromMm(mm, unit), 4)} ${unit}`;
  const trS = p.tr * 1e-12;
  const critical = trS / (tpd * 1e-12); // mm per rise time
  const lambda = wavelength(p.f * 1e6, p.eeff) * 1e3; // mm

  return (
    <ToolPage
      title="Propagation Delay & Timing"
      description="Signal propagation delay per length, trace length matching from a skew budget, rise time to bandwidth and knee frequency, critical length and wavelength on the board."
      onReset={reset}
      method={<Method />}
    >
      <div className="grid gap-4 lg:grid-cols-[350px_minmax(0,1fr)]">
        <Panel title="Inputs">
          <Group title="Medium">
            <NumField label="Effective dielectric constant" symbol="εeff" value={p.eeff} onChange={(v) => set({ eeff: v })} min={1} allowZero hint="Take εeff from the impedance calculator. For stripline εeff = εr." />
          </Group>
          <Group title="Length and skew">
            <LenField label="Trace length" value={p.len} onChange={(v) => set({ len: v })} units={['mm', 'mil', 'in', 'cm']} />
            <LenField label="Second trace length" value={p.lenB} onChange={(v) => set({ lenB: v })} units={['mm', 'mil', 'in', 'cm']} />
            <NumField label="Allowed skew" value={p.skew} onChange={(v) => set({ skew: v })} unit="ps" />
          </Group>
          <Group title="Edge rate and frequency">
            <NumField label="Rise time (10–90 %)" symbol="tr" value={p.tr} onChange={(v) => set({ tr: v })} unit="ps" />
            <NumField label="Frequency" symbol="f" value={p.f} onChange={(v) => set({ f: v })} unit="MHz" />
          </Group>
        </Panel>

        <div className="min-w-0 space-y-4">
          <Panel title="Propagation">
            <table className="tbl">
              <tbody>
                <Result label="Delay per length" value={fmt(tpd, 4)} unit="ps/mm" strong sub={`${fmt(tpd * 25.4, 4)} ps/in · ${fmt(tpd, 4)} ns/m`} />
                <Result label="Velocity" value={fmt(100 / Math.sqrt(p.eeff), 3)} unit="% of c" sub={`${fmt(299.792458 / Math.sqrt(p.eeff), 4)} mm/ns`} />
                <Result label="Delay of the trace" value={si(tpd * p.len * 1e-12, 's')} />
              </tbody>
            </table>
          </Panel>
          <Panel title="Length matching">
            <table className="tbl">
              <tbody>
                <Result label="Length for the skew budget" value={L(p.skew / tpd)} strong sub={`maximum length mismatch for ${fmt(p.skew, 4)} ps`} />
                <Result label="Mismatch of the two traces" value={L(Math.abs(p.len - p.lenB))} sub={`${fmt(Math.abs(p.len - p.lenB) * tpd, 4)} ps skew`} />
              </tbody>
            </table>
          </Panel>
          <Panel title="Edge rate">
            <table className="tbl">
              <tbody>
                <Result label="Bandwidth (0.35 / tr)" value={si(bandwidthFromRise(trS), 'Hz')} strong />
                <Result label="Knee frequency (0.5 / tr)" value={si(kneeFrequency(trS), 'Hz')} />
                <Result label="Rise-time length" value={L(critical)} sub="distance the edge travels during tr" />
                <Result label="Critical length (tr/6 rule)" value={L(critical / 6)} sub="treat longer traces as transmission lines" />
              </tbody>
            </table>
          </Panel>
          <Panel title="Wavelength on the board">
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
        A signal travels at <i>c</i>/√ε<sub>eff</sub>. For stripline ε<sub>eff</sub> equals the laminate εr. For microstrip part of the field is in air, so ε<sub>eff</sub> is lower. Get it from
        the impedance calculator.
      </p>
      <div className="eq">
        <span className="no">(2)</span>
        <i>f</i>
        <sub>3dB</sub> ≈ 0.35 / <i>t</i>
        <sub>r</sub>,&nbsp;&nbsp; <i>f</i>
        <sub>knee</sub> ≈ 0.5 / <i>t</i>
        <sub>r</sub>
      </div>
      <p>
        The critical length is a rule of thumb. When a trace's delay exceeds about one sixth of the rise time, reflections become visible and the trace should be terminated and
        impedance-controlled.
      </p>
      <h2>References</h2>
      <ol>
        <li>H. Johnson, M. Graham, <i>High-Speed Digital Design</i>, Prentice Hall, 1993.</li>
        <li>E. Bogatin, <i>Signal and Power Integrity – Simplified</i>, 3rd ed., Prentice Hall, 2018.</li>
      </ol>
    </>
  );
}
