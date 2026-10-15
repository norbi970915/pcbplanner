import assert from 'node:assert/strict';
import { readFileSync,readdirSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { zipSync } from 'fflate';
import { chromium } from 'playwright-core';

// Test a local export set without committing or uploading its board files.
// Usage: node scripts/audit-gerber-files.mjs [localPreviewUrl] [folder]
const base=process.argv[2]??'http://127.0.0.1:4180',folder=resolve(process.argv[3]??'GERBER');
assert(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Use a local preview for private export testing.');
const entries=readdirSync(folder).filter(name=>/\.(?:gbr|ger|gerber|gtl|gbl|gbrjob)$/i.test(name)).map(name=>({name,buffer:readFileSync(join(folder,name))}));
const layers=entries.filter(file=>!file.name.endsWith('.gbrjob'));assert(layers.length>0);
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const context=await browser.newContext({viewport:{width:1600,height:1100},serviceWorkers:'block'});
  await context.addInitScript(()=>localStorage.setItem('pcbplanner:analytics-consent',JSON.stringify({choice:'declined',version:2,updatedAt:new Date().toISOString()})));
  const page=await context.newPage(),errors=[],external=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(/^https?:/.test(request.url())&&!request.url().startsWith(base))external.push(request.url());});
  await page.goto(base+'/gerber-viewer');await page.locator('.schematic-gerber-link').waitFor();
  const upload=async(side,files)=>{
    await page.getByLabel('Open layout '+side+' files',{exact:true}).setInputFiles(files.map(file=>({...file,mimeType:'application/octet-stream'})));
    await page.waitForFunction(side=>!Array.from(document.querySelectorAll('.gerber-upload'))[side==='A'?0:1].querySelector('.gerber-import-status').textContent.includes('Reading'),side);
    assert.equal(await page.locator('[role=alert]').count(),0,await page.locator('[role=alert]').allTextContents());
    assert.equal(await page.locator('.gerber-import-warnings').count(),0,await page.locator('.gerber-import-warnings').allTextContents());
  };
  const section=side=>page.locator('.properties-section').filter({has:page.getByRole('button',{name:new RegExp('Layout '+side+' layers')})});
  const waitPaint=paint=>page.waitForFunction(paint=>{
    const canvas=document.querySelector('.gerber-canvas-wrap canvas'),data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let count=0;
    for(let i=0;i<data.length;i+=4)if(data[i]!==21||data[i+1]!==25||data[i+2]!==30)count++;
    return paint?count>100:count===0;
  },paint);
  await upload('A',entries);assert.equal(await section('A').locator('.gerber-layer-row').count(),layers.length);
  for(let index=0;index<layers.length;index++){
    await section('A').getByRole('button',{name:'Hide all'}).click();await waitPaint(false);
    await section('A').locator('input[type=checkbox]').nth(index).check();await page.getByRole('button',{name:'Fit',exact:true}).click();await waitPaint(true);
    const name=layers[index].buffer.toString().match(/%IN([^*%]+)\*%/)?.[1]?.trim();
    if(name)assert.equal(await section('A').locator('.gerber-layer-row strong').nth(index).textContent(),name);
  }
  await upload('B',entries);assert.equal(await page.locator('.gerber-layer-row').count(),layers.length*2);await waitPaint(true);
  const archive=zipSync(Object.fromEntries(entries.map(file=>[file.name,file.buffer])));
  await upload('A',[{name:'local-export.zip',buffer:Buffer.from(archive)}]);assert.equal(await page.locator('.gerber-layer-row').count(),layers.length*2);await waitPaint(true);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('Local export passed: '+layers.length+' individual layers rendered, image names identified, job metadata skipped, A/B and ZIP imports passed without warnings; no external requests.');
}finally{await browser.close();}
