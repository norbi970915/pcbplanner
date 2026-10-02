import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const out = resolve('dist-check/redesign');
mkdirSync(out, { recursive: true });
const toolRoutes = [
  ...readFileSync('src/tools/registry.ts', 'utf8').matchAll(
    /^\s*path:\s*'([^']+)'/gm,
  ),
].map((m) => m[1]);
const guideRoutes = [
  ...readFileSync('src/guides/registry.ts', 'utf8').matchAll(
    /^\s*path:\s*'([^']+)'/gm,
  ),
].map((m) => m[1]);
const routes = [
  '/',
  '/tools',
  '/schematic',
  '/guides',
  '/about',
  ...toolRoutes,
  ...guideRoutes,
];
const representative = new Set([
  '/',
  '/impedance',
  '/stackup',
  '/power-tree',
  '/s-parameter-viewer',
  '/tools',
  '/schematic',
  '/guides',
  '/about',
  '/guides/rc-filter-design',
]);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({
  viewport: { width: 1600, height: 1050 },
});
await context.addInitScript(() => {
  sessionStorage.setItem(
    'pcbtk-settings',
    JSON.stringify({ theme: 'dark', unit: 'mm' }),
  );
  localStorage.setItem(
    'pcbplanner:analytics-consent',
    JSON.stringify({ choice: 'declined', updatedAt: new Date().toISOString() }),
  );
});
const page = await context.newPage();
const errors = [],
  issues = [],
  checks = [];
