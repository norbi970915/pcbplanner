// Public LinkBench-4 examples: native files, explicit assumptions, useful maps and real revision differences.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { chromium } from 'playwright-core';
const base = (process.argv[2] ?? 'http://127.0.0.1:4197').replace(/\/$/, '');
const out = 'dist-check/linkbench-example'; mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1500, height: 1050 }, serviceWorkers: 'block', acceptDownloads: true });
await context.addInitScript(() => localStorage.setItem('pcbplanner:analytics-consent', JSON.stringify({ choice: 'declined', version: 2, updatedAt: new Date().toISOString() })));
const page = await context.newPage(), errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(30000);
const check = (ok, label) => { assert(ok, label); checks.push(label); console.log('PASS ' + label); };
const idle = () => page.waitForFunction(() => !document.querySelector('[data-result-busy="true"]'), null, { timeout: 90000 });
const view = async name => { await page.getByRole('navigation', { name: 'Project views' }).getByRole('button', { name, exact: true }).click(); await idle(); };
const gerberReady = async () => { await page.waitForFunction(() => { const button = [...document.querySelectorAll('button')].find(button => button.textContent === 'PNG'); return button && !button.disabled; }); };
const pixels = () => page.locator('.gerber-canvas-wrap canvas').evaluate(canvas => {
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let common = 0, changed = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] === 125 && data[i + 1] === 135 && data[i + 2] === 145) common++;
    if ((data[i] === 208 && data[i + 1] === 138 && data[i + 2] === 60) || (data[i] === 61 && data[i + 1] === 143 && data[i + 2] === 224)) changed++;
  }
  return { common, changed };
});
try {
  await page.goto(base + '/');
  check(await page.getByRole('heading', { name: 'Meet LinkBench-4: routing, power and thermal in one example', exact: true }).isVisible(), 'Home announces the realistic KiCad example');
  check(await page.getByRole('heading', { name: 'Compare real board revisions in the Gerber viewer', exact: true }).isVisible(), 'Home announces the realistic Gerber comparison');
  const zip = await page.request.get(base + '/examples/linkbench-4/LinkBench-4-example.zip');
  check(zip.ok(), 'Example source download is available');
  const files = unzipSync(await zip.body());
  check(Object.keys(files).length === 19 && !Object.keys(files).some(path => /\.kicad_prl$|backup|\.DS_Store/.test(path)), 'Download contains only the 19 intended public source and Gerber files');
  await page.goto(base + '/kicad-project');
  await page.getByRole('button', { name: 'Try an example', exact: true }).click();
  await page.getByTestId('example-scenario').waitFor();
  await page.waitForFunction(() => document.body.textContent.includes('routing check done'), null, { timeout: 90000 });
  check((await page.locator('main').innerText()).includes('LinkBench-4'), 'Try an example loads LinkBench-4');
  const routing = await page.getByRole('region', { name: 'Routing check', exact: true }).innerText();
  console.log('ROUTING ' + routing);
  check(/0 routing failures/.test(routing), 'All four differential pairs pass their assigned routing targets');
  await page.getByText('Demonstration assumptions and expected findings', { exact: true }).click();
  check((await page.getByTestId('example-scenario').innerText()).includes('294.12 mA and 1.47 W total'), 'Demo explains reproducible load and heat assumptions');
  await page.getByText('Demonstration assumptions and expected findings', { exact: true }).click();
  await view('Board');
  await page.screenshot({ path: out + '/routing.png' });
  await view('Power');
  for (const ref of ['R1', 'R2', 'R3', 'R4']) check(await page.getByRole('textbox', { name: 'Current of ' + ref + ', A', exact: true }).inputValue() === '0.0735294', ref + ' has its explicit nominal load current');
  const power = await page.getByTestId('power-summary').innerText(); console.log('POWER ' + power);
  check(!/not connected|NaN/.test(power) && ['R1', 'R2', 'R3', 'R4'].every(ref => power.includes(ref)), 'All four loads have connected supply and return paths');
  const drop = Number(/Largest drop seen by a connected load ([\d.]+) mV/.exec(power)?.[1]);
  check(drop > 4 && drop < 6, 'Voltage drop reproduces the original approximately 4.7 mV result');
  await page.screenshot({ path: out + '/power.png' });
  await view('Thermal');
  for (const ref of ['R1', 'R2', 'R3', 'R4']) check(await page.getByRole('textbox', { name: 'Power of ' + ref + ', W', exact: true }).inputValue() === '0.367647', ref + ' has explicit nominal dissipation');
  await page.getByRole('button', { name: 'Solve', exact: true }).click(); await idle();
  const thermal = await page.getByTestId('thermal-summary').innerText(); console.log('THERMAL ' + thermal);
  const peak = Number(/Hottest ([\d.]+) °C/.exec(thermal)?.[1]);
  check(peak > 54 && peak < 57, 'Thermal result reproduces the original approximately 55 °C board estimate');
  await page.screenshot({ path: out + '/thermal.png' });
  await view('Overview');
  check(await page.getByRole('region', { name: 'Thermal check', exact: true }).getByRole('status').innerText() === 'Estimate ready', 'Completed thermal map is labelled as an estimate');
  await page.getByRole('button', { name: 'Create calculation report' }).click();
  const report = page.getByRole('dialog', { name: 'Calculation report', exact: true });
  const preview = page.frameLocator('iframe[title="Calculation report preview"]');
  await preview.getByRole('heading', { name: 'Project identity and scope', exact: true }).waitFor({ timeout: 90000 });
  const reportText = await preview.locator('body').innerText();
  check(reportText.includes('LinkBench-4.kicad_pcb') && reportText.includes('R4') && reportText.includes('Thermal'), 'Export report includes LinkBench identity and results from inactive tabs');
  const download = page.waitForEvent('download'); await report.getByRole('button', { name: 'Save HTML', exact: true }).click(); await (await download).saveAs(out + '/project-report.html');
  await report.getByRole('button', { name: 'Close report', exact: true }).click();
  await page.goto(base + '/gerber-viewer');
  await page.getByRole('button', { name: 'Try sample board', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.gerber-layer-row').length === 6); await gerberReady();
  check(await page.getByTestId('gerber-example').count() === 1, 'Inspection loads six native layers and explains the sample');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.getByRole('button', { name: 'Compare revisions', exact: true }).click();
  await page.getByRole('button', { name: 'Try sample comparison', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.gerber-layer-row').length === 12); await gerberReady();
  check(await page.locator('.gerber-import-warnings').count() === 0, 'All twelve native layers import without warnings');
  const overlay = await pixels(); check(overlay.common > 1000 && overlay.changed > 100, 'Top copper shows shared geometry and actual revision changes');
  await page.getByRole('button', { name: 'Focus view', exact: true }).click(); await gerberReady();
  await page.screenshot({ path: out + '/gerber-overlay.png' });
  await page.getByRole('radio', { name: 'Differences only', exact: true }).click();
  await page.waitForFunction(() => { const canvas = document.querySelector('.gerber-canvas-wrap canvas'), data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data; for (let i = 0; i < data.length; i += 4) if (data[i] === 125 && data[i + 1] === 135 && data[i + 2] === 145) return false; return true; });
  await gerberReady();
  const differences = await pixels(); check(differences.common === 0 && differences.changed > 100, 'Differences only hides shared copper and retains real changes');
  await page.screenshot({ path: out + '/gerber-differences.png' });
  await page.getByRole('radio', { name: 'Overlay', exact: true }).click();
  for (const side of ['A', 'B']) {
    const section = page.locator('.properties-section').filter({ has: page.getByRole('button', { name: new RegExp('Layout ' + side + ' layers') }) });
    await section.getByRole('button', { name: 'Hide all', exact: true }).click();
    await section.locator('.gerber-layer-row').filter({ hasText: 'Edge_Cuts' }).locator('input[type=checkbox]').check();
  }
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  // Thin profile strokes may fall below the comparison's documented 50% pixel threshold.
  // Verify source coordinates too, rather than requiring a minimum number of grey outline pixels.
  const profiles = await Promise.all(['a', 'b'].map(async rev => {
    const response = await page.request.get(base + `/examples/linkbench-4/gerbers/rev-${rev}/LinkBench-4-Edge_Cuts.gm1`);
    assert(response.ok()); return (await response.text()).split('\n').filter(line => !/^%TF\.(CreationDate|ProjectId)|^G04 Created/.test(line)).join('\n');
  }));
  check(profiles[0] === profiles[1], 'Native revision outlines have identical geometry and export origin');
  await gerberReady(); const outline = await pixels(); console.log('OUTLINE ' + JSON.stringify(outline));
  check(outline.changed === 0, 'Matching outline comparison does not invent revision differences');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  const failedDownload = '**/examples/linkbench-4/gerbers/rev-a/LinkBench-4-F_Cu.gtl';
  await context.route(failedDownload, route => route.fulfill({ status: 404, body: 'Not found' }));
  await page.getByRole('button', { name: 'Try sample board', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'HTTP 404' }).waitFor();
  check(await page.locator('.gerber-layer-row').count() === 0, 'A missing example download produces a readable error instead of partial artwork');
  await context.unroute(failedDownload);
  await page.getByRole('button', { name: 'Try sample board', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.gerber-layer-row').length === 6); await gerberReady();
  check(await page.getByRole('alert').count() === 0, 'Retry recovers after a failed sample download');
  const native = await page.request.get(base + '/examples/linkbench-4/gerbers/rev-a/LinkBench-4-F_Cu.gtl');
  await page.getByLabel('Open layout A files', { exact: true }).setInputFiles({ name: 'LinkBench-4-F_Cu.gtl', mimeType: 'text/plain', buffer: await native.body() });
  await page.waitForFunction(() => document.querySelectorAll('.gerber-layer-row').length === 1); await gerberReady();
  check(await page.getByTestId('gerber-example').count() === 0, 'Manual files with the sample filename never inherit example annotations');
  for (const width of [390, 320]) { await page.setViewportSize({ width, height: 900 }); await page.waitForFunction(width => innerWidth === width && document.querySelector('.gerber-canvas-wrap canvas').getBoundingClientRect().width <= width, width); check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), width + ' px Gerber example has no page overflow'); }
  check(errors.length === 0, 'No browser runtime errors: ' + errors.join('; '));
  writeFileSync(out + '/report.json', JSON.stringify({ base, checks, errors, dropMv: drop, peakC: peak, overlay, differences, outline, passed: true }, null, 2));
  console.log(checks.length + ' LinkBench example checks passed');
} catch (error) {
  console.error('Layout diagnostics: ' + JSON.stringify(await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, outside: [...document.querySelectorAll('body *')].filter(element => element.getBoundingClientRect().right > innerWidth + 1).slice(0, 12).map(element => ({ tag: element.tagName, class: element.className, right: element.getBoundingClientRect().right, text: element.textContent?.slice(0, 70) })) }))));
  await page.screenshot({ path: out + '/failure.png', fullPage: true }).catch(() => {});
  writeFileSync(out + '/report.json', JSON.stringify({ base, checks, errors, passed: false, error: String(error.stack ?? error) }, null, 2));
  console.error('::error title=LinkBench example regression::' + String(error.stack ?? error).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')); process.exitCode = 1;
} finally { await browser.close(); }
