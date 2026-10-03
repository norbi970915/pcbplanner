import type { Stackup } from './stackups';
import { stackupIssues } from './stackupRegions';

export function serialiseStackup(s: Stackup): string {
  const issues = stackupIssues(s);
  if(issues.length)throw new Error(issues.join(' '));
  if(s.parentId)throw new Error('Export the complete construction, not a flattened region.');
  return JSON.stringify({app:'pcbplanner',type:'stackup',version:1,stackup:s},null,2);
}
export function parseStackupFile(text: string): Stackup {
  const data = JSON.parse(text);
  if(!data || data.app!=='pcbplanner' || data.type!=='stackup' || data.version!==1)throw new Error('This is not a supported PCBPlanner stackup file.');
  const s = data.stackup;
  if(!s || typeof s.id!=='string' || typeof s.name!=='string' || !Array.isArray(s.layers) || s.layers.length>200 || !s.layers.length || s.layers.some((l: unknown)=>!l || typeof l!=='object'))throw new Error('Check the stackup name and layers.');
  if(s.regions!==undefined && (!Array.isArray(s.regions) || s.regions.length>20 || s.regions.some((r: {id?:unknown;name?:unknown;layerIds?:unknown})=>!r || typeof r.id!=='string' || typeof r.name!=='string' || !Array.isArray(r.layerIds))))throw new Error('Check the stackup regions.');
  if(s.layers.some((l:{id?:unknown;name?:unknown})=>typeof l.id!=='string'||typeof l.name!=='string'))throw new Error('Every layer needs an ID and name.');
  if(s.parentId)throw new Error('Import a complete construction file.');
  const issues=stackupIssues(s);
  if(issues.length)throw new Error(issues.join(' '));
  return {...s,builtin:false,label:undefined};
}

/** Validate persisted/imported records without letting malformed regions crash the editor. */
export function isStackup(value: unknown): value is Stackup {
  try {
    parseStackupFile(JSON.stringify({app:"pcbplanner",type:"stackup",version:1,stackup:value}));
    return true;
  } catch { return false; }
}
