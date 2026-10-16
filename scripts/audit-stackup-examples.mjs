import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import ts from 'typescript';
const base = process.argv[2] ?? 'http://127.0.0.1:4180';
assert.equal(new URL(base).hostname, '127.0.0.1', 'Run this storage/import audit against a local preview only.');
const compiled = ts.transpileModule(readFileSync('src/lib/__fixtures__/stackup.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { multiPlyStackup } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const seed = { ...multiPlyStackup, id: 'custom-existing', name: 'Existing custom construction', builtin: false };
const oldId = 'std-retired-example';
const original = 'pcbplanner-v1-6l-1600-close';
mkdirSync('dist-check/stackup-examples', { recursive: true });
for (const file of readdirSync('dist/assets').filter(f => f.endsWith('.js'))) {
  assert(!readFileSync('dist/assets/' + file, 'utf8').includes('std-6l-16-1080-2'), 'Retired catalogue identifier in bundle ' + file);
}
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1050 }, serviceWorkers: 'block' });
  await context.addInitScript(({ seed, oldId }) => {
    localStorage.setItem('pcbplanner:analytics-consent', JSON.stringify({ choice: 'declined', version: 2, updatedAt: new Date().toISOString() }));
    if (!localStorage.getItem('pcbtk-stackups')) localStorage.setItem('pcbtk-stackups', JSON.stringify([seed]));
    sessionStorage.setItem('pcbtk-settings', JSON.stringify({ unit: 'mm', theme: 'dark' }));
    if (!sessionStorage.getItem('seeded-stackup-audit')) {
      sessionStorage.setItem('pcbplanner:stackup-manager:draft:' + oldId, JSON.stringify({ ...seed, id: oldId, builtin: true }));
      sessionStorage.setItem('seeded-stackup-audit', '1');
    }
  }, { seed, oldId });
  const page = await context.newPage(), errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(base).origin) external.push(request.url()); });
  const go = path => page.goto(base + path, { waitUntil: 'networkidle' });
  await go('/stackup');
  await page.locator('#lsm-s').waitFor();
  assert.equal(await page.locator('#lsm-s').inputValue(), original);
  assert.equal(await page.locator('#lsm-s option').count(), 44); // 37 original, 6 flex/rigid-flex, 1 saved custom
  assert.equal(await page.getByRole('button', { name: 'Set ref. frequency', exact: true }).count(), 7);
  await page.locator('#lsm-s').selectOption('custom-existing');
  assert.equal(await page.getByLabel('L1 thickness (mm)', { exact: true }).inputValue(), '0.035');
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('#lsm-s').inputValue(), 'custom-existing');
  assert.equal(await page.getByLabel('L1 thickness (mm)', { exact: true }).inputValue(), '0.035');
  await go('/stackup?id=' + oldId);
  await page.locator('#missing-stackup').waitFor();
  assert.equal(await page.locator('#lsm-s').count(), 0);
  assert.equal(await page.locator('#missing-stackup').inputValue(), '');
  assert((await page.locator('body').innerText()).includes('does not select a replacement automatically'));
  await page.getByRole('button', { name: 'Recover this tab’s draft', exact: true }).click();
  await page.locator('#lsm-s').waitFor();
  const recovered = await page.locator('#lsm-s').inputValue();
  assert(recovered.startsWith('custom-') && recovered !== 'custom-existing');
  assert.equal(await page.getByLabel('L1 thickness (mm)', { exact: true }).inputValue(), '0.035');
  await go('/stackup?id=unavailable-no-draft');
  await page.locator('#missing-stackup').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Recover this tab’s draft', exact: true }).count(), 0);
  await page.locator('input[type=file]').setInputFiles({ name: 'saved.stackup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'pcbplanner', type: 'stackup', version: 1, stackup: seed })) });
  await page.locator('#lsm-s').waitFor();
  assert.equal(await page.getByLabel('L1 thickness (mm)', { exact: true }).inputValue(), '0.035');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pcbtk-stackups')));
  assert.deepEqual(saved.find(s => s.id === 'custom-existing'), seed);
  await go('/stackup?id=' + original);
  await page.locator('#lsm-s').waitFor();
  await page.getByRole('button', { name: 'Save as Copy', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#lsm-s')?.value.startsWith('custom-'));
  await page.getByLabel('L1 thickness (mm)', { exact: true }).fill('0.04');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.getByLabel('L1 thickness (mm)', { exact: true }).inputValue(), '0.04');
  await page.getByRole('button', { name: 'Impedance →', exact: true }).first().click();
  await page.waitForURL('**/impedance?*');
  const q = new URL(page.url()).searchParams;
  assert.equal(q.get('h'), '0.1'); assert.equal(q.get('er'), '4'); assert.equal(q.get('t'), '0.04');
  await go('/interface-rules?stk=' + oldId);
  await page.locator('#ir-stk').waitFor();
  assert.equal(await page.locator('#ir-stk').inputValue(), '');
  assert((await page.getByRole('alert').innerText()).includes('selected stackup is unavailable'));
  assert.equal(await page.getByText('Trace width', { exact: true }).count(), 0);
  await page.locator('#ir-stk').selectOption(original);
  await page.locator('#tool-panel').getByText('Trace width', { exact: true }).waitFor();
  await go('/stackup-advisor?reqs=%5B%5D&lmin=6&lmax=6&tmin=1.6&tmax=1.6');
  await page.getByRole('button', { name: /Find Stackups/i }).click();
  await page.getByText(/Close outer planes/).first().waitFor();
  assert((await page.locator('body').innerText()).includes('Equal dielectric gaps'));
  await go('/guides/choosing-a-pcb-stackup');
  await page.getByRole('heading', { name: /How to Choose a PCB Stackup/ }).waitFor();
  await page.getByRole('link', { name: /Inspect the original 6-layer, 1.6 mm close-outer-plane example/ }).click();
  await page.locator('#lsm-s').waitFor(); assert.equal(await page.locator('#lsm-s').inputValue(), original);
  for (const width of [1500, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    for (const path of ['/stackup?id=' + original, '/stackup?id=unavailable-no-draft', '/guides/choosing-a-pcb-stackup']) {
      await go(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      assert.equal(overflow, false, width + 'px overflow on ' + path);
    }
  }
  await page.screenshot({ path: 'dist-check/stackup-examples/guide-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1500, height: 1050 });
  await go('/stackup?id=' + original);
  await page.screenshot({ path: 'dist-check/stackup-examples/manager-desktop.png' });
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log('PASS: original library, custom persistence, retired links, draft recovery, JSON import, impedance handoff, advisor, guide links, responsive layout, no page errors/external requests.');
} finally { await browser.close(); }
