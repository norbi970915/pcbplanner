// Every tool's help, result-copy buttons, report dialog and favorite action, plus local tool actions.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const base = (process.argv[2] ?? 'http://127.0.0.1:4186').replace(/\/$/, ''), out = process.argv[3] ?? 'dist-check/actions'; mkdirSync(out, { recursive: true });
const routes = process.env.ONLY?.split(',') ?? [...readFileSync('src/tools/registry.ts','utf8').matchAll(/^\s*path:\s*'([^']+)'/gm)].map(m => m[1]);
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge', headless: true });
const report = { base, routes: [], failures: [], checks: 0 };
let page, route, errors;
const check = (ok,message) => { report.checks++; assert(ok, route + ': ' + message); };
const idle = async () => { await page.waitForTimeout(100); await page.waitForFunction(() => !!document.querySelector('[data-inputs-invalid="true"]') || ![...document.querySelectorAll('[data-result-busy="true"]')].some(el => el.getClientRects().length), null, { timeout: 90000 }); };
const clean = async step => { check(!errors.length, step + ': ' + errors.join('; ')); check(!await page.getByRole('button',{ name:'Reset this tool',exact:true }).count(), step + ': tool stopped'); };
async function fresh() {
  if (page.url().startsWith(base)) await page.evaluate(path => { sessionStorage.removeItem('pcbplanner:tool:'+path); sessionStorage.removeItem('pcbplanner:comparison:'+path); },route);
  await page.goto(base + route, { waitUntil: 'networkidle' }); await idle();
  for (let i=0;i<30;i++) { const t = page.locator('aside.order-first button.properties-toggle[aria-expanded="false"]').first(); if (!await t.count()) break; await t.click(); }
}
try {
  for (route of routes) {
    console.log('ROUTE ' + route); const entry = { route, copied: [], help: [], actions: [], report: '', failures: [] }; report.routes.push(entry);
    const context = await browser.newContext({ viewport: { width: 1600, height: 1050 }, serviceWorkers:'block', acceptDownloads:true });
    await context.addInitScript(() => localStorage.setItem('pcbplanner:analytics-consent', JSON.stringify({choice:'declined',version:2,updatedAt:new Date().toISOString()})));
    await context.grantPermissions(['clipboard-read','clipboard-write']);
    page = await context.newPage(); page.setDefaultTimeout(20000); errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('dialog',d=>d.accept());
    try {
      await fresh();
      const help = page.locator('.field-help-trigger:visible');
      for (let i=0;i<await help.count();i++) {
        const label = await help.nth(i).getAttribute('aria-label'); await help.nth(i).click();
        const popup = page.locator('.field-help-popover:visible'); await popup.waitFor();
        check((await popup.innerText()).length > 15,label + ' opens explanatory text');
        if (i%2) await page.keyboard.press('Escape'); else await popup.getByRole('button',{name:'Close field help',exact:true}).click();
        await popup.waitFor({state:'hidden'}); entry.help.push(label);
      }
      const copies = page.locator('main .copy-result:visible:not(:disabled)');
      for (let i=0;i<await copies.count();i++) {
        const button = copies.nth(i), expected = await button.evaluate(el=>{
          const row=el.closest('[data-copy-result]'), clean=t=>(t??'').replace(/\s+/g,' ').trim();
          const label=clean(row.querySelector('[data-copy-label]')?.textContent),value=clean(row.querySelector('[data-copy-value]')?.textContent),unit=clean(row.querySelector('[data-copy-unit]')?.textContent);
          return `${label}: ${value}${unit?' '+unit:''}`;
        });
        await button.click(); await page.waitForFunction(expected=>navigator.clipboard.readText().then(value=>value===expected), expected);
        check(await button.getAttribute('aria-label')==='Copied','Copy result confirmation'); entry.copied.push(expected);
      }
      const favorite = page.locator('main .favorite-button:visible');
      if (await favorite.count()) { const before=await favorite.getAttribute('aria-pressed'); await favorite.click(); check(await favorite.getAttribute('aria-pressed')!==before,'Favorite toggles'); await favorite.click(); check(await favorite.getAttribute('aria-pressed')===before,'Favorite toggles back'); entry.actions.push('Favorite on/off'); }
      const compare = page.getByRole('button',{name:'Compare',exact:true}).filter({visible:true}).first();
      if (await compare.count() && await compare.isEnabled()) {
        await compare.click(); const panel=page.getByRole('region',{name:'Design comparison',exact:true});
        // A labelled section has the implicit region role.
        await panel.waitFor(); await panel.getByRole('button',{name:'Replace A with current',exact:true}).click();
        await panel.getByRole('button',{name:'Restore A',exact:true}).click(); await idle();
        await panel.getByRole('button',{name:'Close comparison',exact:true}).click(); await panel.waitFor({state:'hidden'}); entry.actions.push('Compare, replace, restore, close');
      }
      const trigger=page.getByRole('button',{name:'Create calculation report',exact:true});
      if (await trigger.count()) {
        await trigger.click(); const dialog=page.getByRole('dialog',{name:'Calculation report',exact:true});
        await dialog.waitFor(); await page.waitForFunction(()=>!document.querySelector('.report-blocked [role="status"]') && !document.body.textContent.includes('Preparing project report'),null,{timeout:90000});
        if (await dialog.locator('.report-blocked').count()) entry.report='Blocked as expected: '+await dialog.locator('.report-blocked').innerText();
        else {
          await dialog.getByLabel('Report title',{exact:true}).fill('Audit <title> & "quote"');
          await dialog.getByLabel(/Design notes/).fill('Control audit <script>window.auditInjected=true</script> & notes');
          for (const label of ['Diagrams and plots','Method and references','A/B comparison']) {
            const cb=dialog.getByRole('checkbox',{name:label,exact:true}); if (await cb.count()) { const before=await cb.isChecked(); await cb.setChecked(!before); check(await cb.isChecked()!==before,label+' toggles'); await cb.setChecked(before); }
          }
          const frame=page.frameLocator('iframe[title="Calculation report preview"]'); await frame.locator('h1').filter({hasText:'Audit <title>'}).waitFor();
          check(!await frame.locator('script').count(),'Report title and notes remain escaped text');
          check((await frame.locator('body').innerText()).includes('Control audit <script>'),'Report notes are retained as text');
          const download=page.waitForEvent('download'); await dialog.getByRole('button',{name:'Save HTML',exact:true}).click();
          const file=await download; const html=readFileSync(await file.path(),'utf8'); check(html.includes('&lt;script&gt;')&&!html.includes('<script>window.auditInjected'),'Saved HTML escapes notes');
          const handle=await page.locator('iframe[title="Calculation report preview"]').elementHandle(), child=await handle.contentFrame();
          await child.evaluate(()=>{window.print=()=>{window.auditPrintCalled=true;};});
          await dialog.getByRole('button',{name:'Print / Save PDF',exact:true}).click(); check(await child.evaluate(()=>window.auditPrintCalled===true),'Print action reaches report document');
          entry.report='Title, notes, options, escaped HTML download and print passed';
        }
        await dialog.getByRole('button',{name:'Close report',exact:true}).click(); await dialog.waitFor({state:'hidden'});
      }
      // Test native file buttons via the chooser, and local action buttons from the default view.
      await fresh();
      const local = await page.locator('main button:visible,aside.order-first button:visible').evaluateAll(buttons=>{const counts=new Map();return buttons.filter(b=>!b.disabled&&!b.closest('.tool-actions')&&!b.matches('.copy-result,.properties-toggle,.field-help-trigger,.favorite-button,.comparison-trigger')&&b.getAttribute('role')!=='radio'&&!b.closest('[aria-label="Project views"]')).map((b,i)=>{const label=b.getAttribute('aria-label')||b.textContent.trim(),ordinal=counts.get(label)||0;counts.set(label,ordinal+1);return {i,label,ordinal,title:b.title};});});
      for (const item of local) {
        // Each dynamic row action is exercised once from a fresh model; clicking a row's Use never invalidates the remaining inventory.
        await fresh(); const buttons=page.locator('main button:visible,aside.order-first button:visible');
        const action=buttons.filter({hasText:/.*/}); let target,ordinal=0;
        for(let i=0;i<await action.count();i++){const b=action.nth(i),label=await b.getAttribute('aria-label')||(await b.innerText()).trim();if(label===item.label&&await b.isEnabled()){if(ordinal++===item.ordinal){target=b;break;}}}
        if (!target) continue;
        if (/^(Solve|Find Best Stackups)/.test(item.label) && route==='/stackup-advisor') continue; // Full solver/stop flow is covered in e2e.mjs.
        const chooser=page.waitForEvent('filechooser',{timeout:500}).catch(()=>null), download=page.waitForEvent('download',{timeout:1500}).catch(()=>null);
        await target.click(); const picker=await chooser;
        if(picker) {
          if(await picker.element().getAttribute('webkitdirectory')!==null) await picker.setFiles(resolve('public/examples'));
          else await picker.setFiles([]);
        }
        const saved=await download; if(saved)check(readFileSync(await saved.path()).length>0,item.label+' exports a nonempty file');
        await idle(); await clean(item.label);
        if(await page.getByRole('dialog').count())await page.keyboard.press('Escape');
        entry.actions.push(item.label+(picker?' opens file chooser':saved?' exports file':''));
      }
      await clean('complete');
    } catch(error) {const failure={route,error:error.stack};entry.failures.push(failure);report.failures.push(failure);console.error('FAIL '+route+' '+error.message);await page.screenshot({path:out+'/'+route.slice(1)+'-failure.png'}).catch(()=>{});}
    finally {await context.close();writeFileSync(out+'/report.json',JSON.stringify(report,null,2));}
    console.log('  '+entry.copied.length+' copy buttons, '+entry.help.length+' help buttons, '+entry.actions.length+' other actions');
  }
} finally {await browser.close();}
console.log(JSON.stringify({routes:report.routes.length,checks:report.checks,failures:report.failures.length}));process.exitCode=report.failures.length?1:0;
