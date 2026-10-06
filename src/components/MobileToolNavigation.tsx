import { useEffect, useState, type RefObject } from 'react';
interface Summary {label:string;value:string}
const text=(el:Element|null)=>el?.textContent?.replace(/\s+/g,' ').trim()??'';
/** Read the rendered results so the mobile summary always uses the tool's existing calculation. */
export function MobileToolNavigation({mainRef,statusEl,onShowInputs}:{mainRef:RefObject<HTMLElement|null>;statusEl:HTMLElement|null;onShowInputs:()=>void}) {
  const [summary,setSummary]=useState<Summary[]>([]);
  useEffect(()=>{
    let frame=0;
    const update=()=>{
      frame=0;const main=mainRef.current;
      const paused=main?.querySelector('.inputs-paused');
      const error=main?.querySelector('[role="alert"]');
      const results=main?[...main.querySelectorAll('.headline-result')].slice(0,2):[];
      const next=paused?[{label:'Results paused',value:text(paused.querySelector('p'))}]:error?[{label:'Check inputs',value:text(error)}]:results.length?results.map(el=>({
        label:text(el.querySelector('[data-copy-label]')),
        value:el.getAttribute('data-result-busy')==='true'?'Updating\u2026':[text(el.querySelector('[data-copy-value]')),text(el.querySelector('[data-copy-unit]'))].filter(Boolean).join(' '),
      })):[{label:'Current result',value:text(statusEl)||'Enter inputs to see results.'}];
      setSummary(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next);
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
    const observer=new MutationObserver(schedule);
    if(mainRef.current)observer.observe(mainRef.current,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-result-busy','data-inputs-invalid','hidden']});
    if(statusEl)observer.observe(statusEl,{subtree:true,childList:true,characterData:true});
    schedule();return()=>{observer.disconnect();cancelAnimationFrame(frame);};
  },[mainRef,statusEl]);
  const scroll=(target:HTMLElement|null)=>target?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
  return <div className="mobile-workbench-bar">
    <nav aria-label="Calculator sections" className="mobile-workbench-actions">
      <button type="button" className="btn" aria-controls="tool-inputs" onClick={()=>{onShowInputs();requestAnimationFrame(()=>scroll(document.getElementById('tool-inputs')));}}>Inputs ↑</button>
      <button type="button" className="btn btn-primary" aria-controls="tool-panel" onClick={()=>scroll(mainRef.current)}>Results ↓</button>
    </nav>
    <div className="mobile-workbench-summary" role="status" aria-live="polite">{summary.map((item,i)=><div key={i} title={item.label+': '+item.value}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div>
  </div>;
}
