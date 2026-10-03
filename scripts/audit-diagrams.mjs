import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const base=process.argv[2]??'http://127.0.0.1:4180';
const out=resolve('dist-check/diagrams');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1600,height:1050}});
await context.addInitScript(()=>{
  if(!sessionStorage.getItem('pcbtk-settings')) sessionStorage.setItem('pcbtk-settings',JSON.stringify({theme:'dark',unit:'mm'}));
  localStorage.setItem('pcbplanner:analytics-consent',JSON.stringify({choice:'declined',updatedAt:new Date().toISOString()}));
});
const page=await context.newPage(), errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text());});
async function visit(route) {
  await page.goto(base+route,{waitUntil:'networkidle'});
  await page.locator('.diagram-svg').first().waitFor();
}
async function checkLayout(route) {
  const issues=await page.evaluate(()=>{
    const problems=[];
    if(document.documentElement.scrollWidth>innerWidth+1)problems.push('page overflow');
    const main=document.querySelector('main');if(main.scrollWidth>main.clientWidth+1)problems.push('main overflow');
    for(const svg of document.querySelectorAll('.diagram-svg')) {
      const vb=svg.viewBox.baseVal;
      for(const text of svg.querySelectorAll('text')) {
        const b=text.getBBox();
        if(b.x<vb.x-1||b.y<vb.y-1||b.x+b.width>vb.x+vb.width+1||b.y+b.height>vb.y+vb.height+1)problems.push('clipped label '+text.textContent);
      }
      for(const el of svg.querySelectorAll('[fill^="url("], [marker-start^="url("], [marker-end^="url("]')) {
        for(const attr of ['fill','marker-start','marker-end']) {
          const val=el.getAttribute(attr);if(val?.startsWith('url(#')&&!document.getElementById(val.slice(5,-1)))problems.push('missing paint '+val);
        }
      }
      if(!svg.getAttribute('aria-label'))problems.push('missing drawing description');
    }
    const ids=[...document.querySelectorAll('.diagram-svg [id]')].map(e=>e.id);
    if(new Set(ids).size!==ids.length)problems.push('duplicate drawing paint IDs');
    for(const value of document.querySelectorAll('.diagram-values dd'))if(parseFloat(getComputedStyle(value).fontSize)<12)problems.push('small dimension value');
    return problems;
  });assert.deepEqual(issues,[],route);
}
try {
  const routes=['/impedance?mode=diff&w=0.145&s=0.127&h=0.0994&t=0.04064&target=85','/impedance?mode=diff&coupling=broadside','/trace-loss','/rc-filter','/thermal-vias?padW=6&padH=3','/padstack'];
  if(!process.argv.includes('--variants')) for(const theme of ['dark','light']) {
    await page.goto(base);
    await page.evaluate(theme=>sessionStorage.setItem('pcbtk-settings',JSON.stringify({theme,unit:'mm'})),theme);
    for(const width of [1600,390,320]) {
      await page.setViewportSize({width,height:1050});
      for(const [i,route] of routes.entries()) {
        await visit(route);await page.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme);
        await checkLayout(route);
        await page.locator('.engineering-diagram').first().scrollIntoViewIfNeeded();
        await page.screenshot({path:resolve(out,theme+'-'+width+'-'+i+'.png'),fullPage:true});
        if(width===1600)await page.locator('.engineering-diagram').first().screenshot({path:resolve(out,theme+'-diagram-'+i+'.png')});
      }
      checks.push(theme+' at '+width+'px: six pages, SVG labels, descriptions, paint IDs, readable values and no overflow');
      console.log(checks.at(-1));
    }
  }
  await page.setViewportSize({width:1600,height:1050});
  for(const geometry of ['type=embedded&mode=single&h=0.2&h2=0.3','type=stripline&mode=diff&h=0.15&h2=0.2','type=microstrip&cpw=1&mode=single','type=microstrip&cpw=1&mode=diff&w=2&s=0.01&gap=1','type=microstrip&w=0.01&t=0.005&h=0.01','type=stripline&mode=diff&coupling=broadside&w=1&s=0.001&h=0.5']) {
    await visit('/impedance?'+geometry);await checkLayout(geometry);
  }
  checks.push('Embedded, stripline, single/differential coplanar and thin-feature cross-sections retain all annotations');
  await visit('/impedance?mode=diff&w=0.145&s=0.127&h=0.0994&t=0.04064&target=85');
  await page.waitForFunction(()=>Number(document.querySelector('.headline-result [data-copy-value]')?.textContent)>0);
  assert.ok(Math.abs(Number(await page.locator('.headline-result [data-copy-value]').first().textContent())-85.21)<.15);
  await page.getByLabel(/Width /).first().fill('0.2');
  await page.waitForFunction(()=>[...document.querySelectorAll('.diagram-values dd')].some(el=>el.textContent==='0.2 mm'));
  checks.push('Existing 85-ohm field-solver reference and live width annotation');
  await visit('/rc-filter?kind=highpass&rs=50&rl=10000');
  assert.ok(await page.getByRole('img',{name:/High-pass: source resistance/}).isVisible());
  assert.ok((await page.locator('.diagram-values').innerText()).includes('10 k'));
  await page.getByLabel('Response',{exact:true}).selectOption('lowpass');
  await page.getByRole('img',{name:/Low-pass: source resistance/}).waitFor();
  checks.push('High-pass and low-pass circuitry, source and load annotations');
  await visit('/thermal-vias?padW=6&padH=3&n=12');
  const ratio=await page.locator('[data-thermal-pad]').evaluate(el=>Number(el.getAttribute('width'))/Number(el.getAttribute('height')));
  assert.equal(ratio,2);assert.equal(await page.locator('[data-thermal-via]').count(),12);
  await page.getByLabel('Thermal pad width',{exact:true}).fill('3');
  await page.waitForFunction(()=>{const el=document.querySelector('[data-thermal-pad]');return Number(el.getAttribute('width'))===Number(el.getAttribute('height'));});
  await visit('/thermal-vias?n=500&fill=copper');
  assert.equal(await page.locator('[data-thermal-via]').count(),400);
  assert.ok((await page.locator('.diagram-caption').innerText()).includes('400 of 500'));
  await visit('/thermal-vias?padW=0');assert.equal(await page.locator('[data-thermal-pad]').count(),0);
  checks.push('Thermal pad aspect ratio follows edited inputs; capped arrays and unset pad dimensions are described accurately');
  await visit('/padstack?lead=rect&spokes=6');
  assert.equal(await page.locator('.engineering-diagram').count(),4);
  assert.ok((await page.locator('.diagram-values').first().innerText()).includes('Pad side'));
  const sizes=await page.locator('.diagram-values dd').allTextContents();
  await page.getByLabel(/Max lead width/).fill('1');
  await page.waitForFunction(prev=>JSON.stringify([...document.querySelectorAll('.diagram-values dd')].map(e=>e.textContent))!==JSON.stringify(prev),sizes);
  await checkLayout('/padstack rectangular');
  checks.push('Four square-pad views, six-spoke relief and annotations follow edited lead dimensions');
  await page.evaluate(()=>sessionStorage.setItem('pcbtk-settings',JSON.stringify({theme:'light',unit:'mil'})));
  await visit('/thermal-vias?padW=6&padH=3');
  assert.ok((await page.locator('.diagram-values').innerText()).includes('mil'));
  assert.ok((await page.locator('.diagram-values').innerText()).includes('236'));
  checks.push('Diagram dimensions follow the global mm/mil setting');
  assert.deepEqual(errors,[]);
  writeFileSync(resolve(out,'report.json'),JSON.stringify({base,checks,errors},null,2));
  console.log('PASS '+checks.length+' diagram checks');
} catch(error) {
  await page.screenshot({path:resolve(out,'failure.png'),fullPage:true});
  console.error(error);process.exitCode=1;
} finally {await browser.close();}
