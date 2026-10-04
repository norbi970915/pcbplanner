import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const base=process.argv[2]??'http://127.0.0.1:4182',out=resolve('dist-check/workbench');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1600,height:1050},reducedMotion:'reduce'});
await context.addInitScript(()=>{
 if(!sessionStorage.getItem('pcbtk-settings'))sessionStorage.setItem('pcbtk-settings',JSON.stringify({theme:'dark',unit:'mm'}));
 localStorage.setItem('pcbplanner:analytics-consent',JSON.stringify({choice:'declined',updatedAt:new Date().toISOString()}));
});
const page=await context.newPage(),checks=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text());});
async function visit(route){await page.goto(base+route,{waitUntil:'networkidle'});await page.locator('h1:visible,[role="heading"][aria-level="1"]:visible').first().waitFor();}
async function layout(route){
 const issues=await page.evaluate(()=>{
  const errors=[];if(document.documentElement.scrollWidth>innerWidth+1)errors.push('page overflow');
  const main=document.querySelector('main');if(main.scrollWidth>main.clientWidth+1)errors.push('main overflow');
  for(const label of document.querySelectorAll('.property-field-label'))if(label.scrollWidth>label.clientWidth+1)errors.push('clipped input '+label.textContent);
  for(const svg of document.querySelectorAll('.diagram-svg'))for(const el of svg.querySelectorAll('text')){const b=el.getBBox(),v=svg.viewBox.baseVal;if(b.x<v.x-1||b.y<v.y-1||b.x+b.width>v.x+v.width+1||b.y+b.height>v.y+v.height+1)errors.push('clipped diagram '+el.textContent);}
  return errors;
 });assert.deepEqual(issues,[],route);
}
try {
 await visit('/');
 assert.equal(await page.locator('.welcome-news .news-item').count(),2);
 assert.ok((await page.locator('.welcome-card').boundingBox()).height<400);
 assert.ok((await page.locator('.featured-heading').boundingBox()).y<520);
 await page.getByLabel('Find a tool or guide',{exact:true}).fill('boost');await page.locator('#search-results').waitFor();
 assert.equal(await page.locator('.welcome-news').count(),0);await page.getByRole('button',{name:'Clear search',exact:true}).click();
 checks.push('Compact desktop Home preserves both announcements and search');
 await visit('/buck-converter');
 const handle=page.getByRole('separator',{name:'Resize Properties panel'}),panel=page.locator('.properties-panel');
 const before=(await panel.boundingBox()).width,h=await handle.boundingBox();
 await page.mouse.move(h.x+h.width/2,h.y+100);await page.mouse.down();await page.mouse.move(h.x+h.width/2-100,h.y+100,{steps:10});await page.mouse.up();
 const after=(await panel.boundingBox()).width;assert.ok(after>before+80);await layout('resized buck');
 await page.reload();await handle.waitFor();assert.equal(Math.round((await panel.boundingBox()).width),Math.round(after));
 await handle.focus();await page.keyboard.press('ArrowRight');assert.ok((await panel.boundingBox()).width<after);
 await page.keyboard.press('Home');assert.equal(Math.round((await panel.boundingBox()).width),280);
 await page.keyboard.press('End');assert.equal(Math.round((await panel.boundingBox()).width),520);
 await handle.dblclick();assert.equal(Math.round((await panel.boundingBox()).width),340);
 checks.push('Properties resize with mouse and keyboard; width persists and reset works');
 for(const route of ['/buck-converter','/boost-converter']){
  await visit(route);await page.getByRole('radio',{name:'Switch off',exact:true}).click();assert.equal(await page.locator('[data-current-phase]').getAttribute('data-current-phase'),'off');
  const prior=await page.locator('.diagram-values').innerText();await page.getByLabel('Output load current',{exact:true}).fill(route.includes('buck')?'1.5':'0.7');
  await page.waitForFunction(previous=>document.querySelector('.diagram-values').innerText!==previous,prior);
  await page.locator('.engineering-diagram').screenshot({path:resolve(out,route.slice(1)+'-diagram.png')});
 }
 await visit('/buck-converter?vf=0.4');assert.ok((await page.locator('.diagram-svg').innerHTML()).includes('>D</text>'));
 await visit('/buck-converter?iout=0.001&l=1');assert.equal(await page.locator('[data-current-phase]').count(),0);assert.ok((await page.locator('.diagram-caption').innerText()).includes('outside'));
 checks.push('Buck/boost phase controls, live annotations, diode configuration and topology-only DCM display');
 await visit('/crosstalk?w=0.15&s=0.3');assert.ok((await page.locator('.diagram-values').innerText()).includes('(3 W)'));
 await page.getByLabel(/Edge-to-edge spacing/).fill('0.15');await page.waitForFunction(()=>document.querySelector('.diagram-values').innerText.includes('(2 W)'));
 checks.push('Crosstalk distinguishes edge gap from 3W centre pitch');
 for(const theme of ['dark','light']){
  await page.evaluate(theme=>sessionStorage.setItem('pcbtk-settings',JSON.stringify({theme,unit:'mm'})),theme);
  for(const width of [1600,1024,390,320]){
   await page.setViewportSize({width,height:1050});
   for(const route of ['/','/buck-converter','/boost-converter','/crosstalk','/rc-filter','/stackup','/adc-input','/projects']){
    await visit(route);await layout(theme+' '+width+' '+route);
    if(width<1024&&route!=='/')assert.ok(await page.locator('.mobile-workbench-bar').isVisible());
    if(route==='/'||width>=1024)assert.ok(await page.locator('.mobile-workbench-bar').count()===0||!await page.locator('.mobile-workbench-bar').isVisible());
    if((width===1600||width===390)&&['/','/buck-converter','/rc-filter'].includes(route))await page.screenshot({path:resolve(out,theme+'-'+width+'-'+(route==='/'?'home':route.slice(1))+'.png')});
   }
   checks.push(theme+' at '+width+'px: eight pages, full labels, diagrams and no overflow');console.log(checks.at(-1));
  }
 }
 await page.setViewportSize({width:390,height:900});await visit('/rc-filter');
 const nav=page.getByRole('navigation',{name:'Calculator sections'}),summary=page.locator('.mobile-workbench-summary');
 await summary.locator('strong').first().waitFor();const prev=await summary.innerText();
 await page.getByLabel(/Filter resistor/).fill('2');await page.waitForFunction(prev=>document.querySelector('.mobile-workbench-summary').innerText!==prev,prev);
 const primary=await page.locator('.headline-result [data-copy-value]').first().innerText();assert.ok((await summary.innerText()).includes(primary));
 await nav.getByRole('button',{name:/Results/}).click();
 await page.waitForFunction(()=>document.querySelector('main').getBoundingClientRect().top>=document.querySelector('.mobile-workbench-bar').getBoundingClientRect().bottom-1);
 await nav.getByRole('button',{name:/Inputs/}).click();
 await page.waitForFunction(()=>document.querySelector('#tool-inputs').getBoundingClientRect().top>=document.querySelector('.mobile-workbench-bar').getBoundingClientRect().bottom-1);
 await page.locator('.mobile-workbench-bar').screenshot({path:resolve(out,'mobile-summary.png')});
 checks.push('Mobile summary follows live values and Inputs/Results navigation keeps the selected section clear of the sticky controls');
 await visit('/rc-filter?r=0');await page.waitForFunction(()=>document.querySelector('.mobile-workbench-summary').innerText.includes('Check inputs'));
 await visit('/guides/pcb-crosstalk-3w-rule');assert.equal(await page.locator('.mobile-workbench-bar').count(),0);
 checks.push('Invalid inputs replace the summary; guide pages keep their article layout');
 assert.deepEqual(errors,[]);writeFileSync(resolve(out,'report.json'),JSON.stringify({base,checks,errors},null,2));console.log('PASS '+checks.length+' workbench checks');
} catch(error){await page.screenshot({path:resolve(out,'failure.png'),fullPage:true});console.error(error);process.exitCode=1;}finally{await browser.close();}
