import type { Layer, Stackup } from '../lib/stackups';

export const FLEX_SOURCES = [
  {title:'DuPont Pyralux AP: Dk 3.2, Df 0.003 at 10 GHz (AP9121)',url:'https://www.dupont.com/content/dam/dupont/amer/us/en/ei-transformation/public/documents/en/EI-10124-Pyralux-AP-Data-Sheet.pdf'},
  {title:'DuPont Pyralux HP adhesive: Dk 2.8, Df 0.0035 at 10 GHz (HP250000)',url:'https://www.dupont.com/content/dam/electronics/amer/us/en/electronics/public/documents/en/EI-10208-Pyralux-HP-Adhesive-Data-Sheet.pdf'},
  {title:'DuPont Kapton HN film: Dk 3.4, Df 0.0018 at 1 kHz for 25 um film',url:'https://www.dupont.com/content/dam/electronics/amer/us/en/electronics/public/documents/en/EI-10206-Kapton-HN-Data-Sheet.pdf'},
];
export const FLEX_MATERIALS = [
  {id:'pi',name:'Pyralux AP polyimide',er:3.2,df:0.003,fGHz:10},
  {id:'film',name:'Kapton HN coverlay film',er:3.4,df:0.0018,fGHz:0.000001},
  {id:'adh',name:'Pyralux HP adhesive',er:2.8,df:0.0035,fGHz:10},
];
const note = 'Editable design starter, not a fabricator-approved construction. Core/adhesive Dk/Df use 10 GHz datasheet values; coverlay film uses 1 kHz values. Confirm finished thicknesses and Dk/Df at your signal frequency. Copper roles are defaults; planes are assumed solid.';
function starter(id: string, rigidN: number, flexN: number, coreT: number): Stackup {
  const layers: Layer[] = [];
  const rigid: string[] = [], flex: string[] = [];
  const add = (key: string, kind: Layer['kind'], name: string, t: number, regions: string[], er?: number,df?:number,role?:Layer['role'],material?:string,fGHz?:number) => {
    const layer: Layer = {id:id+'-'+key,kind,name,t,er,df,role,material,fGHz};
    layers.push(layer); regions.forEach(r=>(r==='rigid'?rigid:flex).push(layer.id));
  };
  const cover = (side:string, reverse:boolean) => {
    const film = ()=>add(side+'-film','coverlay',side+' coverlay film',0.025,['flex'],3.4,0.0018,undefined,'Kapton HN film (1 kHz)',0.000001);
    const adhesive = ()=>add(side+'-adh','adhesive',side+' coverlay adhesive',0.025,['flex'],2.8,0.0035,undefined,'Pyralux HP adhesive',10);
    if(reverse){adhesive();film();}else{film();adhesive();}
  };
  const extra = (rigidN-flexN)/2;
  if(rigidN) add('mt','mask','Top solder mask',0.0305,['rigid'],3.8,0.027);
  for(let i=0;i<extra;i++) {
    add('outer-top-'+i,'copper','L'+(i+1),0.035,['rigid'],undefined,undefined,extra===1?'plane':i%2===0?'signal':'plane');
    add('fr4-top-'+i,'dielectric',i===extra-1?'Rigid bonding prepreg':'FR-4 core',i===extra-1?0.15:0.2,['rigid'],4.1,0.015,undefined,'FR-4');
  }
  cover('Top',false);
  for(let i=0;i<flexN;i++) {
    const number=extra+i+1;
    const role = i%2===0?'signal':'plane';
    add('shared-cu-'+i,'copper','L'+number+(rigidN?' (shared flex)':''),0.018,rigidN?['rigid','flex']:['flex'],undefined,undefined,role);
    if(i<flexN-1) add('shared-pi-'+i,'dielectric','Polyimide core',coreT,rigidN?['rigid','flex']:['flex'],3.2,0.003,undefined,'Pyralux AP polyimide',10);
  }
  cover('Bottom',true);
  for(let i=0;i<extra;i++) {
    add('fr4-bottom-'+i,'dielectric',i===0?'Rigid bonding prepreg':'FR-4 core',i===0?0.15:0.2,['rigid'],4.1,0.015,undefined,'FR-4');
    add('outer-bottom-'+i,'copper','L'+(extra+flexN+i+1),0.035,['rigid'],undefined,undefined,extra===1?'signal':i%2===0?'plane':'signal');
  }
  if(rigidN) add('mb','mask','Bottom solder mask',0.0305,['rigid'],3.8,0.027);
  const name = rigidN ? rigidN+'L rigid / '+flexN+'L flex - '+(coreT*1000)+' um PI' : flexN+'L flex - '+(coreT*1000)+' um PI';
  return {id,name,label:name,layers,builtin:true,note,construction:rigidN?'rigid-flex':'flex',regions:[
    ...(rigidN?[{id:'rigid',name:'Rigid',kind:'rigid' as const,layerIds:rigid}]:[]),
    {id:'flex',name:'Flex',kind:'flex',layerIds:flex},
  ]};
}
export const FLEX_PRESETS: Stackup[] = [
  starter('flex-2l-50',0,2,0.05),starter('flex-2l-100',0,2,0.1),starter('flex-2l-150',0,2,0.15),
  starter('rf-4l-2f',4,2,0.1),starter('rf-6l-2f',6,2,0.1),starter('rf-8l-4f',8,4,0.05),
];
