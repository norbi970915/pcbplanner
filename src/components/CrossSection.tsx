import { fmt } from '../lib/units';
import { DiagramDimension, DiagramSvg, DiagramValues, EngineeringDiagram } from './EngineeringDiagram';

export interface XsecSpec {
  type: 'microstrip' | 'embedded' | 'stripline'; diff: boolean; coupling?: 'edge' | 'broadside';
  w: number; wTop: number; t: number; s: number; h: number; h2: number; er: number; er2: number;
  mask: boolean; cpw: boolean; gap: number;
}
const materials = [
  { label: 'Copper', color: 'var(--copper)' },
  { label: 'Laminate', color: 'var(--laminate)' },
  { label: 'Upper dielectric', color: 'var(--prepreg)' },
];

/** Schematic proportions preserve readable thin features; exact sizes are listed below. */
export function CrossSection({ spec: s, unitLabel, toUnit }: { spec: XsecSpec; unitLabel: string; toUnit: (mm: number) => number }) {
  if (s.diff && s.coupling === 'broadside') return <BroadsideSection spec={s} unitLabel={unitLabel} toUnit={toUnit} />;
  const value = (mm: number) => fmt(toUnit(mm), 3) + ' ' + unitLabel;
  const scale = Math.min((s.cpw ? 210 : 240) / Math.max(s.diff ? 2*s.w+s.s : s.w, .001), 900);
  const w = Math.max(34, s.w * scale), gap = s.diff ? Math.min(120, Math.max(26, s.s * scale)) : 0;
  const cpGap = s.cpw ? Math.min(48, Math.max(24, s.gap * scale)) : 0;
  const etch = Math.min(w*.25, Math.max(0, (s.w-s.wTop)/2*scale));
  const t = Math.min(14, Math.max(8, s.t*scale));
  const h = Math.min(80, Math.max(46, s.h*scale*.9));
  const h2 = s.type === 'microstrip' ? 0 : Math.min(66, Math.max(46, s.h2*scale*.9));
  const bottom = 250, traceBottom = bottom-h, traceTop = traceBottom-t, upperTop = traceTop-h2;
  const traces = s.diff ? [{ a:260-gap/2-w, b:260-gap/2 }, { a:260+gap/2, b:260+gap/2+w }] : [{ a:260-w/2, b:260+w/2 }];
  const left=traces[0].a, right=traces[traces.length-1].b;
  const items = [
    { label:'W \u00b7 Trace width', value:value(s.w) },
    { label:'T \u00b7 Copper thickness', value:value(s.t) },
    { label:'H \u00b7 Lower dielectric', value:value(s.h) },
    ...(s.diff ? [{label:'S \u00b7 Pair gap',value:value(s.s)}] : []),
    ...(s.type !== 'microstrip' ? [{label:'H2 \u00b7 Upper dielectric',value:value(s.h2)}] : []),
    ...(s.cpw ? [{label:'G \u00b7 Coplanar gap',value:value(s.gap)}] : []),
    {label:'Lower dielectric Dk',value:fmt(s.er,3),color:'var(--laminate)'},
    ...(s.type !== 'microstrip' ? [{label:'Upper dielectric Dk',value:fmt(s.er2,3),color:'var(--prepreg)'}] : []),
  ];
  return <EngineeringDiagram caption="Cross-section schematic; thin features are enlarged for readability. Exact dimensions are listed above."
    legend={[...materials.filter(m=>m.label!=='Upper dielectric'||s.type!=='microstrip'), ...(s.mask && s.type==='microstrip' ? [{label:'Solder mask',color:'var(--mask)'}] : [])]}>
    <DiagramSvg viewBox="0 0 520 292" label="Cross-section of the transmission line">{paint=><>
      <rect x="24" y={traceBottom} width="472" height={h} fill={paint.laminate} />
      {s.type!=='microstrip' && <rect x="24" y={upperTop} width="472" height={h2+t} fill={paint.prepreg} />}
      <line x1="24" x2="496" y1={traceBottom} y2={traceBottom} className="diagram-interface" />
      <rect x="24" y={bottom} width="472" height="7" rx="1" fill={paint.copper} />
      {s.type==='stripline' && <rect x="24" y={upperTop-7} width="472" height="7" rx="1" fill={paint.copper} />}
      {s.cpw && <><rect x="24" y={traceTop} width={Math.max(0,left-cpGap-24)} height={t} fill={paint.copper}/><rect x={right+cpGap} y={traceTop} width={Math.max(0,496-right-cpGap)} height={t} fill={paint.copper}/></>}
      {traces.map((tr,i)=><polygon key={i} points={tr.a+','+traceBottom+' '+tr.b+','+traceBottom+' '+(tr.b-etch)+','+traceTop+' '+(tr.a+etch)+','+traceTop} fill={paint.copper} stroke="var(--copper)" strokeWidth="1" />)}
      {s.type==='microstrip' && s.mask && <path d={'M24 '+(traceBottom-5)+'H'+(left-5)+'V'+(traceTop-5)+'H'+(right+5)+'V'+(traceBottom-5)+'H496'} fill="none" stroke="var(--mask)" strokeWidth="4" strokeLinejoin="round" />}
      <DiagramDimension x1={left} x2={traces[0].b} y1={traceTop-25} y2={traceTop-25} label="W" arrow={paint.arrow}/>
      {s.diff && <DiagramDimension x1={traces[0].b} x2={traces[1].a} y1={traceBottom+24} y2={traceBottom+24} label="S" arrow={paint.arrow}/>}
      <DiagramDimension x1={right+cpGap+30} x2={right+cpGap+30} y1={traceBottom} y2={bottom} label="H" arrow={paint.arrow}/>
      {s.type!=='microstrip' && <DiagramDimension x1={right+cpGap+30} x2={right+cpGap+30} y1={upperTop} y2={traceTop} label="H2" arrow={paint.arrow}/>}
      {s.cpw && <DiagramDimension x1={right} x2={right+cpGap} y1={traceTop-25} y2={traceTop-25} label="G" arrow={paint.arrow}/>}
      <path d={'M'+left+' '+(traceTop+t/2)+'H'+(left-24)+'L'+(left-42)+' '+(traceTop-22)} fill="none" stroke="var(--accent-ink)" strokeWidth="1"/>
      <text x={left-46} y={traceTop-24} textAnchor="end" className="diagram-label">T</text>
      <text x="32" y="280" className="diagram-note">Ground plane</text>
    </>}</DiagramSvg>
    <DiagramValues items={items}/>
  </EngineeringDiagram>;
}

