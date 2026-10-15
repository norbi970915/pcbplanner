import gerberBundle from 'gerber-to-svg/dist/gerber-to-svg.min.js?raw';
import type gerberToSvg from 'gerber-to-svg';
import { normaliseGerberCoordinates, type GerberInput } from './gerber';

export interface ParsedGerber { name:string; svg:string; bounds:[number,number,number,number]; warnings:string[] }
export interface GerberWorkerResult { layers:ParsedGerber[]; errors:string[] }

/** This function is serialised with the pinned browser bundle into an isolated, cancellable worker. */
function gerberWorkerMain(normalise:typeof normaliseGerberCoordinates) {
  const scope=globalThis as unknown as { gerberToSvg:typeof gerberToSvg; onmessage:((e:MessageEvent<{inputs:{name:string;data:Uint8Array}[]}>)=>void)|null; postMessage:(data:unknown)=>void };
  scope.onmessage=async(event)=>{
    const layers:ParsedGerber[]=[], errors:string[]=[];let renderedBytes=0;
    for(const [index,file]of event.data.inputs.entries()){
      try{
        const source=new TextDecoder().decode(file.data);const warnings:string[]=[];let fatalWarning='';
        if(!source.trim()||source.includes('\0'))throw new Error('Not a text Gerber/drill file.');
        const drill=/^(?:\s*M48|[\s\S]*?^\s*(?:METRIC|INCH)[,\s])/im.test(source);
        if(!drill&&!/%(?:FS|MO|ADD)/i.test(source))throw new Error('No Extended Gerber header found.');
        if(!drill&&!/%FS[LT]A\d*X\d\dY\d\d\*%/i.test(source))throw new Error('Explicit absolute Gerber coordinate format required (FS).');
        if(!drill&&!/%MO(?:MM|IN)\*%/i.test(source))throw new Error('Explicit Gerber units required (MOMM or MOIN).');
        if(/%(?:AB|LM|LR|LS|IPNEG|IR|OF|MI)/i.test(source))throw new Error('This file uses an unsupported image transform, aperture block or negative image. It was not rendered.');
        if(drill&&!/[XY][+-]?\d*\.\d+/i.test(source)&&!/(?:FILE_FORMAT|FORMAT)\s*[=:]\s*\d[:.]\d/i.test(source))throw new Error('Drill coordinates need decimal points or an explicit FILE_FORMAT; no precision is guessed.');
        if(drill&&!/^(?:METRIC|INCH|M71|M72)(?:,|\s|$)/im.test(source))throw new Error('Explicit drill units required (METRIC or INCH).');
        if(!drill&&!/M0?2\s*\*/i.test(source))throw new Error('The Gerber end marker M02 is missing; export the complete layer.');
        const format=source.match(/(?:FILE_FORMAT|FORMAT)\s*[=:]\s*(\d)[:.](\d)/i);
        await new Promise<void>((resolve,reject)=>{
          const converter=scope.gerberToSvg(source,{filetype:drill?'drill':'gerber',...(drill&&format?{places:[Number(format[1]),Number(format[2])] as [number,number]}:{}),id:'pcbplanner_'+index},(error)=>{
            if(error){reject(error);return;}
            try{
              if(fatalWarning)throw new Error(fatalWarning);
              const {bounds,scale:k}=normalise(converter.viewBox,converter.width,converter.units);
              const svg='<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024" preserveAspectRatio="none" viewBox="'+bounds.join(' ')+'"><defs>'+converter.defs.join('')+'</defs><g fill="white" stroke="white" stroke-width="0" stroke-linecap="round" stroke-linejoin="round" fill-rule="evenodd" transform="scale('+k+','+(-k)+')">'+converter.layer.join('')+'</g></svg>';
              if(svg.length>16*1024*1024)throw new Error('Rendered layer exceeds the 16 MiB display limit.');
              if(renderedBytes+svg.length>64*1024*1024)throw new Error('Rendered layout exceeds the 64 MiB display limit. Select fewer layers.');
              if(/<script|<foreignObject|\bon[a-z]+\s*=|(?:href|src)=["'](?!#)/i.test(svg))throw new Error('Unexpected external or active SVG content.');
              renderedBytes+=svg.length;layers.push({name:file.name,svg,bounds,warnings});resolve();
            }catch(error){reject(error);}
          });
          converter.on('warning',(warning:unknown)=>{const value=warning as {message?:string};const message=value.message??String(warning);if(/^block "%T[FAD][.,*]/i.test(message))return;
            // Ucamco Gerber 2026.05, section 8.1.4: IPPOS is the default image polarity.
            // Allow only this exact legacy declaration; IPNEG and unknown commands remain errors.
            if(message==='block "%IPPOS" was not recognized and was ignored')return;
            if(/not recognized|unrecognized|not supported|unsupported|ignored|ignoring|not defined|cannot change|overwriting|backup units|quadrant mode unspecified/i.test(message))fatalWarning=message;if(warnings.length<12)warnings.push(message);});
        });
      }catch(error){errors.push(file.name+': '+(error instanceof Error?error.message:String(error)));}
      scope.postMessage({progress:index+1,total:event.data.inputs.length});
    }
    scope.postMessage({result:{layers,errors}});
  };
}

export function parseGerberInputs(inputs:GerberInput[],signal:AbortSignal,onProgress:(done:number,total:number)=>void):Promise<GerberWorkerResult> {
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(new Blob([gerberBundle,'\n;(',gerberWorkerMain.toString(),')(',normaliseGerberCoordinates.toString(),');'],{type:'text/javascript'}));
    const worker=new Worker(url);URL.revokeObjectURL(url);
    const clean=()=>{worker.terminate();clearTimeout(timer);signal.removeEventListener('abort',abort);};
    const fail=(message:string)=>{clean();reject(new Error(message));};
    const abort=()=>{clean();reject(new DOMException('Cancelled','AbortError'));};
    const timer=setTimeout(()=>fail('Import exceeded 45 seconds. Try a smaller set of layers.'),45000);
    signal.addEventListener('abort',abort,{once:true});
    worker.onerror=()=>fail('The Gerber reader could not finish. Try fewer files or a different export.');
    worker.onmessage=(event:MessageEvent<{progress?:number;total?:number;result?:GerberWorkerResult}>)=>{
      if(event.data.result){clean();resolve(event.data.result);}else{onProgress(event.data.progress??0,event.data.total??inputs.length);}
    };
    if(signal.aborted){abort();return;}
    worker.postMessage({inputs},inputs.map(file=>file.data.buffer as ArrayBuffer));
  });
}
