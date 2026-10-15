import { buildCopperOutline, copperGrid, measureCopper, type OutlineInput } from './gerberCopper';
import type { Bounds } from './gerber';

let canvas:OffscreenCanvas|undefined,board:Uint8ClampedArray|undefined,bounds:Bounds|undefined;
const scope=globalThis as unknown as {onmessage:((event:MessageEvent)=>void)|null;postMessage:(data:unknown)=>void};
scope.onmessage=event=>{
  const {id,type}=event.data;
  try{
    if(type==='init'){
      const outline=buildCopperOutline(event.data.outline as OutlineInput),grid=copperGrid(outline.bounds,event.data.pixelMm);
      bounds=outline.bounds;canvas=new OffscreenCanvas(grid.width,grid.height);
      const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Area analysis needs a browser with OffscreenCanvas support.');
      const path=new Path2D();
      for(const ring of outline.rings){path.moveTo(ring[0][0],ring[0][1]);for(const point of ring.slice(1))path.lineTo(point[0],point[1]);path.closePath();}
      ctx.setTransform(grid.width/bounds[2],0,0,grid.height/bounds[3],-bounds[0]*grid.width/bounds[2],-bounds[1]*grid.height/bounds[3]);
      ctx.fillStyle='white';ctx.fill(path,'evenodd');ctx.resetTransform();
      board=ctx.getImageData(0,0,grid.width,grid.height).data;
      const pixelArea=bounds[2]*bounds[3]/(grid.width*grid.height),measurement=measureCopper(board,board,pixelArea);
      scope.postMessage({id,value:{...grid,bounds,boardArea:measurement.boardArea,cutouts:outline.cutouts,contours:outline.rings.length}});
    }else if(type==='layer'){
      const image=event.data.image as ImageBitmap;
      if(!canvas||!board||!bounds){image.close();throw new Error('Choose a valid board outline first.');}
      const ctx=canvas.getContext('2d',{willReadFrequently:true})!;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      try{ctx.drawImage(image,0,0,canvas.width,canvas.height);}finally{image.close();}
      const copper=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      scope.postMessage({id,value:measureCopper(board,copper,bounds[2]*bounds[3]/(canvas.width*canvas.height))});
    }else throw new Error('Unknown copper analysis request.');
  }catch(error){scope.postMessage({id,error:error instanceof Error?error.message:'Could not analyse copper.'});}
};