function BroadsideSection({ spec:s, unitLabel, toUnit }: {spec:XsecSpec; unitLabel:string; toUnit:(mm:number)=>number}) {
  const value=(v:number)=>fmt(toUnit(v),3)+' '+unitLabel;
  const scale=Math.min(200/Math.max(s.w,.001),900), width=Math.min(220,Math.max(80,s.w*scale));
  const x0=260-width/2,x1=260+width/2, h=Math.min(56,Math.max(40,s.h*scale)), gap=Math.min(64,Math.max(44,s.s*scale));
  const t=Math.min(12,Math.max(8,s.t*scale)), etch=Math.min(width/4,Math.max(0,(s.w-s.wTop)/2*scale));
  const top=48, upperTop=top+h,upperBottom=upperTop+t,lowerTop=upperBottom+gap,lowerBottom=lowerTop+t,bottom=lowerBottom+h;
  const trap=(a:number,b:number)=>x0+','+b+' '+x1+','+b+' '+(x1-etch)+','+a+' '+(x0+etch)+','+a;
  return <EngineeringDiagram legend={materials.map(m=>m.label==='Upper dielectric'?{...m,label:'Pair dielectric'}:m)} caption="Aligned signal layers between two ground planes. S is the copper-to-copper inter-layer gap. Schematic, not to scale.">
    <DiagramSvg viewBox="0 0 520 338" label="Broadside differential pair: two aligned signal layers between ground planes">{paint=><>
      <rect x="24" y={top} width="472" height={h} fill={paint.laminate}/>
      <rect x="24" y={upperTop} width="472" height={gap+2*t} fill={paint.prepreg}/>
      <rect x="24" y={lowerBottom} width="472" height={h} fill={paint.laminate}/>
      <rect x="24" y={top-7} width="472" height="7" rx="1" fill={paint.copper}/>
      <rect x="24" y={bottom} width="472" height="7" rx="1" fill={paint.copper}/>
      <polygon points={trap(upperTop,upperBottom)} fill={paint.copper} stroke="var(--copper)" strokeWidth="1"/>
      <polygon points={trap(lowerTop,lowerBottom)} fill={paint.copper} stroke="var(--copper)" strokeWidth="1"/>
      <DiagramDimension x1={x1+30} x2={x1+30} y1={top} y2={upperTop} label="H" arrow={paint.arrow}/>
      <DiagramDimension x1={x1+30} x2={x1+30} y1={lowerBottom} y2={bottom} label="H" arrow={paint.arrow}/>
      <DiagramDimension x1={x0-42} x2={x0-42} y1={upperBottom} y2={lowerTop} label="S" arrow={paint.arrow}/>
      <DiagramDimension x1={x0} x2={x1} y1={bottom+34} y2={bottom+34} label="W" arrow={paint.arrow}/>
      <path d={'M'+x0+' '+(upperTop+t/2)+'H'+(x0-25)+'L'+(x0-42)+' '+(upperTop-22)} fill="none" stroke="var(--accent-ink)"/>
      <text x={x0-46} y={upperTop-24} textAnchor="end" className="diagram-label">T</text>
      <text x="32" y="29" className="diagram-note">Ground plane</text>
    </>}</DiagramSvg>
    <DiagramValues items={[
      {label:'W \u00b7 Trace width',value:value(s.w)}, {label:'T \u00b7 Copper thickness',value:value(s.t)},
      {label:'S \u00b7 Inter-layer gap',value:value(s.s)}, {label:'H \u00b7 Each outer dielectric',value:value(s.h)},
      {label:'Outer dielectric Dk',value:fmt(s.er,3),color:'var(--laminate)'}, {label:'Pair dielectric Dk',value:fmt(s.er2,3),color:'var(--prepreg)'},
    ]}/>
  </EngineeringDiagram>;
}
