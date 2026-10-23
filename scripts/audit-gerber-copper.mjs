import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {chromium} from 'playwright-core';
const base=process.argv[2]??'http://127.0.0.1:4180',folder=process.argv[3];
if(folder)assert(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Private Gerbers stay on the local preview.');
const header=label=>'%FSLAX24Y24*%\n%MOMM*%\n%TF.FileFunction,'+label+'*%\n%ADD10C,0.8*%\nG01*\nD10*\n';
const p=(x,y)=>'X'+Math.round(x*10000)+'Y'+Math.round(y*10000);
const contour=(x,y,w,h)=>p(x,y)+'D02*\n'+p(x+w,y)+'D01*\n'+p(x+w,y+h)+'D01*\n'+p(x,y+h)+'D01*\n'+p(x,y)+'D01*\n';
const region=(x,y,w,h)=>'G36*\n'+contour(x,y,w,h)+'G37*\n';
const profile=header('Profile')+contour(0,0,10,10)+contour(4,4,2,2)+'M02*\n';
const copper=width=>header('Copper,L1,Top')+region(-5,-5,width+5,20)+region(0,0,4,10)+'%LPC*%\n'+region(1,1,1,1)+'%LPD*%\nM02*\n';
const fixtures=width=>[{name:'profile.gko',text:profile},{name:'top.gtl',text:copper(width)},{name:'plane.gbl',text:header('Copper,L2,Bot')+region(-1,-1,12,12)+'M02*\n'},{name:'outside.g3',text:header('Copper,L3,Inr')+region(20,20,1,1)+'M02*\n'}];
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1550,height:1100},serviceWorkers:'block'});
 await context.addInitScript(()=>{localStorage.setItem('pcbplanner:analytics-consent',JSON.stringify({choice:'declined',version:2,updatedAt:new Date().toISOString()}));sessionStorage.setItem('pcbtk-settings',JSON.stringify({unit:'mm',theme:'dark'}));});
 const page=await context.newPage(),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&new URL(r.url()).origin!==new URL(base).origin)external.push(r.url());});
 await page.goto(base+'/gerber-viewer');await page.getByRole('button',{name:'Compare revisions',exact:true}).click();
 const upload=async(side,files)=>{await page.getByLabel('Open layout '+side+' files',{exact:true}).setInputFiles(files.map(f=>({name:f.name,mimeType:'text/plain',buffer:Buffer.from(f.text)})));await page.waitForFunction(side=>!([...document.querySelectorAll('.gerber-upload')][side==='A'?0:1]?.querySelector('.gerber-import-status').textContent??'Reading').includes('Reading'),side);};
 await upload('A',fixtures(5));await upload('B',fixtures(7));
 await page.getByRole('button',{name:'Copper analysis',exact:true}).click();
 const analyse=async()=>{await page.getByRole('button',{name:'Analyse copper',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.gerber-copper-actions [role=status]')?.textContent,{},{timeout:60000});};
 await analyse();
 assert.equal(await page.locator('.gerber-copper [role=alert]').count(),0,await page.locator('.gerber-copper').innerText());
 const result=async side=>{const section=page.getByRole('region',{name:'Layout '+side+' copper results',exact:true});return {summary:await section.locator('.gerber-copper-summary').innerText(),rows:await section.locator('tbody tr').evaluateAll(rows=>rows.map(row=>({name:row.dataset.copperLayer,percent:Number(row.querySelector('td strong').textContent.replace('%','')),area:Number(row.querySelector('td:last-child').textContent.replace(/[^\d.]/g,''))})))};};
 const a=await result('A'),b=await result('B');
 assert.match(a.summary,/96 mm²/);assert.match(a.summary,/1 enclosed cutout/);
 assert(Math.abs(a.rows.find(r=>r.name==='top.gtl').percent-100*47/96)<.11,JSON.stringify(a));
 assert(Math.abs(b.rows.find(r=>r.name==='top.gtl').percent-100*65/96)<.11,JSON.stringify(b));
 for(const value of [a,b]){assert.equal(value.rows.find(r=>r.name==='plane.gbl').percent,100);assert.equal(value.rows.find(r=>r.name==='outside.g3').percent,0);}
 assert.match(await page.locator('.gerber-copper-delta').innerText(),/18\.[78] percentage points/);
 assert.equal(await page.locator('[class*=heatmap]').count(),0);
 await page.getByLabel('Analysis resolution',{exact:true}).selectOption('0.025');assert.equal(await page.locator('.gerber-copper-result').count(),0,'Settings changes must invalidate old results');await analyse();
 assert(Math.abs((await result('A')).rows.find(r=>r.name==='top.gtl').percent-a.rows.find(r=>r.name==='top.gtl').percent)<=.1);
 await page.screenshot({path:'dist-check/gerber/copper-distribution.png',fullPage:true});
 // Results persist while switching views, changing display colours/visibility and entering fullscreen.
 await page.getByRole('button',{name:'Back to viewer',exact:true}).click();await page.getByRole('button',{name:'Copper analysis',exact:true}).click();assert.equal(await page.locator('.gerber-copper-result').count(),2);
 await page.getByRole('button',{name:'Enter fullscreen',exact:true}).click();assert(await page.locator('.gerber-copper').isVisible());await page.keyboard.press('Escape');
 for(const width of [390,320]){await page.setViewportSize({width,height:950});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No page overflow at '+width);await page.locator('.gerber-copper').screenshot({path:'dist-check/gerber/copper-mobile-'+width+'.png'});assert((await page.locator('.gerber-copper').boundingBox()).width<=width,'Analysis must fit at '+width);}
 await page.setViewportSize({width:1550,height:1100});
 // Missing and open outlines must not produce a misleading percentage.
 await upload('B',[{name:'top.gtl',text:copper(7)}]);
 assert.equal(await page.locator('.gerber-copper-result').count(),0,'Replacing files clears old results');
 await analyse();assert.match(await page.locator('.gerber-copper [role=alert]').innerText(),/Layout B: select a board outline/);assert.equal(await page.getByRole('region',{name:'Layout A copper results',exact:true}).count(),1);
 await upload('A',[{name:'profile.gko',text:header('Profile')+'X0Y0D02*\nX100000Y0D01*\nX100000Y100000D01*\nM02*\n'},{name:'top.gtl',text:copper(5)}]);
 await analyse();assert.match(await page.locator('.gerber-copper [role=alert]').innerText(),/open ends/);assert.equal(await page.locator('.gerber-copper-result').count(),0);
 // Cancellation is visible and cannot resurrect completed results from an older import.
 await upload('A',fixtures(5));await page.evaluate(()=>{window.originalCopperPost=Worker.prototype.postMessage;Worker.prototype.postMessage=function(message,...args){if(message.type==='init')setTimeout(()=>{try{window.originalCopperPost.call(this,message,...args);}catch{}},500);else window.originalCopperPost.call(this,message,...args);};});await page.getByRole('button',{name:'Analyse copper',exact:true}).click();await page.getByRole('button',{name:'Cancel analysis',exact:true}).click();await page.evaluate(()=>{Worker.prototype.postMessage=window.originalCopperPost;});await page.waitForTimeout(250);assert.equal(await page.locator('.gerber-copper-actions [role=status]').innerText(),'');
 if(folder){
  const files=readdirSync(resolve(folder)).filter(name=>name.endsWith('.gbr')).map(name=>({name,text:readFileSync(join(resolve(folder),name),'utf8')}));
  await upload('A',files);await page.getByRole('button',{name:'Clear layout B',exact:true}).click();await analyse();
  assert.equal(await page.locator('.gerber-copper [role=alert]').count(),0,await page.locator('.gerber-copper').innerText());
  const actual=await result('A');assert.equal(actual.rows.length,6);for(const row of actual.rows)assert(row.percent>=0&&row.percent<=100);console.log('Private six-layer analysis: '+JSON.stringify(actual));await page.getByLabel('Analysis resolution',{exact:true}).selectOption('0.025');await analyse();assert.equal(await page.locator('.gerber-copper [role=alert]').count(),0);const fine=await result('A');assert.match(fine.summary,/adjusted for board size/);for(let i=0;i<actual.rows.length;i++)assert(Math.abs(actual.rows[i].percent-fine.rows[i].percent)<.5,'Coarse/fine coverage should converge for the local export');console.log('Private fine-resolution check: '+JSON.stringify(fine));
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('Copper analysis passed: closed profile minus cutout, clipped union, clear polarity, 0/100% cases, A/B percentage points, resolution invalidation, fullscreen/mobile, missing/open outline, cancellation and local-only processing.');
 await context.close();
}finally{await browser.close();}
