import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import ts from 'typescript';
const base = process.argv[2] ?? 'http://127.0.0.1:4180';
assert.equal(new URL(base).hostname, '127.0.0.1', 'Run storage checks on a local preview only.');
const compiled = ts.transpileModule(readFileSync('src/data/fabStackups.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const { FAB_STACKUPS } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const defaultId = 'std-6l-16-1080-2';
const removedId = 'pcbplanner-v1-6l-1600-close';
const flexIds = ['flex-2l-50','flex-2l-100','flex-2l-150','rf-4l-2f','rf-6l-2f','rf-8l-4f'];
const seed = {id:'custom-existing',name:'Existing custom construction',builtin:false,layers:[
  {id:'custom-l1',kind:'copper',name:'L1',t:0.035,role:'signal'},
  {id:'custom-core',kind:'dielectric',name:'My core',t:0.2,er:4,df:0.015},
  {id:'custom-l2',kind:'copper',name:'L2',t:0.035,role:'plane'},
]};
mkdirSync('dist-check/stackup-library',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const context=await browser.newContext({viewport:{width:1500,height:1050},serviceWorkers:'block'});
  await context.addInitScript(({seed,removedId})=>{
    localStorage.setItem('pcbplanner:analytics-consent',JSON.stringify({choice:'declined',version:2,updatedAt:new Date().toISOString()}));
    if(!localStorage.getItem('pcbtk-stackups'))localStorage.setItem('pcbtk-stackups',JSON.stringify([seed]));
    if(!sessionStorage.getItem('stackup-library-audit')) {
      sessionStorage.setItem('stackup-library-audit','1');
      sessionStorage.setItem('pcbplanner:stackup-manager:selected',removedId);
      sessionStorage.setItem('pcbplanner:stackup-manager:draft:'+removedId,JSON.stringify({...seed,id:removedId,builtin:true}));
    }
  },{seed,removedId});
  context.setDefaultTimeout(15000);
  const page=await context.newPage(),errors=[],external=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(/^https?:/.test(request.url())&&new URL(request.url()).origin!==new URL(base).origin)external.push(request.url());});
  const go=path=>page.goto(base+path,{waitUntil:'networkidle'});
  const chooser=page.locator('#lsm-s');
  await go('/stackup'); await chooser.waitFor();
  assert.equal(await chooser.inputValue(),defaultId,'Removed session-only selection should return to the restored default.');
  const options=await chooser.locator('option').evaluateAll(options=>options.map(o=>o.value));
  assert.deepEqual(options,[...FAB_STACKUPS.map(s=>s.id),...flexIds,seed.id]);
  assert.equal(options.length,185);
  assert((await page.locator('body').innerText()).includes('178 rigid FR-4 stackups plus 6 flex'));
  await chooser.selectOption('std-4l-8-1080-2');
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('input[aria-label="Layer name"]')).some(i=>i.value==='Core 0.10 mm'));
  const names=await page.getByLabel('Layer name',{exact:true}).evaluateAll(inputs=>inputs.map(i=>i.value));
  assert(names.includes('Prepreg 1080')&&names.includes('Prepreg 7628')&&names.includes('Core 0.10 mm'));
  await page.getByRole('button',{name:'Impedance →',exact:true}).first().click();
  await page.waitForURL('**/impedance?*');
  const q=new URL(page.url()).searchParams;
  assert.equal(Number(q.get('h')),0.2944);
  assert.equal(Number(q.get('t')),0.035);
  assert.equal(q.get('dl'),'0.2104:4.4,0.084:3.91');
  for(const id of flexIds) {
    await go('/stackup?id='+id); await chooser.waitFor();
    assert.equal(await chooser.inputValue(),id);
    assert((await page.locator('body').innerText()).includes('Polyimide core'));
    if(id.startsWith('rf-')) {
      await page.locator('#lsm-region').selectOption('flex');
      assert((await page.locator('body').innerText()).includes('coverlay'));
      await page.locator('#lsm-region').selectOption('rigid');
    }
  }
  await go('/stackup?id='+seed.id); await chooser.waitFor();
  await page.getByLabel('L1 thickness (mm)',{exact:true}).fill('0.04');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.getByLabel('L1 thickness (mm)',{exact:true}).inputValue(),'0.04');
  await go('/stackup?id='+removedId);
  await page.locator('#missing-stackup').waitFor();
  assert.equal(await chooser.count(),0);
  await page.getByRole('button',{name:'Recover this tab’s draft',exact:true}).click();
  await chooser.waitFor();
  assert((await chooser.inputValue()).startsWith('custom-'));
  assert.equal(await page.getByLabel('L1 thickness (mm)',{exact:true}).inputValue(),'0.035');
  await go('/stackup?id=unknown-without-draft');
  await page.locator('#missing-stackup').waitFor();
  await page.locator('input[type=file]').setInputFiles({name:'saved.stackup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'pcbplanner',type:'stackup',version:1,stackup:seed}))});
  await chooser.waitFor();
  assert.equal(await page.getByLabel('L1 thickness (mm)',{exact:true}).inputValue(),'0.035');
  await go('/interface-rules?stk='+defaultId);
  await page.locator('#ir-stk').waitFor();
  assert.equal(await page.locator('#ir-stk').inputValue(),defaultId);
  await page.locator('#tool-panel').getByText('Trace width',{exact:true}).waitFor();
  await go('/interface-rules?stk='+removedId);
  await page.locator('#ir-stk').waitFor();
  assert.equal(await page.locator('#ir-stk').inputValue(),'');
  assert((await page.getByRole('alert').innerText()).includes('selected stackup is unavailable'));
  await go('/stackup-advisor?reqs=%5B%5D&lmin=6&lmax=6&tmin=1.6&tmax=1.6');
  await page.getByRole('button',{name:/Find Stackups/i}).click();
  await page.getByText(/6L 1.6 mm/).first().waitFor();
  assert((await page.locator('#tool-panel').innerText()).includes('1080 prepreg'));
  await go('/guides/choosing-a-pcb-stackup');
  await page.getByRole('heading',{name:/How to Choose a PCB Stackup/}).waitFor();
  assert((await page.locator('body').innerText()).includes('7628'));
  await page.getByRole('link',{name:/Browse and edit stackups in the Layer Stack Manager/}).click();
  await chooser.waitFor();
  for(const width of [1500,390,320]) {
    await page.setViewportSize({width,height:950});
    for(const path of ['/stackup?id='+defaultId,'/stackup?id=rf-6l-2f','/guides/choosing-a-pcb-stackup']) {
      await go(path);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,width+'px overflow on '+path);
    }
  }
  await page.setViewportSize({width:1500,height:1050});
  await go('/stackup?id='+defaultId);
  await page.screenshot({path:'dist-check/stackup-library/rigid-desktop.png'});
  await go('/stackup?id=rf-6l-2f');
  await page.screenshot({path:'dist-check/stackup-library/rigid-flex-desktop.png'});
  assert.deepEqual(errors,[]); assert.deepEqual(external,[]);
  console.log('PASS: all 178 rigid + 6 flex/rigid-flex presets, exact prepreg names, impedance handoff, saved custom edits, removed-ID recovery, JSON import, Interface Rules, advisor, guides and responsive layout.');
} finally {await browser.close();}
