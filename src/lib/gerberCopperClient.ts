import { readOutlineSvg, type CopperGrid } from './gerberCopper';
import type { Bounds, GerberLayer } from './gerber';

export interface CopperLayerResult {id:string;name:string;label:string;copperArea:number;percent:number}
export interface CopperResult extends CopperGrid {bounds:Bounds;boardArea:number;cutouts:number;contours:number;outlineName:string;layers:CopperLayerResult[]}

/** Rasterise the original composited SVG at a fixed board-space resolution, without using the viewport preview. */
async function copperBitmap(layer:GerberLayer,grid:CopperGrid,bounds:Bounds,signal:AbortSignal):Promise<ImageBitmap> {
  const svg=layer.svg.replace(/width="1024" height="1024"/,'width="'+grid.width+'" height="'+grid.height+'"').replace(/viewBox="[^"]*"/,'viewBox="'+bounds.join(' ')+'"');
  const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'})),image=new Image();
  try{
    await new Promise<void>((resolve,reject)=>{
      const abort=()=>{clean();image.src='';reject(new DOMException('Cancelled','AbortError'));};
      const clean=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);image.onload=null;image.onerror=null;};
      const timer=setTimeout(()=>{clean();image.src='';reject(new Error('Rasterisation timed out for '+layer.name+'. Try fewer layers.'));},60000);
      image.onload=()=>{clean();resolve();};image.onerror=()=>{clean();reject(new Error('Could not rasterise '+layer.name));};
      signal.addEventListener('abort',abort,{once:true});image.src=url;if(signal.aborted){clean();abort();}
    });
    signal.throwIfAborted();
    const bitmap=await createImageBitmap(image);
    if(signal.aborted){bitmap.close();signal.throwIfAborted();}
    return bitmap;
  }finally{image.onload=null;image.onerror=null;URL.revokeObjectURL(url);}
}

export async function analyseCopper(outline:GerberLayer,layers:GerberLayer[],pixelMm:number,signal:AbortSignal,onProgress:(message:string)=>void):Promise<CopperResult> {
  signal.throwIfAborted();
  if(typeof OffscreenCanvas==='undefined'||typeof createImageBitmap==='undefined')throw new Error('Copper analysis needs a browser with OffscreenCanvas and ImageBitmap support.');
  const input=readOutlineSvg(outline.svg);
  const worker=new Worker(new URL('./gerberCopper.worker.ts',import.meta.url),{type:'module'});
  let workerError:Error|undefined;
  let sequence=0,pending:{id:number;resolve:(value:unknown)=>void;reject:(error:Error)=>void}|undefined;
  const abort=()=>{pending?.reject(new DOMException('Cancelled','AbortError'));worker.terminate();};
  const timer=setTimeout(()=>{workerError=new Error('Copper analysis exceeded two minutes. Try fewer layers or Standard resolution.');pending?.reject(workerError);worker.terminate();},120000);
  signal.addEventListener('abort',abort,{once:true});
  worker.onerror=()=>{workerError=new Error('The area-analysis worker could not finish. Try fewer layers.');pending?.reject(workerError);};
  worker.onmessage=event=>{const current=pending;if(!current||current.id!==event.data.id)return;pending=undefined;if(event.data.error)current.reject(new Error(event.data.error));else current.resolve(event.data.value);};
  const request=<T>(message:Record<string,unknown>,transfer:Transferable[]=[]):Promise<T>=>new Promise((resolve,reject)=>{
    if(signal.aborted){reject(new DOMException('Cancelled','AbortError'));return;}if(workerError){reject(workerError);return;}
    const id=++sequence;pending={id,resolve:value=>resolve(value as T),reject};worker.postMessage({id,...message},transfer);
  });
  try{
    onProgress('Checking board contours...');
    const grid=await request<Omit<CopperResult,'outlineName'|'layers'>>({type:'init',outline:input,pixelMm});
    const results:CopperLayerResult[]=[];
    for(const [index,layer]of layers.entries()){
      signal.throwIfAborted();onProgress('Measuring copper layer '+(index+1)+' of '+layers.length+'...');
      // Yield before each native SVG decode so controls and cancellation remain available between layers.
      await new Promise<void>(resolve=>setTimeout(resolve,0));
      const image=await copperBitmap(layer,grid,grid.bounds,signal);
      if(signal.aborted){image.close();signal.throwIfAborted();}
      try{
        const result=await request<{copperArea:number;percent:number}>({type:'layer',image},[image]);
        results.push({id:layer.id,name:layer.name,label:layer.label,...result});
      }finally{image.close();}
    }
    return {...grid,outlineName:outline.name,layers:results};
  }finally{clearTimeout(timer);signal.removeEventListener('abort',abort);worker.terminate();}
}