page.on('pageerror', (e) =>
  errors.push({ route: page.url(), error: e.message }),
);
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('404'))
    errors.push({ route: page.url(), error: m.text() });
});
page.setDefaultTimeout(10000);
async function consent() {
  const decline = page.getByRole('button', { name: 'Decline', exact: true });
  if (await decline.isVisible()) await decline.click();
}
async function visit(route) {
  await page.goto(base + route, { waitUntil: 'networkidle' });
  await consent();
  await page.waitForFunction(
    () => !document.body.innerText.includes('Loading…'),
  );
  await page
    .waitForFunction(
      () =>
        !/solving(?:…| \d+\/| every layer)/i.test(
          (document.querySelector('main')?.innerText ?? '') +
            ' ' +
            (document.querySelector('.status-bar')?.innerText ?? ''),
        ),
      null,
      { timeout: 30000 },
    )
    .catch(() => issues.push({ route, issue: 'Solver did not finish' }));
}
async function layoutCheck(route, width) {
  const result = await page.evaluate(() => {
    const main = document.querySelector('main');
    const shell = document.querySelector('.app-shell');
    const overflow = [...document.querySelectorAll('main *')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.width > 0 &&
          r.right > innerWidth + 2 &&
          !el.closest('.overflow-x-auto') &&
          !el.closest('svg') &&
          !el.closest('.tbl')
        );
      })
      .slice(0, 4)
      .map((el) => ({
        tag: el.tagName,
        cls: String(el.className),
        text: el.textContent.slice(0, 65),
      }));
    return {
      documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      mainOverflow: main.scrollWidth > main.clientWidth + 1,
      hasContent: main.innerText.trim().length > 30,
      background: getComputedStyle(shell).fontSize,
      overflow,
    };
  });
  if (result.documentOverflow || result.mainOverflow || !result.hasContent)
    issues.push({ route, width, ...result });
}
try {
  for (const width of [1600, 390]) {
    await page.setViewportSize({ width, height: 1050 });
    for (const [index, route] of routes.entries()) {
      await visit(route);
      await layoutCheck(route, width);
      if (representative.has(route))
        await page.screenshot({
          path: resolve(
            out,
            (width === 1600 ? 'desktop' : 'mobile') +
              '-' +
              (route.slice(1).replaceAll('/', '-') || 'home') +
              '.png',
          ),
        });
      if ((index + 1) % 20 === 0)
        console.log(
          'Rendered ' +
            (index + 1) +
            '/' +
            routes.length +
            ' routes at ' +
            width +
            'px',
        );
    }
  }
  await page.setViewportSize({ width: 320, height: 900 });
  for (const route of [
    '/',
    '/tools',
    '/guides',
    '/impedance',
    '/power-tree',
    '/stackup',
    '/about',
    '/guides/rc-filter-design',
  ]) {
    await visit(route);
    await layoutCheck(route, 320);
  }
  await page.setViewportSize({ width: 1600, height: 1050 });
  await visit('/');
  assert.equal(await page.locator('.featured-link').count(), 10);
  assert.equal(await page.locator('.quick-task').count(), 0);
  assert.doesNotMatch(await page.locator('main').innerText(), /Quick access|A closer look at your design/);
  assert.deepEqual(await page.locator('.featured-link').evaluateAll(links => links.slice(0, 3).map(link => new URL(link.href).pathname)), ['/impedance', '/stackup', '/s-parameter-viewer']);
  const signalColor = await page
    .locator('.category-link')
    .first()
    .locator('svg')
    .first()
    .evaluate((el) => getComputedStyle(el).color);
  assert.equal(signalColor, 'rgb(61, 143, 224)');
  await page.keyboard.press('/');
  assert.equal(
    await page
      .locator('#home-search')
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.locator('#home-search').fill('via current');
  await page
    .getByRole('heading', { name: 'Search results', exact: true })
    .waitFor();
  assert.ok((await page.locator('.result-item').count()) > 0);
  await page.locator('#home-search').press('Escape');
  await page.getByRole('heading', { name: 'Featured tools' }).waitFor();
  checks.push('Featured tool links, homepage search, Escape and colored icons');
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page
    .getByRole('menuitemcheckbox', { name: 'Light Gray Theme', exact: true })
    .click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  await page.screenshot({ path: resolve(out, 'desktop-home-light.png') });
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page
    .getByRole('menuitemcheckbox', { name: 'Imperial (mil)', exact: true })
    .click();
  assert.ok((await page.locator('.status-bar').innerText()).includes('mil'));
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  checks.push('Accessible menus, theme and unit switching');
  for (const route of ['/impedance', '/stackup', '/s-parameter-viewer']) {
    await visit('/');
    await page.locator('.featured-link[href="' + route + '"]').click();
    await page.waitForURL(url => url.pathname === route);
    await page.locator('.document-page').waitFor();
    assert.ok((await page.locator('main').innerText()).length > 60);
  }
  checks.push('Featured card navigation to impedance, stackup and S-parameters');
  await visit('/ohms-law');
  const fields = page.locator('.properties-panel input:not([type="checkbox"])');
  const before = await page.locator('main').innerText();
  await fields.first().fill('15');
  await page.waitForTimeout(120);
  const after = await page.locator('main').innerText();
  assert.notEqual(after, before);
  await page.getByRole('button', { name: 'Reset', exact: true }).last().click();
  await page.waitForFunction(
    () =>
      document.querySelector('.properties-panel input:not([type="checkbox"])')
        ?.value === '12',
  );
  assert.equal(await fields.first().inputValue(), '12');
  checks.push('Calculator input, result updates and reset');
  await visit('/projects');
  await page.getByLabel('New project', { exact: true }).fill('UI audit board');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  assert.ok(
    (await page.locator('main').innerText()).includes('UI audit board'),
  );
  checks.push('Project creation');
  await page.setViewportSize({ width: 390, height: 900 });
  await visit('/');
  await page
    .getByRole('button', { name: 'Open tools panel', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  assert.equal(
    await dialog
      .getByRole('heading', { name: 'Tools', exact: true })
      .isVisible(),
    true,
  );
  await dialog.getByRole('link', { name: 'Impedance', exact: true }).click();
  await page.waitForURL('**/impedance');
  assert.equal(await dialog.isVisible(), false);
  await page
    .getByRole('button', { name: 'Open tools panel', exact: true })
    .click();
  await page.keyboard.press('Escape');
  assert.equal(await dialog.isVisible(), false);
  checks.push('Mobile drawer navigation and Escape');
  await page.setViewportSize({ width: 1600, height: 1050 });
  await visit('/tools?group=Thermal');
  assert.equal(
    await page.getByRole('heading', { name: 'Thermal tools' }).isVisible(),
    true,
  );
  await visit('/guides?q=I2C');
  assert.ok(
    (await page.locator('main').innerText()).includes('I²C Pull-up Resistors'),
  );
  checks.push('Tool categories and guide filtering');
  const report = {
    routes: routes.length,
    widths: [1600, 390, 320],
    checks,
    errors,
    issues,
  };
  writeFileSync(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  assert.deepEqual(errors, [], 'Browser errors');
  assert.deepEqual(issues, [], 'Layout issues');
} finally {
  writeFileSync(
    resolve(out, 'report.json'),
    JSON.stringify(
      {
        routes: routes.length,
        widths: [1600, 390, 320],
        checks,
        errors,
        issues,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
