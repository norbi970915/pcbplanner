import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const base = process.argv[2] ?? 'http://127.0.0.1:4182', out = resolve('dist-check/resistor-diagrams');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1050 } });
await context.addInitScript(() => {
  if (!sessionStorage.getItem('pcbtk-settings')) sessionStorage.setItem('pcbtk-settings', JSON.stringify({ theme: 'dark', unit: 'mm' }));
  localStorage.setItem('pcbplanner:analytics-consent', JSON.stringify({ choice: 'declined', updatedAt: new Date().toISOString() }));
});
const page = await context.newPage(), errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
const clean = value => value.replace(/\s+/g, '');
const card = title => page.getByRole('heading', { name: title, exact: true }).first().locator('..').locator('..');
const voltage = () => card('Voltage divider'), led = () => card('LED series resistor');
async function visit(patch = {}) {
  const params = new URLSearchParams({ vin:'5', r1:'10000', r2:'10000', rl:'0', vs:'5', vf:'2', ifw:'0.02', n:'1', lser:'E24', ...patch });
  await page.goto(base + '/resistors?' + params, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Voltage divider', exact: true }).first().waitFor();
}
async function dividerMatches(expected) {
  const row = voltage().locator('tr').filter({ has: page.getByText('Output voltage', { exact: true }) });
  const value = clean(await row.locator('[data-copy-value]').innerText());
  assert.ok(clean(await voltage().locator('.diagram-svg').textContent()).includes(value), 'divider diagram matches output row');
  assert.ok(value.includes(clean(expected)), 'known divider output: ' + value);
}
async function ledMatches(label) {
  const row = led().locator('tbody tr').filter({ has: page.getByRole('rowheader', { name: label, exact: true }) });
  const values = await row.locator('td').allTextContents();
  const svg = clean(await led().locator('.diagram-svg').textContent());
  assert.ok(svg.includes(clean(values[0])), 'LED resistor matches selected table row');
  assert.ok(svg.includes(clean(values[1])), 'LED current matches selected table row');
  assert.equal(clean(await led().locator('.diagram-values dd').last().innerText()), clean(values[2]));
  assert.ok((await led().locator('.diagram-caption').innerText()).includes(label));
}
try {
  await visit(); await dividerMatches('2.5 V'); await ledMatches('Next higher E24');
  await page.getByLabel('Top resistor', { exact: false }).fill('20'); await dividerMatches('1.667 V');
  await page.getByLabel('Bottom resistor', { exact: false }).fill('20'); await dividerMatches('2.5 V');
  await page.getByLabel('Input voltage', { exact: false }).fill('9'); await dividerMatches('4.5 V');
  await page.getByLabel(/^Load/).fill('10000'); await dividerMatches('2.25 V');
  assert.equal(await page.locator('[data-divider-load]').count(), 1);
  assert.ok(clean(await voltage().locator('.diagram-svg').textContent()).includes('10k'));
  await page.getByLabel(/^Load/).fill('0'); await dividerMatches('4.5 V');
  assert.equal(await page.locator('[data-divider-load]').count(), 0);
  await page.getByLabel('Input voltage', { exact: false }).fill('-9'); await dividerMatches('-4.5 V');
  checks.push('Divider updates R1, R2, Vin and Vout live, connects/removes RL, and handles negative Vin');
  const top = page.getByLabel('Top resistor', { exact: false });
  await top.locator('..').getByLabel('unit', { exact: true }).selectOption('M');
  await dividerMatches('-4.5 V'); await top.fill('0.01'); await dividerMatches('-6 V');
  checks.push('Changing SI prefixes preserves resistance; editing in the new prefix updates the circuit');
  await visit(); await page.getByLabel('Supply voltage', { exact: false }).fill('5.1');
  for (const [option, label] of [['Exact','Exact'], ['Nearest','Nearest E24'], ['Next higher','Next higher E24']]) {
    await page.getByRole('radio', { name: option, exact: true }).click(); await ledMatches(label);
  }
  for (const [label, value] of [['LED forward voltage','2.2'], ['LED current','10']]) {
    const previous = await led().locator('.diagram-svg').textContent();
    await page.getByLabel(label, { exact: false }).fill(value);
    assert.notEqual(await led().locator('.diagram-svg').textContent(), previous); await ledMatches('Next higher E24');
  }
  assert.ok(clean(await led().locator('.diagram-svg').textContent()).includes('2.2V'));
  await page.getByLabel('Series', { exact: true }).nth(1).selectOption('E96'); await ledMatches('Next higher E96');
  checks.push('LED exact/nearest/next-higher choices match table resistance, current and dissipation after supply, Vf, current and series changes');
  await page.getByLabel('Supply voltage', { exact: false }).fill('12');
  for (const n of [2,3]) { await page.getByLabel('LEDs in series', { exact: true }).fill(String(n)); assert.equal(await page.locator('[data-led-symbol]').count(), n); await ledMatches('Next higher E96'); }
  await page.getByLabel('Supply voltage', { exact: false }).fill('30');
  await page.getByLabel('LEDs in series', { exact: true }).fill('10');
  assert.equal(await page.locator('[data-led-symbol]').count(), 2);
  assert.ok((await led().locator('.diagram-caption').innerText()).includes('10-LED')); await ledMatches('Next higher E96');
  await visit({ vs:'300000', n:'100000' }); assert.equal(await page.locator('[data-led-symbol]').count(), 2); await ledMatches('Next higher E24');
  checks.push('One to three LEDs use individual symbols; longer strings stay compact and retain their actual count');
  for (const theme of ['dark','light']) {
    await page.evaluate(theme => sessionStorage.setItem('pcbtk-settings', JSON.stringify({ theme, unit:'mm' })), theme);
    for (const width of [1600,1024,390,320]) {
      await page.setViewportSize({ width, height:1050 });
      for (const [name, patch] of [['default',{}], ['loaded',{ rl:'10000' }], ['three-led',{ vs:'12', n:'3' }], ['ten-led',{ vs:'30', n:'10' }]]) {
        await visit(patch);
        const issues = await page.evaluate(() => {
          const issues = [], main = document.querySelector('main');
          if (document.documentElement.scrollWidth > innerWidth + 1 || main.scrollWidth > main.clientWidth + 1) issues.push('page overflow');
          for (const svg of document.querySelectorAll('.diagram-svg')) for (const text of svg.querySelectorAll('text')) {
            const b = text.getBBox(), v = svg.viewBox.baseVal;
            if (b.x < v.x || b.y < v.y || b.x + b.width > v.x + v.width || b.y + b.height > v.y + v.height) issues.push('clipped text: ' + text.textContent);
          }
          return issues;
        });
        assert.deepEqual(issues, [], theme + ' ' + width + ' ' + name);
        if (name === 'default' && (width === 1600 || width === 320)) await page.screenshot({ path:resolve(out, theme + '-' + width + '-page.png') });
        if (name === 'loaded' || name === 'three-led' || name === 'ten-led') await (name === 'loaded' ? voltage() : led()).locator('.engineering-diagram').screenshot({ path:resolve(out, theme + '-' + width + '-' + name + '.png') });
      }
    }
  }
  checks.push('Both circuits fit 1600, 1024, 390 and 320px in dark/light themes with loaded dividers and multiple LEDs');
  await visit({ n:'0' }); assert.equal(await led().locator('.engineering-diagram').count(), 0); assert.equal(await voltage().locator('.engineering-diagram').count(), 1);
  await visit({ n:'1.5' }); assert.equal(await led().locator('.engineering-diagram').count(), 0);
  await visit({ vs:'2', vf:'2' }); assert.equal(await led().locator('.engineering-diagram').count(), 0);
  await visit({ r1:'0' }); assert.equal(await voltage().locator('.engineering-diagram').count(), 0); assert.equal(await led().locator('.engineering-diagram').count(), 1);
  await page.getByRole('button', { name:'Reset', exact:true }).click(); await dividerMatches('2.5 V'); await ledMatches('Next higher E24');
  checks.push('Invalid inputs hide only the affected circuit; reset restores both diagrams');
  assert.deepEqual(errors, []); writeFileSync(resolve(out,'report.json'), JSON.stringify({ base, checks, errors },null,2));
  console.log('PASS ' + checks.length + ' resistor diagram checks');
} catch (error) {
  await page.screenshot({ path:resolve(out,'failure.png'), fullPage:true }); console.error(error); process.exitCode = 1;
} finally { await browser.close(); }
