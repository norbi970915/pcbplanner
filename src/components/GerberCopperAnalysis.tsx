import { useEffect, useId, useRef, useState } from 'react';
import { Button } from './shadcn/button';
import { Notes } from './ui';
import { isCopperLayer, isProfileLayer } from '../lib/gerberCopper';
import { analyseCopper, type CopperResult } from '../lib/gerberCopperClient';
import type { GerberLayer } from '../lib/gerber';

type Side='A'|'B';
interface Props {a:GerberLayer[];b:GerberLayer[]}
const number=(value:number)=>value.toLocaleString('en-GB',{maximumFractionDigits:2});
const suggestedProfile=(layers:GerberLayer[])=>{const candidates=layers.filter(isProfileLayer);return candidates.length===1?candidates[0].id:'';};
const canonical=(label:string)=>label.toLowerCase().replace(/[^a-z0-9]/g,'');

/** Mount with a key based on imported geometry IDs. Visibility, colour and alignment do not invalidate measurements. */
export function GerberCopperAnalysis({a,b}:Props){
  const id=useId();
  const [outlines,setOutlines]=useState<Record<Side,string>>({A:suggestedProfile(a),B:suggestedProfile(b)});
  const [selected,setSelected]=useState<Record<Side,string[]>>({A:a.filter(isCopperLayer).map(l=>l.id),B:b.filter(isCopperLayer).map(l=>l.id)});
  const [pixelMm,setPixelMm]=useState('0.05'),[progress,setProgress]=useState(''),[errors,setErrors]=useState<string[]>([]);
  const [results,setResults]=useState<Partial<Record<Side,CopperResult>>>({});
  const [pairA,setPairA]=useState(''),[pairB,setPairB]=useState<string|null>(null);
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  const invalidate=()=>{controller.current?.abort();setResults({});setErrors([]);setPairA('');setPairB(null);};
  const sides:Side[]=[...(a.length?['A' as const]:[]),...(b.length?['B' as const]:[])];
  const layouts={A:a,B:b};
  const ready=sides.some(side=>outlines[side]&&selected[side].some(value=>value!==outlines[side]));
  const run=async()=>{
    controller.current?.abort();const active=new AbortController();controller.current=active;
    setResults({});setErrors([]);setPairA('');setPairB(null);
    const failures:string[]=[];
    try{
      for(const side of sides){
        const outline=layouts[side].find(layer=>layer.id===outlines[side]);
        const copper=layouts[side].filter(layer=>selected[side].includes(layer.id)&&layer.id!==outlines[side]);
        if(!outline||!copper.length){failures.push('Layout '+side+': '+(!outline?'select a board outline.':'select at least one copper layer.'));continue;}
        try{
          const result=await analyseCopper(outline,copper,Number(pixelMm),active.signal,message=>setProgress('Layout '+side+': '+message));
          if(!active.signal.aborted)setResults(current=>({...current,[side]:result}));
        }catch(error){if(active.signal.aborted)break;failures.push('Layout '+side+': '+(error instanceof Error?error.message:'Could not calculate copper coverage.'));}
      }
      if(!active.signal.aborted)setErrors(failures);
    }finally{if(controller.current===active){setProgress('');controller.current=null;}}
  };
  const cancel=()=>{controller.current?.abort();setProgress('');controller.current=null;setErrors(['Analysis cancelled. Any completed layout results remain below.']);};
  const layerA=results.A?.layers.find(layer=>layer.id===pairA)??results.A?.layers[0];
  const matches=layerA?results.B?.layers.filter(layer=>canonical(layer.label)===canonical(layerA.label))??[]:[];
  const layerB=pairB===null?(matches.length===1?matches[0]:undefined):results.B?.layers.find(layer=>layer.id===pairB);
  return <section className="gerber-copper" aria-label="Copper distribution">
    <div className="gerber-copper-heading"><h3>Copper distribution</h3><p>Measure each copper layer against its layout's board outline. Visibility, zoom, colours and B alignment do not affect the calculation.</p></div>
    {!sides.length?<p className="text-faint">Open Gerber copper layers and a board-profile layer to begin.</p>:<>
      <fieldset disabled={!!progress} className="gerber-copper-settings">
        <legend className="sr-only">Copper analysis settings</legend>
        <div className="gerber-copper-layouts">{sides.map(side=><div className="gerber-copper-layout" key={side}>
          <h4>Layout {side}</h4>
          <label htmlFor={id+'-outline-'+side}>Board outline</label>
          <select id={id+'-outline-'+side} value={outlines[side]} onChange={event=>{invalidate();const value=event.target.value;setOutlines(current=>({...current,[side]:value}));setSelected(current=>({...current,[side]:current[side].filter(item=>item!==value)}));}}>
            <option value="">Select a closed board profile</option>{layouts[side].map(layer=><option value={layer.id} key={layer.id}>{layer.label} — {layer.name}</option>)}
          </select>
          {!outlines[side]&&<p className="gerber-copper-hint">A closed outline is required. Add the profile file to this layout if it is missing.</p>}
          <div className="gerber-copper-layer-heading"><span>Copper layers</span><button type="button" className="gerber-copper-suggest" onClick={()=>{invalidate();setSelected(current=>({...current,[side]:layouts[side].filter(layer=>isCopperLayer(layer)&&layer.id!==outlines[side]).map(layer=>layer.id)}));}}>Use suggested</button></div>
          <div className="gerber-copper-checks">{layouts[side].filter(layer=>layer.id!==outlines[side]).map(layer=><label key={layer.id}>
            <input type="checkbox" checked={selected[side].includes(layer.id)} onChange={event=>{invalidate();const checked=event.target.checked;setSelected(current=>({...current,[side]:checked?[...current[side],layer.id]:current[side].filter(value=>value!==layer.id)}));}}/>
            <span>{layer.label}<small>{layer.name}</small></span>
          </label>)}</div>
        </div>)}</div>
        <p className="gerber-copper-hint">Copper layers are suggested from file labels and names. Confirm the selection; solder mask, paste, legend and drill artwork are separate.</p>
        <div className="gerber-copper-resolution"><label htmlFor={id+'-resolution'}>Analysis resolution</label><select id={id+'-resolution'} value={pixelMm} onChange={event=>{invalidate();setPixelMm(event.target.value);}}><option value="0.05">Standard · 50 µm / pixel</option><option value="0.025">Fine · 25 µm / pixel</option></select></div>
      </fieldset>
      <div className="gerber-copper-actions"><Button size="sm" disabled={!ready||!!progress} onClick={()=>void run()}>Analyse copper</Button>{progress&&<Button variant="outline" size="sm" onClick={cancel}>Cancel analysis</Button>}<span role="status">{progress}</span></div>
      <Notes kind="error" items={errors}/>
      {sides.map(side=>{const result=results[side];return result&&<section key={side} className="gerber-copper-result" aria-label={'Layout '+side+' copper results'}>
        <h4>Layout {side} · copper distribution</h4>
        <p className="gerber-copper-summary">Board area ≈ <strong>{number(result.boardArea)} mm²</strong> · {result.cutouts} enclosed cutout{result.cutouts===1?'':'s'} · {(result.pixelMm*1000).toFixed(1)} µm / pixel{result.limited?' (adjusted for board size)':''}</p>
        <p className="gerber-copper-hint">Outline: {result.outlineName}</p>
        <div className="gerber-copper-table-wrap" tabIndex={0} role="region" aria-label={'Layout '+side+' distribution table'}><table className="gerber-copper-table"><thead><tr><th scope="col">Copper layer</th><th scope="col">Coverage</th><th scope="col">Copper area</th></tr></thead><tbody>{result.layers.map(layer=><tr key={layer.id} data-copper-layer={layer.name}>
          <th scope="row">{layer.label}<small>{layer.name}</small></th><td><strong>{layer.percent.toFixed(1)}%</strong><div className={'gerber-copper-bar gerber-copper-bar-'+side} aria-hidden="true"><span style={{width:layer.percent+'%'}}/></div></td><td>≈ {number(layer.copperArea)} mm²</td>
        </tr>)}</tbody></table></div>
      </section>;})}
      {results.A&&results.B&&<section className="gerber-copper-comparison" aria-label="Compare copper coverage">
        <h4>Compare coverage</h4><div className="gerber-copper-pair">
          <label>Layout A layer<select value={layerA?.id??''} onChange={event=>{setPairA(event.target.value);setPairB(null);}}>{results.A.layers.map(layer=><option key={layer.id} value={layer.id}>{layer.label} — {layer.name}</option>)}</select></label>
          <label>Layout B layer<select value={layerB?.id??''} onChange={event=>setPairB(event.target.value)}><option value="">Select corresponding copper layer</option>{results.B.layers.map(layer=><option key={layer.id} value={layer.id}>{layer.label} — {layer.name}</option>)}</select></label>
        </div>
        {layerA&&layerB?<p className="gerber-copper-delta">A {layerA.percent.toFixed(1)}% → B {layerB.percent.toFixed(1)}% <strong>{layerB.percent-layerA.percent>=0?'+':''}{(layerB.percent-layerA.percent).toFixed(1)} percentage points</strong></p>:<p className="gerber-copper-hint">Select corresponding copper layers to compare their percentages.</p>}
        {Math.abs(results.A.boardArea-results.B.boardArea)>Math.max(results.A.boardArea,results.B.boardArea)*0.001&&<p className="gerber-copper-hint">The board areas differ. Each percentage uses its own layout's outline.</p>}
      </section>}
      <p className="gerber-copper-footnote">Coverage = projected copper area inside the outline ÷ board area × 100. Enclosed profile cutouts are excluded. Drill holes are not automatically subtracted; this measures the exported copper artwork. Results are raster estimates at the displayed resolution, independent of the viewer preview. All processing stays on your device.</p>
    </>}
  </section>;
}