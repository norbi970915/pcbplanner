// Quick render check of every tool page: reports console errors and saves a few screenshots.
// Usage: node scripts/check-pages.mjs <outDir>
import { chromium } from 'playwright-core';
import { join } from 'node:path';

const out = process.argv[2] ?? '.';
const routes = ['pdn', 'planar-inductor', 'padstack', 'ohms-law', 'reactance', 'crystal', 'resistors', 'attenuator', 'units', 'timing', 'via', 'skin-effect', 'fusing'];
const shots = new Set(['pdn', 'planar-inductor', 'padstack']);

const b = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addInitScript(() => localStorage.setItem('pcbtk-settings', JSON.stringify({ unit: 'mm', theme: 'dark' })));
const p = await ctx.newPage();
const errs = [];
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
p.on('pageerror', (e) => errs.push(e.message));
for (const r of routes) {
  await p.goto(`http://localhost:4173/${r}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  const props = await p.locator('aside').last().innerText();
  console.log(r.padEnd(16), 'properties text:', props.length);
  if (shots.has(r)) await p.screenshot({ path: join(out, `page-${r}.png`) });
}
console.log('errors:', errs.length ? errs : 'none');
await b.close();
