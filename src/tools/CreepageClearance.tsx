import { Sources } from '../components/Sources';
import { ToolPage } from '../components/ToolPage';
import { Big, Check, Notes, NumField, Panel, Result, Section, Segmented, SelectField } from '../components/ui';
import { F1, IEC60664_SOURCES, MATERIAL_GROUPS, type MaterialGroup } from '../data/iec60664';
import { altitudeFactor, clearance, creepage, ratedImpulse, reinforcedImpulse, type Field, type Pollution } from '../lib/creepage';
import { fmt } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { ins: 'basic', src: 'mains', vln: 230, ovc: 2, kv: 0.5, vw: 250, pd: 2, mg: 'IIIa', pwb: true, field: 'A', alt: 2000, rib: false, interp: true };

const roundUp = (mm: number) => (mm >= 1 ? Math.ceil(mm * 100 - 1e-9) / 100 : Math.ceil(mm * 1000 - 1e-9) / 1000);

export default function CreepageClearance() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const ins = p.ins as 'functional' | 'basic' | 'reinforced';
  const pd = p.pd as Pollution;
  const mg = p.mg as MaterialGroup;
  const errors: string[] = [];
  if (p.src === 'mains' && !(p.vln > 0 && p.vln <= 1000)) errors.push('Line-to-neutral voltage must be between 0 and 1000 V (Table F.1).');
  if (p.src === 'impulse' && !(p.kv > 0)) errors.push('Impulse voltage must be greater than 0.');
  if (!(p.vw >= 0)) errors.push('Working voltage cannot be negative.');
  if (!(p.alt >= -500 && p.alt <= 20000)) errors.push('Altitude must be between −500 and 20 000 m (Table A.2).');

  // clearance: impulse voltage from the mains table or entered directly
  const imp = p.src === 'mains' ? ratedImpulse(p.vln, p.ovc as 1 | 2 | 3 | 4) : { v: p.kv * 1000, row: 0 };
  const vImp = imp ? (ins === 'reinforced' ? reinforcedImpulse(imp.v) : imp.v) : NaN;
  const cl = !errors.length && imp ? clearance(vImp / 1000, p.field as Field, pd, p.pwb, p.src === 'impulse' && p.interp) : null;
  const alt = altitudeFactor(p.alt);
  const clMm = cl && alt && !cl.outOfRange ? cl.mm * alt.k : NaN;

  const cr = !errors.length ? creepage(p.vw, pd, mg, p.pwb, p.rib, p.interp) : null;
  const crBase = cr && !cr.outOfRange && Number.isFinite(cr.mm) ? cr.mm * (ins === 'reinforced' ? 2 : 1) : NaN;
  const crFinal = Math.max(crBase, Number.isFinite(clMm) ? clMm : 0);

  const notes: string[] = [];
  if (cl?.outOfRange) errors.push('The impulse voltage is above the 100 kV end of Table F.2.');
  if (cr?.outOfRange) errors.push(`Creepage: ${cr.column}.`);
  if (cr && cr.provisional) notes.push('Creepage above 10 kV is provisional data in the standard (extrapolated).');
  if (pd === 3 && mg === 'IIIb' && p.vw > 630) notes.push('Material group IIIb is not recommended at pollution degree 3 above 630 V (Table F.4, footnote 2).');
  if (p.pwb && mg === 'IIIb' && pd === 2) notes.push('The printed-wiring PD2 column excludes material group IIIb, so the general PD2 column is used.');
  if (Number.isFinite(crBase) && Number.isFinite(clMm) && clMm > crBase) notes.push('The creepage is raised to the clearance: a creepage distance can never be shorter than the associated clearance (5.2.2.6).');
  if (ins === 'functional') notes.push('Functional insulation: use the impulse and working voltages that actually occur across it. Safety standards (IEC 62368-1, 61010-1, 60335-1) may set their own values.');
  if (p.src === 'mains' && ins !== 'functional') notes.push('For creepage of mains-connected basic insulation, enter the rationalised voltage of Table F.3 or the rated insulation voltage (e.g. 250 V for 230 V mains).');
  if (alt && alt.k > 1) notes.push(`Clearance multiplied by ${alt.k} for ${fmt(p.alt, 5)} m (Table A.2, next tabulated altitude ${alt.row} m). Creepage does not need an altitude correction.`);

  const properties = (
    <>
      <Section title="Insulation">
        <SelectField
          label="Type"
          value={ins}
          onChange={(v) => set({ ins: v })}
          options={[
            { value: 'functional', label: 'Functional' },
            { value: 'basic', label: 'Basic' },
            { value: 'reinforced', label: 'Reinforced' },
          ]}
        />
        <SelectField
          label="Pollution degree"
          value={String(p.pd) as '1' | '2' | '3' | '4'}
          onChange={(v) => set({ pd: Number(v) })}
          options={[
            { value: '1', label: 'PD1 – sealed / coated' },
            { value: '2', label: 'PD2 – normal indoor' },
            { value: '3', label: 'PD3 – industrial' },
            { value: '4', label: 'PD4 – conductive' },
          ]}
          width={160}
        />
        <Check label="Printed wiring board (bare board)" checked={p.pwb} onChange={(v) => set({ pwb: v })} hint="Uses the printed-wiring-material columns of Tables F.2 and F.4 where they apply." />
      </Section>
      <Section title="Clearance (through air)">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <span className="text-muted">Voltage from</span>
          <Segmented
            label="Voltage source"
            value={p.src as 'mains' | 'impulse'}
            onChange={(v) => set({ src: v })}
            options={[
              { value: 'mains', label: 'Mains' },
              { value: 'impulse', label: 'Impulse' },
            ]}
          />
        </div>
        {p.src === 'mains' ? (
          <>
            <NumField label="Line-to-neutral voltage" value={p.vln} onChange={(v) => set({ vln: v })} unit="V rms" hint="Derived from the nominal AC or DC system voltage." />
            <SelectField
              label="Overvoltage category"
              value={String(p.ovc) as '1' | '2' | '3' | '4'}
              onChange={(v) => set({ ovc: Number(v) })}
              options={[
                { value: '1', label: 'OVC I – protected' },
                { value: '2', label: 'OVC II – appliances' },
                { value: '3', label: 'OVC III – fixed installation' },
                { value: '4', label: 'OVC IV – origin of supply' },
              ]}
              width={176}
            />
          </>
        ) : (
          <NumField label="Impulse withstand voltage" value={p.kv} onChange={(v) => set({ kv: v })} unit="kV peak" hint="Highest transient expected across the clearance (e.g. for circuits not directly connected to the mains)." />
        )}
        <SelectField
          label="Field"
          value={p.field as Field}
          onChange={(v) => set({ field: v })}
          options={[
            { value: 'A', label: 'Case A – inhomogeneous' },
            { value: 'B', label: 'Case B – homogeneous' },
          ]}
          width={176}
        />
        <NumField label="Altitude" value={p.alt} onChange={(v) => set({ alt: v })} unit="m" allowNegative />
      </Section>
      <Section title="Creepage (along the surface)">
        <NumField label="Working voltage" value={p.vw} onChange={(v) => set({ vw: v })} unit="V rms" allowZero />
        <SelectField
          label="Material group"
          value={mg}
          onChange={(v) => set({ mg: v })}
          options={MATERIAL_GROUPS.map((m) => ({ value: m.id, label: `${m.id} (${m.cti})` }))}
          width={176}
        />
        {pd === 3 && <Check label="Rib between the conductors" checked={p.rib} onChange={(v) => set({ rib: v })} hint="Bracketed values of Table F.4 (footnote 4)." />}
        <Check label="Interpolate between table rows" checked={p.interp} onChange={(v) => set({ interp: v })} hint="Creepage: linear interpolation is permitted. Clearance: only for entered impulse voltages; mains values use the table row." />
      </Section>
    </>
  );

  const ok = Number.isFinite(clMm) || Number.isFinite(crFinal);
  return (
    <ToolPage
      title="Creepage & Clearance (IEC 60664-1)"
      description="Minimum clearance and creepage distances on PCBs per IEC 60664-1: rated impulse voltage from the mains and overvoltage category, pollution degree, material group (CTI), printed wiring material, reinforced insulation and altitude correction."
      onReset={reset}
      properties={properties}
      status={ok ? `Clearance ≥ ${Number.isFinite(clMm) ? fmt(roundUp(clMm), 4) : '—'} mm · creepage ≥ ${Number.isFinite(crFinal) ? fmt(roundUp(crFinal), 4) : '—'} mm` : 'Check the inputs'}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      <Notes items={notes} />
      {ok && (
        <div className="grid gap-3 xl:grid-cols-2">
          <Panel title={`Minimum Distances (${ins} insulation)`}>
            <div className="flex flex-wrap gap-8 px-2.5 py-2">
              <Big label="Clearance" value={Number.isFinite(clMm) ? fmt(roundUp(clMm), 4) : '—'} unit="mm" />
              <Big label="Creepage" value={Number.isFinite(crFinal) ? fmt(roundUp(crFinal), 4) : '—'} unit="mm" />
            </div>
            <table className="tbl">
              <tbody>
                {p.src === 'mains' && imp && <Result label="Rated impulse voltage (Table F.1)" value={fmt(imp.v, 5)} unit="V" sub={`${imp.row} V row, overvoltage category ${['I', 'II', 'III', 'IV'][p.ovc - 1]}`} />}
                {ins === 'reinforced' && imp && <Result label="Impulse voltage for reinforced" value={fmt(vImp, 5)} unit="V" sub="one step higher in the preferred series (or 160 %)" />}
                {cl && !cl.outOfRange && (
                  <Result label="Clearance (Table F.2, ≤ 2000 m)" value={fmt(cl.mm, 4)} unit="mm" sub={cl.interpolated ? `interpolated, case ${p.field}, PD${pd}` : `${fmt(cl.rowKv, 3)} kV row, case ${p.field}, PD${pd}${p.pwb && pd === 2 ? ', printed wiring' : ''}`} />
                )}
                {alt && <Result label="Altitude factor (Table A.2)" value={fmt(alt.k, 3)} />}
                {cr && !cr.outOfRange && Number.isFinite(cr.mm) && (
                  <Result label="Creepage (Table F.4)" value={fmt(cr.mm, 4)} unit="mm" sub={`${cr.interpolated ? 'interpolated' : `${fmt(cr.rowV, 5)} V row`}, ${cr.column}`} />
                )}
                {ins === 'reinforced' && Number.isFinite(crBase) && <Result label="Creepage × 2 for reinforced" value={fmt(crBase, 4)} unit="mm" />}
              </tbody>
            </table>
          </Panel>
          <Panel title="What the Terms Mean">
            <div className="space-y-2 px-2.5 py-2 text-muted">
              <p>
                <b className="text-ink">Clearance</b> is the shortest distance through air between two conductors. It must withstand transient overvoltages, so it depends on the impulse
                voltage, the field shape and the altitude.
              </p>
              <p>
                <b className="text-ink">Creepage</b> is the shortest path along the surface of the insulation. It must resist tracking under continuous voltage, so it depends on the RMS
                working voltage, the pollution degree and the material's CTI. Standard FR-4 is usually material group IIIa (CTI 175–249); high-CTI laminates reach group II or I.
              </p>
              <p>
                <b className="text-ink">Pollution degree 2</b> is normal for electronics indoors: only non-conductive pollution, with occasional condensation. Conformal coating per IEC
                60664-3 can allow PD1 values.
              </p>
            </div>
          </Panel>
        </div>
      )}
      <Panel title="Table F.1 – Rated Impulse Voltage for Mains-Connected Equipment" className="mt-3">
        <table className="tbl">
          <thead>
            <tr>
              <th>Line-to-neutral ≤</th>
              <th>Typical systems</th>
              <th className="v">OVC I</th>
              <th className="v">OVC II</th>
              <th className="v">OVC III</th>
              <th className="v">OVC IV</th>
            </tr>
          </thead>
          <tbody>
            {F1.map((r) => (
              <tr key={r.v}>
                <td>{r.v} V</td>
                <td>{r.systems}</td>
                {r.ovc.map((v, i) => (
                  <td key={i} className="v">
                    {v} V
                  </td>
                ))}
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
      <h2>How the distances are found</h2>
      <ol>
        <li>
          <b>Impulse voltage.</b> For mains-connected circuits, Table F.1 gives the rated impulse voltage from the line-to-neutral voltage and the overvoltage category. For other
          circuits, enter the highest transient that can occur. Reinforced insulation uses the next step of the preferred series (330, 500, 800, 1500, 2500, 4000, 6000, 8000, 12000 V),
          or 160 % of a non-preferred value.
        </li>
        <li>
          <b>Clearance.</b> Table F.2 gives the minimum clearance up to 2000 m for the field case and pollution degree. At PD2 the table sets a 0.2 mm minimum; on printed wiring
          material the PD1 value applies instead, but not less than 0.04 mm. PD4 uses the PD3 values with a 1.6 mm minimum. Above 2000 m, Table A.2 multiplies the clearance.
        </li>
        <li>
          <b>Creepage.</b> Table F.4 gives the creepage for the RMS working voltage, pollution degree and material group. Printed wiring material has its own columns for PD1 and
          PD2 up to 1000 V. Linear interpolation between rows is allowed. Reinforced insulation doubles the creepage.
        </li>
        <li>
          <b>Check.</b> A creepage distance can never be less than the associated clearance, so the tool raises it when needed. Results are rounded up.
        </li>
      </ol>
      <p>
        IEC 60664-1 is the basic insulation-coordination standard. Product standards such as IEC 62368-1 (audio/video and IT), IEC 61010-1 (measurement and lab) and IEC 60335-1
        (household) build on it but can require larger distances, different voltages or extra margins. Always check the standard that applies to your product. For board-level spacing
        without safety requirements, see the IPC-2221 conductor spacing tool.
      </p>
      <p>
        The table values were checked cell by cell against the standard text and an independent full reproduction. Edition 3 (2020) keeps the same values; its creepage table is
        numbered F.5 and a 1500 V DC row was added to Table F.1.
      </p>
      <Sources items={IEC60664_SOURCES} />
    </>
  );
}
