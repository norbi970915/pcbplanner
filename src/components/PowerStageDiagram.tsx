import { useState } from 'react';
import { DiagramSvg, DiagramValues, EngineeringDiagram } from './EngineeringDiagram';
import { Segmented } from './ui';
import { fmt, si } from '../lib/units';
interface Props { kind:'buck'|'boost'; vin:number; vout:number; iout:number; inductance:number; vf:number; ccm:boolean; inputCap:boolean; cout:number; coutRequired:number; }
export function PowerStageDiagram({kind,vin,vout,iout,inductance,vf,ccm,inputCap,cout,coutRequired}:Props) {
  const [phase,setPhase]=useState<'on'|'off'>('on');
  const buck=kind==='buck',on=phase==='on',synchronous=buck&&vf===0;
  const active=ccm?(on?'var(--accent-ink)':'var(--copper)'):'var(--muted)';
  const caption=!ccm?'Topology only: these inputs are outside the continuous-conduction model.' : buck
    ? on?'Switch on: the input feeds the inductor and load; inductor current rises.':'Switch off: inductor current continues through the low-side rectifier to the load.'
    : on?'Switch on: input current stores energy in the inductor; the output capacitor supplies the load.':'Switch off: the input and inductor feed the output through the rectifier.';
  const switchSymbol=(x:number,y:number,closed:boolean,vertical=false)=>vertical?<g><circle cx={x} cy={y} r="3"/><circle cx={x} cy={y+36} r="3"/><path d={'M'+x+' '+y+'L'+(closed?x:x+14)+' '+(y+32)}/></g>:<g><circle cx={x} cy={y} r="3"/><circle cx={x+40} cy={y} r="3"/><path d={'M'+x+' '+y+'L'+(x+36)+' '+(closed?y:y-18)}/></g>;
  const cap=(x:number)=><g><path d={'M'+x+' 80V132 M'+(x-13)+' 132H'+(x+13)+' M'+(x-13)+' 145H'+(x+13)+' M'+x+' 145V216'}/></g>;
  const diode=(x:number,vertical=false)=>vertical?<g><path d={'M'+x+' 80V126 M'+(x-12)+' 126H'+(x+12)+' M'+(x-10)+' 146L'+x+' 129L'+(x+10)+' 146Z M'+x+' 146V216'} fill="none"/></g>:<g><path d={'M'+(x-28)+' 80H'+(x-12)+' M'+(x-12)+' 68L'+(x+8)+' 80L'+(x-12)+' 92Z M'+(x+12)+' 66V94 M'+(x+12)+' 80H'+(x+28)} fill="none"/></g>;
  return <>
    <div className="power-stage-controls"><span className="text-muted">Current path</span><Segmented label="Switch phase" value={phase} onChange={setPhase} options={[{value:'on',label:'Switch on'},{value:'off',label:'Switch off'}]}/></div>
    <EngineeringDiagram caption={caption+(ccm?' Arrows show the main conventional-current paths in ideal CCM operation.':'')+(!buck&&vf===0?' A functional rectifier block is shown because forward-drop loss is omitted.':'')}
      legend={[{label:'Switch-on path',color:'var(--accent-ink)'},{label:'Switch-off / output path',color:'var(--copper)'}]}>
      <DiagramSvg viewBox="0 0 560 270" label={(buck?'Buck':'Boost')+' converter power stage, switch '+phase+(synchronous?', synchronous low-side switch':'')}>
        {()=> <>
          {ccm && <g data-current-phase={phase} fill="none" stroke={active} strokeWidth="5" strokeOpacity=".22" strokeLinejoin="round">
            <path d={buck?(on?'M40 80H500V216H40V80':'M228 80H500V216H228V80'):(on?'M40 80H260V216H40V80':'M40 80H500V216H40V80')}/>
            {!buck&&on&&<path d="M408 80H500V216H408V80" stroke="var(--copper)"/>}
          </g>}
          <g fill="none" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M40 80V112 M40 152V216H500 M500 80V126 M500 170V216"/>
            <circle cx="40" cy="132" r="20" fill="var(--sheet)"/><path d="M34 125H46 M40 119V131 M34 141H46"/>
            {inputCap&&cap(90)}{cap(408)}<rect x="490" y="126" width="20" height="44" rx="2" fill="var(--sheet)"/>
            {buck?<>
              <path d="M40 80H154 M194 80H254 M326 80H500"/>{switchSymbol(154,80,on)}
              <path d="M254 80c0 -18 18 -18 18 0c0 -18 18 -18 18 0c0 -18 18 -18 18 0c0 -18 18 -18 18 0" stroke="var(--copper)" strokeWidth="2.5"/>
              {synchronous?<><path d="M228 80V128 M228 164V216"/>{switchSymbol(228,128,!on,true)}</>:diode(228,true)}
            </>:<>
              <path d="M40 80H144 M216 80H314 M370 80H500 M260 80V128 M260 164V216"/>
              <path d="M144 80c0 -18 18 -18 18 0c0 -18 18 -18 18 0c0 -18 18 -18 18 0c0 -18 18 -18 18 0" stroke="var(--copper)" strokeWidth="2.5"/>
              {switchSymbol(260,128,on,true)}
              {vf>0?diode(342):<rect x="314" y="64" width="56" height="32" rx="3" fill="var(--sheet)"/>}
            </>}
            <path d="M290 216V235 M276 235H304 M281 242H299 M286 249H294"/>
          </g>
          <g className="diagram-label" textAnchor="middle">
            <text x="40" y="55">Vin</text><text x="500" y="55">Vout</text>{inputCap&&<text x="90" y="241">Cin</text>}
            <text x="408" y="241">Cout</text><text x="528" y="152">Load</text><text x={buck?290:180} y="47">L</text><text x={buck?174:291} y={buck?47:157}>Q1</text>
            {buck?<text x="202" y="190">{synchronous?'Q2':'D'}</text>:vf>0?<text x="342" y="47">D</text>:<text x="342" y="85" className="diagram-note">Rect.</text>}
          </g>
          {ccm&&<g fill="none" stroke={active} strokeWidth="2" strokeLinecap="round"><path d={buck?'M256 109H315 M308 103L315 109L308 115':on?'M148 109H207 M200 103L207 109L200 115':'M372 109H430 M423 103L430 109L423 115'}/></g>}
        </>}
      </DiagramSvg>
      <DiagramValues items={[
        {label:'Nominal input',value:fmt(vin,4)+' V'},{label:'Output / load',value:fmt(vout,4)+' V / '+fmt(iout,4)+' A'},
        {label:'L \u00b7 Inductor used',value:si(inductance,'H',4)},
        {label:cout>0?'Cout \u00b7 Nominal bank':'Cout \u00b7 Effective needed',value:cout>0?si(cout,'F',4):ccm?si(coutRequired,'F',4):'\u2014'},
      ]}/>
    </EngineeringDiagram>
  </>;
}
