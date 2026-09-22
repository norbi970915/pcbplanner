import { ToolPage } from '../components/ToolPage';
import { Big, Group, LenField, Notes, NumField, Panel } from '../components/ui';
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

  return (
    <ToolPage
      title="Fusing Current Calculator"
      description="Current that melts a copper trace within a given time (Onderdonk's equation). Use it for fault, inrush and surge analysis, or to design a deliberate trace fuse."
      onReset={reset}
      method={<Method />}
    >
      <div className="grid gap-4 lg:grid-cols-[350px_minmax(0,1fr)]">
        <Panel title="Inputs">
          <Group>
            <LenField label="Trace width" symbol="W" value={p.w} onChange={(v) => set({ w: v })} />
            <LenField label="Copper thickness" symbol="T" value={p.t} onChange={(v) => set({ t: v })} units={['oz', 'um', 'mil', 'mm']} />
            <NumField label="Pulse duration" symbol="t" value={p.sec} onChange={(v) => set({ sec: v })} unit="s" />
            <NumField label="Ambient" value={p.amb} onChange={(v) => set({ amb: v })} unit="°C" allowNegative />
          </Group>
        </Panel>
        <div className="min-w-0 space-y-4">
          <Panel title="Result">
            <div className="px-3 py-3">
              <Big label={`Fusing current for ${si(p.sec, 's', 3)}`} value={fmt(i, 4)} unit="A" />
              <p className="mt-1 text-[12.5px] text-muted">Cross-section {fmt(area, 4)} mm².</p>
            </div>
            <div className="px-3 pb-3">
              <Notes items={p.sec > 10 ? ['Beyond about 10 s heat flows into the board, so a real trace survives more current than this (the result is conservative). Use the IPC-2221 trace tool for steady-state current.'] : []} />
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
        </div>
      </div>
    </ToolPage>
  );
}

function Method() {
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
        pulses heat escapes into the laminate and the planes, so a real trace survives more current than predicted and the result is conservative.
      </p>
      <h2>References</h2>
      <ol>
        <li>I. M. Onderdonk, as cited in E. R. Stauffacher, “Short-time Current Carrying Capacity of Copper Wire,” General Cable Corporation, 1928.</li>
      </ol>
    </>
  );
}
