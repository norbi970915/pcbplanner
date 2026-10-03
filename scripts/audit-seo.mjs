
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const base=process.argv[2]??'http://127.0.0.1:4180';
const out=resolve('dist-check/seo');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1600,height:1050},serviceWorkers:'block'});
await context.addInitScript(()=>localStorage.setItem('pcbplanner:analytics-consent',JSON.stringify({choice:'declined',updatedAt:new Date().toISOString()})));
const page=await context.newPage(),errors=[],checks=[];let requests=0;
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('request',r=>{if(/page-metadata-.*\.json/.test(r.url()))requests++;});
const get=(s,re)=>s.match(re)?.[1]??'';
const decode=s=>s.replace(/&(?:amp|quot|lt|gt|apos|#39);/g,x=>({'&amp;':'&','&quot;':'"','&lt;':'<','&gt;':'>','&apos;':"'",'&#39;':"'"}[x]));
const schemas=h=>JSON.parse(get(h,/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/));
const capture=()=>page.evaluate(()=>({title:document.title,description:document.querySelector('meta[name="description"]')?.content,
  canonical:document.querySelector('link[rel="canonical"]')?.href??null,ogUrl:document.querySelector('meta[property="og:url"]')?.content??null,
  ogTitle:document.querySelector('meta[property="og:title"]')?.content,ogDescription:document.querySelector('meta[property="og:description"]')?.content,
  ogImage:document.querySelector('meta[property="og:image"]')?.content,twitterImage:document.querySelector('meta[name="twitter:image"]')?.content,
  twitterTitle:document.querySelector('meta[name="twitter:title"]')?.content,twitterDescription:document.querySelector('meta[name="twitter:description"]')?.content,
  jsonLd:JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent),robots:document.querySelector('meta[name="robots"]')?.content??null,
  documentId:window.seoAuditDocument}));
const verify=async(expected,documentId)=>{
  await page.waitForFunction(path=>document.querySelector('script[type="application/ld+json"]')?.dataset.pagePath===path,expected.path);
  const m=await capture();
  assert.equal(m.title,expected.title);assert.equal(m.description,expected.description);assert.deepEqual(m.jsonLd,expected.jsonLd);
  assert.equal(m.ogImage,expected.image);assert.equal(m.twitterImage,expected.image);
  assert.equal(m.ogTitle,expected.title);assert.equal(m.twitterTitle,expected.title);
  assert.equal(m.ogDescription,expected.description);assert.equal(m.twitterDescription,expected.description);
  assert.equal(m.canonical,expected.noindex?null:'https://www.pcbplanner.com'+expected.path);
  assert.equal(m.ogUrl,m.canonical);assert.equal(m.robots,expected.noindex?'noindex':null);
  if(documentId!==undefined)assert.equal(m.documentId,documentId,'Navigation unexpectedly reloaded the document');
};
const navigate=async(path)=>{await page.evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'));},path);};
try {
  const response=await fetch(base+'/'),homeHtml=await response.text();assert.equal(response.status,200);
  const url=decode(get(homeHtml,/<meta name="pcbplanner:metadata" content="([^"]+)"/));assert.match(url,/^\/assets\/page-metadata-[a-f0-9]+\.json$/);
  const metaResponse=await fetch(base+url);assert.equal(metaResponse.status,200);const catalogue=await metaResponse.json();
  const paths=[...readFileSync('public/sitemap.xml','utf8').matchAll(/<loc>https:\/\/www.pcbplanner.com([^<]*)<\/loc>/g)].map(m=>m[1]);
  assert.deepEqual(Object.keys(catalogue).filter(p=>p!=='/404').sort(),[...paths].sort());
  const staticPages=new Map();let next=0;
  await Promise.all(Array.from({length:6},async()=>{while(next<paths.length){const path=paths[next++],r=await fetch(base+path),h=await r.text(),expected=catalogue[path];assert.equal(r.status,200,path);
    staticPages.set(path,h);assert.equal(decode(get(h,/<title>([^<]+)<\/title>/)),expected.title,path);
    assert.equal(decode(get(h,/<meta name="description" content="([^"]+)"/)),expected.description,path);
    assert.equal(decode(get(h,/<meta property="og:image" content="([^"]+)"/)),expected.image,path);
    assert.deepEqual(schemas(h),expected.jsonLd,path);assert.equal(get(h,/<link rel="canonical" href="([^"]+)"/),'https://www.pcbplanner.com'+path);
    assert.ok(!/\$\{(?:PRESETS|FLEX_PRESETS)\.length\}/.test(h),path+' unresolved count');
  }}));
  assert.ok(catalogue['/stackup'].description.includes('plus 6 flex and rigid-flex'));
  for(const path of ['/i2c-pullup','/termination','/current-sense-shunt','/s-parameter-viewer'])assert.ok(staticPages.get(path).includes('Method, formulas and references'),path+' missing method');
  assert.ok(staticPages.get('/s-parameter-viewer').includes('Group delay'));assert.ok(staticPages.get('/i2c-pullup').includes('0.8473'));
  for(const [,file]of [...readFileSync('src/tools/registry.ts','utf8').matchAll(/path:\s*'([^']+)'[\s\S]*?import\('\.\/(\w+)'\)/g)].map(m=>[m[1],m[2]])){
    const s=readFileSync('src/tools/'+file+'.tsx','utf8');if(/method=\{<Method\b/.test(s))assert.match(s,/export function Method/);
  }
  checks.push(paths.length+' static pages have matching titles, descriptions, canonicals, images and schemas; all existing method explanations are included');
  await page.goto(base+'/',{waitUntil:'networkidle'});await verify(catalogue['/']);assert.equal(requests,0,'Direct visits should use the metadata already in HTML');
  const documentId=await page.evaluate(()=>window.seoAuditDocument=Math.random());
  await page.locator('a.featured-link[href="/impedance"]').click();await verify(catalogue['/impedance'],documentId);
  for(const path of paths){await navigate(path);await verify(catalogue[path],documentId);}
  assert.equal(requests,1,'Navigation should reuse one metadata catalogue request');
  checks.push(paths.length+' client routes update all metadata without reloading; one catalogue request, with no request on direct visits');
  await navigate('/guides/choosing-a-pcb-stackup');await verify(catalogue['/guides/choosing-a-pcb-stackup'],documentId);
  await page.goBack();await verify(catalogue[paths.at(-1)],documentId);await page.goForward();await verify(catalogue['/guides/choosing-a-pcb-stackup'],documentId);
  const missing=await fetch(base+'/missing-seo-audit-page');
  if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))assert.equal(missing.status,404); // Vite preview serves its SPA fallback with 200
  const notFoundHtml=await fetch(base+'/404').then(r=>r.text());
  assert.ok(notFoundHtml.includes('name="robots" content="noindex"'));assert.ok(!notFoundHtml.includes('rel="canonical"'));
  await navigate('/missing-seo-audit-page');await verify(catalogue['/404'],documentId);
  await navigate('/impedance?mode=diff&target=100');await verify(catalogue['/impedance'],documentId);
  checks.push('Back/forward navigation, query-free canonicals, and removing 404 noindex on a valid page');
  // Delay the first metadata request and navigate away before it completes.
  const raceContext=await browser.newContext({serviceWorkers:'block'}),race=await raceContext.newPage();
  await race.route('**/page-metadata-*.json',async route=>{await new Promise(r=>setTimeout(r,300));await route.continue();});
  await race.goto(base+'/',{waitUntil:'networkidle'});
  await race.evaluate(()=>{history.pushState({},'','/impedance');dispatchEvent(new PopStateEvent('popstate'));});
  await race.waitForFunction(()=>document.title.includes('Microstrip'));
  await race.evaluate(()=>{history.pushState({},'','/about');dispatchEvent(new PopStateEvent('popstate'));});
  await race.waitForFunction(()=>document.querySelector('script[type="application/ld+json"]')?.dataset.pagePath==='/about');
  await race.waitForTimeout(400);assert.equal(await race.title(),catalogue['/about'].title);await raceContext.close();
  checks.push('A delayed response for a previous route cannot overwrite the current page');
  const offlineContext=await browser.newContext({serviceWorkers:'allow'}),offline=await offlineContext.newPage();
  await offlineContext.addInitScript(()=>localStorage.setItem('pcbplanner:analytics-consent',JSON.stringify({choice:'declined',updatedAt:new Date().toISOString()})));
  await offline.goto(base+'/about',{waitUntil:'networkidle'});
  await offline.waitForFunction(()=>navigator.serviceWorker.controller,undefined,{timeout:60000});
  await offlineContext.setOffline(true);
  await offline.evaluate(()=>{history.pushState({},'','/i2c-pullup');dispatchEvent(new PopStateEvent('popstate'));});
  await offline.waitForFunction(()=>document.querySelector('script[type="application/ld+json"]')?.dataset.pagePath==='/i2c-pullup');
  assert.deepEqual(await offline.evaluate(()=>JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)),catalogue['/i2c-pullup'].jsonLd);
  await offlineContext.close();checks.push('Versioned metadata and tool navigation remain available offline through the existing service worker');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({base,routes:paths.length,checks,errors},null,2));writeFileSync(resolve(out,'report.json'),JSON.stringify({base,routes:paths.length,checks,errors},null,2));
} catch(error){await page.screenshot({path:resolve(out,'failure.png'),fullPage:true});console.error('URL',page.url());throw error;}
finally{await browser.close();}
