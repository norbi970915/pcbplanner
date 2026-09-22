// End-to-end browser test suite for PCB Toolkit (production preview build).
//
// Usage:  node scripts/e2e.mjs [outDir] [baseUrl]
//   env ONLY=/impedance,/via   run the per-route sweep for these routes only
//   env SKIP=sweep,special,tabs,mobile   skip whole phases
//
// Needs a running preview server (npm run build && npx vite preview --port 4173).
// Uses playwright-core with the installed Microsoft Edge; no test runner.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(process.argv[2] ?? process.env.E2E_OUT ?? 'e2e-out');
const BASE = (process.argv[3] ?? process.env.BASE ?? 'http://localhost:4173').replace(/\/$/, '');
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const SKIP = new Set((process.env.SKIP ?? '').split(',').filter(Boolean));
fs.mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- routes
const here = path.dirname(fileURLToPath(import.meta.url));
const registrySrc = fs.readFileSync(path.join(here, '..', 'src', 'tools', 'registry.ts'), 'utf8');
const TOOLS = [...registrySrc.matchAll(/path:\s*'([^']+)',\s*title:\s*(['"])(.*?)\2,\s*nav:\s*(['"])(.*?)\4/g)].map((m) => ({ path: m[1], title: m[3], nav: m[5] }));
if (!TOOLS.length) throw new Error('could not parse routes from registry.ts');
const ROUTES = ['/', ...TOOLS.map((t) => t.path)];
const NO_PROPS = new Set(['/', '/units']);

// ---------------------------------------------------------------- results
const R = { pass: 0, fail: 0, failures: [], warnings: [] };
const seen = new Map();
let shotN = 0;
const slug = (s) => s.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').slice(0, 60) || 'home';
const log = (...a) => console.log(...a);

async function fail(page, route, step, evidence) {
  const ev = String(evidence).replace(/\s+/g, ' ').slice(0, 400);
  const key = `${route}|${step.replace(/"[^"]*"|=.*$/g, '')}|${ev}`;
  R.fail++;
  if (seen.has(key)) {
    seen.get(key).count++;
    return false;
  }
  const shot = path.join(OUT, `${String(++shotN).padStart(3, '0')}_${slug(route)}_${slug(step)}.png`);
  try {
    await withTimeout(page.screenshot({ path: shot, timeout: 10000 }), 12000, 'screenshot');
  } catch {
    /* page gone */
  }
  const f = { route, step, evidence: ev, shot, count: 1 };
  seen.set(key, f);
  R.failures.push(f);
  log(`  FAIL [${route}] ${step}: ${ev}`);
  return false;
}
async function check(page, cond, route, step, evidence) {
  if (cond) {
    R.pass++;
    return true;
  }
  return fail(page, route, step, evidence);
}
function warn(route, step, msg) {
  R.warnings.push({ route, step, msg });
}

// ---------------------------------------------------------------- page helpers
function track(page) {
  const errs = [];
  page.on('console', (m) => m.type() === 'error' && errs.push(`console.error: ${m.text()}`));
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => {
    const t = r.failure()?.errorText ?? '';
    if (!/ERR_ABORTED/.test(t)) errs.push(`requestfailed: ${r.url()} ${t}`);
  });
  page.on('response', (r) => r.status() >= 400 && errs.push(`HTTP ${r.status()}: ${r.url()}`));
  page.drain = () => errs.splice(0);
  page.setDefaultTimeout(15000);
  return page;
}

const PROPS = 'aside.order-first';
const BAD_RE = /\bNaN\b|Infinity|\bundefined\b|\bnull\b|\[object|∞/;

/** Text of the document area + status bar (+ properties panel labels and input values). */
const scanText = (page) =>
  page.evaluate(() => {
    const main = document.querySelector('main');
    const status = main?.parentElement?.nextElementSibling;
    const props = document.querySelector('aside.order-first');
    const vals = props ? [...props.querySelectorAll('input')].map((i) => i.value).join(' | ') : '';
    const mainVals = main ? [...main.querySelectorAll('input')].map((i) => i.value).join(' | ') : '';
    return { hasMain: !!main, main: main?.innerText ?? '', status: status?.innerText ?? '', props: props?.innerText ?? '', vals: `${vals} | ${mainVals}` };
  });

const statusText = (page) => page.evaluate(() => document.querySelector('main')?.parentElement?.nextElementSibling?.innerText ?? '');

async function waitIdle(page, ms = 30000) {
  try {
    await page.waitForFunction(
      () => {
        const main = document.querySelector('main');
        const t = `${main?.innerText ?? ''} ${main?.parentElement?.nextElementSibling?.innerText ?? ''} ${document.querySelector('aside.order-first')?.innerText ?? ''}`;
        return !/Solving|solving…|Loading…/.test(t);
      },
      null,
      { timeout: ms, polling: 100 },
    );
    return true;
  } catch {
    return false;
  }
}
async function settle(page, route, step, ms = 30000) {
  await page.waitForTimeout(160);
  // waitForFunction times out inside the page; a frozen renderer never answers, so race a Node timer too
  const ok = await withTimeout(waitIdle(page, ms), ms + 10000, 'waitIdle').catch(() => 'hung');
  if (ok === 'hung') {
    await fail(page, route, `${step}: page unresponsive`, `renderer did not answer for ${(ms + 10000) / 1000} s (tab frozen)`);
    throw new Error(`page unresponsive after ${step}`);
  }
  if (!ok) await fail(page, route, step, `still solving after ${ms / 1000} s`);
  return ok;
}

/** Errors, crash and bad-token scan. Returns true when clean. */
async function checkPage(page, route, step) {
  let ok = true;
  const errs = page.drain();
  ok = (await check(page, errs.length === 0, route, `${step}: errors`, errs.join(' || '))) && ok;
  const t = await scanText(page).catch((e) => ({ hasMain: false, main: '', status: '', props: '', vals: String(e) }));
  ok = (await check(page, t.hasMain, route, `${step}: crash`, 'document area <main> missing (app crashed?)')) && ok;
  for (const [where, text] of [
    ['document', t.main],
    ['status bar', t.status],
    ['properties', t.props],
    ['input values', t.vals],
  ]) {
    const m = BAD_RE.exec(text);
    if (m) {
      const i = m.index;
      ok = (await fail(page, route, `${step}: bad text in ${where}`, `"${m[0]}" in …${text.slice(Math.max(0, i - 70), i + 50)}…`)) && ok;
    } else R.pass++;
  }
  return ok;
}

async function gotoFresh(page, route, query = '') {
  await page.goto(BASE + route + query, { waitUntil: 'networkidle' });
  await page.waitForSelector('main');
  await waitIdle(page, 60000);
}

async function expandSections(page) {
  for (let k = 0; k < 20; k++) {
    const b = page.locator(`${PROPS} button[aria-expanded="false"]`);
    if (!(await b.count())) break;
    await b.first().click();
  }
}

const labelOf = (loc) =>
  loc.evaluate((el) => {
    const l = el.labels?.[0]?.innerText || el.getAttribute('aria-label') || el.closest('div.grid')?.querySelector('label,span')?.innerText || el.name || el.id || '?';
    return l.replace(/\s+/g, ' ').trim();
  });

const snapshot = (page) =>
  page.evaluate(() => {
    const main = document.querySelector('main');
    return `${location.search}\n${main?.innerText ?? ''}\n${main?.parentElement?.nextElementSibling?.innerText ?? ''}`;
  });

const noteText = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('main [role=alert], main [class*="note-bg"], main [class*="err-bg"], main [class*="err-line"]')]
      .map((e) => e.innerText)
      .join(' | ') + ((document.querySelector('main')?.parentElement?.nextElementSibling?.innerText ?? '').match(/Check the inputs/)?.[0] ?? ''),
  );

