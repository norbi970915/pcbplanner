import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
const WIDTH_KEY='pcbplanner:properties-width';
const MIN=280,MAX=520,DEFAULT=340;
const maximum=()=>Math.max(MIN,Math.min(MAX,Math.floor(window.innerWidth*.4)));
const clamp=(width:number)=>Math.max(MIN,Math.min(maximum(),width));
function initialWidth() {
  try {const saved=localStorage.getItem(WIDTH_KEY),value=saved===null?DEFAULT:Number(saved);return Number.isFinite(value)?Math.max(MIN,Math.min(MAX,value)):DEFAULT;}
  catch{return DEFAULT;}
}
export function ResizablePropertiesPanel({children,className}:{children:ReactNode;className:string}) {
  const [width,setWidth]=useState(initialWidth),[dragging,setDragging]=useState(false);
  const panel=useRef<HTMLElement>(null),start=useRef<{x:number;width:number}|null>(null);
  useEffect(()=>{try{localStorage.setItem(WIDTH_KEY,String(width));}catch{/* optional preference */}},[width]);
  useEffect(()=>{
    const resize=()=>{if(window.innerWidth>=1024)setWidth(value=>clamp(value));};
    const frame=requestAnimationFrame(resize);window.addEventListener('resize',resize);
    return()=>{cancelAnimationFrame(frame);window.removeEventListener('resize',resize);};
  },[]);
  return <aside ref={panel} id="tool-inputs" aria-label="Inputs" className={'resizable-properties '+className} style={{'--properties-width':width+'px'} as CSSProperties} data-resizing={dragging||undefined}>
    <div className="properties-resizer" role="separator" aria-label="Resize Properties panel" aria-orientation="vertical" aria-controls="tool-inputs" aria-valuemin={MIN} aria-valuemax={MAX} aria-valuenow={width} tabIndex={0}
      title="Drag to resize. Left/Right arrows resize; double-click restores the default width."
      onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();start.current={x:event.clientX,width:panel.current?.getBoundingClientRect().width??width};event.currentTarget.setPointerCapture(event.pointerId);setDragging(true);}}
      onPointerMove={event=>{if(start.current)setWidth(clamp(start.current.width+start.current.x-event.clientX));}}
      onPointerUp={event=>{start.current=null;setDragging(false);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
      onLostPointerCapture={()=>{start.current=null;setDragging(false);}}
      onDoubleClick={()=>setWidth(clamp(DEFAULT))}
      onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();setWidth(value=>clamp(event.key==='Home'?MIN:event.key==='End'?maximum():value+(event.key==='ArrowLeft'?16:-16)));}}
    ><span aria-hidden="true"/></div>
    {children}
  </aside>;
}
