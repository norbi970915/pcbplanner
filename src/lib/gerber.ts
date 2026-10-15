import { unzip } from 'fflate';

export interface GerberLayer {
  id: string; name: string; label: string; svg: string;
  bounds: [number, number, number, number]; // SVG/world mm: x min, -y max, width, height
  warnings: string[]; visible: boolean; color: string;
}
export interface GerberInput { name: string; data: Uint8Array }
export const GERBER_LIMITS = { fileBytes: 8 * 1024 * 1024, totalBytes: 40 * 1024 * 1024, files: 64, archiveBytes: 25 * 1024 * 1024 };
const candidate = (name: string) => !name.endsWith('/') && !name.split('/').some(part=>part.startsWith('.')||part==='__MACOSX') && !/\.(?:gbrjob|json|pdf|png|jpe?g|gif|webp|svg|zip|exe|dll|sch|brd|kicad_pcb|kicad_sch)$/i.test(name) && !/(?:readme|license|licence)\./i.test(name);
// Exporters use many layer suffixes. The artwork header, rather than its extension, identifies a ZIP entry.
const artwork = (data:Uint8Array) => /%(?:FS|MO|AD|AM)|(?:^|[\r\n])\s*(?:M48|METRIC|INCH|M71|M72)(?:[,\s]|$)/i.test(new TextDecoder().decode(data.subarray(0,65536)));

/** Recognise X2 FileFunction first, then conventional filenames; labels are identification hints, not enforced layer pairing. */
export function gerberLayerLabel(name: string, text = ''): string {
  const x2 = text.match(/%TF\.FileFunction,([^*]+)\*%/i)?.[1];
  if (x2) return x2.split(',').join(' / ');
  const legacy=text.match(/%IN([^*%]*)\*%/)?.[1]?.trim();
  if(legacy)return legacy;
  const file=name.split(/[\\/]/).at(-1) ?? name;
  const rules: [RegExp,string][] = [[/\.(gtl|cmp)$/i,'Top copper'],[/\.(gbl|sol)$/i,'Bottom copper'],[/\.(gts|stc)$/i,'Top solder mask'],[/\.(gbs|sts)$/i,'Bottom solder mask'],[/\.(gto|plc)$/i,'Top silkscreen'],[/\.(gbo|pls)$/i,'Bottom silkscreen'],[/\.gtp$/i,'Top paste'],[/\.gbp$/i,'Bottom paste'],[/\.(gko|gml|gm1)$/i,'Board outline'],[/(?:profile|edge[._-]cuts|outline)/i,'Board outline'],[/\.(drl|xln|ncd)$/i,'Drill'],[/(?:F[._-]Cu|top[._-]copper)/i,'Top copper'],[/(?:B[._-]Cu|bottom[._-]copper)/i,'Bottom copper']];
  return rules.find(([re])=>re.test(file))?.[1] ?? (/\.g(\d+)$/i.test(file) ? 'Copper L'+file.match(/\.g(\d+)$/i)![1] : 'Layer');
}

/** Read files locally. ZIP filtering bounds declared output before asynchronous decompression starts. */
export async function readGerberInputs(files: File[], signal: AbortSignal): Promise<{inputs:GerberInput[]; warnings:string[]}> {
  const inputs:GerberInput[]=[];const warnings:string[]=[];let total=0;
  const add=(name:string,data:Uint8Array)=>{
    if(data.byteLength>GERBER_LIMITS.fileBytes) throw new Error(name+': exceeds the 8 MiB layer limit.');
    total+=data.byteLength;if(total>GERBER_LIMITS.totalBytes||inputs.length>=GERBER_LIMITS.files) throw new Error('A layout is limited to 64 layers and 40 MiB of expanded data.');
    inputs.push({name,data:data.slice()});
  };
  for(const file of files){
    signal.throwIfAborted();
    if(/\.gbrjob$/i.test(file.name))continue; // A job manifest is metadata, not artwork.
    if(/\.zip$/i.test(file.name)){
      if(file.size>GERBER_LIMITS.archiveBytes) throw new Error('ZIP archives must be smaller than 25 MiB.');
      const bytes=new Uint8Array(await file.arrayBuffer());
      const extracted=await new Promise<Record<string,Uint8Array>>((resolve,reject)=>{
        let declared=total,count=inputs.length,rejected='';
        let stop=()=>{};
        const abort=()=>{stop();reject(new DOMException('Cancelled','AbortError'));};
        signal.addEventListener('abort',abort,{once:true});
        stop=unzip(bytes,{filter:entry=>{
          if(!candidate(entry.name)){return false;}
          declared+=entry.originalSize;count++;
          if(entry.originalSize>GERBER_LIMITS.fileBytes||declared>GERBER_LIMITS.totalBytes||count>GERBER_LIMITS.files){rejected='The ZIP exceeds the 8 MiB per-layer, 64-layer or 40 MiB expanded-data limit.';return false;}
          return true;
        }},(error,result)=>{signal.removeEventListener('abort',abort);if(error)reject(new Error('Could not open ZIP: '+error.message));else if(rejected)reject(new Error(rejected));else resolve(result);});
        if(signal.aborted)abort();
      });
      for(const [name,data]of Object.entries(extracted))if(artwork(data))add(name,data);
    }else{
      if(file.size>GERBER_LIMITS.fileBytes) throw new Error(file.name+': exceeds the 8 MiB layer limit.');
      add(file.name,new Uint8Array(await file.arrayBuffer()));
    }
  }
  signal.throwIfAborted();
  if(!inputs.length)throw new Error('No Gerber or drill layers found. Choose layer files or a ZIP containing them.');
  if(inputs.length>20)warnings.push('Large layer sets may take longer to render. Select only the layers you need.');
  return {inputs,warnings};
}

