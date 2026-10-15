import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { fitGerber, normaliseGerberCoordinates, gerberDifference, gerberLayerLabel, readGerberInputs, unionGerberBounds, zoomGerber, type GerberLayer } from './gerber';
import { GERBER_EXAMPLE_A } from './gerberExample';
import { normaliseGerberHeaders } from './gerberFormat';

const signal=()=>new AbortController().signal;
const layer=(bounds:[number,number,number,number]):GerberLayer=>({id:'a',name:'top.gtl',label:'Top copper',svg:'',bounds,visible:true,color:'#fff',warnings:[]});

describe('Gerber layer identification and local imports',()=>{
  it('prefers X2 layer attributes and preserves inner copper layer identifiers',()=>{
    expect(gerberLayerLabel('ambiguous.gbr','%TF.FileFunction,Copper,L4,Bot*%')).toBe('Copper / L4 / Bot');
    expect(gerberLayerLabel('board-F_Cu.gbr')).toBe('Top copper');
    expect(gerberLayerLabel('inner.g3')).toBe('Copper L3');
    expect(gerberLayerLabel('board.gbo')).toBe('Bottom silkscreen');
  });
  it('reads one file without requiring a whole board archive',async()=>{
    const result=await readGerberInputs([new File([GERBER_EXAMPLE_A[0].text],'top.gtl')],signal());
    expect(result.inputs).toHaveLength(1);expect(new TextDecoder().decode(result.inputs[0].data)).toContain('%MOMM*%');
  });
  it('extracts nested Gerbers and excludes archive metadata, readmes and unrelated files',async()=>{
    const bytes=zipSync({'pcb/top.gtl':strToU8(GERBER_EXAMPLE_A[0].text),'pcb/bottom.gbl':strToU8(GERBER_EXAMPLE_A[0].text),'README.txt':strToU8('Instructions'),'notes.pdf':strToU8('not gerber'),'__MACOSX/._top.gtl':strToU8('metadata')},{level:0});
    const result=await readGerberInputs([new File([bytes as Uint8Array<ArrayBuffer>],'board.zip')],signal());
    expect(result.inputs.map(i=>i.name)).toEqual(['pcb/top.gtl','pcb/bottom.gbl']);
    // Stored ZIP entries may share an archive buffer; worker transfer must not detach another layer.
    expect(result.inputs[0].data.buffer).not.toBe(result.inputs[1].data.buffer);
  });
  it('rejects a compressed layer larger than its expanded-data budget before accepting it',async()=>{
    const bytes=zipSync({'large.gtl':new Uint8Array(8*1024*1024+1)});
    await expect(readGerberInputs([new File([bytes as Uint8Array<ArrayBuffer>],'large.zip')],signal())).rejects.toThrow('limit');
  });
  it('rejects more than 64 entries and empty or malformed archives',async()=>{
    const entries=Object.fromEntries(Array.from({length:65},(_,i)=>['L'+i+'.gbr',strToU8('G04 sample*')]));
    await expect(readGerberInputs([new File([zipSync(entries) as Uint8Array<ArrayBuffer>],'many.zip')],signal())).rejects.toThrow('limit');
    await expect(readGerberInputs([new File([zipSync({}) as Uint8Array<ArrayBuffer>],'empty.zip')],signal())).rejects.toThrow('No Gerber');
    await expect(readGerberInputs([new File(['invalid'],'bad.zip')],signal())).rejects.toThrow('ZIP');
  });
  it('honours cancellation without leaving a partial imported layout',async()=>{
    const controller=new AbortController();controller.abort();
    await expect(readGerberInputs([new File(['content'],'top.gtl')],controller.signal)).rejects.toThrow();
  });
});

