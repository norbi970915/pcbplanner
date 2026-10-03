import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const release = process.argv[3] ?? 'local';
const out = resolve('dist-check/favorites');
mkdirSync(out, { recursive: true });
const profile = resolve(out, 'profile-' + Date.now());
const KEY = 'pcbtk-favorites';
const checks = [];
const errors = [];
let context;
function observe(page) {
  page.on('pageerror', error => errors.push(error.message));
  return page;
}
async function launch() {
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: 'msedge', headless: true, serviceWorkers: 'block',
    viewport: { width: 1600, height: 1000 },
  });
  await ctx.addInitScript(() => {
    localStorage.setItem('pcbplanner:analytics-consent', JSON.stringify({ choice: 'declined', updatedAt: new Date().toISOString() }));
    sessionStorage.setItem('pcbtk-settings', JSON.stringify({ theme: 'dark', unit: 'mm' }));
  });
  return ctx;
}
async function visit(page, path) {
  await page.goto(base + path + '?release=' + release, { waitUntil: 'networkidle' });
  await page.locator('.favorites-navigation').first().waitFor({ state: 'attached' });
}
async function pinned(page, expected) {
  await page.waitForFunction(expected => {
    const actual = [...document.querySelectorAll('.tools-panel .favorites-navigation a')].map(a => new URL(a.href).pathname);
    return JSON.stringify(actual) === JSON.stringify(expected);
  }, expected);
}
try {
  context = await launch();
  const page = observe(await context.newPage());
  await visit(page, '/tools');
  assert.match(await page.locator('.tools-panel .favorites-empty').innerText(), /Star a tool/);
  const sidebar = page.locator('.tools-panel .tools-navigation');
  const addImpedance = sidebar.getByRole('button', { name: 'Add Impedance Calculator to favorites', exact: true });
  await addImpedance.focus();
  await page.keyboard.press('Enter');
  await pinned(page, ['/impedance']);
  assert.equal(new URL(page.url()).pathname, '/tools');
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY), ['/impedance']);
  await sidebar.getByRole('button', { name: 'Add Via Calculator to favorites', exact: true }).click();
  await pinned(page, ['/impedance', '/via']);
  await page.reload({ waitUntil: 'networkidle' });
  await pinned(page, ['/impedance', '/via']);
  checks.push('Sidebar stars, keyboard activation, localStorage and reload persistence');

  await sidebar.locator('.favorites-navigation a[href="/via"]').click();
  await page.locator('.tool-page').waitFor();
  const heading = page.locator('.tool-page > .tool-heading');
  const headerStar = heading.locator('.favorite-button');
  assert.equal(await headerStar.getAttribute('aria-pressed'), 'true');
  await headerStar.click();
  await pinned(page, ['/impedance']);
  await headerStar.click();
  await pinned(page, ['/impedance', '/via']);
  await page.screenshot({ path: resolve(out, 'desktop-dark.png') });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.screenshot({ path: resolve(out, 'desktop-light.png') });
  checks.push('Calculator heading star and navigation to pinned tools in both themes');

  const second = observe(await context.newPage());
  await visit(second, '/tools');
  await second.evaluate(key => localStorage.setItem(key, JSON.stringify(['/trace-width', '/trace-width', '/not-a-tool', 42])), KEY);
  await pinned(page, ['/trace-width']);
  await second.reload({ waitUntil: 'networkidle' });
  await pinned(second, ['/trace-width']);
  await second.evaluate(key => localStorage.setItem(key, '{bad-json'), KEY);
  await pinned(page, []);
  await second.reload({ waitUntil: 'networkidle' });
  await pinned(second, []);
  await second.locator('.tools-panel').getByRole('button', { name: 'Add Impedance Calculator to favorites', exact: true }).click();
  await pinned(page, ['/impedance']);
  await second.evaluate(() => localStorage.clear());
  await pinned(page, []);
  await second.reload({ waitUntil: 'networkidle' });
  await second.locator('.tools-panel').getByRole('button', { name: 'Add Impedance Calculator to favorites', exact: true }).click();
  await pinned(page, ['/impedance']);
  await second.close();
  checks.push('Cross-tab updates, cleared storage, corrupt data and unknown/duplicate paths');

  await context.close();
  context = await launch();
  const reopened = observe(await context.newPage());
  await visit(reopened, '/tools');
  await pinned(reopened, ['/impedance']);
  checks.push('Favorites persist after closing and reopening the browser profile');

  for (const width of [390, 320]) {
    await reopened.setViewportSize({ width, height: 900 });
    await visit(reopened, '/via');
    const mobileStar = reopened.locator('.mobile-tool-heading .favorite-button');
    if (await mobileStar.getAttribute('aria-pressed') === 'true') await mobileStar.click();
    await mobileStar.click();
    assert.equal(await mobileStar.getAttribute('aria-pressed'), 'true');
    await reopened.getByRole('button', { name: 'Open tools panel', exact: true }).click();
    const drawer = reopened.getByRole('dialog');
    await drawer.locator('.favorites-navigation a[href="/via"]').waitFor();
    await drawer.locator('.favorites-navigation').getByRole('button', { name: 'Remove Via Calculator from favorites', exact: true }).click();
    assert.equal(await drawer.locator('.favorites-navigation a[href="/via"]').count(), 0);
    assert.equal(new URL(reopened.url()).pathname, '/via');
    await drawer.getByRole('button', { name: 'Add Via Calculator to favorites', exact: true }).click();
    await drawer.locator('.favorites-navigation a[href="/impedance"]').click();
    await drawer.waitFor({ state: 'hidden' });
    assert.equal(new URL(reopened.url()).pathname, '/impedance');
    await reopened.locator('.mobile-tool-heading .favorite-button[aria-pressed="true"]').waitFor();
    assert.ok(await reopened.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Mobile page overflow');
    await reopened.screenshot({ path: resolve(out, 'mobile-' + width + '.png') });
  }
  checks.push('390px and 320px mobile headings, drawer toggles and drawer navigation');

  const blocked = await context.browser().newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block' });
  await blocked.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } });
  });
  const fallback = observe(await blocked.newPage());
  await visit(fallback, '/tools');
  await fallback.locator('.tools-panel').getByRole('button', { name: 'Add Via Calculator to favorites', exact: true }).click();
  await pinned(fallback, ['/via']);
  await blocked.close();
  checks.push('Storage-blocked browser still supports favorites during the session');
  assert.deepEqual(errors, []);
  const report = { result: 'PASS', base, release, checks, browserErrors: errors };
  writeFileSync(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await context?.close();
}
