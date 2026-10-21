// User-facing regressions: demonstration, reports, explicit loads, imports, estimated fill and responsive controls.
// Run against the dev server or a production preview: node scripts/audit-kicad-workflow.mjs [base URL]
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const base = (process.argv[2] ?? 'http://127.0.0.1:5186').replace(/\/$/, '');
const out = 'dist-check/kicad-workflow'; mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, serviceWorkers: 'block', acceptDownloads: true });
await context.addInitScript(() => {
  localStorage.setItem('pcbplanner:analytics-consent', JSON.stringify({ choice: 'declined', version: 2, updatedAt: new Date().toISOString() }));
});
const page = await context.newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
page.setDefaultTimeout(20000);
let checks = 0;
const check = (condition, message) => { assert(condition, message); checks++; console.log('PASS ' + message); };
const idle = async () => page.waitForFunction(() => !document.querySelector('[data-result-busy="true"]'), undefined, { timeout: 90000 });
const nav = () => page.getByRole('navigation', { name: 'Project views' });
const view = async name => { await nav().getByRole('button', { name, exact: true }).click(); await page.getByRole('heading', { name, exact: true }).waitFor(); };
const report = () => page.getByRole('dialog', { name: 'Calculation report', exact: true });
const preview = () => page.frameLocator('iframe[title="Calculation report preview"]');
const closeReport = async () => { await report().getByRole('button', { name: 'Close report' }).click(); await report().waitFor({ state: 'detached' }); };
const noOverflow = async label => check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), label + ' has no page overflow');
const rejectBlankNumber = async label => {
  const input = page.getByRole('textbox', { name: label, exact: true }), original = await input.inputValue();
  for (const value of ['', 'abc', '1.2x', '1e309']) { await input.fill(value); await input.press('Tab'); check(await input.inputValue() === original, label + ' retains its committed value after ' + JSON.stringify(value)); }
};