function newValid(text) {
  const v = Number.parseFloat(text);
  if (!Number.isFinite(v) || v === 0) return '1';
  if (Number.isInteger(v) && Math.abs(v) >= 1) return String(v + 1);
  return String(Number((v * 1.25).toPrecision(4)));
}
const near = (a, b, rel = 2e-4) => Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b), 1e-12);
const FACT = { mm: 1, mil: 0.0254, um: 0.001, 'µm': 0.001, oz: 1.378 * 0.0254, in: 25.4, cm: 10 };

// ---------------------------------------------------------------- per-route steps
const INPUTS = (c) => `${c} input:not([type=checkbox]):not([type=radio])`;

async function stepLoad(page, route) {
  await gotoFresh(page, route);
  await checkPage(page, route, '1 load');
  if (!NO_PROPS.has(route)) {
    const n = await page.locator(`${PROPS} input, ${PROPS} select, ${PROPS} [role=radio]`).count();
    await check(page, n > 0, route, '1 load: properties panel has inputs', `found ${n} controls`);
  }
}

async function stepFields(page, route, container) {
  await gotoFresh(page, route);
  await expandSections(page);
  page.drain();
  const count = await page.locator(INPUTS(container)).count();
  for (let i = 0; i < count; i++) {
    const inp = page.locator(INPUTS(container)).nth(i);
    if (!(await inp.count()) || !(await inp.isVisible()) || (await inp.isDisabled())) continue;
    const label = await labelOf(inp);
    const tag = `3 field #${i} "${label}"`;
    const orig = await inp.inputValue();
    const numeric = (await inp.getAttribute('inputmode')) === 'decimal';
    const validatable = numeric || (await inp.getAttribute('aria-invalid')) !== null;
    const base = await snapshot(page);

    // free text: a list field (aria-invalid present) gets another list item, plain names get a suffix
    const nv = numeric ? newValid(orig) : validatable ? `${orig}, 1k` : `${orig} x`;
    await inp.fill(nv);
    await settle(page, route, `${tag} = ${nv}`);
    await page.waitForTimeout(300); // URL debounce
    await checkPage(page, route, `${tag} valid ${nv}`);
    await check(page, (await inp.getAttribute('aria-invalid')) !== 'true', route, `${tag} valid ${nv} flagged invalid`, `aria-invalid=true for "${nv}"`);
    const after = await snapshot(page);
    if (after === base) warn(route, tag, `valid edit ${orig} -> ${nv} changed neither the URL nor the document`);
    const validNotes = await noteText(page);

    if (validatable) {
      for (const bad of ['', '-', 'abc', '0', '-5', '1e9']) {
        await inp.fill(bad);
        await settle(page, route, `${tag} = '${bad}'`, 30000);
        await checkPage(page, route, `${tag} invalid '${bad}'`);
        const inv = (await inp.getAttribute('aria-invalid')) === 'true';
        const notes = await noteText(page);
        const noted = notes !== validNotes && notes.length > 0;
        if (['', '-', 'abc'].includes(bad)) await check(page, inv || noted, route, `${tag} invalid '${bad}' not flagged`, `no aria-invalid and no note for "${bad}"`);
        else if (bad !== '1e9' && !inv && !noted) warn(route, tag, `'${bad}' accepted silently (no aria-invalid, no note)`);
      }
    }
    await inp.fill(orig);
    await settle(page, route, `${tag} restore`);
    await checkPage(page, route, `${tag} restore`);
    await page.waitForTimeout(300); // URL debounce
    const restored = await snapshot(page);
    if (restored !== base) {
      const a = base.split('\n');
      const b = restored.split('\n');
      const d = a.findIndex((x, k) => x !== b[k]);
      await fail(page, route, `${tag} restore: output differs from before`, `before: "${a[d]?.slice(0, 120)}" after: "${b[d]?.slice(0, 120)}"`);
    } else R.pass++;
  }
}

async function stepSelects(page, route, container) {
  await gotoFresh(page, route);
  await expandSections(page);
  page.drain();
  for (let i = 0; ; i++) {
    const sels = page.locator(`${container} select`);
    if (i >= (await sels.count())) break;
    const s = sels.nth(i);
    if (!(await s.isVisible()) || (await s.isDisabled())) continue;
    const label = await labelOf(s);
    const orig = await s.inputValue();
    const opts = await s.evaluate((el) => [...el.options].map((o) => o.value));
    for (const v of opts) {
      const cur = page.locator(`${container} select`).nth(i);
      if (!(await cur.count())) break;
      await cur.selectOption(v);
      await settle(page, route, `4 select "${label}" = ${v}`, 45000);
      await checkPage(page, route, `4 select "${label}" = ${v}`);
    }
    const cur = page.locator(`${container} select`).nth(i);
    if (await cur.count()) {
      await cur.selectOption(orig).catch(() => {});
      await settle(page, route, `4 select "${label}" restore`);
    }
  }
}

