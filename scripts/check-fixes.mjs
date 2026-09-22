// Checks two E2E fixes: global unit toggle converts LenField text; Reset clears unparsable text.
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:4174';
const b = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addInitScript(() => localStorage.setItem('pcbtk-settings', JSON.stringify({ unit: 'mm', theme: 'dark' })));
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`${base}/via`, { waitUntil: 'networkidle' });
const hole = p.getByLabel('Finished hole');
const before = await hole.inputValue();
await p.getByRole('button', { name: 'Units: mm' }).click();
await p.waitForTimeout(200);
const after = await hole.inputValue();
console.log(`unit toggle: ${before} mm -> ${after} mil`, Math.abs(Number(after) - Number(before) / 0.0254) < 0.01 ? 'OK' : 'FAIL');
await p.getByRole('button', { name: 'Units: mil' }).click();
await p.waitForTimeout(200);
console.log('back to mm:', await hole.inputValue());
// reset clears unparsable text
await hole.fill('abc');
await p.getByRole('button', { name: 'Reset' }).first().click();
await p.waitForTimeout(200);
const r = await hole.inputValue();
console.log(`reset after 'abc': "${r}"`, r === before ? 'OK' : 'FAIL');
// huge spacing in stack manager must not freeze
await p.goto(`${base}/stackup`, { waitUntil: 'networkidle' });
await p.getByRole('radio', { name: 'Impedance' }).click();
const t0 = Date.now();
await p.getByLabel('Pair spacing').fill('1e9');
await p.waitForTimeout(1500);
const alive = await p.evaluate(() => 1 + 1).catch(() => 0);
console.log(`1e9 spacing: page responsive=${alive === 2} in ${Date.now() - t0} ms`);
console.log('page errors:', errs.length ? errs : 'none');
await b.close();
