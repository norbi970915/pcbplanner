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
      <Notes items={ok ? ['IPC-2221 minimum design spacing. Where a product safety standard applies, for example to mains-connected equipment, its creepage and clearance requirements govern and are often larger; see the creepage and clearance tool.'] : []} />
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
          <Panel title={`Every conductor category at ${vPeak > 500 ? fmt(vPeak, 4) + ' V' : IPC2221_SPACING_BANDS[bandIdx].vMin + '–' + IPC2221_SPACING_BANDS[bandIdx].vMax + ' V'}`}>
            <table className="tbl">
              <tbody>
                {SPACING_COLUMNS.map((c) => (
                  <tr key={c} className={c === col ? 'sel' : ''}>
                    <td>
                      <b>{c}</b> {SPACING_COLUMN_LABELS[c]}
                    </td>
                    <td className="v">{L(ipc2221Spacing(vPeak, c))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-2.5 py-1.5 text-faint">Minimum spacing at your voltage in each IPC-2221 conductor category. The complete table, with all voltage bands, is in the standard.</p>
          </Panel>
        </>
      )}
    </ToolPage>
  );
}

export function Method() {
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
