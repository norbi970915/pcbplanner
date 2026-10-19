import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
const base=process.argv[2]??'http://127.0.0.1:4180';
assert.equal(new URL(base).hostname,'127.0.0.1','Run storage cleanup checks on a local preview only.');
assert(!readFileSync('public/sitemap.xml','utf8').includes('/projects'));
assert(!existsSync('dist/projects.html')); assert(!existsSync('dist/og/projects.png'));
assert(!readdirSync('dist/assets').some(name=>/^Projects-.*\.js$/.test(name)));
const custom={id:'custom-retained',name:'Retained stackup',builtin:false,layers:[{id:'l1',name:'L1',kind:'copper',role:'signal',t:0.035},{id:'d',name:'Core',kind:'dielectric',t:0.2,er:4,df:0.015},{id:'l2',name:'L2',kind:'copper',role:'plane',t:0.035}]};
mkdirSync('dist-check/project-removal',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const context=await browser.newContext({viewport:{width:1500,height:1050},serviceWorkers:'block'});
 context.setDefaultTimeout(15000);
 await context.addInitScript(custom=>{
  if(sessionStorage.getItem('removal-audit-seeded'))return;
  sessionStorage.setItem('removal-audit-seeded','1');
  localStorage.setItem('pcbplanner:analytics-consent',JSON.stringify({choice:'declined',version:2,updatedAt:new Date().toISOString()}));
  localStorage.setItem('pcbtk-projects',JSON.stringify([{id:'old',name:'Old board',tools:[]}]));
  localStorage.setItem('pcbtk-project-active','old');
  localStorage.setItem('pcbtk-favorites',JSON.stringify(['/projects','/active-filter']));
  localStorage.setItem('pcbtk-stackups',JSON.stringify([custom]));
  sessionStorage.setItem('pcbtk-tabs',JSON.stringify(['/','/projects','/active-filter']));
  sessionStorage.setItem('pcbtk-settings',JSON.stringify({unit:'mm',theme:'dark'}));
 },custom);
 const page=await context.newPage(),errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(/^https?:/.test(r.url())&&new URL(r.url()).origin!==new URL(base).origin)external.push(r.url());});
 const go=path=>page.goto(base+path,{waitUntil:'networkidle'});
 await go('/'); await page.locator('#home-search').waitFor();
 const state=await page.evaluate(()=>({projects:localStorage.getItem('pcbtk-projects'),active:localStorage.getItem('pcbtk-project-active'),favorites:JSON.parse(localStorage.getItem('pcbtk-favorites')),tabs:JSON.parse(sessionStorage.getItem('pcbtk-tabs')),stackups:JSON.parse(localStorage.getItem('pcbtk-stackups'))}));
 assert.equal(state.projects,null);assert.equal(state.active,null);
 assert.deepEqual(state.favorites,['/active-filter']);assert(!state.tabs.includes('/projects'));assert.deepEqual(state.stackups,[custom]);
 const noProjects=async()=>{
  assert.equal(await page.locator('a[href="/projects"]').count(),0);
  assert.equal(await page.locator('.home-project-start,.project-save-bar,.active-project-navigation').count(),0);
  // the KiCad project (one loaded board, /kicad-project) is a different feature and may be named
  assert(!/\bprojects?\b/i.test((await page.locator('body').innerText()).replace(/KiCad projects?|projects? (folder|files?)/gi,'')));
 };
 for(const path of ['/','/tools','/about','/privacy','/active-filter','/impedance','/s-parameter-viewer']) {await go(path);await noProjects();}
 await go('/active-filter');
 await page.getByRole('button',{name:'File',exact:true}).click();
 assert.equal(await page.getByRole('menuitem',{name:/project/i}).count(),0);
 assert(await page.getByRole('menuitem',{name:'Copy Link to Inputs',exact:true}).isVisible());
 assert(await page.getByRole('menuitem',{name:/Calculation report/}).isVisible());
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Create calculation report',exact:true}).first().click();
 await page.getByRole('dialog').waitFor();
 await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({state:'detached'});
 await go('/active-filter?fc=2400&order=2');
 assert((await page.locator('body').innerText()).includes('Active Filter'));
 assert.equal(new URL(page.url()).searchParams.get('fc'),'2400');
 await go('/stackup?id=custom-retained');
 assert.equal(await page.locator('#lsm-s').inputValue(),'custom-retained');
 await go('/projects');await page.getByRole('heading',{name:'Page not found',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:/Create.*project/i}).count(),0);
 for(const theme of ['dark','light']) {
  await page.evaluate(theme=>sessionStorage.setItem('pcbtk-settings',JSON.stringify({unit:'mm',theme})),theme);
  for(const width of [1500,390,320]) {
   await page.setViewportSize({width,height:950});
   for(const path of ['/','/active-filter','/about']) {
    await go(path);await noProjects();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,width+'px overflow: '+path);
   }
  }
 }
 await page.setViewportSize({width:1500,height:1050});await go('/');
 await page.screenshot({path:'dist-check/project-removal/home-desktop.png'});
 await page.setViewportSize({width:390,height:900});await go('/active-filter');
 await page.screenshot({path:'dist-check/project-removal/calculator-mobile.png'});
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('PASS: removed project UI/routes/assets, cleared project records/tabs, retained favorites and stackups, working calculator links and reports, desktop/mobile in both themes.');
} finally {await browser.close();}
