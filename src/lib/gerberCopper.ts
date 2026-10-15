import type { Bounds, GerberLayer } from './gerber';

export type Point = [number, number];
export interface OutlinePath { d:string; filled:boolean }
export interface OutlineInput { paths:OutlinePath[]; scale:number }
export interface CopperOutline { rings:Point[][]; bounds:Bounds; area:number; cutouts:number }
export interface CopperGrid { width:number; height:number; pixelMm:number; limited:boolean }
const EPS=0.000001;

export function isCopperLayer(layer:Pick<GerberLayer,'name'|'label'>):boolean {
  return /copper/i.test(layer.label+' '+layer.name)||/\.(?:gtl|gbl|cmp|sol|g\d+)$/i.test(layer.name)||/(?:^|[_.-])(?:[FB][_.-]Cu|In\d+[_.-]Cu)(?:[_.-]|$)/i.test(layer.name);
}
export function isProfileLayer(layer:Pick<GerberLayer,'name'|'label'>):boolean {
  return /outline|profile|edge[._ -]?cuts/i.test(layer.label+' '+layer.name)||/\.(?:gko|gml|gm1)$/i.test(layer.name);
}
/** Read only our renderer's untransformed contour paths. A stroked outline is measured on its centre line. */
export function readOutlineSvg(svg:string):OutlineInput {
  const doc=new DOMParser().parseFromString(svg,'image/svg+xml');
  if(doc.querySelector('parsererror'))throw new Error('The profile SVG could not be read.');
  const root=Array.from(doc.documentElement.children).filter(el=>el.localName!=='defs');
  if(root.length!==1||root[0].localName!=='g')throw new Error('Choose a dedicated board-profile layer.');
  const group=root[0], scale=group.getAttribute('transform')?.match(/^scale\(([\d.e+-]+),([\d.e+-]+)\)$/);
  const k=Number(scale?.[1]);
  if(!Number.isFinite(k)||k<=0||Number(scale?.[2])!==-k)throw new Error('The profile coordinate transform is unsupported.');
  const paths:OutlinePath[]=[];
  for(const element of Array.from(group.children)){
    if(element.localName!=='path'||['transform','mask','clip-path','filter'].some(attr=>element.hasAttribute(attr)))throw new Error('Choose a profile made of closed contour lines or regions, without flashes, repeats or polarity masks.');
    paths.push({d:element.getAttribute('d')??'',filled:element.getAttribute('fill')!=='none'});
  }
  if(!paths.length)throw new Error('No board contours found in this layer.');
  return {paths,scale:k};
}