describe('physical-coordinate camera and difference classification',()=>{
  it('normalises the renderers internal grid, including negative coordinates and inches',()=>{
    expect(normaliseGerberCoordinates([2600,2600,18800,4800],18.8,'mm').bounds).toEqual([2.6,-7.4,18.8,4.8]);
    const inches=normaliseGerberCoordinates([1000,2000,1000,500],1,'in');
    expect(inches.bounds[0]).toBeCloseTo(25.4);expect(inches.bounds[1]).toBeCloseTo(-63.5);expect(inches.bounds[2]).toBeCloseTo(25.4);
    expect(()=>normaliseGerberCoordinates([0,0,0,1],0,'mm')).toThrow('geometry');
    expect(()=>normaliseGerberCoordinates([0,0,1,1],1,'unknown')).toThrow('declare');
  });
  it('fits the joint bounds without independently shifting different layers',()=>{
    const a=layer([10,-30,20,10]),b=layer([40,-5,10,5]);
    expect(unionGerberBounds([a,b])).toEqual([10,-30,40,30]);
    expect(unionGerberBounds([a],2,3)).toEqual([12,-33,20,10]);
    const camera=fitGerber([10,-30,40,30],800,600);
    expect((30-camera.x)*camera.scale).toBeCloseTo(400);
    expect((-15-camera.y)*camera.scale).toBeCloseTo(300);
  });
  it('keeps the world point beneath the zoom anchor fixed',()=>{
    const camera={x:10,y:-30,scale:12};const zoomed=zoomGerber(camera,2,150,180);
    expect(camera.x+150/camera.scale).toBeCloseTo(zoomed.x+150/zoomed.scale);
    expect(camera.y+180/camera.scale).toBeCloseTo(zoomed.y+180/zoomed.scale);
  });
  it('separates A-only, B-only and common coverage independently of RGB colour',()=>{
    const a=new Uint8ClampedArray([255,0,0,255,0,0,0,0,30,20,10,255,0,0,0,0]);
    const b=new Uint8ClampedArray([0,0,0,0,0,255,0,255,1,2,3,255,0,0,0,0]);
    const overlay=gerberDifference(a,b,true);expect(overlay.added).toBe(1);expect(overlay.removed).toBe(1);
    expect([...overlay.pixels.slice(0,12)]).toEqual([208,138,60,255,61,143,224,255,125,135,145,255]);
    expect(gerberDifference(a,b,false).pixels[11]).toBe(0);
  });
  it('hides identical geometry and checks coverage threshold and dimensions',()=>{
    const mask=new Uint8ClampedArray([255,255,255,255,0,0,0,127]);
    expect([...gerberDifference(mask,mask,false).pixels]).toEqual([0,0,0,0,0,0,0,0]);
    expect(()=>gerberDifference(mask,new Uint8ClampedArray(4),true)).toThrow('dimensions');
  });
});


describe('exporter header compatibility',()=>{
  const base=GERBER_EXAMPLE_A[0].text;
  it('accepts legacy names, including an empty image name, without changing geometry',()=>{
    for(const command of ['INTop Copper','IN','LNSilkscreen Bottom','IPPOS','ASAXBY','MIA0B0','OFA0.000B-0.00','SFA1.000B1.0','IR0','LMN','LR0.0','LS1.0']){
      expect(normaliseGerberHeaders(base.replace('%MOMM*%','%MOMM*%\n%'+command+'*%')).replace(/\s/g,'')).toBe(normaliseGerberHeaders(base).replace(/\s/g,''));
    }
    expect(gerberLayerLabel('copper_l1.gbr','%INTop Copper*%')).toBe('Top Copper');
    expect(gerberLayerLabel('Profile_NP.gbr','%IN*%')).toBe('Board outline');
    expect(gerberLayerLabel('ambiguous.gbr','%INOlder name*%\n%TF.FileFunction,Copper,L2,Inr*%')).toBe('Copper / L2 / Inr');
  });
  it('does not erase non-default transformations or unknown commands',()=>{
    for(const command of ['IPNEG','MIA1B0','OFA1B0','SFA2B1','IR90','LMX','LR30','LS2','XYUNKNOWN','ABD12']){
      expect(normaliseGerberHeaders(base+'\n%'+command+'*%')).toContain('%'+command+'*%');
    }
  });
  it('splits combined format/unit headers and accepts explicit G70/G71 units',()=>{
    expect(normaliseGerberHeaders('%FSLAX25Y25*MOMM*%')).toBe('%FSLAX25Y25*%\n%MOMM*%');
    expect(normaliseGerberHeaders(base.replace('%MOMM*%','G71*')).replace(/\s/g,'')).toBe(normaliseGerberHeaders(base).replace(/\s/g,''));
    expect(normaliseGerberHeaders(base.replace('%MOMM*%','G70*'))).toContain('%MOIN*%');
  });
  it('preserves complete aperture macros and leaves Excellon headers alone',()=>{
    const macro='%AMNAME*0 IN and IPPOS are just macro comments here*1,1,1,0,0*%';
    expect(normaliseGerberHeaders(base+macro)).toContain(macro);
    expect(normaliseGerberHeaders(base+'%AMXNAME*0 X comment*$1=3X2X0.5*1,1,$1,0,0*%')).toContain('%AMXNAME*0 X comment*$1=3x2x0.5*1,1,$1,0,0*%');
    const drill='M48\nMETRIC,TZ,000.000\nT01C1.0\n%\nX010000Y010000\nM30';
    expect(normaliseGerberHeaders(drill)).toBe(drill);
  });
  it('finds artwork in ZIPs with exporter-specific or missing extensions and skips manifests',async()=>{
    const entries={'board/CU_L1.copper':strToU8(base),'board/soldermask':strToU8(base),'board/job.gbrjob':strToU8('{}'),'notes.txt':strToU8('Manufacturing instructions')};
    const result=await readGerberInputs([new File([zipSync(entries) as Uint8Array<ArrayBuffer>],'board.zip')],signal());
    expect(result.inputs.map(file=>file.name)).toEqual(['board/CU_L1.copper','board/soldermask']);
    const individual=await readGerberInputs([new File([base],'top.gbr'),new File(['{}'],'gerber_job.gbrjob')],signal());
    expect(individual.inputs).toHaveLength(1);
  });
});
