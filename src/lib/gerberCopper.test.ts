import { describe, expect, it } from 'vitest';
import { buildCopperOutline, copperGrid, isCopperLayer, isProfileLayer, measureCopper, type OutlineInput } from './gerberCopper';
const path=(d:string,filled=false):OutlineInput=>({scale:1,paths:[{d,filled}]});
const square=(x:number,y:number,size:number)=>`M${x} ${y} L${x+size} ${y} L${x+size} ${y+size} L${x} ${y+size} L${x} ${y}`;

describe('closed Gerber board profiles',()=>{
  it('joins shuffled and reversed contour segments on centre lines',()=>{
    const result=buildCopperOutline(path('M10 0 L0 0 M0 10 L10 10 M0 0 L0 10 M10 10 L10 0'));
    expect(result.area).toBe(100);expect(result.bounds).toEqual([0,-10,10,10]);expect(result.cutouts).toBe(0);
  });
  it('excludes nested cutouts and restores islands regardless of winding and path order',()=>{
    const result=buildCopperOutline(path(square(4,4,2)+' '+square(0,0,10)+' '+square(2,2,6)));
    expect(result.area).toBe(68);expect(result.cutouts).toBe(1);expect(result.rings).toHaveLength(3);
  });
  it('handles separate board islands without using their bounding rectangle as board area',()=>{
    const result=buildCopperOutline(path(square(0,0,10)+' '+square(20,0,5)));
    expect(result.area).toBe(125);expect(result.bounds).toEqual([0,-10,25,10]);
  });
  it('converts inch-origin grid coordinates to physical millimetres',()=>{
    const result=buildCopperOutline({scale:0.0254,paths:[{d:square(-1000,2000,1000),filled:false}]});
    expect(result.area).toBeCloseTo(25.4**2,8);expect(result.bounds[0]).toBeCloseTo(-25.4);expect(result.bounds[1]).toBeCloseTo(-76.2);
  });
  it('retains circular contours with controlled chord error',()=>{
    const result=buildCopperOutline(path('M10 0 A10 10 0 1 1 -10 0 A10 10 0 1 1 10 0'));
    expect(result.area).toBeCloseTo(Math.PI*100,0);expect(Math.abs(result.area-Math.PI*100)).toBeLessThan(0.1);
  });
  it('closes filled regions but rejects an open stroked profile',()=>{
    const d='M0 0 L10 0 L10 10 L0 10';
    expect(buildCopperOutline(path(d,true)).area).toBe(100);expect(()=>buildCopperOutline(path(d))).toThrow('open ends');
  });
  it('rejects gaps, branches, overlapping and crossing contours',()=>{
    for(const d of ['M0 0 L10 0 L10 10 L0 10 L0 0.01',square(0,0,10)+' M0 0 L5 5','M0 0 L10 10 L0 10 L10 0 L0 0',square(0,0,10)+' '+square(5,5,10),'M0 0 L10 0 L5 0 L5 10 L0 10 L0 0'])expect(()=>buildCopperOutline(path(d))).toThrow();
  });
  it('refuses unsupported paths and invalid numbers instead of making up an area',()=>{
    for(const d of ['M0 0 C1 2 3 4 5 6','M0 0 L10','M0 0 A10 5 0 1 0 2 3','M0 0 L1e999 1'])expect(()=>buildCopperOutline(path(d))).toThrow();
  });
});

describe('fixed physical copper sampling',()=>{
  it('caps raster dimensions and pixel count for large and narrow boards',()=>{
    for(const bounds of [[0,0,1000,1000],[0,0,90000,0.001],[0,0,1,20]] as [number,number,number,number][]){
      const grid=copperGrid(bounds,0.025);expect(grid.width*grid.height).toBeLessThanOrEqual(8000000);expect(Math.max(grid.width,grid.height)).toBeLessThanOrEqual(8192);expect(grid.pixelMm).toBeGreaterThanOrEqual(0.025);
    }
    expect(copperGrid([0,0,10,10],0.05)).toEqual({width:200,height:200,pixelMm:0.05,limited:false});
    expect(()=>copperGrid([0,0,0,10],0.05)).toThrow();
  });
  it('counts the copper union once, clips exterior artwork, and uses alpha rather than display colour',()=>{
    const board=new Uint8ClampedArray([0,0,0,255,0,0,0,255,0,0,0,0,0,0,0,128]);
    const copper=new Uint8ClampedArray([100,200,0,255,0,200,100,0,255,0,0,255,1,2,3,255]);
    const result=measureCopper(board,copper,2);
    expect(result.boardArea).toBeCloseTo((2+128/255)*2);expect(result.copperArea).toBeCloseTo((1+128/255)*2);expect(result.percent).toBeCloseTo(100*(255+128)/(510+128));
    expect(measureCopper(board,board,1).percent).toBe(100);
    expect(measureCopper(board,new Uint8ClampedArray(16),1).percent).toBe(0);
    expect(()=>measureCopper(new Uint8ClampedArray(4),new Uint8ClampedArray(4),1)).toThrow('smaller');
  });
  it('suggests copper and profiles while leaving mask, legend and drills unselected',()=>{
    for(const name of ['board.gtl','board.gbl','board-In2_Cu.gbr','copper_l3.gbr'])expect(isCopperLayer({name,label:'Layer'})).toBe(true);
    for(const name of ['board.gts','board.gto','board.drl'])expect(isCopperLayer({name,label:'Layer'})).toBe(false);
    expect(isCopperLayer({name:'unknown.gbr',label:'Copper / L4 / Inr'})).toBe(true);
    expect(isProfileLayer({name:'Profile_NP.gbr',label:'Layer'})).toBe(true);
  });
});