async function stepToggles(page, route, container) {
  await gotoFresh(page, route);
  await expandSections(page);
  page.drain();
  for (let i = 0; ; i++) {
    const cbs = page.locator(`${container} input[type=checkbox]`);
    if (i >= (await cbs.count())) break;
    const cb = cbs.nth(i);
    if (!(await cb.isVisible())) continue;
    const label = (await cb.evaluate((e) => e.closest('label')?.innerText ?? '?')).trim();
    await cb.click();
    await settle(page, route, `5 checkbox "${label}"`);
    await checkPage(page, route, `5 checkbox "${label}" toggled`);
    await page.locator(`${container} input[type=checkbox]`).nth(i).click();
    await settle(page, route, `5 checkbox "${label}" back`);
    await checkPage(page, route, `5 checkbox "${label}" back`);
  }
  // segmented radios in the properties panel and in the document
  for (const scope of [container, 'main']) {
    for (let g = 0; ; g++) {
      const groups = page.locator(`${scope} [role=radiogroup]`);
      if (g >= (await groups.count())) break;
      const grp = groups.nth(g);
      const gname = (await grp.getAttribute('aria-label')) ?? '?';
      const radios = grp.locator('[role=radio]');
      const n = await radios.count();
      let orig = 0;
      for (let k = 0; k < n; k++) if ((await radios.nth(k).getAttribute('aria-checked')) === 'true') orig = k;
      for (let k = 0; k < n; k++) {
        const r = page.locator(`${scope} [role=radiogroup]`).nth(g).locator('[role=radio]').nth(k);
        const rname = (await r.innerText()).trim();
        await r.click();
        await settle(page, route, `5 radio ${gname}=${rname}`, 60000);
        await check(page, (await r.getAttribute('aria-checked')) === 'true', route, `5 radio ${gname}=${rname} selected`, 'aria-checked not true after click');
        await checkPage(page, route, `5 radio ${gname}=${rname}`);
      }
      await page.locator(`${scope} [role=radiogroup]`).nth(g).locator('[role=radio]').nth(orig).click();
      await settle(page, route, `5 radio ${gname} restore`, 60000);
    }
  }
}

/** LenFields: rows with a number input followed by a unit select that offers mm and mil. */
const lenFields = (page, container) =>
  page.evaluate((c) => {
    const out = [];
    document.querySelectorAll(`${c} select[aria-label="unit"]`).forEach((s, idx) => {
      const opts = [...s.options].map((o) => o.value);
      const inp = s.previousElementSibling;
      if (!opts.includes('mm') || !opts.includes('mil') || !inp || inp.tagName !== 'INPUT' || !s.offsetParent) return;
      out.push({ idx, unit: s.value, first: opts[0], text: inp.value, label: inp.labels?.[0]?.innerText?.replace(/\s+/g, ' ').trim() ?? '?' });
    });
    return out;
  }, container);

async function stepUnitSwitch(page, route, container) {
  await gotoFresh(page, route);
  await expandSections(page);
  page.drain();
  const fields = await lenFields(page, container);
  for (const f of fields) {
    const sel = page.locator(`${container} select[aria-label="unit"]`).nth(f.idx);
    const inp = sel.locator('xpath=preceding-sibling::input[1]');
    const v0 = Number.parseFloat(f.text);
    const url0 = page.url();
    const snap0 = await snapshot(page);
    const tag = `6 unit "${f.label}" ${f.unit}`;
    const other = f.unit === 'mil' ? 'mm' : 'mil';
    await sel.selectOption(other);
    await settle(page, route, `${tag}->${other}`);
    const v1 = Number.parseFloat(await inp.inputValue());
    const exp = (v0 * FACT[f.unit]) / FACT[other];
    await check(page, near(v1, exp), route, `${tag}->${other} converts`, `${f.text} ${f.unit} shown as ${v1} ${other}, expected ${exp.toPrecision(6)}`);
    await sel.selectOption(f.unit);
    await settle(page, route, `${tag} back`);
    const v2 = Number.parseFloat(await inp.inputValue());
    await check(page, near(v2, v0), route, `${tag}->${other}->${f.unit} round-trip`, `started ${f.text}, came back as ${v2}`);
    await page.waitForTimeout(300);
    await check(page, page.url() === url0 && (await snapshot(page)) === snap0, route, `${tag} value preserved`, `URL/result changed by a unit switch: ${url0} -> ${page.url()}`);
    await checkPage(page, route, tag);
  }
}

async function clickMenu(page, menu, item) {
  await page.getByRole('button', { name: menu, exact: true }).first().click();
  await page.getByRole('menuitem', { name: item }).first().click();
}

async function stepGlobalUnit(page, route, container) {
  await gotoFresh(page, route);
  await expandSections(page);
  page.drain();
  const before = (await lenFields(page, container)).filter((f) => f.first !== 'oz');
  const url0 = page.url();
  // toggle with the status-bar button
  await page.getByRole('button', { name: /^Units: mm$/ }).click();
  await settle(page, route, '7 global unit -> mil');
  await check(page, /Units: mil/.test(await statusText(page)), route, '7 global unit status shows mil', await statusText(page));
  await checkPage(page, route, '7 global unit mil');
  const after = await lenFields(page, container);
  for (const f of before) {
    const a = after.find((x) => x.idx === f.idx);
    if (!a) continue;
    const exp = Number.parseFloat(f.text) / 0.0254;
    const got = Number.parseFloat(a.text);
    await check(page, a.unit === 'mil', route, `7 global unit "${f.label}" unit select`, `unit select shows ${a.unit}`);
    await check(page, near(got, exp), route, `7 global unit "${f.label}" displayed value`, `field shows "${a.text}" ${a.unit}; the value is ${f.text} mm = ${exp.toPrecision(6)} mil`);
  }
  await page.waitForTimeout(300);
  await check(page, page.url() === url0, route, '7 global unit keeps state', `URL changed ${url0} -> ${page.url()}`);
  // and back with the View menu
  await clickMenu(page, 'View', 'Metric (mm)');
  await settle(page, route, '7 global unit -> mm');
  await check(page, /Units: mm/.test(await statusText(page)), route, '7 global unit status shows mm', await statusText(page));
  const back = await lenFields(page, container);
  for (const f of before) {
    const a = back.find((x) => x.idx === f.idx);
    if (a) await check(page, a.unit === 'mm' && near(Number.parseFloat(a.text), Number.parseFloat(f.text)), route, `7 global unit back "${f.label}"`, `shows "${a.text}" ${a.unit}, expected ${f.text} mm`);
  }
  await checkPage(page, route, '7 global unit back to mm');
}

