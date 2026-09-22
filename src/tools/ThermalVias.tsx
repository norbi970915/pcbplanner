import { ToolPage } from '../components/ToolPage';
import { Big, LenField, Notes, NumField, Panel, Result, Section, SelectField } from '../components/ui';
import { FILLS, viaArray, type Fill } from '../lib/thermal';
import { fmt } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { n: 9, hole: 0.3, plating: 0.025, len: 1.6, fill: 'none', fillK: 0, padW: 3, padH: 3, kLam: 0.3, p: 2 };

export default function ThermalVias() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const fill = p.fill as Fill | 'custom';
  const fillK = fill === 'custom' ? p.fillK : FILLS[fill].k;
  const errors: string[] = [];
  if (!(p.n >= 1 && p.n <= 10000 && Number.isInteger(p.n))) errors.push('Via count must be a whole number from 1 to 10 000.');
  if (!(p.hole > 0 && p.plating > 0 && p.len > 0)) errors.push('Hole, plating and length must be greater than 0.');
  if (!(p.padW >= 0 && p.padH >= 0)) errors.push('Pad size cannot be negative.');
  const r = errors.length ? null : viaArray({ count: p.n, holeMm: p.hole, platingMm: p.plating, lengthMm: p.len, fillK, padAreaMm2: p.padW * p.padH, kLaminate: p.kLam, powerW: p.p });
  const notes: string[] = [];
  if (r && r.viaAreaFraction > 0.6) notes.push(`The vias cover ${fmt(100 * r.viaAreaFraction, 3)} % of the pad. Check the via pitch and the solder-wicking risk (plug or tent open vias).`);

  // grid drawing
  // the drawing shows at most 20 × 20 vias; the numbers always use the real count
  const shown = Math.min(p.n, 400);
  const cols = Math.ceil(Math.sqrt(shown));
  const rows = Math.ceil(shown / cols);

  const properties = (
    <>
      <Section title="Via Array">
        <NumField label="Number of vias" symbol="N" value={p.n} onChange={(v) => set({ n: Math.round(v) })} unit="" />
        <LenField label="Finished hole" symbol="d" value={p.hole} onChange={(v) => set({ hole: v })} />
        <LenField label="Plating thickness" value={p.plating} onChange={(v) => set({ plating: v })} units={['um', 'mil', 'mm', 'oz']} />
        <LenField label="Board thickness" symbol="h" value={p.len} onChange={(v) => set({ len: v })} />
        <SelectField
          label="Via fill"
          value={fill}
          onChange={(v) => set({ fill: v })}
          options={[...Object.entries(FILLS).map(([k, f]) => ({ value: k as Fill | 'custom', label: f.label })), { value: 'custom', label: 'Custom k' }]}
        />
        {fill === 'custom' && <NumField label="Fill conductivity" value={p.fillK} onChange={(v) => set({ fillK: v })} unit="W/m·K" allowZero />}
      </Section>
      <Section title="Pad and Laminate">
        <LenField label="Thermal pad width" value={p.padW} onChange={(v) => set({ padW: v })} allowZero />
        <LenField label="Thermal pad length" value={p.padH} onChange={(v) => set({ padH: v })} allowZero />
        <NumField label="Laminate k (through-plane)" value={p.kLam} onChange={(v) => set({ kLam: v })} unit="W/m·K" allowZero hint="FR-4 is about 0.3 W/m·K through the thickness." />
      </Section>
      <Section title="Load">
        <NumField label="Power through the array" symbol="P" value={p.p} onChange={(v) => set({ p: v })} unit="W" allowZero />
      </Section>
    </>
  );

  return (
    <ToolPage
      title="Thermal Via Array"
      description="Thermal resistance of an array of plated vias under an exposed pad (open, epoxy- or copper-filled), including conduction through the laminate, and the temperature drop through the board."
      onReset={reset}
      properties={properties}
      status={r ? `Array ${fmt(r.rTotal, 4)} °C/W · ΔT ${fmt(r.deltaT, 4)} °C at ${fmt(p.p, 3)} W` : 'Check the inputs'}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      <Notes items={notes} />
      {r && (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
          <Panel title="Results">
            <div className="flex flex-wrap gap-8 px-2.5 py-2">
              <Big label="Thermal resistance, top to bottom" value={fmt(r.rTotal, 4)} unit="°C/W" />
              <Big label={`Temperature drop at ${fmt(p.p, 3)} W`} value={fmt(r.deltaT, 4)} unit="°C" />
            </div>
            <table className="tbl">
              <tbody>
                <Result label="One via (barrel + fill)" value={fmt(r.rVia, 4)} unit="°C/W" sub={`barrel only: ${fmt(r.rBarrel, 4)} °C/W`} />
                <Result label={`${p.n} vias in parallel`} value={fmt(r.rArray, 4)} unit="°C/W" />
                <Result label="Laminate under the pad" value={Number.isFinite(r.rLaminate) ? fmt(r.rLaminate, 4) : '—'} unit="°C/W" />
                <Result label="Heat carried by the vias" value={fmt(100 * r.viaShare, 3)} unit="%" />
                <Result label="Via area / pad area" value={Number.isFinite(r.viaAreaFraction) ? fmt(100 * r.viaAreaFraction, 3) : '—'} unit="%" />
              </tbody>
            </table>
          </Panel>
          <Panel title="Pad Layout (schematic)">
            <div className="p-3">
              <svg viewBox="0 0 200 200" className="h-auto w-full">
                <rect x="20" y="20" width="160" height="160" fill="var(--copper)" opacity="0.85" />
                {Array.from({ length: shown }, (_, k) => {
                  const cx = 20 + (160 / cols) * ((k % cols) + 0.5);
                  const cy = 20 + (160 / rows) * (Math.floor(k / cols) + 0.5);
                  const rr = Math.min(160 / cols, 160 / rows) * 0.22;
                  return (
                    <g key={k}>
                      <circle cx={cx} cy={cy} r={rr * 1.25} fill="var(--copper)" stroke="var(--ink)" strokeWidth="0.6" />
                      <circle cx={cx} cy={cy} r={rr} fill={fillK > 100 ? 'var(--copper)' : fillK > 0 ? 'var(--muted)' : 'var(--sheet)'} stroke="var(--ink)" strokeWidth="0.6" />
                    </g>
                  );
                })}
              </svg>
            </div>
          </Panel>
        </div>
      )}
    </ToolPage>
  );
}

export function Method() {
  return (
    <>
      <h2>Model</h2>
      <p>Each via is a copper tube (the plating) and optionally a filled core. The two conduct heat in parallel through the board thickness <i>h</i>:</p>
      <div className="eq">
        <span className="no">(1)</span>
        <i>R</i>
        <sub>via</sub> = <i>h</i> / ( <i>k</i>
        <sub>Cu</sub> <i>A</i>
        <sub>barrel</sub> + <i>k</i>
        <sub>fill</sub> <i>A</i>
        <sub>hole</sub> )
      </div>
      <p>
        <i>N</i> vias act in parallel. The laminate under the rest of the pad adds a small parallel path (FR-4 ≈ 0.3 W/m·K). Copper is taken as 401 W/m·K. Spreading resistance in
        the pad and in the planes is not included, so treat the result as the vertical resistance only. In a real board the planes on inner layers also spread heat sideways.
      </p>
      <h2>References</h2>
      <ol>
        <li>Texas Instruments SLMA002, “PowerPAD Thermally Enhanced Package.”</li>
        <li>Texas Instruments SNVA183, “AN-2020 Thermal Design by Insight, Not Hindsight.”</li>
      </ol>
    </>
  );
}
