import { ToolPage } from '../components/ToolPage';
import { Big, LenField, Notes, NumField, Panel, Section } from '../components/ui';
import { onderdonk } from '../lib/copper';
import { fmt, MM_PER_OZ, si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { w: 0.25, t: MM_PER_OZ, sec: 1, amb: 25 };
const DURATIONS = [0.001, 0.01, 0.1, 1, 5, 10];

export default function Fusing() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const ok = p.w > 0 && p.t > 0 && p.sec > 0;
  const area = p.w * p.t;
  const i = ok ? onderdonk(area, p.sec, p.amb) : NaN;

  const properties = (
    <Section title="Conductor and Pulse">
      <LenField label="Trace width" symbol="W" value={p.w} onChange={(v) => set({ w: v })} />
      <LenField label="Copper thickness" symbol="T" value={p.t} onChange={(v) => set({ t: v })} units={['oz', 'um', 'mil', 'mm']} />
      <NumField label="Pulse duration" symbol="t" value={p.sec} onChange={(v) => set({ sec: v })} unit="s" />
      <NumField label="Ambient" value={p.amb} onChange={(v) => set({ amb: v })} unit="°C" allowNegative />
    </Section>
  );

  return (
    <ToolPage
      title="Fusing Current"
      description="Current that melts a copper trace within a given time (Onderdonk's equation). For fault, inrush and surge analysis."
      onReset={reset}
      properties={properties}
      status={ok ? `Fusing current ${fmt(i, 4)} A in ${si(p.sec, 's', 3)}` : 'Check the inputs'}
      method={<Method />}
    >
      <Notes items={[
        ...(p.sec > 10 ? ['Beyond about 10 s heat flows into the board, so a real trace survives more current than this. That is conservative for checking that a trace survives a fault, but a trace meant to open takes longer than predicted. Use the trace-width tool for steady-state current.'] : []),
        'A PCB trace is not a rated protective device. Where overcurrent protection is required, use a rated fuse.',
      ]} />
      <Panel title="Results">
        <div className="px-2.5 py-2">
          <Big label={`Fusing current for ${si(p.sec, 's', 3)}`} value={fmt(i, 4)} unit="A" />
          <p className="mt-1 text-muted">Cross-section {fmt(area, 4)} mm².</p>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Duration</th>
              <th className="v">Fusing current</th>
            </tr>
          </thead>
          <tbody>
            {ok &&
              DURATIONS.map((d) => (
                <tr key={d}>
                  <td>{si(d, 's', 3)}</td>
                  <td className="v">{fmt(onderdonk(area, d, p.amb), 4)} A</td>
                </tr>
              ))}
          </tbody>
        </table>
      </Panel>
    </ToolPage>
  );
}

export function Method() {
  return (
    <>
      <h2>Onderdonk's equation</h2>
      <div className="eq">
        <span className="no">(1)</span>
        <i>I</i> = <i>A</i> · √( log<sub>10</sub>( (<i>T</i>
        <sub>m</sub> − <i>T</i>
        <sub>a</sub>) / (234 + <i>T</i>
        <sub>a</sub>) + 1 ) / (33 <i>t</i>) )
      </div>
      <p>
        <i>A</i> is the cross-section in circular mils, <i>T</i>
        <sub>m</sub> the melting point of copper (1084.6 °C), <i>T</i>
        <sub>a</sub> the ambient temperature and <i>t</i> the pulse duration in seconds. The equation assumes all the heat stays in the conductor. That holds for short pulses. For longer
        pulses heat escapes into the laminate and planes, so a real trace survives more current than predicted. That makes the result conservative when you check that a trace survives a fault. For a trace
        meant to act as a fuse it is the opposite: the real trace takes longer to open than predicted, and it is not a rated protective device, so use a rated fuse
        wherever a safety standard requires overcurrent protection.
      </p>
      <h2>References</h2>
      <ol>
        <li>I. M. Onderdonk, as cited in E. R. Stauffacher, “Short-time Current Carrying Capacity of Copper Wire,” General Cable Corporation, 1928.</li>
      </ol>
    </>
  );
}