async function stepUrlState(page, route, container) {
  await gotoFresh(page, route);
  await expandSections(page);
  page.drain();
  const all = page.locator(`${container} input[aria-invalid]`);
  const n = await all.count();
  const init = [];
  for (let i = 0; i < n; i++) init.push(await all.nth(i).inputValue());
  const picks = [];
  for (let i = 0; i < n && picks.length < 2; i++) if ((await all.nth(i).isVisible()) && (await all.nth(i).getAttribute('inputmode')) === 'decimal') picks.push(i);
  if (!picks.length) return;
  const typed = {};
  for (const i of picks) {
    typed[i] = newValid(init[i]);
    await all.nth(i).fill(typed[i]);
    await settle(page, route, '8 url edit');
  }
  // also a select (not a unit select), if any
  const sel = page.locator(`${container} select:not([aria-label="unit"])`).first();
  let selWant = null;
  if ((await sel.count()) && (await sel.isVisible())) {
    const opts = await sel.evaluate((el) => [...el.options].map((o) => o.value));
    const cur = await sel.inputValue();
    selWant = opts.find((o) => o !== cur) ?? null;
    if (selWant) {
      await sel.selectOption(selWant);
      await settle(page, route, '8 url select');
    }
  }
  await page.waitForTimeout(400);
  const url = page.url();
  await check(page, url.includes('?'), route, '8 url has query after edits', url);
  await page.reload({ waitUntil: 'networkidle' });
  await waitIdle(page, 60000);
  await expandSections(page);
  const again = page.locator(`${container} input[aria-invalid]`);
  for (const i of picks) {
    const v = await again.nth(i).inputValue();
    await check(page, near(Number.parseFloat(v), Number.parseFloat(typed[i])), route, `8 url field #${i} persists after reload`, `typed ${typed[i]}, after reload "${v}" (url ${url})`);
  }
  if (selWant) {
    const v = await page.locator(`${container} select:not([aria-label="unit"])`).first().inputValue();
    await check(page, v === selWant, route, '8 url select persists after reload', `selected ${selWant}, after reload ${v}`);
  }
  await checkPage(page, route, '8 url after reload');

  const reset = page.locator('main button', { hasText: /^Reset$/ });
  if (!(await reset.count())) return;
  await reset.first().click();
  await settle(page, route, '8 reset');
  await page.waitForTimeout(400);
  for (let i = 0; i < n; i++) {
    const inp = page.locator(`${container} input[aria-invalid]`).nth(i);
    if (!(await inp.count())) continue;
    const v = await inp.inputValue();
    await check(page, near(Number.parseFloat(v), Number.parseFloat(init[i])) || v === init[i], route, `8 reset restores field #${i} "${await labelOf(inp)}"`, `expected "${init[i]}", got "${v}"`);
  }
  await check(page, !new URL(page.url()).search, route, '8 reset clears URL query', page.url());
  await checkPage(page, route, '8 after reset');

  // Reset after an unparsable entry: the field must show the default again
  const f0 = page.locator(`${container} input[aria-invalid]`).nth(picks[0]);
  await f0.fill('abc');
  await page.waitForTimeout(150);
  await reset.first().click();
  await settle(page, route, '8 reset after invalid');
  const v = await f0.inputValue();
  await check(page, v === init[picks[0]], route, `8 reset after typing 'abc' in "${await labelOf(f0)}"`, `field still shows "${v}" (aria-invalid=${await f0.getAttribute('aria-invalid')}) after Reset; default is "${init[picks[0]]}"`);
}

async function stepTheme(page, route) {
  await gotoFresh(page, route);
  page.drain();
  await clickMenu(page, 'View', 'Light Gray Theme');
  await page.waitForTimeout(200);
  const th = await page.evaluate(() => document.documentElement.dataset.theme);
  await check(page, th === 'light', route, '9 light theme applied', `data-theme=${th}`);
  await check(page, /Theme: Light Gray/.test(await statusText(page)), route, '9 light theme status', await statusText(page));
  await checkPage(page, route, '9 light theme');
  await clickMenu(page, 'View', 'Dark Gray Theme');
  await page.waitForTimeout(100);
  await checkPage(page, route, '9 dark theme');
}

// ---------------------------------------------------------------- special flows
const zFromStatus = async (page) => {
  const m = /(Z0|Zdiff) = ([\d.,]+) Ω/.exec(await statusText(page));
  return m ? Number(m[2].replace(/,/g, '')) : NaN;
};

async function flowImpedance(page) {
  const route = '/impedance';
  await gotoFresh(page, route);
  page.drain();
  const props = page.locator(PROPS);
  const solve = async (name, target, what) => {
    const tgt = props.locator('input[aria-invalid]').first(); // Target field is the first NumField
    await tgt.fill(String(target));
    await settle(page, route, `impedance ${what} target`);
    await props.getByRole('button', { name }).click();
    await settle(page, route, `impedance ${what}`, 60000);
    await page.waitForTimeout(200);
    await settle(page, route, `impedance ${what} re-solve`, 60000);
    const z = await zFromStatus(page);
    await check(page, Math.abs(z - target) <= 0.5, route, `impedance ${what} reaches target ${target}`, `status: "${await statusText(page)}" (Z=${z})`);
    await checkPage(page, route, `impedance ${what}`);
  };
  await solve('Solve Width', 50, 'SE Solve Width');
  await props.getByRole('radio', { name: 'Differential' }).click();
  await settle(page, route, 'impedance diff');
  const tval = await props.locator('input[aria-invalid]').first().inputValue();
  await check(page, tval === '100', route, 'impedance diff target switches to 100', `target shows ${tval}`);
  await solve('Solve Width', 100, 'diff Solve Width');
  await solve('Solve Spacing', 95, 'diff Solve Spacing');
  await solve('Solve Spacing', 100, 'diff Solve Spacing (100)');

  // Field view canvas
  await page.locator('main').getByRole('radio', { name: 'Field' }).click();
  await settle(page, route, 'impedance field view');
  const canvas = page.locator('main canvas');
  await check(page, (await canvas.count()) > 0, route, 'impedance field canvas present', 'no <canvas> after selecting Field');
  if (await canvas.count()) {
    await page.waitForTimeout(300);
    const st = await canvas.first().evaluate((cv) => {
      const ctx = cv.getContext('2d');
      const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
      const colors = new Set();
      for (let i = 0; i < d.length; i += 4 * 97) colors.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2] | (d[i + 3] << 24));
      return { w: cv.width, h: cv.height, colors: colors.size };
    });
    await check(page, st.w > 0 && st.h > 0 && st.colors > 10, route, 'impedance field canvas non-blank', JSON.stringify(st));
  }
  await checkPage(page, route, 'impedance field view');
}