export type Bounds = [number,number,number,number];
/** The renderer uses a quantised internal drawing grid; its SVG viewBox is NOT in file units. */
export function normaliseGerberCoordinates(viewBox:number[],width:number,units:string):{bounds:Bounds;scale:number} {
  const [x,y,w,h]=viewBox;
  if(![x,y,w,h,width].every(Number.isFinite)||w<=0||h<=0||width<=0)throw new Error('No drawable geometry or invalid bounds.');
  if(units!=='mm'&&units!=='in')throw new Error('The layer must declare millimetres or inches.');
  const scale=(units==='in'?25.4:1)*width/w;
  const bounds:Bounds=[x*scale,-(y+h)*scale,w*scale,h*scale];
  if(!bounds.every(Number.isFinite)||Math.max(...bounds.map(Math.abs))>100000)throw new Error('Coordinates exceed the supported 100 m extent.');
  return {bounds,scale};
}
export function unionGerberBounds(layers:GerberLayer[], offsetX=0, offsetY=0):Bounds|null {
  if(!layers.length)return null;
  const x=Math.min(...layers.map(l=>l.bounds[0]+offsetX)), y=Math.min(...layers.map(l=>l.bounds[1]-offsetY));
  return [x,y,Math.max(...layers.map(l=>l.bounds[0]+l.bounds[2]+offsetX))-x,Math.max(...layers.map(l=>l.bounds[1]+l.bounds[3]-offsetY))-y];
}
export interface Camera {x:number;y:number;scale:number}
export function fitGerber(bounds:Bounds,width:number,height:number):Camera {
  const scale=Math.min((width-48)/Math.max(bounds[2],0.01),(height-48)/Math.max(bounds[3],0.01));
  return {x:bounds[0]+bounds[2]/2-width/(2*scale),y:bounds[1]+bounds[3]/2-height/(2*scale),scale};
}
export function zoomGerber(camera:Camera,factor:number,x:number,y:number):Camera {
  const scale=Math.min(100000,Math.max(0.001,camera.scale*factor));
  return {scale,x:camera.x+x/camera.scale-x/scale,y:camera.y+y/camera.scale-y/scale};
}
/** Compare the UNION of selected layer images at the same physical pixel grid. No file-text diff. */
export function gerberDifference(a:Uint8ClampedArray,b:Uint8ClampedArray,showCommon:boolean):{pixels:Uint8ClampedArray;added:number;removed:number} {
  if(a.length!==b.length||a.length%4)throw new Error('Comparison images must have matching dimensions.');
  const pixels=new Uint8ClampedArray(a.length);let added=0,removed=0;
  for(let i=0;i<a.length;i+=4){const aa=a[i+3]>=128,bb=b[i+3]>=128;
    if(!aa&&!bb)continue;if(aa&&bb&&!showCommon)continue;
    const color=aa&&bb?[125,135,145]:aa?[208,138,60]:[61,143,224];
    if(aa&&!bb)removed++;if(bb&&!aa)added++;
    pixels[i]=color[0];pixels[i+1]=color[1];pixels[i+2]=color[2];pixels[i+3]=255;
  }
  return {pixels,added,removed};
}
