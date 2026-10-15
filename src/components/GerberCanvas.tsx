import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { fitGerber, gerberDifference, unionGerberBounds, zoomGerber, type Camera, type GerberLayer } from '../lib/gerber';

export type GerberView = 'layers'|'overlay'|'differences';
interface DecodedLayer { image:HTMLImageElement; preview:HTMLCanvasElement }
export interface GerberCanvasApi { fit:()=>void; zoom:(factor:number)=>void; image:()=>HTMLCanvasElement|null }
interface Props { a:GerberLayer[]; b:GerberLayer[]; dx:number;dy:number;mode:GerberView;fitKey:number;fill?:boolean;onResolution:(microns:number)=>void;onError:(message:string)=>void;onBusy?:(busy:boolean)=>void }

export const GerberCanvas=forwardRef<GerberCanvasApi,Props>(function GerberCanvas({a,b,dx,dy,mode,fitKey,fill=false,onResolution,onError,onBusy},ref){
  const canvas=useRef<HTMLCanvasElement>(null),wrap=useRef<HTMLDivElement>(null);
  const images=useRef(new Map<string,Promise<DecodedLayer>>());
  const scratch=useRef<HTMLCanvasElement[]>([]);
  const [size,setSize]=useState({w:900,h:560});
  const [camera,setCamera]=useState<Camera>({x:0,y:0,scale:10});
  const [moving,setMoving]=useState(false);
  const view=useRef<Camera>({x:0,y:0,scale:10}),painted=useRef<Camera>({x:0,y:0,scale:10});
  const motion=useRef(false),busy=useRef(false),raf=useRef(0),idle=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),lastCommit=useRef(0);
  const pointers=useRef(new Map<number,{x:number;y:number}>());
  const activeA=a.filter(l=>l.visible),activeB=b.filter(l=>l.visible);
  const preview=useCallback(()=>{
    const el=canvas.current;if(!el)return;
    const current=view.current,base=painted.current,scale=current.scale/base.scale;
    el.style.transform='matrix('+scale+',0,0,'+scale+','+((base.x-current.x)*current.scale)+','+((base.y-current.y)*current.scale)+')';
  },[]);
  const finishMotion=useCallback(()=>{
    clearTimeout(idle.current);if(!motion.current)return;
    motion.current=false;setMoving(false);setCamera({...view.current});
  },[]);
  const changeCamera=useCallback((update:(current:Camera)=>Camera,gesture=false)=>{
    view.current=update(view.current);busy.current=true;onBusy?.(true);
    if(!raf.current)raf.current=requestAnimationFrame(()=>{raf.current=0;preview();});
    clearTimeout(idle.current);
    if(gesture){
      if(!motion.current){motion.current=true;setMoving(true);}
      const now=performance.now();
      // Compositor previews follow every frame. Refill the viewport at a bounded rate.
      if(now-lastCommit.current>90){lastCommit.current=now;setCamera({...view.current});}
      idle.current=setTimeout(finishMotion,140);
    }else{motion.current=false;setMoving(false);setCamera({...view.current});}
  },[finishMotion,onBusy,preview]);
  const fit=useCallback(()=>{
    const boxes=[unionGerberBounds(a.filter(l=>l.visible)),unionGerberBounds(b.filter(l=>l.visible),dx,dy)].filter(v=>v!==null);
    if(!boxes.length)return;
    const x=Math.min(...boxes.map(v=>v[0])),y=Math.min(...boxes.map(v=>v[1]));
    const w=Math.max(...boxes.map(v=>v[0]+v[2]))-x,h=Math.max(...boxes.map(v=>v[1]+v[3]))-y;
    changeCamera(()=>fitGerber([x,y,w,h],size.w,size.h));
  },[a,b,dx,dy,size,changeCamera]);
  useImperativeHandle(ref,()=>({fit,zoom:factor=>changeCamera(c=>zoomGerber(c,factor,size.w/2,size.h/2)),image:()=>busy.current?null:canvas.current}),[fit,size,changeCamera]);
  const fitRef=useRef(fit);useEffect(()=>{fitRef.current=fit;},[fit]);
  useEffect(()=>{fitRef.current();},[fitKey,size]);
  useEffect(()=>{
    const el=wrap.current;if(!el)return;
    const observer=new ResizeObserver(entries=>{
      const w=Math.floor(entries[0].contentRect.width),h=fill?Math.floor(entries[0].contentRect.height):Math.min(640,Math.max(380,Math.round(w*.6)));
      if(w>0&&h>0)setSize(old=>old.w===w&&old.h===h?old:{w,h});
    });
    observer.observe(el);return()=>observer.disconnect();
  },[fill]);
  useEffect(()=>{
    const el=canvas.current;if(!el)return;
    const wheel=(event:WheelEvent)=>{event.preventDefault();const r=wrap.current!.getBoundingClientRect();changeCamera(c=>zoomGerber(c,Math.exp(-event.deltaY*.0015),event.clientX-r.left,event.clientY-r.top),true);};
    el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);
  },[changeCamera]);
  useEffect(()=>()=>{cancelAnimationFrame(raf.current);clearTimeout(idle.current);},[]);
  useEffect(()=>{
    let cancelled=false;busy.current=true;onBusy?.(true);
    const ids=new Set([...a,...b].map(l=>l.id));for(const id of images.current.keys())if(!ids.has(id))images.current.delete(id);
    const image=(layer:GerberLayer)=>{
      let value=images.current.get(layer.id);
      if(!value){value=new Promise<DecodedLayer>((resolve,reject)=>{const url=URL.createObjectURL(new Blob([layer.svg],{type:'image/svg+xml'}));const img=new Image();img.onload=()=>{URL.revokeObjectURL(url);try{const preview=document.createElement('canvas');preview.width=512;preview.height=512;preview.getContext('2d')!.drawImage(img,0,0,512,512);resolve({image:img,preview});}catch(error){reject(error);}};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Could not display '+layer.name));};img.src=url;});images.current.set(layer.id,value);}
      return value;
    };
    const sides=[a.filter(l=>l.visible),b.filter(l=>l.visible)],selected=sides.flat();
    void Promise.all(selected.map(image)).then(async decoded=>{
      if(cancelled)return;
      const el=canvas.current;if(!el)return;
      const decodedById=new Map(selected.map((layer,index)=>[layer.id,decoded[index]]));
      const budget=moving?350000:2000000;
      const ratio=Math.min(window.devicePixelRatio||1,moving?1:2,Math.sqrt(budget/(size.w*size.h)));
      const w=Math.max(1,Math.round(size.w*ratio)),h=Math.max(1,Math.round(size.h*ratio));
      if(!scratch.current.length)scratch.current=Array.from({length:3},()=>document.createElement('canvas'));
      const [frame,...masks]=scratch.current;
      for(const surface of scratch.current){if(surface.width!==w)surface.width=w;if(surface.height!==h)surface.height=h;const context=surface.getContext('2d',{willReadFrequently:surface!==frame})!;context.setTransform(1,0,0,1,0,0);context.globalCompositeOperation='source-over';context.globalAlpha=1;context.clearRect(0,0,w,h);}
      const ctx=frame.getContext('2d')!;ctx.fillStyle='#15191e';ctx.fillRect(0,0,w,h);
      const draw=(context:CanvasRenderingContext2D,layer:GerberLayer,side:number)=>{
        const [x,y,lw,lh]=layer.bounds;
        const decoded=decodedById.get(layer.id)!;
        context.drawImage(moving?decoded.preview:decoded.image,(x+(side?dx:0)-camera.x)*camera.scale*ratio,(y-(side?dy:0)-camera.y)*camera.scale*ratio,lw*camera.scale*ratio,lh*camera.scale*ratio);
      };
      let batchStarted=performance.now();
      const yieldFrame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      if(mode!=='layers'&&sides[0].length&&sides[1].length){
        const contexts=masks.map(mask=>mask.getContext('2d')!);
        for(const [side,layers]of sides.entries())for(const layer of layers){
          draw(contexts[side],layer,side);
          if(!moving&&performance.now()-batchStarted>12){await yieldFrame();if(cancelled)return;batchStarted=performance.now();}
        }
        const result=gerberDifference(contexts[0].getImageData(0,0,w,h).data,contexts[1].getImageData(0,0,w,h).data,mode==='overlay');
        contexts[0].putImageData(new ImageData(result.pixels as Uint8ClampedArray<ArrayBuffer>,w,h),0,0);ctx.drawImage(masks[0],0,0);
      }else{
        // Inspection needs one raster pass per layer, without building unused comparison masks.
        const temp=masks[0],tc=temp.getContext('2d')!;
        for(const [side,layers]of sides.entries())for(const layer of layers){
          tc.clearRect(0,0,w,h);draw(tc,layer,side);
          tc.globalCompositeOperation='source-in';tc.fillStyle=layer.color;tc.fillRect(0,0,w,h);tc.globalCompositeOperation='source-over';ctx.globalAlpha=.85;ctx.drawImage(temp,0,0);ctx.globalAlpha=1;
          if(!moving&&performance.now()-batchStarted>12){await yieldFrame();if(cancelled)return;batchStarted=performance.now();}
        }
      }
      if(cancelled)return;
      // Publish a complete frame atomically, then preserve any newer drag/zoom preview.
      if(el.width!==w)el.width=w;if(el.height!==h)el.height=h;
      const output=el.getContext('2d')!;output.clearRect(0,0,w,h);output.drawImage(frame,0,0);
      painted.current=camera;preview();
      if(!moving&&!motion.current&&view.current.x===camera.x&&view.current.y===camera.y&&view.current.scale===camera.scale){
        busy.current=false;onBusy?.(false);onResolution(1000/(camera.scale*ratio));
      }
    }).catch(error=>{if(!cancelled){busy.current=false;onBusy?.(false);onError(error instanceof Error?error.message:'Could not render layers.');}});
    return()=>{cancelled=true;};
  },[a,b,dx,dy,mode,camera,size,moving,onResolution,onError,onBusy,preview]);
  const point=(event:React.PointerEvent<HTMLCanvasElement>)=>{const r=wrap.current!.getBoundingClientRect();return{x:event.clientX-r.left,y:event.clientY-r.top};};
  const release=(event:React.PointerEvent<HTMLCanvasElement>)=>{pointers.current.delete(event.pointerId);if(!pointers.current.size)finishMotion();};
  return <div className={'gerber-canvas-wrap'+(fill?' gerber-canvas-fill':'')} ref={wrap}>
    <canvas ref={canvas} style={{width:'100%',height:fill?'100%':size.h,transformOrigin:'0 0'}} tabIndex={0} role="img" aria-label="Gerber layer view. Drag to pan; use mouse wheel or plus and minus keys to zoom. Arrow keys pan; F fits the selected layers."
      onKeyDown={event=>{if(['+','=','-','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','f','F'].includes(event.key)){event.preventDefault();if(event.key==='f'||event.key==='F')fit();else if(['+','=','-'].includes(event.key))changeCamera(c=>zoomGerber(c,event.key==='-'?.8:1.25,size.w/2,size.h/2));else changeCamera(c=>({...c,x:c.x+(event.key==='ArrowRight'?40:event.key==='ArrowLeft'?-40:0)/c.scale,y:c.y+(event.key==='ArrowDown'?40:event.key==='ArrowUp'?-40:0)/c.scale}));}}}
      onPointerDown={event=>{if(event.pointerType==='mouse'&&event.button!==0)return;event.currentTarget.setPointerCapture(event.pointerId);pointers.current.set(event.pointerId,point(event));}}
      onPointerMove={event=>{const previous=pointers.current.get(event.pointerId);if(!previous)return;const next=point(event);const other=[...pointers.current.entries()].find(([id])=>id!==event.pointerId)?.[1];pointers.current.set(event.pointerId,next);
        if(other){const before=Math.hypot(previous.x-other.x,previous.y-other.y),after=Math.hypot(next.x-other.x,next.y-other.y);if(before>0)changeCamera(c=>{const oldCentre={x:(previous.x+other.x)/2,y:(previous.y+other.y)/2},newCentre={x:(next.x+other.x)/2,y:(next.y+other.y)/2};const zoomed=zoomGerber(c,after/before,oldCentre.x,oldCentre.y);return {...zoomed,x:zoomed.x-(newCentre.x-oldCentre.x)/zoomed.scale,y:zoomed.y-(newCentre.y-oldCentre.y)/zoomed.scale};},true);}
        else changeCamera(c=>({...c,x:c.x-(next.x-previous.x)/c.scale,y:c.y-(next.y-previous.y)/c.scale}),true);}}
      onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} />
    {!activeA.length&&!activeB.length&&<div className="gerber-canvas-empty"><strong>{a.length||b.length?'Select layers to display':'Your board layers appear here'}</strong><span>{a.length||b.length?'Use the visibility checkboxes in Properties.':'Open one layout to inspect it, or two layouts to compare revisions.'}</span></div>}
  </div>;
});