async function flowAdvisor(page) {
  const route = '/stackup-advisor';
  await gotoFresh(page, route);
  page.drain();
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Find Best Stackups' }).click();
  let done = true;
  await page.waitForFunction(() => /meet every requirement/.test(document.querySelector('main')?.parentElement?.nextElementSibling?.innerText ?? ''), null, { timeout: 300000 }).catch(() => (done = false));
  log(`  advisor run ${((Date.now() - t0) / 1000).toFixed(1)} s: ${await statusText(page)}`);
  if (!(await check(page, done, route, 'advisor completes', `not finished after 300 s: ${await statusText(page)}`))) return;
  await checkPage(page, route, 'advisor results');
  const rows = page.locator('main table tbody tr', { hasText: 'Meets all' });
  const n = await rows.count();
  if (!(await check(page, n > 0, route, 'advisor has a "Meets all" row', await statusText(page)))) return;
  // every non-passing row must list its issues; cells never "error"
  const errCells = await page.locator('main table tbody td', { hasText: /^error$/ }).count();
  await check(page, errCells === 0, route, 'advisor no "error" cells', `${errCells} cells show "error"`);
  await rows.first().click();
  const btns = page.locator('main button', { hasText: '→ Impedance' });
  await check(page, (await btns.count()) > 0, route, 'advisor row expands with layer buttons', 'no "→ Impedance" buttons after clicking the row');
  if (!(await btns.count())) return;
  const bname = (await btns.first().innerText()).trim();
  const etch = await page.evaluate(() => new URL(location.href).searchParams.get('etch'));
  await btns.first().click();
  await page.waitForURL(/\/impedance\?/);
  await settle(page, route, 'advisor -> impedance', 60000);
  const q = new URL(page.url()).searchParams;
  const num = (k) => Number(q.get(k));
  const problems = [];
  if (!['microstrip', 'embedded', 'stripline'].includes(q.get('type'))) problems.push(`type=${q.get('type')}`);
  for (const k of ['h', 't']) if (!(num(k) > 0)) problems.push(`${k}=${q.get(k)}`);
  if (!(num('er') >= 1)) problems.push(`er=${q.get('er')}`);
  if (!(Math.abs(num('etch') - Number(etch ?? 0.0127)) < 1e-9)) problems.push(`etch=${q.get('etch')}`);
  if (q.get('type') === 'microstrip') {
    if (!['0', '1'].includes(q.get('mask'))) problems.push(`mask=${q.get('mask')}`);
    if (q.get('mask') === '1') for (const k of ['c1', 'c2', 'erm']) if (!(num(k) > 0)) problems.push(`${k}=${q.get(k)}`);
  } else if (!(num('h2') > 0) || !(num('er2') >= 1)) problems.push(`h2=${q.get('h2')} er2=${q.get('er2')}`);
  await check(page, problems.length === 0, route, `advisor "${bname}" query params`, `${page.url()} :: ${problems.join(', ')}`);
  const lineType = await page.locator(`${PROPS} select`).first().inputValue();
  await check(page, lineType === q.get('type'), route, `advisor "${bname}" impedance line type`, `select=${lineType} url type=${q.get('type')}`);
  // the "Height to plane" LenField shows h
  const hShown = await page.evaluate(() => {
    const l = [...document.querySelectorAll('aside.order-first label')].find((x) => /Height to plane|Plane to trace/.test(x.innerText));
    return l ? document.getElementById(l.htmlFor)?.value : null;
  });
  await check(page, hShown !== null && near(Number(hShown), num('h'), 1e-4), route, `advisor "${bname}" H applied`, `field shows ${hShown}, url h=${q.get('h')}`);
  const z = await zFromStatus(page);
  await check(page, z > 5 && z < 200, route, `advisor "${bname}" impedance solves`, await statusText(page));
  await checkPage(page, '/impedance', `from advisor "${bname}"`);
}

