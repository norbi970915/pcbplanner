import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {chromium} from 'playwright-core';

const base=process.argv[2]??'http://127.0.0.1:4180',folder=process.argv[3];
if(folder)assert(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Private files are tested only against a local preview.');
mkdirSync('dist-check/gerber',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const consent=()=>localStorage.setItem('pcbplanner:analytics-consent',JSON.stringify({choice:'declined',version:2,updatedAt:new Date().toISOString()}));
const section=(page,side)=>page.locator('.properties-section').filter({has:page.getByRole('button',{name:new RegExp('Layout '+side+' layers')})});
const ready=page=>page.getByRole('button',{name:'PNG',exact:true}).waitFor({state:'visible'}).then(()=>page.waitForFunction(()=>![...document.querySelectorAll('button')].find(button=>button.textContent==='PNG')?.disabled));
const matrix=page=>page.locator('.gerber-canvas-wrap canvas').evaluate(canvas=>({transform:canvas.style.transform,width:canvas.width,height:canvas.height,image:canvas.toDataURL()}));
async function load(page){
  await page.goto(base+'/gerber-viewer');await page.locator('.schematic-gerber-link').waitFor();
  if(folder){
    const files=readdirSync(resolve(folder)).filter(name=>name.endsWith('.gbr')).map(name=>({name,mimeType:'text/plain',buffer:readFileSync(join(resolve(folder),name))}));
    for(const side of ['A','B']){
      await page.getByLabel('Open layout '+side+' files',{exact:true}).setInputFiles(files);
      await page.waitForFunction(({side,count})=>[...document.querySelectorAll('.properties-section')].find(s=>s.textContent.includes('Layout '+side+' layers'))?.querySelectorAll('.gerber-layer-row').length===count,{side,count:files.length});
      await section(page,side).getByRole('button',{name:'Show all'}).click();
    }
  }else{await page.getByRole('button',{name:'Try sample comparison'}).click();await page.waitForFunction(()=>document.querySelectorAll('.gerber-layer-row').length===4);}
  await ready(page);
}
try{
  const context=await browser.newContext({viewport:{width:1600,height:1100},deviceScaleFactor:2,serviceWorkers:'block',acceptDownloads:true});await context.addInitScript(consent);
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await load(page);console.log('Loaded comparison layers.');
  const before=await matrix(page),bounds=await page.locator('.gerber-canvas-wrap').boundingBox();
  await page.evaluate(()=>{
    const canvas=document.querySelector('.gerber-canvas-wrap canvas'),original=CanvasRenderingContext2D.prototype.drawImage;
    window.gerberPerf={draws:0,previews:new Set(),styleUpdates:0,gaps:[],samples:[],running:true,last:performance.now()};
    window.gerberPerf.observer=new MutationObserver(entries=>window.gerberPerf.styleUpdates+=entries.length);window.gerberPerf.observer.observe(canvas,{attributes:true,attributeFilter:['style']});
    CanvasRenderingContext2D.prototype.drawImage=function(...args){if(this.canvas===canvas)window.gerberPerf.draws++;return original.apply(this,args);};
    const tick=time=>{const p=window.gerberPerf;if(!p.running)return;p.gaps.push(time-p.last);p.samples.push({time,gap:time-p.last});p.last=time;p.previews.add(canvas.style.transform);requestAnimationFrame(tick);};requestAnimationFrame(tick);
  });
  await page.mouse.move(bounds.x+bounds.width*.45,bounds.y+bounds.height*.5);await page.mouse.down();
  await page.mouse.move(bounds.x+bounds.width*.45+220,bounds.y+bounds.height*.5-70,{steps:80});await page.evaluate(()=>window.gerberPerf.dragEnd=performance.now());await page.mouse.up();console.log('Pan gesture complete.');await ready(page);
  const after=await matrix(page);assert.equal(after.width,before.width,'Full pixel resolution must return after panning');assert.equal(after.height,before.height);
  assert.match(after.transform,/matrix\(1, 0, 0, 1, 0, 0\)/,'Completed frames must not retain a preview transform');assert.notEqual(after.image,before.image,'Panning must actually move the board');
  const perf=await page.evaluate(()=>{const p=window.gerberPerf;p.running=false;p.observer.disconnect();return{rasterFrames:p.draws,previewUpdates:p.styleUpdates,distinctPreviews:p.previews.size,animationFrames:p.gaps.length,maxDragGap:Math.round(Math.max(...p.samples.filter(sample=>sample.time<=p.dragEnd).map(sample=>sample.gap))),maxGap:Math.round(Math.max(...p.gaps)),over50ms:p.gaps.filter(gap=>gap>50).length};});
  console.log('Pan measurements: '+JSON.stringify(perf));
  assert(perf.previewUpdates>perf.rasterFrames,'Pan previews should update more often than expensive raster frames');
  const resolutionBefore=Number((await page.locator('.gerber-view-footer').textContent()).match(/([\d.]+) \u00b5m/)[1]);
  await page.mouse.wheel(0,-160);await ready(page);
  const resolutionAfter=Number((await page.locator('.gerber-view-footer').textContent()).match(/([\d.]+) \u00b5m/)[1]);assert(resolutionAfter<resolutionBefore,'Wheel zoom must settle at the new scale');
  await page.getByRole('button',{name:'Fit',exact:true}).click();await ready(page);
  await page.getByRole('button',{name:'Enter fullscreen',exact:true}).click();await page.locator('.gerber-fullscreen-workspace').waitFor();console.log('Entered fullscreen.');await ready(page);
  const full=await page.locator('.gerber-fullscreen-workspace').boundingBox(),canvasBox=await page.locator('.gerber-canvas-wrap').boundingBox(),layers=await page.getByRole('complementary',{name:'Gerber layers'}).boundingBox();
  assert(full.width>=1598);assert(canvasBox.width>bounds.width);assert(layers.x>=canvasBox.x+canvasBox.width-1,'Layer controls must sit beside the board');assert(canvasBox.height>300);
  await page.getByRole('button',{name:'Help: Shift B in X',exact:true}).click();await page.locator('.field-help-popover').waitFor();
  assert(await page.locator('.field-help-popover').evaluate(popover=>!!popover.closest('.gerber-fullscreen-workspace')),'Help must remain inside the fullscreen workspace');
  await page.getByRole('button',{name:'Close field help',exact:true}).click();
  await section(page,'A').getByRole('button',{name:'Hide all'}).click();await section(page,'A').locator('input[type=checkbox]').first().check();await ready(page);
  assert.equal(await section(page,'A').locator('input[type=checkbox]:checked').count(),1);
  await page.screenshot({path:'dist-check/gerber/fullscreen-desktop.png'});
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'PNG',exact:true}).click();await(await download).saveAs('dist-check/gerber/fullscreen-export.png');
  await page.keyboard.press('Escape');await page.locator('.gerber-fullscreen-workspace').waitFor({state:'detached'});await ready(page);assert.equal(await section(page,'A').locator('input[type=checkbox]:checked').count(),1);
  assert.equal(await page.locator('.gerber-fullscreen-layers').count(),0);
  console.log('Desktop: '+JSON.stringify(perf)+'; full-resolution pan end, fullscreen board and layers, selection persistence, Escape and PNG passed.');
  await context.close();
  for(const width of [390,320]){
    const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});await context.addInitScript(consent);await context.addInitScript(()=>{Element.prototype.requestFullscreen=undefined;});
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(base+'/gerber-viewer');await page.getByRole('button',{name:'Try sample comparison'}).click();await page.waitForFunction(()=>document.querySelectorAll('.gerber-layer-row').length===4);await ready(page);
    await page.getByRole('button',{name:'Enter fullscreen',exact:true}).click();await page.locator('.gerber-fullscreen-workspace').waitFor();await ready(page);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    const view=await page.locator('.gerber-canvas-wrap').boundingBox(),controls=await page.getByRole('complementary',{name:'Gerber layers'}).boundingBox();assert(view.height>=100);assert(controls.y>=view.y+view.height-1);
    const resolutionBefore=Number((await page.locator('.gerber-view-footer').textContent()).match(/([\d.]+) \u00b5m/)[1]);
    const cdp=await context.newCDPSession(page),centre={x:view.x+view.width/2,y:view.y+view.height/2};
    const touches=distance=>[{x:centre.x-distance,y:centre.y,id:1},{x:centre.x+distance,y:centre.y,id:2}];
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touches(35)});
    for(const distance of [40,45,50,55,60])await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touches(distance)});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await ready(page);
    const resolutionAfter=Number((await page.locator('.gerber-view-footer').textContent()).match(/([\d.]+) \u00b5m/)[1]);assert(resolutionAfter<resolutionBefore,'Pinch zoom must settle at the new scale');
    await section(page,'A').locator('input[type=checkbox]').nth(1).check();assert.equal(await section(page,'A').locator('input[type=checkbox]:checked').count(),2);
    await page.screenshot({path:'dist-check/gerber/fullscreen-mobile-'+width+'.png'});await page.getByRole('button',{name:'Exit fullscreen',exact:true}).click();await page.locator('.gerber-fullscreen-workspace').waitFor({state:'detached'});assert.equal(await section(page,'A').locator('input[type=checkbox]:checked').count(),2);
    console.log(width+' px: expanded-workspace fallback, reachable layers, retained selection and exit passed.');await context.close();
  }
  assert.deepEqual(errors,[]);
}finally{await browser.close();}
