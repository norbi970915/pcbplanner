import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { fitGerber, gerberDifference, unionGerberBounds, zoomGerber, type Camera, type GerberLayer } from '../lib/gerber';

export type GerberView = 'layers'|'overlay'|'differences';
export interface GerberCanvasApi { fit:()=>void; zoom:(factor:number)=>void; image:()=>HTMLCanvasElement|null }
interface Props { a:GerberLayer[]; b:GerberLayer[]; dx:number;dy:number;mode:GerberView;fitKey:number;onResolution:(microns:number)=>void;onError:(message:string)=>void }

export const GerberCanvas=forwardRef<GerberCanvasApi,Props>(function GerberCanvas({a,b,dx,dy,mode,fitKey,onResolution,onError},ref){
  const canvas=useRef<HTMLCanvasElement>(null),wrap=useRef<HTMLDivElement>(null);
  const images=useRef(new Map<string,Promise<HTMLImageElement>>());
  const [size,setSize]=useState({w:900,h:560});
  const [camera,setCamera]=useState<Camera>({x:0,y:0,scale:10});
  const pointers=useRef(new Map<number,{x:number;y:number}>());
  const activeA=a.filter(l=>l.visible),activeB=b.filter(l=>l.visible);
  const fit=useCallback(()=>{
    const boxes=[unionGerberBounds(a.filter(l=>l.visible)),unionGerberBounds(b.filter(l=>l.visible),dx,dy)].filter(v=>v!==null);
    if(!boxes.length)return;
    const x=Math.min(...boxes.map(v=>v[0])),y=Math.min(...boxes.map(v=>v[1]));
    const w=Math.max(...boxes.map(v=>v[0]+v[2]))-x,h=Math.max(...boxes.map(v=>v[1]+v[3]))-y;
    setCamera(fitGerber([x,y,w,h],size.w,size.h));
  },[a,b,dx,dy,size]);
  useImperativeHandle(ref,()=>({fit,zoom:factor=>setCamera(c=>zoomGerber(c,factor,size.w/2,size.h/2)),image:()=>canvas.current}),[fit,size]);
  const fitRef=useRef(fit);useEffect(()=>{fitRef.current=fit;},[fit]);
  useEffect(()=>{fitRef.current();},[fitKey,size]);
  useEffect(()=>{
    const el=wrap.current;if(!el)return;
    const observer=new ResizeObserver(entries=>{const w=Math.floor(entries[0].contentRect.width);if(w>0)setSize(old=>old.w===w?old:{w,h:Math.min(640,Math.max(380,Math.round(w*.6)))});});
    observer.observe(el);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    const el=canvas.current;if(!el)return;
    const wheel=(event:WheelEvent)=>{event.preventDefault();const r=el.getBoundingClientRect();setCamera(c=>zoomGerber(c,Math.exp(-event.deltaY*.0015),event.clientX-r.left,event.clientY-r.top));};
    el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);
  },[]);
  useEffect(()=>{
    let cancelled=false;
    const ids=new Set([...a,...b].map(l=>l.id));for(const id of images.current.keys())if(!ids.has(id))images.current.delete(id);
    const image=(layer:GerberLayer)=>{
      let value=images.current.get(layer.id);
      if(!value){value=new Promise<HTMLImageElement>((resolve,reject)=>{const url=URL.createObjectURL(new Blob([layer.svg],{type:'image/svg+xml'}));const img=new Image();img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Could not display '+layer.name));};img.src=url;});images.current.set(layer.id,value);}
      return value;
    };
    const selected=[...a.filter(l=>l.visible),...b.filter(l=>l.visible)];
    void Promise.all(selected.map(image)).then(async()=>{
      if(cancelled)return;
      const el=canvas.current;if(!el)return;
      const ratio=Math.min(window.devicePixelRatio||1,2,Math.sqrt(2000000/(size.w*size.h)));
      const w=Math.round(size.w*ratio),h=Math.round(size.h*ratio);el.width=w;el.height=h;
      const ctx=el.getContext('2d');if(!ctx)return;
      const masks=[document.createElement('canvas'),document.createElement('canvas')];
      for(const [side,layers]of [a.filter(l=>l.visible),b.filter(l=>l.visible)].entries()){
        const mask=masks[side];mask.width=w;mask.height=h;const mc=mask.getContext('2d',{willReadFrequently:true})!;
        mc.setTransform(ratio,0,0,ratio,0,0);
        for(const layer of layers){const img=await image(layer);if(cancelled)return;const [x,y,lw,lh]=layer.bounds;
          const px=(x+(side?dx:0)-camera.x)*camera.scale,py=(y-(side?dy:0)-camera.y)*camera.scale;
          mc.drawImage(img,px,py,lw*camera.scale,lh*camera.scale);
        }
      }
      if(cancelled)return;
      const colors=getComputedStyle(el);ctx.fillStyle=colors.getPropertyValue('--gerber-bg').trim()||'#15191e';ctx.fillRect(0,0,w,h);
      if(mode!=='layers'&&a.some(l=>l.visible)&&b.some(l=>l.visible)){
        const ac=masks[0].getContext('2d')!,bc=masks[1].getContext('2d')!;
        const result=gerberDifference(ac.getImageData(0,0,w,h).data,bc.getImageData(0,0,w,h).data,mode==='overlay');
        ac.clearRect(0,0,w,h);ac.putImageData(new ImageData(result.pixels as Uint8ClampedArray<ArrayBuffer>,w,h),0,0);ctx.drawImage(masks[0],0,0);
      }else{
        for(const [side,layers]of [a.filter(l=>l.visible),b.filter(l=>l.visible)].entries())for(const layer of layers){
          const img=await image(layer);if(cancelled)return;const [x,y,lw,lh]=layer.bounds;
          const temp=masks[side],tc=temp.getContext('2d')!;tc.setTransform(1,0,0,1,0,0);tc.clearRect(0,0,w,h);
          tc.drawImage(img,(x+(side?dx:0)-camera.x)*camera.scale*ratio,(y-(side?dy:0)-camera.y)*camera.scale*ratio,lw*camera.scale*ratio,lh*camera.scale*ratio);
          tc.globalCompositeOperation='source-in';tc.fillStyle=layer.color;tc.fillRect(0,0,w,h);tc.globalCompositeOperation='source-over';ctx.globalAlpha=.85;ctx.drawImage(temp,0,0);ctx.globalAlpha=1;
        }
      }
      if(cancelled)return;onResolution(1000/(camera.scale*ratio));
    }).catch(error=>{if(!cancelled)onError(error instanceof Error?error.message:'Could not render layers.');});
    return()=>{cancelled=true;};
  },[a,b,dx,dy,mode,camera,size,onResolution,onError]);
  const point=(event:React.PointerEvent<HTMLCanvasElement>)=>{const r=event.currentTarget.getBoundingClientRect();return{x:event.clientX-r.left,y:event.clientY-r.top};};
  return <div className="gerber-canvas-wrap" ref={wrap}>
    <canvas ref={canvas} style={{width:'100%',height:size.h}} tabIndex={0} role="img" aria-label="Gerber layer view. Drag to pan; use mouse wheel or plus and minus keys to zoom. Arrow keys pan; F fits the selected layers."
      onKeyDown={event=>{if(['+','=','-','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','f','F'].includes(event.key)){event.preventDefault();if(event.key==='f'||event.key==='F')fit();else if(['+','=','-'].includes(event.key))setCamera(c=>zoomGerber(c,event.key==='-'?.8:1.25,size.w/2,size.h/2));else setCamera(c=>({...c,x:c.x+(event.key==='ArrowRight'?40:event.key==='ArrowLeft'?-40:0)/c.scale,y:c.y+(event.key==='ArrowDown'?40:event.key==='ArrowUp'?-40:0)/c.scale}));}}}
      onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);pointers.current.set(event.pointerId,point(event));}}
      onPointerMove={event=>{const previous=pointers.current.get(event.pointerId);if(!previous)return;const next=point(event);const other=[...pointers.current.entries()].find(([id])=>id!==event.pointerId)?.[1];pointers.current.set(event.pointerId,next);
        if(other){const before=Math.hypot(previous.x-other.x,previous.y-other.y),after=Math.hypot(next.x-other.x,next.y-other.y);if(before>0)setCamera(c=>{const oldCentre={x:(previous.x+other.x)/2,y:(previous.y+other.y)/2},newCentre={x:(next.x+other.x)/2,y:(next.y+other.y)/2};const zoomed=zoomGerber(c,after/before,oldCentre.x,oldCentre.y);return {...zoomed,x:zoomed.x-(newCentre.x-oldCentre.x)/zoomed.scale,y:zoomed.y-(newCentre.y-oldCentre.y)/zoomed.scale};});}
        else setCamera(c=>({...c,x:c.x-(next.x-previous.x)/c.scale,y:c.y-(next.y-previous.y)/c.scale}));}}
      onPointerUp={event=>pointers.current.delete(event.pointerId)} onPointerCancel={event=>pointers.current.delete(event.pointerId)} onLostPointerCapture={event=>pointers.current.delete(event.pointerId)} />
    {!activeA.length&&!activeB.length&&<div className="gerber-canvas-empty"><strong>{a.length||b.length?'Select layers to display':'Your board layers appear here'}</strong><span>{a.length||b.length?'Use the visibility checkboxes in Properties.':'Open one layout to inspect it, or two layouts to compare revisions.'}</span></div>}
  </div>;
});
