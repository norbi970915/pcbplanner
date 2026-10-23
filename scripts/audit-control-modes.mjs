// Discover conditional input layouts by exercising every select option, radio and checkbox.
// Also validates edits in every discovered layout and navigation/history for every calculator.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const base = (process.argv[2] ?? 'http://127.0.0.1:5186').replace(/\/$/, '');
const out = process.argv[3] ?? 'dist-check/control-modes'; mkdirSync(out, { recursive: true });
const tools = readFileSync('src/tools/registry.ts', 'utf8').split(/\n\s*path:\s*/).slice(1).map(block => ({ path: /^'([^']+)'/.exec(block)?.[1], nav: /\n\s*nav:\s*(['"])(.*?)\1,/.exec(block)?.[2] })).filter(t => t.path);
const routes = process.env.ONLY ? process.env.ONLY.split(',') : tools.map(t => t.path);
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge', headless: true });
const report = { base, started: new Date().toISOString(), routes: [], failures: [], checks: 0 };
const scope = 'aside.order-first,main';
let current = '', page;
function check(ok, message) { report.checks++; assert(ok, current + ': ' + message); }
async function idle() {
  await page.waitForTimeout(120);
  // A paused headline also carries this flag; an invalid draft is settled, not a pending solve.
  await page.waitForFunction(() => !!document.querySelector('[data-inputs-invalid="true"]') || ![...document.querySelectorAll('[data-result-busy="true"]')].some(el => el.getClientRects().length), null, { timeout: 90000 });
}
async function expand() {
  for (const root of ['aside.order-first','main']) {
    for (let k = 0; k < 30; k++) {
      const toggle = page.locator(root + ' button.properties-toggle[aria-expanded="false"]').first();
      if (!await toggle.count()) break; await toggle.click();
    }
    for (let k = 0; k < 30; k++) {
      const summary = page.locator(root + ' details:not([open]) > summary').filter({ visible: true }).first();
      if (!await summary.count()) break; await summary.click();
    }
  }
}
async function inventory() {
  return page.locator(scope).evaluateAll(roots => {
    const controls = roots.flatMap(root => [...root.querySelectorAll('input,select,textarea,[role="radio"],button')]);
    // Fullscreen leaves the underlying form laid out, but users cannot interact with it.
    const activeRoot = document.fullscreenElement || document.querySelector('.fixed.inset-0[class~="z-[200]"]');
    const counts = new Map();
    return controls.filter(el => (!activeRoot || activeRoot.contains(el)) && el.getClientRects().length && el.checkVisibility() && !el.disabled && !el.closest('.design-comparison')).map(el => {
      const label = (el.getAttribute('aria-label') || el.labels?.[0]?.innerText || el.textContent || el.title || el.name || '?').replace(/\s+/g, ' ').trim();
      const group = el.closest('[role="radiogroup"]')?.getAttribute('aria-label') || '';
      const kind = el.getAttribute('role') === 'radio' ? 'radio' : el.closest('nav[aria-label="Project views"]') ? 'view' : el.hasAttribute('aria-pressed') && !el.classList.contains('favorite-button') ? 'toggle' : el.tagName === 'SELECT' ? 'select' : el.tagName === 'BUTTON' ? 'button' : el.type;
      const stem = [kind, label.replace(/\s*\(changed\)/g, ''), group].join('|'), n = counts.get(stem) || 0; counts.set(stem, n + 1);
      const key = stem + '|' + n; el.setAttribute('data-audit-control', key);
      return { key, label, group, kind, value: el.value, checked: el.checked ?? (el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-current') === 'page'), numeric: el.inputMode === 'decimal', optional: /\boptional\b/i.test(label), code: el.getAttribute('data-field') === 'code', invalid: el.getAttribute('aria-invalid'), options: el.tagName === 'SELECT' ? [...el.options].filter(o => !o.disabled).map(o => o.value) : undefined };
    });
  });
}
const control = key => page.locator('[data-audit-control=' + JSON.stringify(key) + ']').filter({ visible: true });
// Schema ignores selected values and duplicate numeric rows, but includes option sets and field labels.
const schema = controls => [...new Set(controls.filter(c => c.kind !== 'button' && c.kind !== 'file' && !(current === '/stackup' && c.kind === 'checkbox')).map(c => [c.kind, c.label.replace(/\s*\(changed\)/g, '').replace(/\d+/g, '#'), c.group].join('|')))].sort().join('\n');
const stackupControlKey = c => [c.kind, c.label.replace(/\d+/g, '#'), c.group, c.key.split('|').at(-1)].join('|');
const discoversStackupControl = c => !['checkbox', 'file'].includes(c.kind) && !/^(Copy result|Undo |Redo )/.test(c.label);
async function clean(errors, step) {
  check(errors.length === 0, step + ': browser errors ' + errors.splice(0).join('; '));
  check(!await page.getByRole('button', { name: 'Reset this tool', exact: true }).count(), step + ': tool crashed');
  const text = await page.locator('main').innerText();
  check(!/\bNaN\b|\bInfinity\b|\bundefined\b|\[object Object\]/.test(text), step + ': nonfinite or internal text');
}
async function replay(route, actions) {
  // Each replay uses an isolated test context. Clear tool-specific view/draft keys too:
  // the stack manager persists its selected tab independently of its input URL.
  if (page.url().startsWith(base)) await page.evaluate(() => sessionStorage.clear());
  // Reload the fixture through its UI while retaining the worker pool between mode cases.
  // Cold page loading is covered on entry/reload; resetting and closing clears all project overrides.
  let reusedProjectPage = false;
  if (route === '/kicad-project' && !process.env.ACTION_REPORTS && page.url().startsWith(base + route)) {
    const exitFullScreen = page.getByRole('button', { name: 'Exit full screen', exact: true });
    if (await exitFullScreen.count()) { await exitFullScreen.click(); await exitFullScreen.waitFor({ state: 'hidden' }); }
    const reset = page.getByRole('button', { name: 'Reset', exact: true });
    if (await reset.count()) {
      await reset.click();
      const close = page.getByRole('button', { name: 'Close project', exact: true });
      if (await close.count()) { page.once('dialog', dialog => dialog.accept()); await close.click(); await close.waitFor({ state: 'hidden' }); }
      reusedProjectPage = true;
    }
  }
  if (!reusedProjectPage) await page.goto(base + route, { waitUntil: 'networkidle' });
  await idle(); await expand();
  if (route === '/kicad-project') {
    const example = page.getByRole('button', { name: 'Try an example', exact: true });
    if (await example.count()) { await example.click(); await page.getByTestId('example-scenario').waitFor(); }
    await page.waitForFunction(() => document.body.textContent.includes('routing check done'), null, { timeout: 90000 }); await idle(); await expand();
  }
  if (route === '/gerber-viewer') {
    await page.getByRole('button', { name: 'Compare revisions', exact: true }).click();
    await page.getByRole('button', { name: 'Try sample comparison', exact: true }).click(); await idle(); await expand();
  }
  if (route === '/s-parameter-viewer') {
    let data = '# GHz S RI R 50\n';
    for (let k = 1; k <= 64; k++) {
      const f = k / 10, phase = -2 * Math.PI * f * .1, values = [];
      for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) values.push(row === col ? '.05 0' : Math.abs(row - col) === 2 ? `${Math.cos(phase)} ${Math.sin(phase)}` : '0 0');
      data += f + ' ' + values.join(' ') + '\n';
    }
    await page.getByLabel('Choose a Touchstone file', { exact: true }).setInputFiles({ name: 'control-audit.s4p', mimeType: 'text/plain', buffer: Buffer.from(data) });
    await page.locator('main').getByText(/4-port.*64 points/).waitFor(); await idle(); await expand();
  }
  for (const action of actions) {
    await inventory(); const target = control(action.key);
    if (action.kind === 'select') await target.selectOption(action.optionIndex === undefined ? action.value : { index: action.optionIndex });
    else if (action.kind === 'checkbox') await target.setChecked(action.value);
    else await target.click();
    await idle(); await expand();
  }
}
// Reuse recorded reachable layouts to exercise buttons absent from the default page.
if (process.env.ACTION_REPORTS) {
  const byRoute = new Map();
  for (const filename of process.env.ACTION_REPORTS.split(';')) {
    for (const entry of JSON.parse(readFileSync(filename, 'utf8')).routes) {
      const layouts = byRoute.get(entry.route) ?? []; layouts.push(...entry.layouts); byRoute.set(entry.route, layouts);
    }
  }
  try {
    for (const [route, layouts] of byRoute) {
      if (process.env.ONLY && !routes.includes(route)) continue;
      current = route;
      const initial = new Set(layouts[0]?.controls.filter(c => c.kind === 'button').map(c => c.key));
      const seen = new Set(), plans = [];
      for (const layout of layouts) for (const item of layout.controls.filter(c => c.kind === 'button')) {
        if (seen.has(item.key) || /^(Undo |Redo |▼|Go to input|Reset$|Report$|Favorite$|Compare$)/.test(item.label)) continue;
        if (initial.has(item.key) && !['/gerber-viewer', '/kicad-project', '/s-parameter-viewer'].includes(route)) continue;
        seen.add(item.key); plans.push({ actions: layout.actions, item });
      }
      if (!plans.length) continue;
      console.log('ACTIONS ' + route + ': ' + plans.length);
      const entry = { route, actions: [], failures: [] }; report.routes.push(entry);
      const context = await browser.newContext({ viewport: { width: 1600, height: 1050 }, serviceWorkers: 'block', acceptDownloads: true });
      await context.addInitScript(() => localStorage.setItem('pcbplanner:analytics-consent', JSON.stringify({ choice: 'declined', version: 2, updatedAt: new Date().toISOString() })));
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      page = await context.newPage(); page.setDefaultTimeout(15000); const errors = [];
      page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
      try {
        for (const plan of plans) {
          try {
            await replay(route, plan.actions); await inventory(); const target = control(plan.item.key);
            if (!await target.count()) throw new Error('Recorded button is absent: ' + plan.item.label);
            const isHelp = await target.evaluate(el => el.classList.contains('field-help-trigger'));
            const isCopy = await target.evaluate(el => el.classList.contains('copy-result'));
            if (isCopy) {
              const expected = await target.evaluate(el => {
                const row = el.closest('[data-copy-result]'), text = selector => (row.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
                const unit = text('[data-copy-unit]'); return text('[data-copy-label]') + ': ' + text('[data-copy-value]') + (unit ? ' ' + unit : '');
              });
              await target.click(); await page.waitForFunction(expected => navigator.clipboard.readText().then(value => value === expected), expected);
              check(true, plan.item.label + ' copies the current conditional result');
            } else if (isHelp) {
              await target.click(); const popup = page.locator('.field-help-popover:visible'); await popup.waitFor();
              check((await popup.innerText()).length > 15, plan.item.label + ' explains the conditional field');
              await page.keyboard.press('Escape'); await popup.waitFor({ state: 'hidden' });
            } else {
              const chooser = page.waitForEvent('filechooser', { timeout: 400 }).catch(() => null);
              const download = page.waitForEvent('download', { timeout: 1000 }).catch(() => null);
              await target.click(); const picker = await chooser;
              if (picker) await picker.setFiles(await picker.element().getAttribute('webkitdirectory') !== null ? resolve('public/examples') : []);
              const saved = await download; if (saved) check(readFileSync(await saved.path()).length > 0, plan.item.label + ' saves a nonempty file');
              await idle(); if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape');
            }
            await clean(errors, plan.item.label); entry.actions.push(plan.item.label); console.log('  PASS ' + plan.item.label);
          } catch (error) {
            const failure = { route, action: plan.item.label, error: error.stack }; entry.failures.push(failure); report.failures.push(failure);
            console.error('FAIL ' + route + ': ' + plan.item.label + ': ' + error.message);
            await page.screenshot({ path: out + '/' + route.slice(1) + '-action-failure.png' }).catch(() => {});
          }
        }
      } finally { await context.close(); writeFileSync(out + '/report.json', JSON.stringify(report, null, 2)); }
    }
  } finally { await browser.close(); }
  report.finished = new Date().toISOString(); writeFileSync(out + '/report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ routes: report.routes.length, actions: report.routes.reduce((n, r) => n + r.actions.length, 0), checks: report.checks, failures: report.failures.length }));
  process.exitCode = report.failures.length ? 1 : 0;
} else try {
  for (const route of routes) {
    current = route; console.log('ROUTE ' + route);
    const context = await browser.newContext({ viewport: { width: 1600, height: 1050 }, serviceWorkers: 'block', acceptDownloads: true });
    await context.addInitScript(() => localStorage.setItem('pcbplanner:analytics-consent', JSON.stringify({ choice: 'declined', version: 2, updatedAt: new Date().toISOString() })));
    await context.grantPermissions(['clipboard-read','clipboard-write']).catch(() => {});
    page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(15000);
    const entry = { route, layouts: [], fields: [], selections: [], buttons: [], navigation: [], failures: [] }; report.routes.push(entry);
    try {
      await page.goto(base + route, { waitUntil: 'networkidle' }); await idle(); await expand();
      const initial = await inventory();
      const queue = [[]], discovered = new Set(); discovered.add(schema(initial));
      // Project and stack editors expose independent rows. Discover new controls rather
      // than every subset of layer roles, highlighted nets or reference editors.
      const distinctEditor = ['/stackup', '/kicad-project'].includes(route);
      const stackupControls = new Set(initial.filter(discoversStackupControl).map(stackupControlKey));
      const testedFields = new Set(), fullyTestedFields = new Set(), testedActions = new Set();
      for (let state = 0; state < queue.length; state++) {
        const actions = queue[state]; await replay(route, actions); let items = await inventory();
        console.log('  testing layout ' + state + ': ' + items.length + ' controls');
        entry.layouts.push({ actions, controls: items });
        entry.buttons.push(...items.filter(c => c.kind === 'button').map(c => ({ state, label: c.label })));
        await clean(errors, 'layout ' + state);
        for (const item of items.filter(c => ['text','number','range','textarea','color'].includes(c.kind))) {
          // Check repeated fields separately; the same named field in a distinct layout is checked again.
          const fieldKey = state + '|' + item.key; if (testedFields.has(fieldKey)) continue; testedFields.add(fieldKey);
          await inventory();
          const input = control(item.key), original = await input.inputValue();
          if (item.kind === 'range' || item.kind === 'color') {
            if (item.kind === 'range') { await input.focus(); await input.press('Home'); await idle(); await clean(errors,item.label+' minimum'); await input.press('End'); await idle(); await clean(errors,item.label+' maximum'); }
            for (const value of item.kind === 'color' ? ['#112233','#aabbcc',original] : [original]) { await input.evaluate((el,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value); await idle(); await clean(errors,item.label+'='+value); entry.fields.push({state,label:item.label,value}); }
            continue;
          }
          if (process.env.VERBOSE) console.log('    FIELD ' + JSON.stringify(item));
          const repeated = fullyTestedFields.has(item.key); fullyTestedFields.add(item.key);
          const number = Number(original), probe = String(Number.isFinite(number) && number !== 0 ? Number((number*1.05).toPrecision(6)) : 1);
          const values = item.numeric ? repeated ? [probe, '0', '1e308'] : [probe, '', '-', 'abc', '0', '-5', '1e9', '1e308'] : item.invalid !== null ? ['', 'abc', '1e308'] : ['', '<audit & "input">', original + ' audit'];
          for (const value of values) {
            if (process.env.VERBOSE) console.log('      fill ' + value);
            const before = await input.inputValue();
            await input.fill(value); if (process.env.VERBOSE) console.log('      blur'); await input.press('Tab'); if (process.env.VERBOSE) console.log('      idle'); await idle(); await inventory();
            await clean(errors, 'layout ' + state + ' ' + item.label + '=' + value);
            if (item.numeric && ['', '-', 'abc'].includes(value)) check(await input.getAttribute('aria-invalid') === 'true' || !!await page.locator('main [role="alert"],.inputs-paused').count() || await input.inputValue()===before || (value === '' && item.optional && await input.inputValue() === ''), item.label + ' flags, rejects or explicitly permits incomplete input');
            entry.fields.push({ state, label: item.label, value });
          }
          if (item.kind !== 'range') { await input.fill(original); await input.press('Tab'); await idle(); await clean(errors, item.label + ' restored'); }
          console.log('    field ' + item.label + ' checked');
        }
        // Replay resets transient drafts before mode exploration.
        await replay(route, actions); items = await inventory();
        for (const item of items.filter(c => ['select','radio','checkbox','view','toggle'].includes(c.kind))) {
          const values = item.kind === 'select' ? item.options : item.kind === 'checkbox' || item.kind === 'toggle' ? [!item.checked] : item.checked ? [] : [true];
          const membership = route === '/stackup' && item.kind === 'checkbox';
          const library = membership || route === '/kicad-project' && ['select', 'checkbox', 'toggle'].includes(item.kind) || item.kind === 'select' && (item.options.length > 8 || item.label === 'unit' || /Stackup|Material|^Layer$/.test(item.label));
          const actionKey = value => (library ? '' : schema(items)) + '|' + item.key + '|' + item.options?.join(',') + '|' + value;
          const pendingValues = values.filter(value => !testedActions.has(actionKey(value)));
          if (!pendingValues.length) continue;
          await replay(route, actions);
          for (const value of pendingValues) {
            // Library lists and unit prefixes are tested exhaustively once per option set;
            // small mode selectors are revisited for each distinct exposed input layout.
            testedActions.add(actionKey(value));
            // Gerber layer IDs belong to the imported file instance and change on replay.
            const optionIndex = route === '/gerber-viewer' && item.kind === 'select' ? item.options.indexOf(value) : undefined;
            await inventory(); const target = control(item.key);
            if (item.kind === 'select') await target.selectOption(optionIndex === undefined ? value : { index: optionIndex }); else if (item.kind === 'checkbox') await target.setChecked(value); else await target.click();
            await idle(); await expand(); await clean(errors, item.label + '=' + value);
            if (item.kind === 'checkbox') check(await target.isChecked() === value, item.label + ' accepts its checked state');
            const next = await inventory(), signature = schema(next);
            // Rows may remount when their selected component changes. Inventory restores stable keys.
            if (item.kind === 'select') { const selected=await target.inputValue(); check(optionIndex !== undefined ? await target.evaluate((el, i) => el.selectedIndex === i, optionIndex) : selected === value || (item.label.startsWith('Apply ') && selected===''), item.label + ' accepts option ' + value); }
            entry.selections.push({ state, label: item.label, kind: item.kind, value });
            if (entry.selections.length % 10 === 0) console.log('    ' + entry.selections.length + ' options checked');
            // Membership toggles are checked individually. Active-region selection exposes each
            // region's editable cells; enumerating every subset would duplicate those field types.
            // Independent per-layer reference-frequency editors produce many subsets of the
            // same controls. Cover each distinct editor/action, including repeated row ordinals,
            // rather than every subset of editors being present simultaneously.
            const revealsStackupControl = distinctEditor && next.filter(discoversStackupControl).some(c => !stackupControls.has(stackupControlKey(c)));
            if (distinctEditor) for (const c of next.filter(discoversStackupControl)) stackupControls.add(stackupControlKey(c));
            if (!membership && (distinctEditor ? revealsStackupControl : !discovered.has(signature))) { discovered.add(signature); queue.push([...actions, { key: item.key, kind: item.kind, value, ...(optionIndex === undefined ? {} : { optionIndex }) }]); }
          }
        }
        writeFileSync(out + '/progress.json', JSON.stringify(report, null, 2));
        console.log(`  layout ${state + 1}/${queue.length}, ${entry.fields.length} field edits, ${entry.selections.length} option actions`);
      }
      await replay(route, []); const first = (await inventory()).find(c => c.numeric && c.kind === 'text');
      if (first) {
        const input = control(first.key), original = await input.inputValue(), num = Number(original);
        // The first field can be an integer count (vias, signal layers); use a whole-step edit.
        const value = String(Number.isFinite(num) ? Number((num + 1).toPrecision(6)) : 1);
        await input.fill(value); await input.press('Tab'); await idle(); await page.waitForTimeout(400);
        const edited = page.url();
        // Click a different tool's link in the same application, return with the browser Back command.
        const link = page.locator('a[href^="/"]').filter({ visible: true });
        let destination;
        for (let i = 0; i < await link.count(); i++) { const href = await link.nth(i).getAttribute('href'); if (tools.some(t => t.path === href) && href !== route) { destination = link.nth(i); break; } }
        if (destination) {
          await destination.click(); await idle(); await page.goBack({ waitUntil: 'networkidle' }); await idle(); await expand(); await inventory();
          check(await control(first.key).inputValue() === value, 'Back restores edited value'); check(page.url() === edited, 'Back restores edited URL'); entry.navigation.push('Tool link and browser Back preserve inputs');
          await page.goForward({ waitUntil: 'networkidle' }); await idle(); await page.goBack({ waitUntil: 'networkidle' }); await idle(); await expand(); await inventory();
          check(await control(first.key).inputValue() === value, 'Forward then Back preserves edited value'); entry.navigation.push('Forward and Back preserve inputs');
        }
        const undo = page.getByRole('button', { name: 'Undo last design change', exact: true }).filter({ visible: true });
        if (await undo.count() && await undo.isEnabled()) {
          await undo.click(); await idle(); await inventory(); check(await control(first.key).inputValue() === original, 'Undo restores original field');
          await page.getByRole('button', { name: 'Redo last design change', exact: true }).filter({ visible: true }).click(); await idle(); await inventory(); check(await control(first.key).inputValue() === value, 'Redo restores edited field'); entry.navigation.push('Undo and Redo round trip');
        }
        await page.reload({ waitUntil: 'networkidle' }); await idle(); await expand(); await inventory();
        if (route === '/gerber-viewer') { check(await page.getByRole('button',{name:'Try sample board',exact:true}).count()===1,'Reload clears volatile Gerber files as documented'); entry.navigation.push('Reload clears volatile files as documented'); }
        else { check(await control(first.key).inputValue() === value, 'Reload preserves edited field'); entry.navigation.push('Reload preserves inputs'); }
      }
      await clean(errors, 'navigation');
    } catch (error) {
      const failure = { route, error: error.stack }; entry.failures.push(failure); report.failures.push(failure);
      console.error('FAIL ' + route + ' ' + error.message); await page.screenshot({ path: out + '/' + route.slice(1) + '-failure.png' }).catch(() => {});
    } finally { await context.close(); writeFileSync(out + '/report.json', JSON.stringify(report, null, 2)); }
  }
} finally { await browser.close(); }
if (!process.env.ACTION_REPORTS) {
report.finished = new Date().toISOString(); writeFileSync(out + '/report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ routes: report.routes.length, layouts: report.routes.reduce((n,r) => n + r.layouts.length,0), fields: report.routes.reduce((n,r) => n + r.fields.length,0), selections: report.routes.reduce((n,r) => n + r.selections.length,0), checks: report.checks, failures: report.failures.length }));
process.exitCode = report.failures.length ? 1 : 0;
}