/** Decode the absolute M/L/A paths produced by the pinned Gerber renderer. Circular arcs have at most 2 um chord error. */
export function decodeOutlinePaths(input:OutlineInput):Point[][] {
  if(!Number.isFinite(input.scale)||input.scale<=0)throw new Error('Invalid outline scale.');
  const edges:Point[][]=[];let pointCount=0;
  const convert=(p:Point):Point=>[p[0]*input.scale,-p[1]*input.scale];
  const add=(points:Point[])=>{
    if(points.length<2)return;
    if(points.some(p=>!p.every(Number.isFinite)||Math.max(...p.map(Math.abs))>100000))throw new Error('Invalid profile coordinates.');
    if(Math.hypot(points[0][0]-points.at(-1)![0],points[0][1]-points.at(-1)![1])<EPS&&points.length===2)return;
    pointCount+=points.length;if(pointCount>150000)throw new Error('Profile is too complex for area analysis. Export a simpler dedicated outline.');
    edges.push(points);
  };
  for(const path of input.paths){
    const tokens=path.d.match(/[MLAZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi)??[];
    if(path.d.replace(/[MLAZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi,'').replace(/[\s,]/g,''))throw new Error('Unsupported profile path command.');
    let i=0,cmd='',current:Point|undefined,start:Point|undefined;
    const number=()=>{const value=Number(tokens[i++]);if(!Number.isFinite(value))throw new Error('Incomplete profile path.');return value;};
    const close=(required:boolean)=>{if(current&&start&&Math.hypot(current[0]-start[0],current[1]-start[1])*input.scale>EPS&&required)add([convert(current),convert(start)]);};
    while(i<tokens.length){
      if(/^[MLAZ]$/.test(tokens[i]))cmd=tokens[i++];
      if(cmd==='Z'){close(true);current=start;cmd='';continue;}
      if(cmd==='M'){close(path.filled);current=[number(),number()];start=current;cmd='L';continue;}
      if(!current)throw new Error('Profile path has no start point.');
      if(cmd==='L'){
        const next:Point=[number(),number()];add([convert(current),convert(next)]);current=next;
      }else if(cmd==='A'){
        const rx=number(),ry=number(),rotation=number(),large=number(),sweep=number(),next:Point=[number(),number()];
        if(rx<=0||Math.abs(rx-ry)*input.scale>EPS||rotation!==0||![0,1].includes(large)||![0,1].includes(sweep))throw new Error('Unsupported or invalid profile arc.');
        const ux=(current[0]-next[0])/2,uy=(current[1]-next[1])/2,h2=ux*ux+uy*uy;
        if(!h2)throw new Error('Ambiguous full-circle profile arc.');
        const r=Math.max(rx,Math.sqrt(h2)),factor=(large===sweep?-1:1)*Math.sqrt(Math.max(0,(r*r-h2)/h2));
        const centre:Point=[(current[0]+next[0])/2+factor*uy,(current[1]+next[1])/2-factor*ux];
        const angle=Math.atan2(current[1]-centre[1],current[0]-centre[0]);
        let delta=Math.atan2(next[1]-centre[1],next[0]-centre[0])-angle;
        if(sweep&&delta<0)delta+=2*Math.PI;if(!sweep&&delta>0)delta-=2*Math.PI;
        const step=2*Math.acos(Math.max(-1,Math.min(1,1-0.002/(r*input.scale))));
        const count=Math.max(2,Math.ceil(Math.abs(delta)/Math.max(step,0.000001)));
        if(count>15000)throw new Error('Profile arc is too large for area analysis.');
        const points:Point[]=[convert(current)];
        for(let j=1;j<count;j++)points.push(convert([centre[0]+r*Math.cos(angle+delta*j/count),centre[1]+r*Math.sin(angle+delta*j/count)]));
        points.push(convert(next));add(points);current=next;
      }else throw new Error('Unsupported profile path command.');
    }
    close(path.filled);
  }
  if(!edges.length)throw new Error('No measurable profile contours found.');
  return edges;
}

export function pointInRing(point:Point,ring:Point[]):boolean {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
/** Join all endpoints, reject open/branching/intersecting contours, and apply even-odd nesting for cutouts. Runs in the analysis worker. */
export function buildCopperOutline(input:OutlineInput):CopperOutline {
  const edges=decodeOutlinePaths(input),nodes=new Map<string,number[]>();
  const key=(p:Point)=>Math.round(p[0]/EPS)+','+Math.round(p[1]/EPS);
  edges.forEach((edge,index)=>{for(const point of [edge[0],edge.at(-1)!]){const k=key(point),list=nodes.get(k)??[];if(list.length>=2)throw new Error('The board profile has branching contours. Choose a dedicated closed outline.');list.push(index);nodes.set(k,list);}});
  if([...nodes.values()].some(list=>list.length!==2))throw new Error('The board profile has open ends or branching contours. Choose a closed outline without dimensions or construction lines.');
  const used=new Set<number>(),rings:Point[][]=[];
  for(let first=0;first<edges.length;first++){
    if(used.has(first))continue;
    const ring:Point[]=[...edges[first]];used.add(first);
    const begin=key(ring[0]);let end=key(ring.at(-1)!);
    while(end!==begin){
      const next=nodes.get(end)!.find(index=>!used.has(index));
      if(next===undefined)throw new Error('The board profile does not form closed contours.');
      const edge=edges[next],ordered=key(edge[0])===end?edge:[...edge].reverse();ring.push(...ordered.slice(1));used.add(next);end=key(ring.at(-1)!);
    }
    if(ring.length<4)throw new Error('The profile contains a contour without area.');
    rings.push(ring);
  }
  type Segment={a:Point;b:Point;ring:number;index:number;minX:number;maxX:number;minY:number;maxY:number};
  const segments:Segment[]=[];
  rings.forEach((ring,r)=>{for(let i=0;i<ring.length-1;i++){const a=ring[i],b=ring[i+1];segments.push({a,b,ring:r,index:i,minX:Math.min(a[0],b[0]),maxX:Math.max(a[0],b[0]),minY:Math.min(a[1],b[1]),maxY:Math.max(a[1],b[1])});}});
  segments.sort((a,b)=>a.minX-b.minX);let active:Segment[]=[],checks=0;
  const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  for(const segment of segments){
    active=active.filter(other=>other.maxX>=segment.minX-EPS);
    for(const other of active){
      if(++checks>4000000)throw new Error('Profile intersection checks exceeded the analysis limit. Use a simpler outline.');
      if(other.maxY<segment.minY-EPS||other.minY>segment.maxY+EPS)continue;
      const adjacent=other.ring===segment.ring&&(Math.abs(other.index-segment.index)===1||Math.abs(other.index-segment.index)===rings[other.ring].length-2);
      if(adjacent){
        // Adjacent segments may share an endpoint, but may not double back over each other.
        const shared=[segment.a,segment.b].find(p=>key(p)===key(other.a)||key(p)===key(other.b))!;
        const p=key(segment.a)===key(shared)?segment.b:segment.a,q=key(other.a)===key(shared)?other.b:other.a;
        if(Math.abs(cross(shared,p,q))<1e-12&&(p[0]-shared[0])*(q[0]-shared[0])+(p[1]-shared[1])*(q[1]-shared[1])>0)throw new Error('The profile contains overlapping contour segments.');
        continue;
      }
      const c1=cross(segment.a,segment.b,other.a),c2=cross(segment.a,segment.b,other.b),c3=cross(other.a,other.b,segment.a),c4=cross(other.a,other.b,segment.b);
      if(c1*c2<=0&&c3*c4<=0)throw new Error('The profile contains crossing or touching contours. Choose a non-intersecting board outline.');
    }
    active.push(segment);
  }
  let area=0,cutouts=0;
  for(const ring of rings){
    let twice=0;for(let i=0;i<ring.length-1;i++)twice+=ring[i][0]*ring[i+1][1]-ring[i+1][0]*ring[i][1];
    const depth=rings.filter(other=>other!==ring&&pointInRing(ring[0],other)).length;
    if(Math.abs(twice)<EPS*EPS)throw new Error('The profile contains a zero-area contour.');
    area+=(depth%2?-1:1)*Math.abs(twice)/2;if(depth%2)cutouts++;
  }
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const ring of rings)for(const p of ring){minX=Math.min(minX,p[0]);minY=Math.min(minY,p[1]);maxX=Math.max(maxX,p[0]);maxY=Math.max(maxY,p[1]);}
  if(!Number.isFinite(area)||area<=0)throw new Error('The board profile has no usable area.');
  return {rings,bounds:[minX,minY,maxX-minX,maxY-minY],area,cutouts};
}

export function copperGrid(bounds:Bounds,requestedMm:number):CopperGrid {
  if(!bounds.every(Number.isFinite)||bounds[2]<=0||bounds[3]<=0||!Number.isFinite(requestedMm)||requestedMm<=0)throw new Error('Invalid analysis size.');
  const pixelMm=Math.max(requestedMm,Math.sqrt(bounds[2]*bounds[3]/8000000),bounds[2]/8192,bounds[3]/8192);
  const width=Math.max(1,Math.floor(bounds[2]/pixelMm)),height=Math.max(1,Math.floor(bounds[3]/pixelMm));
  return {width,height,pixelMm:Math.max(bounds[2]/width,bounds[3]/height),limited:pixelMm>requestedMm*1.001};
}
/** Alpha-weighted projected coverage, clipped by the profile mask. RGB and viewer colours have no effect. */
export function measureCopper(board:Uint8ClampedArray,copper:Uint8ClampedArray,pixelArea:number):{boardArea:number;copperArea:number;percent:number} {
  if(board.length!==copper.length||board.length%4||!Number.isFinite(pixelArea)||pixelArea<=0)throw new Error('Invalid analysis masks.');
  let boardAlpha=0,copperAlpha=0;
  for(let i=3;i<board.length;i+=4){boardAlpha+=board[i];copperAlpha+=Math.min(board[i],copper[i]);}
  if(!boardAlpha)throw new Error('The outline is smaller than the analysis grid. Use a finer resolution.');
  return {boardArea:boardAlpha/255*pixelArea,copperArea:copperAlpha/255*pixelArea,percent:100*copperAlpha/boardAlpha};
}