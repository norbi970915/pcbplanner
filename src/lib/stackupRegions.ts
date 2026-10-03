import type { Layer, Stackup, StackupRegion } from './stackups';

export function constructionOf(s: Stackup): 'rigid' | 'flex' | 'rigid-flex' {
  if (s.regions?.length) {
    const kinds = new Set(s.regions.map(r => r.kind));
    return kinds.size > 1 ? 'rigid-flex' : s.regions[0].kind;
  }
  return s.construction ?? 'rigid';
}

/** A calculation/export always sees one physical region, never the union of regional layers. */
export function regionStackup(s: Stackup, id?: string): Stackup {
  if (!s.regions?.length) return s;
  const region = id ? s.regions.find(r => r.id === id) : s.regions[0];
  if (!region) throw new Error('The selected stackup region no longer exists.');
  const ids = new Set(region.layerIds);
  return { ...s, id: s.id + '::' + region.id, parentId: s.id, regionId: region.id,
    regionName: region.name, name: s.name + ' / ' + region.name, label: undefined,
    construction: region.kind, nominal: region.nominal, regions: undefined,
    layers: s.layers.filter(l => ids.has(l.id)) };
}

export const stackupRegions = (s: Stackup): Stackup[] => s.regions?.length ? s.regions.map(r => regionStackup(s,r.id)) : [s];
export const layerRegionNames = (s: Stackup, id: string) => s.regions?.filter(r => r.layerIds.includes(id)).map(r=>r.name) ?? [];

/** Layer records are stored once, so copper, core and role edits stay linked between regions. */
export function updateStackupLayer(s: Stackup, id: string, patch: Partial<Layer>): Stackup {
  return { ...s,
    nominal: patch.t === undefined ? s.nominal : undefined,
    regions: s.regions?.map(r => patch.t !== undefined && r.layerIds.includes(id) ? {...r,nominal:undefined} : r),
    layers: s.layers.map(l => l.id === id ? { ...l, ...patch, id } : l) };
}
export function addRegion(s: Stackup, region: Omit<StackupRegion,'layerIds'>, from?: string): Stackup {
  const base = s.regions?.length ? s.regions : [{id:'rigid',name:'Rigid',kind:'rigid' as const,layerIds:s.layers.map(l=>l.id),nominal:s.nominal}];
  if (base.some(r=>r.id===region.id)) throw new Error('Region IDs must be unique.');
  const source = base.find(r=>r.id===from) ?? base[0];
  return { ...s, nominal: undefined, regions: [...base,{...region,layerIds:[...source.layerIds]}] };
}
export function setRegionLayer(s: Stackup, regionId: string, layerId: string, included: boolean): Stackup {
  if (!s.layers.some(l=>l.id===layerId)) throw new Error('Unknown stackup layer.');
  return { ...s, regions: s.regions?.map(r=>r.id===regionId ? {...r,nominal:undefined,layerIds:included ? [...new Set([...r.layerIds,layerId])] : r.layerIds.filter(id=>id!==layerId)} : r) };
}
export function insertRegionLayer(s: Stackup, regionId: string | undefined, after: string | null, layer: Layer): Stackup {
  const layers = [...s.layers];
  const index = layers.findIndex(l=>l.id===after);
  layers.splice(index < 0 ? layers.length : index+1,0,layer);
  return { ...s, layers, nominal: undefined, regions: s.regions?.map(r=>r.id===regionId ? {...r,nominal:undefined,layerIds:[...r.layerIds,layer.id]} : r) };
}
export function removeRegionLayer(s: Stackup, regionId: string | undefined, layerId: string): Stackup {
  if (!s.regions?.length) return { ...s, layers:s.layers.filter(l=>l.id!==layerId) };
  const regions = s.regions.map(r=>r.id===regionId ? {...r,nominal:undefined,layerIds:r.layerIds.filter(id=>id!==layerId)} : r);
  const used = new Set(regions.flatMap(r=>r.layerIds));
  return { ...s, regions, layers:s.layers.filter(l=>used.has(l.id)), nominal:undefined };
}

export function stackupIssues(s: Stackup): string[] {
  const issues: string[] = [];
  const kinds = new Set(['copper','dielectric','mask','coverlay','adhesive']);
  const ids = s.layers.map(l=>l.id);
  if (new Set(ids).size !== ids.length) issues.push('Layer IDs must be unique within the construction.');
  for (const l of s.layers) {
    if (!kinds.has(l.kind) || !Number.isFinite(l.t) || l.t<=0 || l.t>=1000) issues.push(l.name + ': check the layer type and thickness.');
    if (l.kind!=='copper' && ((l.er!==undefined && (!Number.isFinite(l.er) || l.er<1 || l.er>1000)) || (l.df!==undefined && (!Number.isFinite(l.df) || l.df<0 || l.df>=1)))) issues.push(l.name + ': check Dk (at least 1) and Df (0 to less than 1).');
    if (l.fGHz!==undefined && (!Number.isFinite(l.fGHz) || l.fGHz<=0 || l.fGHz>200)) issues.push(l.name + ': check the Dk/Df reference frequency (0 to 200 GHz).');
  }
  if (s.regions && !s.regions.length) issues.push('A regional construction needs at least one region.');
  const regionIds = s.regions?.map(r=>r.id) ?? [];
  if (new Set(regionIds).size!==regionIds.length) issues.push('Region IDs must be unique.');
  for (const r of s.regions ?? []) {
    if (!r.name.trim() || !['rigid','flex'].includes(r.kind)) issues.push('Every region needs a name and rigid/flex type.');
    if (new Set(r.layerIds).size!==r.layerIds.length || r.layerIds.some(id=>!ids.includes(id))) issues.push(r.name + ': check layer membership.');
  }
  for (const region of stackupRegions(s)) {
    const copper = region.layers.filter(l=>l.kind==='copper');
    if (!copper.length) issues.push(region.name + ': include at least one copper layer.');
    for (let i=1;i<region.layers.length;i++) if (region.layers[i].kind==='copper' && region.layers[i-1].kind==='copper') issues.push(region.name + ': copper layers need dielectric separation.');
    const first=region.layers.findIndex(l=>l.kind==='copper'),last=region.layers.findLastIndex(l=>l.kind==='copper');
    if (region.layers.slice(first+1,last).some(l=>l.kind==='mask')) issues.push(region.name + ': solder mask belongs outside the copper stack.');
  }
  return [...new Set(issues)];
}

export function impedanceQuery(sg: import('./stackups').StackupGeometry, extra: Record<string,string> = {}): URLSearchParams {
  const encode = (ps?: import('./stackups').Ply[]) => ps?.map(p=>p.t+':'+p.er).join(',') ?? '';
  const q = new URLSearchParams({type:sg.type,h:String(sg.h),er:String(sg.er),t:String(sg.t),
    dl:encode(sg.below),dl2:encode(sg.above),mode:'se',coupling:'edge',cpw:'0',mat:'custom',mat2:'custom',...extra});
  if(sg.h2!==undefined){q.set('h2',String(sg.h2));q.set('er2',String(sg.er2??sg.er));}
  q.set('mask',sg.mask?'1':'0');
  if(sg.mask){q.set('c1',String(sg.mask.c1));q.set('c2',String(sg.mask.c2));q.set('erm',String(sg.mask.er));}
  return q;
}