try {
  await page.goto(base + '/');
  await page.getByRole('heading', { name: 'Check a KiCad board', exact: true }).waitFor();
  check(await page.getByRole('link', { name: /Power and voltage drop/ }).getAttribute('href') === '/kicad-project?view=power&pmode=dc', 'Home opens the board DC-drop workflow directly');
  await page.goto(base + '/kicad-project');
  await page.getByRole('button', { name: 'Try an example', exact: true }).click();
  await page.getByTestId('example-scenario').waitFor();
  await page.waitForFunction(() => document.body.textContent.includes('routing check done'));
  check(await page.getByText('1 routing failures', { exact: false }).count() > 0 || (await page.getByRole('heading', { name: 'Check summary' }).locator('..').locator('..').innerText()).includes('1'), 'Example presents a routing summary');
  await view('Power'); await idle();
  await rejectBlankNumber('Current of U2, A');
  const power = page.getByTestId('power-summary');
  check((await power.innerText()).includes('U2') && !(await power.innerText()).includes('not connected'), 'Demonstration supply and return connect to U2');
  check(await page.locator('#tool-inputs').getByRole('combobox', { name: 'Source', exact: true }).count() === 1, 'Power controls are in Properties on desktop');
  await page.getByRole('button', { name: 'Remove U2', exact: true }).click();
  await page.getByRole('button', { name: 'Add load', exact: true }).click();
  check(await page.getByRole('combobox', { name: 'Load 1', exact: true }).inputValue() === 'U2', 'Add load prefers the IC over capacitors');
  check(await page.getByRole('textbox', { name: 'Current of U2, A', exact: true }).inputValue() === '0', 'New loads do not invent a current');
  await page.getByRole('button', { name: /Spread 0.2 A over selected loads/ }).click(); await idle();
  check(await page.getByRole('combobox', { name: /^Load \d/ }).count() === 1, 'Spreading current does not silently add passive components');
  await page.screenshot({ path: out + '/power-desktop.png' });

  await view('Thermal');
  await rejectBlankNumber('Power of U1, W');
  check(await page.getByRole('textbox', { name: 'Power of U1, W', exact: true }).inputValue() === '0.34', 'Thermal has explicit regulator dissipation');
  check(await page.getByRole('textbox', { name: 'Power of U2, W', exact: true }).inputValue() === '0.66', 'Thermal has explicit load dissipation');
  await page.getByRole('button', { name: 'Solve', exact: true }).click(); await idle();
  check((await page.getByTestId('thermal-summary').innerText()).includes('U1'), 'Thermal summary identifies the heated parts');
  const ambient = page.getByRole('textbox', { name: 'Ambient', exact: true });
  await ambient.fill('35'); await ambient.press('Tab');
  await page.locator('[data-result-stale="true"]').waitFor({ state: 'attached' });
  await page.getByRole('button', { name: 'Create calculation report' }).click();
  check((await report().innerText()).includes('Solve again'), 'A stale thermal result cannot be exported as current');
  await closeReport();
  await page.getByRole('button', { name: 'Solve', exact: true }).click(); await idle();
  await page.screenshot({ path: out + '/thermal-desktop.png' });
  await page.getByRole('button', { name: 'Full screen', exact: true }).click();
  await page.getByRole('button', { name: 'Exit full screen', exact: true }).waitFor();
  check(await page.locator('.tool-page').getByRole('textbox', { name: 'Power of U1, W', exact: true }).count() === 1, 'Fullscreen keeps the thermal controls with the board');
  await page.screenshot({ path: out + '/thermal-fullscreen.png' });
  await page.getByRole('button', { name: 'Exit full screen', exact: true }).click();
  await page.locator('#tool-inputs').getByRole('textbox', { name: 'Power of U1, W', exact: true }).waitFor();
  check(await page.locator('#tool-inputs').getByRole('textbox', { name: 'Power of U1, W', exact: true }).count() === 1, 'Exiting fullscreen restores Properties without duplicate inputs');
  await view('Clearance'); await idle();
  await rejectBlankNumber('Peak voltage of +48V, V');
  check((await page.getByTestId('clearance-summary').innerText()).includes('closer than'), 'The separate 48 V coupon demonstrates a clearance finding');

  await nav().getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('heading', { name: 'Check summary', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Create calculation report' }).click();
  await preview().getByRole('heading', { name: 'Project identity and scope', exact: true }).waitFor({ timeout: 90000 });
  const reportText = await preview().locator('body').innerText();
  for (const heading of ['Physical stackup', 'Routing check', 'Power: DC voltage drop', 'Thermal', 'Clearance']) check(reportText.includes(heading), 'Project report includes ' + heading + ' from inactive tabs');
  check(!reportText.includes('No file selected'), 'Report omits empty hidden file pickers');
  check(reportText.includes('U1') && reportText.includes('U2') && reportText.includes('pcbplanner-example-6layer.kicad_pcb'), 'Report retains component references and the board filename');
  check(await preview().locator('figure img').count() >= 2, 'Report contains standalone voltage-drop and thermal grids');
  const download = page.waitForEvent('download');
  await report().getByRole('button', { name: 'Save HTML', exact: true }).click();
  await (await download).saveAs(out + '/project-report.html');
  const exported = readFileSync(out + '/project-report.html', 'utf8');
  check(exported.includes('U1') && exported.includes('U2') && !/<script\b|<input\b|<button\b/i.test(exported), 'Saved report is self-contained and has no live application controls');
  const printPage = await context.newPage();
  await printPage.setViewportSize({ width: 794, height: 1123 }); await printPage.setContent(exported);
  await printPage.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
  await printPage.screenshot({ path: out + '/report-first-page.png' });
  await printPage.pdf({ path: out + '/project-report.pdf', preferCSSPageSize: true, printBackground: true });
  check(readFileSync(out + '/project-report.pdf').length > 10000, 'The standalone report prints to PDF with embedded plots');
  await printPage.close();
  await closeReport();
  const projectUrl = page.url();

  await page.goto(base + '/trace-width');
  await page.getByRole('combobox', { name: 'Layer', exact: true }).selectOption('F.Cu');
  await page.getByRole('combobox', { name: 'Net', exact: true }).selectOption('+3V3');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.waitForFunction(() => new URLSearchParams(location.search).get('mode') === 'current');
  check(Number(new URL(page.url()).searchParams.get('width')) === 0.8, 'Trace Width imports the routed width and switches to current-capacity mode');
  await page.getByRole('combobox', { name: 'Layer', exact: true }).selectOption('In1.Cu');
  check(await page.getByRole('button', { name: 'Apply', exact: true }).isEnabled(), 'A plane layer can supply copper thickness without an impedance reference');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.waitForFunction(() => new URLSearchParams(location.search).get('t') === '0.0152');
  check(Number(new URL(page.url()).searchParams.get('t')) === 0.0152, 'Trace Width imports the inner copper thickness');
  await page.goto(base + '/via');
  await page.getByLabel('Via to import', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.waitForFunction(() => new URLSearchParams(location.search).get('len') === '1.6364');
  check(!new URL(page.url()).searchParams.has('plating') && !new URL(page.url()).searchParams.has('antipad'), 'Via import leaves unknown plating and antipad assumptions untouched');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(projectUrl); await nav().waitFor();
  for (const name of ['Power', 'Thermal', 'Clearance']) {
    await view(name); await idle(); await noOverflow(name + ' on a phone');
    check(await page.locator('#tool-inputs').getByRole('button', { name: name === 'Power' ? 'Add load' : name === 'Thermal' ? 'Add part' : 'Add net', exact: true }).count() === 1, name + ' controls remain in the phone Inputs panel above the results');
    await page.screenshot({ path: out + '/' + name.toLowerCase() + '-mobile.png', fullPage: true });
  }

  // A board that relies on a plane for its supply path: remove the long supply track and all saved fills.
  let unfilled = readFileSync('public/examples/pcbplanner-example-6layer.kicad_pcb', 'utf8');
  const listEnd = (text, start) => { let depth = 0, quoted = false; for (let i = start; i < text.length; i++) { if (text[i] === '"' && text[i - 1] !== '\\') quoted = !quoted; if (quoted) continue; if (text[i] === '(') depth++; if (text[i] === ')' && --depth === 0) return i + 1; } throw Error('Unclosed fixture list'); };
  const remove = (text, token, predicate = () => true) => { let at = 0; for (;;) { const start = text.indexOf('(' + token, at); if (start < 0) return text; const end = listEnd(text, start), block = text.slice(start, end); if (predicate(block)) { text = text.slice(0, start) + text.slice(end); at = start; } else at = end; } };
  unfilled = remove(unfilled, 'filled_polygon');
  const railStart = unfilled.indexOf('(start 141.65 151.85)');
  assert(railStart > 0, 'The plane-dependent fixture must remove the known supply rail');
  const railOpen = unfilled.lastIndexOf('(segment', railStart);
  const rail = unfilled.slice(railOpen, listEnd(unfilled, railOpen));
  unfilled = remove(unfilled, 'segment', block => block.includes('(start 141.65 151.85)') && block.includes('(end 168.5 151.85)'));
  // Cut the middle, retaining the connection between both supply pads of U2 and its plane via.
  unfilled = unfilled.slice(0, unfilled.lastIndexOf(')')) + rail.replace('(end 168.5 151.85)', '(end 146 151.85)') + rail.replace('(start 141.65 151.85)', '(start 159 151.85)').replace(/\(uuid "[^"]+"\)/, '(uuid "10000000-0000-4000-8000-000000000001")') + '\n)';
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.goto(projectUrl); await nav().waitFor();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('input[type="file"][accept*=".kicad_pcb"]').setInputFiles({ name: 'unfilled-plane-demo.kicad_pcb', mimeType: 'text/plain', buffer: Buffer.from(unfilled) });
  await page.waitForFunction(() => document.body.textContent.includes('unfilled-plane-demo.kicad_pcb') && !document.body.textContent.includes('Reading unfilled-plane-demo'));
  await view('Power'); await idle();
  check((await page.getByTestId('power-summary').innerText()).includes('not connected'), 'Unfilled plane-dependent load is correctly reported as disconnected');
  await page.getByRole('checkbox', { name: /^Estimate \+3V3/ }).check();
  await page.getByRole('checkbox', { name: /^Estimate GND/ }).check();
  await idle();
  await page.getByText('Zone fill: estimate', { exact: true }).waitFor();
  check(!(await page.getByTestId('power-summary').innerText()).includes('not connected'), 'Opt-in estimated fill connects the plane-dependent load');
  check((await page.locator('#tool-inputs').innerText()).includes("not KiCad's fill"), 'Estimated copper is explicitly identified beside its controls');
  await view('Thermal');
  check(await page.getByRole('checkbox', { name: /^Estimate \+3V3/ }).isChecked(), 'The estimate selection is shared with Thermal');
  await page.getByRole('button', { name: 'Solve', exact: true }).click(); await idle();
  await page.getByText('Zone fill: estimate', { exact: true }).waitFor();
  check((await page.getByTestId('thermal-summary').innerText()).includes('U2'), 'Thermal solves with explicitly estimated copper');
  await page.screenshot({ path: out + '/estimated-fill-desktop.png' });
  await page.locator('input[type="file"][accept*=".kicad_pcb"]').setInputFiles({ name: 'unfilled-plane-demo.kicad_pcb', mimeType: 'text/plain', buffer: Buffer.from(unfilled) });
  await page.getByTestId('thermal-summary').getByText('Press Solve to work out the temperature of the board.', { exact: true }).waitFor();
  check(!(await page.getByTestId('thermal-summary').innerText()).includes('Hottest'), 'Reloading a board never reuses a thermal result from the previous board object');
  await page.goto(base + '/kicad-project?view=overview');
  await page.waitForFunction(() => document.body.textContent.includes('routing check done') && !/solving \d+ of/.test(document.body.textContent), undefined, { timeout: 90000 });
  await page.getByRole('button', { name: 'Create calculation report' }).click();
  await preview().getByRole('heading', { name: 'Project identity and scope', exact: true }).waitFor({ timeout: 90000 });
  check(((await preview().locator('body').innerText()).match(/Not configured:/g) ?? []).length === 3, 'Unconfigured DC, thermal and clearance analyses are explicitly marked instead of passed');
  await closeReport();
  check(errors.length === 0, 'No browser runtime errors: ' + errors.join('; '));
  writeFileSync(out + '/result.json', JSON.stringify({ base, checks, errors, passed: true }, null, 2));
  console.log(`${checks} workflow checks passed`);
} catch (error) {
  await page.screenshot({ path: out + '/failure.png', fullPage: true }).catch(() => {});
  writeFileSync(out + '/result.json', JSON.stringify({ base, checks, errors, passed: false, failure: String(error) }, null, 2));
  console.error(error); process.exitCode = 1;
} finally { await browser.close(); }
