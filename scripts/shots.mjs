// Visual smoke test: opens tools in Edge, waits for results, saves screenshots
// and reports console errors. Usage: node scripts/shots.mjs <outDir> [baseUrl] [theme]
import { chromium } from 'playwright-core';

const out = process.argv[2] ?? '.';
const base = process.argv[3] ?? 'http://localhost:4173';
const theme = process.argv[4] ?? 'dark';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addInitScript((t) => localStorage.setItem('pcbtk-settings', JSON.stringify({ unit: 'mm', theme: t })), theme);
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
const idle = (ms = 20000) => page.waitForFunction(() => !document.body.innerText.includes('Solving'), null, { timeout: ms });

const shots = [
  ['home', '/'],
  ['impedance-diff', '/impedance?mode=diff&w=0.113&s=0.114&h=0.0764&er=3.91&t=0.04064&target=85'],
  ['stackup', '/stackup'],
  ['trace', '/trace-width?mode=temp'],
  ['junction', '/junction-temperature?mode=chain'],
  ['thermalvias', '/thermal-vias'],
  ['crosstalk', '/crosstalk'],
  ['ohms', '/ohms-law'],
  ['resistors', '/resistors'],
];
for (const [name, path] of shots) {
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await idle().catch(() => errors.push(`${name}: still solving`));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/shot_${name}.png` });
}

// stack manager impedance tab
await page.goto(base + '/stackup', { waitUntil: 'networkidle' });
await page.getByRole('radio', { name: 'Impedance' }).click();
await page.waitForFunction(() => !document.body.innerText.includes('solving…'), null, { timeout: 60000 }).catch(() => errors.push('lsm impedance: timeout'));
await page.screenshot({ path: `${out}/shot_lsm_imp.png` });

// stackup advisor run
await page.goto(base + '/stackup-advisor', { waitUntil: 'networkidle' });
const t0 = Date.now();
await page.getByRole('button', { name: 'Find Best Stackups' }).click();
await page.waitForFunction(() => document.body.innerText.includes('meet every requirement'), null, { timeout: 180000 }).catch(() => errors.push('advisor: timeout'));
console.log(`advisor finished in ${((Date.now() - t0) / 1000).toFixed(1)} s:`, await page.locator('text=meet every requirement').first().innerText().catch(() => '?'));
await page.screenshot({ path: `${out}/shot_advisor.png` });

console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
