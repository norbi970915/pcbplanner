import { Sources } from '../components/Sources';
import { ToolPage } from '../components/ToolPage';
import { Big, LenField, Notes, Panel, Result, Section, SelectField } from '../components/ui';
import { BGA_BALL_VS_PITCH, BGA_COLLAPSING, BGA_COURTYARD_EXCESS, BGA_NON_COLLAPSING, bgaLandByRule, bgaLevelForBall, SOURCES } from '../data/bgaLand';
import { fmt, fromMm } from '../lib/units';
import { useSettings } from '../state/settings';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { ball: 0.4, kind: 'collapsing', pitch: 0.8, w: 0.1, s: 0.1 };

export default function BgaLand() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const { unit } = useSettings();
  const kind = p.kind as 'collapsing' | 'nonCollapsing';
  const table = kind === 'collapsing' ? BGA_COLLAPSING : BGA_NON_COLLAPSING;
  const row = table.find((r) => Math.abs(r.ball - p.ball) < 1e-6);
  const errors: string[] = [];
  if (!(p.ball > 0)) errors.push('Ball diameter must be greater than 0.');
  if (!(p.pitch > 0)) errors.push('Pitch must be greater than 0.');
  if (!(p.w > 0 && p.s > 0)) errors.push('Trace width and spacing must be greater than 0.');
  const ok = errors.length === 0;
  const level = bgaLevelForBall(p.ball);
  const land = row ? row.land : bgaLandByRule(p.ball, kind);
  const L = (mm: number) => `${fmt(fromMm(mm, unit), 4)} ${unit}`;
  // routing between two adjacent lands on the same row
  const gap = p.pitch - land;
  const traces = ok ? Math.max(0, Math.floor((gap - p.s) / (p.w + p.s) + 1e-9)) : 0;
  const diagGap = p.pitch * Math.SQRT2 - land;
  const diagTraces = ok ? Math.max(0, Math.floor((diagGap - p.s) / (p.w + p.s) + 1e-9)) : 0;
  const notes: string[] = [];
  if (!row && ok) notes.push(`Ball ${fmt(p.ball, 3)} mm is not in the IPC table; the land uses the IPC-7351A percentage rule (${kind === 'collapsing' ? '−' : '+'}${Math.abs(kind === 'collapsing' ? { A: 25, B: 20, C: 15 }[level] : { A: 15, B: 10, C: 5 }[level])} %, rounded to 0.05 mm).`);
  if (row && 'singleSource' in row) {
    const extra = (row as { note?: string }).note;
    notes.push(`Non-collapsing ball table from a single secondary source; it agrees with the IPC percentage rule.${extra ? ' ' + extra : ''}`);
  }
  if (ok && gap <= 0) notes.push('The land is as wide as the pitch: the lands would merge.');
  const pitchRow = BGA_BALL_VS_PITCH.find((r) => Math.abs(r.ball - p.ball) < 1e-6);

  const properties = (
    <>
      <Section title="Ball">
        <SelectField
          label="Ball type"
          value={kind}
          onChange={(v) => set({ kind: v })}
          options={[
            { value: 'collapsing', label: 'Collapsing (SAC/SnPb)' },
            { value: 'nonCollapsing', label: 'Non-collapsing' },
          ]}
        />
        <SelectField
          label="Nominal ball diameter"
          value={row ? String(row.ball) : 'custom'}
          onChange={(v) => v !== 'custom' && set({ ball: Number(v) })}
          options={[...table.map((r) => ({ value: String(r.ball), label: `${r.ball} mm` })), { value: 'custom', label: 'Other…' }]}
          width={100}
        />
        <LenField label="Ball diameter" value={p.ball} onChange={(v) => set({ ball: v })} />
      </Section>
      <Section title="Escape Routing">
        <LenField label="Ball pitch" value={p.pitch} onChange={(v) => set({ pitch: v })} />
        <LenField label="Trace width" value={p.w} onChange={(v) => set({ w: v })} />
        <LenField label="Trace/land spacing" value={p.s} onChange={(v) => set({ s: v })} />
      </Section>
    </>
  );

  return (
    <ToolPage
      title="BGA Land Pattern"
      description="IPC-7351 land diameter for collapsing and non-collapsing BGA balls, with tolerance, density level and courtyard, plus how many traces fit between lands for escape routing."
      onReset={reset}
      properties={properties}
      status={ok ? `Land ${L(land)} for a ${fmt(p.ball, 3)} mm ball · ${traces} trace(s) between lands` : 'Check the inputs'}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      <Notes items={notes} />
      {ok && (
        <div className="grid gap-3 xl:grid-cols-2">
          <Panel title="Land">
            <div className="flex flex-wrap gap-8 px-2.5 py-2">
              <Big label="Nominal land diameter" value={fmt(fromMm(land, unit), 4)} unit={unit} />
              <Big label="Traces between lands" value={traces} unit={`at ${fmt(p.pitch, 3)} mm pitch`} />
            </div>
            <table className="tbl">
              <tbody>
                <Result label="Land tolerance (max / min)" value={row ? `${L(row.landMax)} / ${L(row.landMin)}` : '±0.05 mm'} />
                <Result label="Density level" value={`${level} (${kind === 'collapsing' ? 'land reduced' : 'land enlarged'} by ${row ? row.percent : { collapsing: { A: 25, B: 20, C: 15 }, nonCollapsing: { A: 15, B: 10, C: 5 } }[kind][level]} %)`} />
                <Result label="Courtyard excess" value={L(BGA_COURTYARD_EXCESS[level])} />
                <Result label="Gap between lands (row)" value={L(gap)} sub={`${traces} trace(s) of ${L(p.w)} with ${L(p.s)} spacing`} />
                <Result label="Gap between lands (diagonal)" value={L(diagGap)} sub={`${diagTraces} trace(s)`} />
                {pitchRow && <Result label="Typical pitches for this ball (J-STD-032)" value={pitchRow.pitches.map((x) => `${x} mm`).join(', ')} />}
              </tbody>
            </table>
          </Panel>
          <Panel title={kind === 'collapsing' ? 'IPC-7351A Table 14-5 (collapsing balls, mm)' : 'Non-collapsing balls (mm)'}>
            <table className="tbl">
              <thead>
                <tr>
                  <th className="v">Ball</th>
                  <th className="v">%</th>
                  <th>Level</th>
                  <th className="v">Land</th>
                  <th className="v">Max</th>
                  <th className="v">Min</th>
                </tr>
              </thead>
              <tbody>
                {table.map((r) => (
                  <tr key={r.ball} className={row === r ? 'sel' : ''} onClick={() => set({ ball: r.ball })}>
                    <td className="v">{r.ball}</td>
                    <td className="v">{r.percent}</td>
                    <td>{r.level}</td>
                    <td className="v">{r.land}</td>
                    <td className="v">{r.landMax}</td>
                    <td className="v">{r.landMin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      )}
    </ToolPage>
  );
}

function Method() {
  return (
    <>
      <h2>IPC-7351 land approximation</h2>
      <p>
        Collapsing (eutectic or SAC) balls get a land smaller than the ball: 25 %, 20 % or 15 % smaller for density levels A, B or C. IPC ties the level to the ball size. Non-collapsing
        balls and columns get a land 15 %, 10 % or 5 % larger. The land is non-solder-mask-defined, and values are rounded to 0.05 mm. Tabulated sizes use the IPC table; other sizes use
        the percentage rule.
      </p>
      <p>
        Escape routing between two lands in a row: <i>n</i> = ⌊(pitch − land − <i>S</i>) / (<i>W</i> + <i>S</i>)⌋. Between diagonal neighbours the distance is pitch·√2. Always follow the
        component manufacturer's recommended land pattern where one exists.
      </p>
      <Sources items={SOURCES} />
    </>
  );
}