async function flowStackup(page) {
  const route = '/stackup';
  await gotoFresh(page, route);
  page.drain();
  const lib = page.locator('#lsm-s');
  const groups = await lib.evaluate((s) => [...s.querySelectorAll('optgroup')].map((g) => ({ label: g.label, first: g.querySelector('option')?.value, n: g.children.length })));
  const builtinCount = groups.filter((g) => g.label !== 'My stackups').reduce((a, g) => a + g.n, 0);

  // stackup counts quoted in text vs the library
  const lsmText = await page.locator('main').innerText();
  const quoted = [...lsmText.matchAll(/(\d+) (?:fab|fabricator) stackups/g)].map((m) => Number(m[1]));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const homeText = `${await page.locator('main').innerText()} ${await statusText(page)}`;
  const homeQuoted = [...homeText.matchAll(/(\d+) (?:fab |fabricator )?stackups/g)].map((m) => Number(m[1]));
  const wrong = [...quoted.map((q) => `Layer Stack Manager says ${q}`), ...homeQuoted.map((q) => `Home says ${q}`)].filter((s) => Number(s.match(/\d+$/)[0]) !== builtinCount);
  await check(page, wrong.length === 0, route, 'stackup count text matches library', `library has ${builtinCount} stackups; ${wrong.join('; ')}`);
  await gotoFresh(page, route);
  page.drain();

  const layerCountsDone = new Set();
  for (const g of groups) {
    log(`  lsm group ${g.label}`);
    await page.locator('#lsm-s').selectOption(g.first);
    await settle(page, route, `lsm select ${g.label}`);
    await checkPage(page, route, `lsm select "${g.label}"`);
    const lc = g.label.split(' ')[0];
    if (layerCountsDone.has(lc)) continue; // impedance tab once per layer count
    layerCountsDone.add(lc);
    const tImp = Date.now();
    await page.getByRole('radio', { name: 'Impedance' }).click();
    let ok = true;
    await page.waitForFunction(() => !document.querySelector('main').innerText.includes('solving…'), null, { timeout: 60000 }).catch(() => (ok = false));
    log(`    impedance tab ${((Date.now() - tImp) / 1000).toFixed(1)} s`);
    await check(page, ok, route, `lsm impedance tab resolves (${g.label})`, 'cells still "solving…" after 60 s');
    const cells = await page.evaluate(() => {
      const t = [...document.querySelectorAll('main table')].find((x) => /W for/.test(x.innerText));
      if (!t) return null;
      return [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((td) => td.innerText.trim()));
    });
    if (await check(page, !!cells && cells.length > 0, route, `lsm impedance table (${g.label})`, 'no signal-layer rows')) {
      const bad = cells.filter((r) => !(r[1] === 'no reference plane') && !(/^[\d.,]+$/.test(r[4]) && /^[\d.,]+$/.test(r[5]))).map((r) => `${r[0]}: SE="${r[4]}" diff="${r[5]}"`);
      await check(page, bad.length === 0, route, `lsm impedance widths all resolve (${g.label})`, bad.join('; '));
    }
    await checkPage(page, route, `lsm impedance tab "${g.label}"`);
    await page.getByRole('radio', { name: 'Stackup' }).click();
  }

}

async function flowStackupTargets(page) {
  const route = '/stackup';
  // impedance-tab property fields (targets) with valid and invalid values
  await gotoFresh(page, route);
  page.drain();
  await page.getByRole('radio', { name: 'Impedance' }).click();
  await settle(page, route, 'lsm imp tab', 60000);
  const tf = page.locator(`${PROPS} input[aria-invalid]`);
  for (let i = 0; i < (await tf.count()); i++) {
    const inp = tf.nth(i);
    const label = await labelOf(inp);
    const orig = await inp.inputValue();
    for (const v of [newValid(orig), '0', '-5', 'abc', '1e9', orig]) {
      log(`  lsm target "${label}" = ${v}`);
      await inp.fill(v);
      await settle(page, route, `lsm target "${label}" = ${v}`, 60000);
      await checkPage(page, route, `lsm target "${label}" = '${v}'`);
    }
  }
}

async function flowStackupEdit(page) {
  const route = '/stackup';
  // layer editing
  await gotoFresh(page, route);
  page.drain();
  const rows = page.locator('main table').first().locator('tbody tr');
  const n0 = await rows.count();
  await rows.nth(2).locator('td').nth(3).click();
  await check(page, (await rows.nth(2).getAttribute('class'))?.includes('sel'), route, 'lsm row selects', 'row 3 not marked selected');
  const selName = () => page.evaluate(() => document.querySelector('main table tbody tr.sel input')?.value ?? null);
  const selIndex = () => page.evaluate(() => [...document.querySelector('main table').querySelectorAll('tbody tr')].findIndex((r) => r.classList.contains('sel')));
  for (const [btn, delta] of [
    ['+ Dielectric', 1],
    ['+ Copper', 1],
    ['+ Mask', 1],
  ]) {
    const before = await rows.count();
    await page.getByRole('button', { name: btn }).click();
    await check(page, (await rows.count()) === before + delta, route, `lsm ${btn}`, `rows ${before} -> ${await rows.count()}`);
    await checkPage(page, route, `lsm ${btn}`);
  }
  const i0 = await selIndex();
  const name0 = await selName();
  await page.getByRole('button', { name: 'Move Down' }).click();
  await check(page, (await selIndex()) === i0 + 1 && (await selName()) === name0, route, 'lsm Move Down', `selected row ${i0} -> ${await selIndex()}`);
  await page.getByRole('button', { name: 'Move Up' }).click();
  await page.getByRole('button', { name: 'Move Up' }).click();
  await check(page, (await selIndex()) === i0 - 1, route, 'lsm Move Up', `selected row expected ${i0 - 1}, got ${await selIndex()}`);
  await checkPage(page, route, 'lsm move');
  const nBefore = await rows.count();
  await page.getByRole('button', { name: 'Delete Layer' }).click();
  await check(page, (await rows.count()) === nBefore - 1, route, 'lsm Delete Layer', `rows ${nBefore} -> ${await rows.count()}`);
  const hint = await page.locator('main span.ml-auto').first().innerText();
  const delDisabled = await page.getByRole('button', { name: 'Delete Layer' }).isDisabled();
  await check(page, hint !== 'Layer selected' && delDisabled, route, 'lsm selection cleared after deleting the selected layer', `hint "${hint}", Delete Layer ${delDisabled ? 'disabled' : 'still enabled'} though no row is highlighted`);
  await check(page, /modified/.test(await statusText(page)), route, 'lsm status shows modified', await statusText(page));
  await checkPage(page, route, 'lsm after edits');
  await check(page, n0 + 2 === (await rows.count()), route, 'lsm row count after edits', `${n0} -> ${await rows.count()}`);

  // thickness / Dk inputs in the table
  const num = page.locator('main table').first().locator('tbody input[inputmode=decimal]');
  const nt = await num.first().inputValue();
  for (const v of ['-5', '0', 'abc']) {
    await num.first().fill(v);
    await page.waitForTimeout(150);
    await checkPage(page, route, `lsm thickness '${v}'`);
    const inv = (await num.first().getAttribute('aria-invalid')) === 'true';
    const board = await page.evaluate(() => [...document.querySelectorAll('aside.order-first td')].map((t) => t.innerText).join(' | '));
    await check(page, inv || !/-\d/.test(board), route, `lsm layer thickness '${v}' validated`, `no aria-invalid; Board Information: ${board}`);
  }
  await num.first().fill(nt);

  // save as copy, then delete it
  await page.getByRole('button', { name: 'Save as Copy' }).click();
  await page.waitForTimeout(300);
  const id = new URL(page.url()).searchParams.get('id') ?? '';
  const mine = await page.locator('#lsm-s optgroup[label="My stackups"] option').allInnerTexts();
  await check(page, id.startsWith('custom-') && mine.some((t) => /\(copy\)/.test(t)), route, 'lsm Save as Copy appears under My stackups', `id=${id}, My stackups=${JSON.stringify(mine)}`);
  await check(page, (await rows.count()) === n0 + 2, route, 'lsm copy keeps edits', `rows ${await rows.count()}`);
  await checkPage(page, route, 'lsm saved copy');
  await page.reload({ waitUntil: 'networkidle' });
  await check(page, (await page.locator('#lsm-s').inputValue()) === id, route, 'lsm copy survives reload', `selected ${await page.locator('#lsm-s').inputValue()}`);
  await page.locator(PROPS).getByRole('button', { name: 'Delete', exact: true }).click();
  await page.waitForTimeout(300);
  const mine2 = await page.locator('#lsm-s optgroup[label="My stackups"] option').count();
  await check(page, mine2 === 0, route, 'lsm Delete removes the copy', `${mine2} left under My stackups`);
  const after = await page.locator('#lsm-s').inputValue();
  const urlId = new URL(page.url()).searchParams.get('id');
  await check(page, urlId === after, route, 'lsm URL id follows selection after delete', `URL id=${urlId} but selector shows ${after}`);
  await checkPage(page, route, 'lsm after delete');
}

