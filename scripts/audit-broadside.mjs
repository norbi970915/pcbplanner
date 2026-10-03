import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const base = process.argv[2] ?? 'http://127.0.0.1:4180';
const out = resolve('dist-check/broadside');
mkdirSync(out, {recursive:true});
const browser = await chromium.launch({channel:'msedge',headless:true});
const errors = [], checks = [];
const context = await browser.newContext({viewport:{width:1600,height:1050}, permissions:['clipboard-read','clipboard-write']});
await context.addInitScript(() => {
  if(!sessionStorage.getItem('pcbtk-settings')) sessionStorage.setItem('pcbtk-settings', JSON.stringify({theme:'dark',unit:'mm'}));
  localStorage.setItem('pcbplanner:analytics-consent', JSON.stringify({choice:'declined',updatedAt:new Date().toISOString()}));
});
const page = await context.newPage();
page.on('pageerror', e=>errors.push(e.message));
page.on('console', m=> { if(m.type()==='error') errors.push(m.text()); });
const big = page.locator('.headline-result').first();
const z = async () => Number(await big.locator('[data-copy-value]').textContent());
async function ready() {
  await page.waitForFunction(() => {
    const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Solve Width');
    const value=Number(document.querySelector('.headline-result [data-copy-value]')?.textContent);
    return button && !button.disabled && Number.isFinite(value) && value>0;
  }, undefined, {timeout:30000});
}
async function goto(query) {
  await page.goto(base+'/impedance?'+query);
  await ready();
}
async function noOverflow() {
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.ok(await page.evaluate(()=> {
    const main=document.querySelector('main');
    return !main || main.scrollWidth<=main.clientWidth+1;
  }));
}
try {
  await goto('type=microstrip&mode=diff&s=0.127&w=0.145&h=0.0994&t=0.04064&target=85');
  assert.equal(await page.getByLabel('Pair coupling',{exact:true}).inputValue(),'edge');
  const legacy=await z();
  assert.ok(Math.abs(legacy-85.21)<0.15, 'legacy coated-microstrip reference');
  checks.push('Existing edge-coupled reference unchanged');

  await page.getByLabel('Pair coupling',{exact:true}).selectOption('broadside');
  await ready();
  const gapInput=page.getByLabel(/Inter-layer gap/).first();
  assert.ok(await gapInput.isVisible());
  assert.equal(await page.getByLabel('Line type',{exact:true}).count(),0);
  const section=page.getByRole('img',{name:/Broadside differential pair/});
  assert.equal(await section.locator('polygon').count(),2);
  await page.waitForFunction(()=>new URLSearchParams(location.search).get('coupling')==='broadside');
  const shared=page.url(), initial=await z();
  await page.reload(); await ready();
  assert.equal(await z(),initial);
  assert.equal(page.url(),shared);
  checks.push('Coupling control, two-layer diagram, URL sharing and reload');

  await page.getByLabel('Target Zdiff',{exact:true}).fill('100');
  await page.getByRole('button',{name:'Solve Width',exact:true}).click();
  await ready();
  await page.waitForFunction(()=>Math.abs(Number(document.querySelector('.headline-result [data-copy-value]')?.textContent)-100)<0.06,undefined,{timeout:30000});
  await ready();
  assert.ok(Math.abs(await z()-100)<0.06);
  const solvedWidth=Number(await page.getByLabel(/Width /).inputValue());
  assert.ok(solvedWidth>0 && Math.abs(solvedWidth-0.145)>0.005);
  await page.getByLabel('Target Zdiff',{exact:true}).fill('110');
  await page.getByRole('button',{name:'Solve Spacing',exact:true}).click();
  await ready();
  await page.waitForFunction(()=>Math.abs(Number(document.querySelector('.headline-result [data-copy-value]')?.textContent)-110)<0.06,undefined,{timeout:30000});
  await ready();
  assert.ok(Math.abs(await z()-110)<0.06);
  const solvedGap=Number(await gapInput.inputValue());
  assert.ok(solvedGap>0.127);
  checks.push('Width and vertical-spacing worker solves reach targets');

  await page.getByRole('radio',{name:'Field',exact:true}).click();
  const canvas=page.getByLabel('Equipotential plot of the electric field',{exact:true});
  await canvas.waitFor();
  const colors=await canvas.evaluate(cv=> {
    const ctx=cv.getContext('2d'),d=ctx.getImageData(0,0,cv.width,cv.height).data;
    let upperBlue=0,lowerRed=0;
    for(let y=0;y<cv.height;y++) for(let x=0;x<cv.width;x++) {
      const k=(y*cv.width+x)*4;
      if(y<cv.height/2 && d[k+2]>d[k]+20)upperBlue++;
      if(y>cv.height/2 && d[k]>d[k+2]+20)lowerRed++;
    }
    return {upperBlue,lowerRed};
  });
  assert.ok(colors.upperBlue>1000 && colors.lowerRed>1000);
  checks.push('Odd field has opposite polarities vertically');
  await page.screenshot({path:resolve(out,'field-desktop.png'),fullPage:true});

  await goto('mode=diff&coupling=broadside&type=stripline&dl=0.04:3,0.06:4&er2=5&tolEnabled=1&tolW=0.005&tolS=0.005&tolH=3&tolDk=3&target=100');
  await page.getByText('Corner check',{exact:true}).waitFor({timeout:30000});
  assert.ok((await page.getByText(/16 combinations of the entered endpoints/).count())===1);
  assert.equal(await page.getByLabel(/Ply [12] material/).count(),2);
  checks.push('Mirrored multi-Dk outer plies and 16 fabrication corners');

  for(const theme of ['dark','light']) for(const width of [1600,390,320]) {
    await page.setViewportSize({width,height:1050});
    await page.evaluate(theme=>{sessionStorage.setItem('pcbtk-settings',JSON.stringify({theme,unit:'mm'}));},theme);
    await page.reload(); await ready();
    await page.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme);
    await page.getByText('Corner check',{exact:true}).waitFor({timeout:30000});
    await noOverflow();
    await page.getByRole('img',{name:/Broadside differential pair/}).scrollIntoViewIfNeeded();
    await page.screenshot({path:resolve(out,theme+'-'+width+'.png'),fullPage:true});
  }
  checks.push('Both themes at desktop, 390 px and 320 px with no overflow');

  await page.setViewportSize({width:1600,height:1050});
  await page.evaluate(()=>sessionStorage.setItem('pcbtk-settings',JSON.stringify({theme:'dark',unit:'mil'})));
  await goto('mode=diff&coupling=broadside');
  assert.ok(Math.abs(Number(await page.getByLabel(/Inter-layer gap/).first().inputValue())-0.15/0.0254)<0.001);
  await ready();
  const mmImpedance=await z();
  await page.getByLabel(/Inter-layer gap/).first().fill('7');
  await page.waitForFunction(()=>Math.abs(Number(new URLSearchParams(location.search).get('s'))-7*0.0254)<1e-6);
  await ready();
  assert.ok(await z()>mmImpedance);
  checks.push('Mil inputs convert vertical spacing correctly');
  await page.evaluate(()=>sessionStorage.setItem('pcbtk-settings',JSON.stringify({theme:'dark',unit:'mm'})));
  await goto('mode=diff&coupling=broadside');
  await page.getByRole('radio',{name:'Single-ended',exact:true}).click();
  await ready();
  assert.equal(await page.getByLabel('Pair coupling',{exact:true}).count(),0);
  assert.ok(await page.getByLabel('Line type',{exact:true}).isVisible());
  await goto('mode=diff&coupling=broadside');
  await page.getByRole('button',{name:'Apply',exact:true}).click();
  await ready();
  assert.equal(await page.getByLabel('Pair coupling',{exact:true}).inputValue(),'edge');
  checks.push('Single-ended and stackup apply correctly return to supported geometry');

  await page.goto(base+'/impedance?mode=diff&coupling=broadside&s=0');
  await page.getByText('Spacing S must be greater than 0.',{exact:true}).waitFor();
  assert.ok(await page.getByRole('button',{name:'Solve Width',exact:true}).isDisabled());
  checks.push('Invalid gap produces a clear error and disables target solving');
} catch(error) {
  await page.screenshot({path:resolve(out,'failure.png'),fullPage:true});
  console.error(await page.locator('main').innerText());
  throw error;
} finally {
  await browser.close();
  writeFileSync(resolve(out,'report.json'),JSON.stringify({base,checks,errors},null,2));
}
assert.deepEqual(errors,[]);
console.log(JSON.stringify({base,checks,errors},null,2));
