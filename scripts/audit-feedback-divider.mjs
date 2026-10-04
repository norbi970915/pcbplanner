import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const base = process.argv[2] ?? 'http://127.0.0.1:4182';
const out = resolve('dist-check/feedback-divider');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1050 } });
await context.addInitScript(() => {
  if (!sessionStorage.getItem('pcbtk-settings')) sessionStorage.setItem('pcbtk-settings', JSON.stringify({ theme: 'dark', unit: 'mm' }));
  localStorage.setItem('pcbplanner:analytics-consent', JSON.stringify({ choice: 'declined', updatedAt: new Date().toISOString() }));
});
const page = await context.newPage(), errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
async function visit(query = '') {
  await page.goto(base + '/feedback-divider' + query, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Best Pair', exact: true }).waitFor();
}
async function matches() {
  const outputs = await page.locator('.headline-result').evaluateAll(elements => elements.map(el =>
    [el.querySelector('[data-copy-value]').textContent, el.querySelector('[data-copy-unit]').textContent].join(' ').replace(/\s+/g, ' ').trim()));
  const drawing = (await page.locator('.diagram-svg').textContent()).replace(/\s+/g, ' ');
  for (const output of outputs) assert.ok(drawing.replace(/\s+/g, '').includes(output.replace(/\s+/g, '')), 'diagram must match result: ' + output);
}
try {
  await visit(); await matches();
  for (const [label, value] of [['Target output voltage', '5'], ['Divider current', '200'], ['Feedback (reference) voltage', '1.25']]) {
    const previous = await page.locator('.diagram-svg').textContent();
    await page.getByLabel(label, { exact: false }).fill(value);
    await page.waitForFunction(previous => document.querySelector('.diagram-svg').textContent !== previous, previous);
    await matches();
  }
  await page.getByLabel('Resistor series', { exact: true }).selectOption('E24');
  await page.waitForFunction(() => document.querySelector('.diagram-caption').textContent.includes('E24'));
  await matches(); checks.push('Live R1, R2 and output match the best pair after voltage, current, reference and series changes');
  await page.getByLabel('FB bias current', { exact: false }).fill('50');
  await page.locator('[data-bias-direction="into-fb"]').waitFor({ state: 'attached' }); await matches();
  assert.ok((await page.locator('.diagram-values dd').nth(1).innerText()).startsWith('+'));
  await page.getByLabel('FB bias current', { exact: false }).fill('-50');
  await page.locator('[data-bias-direction="out-of-fb"]').waitFor({ state: 'attached' }); await matches();
  assert.ok((await page.locator('.diagram-values dd').nth(1).innerText()).startsWith('-'));
  await page.getByLabel('FB bias current', { exact: false }).fill('0');
  assert.equal(await page.locator('[data-bias-direction]').count(), 0);
  checks.push('Positive, negative and zero bias current show the correct direction and output shift');
  const beforeTolerance = await page.locator('.diagram-svg').textContent();
  await page.getByLabel('Resistor tolerance', { exact: false }).fill('5');
  assert.equal(await page.locator('.diagram-svg').textContent(), beforeTolerance);
  assert.ok(/Worst case with .5 % resistors/.test(await page.locator('main').innerText()));
  checks.push('Tolerance changes the range without changing the nominal circuit');
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => sessionStorage.setItem('pcbtk-settings', JSON.stringify({ theme, unit: 'mm' })), theme);
    for (const width of [1600, 1024, 390, 320]) {
      await page.setViewportSize({ width, height: 1050 }); await visit(); await matches();
      const issues = await page.evaluate(() => {
        const issues = [], main = document.querySelector('main'), svg = document.querySelector('.diagram-svg'), v = svg.viewBox.baseVal;
        if (document.documentElement.scrollWidth > innerWidth + 1 || main.scrollWidth > main.clientWidth + 1) issues.push('overflow');
        for (const text of svg.querySelectorAll('text')) {
          const b = text.getBBox();
          if (b.x < v.x || b.y < v.y || b.x + b.width > v.x + v.width || b.y + b.height > v.y + v.height) issues.push('clipped: ' + text.textContent);
        }
        return issues;
      });
      assert.deepEqual(issues, [], theme + ' at ' + width);
      await page.locator('.engineering-diagram').screenshot({ path: resolve(out, theme + '-' + width + '.png') });
      if (width === 1600) await page.screenshot({ path: resolve(out, theme + '-page.png') });
    }
  }
  checks.push('Diagram fits desktop and mobile at 1600, 1024, 390 and 320px in both themes');
  await page.getByLabel('Target output voltage', { exact: false }).fill('0.5');
  await page.getByRole('alert').first().waitFor(); assert.equal(await page.locator('.engineering-diagram').count(), 0);
  checks.push('Invalid inputs hide the circuit instead of showing stale resistor values');
  assert.deepEqual(errors, []);
  writeFileSync(resolve(out, 'report.json'), JSON.stringify({ base, checks, errors }, null, 2));
  console.log('PASS ' + checks.length + ' feedback divider checks');
} catch (error) {
  await page.screenshot({ path: resolve(out, 'failure.png'), fullPage: true }); console.error(error); process.exitCode = 1;
} finally { await browser.close(); }