async function flowTabsMenus(browser) {
  const ctx = await newCtx(browser);
  const page = track(await ctx.newPage());
  const route = 'tabs/menus';
  await gotoFresh(page, '/');
  page.drain();
  const tabNames = () => page.locator('[role=tab]').allInnerTexts().then((a) => a.map((s) => s.replace('✕', '').trim()));
  await check(page, JSON.stringify(await tabNames()) === JSON.stringify(['Home', 'Impedance']), route, 'default tabs', JSON.stringify(await tabNames()));
  for (const t of TOOLS) {
    await clickMenu(page, 'Tools', t.nav);
    await page.waitForURL((u) => u.pathname === t.path).catch(() => {});
    await check(page, new URL(page.url()).pathname === t.path, route, `Tools menu "${t.nav}"`, `landed on ${page.url()}`);
    const active = await page.locator('[role=tab][aria-selected=true]').innerText().catch(() => '');
    await check(page, active.replace('✕', '').trim() === t.nav, route, `tab for "${t.nav}" active`, `active tab "${active}"`);
    await check(page, (await page.locator('h1').first().innerText()) === t.title, route, `"${t.nav}" page title`, await page.locator('h1').first().innerText());
    await waitIdle(page, 30000);
    await checkPage(page, route, `Tools menu -> ${t.path}`);
  }
  await check(page, (await tabNames()).length === TOOLS.length + 1, route, 'one tab per tool', JSON.stringify(await tabNames()));
  // close the active tab -> previous tab becomes active
  const names = await tabNames();
  const last = names[names.length - 1];
  await page.getByRole('button', { name: `Close ${last}` }).click();
  await page.waitForTimeout(200);
  const after = await tabNames();
  await check(page, !after.includes(last), route, 'close tab removes it', JSON.stringify(after));
  const act = (await page.locator('[role=tab][aria-selected=true]').innerText().catch(() => '')).replace('✕', '').trim();
  await check(page, act === names[names.length - 2], route, 'close tab activates previous', `active "${act}", expected "${names[names.length - 2]}"`);
  // close an inactive tab
  await page.getByRole('button', { name: 'Close Impedance' }).click({ force: true });
  await page.waitForTimeout(200);
  await check(page, !(await tabNames()).includes('Impedance'), route, 'close inactive tab', JSON.stringify(await tabNames()));
  await check(page, (await page.locator('[role=tab][aria-selected=true]').innerText()).replace('✕', '').trim() === act, route, 'closing inactive tab keeps active', 'active tab changed');
  // clicking a tab navigates
  await page.locator('[role=tab]', { hasText: 'Home' }).click();
  await check(page, new URL(page.url()).pathname === '/', route, 'click Home tab', page.url());
  // Tools panel links
  for (const t of TOOLS.slice(0, 5)) {
    await page.locator('nav[aria-label=Tools] a', { hasText: t.nav }).first().click();
    await check(page, new URL(page.url()).pathname === t.path, route, `Tools panel link "${t.nav}"`, page.url());
  }
  // tabs persist across reload
  const persisted = await tabNames();
  await page.reload({ waitUntil: 'networkidle' });
  await check(page, JSON.stringify(await tabNames()) === JSON.stringify(persisted), route, 'tabs persist after reload', `${JSON.stringify(persisted)} -> ${JSON.stringify(await tabNames())}`);
  // File > Reset Inputs
  await gotoFresh(page, '/via');
  const f = page.locator(`${PROPS} input[aria-invalid]`).first();
  const v0 = await f.inputValue();
  await f.fill(newValid(v0));
  await page.waitForTimeout(100);
  await clickMenu(page, 'File', 'Reset Inputs');
  await page.waitForTimeout(300);
  await check(page, (await f.inputValue()) === v0, route, 'File > Reset Inputs', `field "${await f.inputValue()}", default "${v0}"`);
  // Help > About goes home; View > Properties Panel toggles
  await clickMenu(page, 'Help', /^About/);
  await check(page, new URL(page.url()).pathname === '/', route, 'Help > About', page.url());
  await gotoFresh(page, '/via');
  await clickMenu(page, 'View', 'Properties Panel');
  await check(page, (await page.locator(PROPS).count()) === 0, route, 'View > Properties Panel hides panel', 'panel still shown');
  await clickMenu(page, 'View', 'Properties Panel');
  await check(page, (await page.locator(PROPS).count()) === 1, route, 'View > Properties Panel shows panel', 'panel not shown');
  // status bar "Panels" opens the View menu
  await page.getByRole('button', { name: 'Panels' }).click();
  await check(page, (await page.getByRole('menuitem', { name: 'Properties Panel' }).count()) === 1, route, 'status "Panels" opens View menu', 'menu not open');
  await page.keyboard.press('Escape');
  // unknown route
  await page.goto(`${BASE}/no-such-tool`, { waitUntil: 'networkidle' });
  await checkPage(page, '/no-such-tool', 'unknown route');
  await check(page, (await page.locator('main').innerText()).trim().length > 0, '/no-such-tool', 'unknown route shows something', 'empty document area');
  await ctx.close();
}

