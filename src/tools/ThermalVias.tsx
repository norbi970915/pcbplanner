import { DiagramDimension, DiagramFocus, DiagramSvg, DiagramValues, EngineeringDiagram } from '../components/EngineeringDiagram';
import { useSettings } from '../state/settings';
import { ToolPage } from '../components/ToolPage';
import { ComparisonButton, ComparisonPanel } from '../components/DesignComparison';
import { useDesignComparison } from '../state/useDesignComparison';
import { comparisonRow as row } from '../lib/designComparison';
import { Big, LenField, Notes, NumField, Panel, Result, Section, SelectField } from '../components/ui';
import { FILLS, viaArray, type Fill } from '../lib/thermal';
import { fmt, fromMm } from '../lib/units';
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

  const { unit } = useSettings();
  const length = (mm: number) => fmt(fromMm(mm, unit), 3) + ' ' + unit;
  // grid drawing
  // the drawing shows at most 400 vias; the numbers always use the real count
  const shown = Math.min(p.n, 400);
  const hasPad = p.padW > 0 && p.padH > 0;
  const cols = Math.max(1, Math.min(shown, Math.ceil(Math.sqrt(shown * (hasPad ? p.padW / p.padH : 1)))));
  const rows = Math.ceil(shown / cols);

  const comparison = useDesignComparison('/thermal-vias', {
    state: p,
    inputs: [row('n', 'Via count', p.n), row('hole', 'Finished hole', p.hole, 'mm'), row('plating', 'Plating thickness', p.plating, 'mm'), row('len', 'Board thickness', p.len, 'mm'),
      row('fill', 'Via fill', fill === 'custom' ? 'Custom' : FILLS[fill].label), row('fillK', 'Fill conductivity', fillK, 'W/m\u00b7K'),
      row('padW', 'Pad width', p.padW, 'mm'), row('padH', 'Pad length', p.padH, 'mm'), row('kLam', 'Laminate conductivity', p.kLam, 'W/m\u00b7K'), row('p', 'Power through array', p.p, 'W')],
    results: [row('rTotal', 'Top-to-bottom thermal resistance', r?.rTotal ?? null, '\u00b0C/W'), row('deltaT', 'Temperature drop', r?.deltaT ?? null, '\u00b0C'),
      row('rVia', 'One via (barrel + fill)', r?.rVia ?? null, '\u00b0C/W'), row('rArray', 'Via array resistance', r?.rArray ?? null, '\u00b0C/W'), row('viaShare', 'Heat carried by vias', r ? r.viaShare * 100 : null, '%')],
  }, !!r, set);

  const properties = (
    <>
      <Section title="Via Array">
        <NumField label="Number of vias" symbol="N" min={1} max={10000} allowZero integer value={p.n} onChange={(v) => set({ n: v })} unit="" />
        <LenField label="Finished hole" hint="Hole diameter after copper plating. The pad drawing enlarges via symbols; it does not calculate via pitch." symbol="d" value={p.hole} onChange={(v) => set({ hole: v })} />
        <LenField label="Plating thickness" diagramKey="plating" hint="Copper deposited on the hole wall. This is radial thickness, not the hole diameter." value={p.plating} onChange={(v) => set({ plating: v })} units={['um', 'mil', 'mm', 'oz']} />
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
        <LenField label="Thermal pad width" diagramKey="pad-w" value={p.padW} onChange={(v) => set({ padW: v })} allowZero />
        <LenField label="Thermal pad length" diagramKey="pad-l" value={p.padH} onChange={(v) => set({ padH: v })} allowZero />
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
          <Panel title="Results" right={<ComparisonButton comparison={comparison} />}>
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
            <EngineeringDiagram legend={[{label:'Copper pad / plating',color:'var(--copper)'},{label:fill==='none'?'Open hole':fill==='custom'?'Custom fill':FILLS[fill].label,color:fill==='none'?'var(--sheet)':fillK>100?'var(--copper)':'var(--muted)'}]}
              caption={hasPad ? 'Pad proportions follow your dimensions. Via symbols and positions are illustrative; placement and pitch are not calculated.' + (p.n>400?' Showing 400 of '+p.n+' vias; results use the full count.':'') : 'Set both pad dimensions to show the layout.'}>
              <DiagramSvg viewBox="0 0 280 280" label={'Thermal pad '+length(p.padW)+' by '+length(p.padH)+', '+p.n+' vias, '+(fill==='custom'?'custom fill':FILLS[fill].label)}>{paint=>{
                const scale=180/Math.max(p.padW,p.padH,.001),pw=p.padW*scale,ph=p.padH*scale,x=140-pw/2,y=126-ph/2;
                return hasPad ? <>
                  <rect data-thermal-pad="true" x={x} y={y} width={pw} height={ph} fill={paint.copper} stroke="var(--copper)" strokeWidth="1"/>
                  {Array.from({length:shown},(_,k)=>{
                    const cx=x+pw/cols*((k%cols)+.5),cy=y+ph/rows*(Math.floor(k/cols)+.5),radius=Math.min(pw/cols,ph/rows)*.22;
                    return <g key={k} data-thermal-via="true">
                      <DiagramFocus field={["d", "plating"]} x={cx-radius*1.5} y={cy-radius*1.5} width={radius*3} height={radius*3} /><circle cx={cx} cy={cy} r={radius*1.3} fill="var(--copper)" stroke="var(--ink)" strokeWidth=".7"/>
                      <circle cx={cx} cy={cy} r={radius} fill={fillK>100?paint.copper:fillK>0?'var(--muted)':'var(--sheet)'} stroke="var(--ink)" strokeWidth=".6"/>
                    </g>;
                  })}
                  <DiagramFocus field="n" x={x-4} y={y-4} width={pw+8} height={ph+8} />
                  <DiagramDimension field="pad-w" x1={x} x2={x+pw} y1={242} y2={242} label="W" arrow={paint.arrow}/>
                  <DiagramDimension field="pad-l" x1={250} x2={250} y1={y} y2={y+ph} label="L" arrow={paint.arrow}/>
                </> : <text x="140" y="140" textAnchor="middle" className="diagram-note">Pad dimensions not set</text>;
              }}</DiagramSvg>
              <DiagramValues items={[{field:'pad-w',label:'W \u00b7 Pad width',value:length(p.padW)},{field:'pad-l',label:'L \u00b7 Pad length',value:length(p.padH)},{field:'d',label:'Finished hole',value:length(p.hole)},{field:'n',label:'Array',value:p.n+' vias'}]}/>
            </EngineeringDiagram>
          </Panel>
        </div>
      )}
      <ComparisonPanel comparison={comparison} />
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
