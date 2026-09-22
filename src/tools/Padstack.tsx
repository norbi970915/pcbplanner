import { ToolPage } from '../components/ToolPage';
import { Check, LenField, Notes, NumField, Panel, Result, Section, Segmented, SelectField } from '../components/ui';
import { ANNULAR_RING, leadDiagonal, padstack, type DensityLevel, type FabBasis } from '../lib/padstack';
import { fmt, fromMm } from '../lib/units';
import { useSettings } from '../state/settings';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = {
  lead: 'round',
  ld: 0.6,
  lw: 0.64,
  lt: 0.64,
  level: 'B',
  basis: 'ipc7251',
  tol: 0,
  drill: 0.1,
  oz: 1,
  layers: 4,
  spokes: 4,
  planes: 2,
  round: true,
  ovAr: false,
  arExt: 0.05,
  arInt: 0.03,
  ovFa: false,
  fa: 0.5,
  ovAp: false,
  ap: 0.7,
};

const LEVELS: { value: DensityLevel; label: string }[] = [
  { value: 'A', label: 'A – Most (low density)' },
  { value: 'B', label: 'B – Nominal' },
  { value: 'C', label: 'C – Least (high density)' },
];

export default function Padstack() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const { unit } = useSettings();
  const level = (['A', 'B', 'C'].includes(p.level) ? p.level : 'B') as DensityLevel;
  const basis = (p.basis === 'ipc2221' ? 'ipc2221' : 'ipc7251') as FabBasis;
  const rect = p.lead === 'rect';
  const leadMm = rect ? leadDiagonal(p.lw, p.lt) : p.ld;

  const errors: string[] = [];
  if (rect ? !(p.lw > 0 && p.lt > 0) : !(p.ld > 0)) errors.push('Lead dimensions must be greater than 0.');
  if (!(p.tol >= 0)) errors.push('Hole tolerance cannot be negative.');
  if (!(p.drill >= 0)) errors.push('Drill oversize cannot be negative.');
  if (!(p.oz > 0)) errors.push('Copper weight must be greater than 0.');
  if (!(p.layers >= 1)) errors.push('Layer count must be at least 1.');
  if (!(p.spokes >= 1 && p.spokes <= 8 && Number.isInteger(p.spokes))) errors.push('Spoke count must be a whole number from 1 to 8.');
  if (!(p.planes >= 0 && Number.isInteger(p.planes))) errors.push('Number of connected planes must be a whole number.');
  if (p.ovAr && !(p.arExt > 0 && p.arInt > 0)) errors.push('Annular rings must be greater than 0.');
  if (p.ovFa && !(p.fa >= 0)) errors.push('Fabrication allowance cannot be negative.');
  if (p.ovAp && !(p.ap > 0)) errors.push('Antipad allowance must be greater than 0.');

  const r = errors.length
    ? null
    : padstack({
        leadMm,
        level,
        basis,
        holeTolMm: p.tol,
        drillOversizeMm: p.drill,
        copperOz: p.oz,
        layers: p.layers,
        spokes: p.spokes,
        planes: p.planes,
        round: p.round,
        arExtMm: p.ovAr ? p.arExt : undefined,
        arIntMm: p.ovAr ? p.arInt : undefined,
        faMm: p.ovFa ? p.fa : undefined,
        antipadOverHoleMm: p.ovAp ? p.ap : undefined,
      });

  const notes: string[] = [];
  if (r && p.planes > 0 && r.webTotal > r.webLimit)
    notes.push(`Total thermal web ${fmt(r.webTotal, 3)} mm (${p.spokes} spokes × ${p.planes} planes) exceeds the ${fmt(r.webLimit, 3)} mm IPC-2222 guideline for ${fmt(p.oz, 3)} oz copper. The hole may be hard to solder. Use fewer or narrower spokes.`);
  if (r && r.antipad < r.thermalOd - 1e-9) notes.push('The antipad is smaller than the thermal-relief OD. Unconnected planes will then sit closer to the barrel than connected ones.');
  if (r && r.planeGap <= 0) notes.push('The antipad does not clear the drilled hole.');
  const L = (mm: number) => fmt(fromMm(mm, unit), 4);

  const properties = (
    <>
      <Section title="Lead">
        <div className="flex items-center justify-between">
          <span className="text-muted">Shape</span>
          <Segmented
            label="Lead shape"
            value={rect ? 'rect' : 'round'}
            onChange={(v) => set({ lead: v })}
            options={[
              { value: 'round', label: 'Round' },
              { value: 'rect', label: 'Rectangular' },
            ]}
          />
        </div>
        {rect ? (
          <>
            <LenField label="Max lead width" symbol="W" value={p.lw} onChange={(v) => set({ lw: v })} />
            <LenField label="Max lead thickness" symbol="T" value={p.lt} onChange={(v) => set({ lt: v })} />
          </>
        ) : (
          <LenField label="Max lead diameter" symbol="d" value={p.ld} onChange={(v) => set({ ld: v })} />
        )}
      </Section>
      <Section title="Level and board">
        <SelectField label="Density level" value={level} onChange={(v) => set({ level: v })} options={LEVELS} width={170} />
        <SelectField
          label="Fab allowance"
          value={basis}
          onChange={(v) => set({ basis: v })}
          options={[
            { value: 'ipc7251', label: 'IPC-7251 (0.6/0.5/0.4)' },
            { value: 'ipc2221', label: 'IPC-2221 Table 9-1' },
          ]}
          width={170}
        />
        <LenField label="Hole tolerance (+)" value={p.tol} onChange={(v) => set({ tol: v })} allowZero hint="Plus tolerance of the finished hole. IPC-2221 sizes the land from the maximum hole." />
        <LenField label="Drill oversize" value={p.drill} onChange={(v) => set({ drill: v })} allowZero hint="Drilled minus finished hole diameter (plating allowance). Ask your fabricator." />
        <NumField label="Copper weight" value={p.oz} onChange={(v) => set({ oz: v })} unit="oz" />
        <NumField label="Layer count" value={p.layers} onChange={(v) => set({ layers: v })} />
        <Check label="Round up to 0.05 mm" checked={p.round} onChange={(v) => set({ round: v })} />
      </Section>
      <Section title="Planes and thermal relief">
        <NumField label="Spokes" value={p.spokes} onChange={(v) => set({ spokes: v })} />
        <NumField label="Planes connected" value={p.planes} onChange={(v) => set({ planes: v })} allowZero />
      </Section>
      <Section title="Overrides" defaultOpen={false}>
        <Check label="Annular ring" checked={p.ovAr} onChange={(v) => set({ ovAr: v })} />
        {p.ovAr && (
          <>
            <LenField label="External min ring" value={p.arExt} onChange={(v) => set({ arExt: v })} />
            <LenField label="Internal min ring" value={p.arInt} onChange={(v) => set({ arInt: v })} />
          </>
        )}
        <Check label="Fabrication allowance" checked={p.ovFa} onChange={(v) => set({ ovFa: v })} />
        {p.ovFa && <LenField label="Fab allowance" value={p.fa} onChange={(v) => set({ fa: v })} allowZero />}
        <Check label="Antipad" checked={p.ovAp} onChange={(v) => set({ ovAp: v })} />
        {p.ovAp && <LenField label="Antipad − hole" value={p.ap} onChange={(v) => set({ ap: v })} hint="Antipad diameter minus finished hole diameter" />}
      </Section>
    </>
  );

  return (
    <ToolPage
      title="Through-Hole Padstack Calculator"
      description="Plated through-hole sizing after IPC-7251, IPC-2221 and IPC-2222: finished hole, outer and inner pads, antipad, thermal relief and the annular ring achieved, for density levels A, B and C."
      onReset={reset}
      properties={properties}
      status={r ? `Hole ${L(r.hole)} ${unit}, pad ${L(r.padOuter)} ${unit}, antipad ${L(r.antipad)} ${unit}` : 'Check the inputs'}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      <Notes items={notes} />
      {r && (
        <>
          <div className="grid gap-3 xl:grid-cols-2">
            <Panel title="Hole and Pads">
              <table className="tbl">
                <tbody>
                  <Result label={rect ? 'Lead diagonal' : 'Max lead diameter'} value={L(leadMm)} unit={unit} sub={rect ? `√(${fmt(p.lw, 3)}² + ${fmt(p.lt, 3)}²) mm` : undefined} />
                  <Result label="Finished hole" value={L(r.hole)} unit={unit} strong sub={`lead + ${fmt(r.allowance, 3)} mm (Level ${level})`} />
                  <Result label="Max finished hole" value={L(r.maxHole)} unit={unit} sub="finished hole + tolerance" />
                  <Result label="Drilled hole (assumed)" value={L(r.drill)} unit={unit} />
                  <Result label="Pad, outer layers" value={L(r.padOuter)} unit={unit} strong sub={`max hole + 2 × ${fmt(r.arExt, 3)} + ${fmt(r.fa, 3)} mm`} />
                  <Result
                    label="Pad, inner layers"
                    value={L(r.padInner)}
                    unit={unit}
                    strong
                    sub={`IPC-2221 minimum from the drilled hole: ${L(r.padInnerMin)} ${unit}. IPC-7251 default: same as outer`}
                  />
                  <Result label="Fabrication allowance used" value={L(r.fa)} unit={unit} sub={p.ovFa ? 'override' : basis === 'ipc7251' ? 'IPC-7251 density level' : 'IPC-2221 Table 9-1 incl. notes'} />
                </tbody>
              </table>
            </Panel>
            <Panel title="Annular Ring and Planes">
              <table className="tbl">
                <tbody>
                  <Result label="External ring, nominal" value={L(r.ringExtNominal)} unit={unit} sub="(pad − finished hole)/2" />
                  <Result label="External ring, worst case" value={L(r.ringExtWorst)} unit={unit} sub={`after max hole and fab allowance, min ${fmt(r.arExt, 3)} mm`} />
                  <Result label="Internal ring, nominal" value={L(r.ringIntNominal)} unit={unit} sub="(inner pad − drilled hole)/2" />
                  <Result label="Internal ring, worst case" value={L(r.ringIntWorst)} unit={unit} sub={`min ${fmt(r.arInt, 3)} mm`} />
                  <Result label="Antipad (plane clearance)" value={L(r.antipad)} unit={unit} strong sub={p.ovAp ? 'override' : 'equal to the thermal OD'} />
                  <Result label="Plane-to-drill gap" value={L(r.planeGap)} unit={unit} sub="(antipad − drilled hole)/2" />
                  <Result label="Thermal relief ID / OD" value={`${L(r.thermalId)} / ${L(r.thermalOd)}`} unit={unit} strong />
                  <Result label="Spoke width" value={`${p.spokes} × ${L(r.spokeWidth)}`} unit={unit} sub="60 % of the land diameter shared by the spokes, rounded up to 0.05 mm" />
                  <Result label="Total web on all planes" value={fmt(r.webTotal, 4)} unit="mm" sub={`guideline ≤ ${fmt(r.webLimit, 3)} mm for ${fmt(p.oz, 3)} oz`} />
                </tbody>
              </table>
            </Panel>
          </div>
          <Panel title="Padstack">
            <PadstackDrawing r={r} spokes={p.spokes} fmtLen={(mm) => `${L(mm)} ${unit}`} />
          </Panel>
        </>
      )}
    </ToolPage>
  );
}

