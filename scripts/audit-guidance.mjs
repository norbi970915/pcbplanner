import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import { chromium } from 'playwright-core';
const base = process.argv[2] ?? 'http://127.0.0.1:4180';
const source = readFileSync('src/data/guidance.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { GUIDED_CATEGORIES: categories, WORKSPACE_TOPICS: topics } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const paths = file => new Set([...readFileSync(file, 'utf8').matchAll(/path: '([^']+)'/g)].map(match => match[1]));
const tools = paths('src/tools/registry.ts'), guides = paths('src/guides/registry.ts');
for (const category of categories) for (const task of category.tasks) {
  assert(tools.has(task.tool), 'Missing tool ' + task.tool);
  if (task.guide) assert(guides.has(task.guide), 'Missing guide ' + task.guide);
}
mkdirSync('dist-check/guidance', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1050 }, serviceWorkers: 'block' });
  await context.addInitScript(() => {
    localStorage.setItem('pcbplanner:analytics-consent', JSON.stringify({ choice: 'declined', version: 2, updatedAt: new Date().toISOString() }));
    sessionStorage.setItem('pcbtk-settings', JSON.stringify({ unit: 'mm', theme: 'dark' }));
  });
  const page = await context.newPage(), errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(base).origin) external.push(request.url()); });
  const panel = page.getByRole('dialog', { name: 'Help me choose', exact: true });
  const header = page.locator('.guidance-trigger');
  const open = async () => {
    if (await header.isVisible()) await header.click();
    else {
      const menu = page.getByRole('button', { name: 'Help', exact: true });
      await menu.focus(); await menu.press('Enter');
      await page.getByRole('menuitem', { name: 'Help me choose', exact: true }).click();
    }
    await panel.waitFor();
  };
  const category = async id => panel.locator('.guidance-category').filter({ hasText: categories.find(item => item.id === id).title }).click();
  const task = async (categoryId, taskId) => panel.getByRole('button', { name: categories.find(item => item.id === categoryId).tasks.find(item => item.id === taskId).label, exact: true }).click();
  const noOverflow = async () => {
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page overflow');
    assert(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Panel overflow');
    assert(await panel.locator('.guidance-body').evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Panel body overflow');
  };
  await page.goto(base + '/');
  await page.locator('.home-guidance-invitation').waitFor();
  assert.equal(await panel.count(), 0, 'Guidance must not open automatically');
  assert.equal(await page.getByRole('button', { name: 'Create a project', exact: true }).count(), 0);
  const homeTrigger = page.locator('.home-guidance-invitation button');
  await homeTrigger.click(); await panel.waitFor();
  await noOverflow();
  await page.screenshot({ path: 'dist-check/guidance/start-desktop.png' });
  for (const group of categories) {
    await category(group.id);
    for (const item of group.tasks) {
      await task(group.id, item.id);
      assert.equal(await panel.locator('.guidance-recommendation a').getAttribute('href'), item.to ?? item.tool);
      assert.equal(await panel.locator('.guidance-prepare li').count(), item.prepare.length);
      if (item.guide) assert.equal(await panel.locator('.guidance-guide').getAttribute('href'), item.guide);
      else assert.equal(await panel.locator('.guidance-guide').count(), 0);
      await panel.getByRole('button', { name: group.title, exact: true }).click();
    }
    await panel.getByRole('button', { name: 'All tasks', exact: true }).click();
  }
  await category('communication'); await task('communication', 'i2c');
  assert.equal(await panel.locator('.guidance-recommendation a').evaluate(el => getComputedStyle(el).color), 'rgb(255, 255, 255)');
  await page.screenshot({ path: 'dist-check/guidance/i2c-desktop.png' });
  await panel.getByRole('tab', { name: 'Use the workspace', exact: true }).click();
  for (const item of topics) {
    await panel.locator('.guidance-choice').filter({ hasText: item.title }).click();
    assert.equal(await panel.locator('.guidance-steps li').count(), item.steps.length);
    assert.equal(await panel.locator('.guidance-workspace-note').innerText(), item.note);
    if (item.action) assert.equal(await panel.getByRole('link', { name: item.action.label, exact: true }).getAttribute('href'), item.action.to);
    await panel.getByRole('button', { name: 'Workspace topics', exact: true }).click();
  }
  await page.keyboard.press('Escape'); await panel.waitFor({ state: 'detached' });
  assert(await homeTrigger.evaluate(el => el === document.activeElement), 'Escape should restore focus to the opener');
  await open();
  const findTab = panel.getByRole('tab', { name: 'Find a tool', exact: true });
  const workspaceTab = panel.getByRole('tab', { name: 'Use the workspace', exact: true });
  await findTab.focus(); await findTab.press('ArrowRight');
  await panel.getByRole('tab', { name: 'Use the workspace', exact: true, selected: true }).waitFor();
  assert(await workspaceTab.evaluate(el => el === document.activeElement), 'Arrow navigation must keep focus in the tab list');
  await workspaceTab.press('ArrowLeft'); await panel.getByRole('tab', { name: 'Find a tool', exact: true, selected: true }).waitFor();
  await category('communication'); await task('communication', 'i2c');
  await panel.locator('.guidance-recommendation a').click(); await page.waitForURL('**/i2c-pullup');
  await page.getByRole('heading', { name: 'I²C Pull-up Calculator', exact: true }).waitFor();
  assert.equal(await panel.count(), 0);
  await open(); await category('communication'); await task('communication', 'i2c');
  await panel.locator('.guidance-guide').click(); await page.waitForURL('**/guides/i2c-pullup-resistor-calculation');
  await page.locator('main h1').waitFor();
  // Help and returning to this tool preserve the current, non-default inputs.
  await page.goto(base + '/spi-timing?mhz=20');
  await page.getByRole('navigation', { name: 'Communication interfaces', exact: true }).waitFor();
  const original = page.url();
  await open(); await category('communication'); await task('communication', 'spi');
  assert.equal(await panel.locator('.guidance-recommendation a').getAttribute('href'), '/spi-timing?mhz=20');
  await panel.locator('.guidance-recommendation a').click(); await panel.waitFor({ state: 'detached' });
  assert.equal(page.url(), original);
  assert((await page.locator('main').innerText()).includes('no positive setup margin'));
  await open(); await page.mouse.click(10, 100); await panel.waitFor({ state: 'detached' });
  await page.goto(base + '/'); await page.locator('.home-guidance-invitation').waitFor();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 740 });
    await open(); await noOverflow();
    await page.screenshot({ path: 'dist-check/guidance/start-' + width + '.png' });
    await category('communication'); await task('communication', 'highspeed'); await noOverflow();
    await page.screenshot({ path: 'dist-check/guidance/result-' + width + '.png' });
    await panel.getByRole('tab', { name: 'Use the workspace', exact: true }).click();
    await panel.locator('.guidance-choice').filter({ hasText: 'Share a calculation' }).click(); await noOverflow();
    await page.screenshot({ path: 'dist-check/guidance/sharing-' + width + '.png' });
    await panel.getByRole('button', { name: 'Close guidance', exact: true }).click();
  }
  await page.setViewportSize({ width: 1500, height: 1050 });
  await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click();
  await open(); await category('layout'); await task('layout', 'trace'); await noOverflow();
  assert.equal(await panel.locator('.guidance-recommendation a').evaluate(el => getComputedStyle(el).color), 'rgb(255, 255, 255)');
  await page.screenshot({ path: 'dist-check/guidance/light-desktop.png' });
  await panel.getByRole('button', { name: 'Close guidance', exact: true }).click();
  await page.screenshot({ path: 'dist-check/guidance/home-light.png' });
  assert.deepEqual(errors, []); assert.deepEqual(external, [], 'Guidance must work without external services');
  console.log('Guidance passed: all ' + categories.reduce((sum, group) => sum + group.tasks.length, 0) + ' tool paths, all workspace topics, real tool/guide navigation, preserved URL inputs, keyboard and focus, 320/390 px, both themes, no external requests or browser errors.');
  await context.close();
} finally { await browser.close(); }
