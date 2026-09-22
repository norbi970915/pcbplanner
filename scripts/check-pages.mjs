// Quick render check of selected pages: reports console errors, bad text and saves screenshots.
// Usage: node scripts/check-pages.mjs <outDir> [baseUrl] [route ...]
import { chromium } from 'playwright-core';
import { join } from 'node:path';

const out = process.argv[2] ?? '.';
const base = process.argv[3] ?? 'http://localhost:4173';
const routes = process.argv.slice(4);

const b = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addInitScript(() => localStorage.setItem('pcbtk-settings', JSON.stringify({ unit: 'mm', theme: 'dark' })));
const p = await ctx.newPage();
const errs = [];
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
p.on('pageerror', (e) => errs.push(e.message));
for (const r of routes) {
  await p.goto(`${base}/${r}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  const txt = await p.locator('main').innerText();
  const bad = ['NaN', 'Infinity', 'undefined', '[object'].filter((w) => txt.includes(w));
  console.log((r || 'home').padEnd(18), 'title:', await p.title(), bad.length ? `BAD TEXT: ${bad}` : '');
  await p.screenshot({ path: join(out, `page-${(r || 'home').replace(/\W+/g, '_')}.png`) });
}
console.log('errors:', errs.length ? errs : 'none');
await b.close();
