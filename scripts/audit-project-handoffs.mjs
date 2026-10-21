// Exercise the active-project selectors and explicit Apply path in every receiving calculator.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdirSync,writeFileSync } from 'node:fs';
const base=(process.argv[2]??'http://127.0.0.1:4187').replace(/\/$/,''),out='dist-check/project-handoffs';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:process.env.E2E_CHANNEL??'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1600,height:1050},serviceWorkers:'block'});
await context.addInitScript(()=>localStorage.setItem('pcbplanner:analytics-consent',JSON.stringify({choice:'declined',version:2,updatedAt:new Date().toISOString()})));
const page=await context.newPage(),errors=[],checks=[];page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
const check=(ok,message)=>{assert(ok,message);checks.push(message);console.log('PASS '+message);};
const idle=async()=>{await page.waitForTimeout(150);await page.waitForFunction(()=>!document.querySelector('[data-result-busy="true"]'),null,{timeout:90000});};
const section=()=>page.locator('.properties-section').filter({has:page.getByRole('button',{name:/From KiCad Project/})});
try{
 await page.goto(base+'/kicad-project');await page.getByRole('button',{name:'Try an example',exact:true}).click();await page.getByTestId('example-scenario').waitFor();await page.waitForFunction(()=>document.body.textContent.includes('routing check done'),null,{timeout:90000});
 for(const route of ['/impedance','/trace-loss','/timing','/crosstalk','/interface-rules','/trace-width','/via','/pdn']){
  await page.goto(base+route,{waitUntil:'networkidle'});await idle();
  const source=section();await source.waitFor();const expand=source.locator('button.properties-toggle');if(await expand.getAttribute('aria-expanded')==='false')await expand.click();
  if(route==='/crosstalk'){
   await source.getByRole('combobox',{name:'Aggressor net',exact:true}).selectOption('/PCIE_TX0_P');await source.getByRole('combobox',{name:'Victim net',exact:true}).selectOption('/PCIE_TX0_N');
  }
  const fields=await source.locator('select').evaluateAll(nodes=>nodes.map((select,index)=>({index,label:select.labels?.[0]?.textContent??select.getAttribute('aria-label')??'selection',options:[...select.options].filter(option=>!option.disabled).map(option=>option.value)})));
  for(const field of fields){
   for(const value of field.options){
    const select=source.locator('select').nth(field.index);if(!await select.count())continue;
    const available=await select.locator('option').evaluateAll(nodes=>nodes.filter(node=>!node.disabled).map(node=>node.value));if(!available.includes(value))continue;
    await page.waitForTimeout(300);const before=page.url();await select.selectOption(value);await page.waitForTimeout(350);
    check(page.url()===before,route+' '+field.label+'='+value+' requires explicit Apply');
    const apply=source.getByRole('button',{name:'Apply',exact:true});
    if(await apply.isEnabled()){
     await apply.click();await page.waitForTimeout(500);await idle();
     check(!await page.getByRole('button',{name:'Reset this tool',exact:true}).count(),route+' '+field.label+'='+value+' applies without stopping');
     check(!/\bNaN\b|\bundefined\b|\[object Object\]/.test(await page.locator('main').innerText()),route+' '+field.label+'='+value+' has readable results');
    }
   }
  }
  await page.screenshot({path:out+'/'+route.slice(1)+'.png'});
 }
 check(errors.length===0,'No browser runtime errors: '+errors.join('; '));writeFileSync(out+'/report.json',JSON.stringify({base,checks,errors,passed:true},null,2));console.log(checks.length+' project handoff checks passed');
}catch(error){writeFileSync(out+'/report.json',JSON.stringify({base,checks,errors,passed:false,error:error.stack},null,2));await page.screenshot({path:out+'/failure.png'}).catch(()=>{});console.error(error);process.exitCode=1;}finally{await browser.close();}
