import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const release = process.argv[3] ?? 'local';
const out = resolve('dist-check/carousel');
mkdirSync(out, { recursive: true });
const paths = [
 '/impedance', '/stackup', '/s-parameter-viewer', '/stackup-advisor',
 '/trace-width', '/via', '/pdn', '/power-tree', '/buck-converter',
 '/copper-heat-spreading',
];
const registry = readFileSync('src/tools/registry.ts', 'utf8');
for (const path of paths) assert.ok(registry.includes("path: '" + path + "'"), path);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
const checks = [];
function visibleCards() {
 const viewport = document.querySelector('[data-slot="carousel-content"]').getBoundingClientRect();
 return [...document.querySelectorAll('.featured-link')]
  .map(link => ({ path: new URL(link.href).pathname, rect: link.getBoundingClientRect() }))
  .filter(({ rect }) => rect.width > 0 && rect.left >= viewport.left - 2 && rect.right <= viewport.right + 2)
  .sort((a, b) => a.rect.left - b.rect.left)
  .map(({ path }) => path);
}
async function visible(page, expected) {
 await page.waitForFunction(({ expected }) => {
  const viewport = document.querySelector('[data-slot="carousel-content"]').getBoundingClientRect();
  const cards = [...document.querySelectorAll('.featured-link')]
   .map(link => ({ path: new URL(link.href).pathname, rect: link.getBoundingClientRect() }))
   .filter(({ rect }) => rect.width > 0 && rect.left >= viewport.left - 2 && rect.right <= viewport.right + 2)
   .sort((a, b) => a.rect.left - b.rect.left).map(({ path }) => path);
  return expected ? JSON.stringify(cards) === JSON.stringify(expected) : cards.length === 3;
 }, { expected }, { timeout: 10000 });
 assert.equal((await page.evaluate(visibleCards)).length, 3);
}
async function visit(page) {
 await page.goto(base + '/?release=' + release, { waitUntil: 'networkidle' });
 await page.locator('.featured-section').waitFor();
 await page.waitForFunction(() => !document.querySelector('[data-slot="carousel-next"]').disabled);
 await visible(page, paths.slice(0, 3));
}
async function context(options) {
 const ctx = await browser.newContext({ serviceWorkers: 'block', ...options });
 await ctx.addInitScript(() => {
  sessionStorage.setItem('pcbtk-settings', JSON.stringify({ theme: 'dark', unit: 'mm' }));
  localStorage.setItem('pcbplanner:analytics-consent', JSON.stringify({ choice: 'declined', updatedAt: new Date().toISOString() }));
 });
 const page = await ctx.newPage();
 page.on('pageerror', error => errors.push(error.message));
 return { ctx, page };
}
try {
 const { page } = await context({ viewport: { width: 1600, height: 1050 } });
 await visit(page);
 assert.deepEqual(await page.locator('.featured-link').evaluateAll(links => links.map(a => new URL(a.href).pathname)), paths);
 assert.equal(await page.locator('.featured-art > svg').count(), 10);
 const illustrations = await page.locator('.featured-art > svg').evaluateAll(svgs => svgs.map(svg => svg.innerHTML));
 assert.equal(new Set(illustrations).size, 10);
 assert.equal(await page.locator('.welcome-card .welcome-news').count(), 1);
 assert.doesNotMatch(await page.locator('main').innerText(), /Quick access|A closer look at your design|\d+\s+disciplines/);
 const next = page.getByRole('button', { name: 'Next featured tool', exact: true });
 const previous = page.getByRole('button', { name: 'Previous featured tool', exact: true });
 await previous.click();
 await visible(page, [paths[9], paths[0], paths[1]]);
 await next.click();
 await visible(page, paths.slice(0, 3));
 const seen = new Set(paths.slice(0, 3));
 await page.locator('.featured-section').screenshot({ path: resolve(out, 'desktop-0.png') });
 for (let step = 1; step <= 10; step++) {
  await next.click();
  const expected = [0, 1, 2].map(offset => paths[(step + offset) % paths.length]);
  await visible(page, expected);
  expected.forEach(path => seen.add(path));
  if ([3, 6, 9].includes(step)) await page.locator('.featured-section').screenshot({ path: resolve(out, 'desktop-' + step + '.png') });
 }
 assert.equal(seen.size, 10);
 checks.push('Ten unique illustrated tools; next/previous and continuous wrapping');
 await next.focus();
 await page.keyboard.press('ArrowRight');
 await visible(page, paths.slice(1, 4));
 await page.keyboard.press('ArrowLeft');
 await visible(page, paths.slice(0, 3));
 checks.push('Keyboard arrows');
 await page.locator('.featured-section').scrollIntoViewIfNeeded();
 const box = await page.locator('[data-slot="carousel-content"]').boundingBox();
 await page.mouse.move(box.x + box.width * .65, box.y + 75);
 await page.mouse.down();
 await page.mouse.move(box.x + box.width * .30, box.y + 75, { steps: 20 });
 await page.mouse.up();
 await visible(page);
 assert.notDeepEqual(await page.evaluate(visibleCards), paths.slice(0, 3));
 assert.equal(new URL(page.url()).pathname, '/');
 checks.push('Mouse dragging without accidental navigation');
 await visit(page);
 await page.locator('.featured-link').last().focus();
 await visible(page);
 assert.ok((await page.evaluate(visibleCards)).includes(paths[9]));
 checks.push('Keyboard focus brings offscreen tools into view');
 await visit(page);
 for (const theme of ['dark', 'light']) {
  if (theme === 'light') await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click();
  for (const width of [1600, 1024, 768, 390, 320]) {
   await page.setViewportSize({ width, height: 1050 });
   await visible(page, paths.slice(0, 3));
   await previous.click();
   await visible(page, [paths[9], paths[0], paths[1]]);
   await next.click();
   await visible(page, paths.slice(0, 3));
   const layout = await page.evaluate(() => {
    const main = document.querySelector('main');
    const carousel = document.querySelector('.featured-carousel').getBoundingClientRect();
    return {
     controlsInside: [...document.querySelectorAll(".featured-control")].every(button => {
      const r = button.getBoundingClientRect();
      return r.top >= carousel.top - 1 && r.left >= carousel.left - 1 && r.right <= carousel.right + 1;
     }),
     pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
     mainOverflow: main.scrollWidth > main.clientWidth + 1,
     titles: [...document.querySelectorAll('.featured-copy h3')].every(el => el.scrollWidth <= el.clientWidth + 1),
    };
   });
   assert.deepEqual(layout, { controlsInside: true, pageOverflow: false, mainOverflow: false, titles: true }, theme + ' ' + width);
   if (width === 1600 || width === 390 || width === 320) {
    await page.locator('.featured-section').screenshot({ path: resolve(out, theme + '-' + width + '.png') });
   }
  }
 }
 checks.push('Exactly three complete cards at five widths in both themes');
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await previous.click();
 await visible(page, [paths[9], paths[0], paths[1]]);
 await next.click();
 await visible(page, paths.slice(0, 3));
 checks.push('Reduced-motion preference');
 await page.locator('#home-search').fill('via current');
 await page.getByRole('heading', { name: 'Search results', exact: true }).waitFor();
 assert.equal(await page.locator('.featured-section').count(), 0);
 await page.locator('#home-search').press('Escape');
 await visible(page, paths.slice(0, 3));
 checks.push('Search and carousel restoration');

 const touch = await context({ viewport: { width: 390, height: 900 }, hasTouch: true, isMobile: true });
 await visit(touch.page);
 await touch.page.locator('.featured-section').scrollIntoViewIfNeeded();
 const touchBox = await touch.page.locator('[data-slot="carousel-content"]').boundingBox();
 const session = await touch.ctx.newCDPSession(touch.page);
 const x = touchBox.x + touchBox.width * .70, y = touchBox.y + 45;
 await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
 for (let step = 1; step <= 12; step++) {
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - touchBox.width * .4 * step / 12, y }] });
  await touch.page.waitForTimeout(16);
 }
 await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
 await visible(touch.page);
 assert.notDeepEqual(await touch.page.evaluate(visibleCards), paths.slice(0, 3));
 assert.equal(new URL(touch.page.url()).pathname, '/');
 checks.push('Real touch swipe with three cards after snapping');
 const visiblePath = (await touch.page.evaluate(visibleCards))[1];
 await touch.page.locator('.featured-link[href="' + visiblePath + '"]').tap();
 await touch.page.waitForURL(url => url.pathname === visiblePath);
 await touch.page.locator('.document-page').waitFor();
 checks.push('Touch tap opens a featured calculator');
 assert.deepEqual(errors, []);
 const report = { result: 'PASS', base, release, tools: 10, visibleCards: 3, checks, browserErrors: errors };
 writeFileSync(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
 console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
