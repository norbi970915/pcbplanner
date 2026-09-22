import { ToolPage } from '../components/ToolPage';
import { LenField, NumField, Panel, Result, Section } from '../components/ui';
import { acResistance } from '../lib/copper';
import { fmt, MM_PER_OZ, si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { f: 100, w: 0.2, t: MM_PER_OZ, len: 100, temp: 25 };
const SWEEP = [1e5, 1e6, 1e7, 1e8, 5e8, 1e9, 2.5e9, 5e9, 1e10];

export default function SkinEffect() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const ok = p.f > 0 && p.w > 0 && p.t > 0 && p.len > 0;
  const r = ok ? acResistance(p.len, p.w, p.t, p.f * 1e6, p.temp) : null;

  const properties = (
    <Section title="Conductor">
      <NumField label="Frequency" symbol="f" value={p.f} onChange={(v) => set({ f: v })} unit="MHz" />
      <LenField label="Trace width" symbol="W" value={p.w} onChange={(v) => set({ w: v })} />
      <LenField label="Copper thickness" symbol="T" value={p.t} onChange={(v) => set({ t: v })} units={['oz', 'um', 'mil', 'mm']} />
      <LenField label="Trace length" symbol="L" value={p.len} onChange={(v) => set({ len: v })} units={['mm', 'cm', 'in', 'mil']} />
      <NumField label="Temperature" value={p.temp} onChange={(v) => set({ temp: v })} unit="°C" allowNegative />
    </Section>
  );

  return (
    <ToolPage
      title="Skin Effect & AC Resistance"
      description="Skin depth in copper and the resulting AC resistance of a rectangular PCB trace, with a frequency sweep from 100 kHz to 10 GHz."
      onReset={reset}
      properties={properties}
      status={r ? `δ = ${fmt(r.skinDepthMm * 1000, 4)} µm at ${fmt(p.f, 4)} MHz · Rac/Rdc = ${fmt(r.ratio, 3)}` : 'Check the inputs'}
      method={<Method />}
    >
      <div className="grid gap-3 xl:grid-cols-2">
        {r && (
          <Panel title={`At ${fmt(p.f, 4)} MHz`}>
            <table className="tbl">
              <tbody>
                <Result label="Skin depth δ" value={fmt(r.skinDepthMm * 1000, 4)} unit="µm" strong sub={`${fmt(r.skinDepthMm / 0.0254, 4)} mil`} />
                <Result label="DC resistance" value={si(r.rdc, 'Ω')} />
                <Result label="AC resistance" value={si(r.rac, 'Ω')} strong />
                <Result label="Rac / Rdc" value={fmt(r.ratio, 4)} />
              </tbody>
            </table>
          </Panel>
        )}
        {ok && (
          <Panel title="Frequency Sweep">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Frequency</th>
                  <th className="v">Skin depth</th>
                  <th className="v">R AC</th>
                  <th className="v">Rac / Rdc</th>
                </tr>
              </thead>
              <tbody>
                {SWEEP.map((f) => {
                  const s = acResistance(p.len, p.w, p.t, f, p.temp);
                  return (
                    <tr key={f}>
                      <td>{si(f, 'Hz', 3)}</td>
                      <td className="v">{fmt(s.skinDepthMm * 1000, 3)} µm</td>
                      <td className="v">{si(s.rac, 'Ω')}</td>
                      <td className="v">{fmt(s.ratio, 3)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        )}
      </div>
    </ToolPage>
  );
}

export function Method() {
  return (
    <>
      <h2>Skin depth</h2>
      <div className="eq">
        <span className="no">(1)</span>δ = √( ρ / (π <i>f</i> μ<sub>0</sub> μ<sub>r</sub>) )
      </div>
      <p>
        At high frequency the current crowds into a layer about one skin depth thick at the conductor surface. This tool models the trace as a rectangle whose conducting area is the
        shell within δ of every surface. At low frequency the shell fills the whole cross-section and <i>R</i>
        <sub>ac</sub> = <i>R</i>
        <sub>dc</sub>.
      </p>
      <p>
        Over a plane the current concentrates on the side facing the plane, and surface roughness adds loss above a few GHz, so the real resistance can be higher. Use this for trends
        and sizing, not for multi-GHz loss budgets.
      </p>
      <h2>References</h2>
      <ol>
        <li>S. Ramo, J. Whinnery, T. Van Duzer, <i>Fields and Waves in Communication Electronics</i>, Wiley.</li>
        <li>IEC 60028, International standard of resistance for copper.</li>
      </ol>
    </>
  );
}
