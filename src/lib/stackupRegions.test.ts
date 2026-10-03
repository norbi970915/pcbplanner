import { describe, expect, it } from 'vitest';
import { FLEX_PRESETS } from '../data/flexStackups';
import { LAMINATES, LAMINATE_SOURCES } from '../data/laminates';
import { planAdvice, nominalThickness, rankAdvice, type Constraints, type Requirement } from './advisor';
import { designLine, toSolverGeometry } from './design';
import { solve } from './fieldsolver';
import { formatPlies, parsePlies } from './plies';
import { serialiseStackup, parseStackupFile, isStackup } from './stackupFile';
import { normalise, toKicad } from './stackupExport';
import { boardThickness, copperCount, geometryForLayer, PRESETS } from './stackups';
import { addRegion, constructionOf, impedanceQuery, insertRegionLayer, regionStackup, removeRegionLayer, setRegionLayer, stackupIssues, stackupRegions, updateStackupLayer } from './stackupRegions';

const source = FLEX_PRESETS.find(s=>s.id==='rf-4l-2f')!;
const flex = regionStackup(source,'flex');
const rigid = regionStackup(source,'rigid');
const signal = flex.layers.find(l=>l.kind==='copper' && l.role==='signal')!;
const c:Constraints = {layersMin:2,layersMax:12,thickMin:0,thickMax:2,signalMin:1,minW:0.02,minS:0.02,maxW:1,etch:0.005,priority:'cost',construction:'rigid-flex',region:'all'};
const requirements:Requirement[] = [{id:'a',label:'50 ohm',kind:'se',z:50,spacing:'fixed',s:0.1,ratio:1,where:'all'}];

describe('rigid-flex linked regions',()=> {
  it('has valid flex and rigid-flex starter regions with a reference for each signal layer',()=> {
    expect(FLEX_PRESETS).toHaveLength(6);
    for(const s of FLEX_PRESETS){
      expect(stackupIssues(s)).toEqual([]);
      for(const region of stackupRegions(s))for(const l of region.layers)if(l.kind==='copper'&&l.role==='signal')expect(geometryForLayer(region,l.id)).not.toBeNull();
    }
    expect(constructionOf(source)).toBe('rigid-flex');
    expect(copperCount(rigid)).toBe(4);expect(copperCount(flex)).toBe(2);
    expect(boardThickness(flex)).toBeCloseTo(0.236,10);
    expect(boardThickness(source)).toBeCloseTo(boardThickness(rigid),10);
    expect(nominalThickness(source)).toBeCloseTo(boardThickness(rigid),10);
  });
  it('uses coverlay and adhesive as separate dielectric plies and recognises covered outer copper',()=> {
    const g=geometryForLayer(source,signal.id,'flex')!;
    expect(g.type).toBe('embedded');expect(g.outer).toBe(true);
    expect(g.h).toBeCloseTo(0.1,10);expect(g.h2).toBeCloseTo(0.05,10);
    expect(g.above!.map(p=>p.er)).toEqual([2.8,3.4]);
    expect(g.above!.map(p=>p.df)).toEqual([0.0035,0.0018]);
    expect(g.above!.map(p=>p.fGHz)).toEqual([10,0.000001]);
    const mesh=toSolverGeometry(g,0.15,false,undefined,0);
    expect(mesh.slabs.map(s=>s.er)).toEqual([3.2,2.8,3.4]);
    const covered=solve(mesh).se!.z;
    const bare=solve({...mesh,slabs:[mesh.slabs[0]]}).se!.z;
    expect(covered).toBeLessThan(bare);
    const rg=geometryForLayer(source,signal.id,'rigid')!;
    expect(rg.type).toBe('stripline');expect(rg.h2).toBeCloseTo(0.15,10);
  });
  it('shared copper edits propagate while regional insert/remove and membership stay independent',()=> {
    const edited=updateStackupLayer(source,signal.id,{t:0.025});
    expect(regionStackup(edited,'rigid').layers.find(l=>l.id===signal.id)!.t).toBe(0.025);
    expect(regionStackup(edited,'flex').layers.find(l=>l.id===signal.id)!.t).toBe(0.025);
    const added=insertRegionLayer(edited,'flex',signal.id,{id:'local',kind:'adhesive',name:'Local adhesive',t:0.01,er:2.8,df:0.0035});
    expect(regionStackup(added,'flex').layers.some(l=>l.id==='local')).toBe(true);
    expect(regionStackup(added,'rigid').layers.some(l=>l.id==='local')).toBe(false);
    const removed=removeRegionLayer(added,'flex',signal.id);
    expect(regionStackup(removed,'rigid').layers.some(l=>l.id===signal.id)).toBe(true);
    expect(regionStackup(removed,'flex').layers.some(l=>l.id===signal.id)).toBe(false);
    expect(setRegionLayer(removed,'flex',signal.id,true).regions![1].layerIds).toContain(signal.id);
    const linked=addRegion(PRESETS[0],{id:'tail',name:'Tail',kind:'flex'});
    expect(linked.regions![0].layerIds).toEqual(linked.regions![1].layerIds);
  });
  it('recomputes edited nominal thickness and guards persisted regional records',()=> {
    const linked=addRegion(PRESETS[0],{id:'tail',name:'Tail',kind:'flex'});
    const id=linked.layers.find(l=>l.kind==='copper')!.id;
    const changed=updateStackupLayer(linked,id,{t:0.025});
    expect(changed.regions!.every(r=>r.nominal===undefined)).toBe(true);
    expect(nominalThickness(changed)).toBeCloseTo(boardThickness(changed),10);
    expect(isStackup(source)).toBe(true);
    expect(isStackup({...source,regions:[null]})).toBe(false);
    expect(isStackup({...source,layers:[{id:'a',name:'Cu',kind:'copper',t:0.018,fGHz:0}]})).toBe(false);
    expect(isStackup({id:'old',name:'Old',layers:[{id:'a',name:'Cu',kind:'copper',t:0.035}]})).toBe(true);
  });
  it('JSON preserves every layer, region and material and rejects malformed links or impossible stacks',()=> {
    const imported=parseStackupFile(serialiseStackup(source));
    expect(imported.regions).toEqual(source.regions);expect(imported.layers).toEqual(JSON.parse(JSON.stringify(source.layers)));
    expect(imported.builtin).toBe(false);
    expect(()=>parseStackupFile('{}')).toThrow(/supported/);
    expect(()=>serialiseStackup({...source,regions:[{id:'bad',name:'Bad',kind:'flex',layerIds:['missing']}]})).toThrow(/membership/);
    expect(stackupIssues({...flex,layers:[signal,signal]})).toEqual(expect.arrayContaining(['Layer IDs must be unique within the construction.']));
    expect(()=>normalise(source)).toThrow(/region/);
    expect(()=>normalise(flex)).toThrow(/coverlay/);
    expect(toKicad(rigid)).toHaveLength(2);
  });
  it('handoff preserves the exact cover plies and resets stale broadside, material and coplanar state',()=> {
    const g=geometryForLayer(flex,signal.id)!;
    const query=impedanceQuery(g);
    expect(parsePlies(query.get('dl2')!)!.map(p=>p.dk)).toEqual([2.8,3.4]);
    expect(query.get('type')).toBe('embedded');expect(query.get('coupling')).toBe('edge');expect(query.get('cpw')).toBe('0');
    expect(query.get('mat2')).toBe('custom');expect(query.get('mask')).toBe('0');
  });
});

