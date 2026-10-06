import { DiagramDimension, DiagramFocus, DiagramSvg, DiagramValues, EngineeringDiagram } from './EngineeringDiagram';
import { fmt } from '../lib/units';
export function CrosstalkDiagram({width,spacing,length}:{width:number;spacing:number;length:(mm:number)=>string}) {
  const scale=220/Math.max(2*width+spacing,.001),w=Math.min(100,Math.max(34,width*scale)),gap=Math.min(140,Math.max(44,spacing*scale));
  const left=(520-2*w-gap)/2,right=left+w+gap,pitch=width+spacing;
  return <EngineeringDiagram legend={[{label:'A \u00b7 Aggressor',color:'var(--copper)'},{label:'V \u00b7 Victim',color:'var(--accent-ink)'}]}
    caption="3W means a centre-to-centre pitch of three trace widths: P = 3W and edge clearance S = 2W. This is a spacing reference; crosstalk also depends on plane distance, coupled length and rise time. Schematic, not to scale.">
    <DiagramSvg viewBox="0 0 520 294" label="Two parallel PCB traces: W is trace width, S is edge-to-edge clearance, P is centre-to-centre pitch">{paint=><>
      <rect x={left} y="108" width={w} height="144" fill={paint.copper} stroke="var(--copper)"/>
      <rect x={right} y="108" width={w} height="144" fill={paint.copper} stroke="var(--accent-ink)" strokeWidth="2"/>
      <path d={'M'+(left+w/2)+' 55V263 M'+(right+w/2)+' 55V263'} className="diagram-centerline"/>
      <DiagramDimension x1={left+w/2} x2={right+w/2} y1={48} y2={48} label="P" arrow={paint.arrow}/>
      <DiagramDimension x1={left} x2={left+w} y1={91} y2={91} label="W" arrow={paint.arrow}/>
      <DiagramDimension x1={left+w} x2={right} y1={185} y2={185} label="S" arrow={paint.arrow}/>
      <DiagramFocus field="v" x={left-4} y={104} width={w+8} height={152} />
      <text x={left+w/2} y="278" textAnchor="middle" className="diagram-label">A</text><text x={right+w/2} y="278" textAnchor="middle" className="diagram-label">V</text>
    </>}</DiagramSvg>
    <DiagramValues items={[
      {label:'W \u00b7 Trace width',value:length(width)},{label:'S \u00b7 Edge clearance',value:length(spacing)},
      {label:'P \u00b7 Centre pitch',value:length(pitch)+' ('+fmt(pitch/width,3)+' W)'},{label:'3W reference pitch',value:length(3*width)},
    ]}/>
  </EngineeringDiagram>;
}
