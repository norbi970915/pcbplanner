// Focused regressions for review status, guided findings and synthetic Touchstone examples.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { loadLegacyKicadExample } from './lib/legacy-kicad-example.mjs';
const base = (process.argv[2] ?? 'http://127.0.0.1:4192').replace(/\/$/, '');
const out = 'dist-check/review-examples'; mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, serviceWorkers: 'block', acceptDownloads: true });
await context.addInitScript(() => localStorage.setItem('pcbplanner:analytics-consent', JSON.stringify({ choice: 'declined', version: 2, updatedAt: new Date().toISOString() })));
const page = await context.newPage(), errors = [], checks = [];
page.setDefaultTimeout(30000); page.on('pageerror', e => errors.push(e.message));
const check = (ok, message) => { assert(ok, message); checks.push(message); console.log('PASS ' + message); };
const nav = () => page.getByRole('navigation', { name: 'Project views' });
const view = async name => { await nav().getByRole('button', { name, exact: true }).click(); await page.getByRole('heading', { name: name === 'Overview' ? 'Check summary' : name, exact: true }).waitFor(); };
const idle = async () => page.waitForFunction(() => !document.querySelector('[data-result-busy="true"]'), undefined, { timeout: 90000 });
const card = name => page.getByRole('region', { name: name + ' check', exact: true });
const status = name => card(name).getByRole('status');
const noOverflow = async label => check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), label + ' has no horizontal overflow');
const resumeWorker = async route => { try { await route.continue(); } catch (error) { if (!String(error).includes('Route is already handled')) throw error; } };
try {
  await loadLegacyKicadExample(page, base);
  await page.waitForFunction(() => document.body.textContent.includes('routing check done'));
  await status('Routing').filter({ hasText: 'Needs review' }).waitFor({ timeout: 90000 });
  check(await status('Routing').innerText() === 'Needs review', 'Routing findings are visible in the overview');
  for (const name of ['Power', 'Thermal', 'Clearance']) check(await status(name).innerText() === 'Not run', name + ' never appears passed before running');
  await card('Routing').getByRole('button', { name: 'Review findings', exact: true }).click();
  await page.getByRole('heading', { name: 'Suggested next steps', exact: true }).waitFor();
  check((await page.getByRole('navigation', { name: 'Routing findings' }).innerText()).includes('Finding 1 of'), 'Review starts at the first prioritized finding');
  const next = page.getByRole('button', { name: 'Next finding', exact: true });
  if (await next.isEnabled()) { await next.click(); check((await page.getByRole('navigation', { name: 'Routing findings' }).innerText()).includes('Finding 2 of'), 'Next finding advances the selection'); await page.getByRole('button', { name: 'Previous finding', exact: true }).click(); }
  const picker = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Load corrected board', exact: true }).click(); await picker;
  check(true, 'Load corrected board opens the local file picker');
  await page.screenshot({ path: out + '/guided-findings.png' });
  await view('Power'); await idle(); await view('Overview');
  check(['Estimate ready', 'Needs review'].includes(await status('Power').innerText()), 'Power overview reflects the actual completed solve');
  await view('Power'); await idle();
  // Hold the new worker so a fast runner cannot finish before the stale-state assertion.
  let releasePower; const powerGate = new Promise(resolve => { releasePower = resolve; });
  const powerRoute = async route => { await powerGate; await resumeWorker(route); };
  await context.route(/kicadPower\.worker/, powerRoute);
  const current = page.getByRole('textbox', { name: 'Current of U2, A', exact: true }); await current.fill('0.3'); await current.press('Tab');
  try { await view('Overview'); check(['Out of date', 'Running'].includes(await status('Power').innerText()), 'Changed load current invalidates the saved Power estimate'); }
  finally { releasePower(); await context.unroute(/kicadPower\.worker/, powerRoute); }
  await card('Power').getByRole('button', { name: 'Open Power', exact: true }).click(); await idle(); await view('Overview');
  check(await status('Power').innerText() === 'Estimate ready', 'Opening Power refreshes an outdated estimate');
  await view('Thermal'); await page.getByRole('button', { name: 'Solve', exact: true }).click(); await idle();
  const thermal = await page.getByTestId('thermal-summary').innerText();
  await view('Overview'); check(await status('Thermal').innerText() === 'Estimate ready', 'Solved Thermal is an estimate, not an invented temperature pass');
  await view('Thermal'); await idle();
  check(await page.getByTestId('thermal-summary').innerText() === thermal, 'Thermal map and results survive a round trip between tabs');
  const ambient = page.getByRole('textbox', { name: 'Ambient', exact: true }); await ambient.fill('35'); await ambient.press('Tab');
  await view('Overview'); check(await status('Thermal').innerText() === 'Out of date', 'Changed thermal inputs mark the saved result out of date');
  let releaseThermal; const thermalGate = new Promise(resolve => { releaseThermal = resolve; });
  const thermalRoute = async route => { await thermalGate; await resumeWorker(route); };
  await context.route(/kicadThermal\.worker/, thermalRoute);
  await view('Thermal'); await page.getByRole('button', { name: 'Solve', exact: true }).click();
  try { await page.locator('[data-result-busy="true"]').first().waitFor({ state: 'attached' }); await view('Overview'); check(await status('Thermal').innerText() === 'Running', 'Overview shows a running Thermal solve while its worker is pending'); }
  finally { releaseThermal(); await context.unroute(/kicadThermal\.worker/, thermalRoute); }
  await status('Thermal').filter({ hasText: 'Estimate ready' }).waitFor({ timeout: 90000 });
  check(true, 'Thermal solve finishes and updates the overview after leaving its tab');
  await view('Clearance'); await idle(); await view('Overview');
  check(await status('Clearance').innerText() === 'Needs review', 'Clearance overview reports the demonstration spacing finding');
  await noOverflow('Desktop review overview'); await page.screenshot({ path: out + '/overview-desktop.png' });
  await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click();
  await page.screenshot({ path: out + '/overview-light.png' }); await noOverflow('Light review overview');
  await page.getByRole('button', { name: 'Switch to dark theme', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 }); await noOverflow('Mobile review overview'); await page.screenshot({ path: out + '/overview-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1500, height: 1000 });
  // The same filename must still be treated as a newly imported board, with no previous solve.
  const boardPath = 'public/examples/pcbplanner-example-6layer.kicad_pcb';
  await page.locator('input[type=file]').first().setInputFiles({ name: boardPath.split('/').pop(), mimeType: 'text/plain', buffer: readFileSync(boardPath) });
  await status('Thermal').filter({ hasText: 'Not run' }).waitFor();
  check(await status('Thermal').innerText() === 'Not run', 'Reloading a board with the same filename clears its solved-result scope');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await view('Overview');
  for (const name of ['Thermal', 'Clearance']) check(await status(name).innerText() === 'Needs inputs', name + ' is explicitly unconfigured after Reset');

  await page.goto(base + '/s-parameter-viewer');
  await page.getByRole('button', { name: 'Try 2-port example', exact: true }).click();
  await page.getByRole('heading', { name: '2-port: loss, reflection and delay', exact: true }).waitFor();
  const main = () => page.locator('main');
  check((await main().innerText()).includes('Synthetic teaching data, not a measurement'), 'Examples have explicit synthetic provenance');
  check(await page.getByRole('heading', { name: 'Group Delay of S21', exact: true }).count() === 1, '2-port example opens the intended group-delay trace');
  check((await main().innerText()).includes('100 ps'), '2-port example explains its 100 ps delay');
  const marker = page.getByRole('slider', { name: 'Transmission magnitude against frequency', exact: true });
  await marker.focus(); await marker.press('ArrowRight');
  await page.waitForFunction(() => Number(document.querySelector('[role="slider"][aria-label="Transmission magnitude against frequency"]')?.getAttribute('aria-valuenow')) > 4e9);
  check(await page.getByRole('textbox', { name: 'Frequency', exact: true }).inputValue() !== '4', 'Example plots support keyboard marker movement');
  await noOverflow('Desktop 2-port example'); await page.screenshot({ path: out + '/two-port-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Try differential example', exact: true }).click();
  await page.getByRole('heading', { name: 'Differential: see what skew does', exact: true }).waitFor();
  check(await page.getByRole('heading', { name: 'Transmission and Mode Conversion |S| (dB)', exact: true }).count() === 1, 'Differential example opens in mixed mode');
  check(await page.getByRole('heading', { name: 'Group Delay of SDD21', exact: true }).count() === 1, 'Differential example selects differential transmission delay');
  check((await main().innerText()).includes('165 ps'), 'Differential example explains its mean path delay');
  await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click(); await noOverflow('Light differential example');
  await page.screenshot({ path: out + '/differential-light.png' }); await page.getByRole('button', { name: 'Switch to dark theme', exact: true }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.getByRole('heading', { name: 'Differential: see what skew does', exact: true }).waitFor({ state: 'detached' });
  check(await page.getByRole('heading', { name: 'Differential: see what skew does', exact: true }).count() === 0, 'Reset clears the loaded example and annotations');
  await page.getByRole('button', { name: /^Undo/ }).click();
  await page.getByRole('heading', { name: 'Differential: see what skew does', exact: true }).waitFor();
  check(true, 'Undo restores example data, provenance and settings');
  await page.getByRole('button', { name: 'Create calculation report' }).click();
  await page.frameLocator('iframe[title="Calculation report preview"]').getByRole('heading', { name: 'Differential: see what skew does', exact: true }).waitFor();
  check(true, 'Calculation report retains the synthetic example explanation');
  await page.getByRole('dialog', { name: 'Calculation report', exact: true }).getByRole('button', { name: 'Close report', exact: true }).click();
  await page.screenshot({ path: out + '/differential-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await noOverflow('Mobile differential example'); await page.screenshot({ path: out + '/differential-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.getByLabel('Choose a Touchstone file', { exact: true }).setInputFiles({ name: 'synthetic-30ps-skew.s4p', mimeType: 'text/plain', buffer: Buffer.from('# Hz S RI R 50\n1000000000 0 0 0.5 0 0.5 0 0 0\n2000000000 0 0 0.5 0 0.5 0 0 0\n') });
  await page.locator('main [role="alert"]').waitFor();
  await page.getByRole('button', { name: 'Try 2-port example', exact: true }).click();
  await page.getByRole('heading', { name: '2-port: loss, reflection and delay', exact: true }).waitFor();
  check(true, 'Example buttons recover after an invalid upload');
  await page.getByLabel('Choose a Touchstone file', { exact: true }).setInputFiles({ name: 'synthetic-100ps-channel.s2p', mimeType: 'text/plain', buffer: Buffer.from('# Hz S RI R 50\n1000000000 0 0 0.5 0 0.5 0 0 0\n2000000000 0 0 0.5 0 0.5 0 0 0\n') });
  await page.getByRole('heading', { name: '2-port: loss, reflection and delay', exact: true }).waitFor({ state: 'detached' });
  check(true, 'An uploaded file sharing an example filename never inherits synthetic annotations');
  check(errors.length === 0, 'No browser runtime errors: ' + errors.join('; '));
  writeFileSync(out + '/report.json', JSON.stringify({ base, passed: true, checks, errors }, null, 2));
  console.log(checks.length + ' review/example checks passed');
} catch (error) {
  await page.screenshot({ path: out + '/failure.png', fullPage: true }).catch(() => {});
  writeFileSync(out + '/report.json', JSON.stringify({ base, url: page.url(), passed: false, checks, errors, error: String(error) }, null, 2));
  console.error(error); process.exitCode = 1;
  const diagnostic = `${String(error)} | Last passed: ${checks.at(-1) ?? 'none'} | URL: ${page.url()}`;
  console.error('::error title=Review and example regression::' + diagnostic.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A'));
} finally { await browser.close(); }
