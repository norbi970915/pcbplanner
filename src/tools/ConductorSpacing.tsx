import { Sources } from '../components/Sources';
import { ToolPage } from '../components/ToolPage';
import { Big, Check, Notes, NumField, Panel, Result, Section, SelectField } from '../components/ui';
import {
  IPC2221_SPACING_BANDS,
  IPC2221_SPACING_PER_VOLT_ABOVE_500,
  IPC2221_SPACING_REVISION_CHECK,
  ipc2221Spacing,
  SOURCES,
  SPACING_COLUMN_LABELS,
  SPACING_COLUMNS,
  type SpacingColumn,
} from '../data/ipc2221Spacing';
import { fmt, fromMm } from '../lib/units';
import { useSettings } from '../state/settings';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { v: 48, rms: false, col: 'B2' };

export default function ConductorSpacing() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const { unit } = useSettings();
  const col = (SPACING_COLUMNS.includes(p.col as SpacingColumn) ? p.col : 'B2') as SpacingColumn;
  const vPeak = p.rms ? Math.abs(p.v) * Math.SQRT2 : Math.abs(p.v);
  const ok = Number.isFinite(p.v);
  const spacing = ok ? ipc2221Spacing(vPeak, col) : NaN;
  const L = (mm: number) => `${fmt(fromMm(mm, unit), 4)} ${unit}`;
  const bandIdx = IPC2221_SPACING_BANDS.findIndex((b) => vPeak <= b.vMax);

  const properties = (
    <>
      <Section title="Voltage">
        <NumField label="Voltage between conductors" symbol="V" value={p.v} onChange={(v) => set({ v })} unit="V" allowZero allowNegative />
        <Check label="Value is AC RMS (convert to peak)" checked={p.rms} onChange={(v) => set({ rms: v })} />
      </Section>
      <Section title="Category">
        <SelectField label="Conductor location" value={col} onChange={(v) => set({ col: v })} options={SPACING_COLUMNS.map((c) => ({ value: c, label: `${c}` }))} width={80} />
        <p className="text-faint">{SPACING_COLUMN_LABELS[col]}</p>
      </Section>
    </>
  );

  return (
    <ToolPage
      title="Conductor Spacing (IPC-2221)"
      description="Minimum electrical clearance between conductors from IPC-2221 Table 6-1, for internal and external layers, coated and uncoated boards and assemblies, and high altitude."
      onReset={reset}
      properties={properties}
      status={ok ? `${col}: ${L(spacing)} minimum at ${fmt(vPeak, 4)} V peak` : 'Check the inputs'}
      method={<Method />}
    >
      <Notes kind="error" items={ok ? [] : ['Enter a voltage.']} />
      {ok && (
        <>
          <Panel title="Result">
            <div className="flex flex-wrap gap-8 px-2.5 py-2">
              <Big label={`Minimum spacing, ${col}`} value={fmt(fromMm(spacing, unit), 4)} unit={unit} />
              <Big label="Working voltage (DC or AC peak)" value={fmt(vPeak, 4)} unit="V" />
            </div>
            <table className="tbl">
              <tbody>
                <Result label="Category" value={SPACING_COLUMN_LABELS[col]} />
                <Result label="Table band" value={vPeak > 500 ? `> 500 V: 301–500 V value + ${IPC2221_SPACING_PER_VOLT_ABOVE_500[col]} mm/V above 500 V` : `${IPC2221_SPACING_BANDS[bandIdx].vMin}–${IPC2221_SPACING_BANDS[bandIdx].vMax} V`} />
                <Result label="Revision check" value={<span className="text-muted">{IPC2221_SPACING_REVISION_CHECK[col]}</span>} />
              </tbody>
            </table>
          </Panel>
          <Panel title="IPC-2221 Table 6-1 (minimum spacing, mm)">
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Voltage (DC / AC peak)</th>
                    {SPACING_COLUMNS.map((c) => (
                      <th key={c} className={`v ${c === col ? 'sel' : ''}`} title={SPACING_COLUMN_LABELS[c]}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {IPC2221_SPACING_BANDS.map((b, i) => (
                    <tr key={b.vMin} className={i === bandIdx && vPeak <= 500 ? 'sel' : ''}>
                      <td>
                        {b.vMin}–{b.vMax} V
                      </td>
                      {SPACING_COLUMNS.map((c) => (
                        <td key={c} className="v">
                          {b.mm[c]}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className={vPeak > 500 ? 'sel' : ''}>
                    <td>&gt; 500 V (per volt)</td>
                    {SPACING_COLUMNS.map((c) => (
                      <td key={c} className="v">
                        {IPC2221_SPACING_PER_VOLT_ABOVE_500[c]}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="grid gap-x-6 px-2.5 py-2 text-muted md:grid-cols-2">
              {SPACING_COLUMNS.map((c) => (
                <div key={c}>
                  <b className="text-ink">{c}</b> {SPACING_COLUMN_LABELS[c]}
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}
    </ToolPage>
  );
}

function Method() {
  return (
    <>
      <h2>How to use it</h2>
      <p>
        IPC-2221 Table 6-1 gives the minimum spacing between conductors for the peak voltage between them (DC or AC peak). An AC RMS voltage is converted with the factor √2. Above 500 V the
        table adds a fixed amount per volt to the 301–500 V value. A voltage that falls between two integer bands is placed in the higher band, which is the conservative choice.
      </p>
      <p>
        These are design minimums for the conductor pattern. Product safety standards such as IEC 62368-1 and IEC 60664-1 set creepage and clearance by insulation class, pollution degree and
        material group, and often require much larger distances. Where one of them applies, it governs. IPC-2221C (2023) reworked the categories; the values here are from IPC-2221 and
        IPC-2221A.
      </p>
      <Sources items={SOURCES} />
    </>
  );
}
