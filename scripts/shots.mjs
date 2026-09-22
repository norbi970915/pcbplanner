// Visual smoke test: opens each tool in Edge, waits for results, saves screenshots
// and reports console errors. Usage: node scripts/shots.mjs <outDir> [baseUrl] [theme]
import { chromium } from 'playwright-core';

const out = process.argv[2] ?? '.';
const base = process.argv[3] ?? 'http://localhost:4173';
const theme = process.argv[4] ?? 'light';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, colorScheme: theme });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));

const shots = [
  ['home', '/'],
  ['impedance', '/impedance'],
  ['impedance-diff', '/impedance?mode=diff&w=0.113&s=0.114&h=0.0764&er=3.91&t=0.04064&target=85'],
  ['stripline', '/impedance?type=stripline&h=0.2&h2=0.2&er=4.3&er2=4.3&w=0.12&t=0.0152'],
  ['trace', '/trace-width'],
  ['via', '/via'],
  ['stackup', '/stackup'],
  ['timing', '/timing'],
];
for (const [name, path] of shots) {
  await page.goto(base + path, { waitUntil: 'networkidle' });
  if (path.startsWith('/impedance')) {
    await page.waitForFunction(() => !document.body.innerText.includes('Solving…'), null, { timeout: 20000 }).catch(() => errors.push(`${name}: solver did not finish`));
    const big = await page.locator('.tnum').first().innerText();
    console.log(`${name}: ${big.replace(/\s+/g, ' ')}`);
  }
  await page.screenshot({ path: `${out}/shot_${name}.png`, fullPage: false });
}
// field view
await page.goto(base + '/impedance?mode=diff&w=0.113&s=0.114&h=0.0764&er=3.91&t=0.04064&target=85', { waitUntil: 'networkidle' });
await page.waitForFunction(() => !document.body.innerText.includes('Solving…'), null, { timeout: 20000 });
await page.getByRole('radio', { name: 'Field' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/shot_field.png` });
// solve for width
await page.goto(base + '/impedance', { waitUntil: 'networkidle' });
await page.waitForFunction(() => !document.body.innerText.includes('Solving…'), null, { timeout: 20000 });
await page.getByRole('button', { name: 'Solve W' }).click();
await page.waitForFunction(() => !document.body.innerText.includes('Solving…'), null, { timeout: 30000 });
await page.waitForTimeout(600);
console.log('after Solve W:', (await page.locator('.tnum').first().innerText()).replace(/\s+/g, ' '), '| url:', page.url());

console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