type PadResult = ReturnType<typeof padstack>;

function PadstackDrawing({ r, spokes, fmtLen }: { r: PadResult; spokes: number; fmtLen: (mm: number) => string }) {
  const V = 200; // view size of each sub-drawing
  const c = V / 2;
  const span = Math.max(r.padOuter, r.padInner, r.antipad, r.thermalOd) * 1.35;
  const k = V / span;
  const R = (dMm: number) => (dMm / 2) * k;
  const bg = 'var(--sheet)';
  const views = [
    {
      title: 'Outer layers',
      sub: `pad ${fmtLen(r.padOuter)}, hole ${fmtLen(r.hole)}`,
      body: (
        <>
          <circle cx={c} cy={c} r={R(r.padOuter)} fill="var(--copper)" />
          <circle cx={c} cy={c} r={R(r.hole)} fill={bg} stroke="var(--ink)" strokeWidth={1} />
        </>
      ),
    },
    {
      title: 'Inner signal layers',
      sub: `pad ${fmtLen(r.padInner)}, drill ${fmtLen(r.drill)}`,
      body: (
        <>
          <circle cx={c} cy={c} r={R(r.padInner)} fill="var(--copper)" />
          <circle cx={c} cy={c} r={R(r.drill)} fill={bg} stroke="var(--ink)" strokeWidth={1} />
        </>
      ),
    },
    {
      title: 'Plane, thermal relief',
      sub: `ID ${fmtLen(r.thermalId)}, OD ${fmtLen(r.thermalOd)}`,
      body: (
        <>
          <rect x={4} y={4} width={V - 8} height={V - 8} fill="var(--copper)" opacity={0.85} />
          <circle cx={c} cy={c} r={R(r.thermalOd)} fill={bg} />
          {Array.from({ length: spokes }, (_, i) => (
            <rect
              key={i}
              x={c}
              y={c - R(r.spokeWidth)}
              width={R(r.thermalOd) + 1}
              height={2 * R(r.spokeWidth)}
              fill="var(--copper)"
              transform={`rotate(${45 + (360 / spokes) * i} ${c} ${c})`}
            />
          ))}
          <circle cx={c} cy={c} r={R(r.thermalId)} fill="var(--copper)" />
          <circle cx={c} cy={c} r={R(r.drill)} fill={bg} stroke="var(--ink)" strokeWidth={1} />
        </>
      ),
    },
    {
      title: 'Plane, clearance',
      sub: `antipad ${fmtLen(r.antipad)}`,
      body: (
        <>
          <rect x={4} y={4} width={V - 8} height={V - 8} fill="var(--copper)" opacity={0.85} />
          <circle cx={c} cy={c} r={R(r.antipad)} fill={bg} />
          <circle cx={c} cy={c} r={R(r.drill)} fill="none" stroke="var(--ink)" strokeWidth={1} strokeDasharray="3 2" />
        </>
      ),
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 p-3 md:grid-cols-4">
      {views.map((v) => (
        <figure key={v.title} className="m-0 text-center">
          <svg viewBox={`0 0 ${V} ${V}`} className="mx-auto block h-auto w-full max-w-[200px]" role="img" aria-label={`${v.title}: ${v.sub}`}>
            <rect x={0.5} y={0.5} width={V - 1} height={V - 1} fill={bg} stroke="var(--line)" />
            {v.body}
          </svg>
          <figcaption className="mt-1">
            <div className="font-semibold">{v.title}</div>
            <div className="text-[11px] text-muted">{v.sub}</div>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function Method() {
  return (
    <>
      <h2>Hole</h2>
      <p>
        The finished (plated) hole is the maximum lead diameter plus an allowance that depends on the density level. A rectangular lead uses its diagonal √(<i>W</i>
        <sup>2</sup> + <i>T</i>
        <sup>2</sup>), because the corners must clear the hole.
      </p>
      <table className="tbl my-2 max-w-[560px]">
        <thead>
          <tr>
            <th className="text-left" />
            <th className="v">Level A</th>
            <th className="v">Level B</th>
            <th className="v">Level C</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Hole over max lead (IPC-2222 / IPC-7251)</td>
            <td className="v">0.25</td>
            <td className="v">0.20</td>
            <td className="v">0.15</td>
          </tr>
          <tr>
            <td>Fabrication allowance, IPC-7251 land patterns</td>
            <td className="v">0.60</td>
            <td className="v">0.50</td>
            <td className="v">0.40</td>
          </tr>
          <tr>
            <td>Fabrication allowance, IPC-2221 Table 9-1</td>
            <td className="v">0.40</td>
            <td className="v">0.25</td>
            <td className="v">0.20</td>
          </tr>
          <tr>
            <td>Thermal ID over hole (IPC-7251 chart)</td>
            <td className="v">0.60</td>
            <td className="v">0.40</td>
            <td className="v">0.30</td>
          </tr>
          <tr>
            <td>Thermal OD / antipad over hole (IPC-7251 chart)</td>
            <td className="v">1.00</td>
            <td className="v">0.70</td>
            <td className="v">0.50</td>
          </tr>
        </tbody>
      </table>
      <p className="text-[12px] text-muted">All values in mm.</p>
      <h2>Lands</h2>
      <p>IPC-2221 §9.1.1 gives the worst-case land-to-hole relationship:</p>
      <div className="eq">
        <span className="no">(1)</span>
        Land<sub>min</sub> = <i>a</i> + 2<i>b</i> + <i>c</i>
      </div>
      <p>
        Here <i>a</i> is the maximum finished hole (the drilled hole on internal layers), <i>b</i> is the minimum annular ring and <i>c</i> is the fabrication allowance. IPC-2221 Table 9-2
        sets the minimum annular ring at {ANNULAR_RING.external} mm on external layers (supported holes) and {ANNULAR_RING.internal} mm on internal layers. The notes to Table 9-1 add
        0.05 mm per oz of copper above 1 oz and 0.05 mm above 8 layers. They are applied when the IPC-2221 basis is selected. IPC-7251 land patterns use larger allowances (0.6/0.5/0.4 mm)
        and the finished hole for <i>a</i>. The published worked example, a 0.55 mm lead at Level B, gives a 0.75 mm hole and a 1.35 mm pad. The IPC-7251 padstack default repeats the outer
        land on inner layers. This page reports the larger of that and the IPC-2221 internal minimum.
      </p>
      <h2>Planes</h2>
      <p>
        IPC-2222 §9.1.2: the total width of the thermal webs should be 60 % of the land diameter, divided among the spokes. The combined web of all planes on one hole should not exceed
        4.0 mm for 1 oz copper (2.0 mm for 2 oz). The thermal ID and OD, and the rule that the plane clearance equals the thermal OD, come from the IPC-7251 padstack charts by
        PCB Matrix (T. Hausherr). They are a library convention, not a requirement of the IPC-2221/2222 text, which leaves thermal geometry to the designer. IPC-2221 §9.1.3 says only that the
        relationship between hole, land and web is critical.
      </p>
      <h3>Unverified defaults (editable)</h3>
      <ul>
        <li>
          <b>Drill oversize 0.10 mm.</b> This is a conservative assumption for the plating allowance, not an IPC value. Ask your fabricator; many use 0.05–0.15 mm.
        </li>
        <li>
          <b>Hole tolerance 0.</b> This matches the IPC-7251 charts, which size the land from the nominal hole. Enter the fabricator’s plus tolerance to apply IPC-2221 strictly.
        </li>
        <li>
          <b>IPC-7251 fabrication allowances and hole allowances.</b> IPC-7251 itself was not available. These values come from secondary sources that agree with each other: the PCB Matrix chart,
          EDN and PCB 3D.
        </li>
        <li>
          <b>Internal annular ring.</b> 0.03 mm is from IPC-2221 (1998) Table 9-2. Secondary sources quote 0.025 mm for IPC-2221B.
        </li>
        <li>
          <b>Maximum hole-to-lead difference.</b> IPC-2222B Table 9-6 also caps the hole relative to the minimum lead (0.7 mm at Level B, per a secondary source). The page does not check this.
        </li>
      </ul>
      <h2>References</h2>
      <ol>
        <li>IPC-2221, Generic Standard on Printed Board Design, Feb. 1998, §9.1 and Tables 9-1 and 9-2.</li>
        <li>IPC-2222, Sectional Design Standard for Rigid Organic Printed Boards, §9.1.2 (thermal relief) and the hole-to-lead tables.</li>
        <li>IPC-7251, Generic Requirements for Through-Hole Design and Land Pattern Standard.</li>
        <li>T. Hausherr (PCB Matrix), IPC-7251 PTH padstack charts and the IPC-7x51 padstack naming convention.</li>
        <li>“Standards for PTH Hole and Pad Diameter sizes”, EDN; “How to calculate PTH hole and pad diameter sizes according to IPC-7251, IPC-2222 and IPC-2221”, PCB 3D.</li>
      </ol>
    </>
  );
}