async function flowMobile(browser) {
  const ctx = await newCtx(browser, { width: 390, height: 844 });
  const page = track(await ctx.newPage());
  for (const route of ROUTES) {
    await gotoFresh(page, route);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, bw: document.body.scrollWidth }));
    await check(page, m.sw <= m.iw + 1 && m.bw <= m.iw + 1, route, '10 mobile no horizontal overflow', JSON.stringify(m));
    const aside = page.locator(PROPS);
    const vis = (await aside.count()) && (await aside.isVisible());
    await check(page, !!vis, route, '10 mobile properties panel visible', 'panel not visible');
    if (vis && !NO_PROPS.has(route)) {
      const c = aside.locator('input, select').first();
      await c.scrollIntoViewIfNeeded();
      const bb = await c.boundingBox();
      await check(page, !!bb && bb.x >= 0 && bb.x + bb.width <= 391 && bb.y >= 0 && bb.y < 844, route, '10 mobile first property control reachable', JSON.stringify(bb));
      // last control too
      const cl = aside.locator('input, select').last();
      await cl.scrollIntoViewIfNeeded();
      const bl = await cl.boundingBox();
      await check(page, !!bl && bl.x >= 0 && bl.x + bl.width <= 391 && bl.y >= 0 && bl.y < 844, route, '10 mobile last property control reachable', JSON.stringify(bl));
    }
    await checkPage(page, route, '10 mobile');
  }
  await ctx.close();
}

function withTimeout(p, ms, what) {
  let t;
  return Promise.race([p, new Promise((_, rej) => (t = setTimeout(() => rej(new Error(`${what} hung for ${ms / 1000} s (page frozen?)`)), ms)))]).finally(() => clearTimeout(t));
}

/** Run one step in its own browser context, so a frozen tab cannot take later steps down with it. */
async function runIsolated(browser, route, name, fn, ms) {
  const ctx = await newCtx(browser);
  const page = track(await ctx.newPage());
  try {
    await withTimeout(fn(page), ms, name);
  } catch (e) {
    await fail(page, route, `${name} (aborted)`, e.message.split('\n')[0]);
  }
  await withTimeout(ctx.close(), 15000, 'close').catch(() => log('  (context close timed out)'));
}

async function newCtx(browser, viewport = { width: 1600, height: 1000 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('pcbtk-settings')) localStorage.setItem('pcbtk-settings', JSON.stringify({ unit: 'mm', theme: 'dark' }));
  });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  return ctx;
}

// ---------------------------------------------------------------- main
async function main() {
  try {
    const r = await fetch(BASE);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  } catch (e) {
    console.error(`Preview server not reachable at ${BASE} (${e.message}). Run: npm run build && npx vite preview --port 4173 --strictPort`);
    process.exit(2);
  }
  const t0 = Date.now();
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  if (!SKIP.has('sweep')) {
    for (const route of ONLY ?? ROUTES) {
      const t = Date.now();
      log(`route ${route}`);
      const container = route === '/units' ? 'main' : PROPS;
      const steps = [
        ['load', (page) => stepLoad(page, route)],
        ['theme', (page) => stepTheme(page, route)],
      ];
      if (route !== '/') {
        steps.push(
          ['fields', (page) => stepFields(page, route, container)],
          ['selects', (page) => stepSelects(page, route, container)],
          ['toggles', (page) => stepToggles(page, route, container)],
          ['unit switch', (page) => stepUnitSwitch(page, route, container)],
          ['global unit', (page) => stepGlobalUnit(page, route, container)],
          ['url state', (page) => stepUrlState(page, route, container)],
        );
      }
      for (const [name, fn] of steps) {
        await runIsolated(browser, route, name, fn, 10 * 60000);
      }
      log(`  ${((Date.now() - t) / 1000).toFixed(0)} s`);
    }
  }

  if (!SKIP.has('special')) {
    for (const [name, route, fn] of [
      ['impedance', '/impedance', flowImpedance],
      ['advisor', '/stackup-advisor', flowAdvisor],
      ['stackup', '/stackup', flowStackup],
      ['stackup', '/stackup', flowStackupEdit],
      ['stackup', '/stackup', flowStackupTargets],
    ]) {
      if (SKIP.has(name)) continue;
      log(`flow ${fn.name}`);
      await runIsolated(browser, route, `flow ${fn.name}`, fn, 15 * 60000);
    }
  }
  if (!SKIP.has('tabs')) {
    log('flow tabs/menus');
    await withTimeout(flowTabsMenus(browser), 10 * 60000, 'tabs').catch((e) => fail(null, 'tabs/menus', 'exception', e.message.split('\n')[0]));
  }
  if (!SKIP.has('mobile')) {
    log('flow mobile');
    await withTimeout(flowMobile(browser), 10 * 60000, 'mobile').catch((e) => fail(null, 'mobile', 'exception', e.message.split('\n')[0]));
  }
  await browser.close();

  const report = { base: BASE, seconds: Math.round((Date.now() - t0) / 1000), pass: R.pass, fail: R.fail, uniqueFailures: R.failures.length, failures: R.failures, warnings: R.warnings };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  log('\n================ SUMMARY ================');
  log(`passed checks: ${R.pass}   failed checks: ${R.fail}   unique failures: ${R.failures.length}   (${report.seconds} s)`);
  for (const f of R.failures) log(`- [${f.route}] ${f.step}${f.count > 1 ? ` (x${f.count})` : ''}\n    ${f.evidence}\n    ${f.shot}`);
  if (R.warnings.length) {
    log(`\nwarnings (${R.warnings.length}):`);
    for (const w of R.warnings) log(`- [${w.route}] ${w.step}: ${w.msg}`);
  }
  log(`\nreport: ${path.join(OUT, 'report.json')}`);
  process.exit(R.fail ? 1 : 0);
}

main();