describe('regional stackup advisor',()=> {
  it('filters construction and region with region-specific thickness, and keeps rigid defaults intact',()=> {
    const stacks=[...PRESETS,...FLEX_PRESETS];
    const both=planAdvice(stacks,[],c,'fast');expect(both.plans).toHaveLength(6);
    expect(new Set(both.plans.map(p=>p.stackup.id)).size).toBe(6);
    const thin=planAdvice(stacks,[],{...c,region:'flex',thickMax:0.3},'fast');expect(thin.plans).toHaveLength(2);
    expect(thin.plans.every(p=>p.stackup.construction==='flex')).toBe(true);
    const onlyRigid=planAdvice(stacks,[],{...c,construction:'rigid',region:'rigid'},'fast');
    expect(onlyRigid.plans.every(p=>!p.stackup.parentId)).toBe(true);
  });
  it('solves covered flex-layer widths and rejects requirements that need unavailable inner layers',()=> {
    const {plans,jobs}=planAdvice([source],requirements,{...c,region:'flex'},'normal');
    expect(plans).toHaveLength(1);expect(jobs.size).toBe(1);
    const results=new Map([...jobs].map(([key,req])=>[key,designLine(req)]));
    expect([...results.values()][0].z).toBeCloseTo(50,1);
    expect(rankAdvice(plans,requirements,c,results)[0].ok).toBe(true);
    const inner=planAdvice([source],[{...requirements[0],where:'inner'}],{...c,region:'flex'},'fast');
    expect(inner.plans).toHaveLength(0);expect(inner.rejected[0].reason).toContain('no inner');
  });
});

describe('flex material and loss references',()=> {
  it('roundtrips per-ply frequencies including 1 kHz and retains old URL formats',()=> {
    const plies=[{t:0.025,dk:3.4,df:0.0018,fGHz:0.000001},{t:0.025,dk:2.8,df:0.0035,fGHz:10}];
    expect(parsePlies(formatPlies(plies))).toEqual(plies);
    expect(parsePlies('0.1:4:0.02')).toEqual([{t:0.1,dk:4,df:0.02}]);
    expect(parsePlies('0.1:4:0.02::0')).toBeNull();
  });
  it('new material library entries link to manufacturer sources and preserve composite distinction',()=> {
    const added=LAMINATES.filter(l=>l.cls==='Flex materials');expect(added).toHaveLength(3);
    expect(added.every(l=>l.fGHz===10 && LAMINATE_SOURCES[l.src].url.includes('dupont.com'))).toBe(true);
    expect(added.find(l=>l.id==='pyralux-hp-coverlay')!.note).toContain('composite');
  });
});
