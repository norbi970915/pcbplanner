// Regressions from the full-site audit: malformed options, recovery, file-name report states and material domains.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright-core';
const base = (process.argv[2] ?? 'http://127.0.0.1:5186').replace(/\/$/, ''), out = 'dist-check/reliability';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, serviceWorkers: 'block', acceptDownloads: true });
await context.addInitScript(() => localStorage.setItem('pcbplanner:analytics-consent', JSON.stringify({ choice: 'declined', version: 2, updatedAt: new Date().toISOString() })));
const page = await context.newPage(), errors = [], checks = [];
page.on('pageerror', e => errors.push(e.message));
const check = (ok, message) => { assert(ok, message); checks.push(message); console.log('PASS ' + message); };
const open = async route => { await page.goto(base + route, { waitUntil: 'networkidle' }); await page.locator('main').waitFor(); };
const idle = async () => page.waitForFunction(() => !!document.querySelector('[data-inputs-invalid="true"]') || ![...document.querySelectorAll('[data-result-busy="true"]')].some(element=>element.getClientRects().length), undefined, { timeout: 90000 });
const dialog = () => page.getByRole('dialog', { name: 'Calculation report', exact: true });
const preview = () => page.frameLocator('iframe[title="Calculation report preview"]');
const closeReport = async () => { await dialog().getByRole('button', { name: 'Close report' }).click(); await dialog().waitFor({ state: 'detached' }); };
function stringDefaultKeys(file, name = 'DEFAULTS') {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true), keys = [];
  const walk = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer && ts.isObjectLiteralExpression(node.initializer)) for (const prop of node.initializer.properties) if (ts.isPropertyAssignment(prop) && ts.isStringLiteral(prop.initializer)) keys.push(prop.name.getText(source).replace(/^['"]|['"]$/g,''));
    ts.forEachChild(node, walk);
  }; walk(source);
  for (const node of source.statements) if (ts.isImportDeclaration(node) && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) for (const spec of node.importClause.namedBindings.elements) if (spec.name.text === name && ts.isStringLiteral(node.moduleSpecifier)) keys.push(...stringDefaultKeys(resolve(dirname(file),node.moduleSpecifier.text+'.ts'),spec.propertyName?.text ?? name));
  return [...new Set(keys)];
}
try {
  for (const [route, key, label, good] of [
    ['/wire-gauge', 'metal', 'Conductor', 'copper'],
    ['/thermal-vias', 'fill', 'Via fill', 'none'],
    ['/resistor-color-code', 'd1', '1st digit', 'yellow'],
    ['/feedback-divider', 'series', 'Resistor series', 'E96'],
  ]) {
    for (const bad of ['audit-unknown', '__proto__', 'constructor']) {
      await open(route + '?' + new URLSearchParams({ [key]: bad }));
      check(await page.locator('main [role="alert"]').count() > 0 && !await page.getByRole('button', { name: 'Reset this tool', exact: true }).count(), `${route} rejects ${key}=${bad} as an input error`);
    }
    await page.getByRole('combobox', { name: label, exact: true }).selectOption(good);
    await page.waitForFunction(() => !document.querySelector('main [role="alert"]'));
    check(await page.locator('main [data-copy-value]').count() > 0, `${route} recovers when a supported option is chosen`);
    await page.evaluate(({ route, key }) => sessionStorage.setItem('pcbplanner:tool:' + route, JSON.stringify({ [key]: 'old-unsupported-choice' })), { route, key });
    await open(route);
    check(await page.locator('main [role="alert"]').count() > 0, `${route} validates restored choices too`);
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    check(new URL(page.url()).search === '', `${route} Reset clears the URL before a reload`);
    await page.waitForFunction(() => !document.querySelector('main [role="alert"]'));
    await page.reload();
    check(!await page.locator('main [role="alert"]').count(), `${route} Reset remains recovered after reload`);
  }
  for (const query of ['n=6&d3=audit-unknown', 'n=6&tcr=audit-unknown', 'mode=find&tol=audit-unknown']) {
    await open('/resistor-color-code?' + query);
    check(await page.locator('main [role="alert"]').count() > 0 && !await page.getByRole('button', { name: 'Reset this tool', exact: true }).count(), 'Colour roles are checked in ' + query);
  }
  for (const [route, label] of [['/rc-filter?r=1000','Filter resistor'], ['/clock-jitter?fc=100000000','Offset 1'], ['/clock-jitter?fc=100000001','Phase noise 1']]) {
    await open(route);
    const input = page.getByLabel(label).and(page.locator('input')).first(), original = await input.inputValue();
    await input.fill('abc'); await input.press('Tab');
    await page.locator('.inputs-paused').waitFor();
    const undo = page.getByRole('button', { name: 'Undo last design change', exact: true });
    check(await undo.isEnabled(), label + ' invalid draft can be undone');
    await page.getByRole('button', { name: 'Go to input', exact: true }).click();
    check(await input.evaluate(el => document.activeElement === el), label + ' correction link focuses the invalid input');
    await undo.click();
    await page.waitForFunction(() => !document.querySelector('[data-inputs-invalid="true"]'));
    check(await input.inputValue() === original, label + ' Undo restores the last valid entry');
  }
  for (const [route, label] of [['/power-tree','Output voltage'], ['/i2c-pullup?capSource=estimate','Trace width']]) {
    await open(route); const input = page.locator('main').getByLabel(label).and(page.locator('input')).first(), original = await input.inputValue();
    await input.fill(''); await input.press('Tab'); await page.locator('.inputs-paused').waitFor();
    check(await input.isVisible(), route + ' keeps the invalid editable field reachable');
    await page.getByRole('button', { name: 'Go to input', exact: true }).click(); check(await input.evaluate(el => document.activeElement === el), route + ' focuses the invalid editable field');
    await input.fill(original); await page.waitForFunction(() => !document.querySelector('[data-inputs-invalid="true"]'));
    check(!await page.locator('.inputs-paused').count(), route + ' resumes after correction');
  }
  await open('/impedance?erm=1e308'); await idle();
  check((await page.locator('main [role="alert"]').innerText()).includes('Solder-mask dielectric constant'), 'Extreme mask permittivity produces a clear error');
  check(!/\bNaN\b|\bInfinity\b/.test(await page.locator('main').innerText()), 'No nonfinite solver output leaks into results');
  await open('/stackup');
  const cell = page.locator('main input[aria-label*="thickness"]').first(), thickness = await cell.inputValue();
  await cell.fill('0.1mm'); check(await cell.getAttribute('aria-invalid') === 'true', 'Stackup numeric cells reject trailing text');
  await page.getByRole('button', { name: 'Undo last design change', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[data-uncommitted-input="true"]'));
  check(await cell.inputValue() === thickness, 'Stackup Undo restores the unparsed cell draft');
  await page.getByRole('button', { name: 'Create calculation report' }).click();
  const print = dialog().getByRole('button', { name: 'Print / Save PDF', exact: true });
  await print.waitFor(); await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent.includes('Print / Save PDF'))?.disabled);
  for (let i=0;i<2;i++) {
    await dialog().getByRole('checkbox', { name: 'Diagrams and plots', exact: true }).click();
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent.includes('Print / Save PDF'))?.disabled);
    check(await print.isEnabled(), 'Report Print stays available after toggling an option with unchanged markup');
  }
  await closeReport();
  for (const [route, label] of [['/impedance?dl=0.1:4.1,0.2:4.2', 'plane ply 1 thickness (mm)'], ['/trace-loss?dl=0.1:4.1:0.02,0.2:4.2:0.02', 'plane ply 1 thickness (mm)']]) {
    await open(route); const input=page.getByRole('textbox',{name:label,exact:true}),original=await input.inputValue();
    for(const value of ['0','abc','0.1junk','1e308']) {
      await input.fill(value); await input.press('Tab'); check(await input.isVisible() && await input.getAttribute('aria-invalid')==='true',route+' keeps a rejected ply editable: '+value);
      check(await page.getByRole('textbox',{name:/ply .* thickness/}).count()===2,route+' retains all ply rows');
      await page.getByRole('button',{name:'Undo last design change',exact:true}).click();
      await page.waitForFunction(()=>!document.querySelector('[data-uncommitted-input="true"]'));
      check(await input.inputValue()===original,route+' restores the last valid ply thickness');
    }
  }
  await open('/pdn?step=1e308');
  check((await page.locator('main [role="alert"]').innerText()).includes('supported numerical range'),'Extreme PDN current produces a clear numerical-range error');
  check(!await page.getByRole('button',{name:'Reset this tool',exact:true}).count(),'Extreme PDN current keeps the calculator usable');
  await page.getByRole('button',{name:'Reset',exact:true}).click();
  await page.getByRole('img',{name:'PDN impedance magnitude versus frequency, log-log',exact:true}).waitFor();
  check(!await page.locator('main [role="alert"]').count(),'PDN resumes normally after Reset');
  await open('/feedback-divider?vout=1e308');
  check((await page.locator('main [role="alert"]').innerText()).includes('supported numerical range'),'Extreme feedback voltage fails fast with a numerical-range error');
  check(!await page.getByRole('button',{name:'Reset this tool',exact:true}).count(),'An overflowing resistor search keeps the calculator usable');
  await page.getByRole('button',{name:'Reset',exact:true}).click();
  await page.getByRole('heading',{name:'Best Pair',exact:true}).waitFor();
  check(!await page.locator('main [role="alert"]').count(),'Feedback divider resumes after Reset');
  for(const route of ['/vswr-calculator?mode=z&r=1e308','/vswr-calculator?mode=z&x=1e308','/vswr-calculator?val=1e308&s1=1e308&s2=1e308']) {
    await open(route);check(!/\bNaN\b|\bInfinity\b/.test(await page.locator('main').innerText()),route+' retains stable reflection and mismatch results');
    check(!await page.getByRole('button',{name:'Reset this tool',exact:true}).count(),route+' keeps the tool usable');
  }
  for (const route of ['/bga-land?pitch=1e308', '/bga-land?ball=1e308', '/bga-land?w=1e-308&s=1e-308']) {
    await open(route);
    check((await page.locator('main [role="alert"]').innerText()).includes('supported numerical range'), route + ' rejects an unrepresentable routing result');
    check(!/\bNaN\b|\bInfinity\b/.test(await page.locator('main').innerText()), route + ' exposes no nonfinite counts');
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    check(!await page.locator('main [role="alert"]').count(), 'BGA routing recovers after Reset');
  }
  for (const route of ['/wire-gauge?t=-250', '/wire-gauge?metal=aluminium&t=-250', '/skin-effect?temp=-250', '/trace-width?amb=-250', '/via?amb=-250', '/trace-loss?temp=-250']) {
    await open(route);
    check((await page.locator('main [role="alert"]').innerText()).includes('positive-resistivity'), route + ' rejects a nonphysical material temperature');
    await page.getByRole('button', { name: 'Create calculation report' }).click();
    check((await dialog().innerText()).includes('Resolve the calculation error'), route + ' cannot export invalid results'); await closeReport();
  }
  for (const route of ['/wire-gauge?t=-40', '/skin-effect?temp=-40', '/trace-width?amb=-40', '/via?amb=-40', '/trace-loss?temp=-40']) {
    await open(route); await idle();
    check(!await page.locator('main [role="alert"]').count(), route + ' retains normal cold-temperature calculations');
  }
  await open('/kicad-project?view=overview');
  const boardName = 'running-loading-calculating-solving-led.kicad_pcb';
  await page.locator('input[type="file"][accept*=".kicad_pcb"]').setInputFiles({ name: boardName, mimeType: 'text/plain', buffer: readFileSync('public/examples/pcbplanner-example-6layer.kicad_pcb') });
  await page.waitForFunction(() => document.body.textContent.includes('routing check done'), undefined, { timeout: 90000 }); await idle();
  await page.getByRole('button', { name: 'Create calculation report' }).click();
  await preview().getByRole('heading', { name: 'Project identity and scope', exact: true }).waitFor({ timeout: 90000 });
  check((await preview().locator('body').innerText()).includes(boardName), 'A solved board with busy words in its filename exports normally');
  await page.screenshot({ path: out + '/project-report.png' }); await closeReport();
  await open('/s-parameter-viewer?f=1');
  await page.getByLabel('Choose a Touchstone file', { exact: true }).setInputFiles({ name: 'running-loading.s2p', mimeType: 'text/plain', buffer: Buffer.from('# GHz S RI R 50\n1 0 0 1 0 1 0 0 0\n2 0 0 1 0 1 0 0 0\n3 0 0 1 0 1 0 0 0\n') });
  await page.locator('main').getByText(/2-port.*3 points/).waitFor(); await idle();
  await page.getByRole('button', { name: 'Create calculation report' }).click(); await preview().locator('body').waitFor();
  check((await preview().locator('body').innerText()).includes('running-loading.s2p'), 'Touchstone filenames do not masquerade as calculation state'); await closeReport();

  // Delay a real worker load: export must still be blocked while the calculation is genuinely busy.
  const pending = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1500, height: 1000 } });
  await pending.addInitScript(() => localStorage.setItem('pcbplanner:analytics-consent', JSON.stringify({ choice: 'declined', version: 2, updatedAt: new Date().toISOString() })));
  const busy = await pending.newPage(); let release;
  const gate = new Promise(resolve => { release = resolve; });
  await pending.route('**/*solver.worker*', async route => { await gate; await route.continue(); });
  try {
    await busy.goto(base + '/impedance', { waitUntil: 'domcontentloaded' });
    await busy.locator('[data-result-busy="true"]').first().waitFor({ state: 'attached' });
    await busy.getByRole('button', { name: 'Create calculation report' }).click();
    check((await busy.getByRole('dialog', { name: 'Calculation report', exact: true }).innerText()).includes('Wait for the calculation to finish'), 'A genuinely pending worker still blocks export');
    await busy.getByRole('button', { name: 'Close report', exact: true }).click();
    await busy.goto(base + '/trace-loss', { waitUntil: 'domcontentloaded' });
    await busy.locator('[data-result-busy="true"]').first().waitFor({ state: 'attached' });
    await busy.getByLabel('Temperature', { exact: true }).and(busy.locator('input')).fill('-250');
    await busy.locator('main [role="alert"]').waitFor();
    await busy.waitForFunction(() => !document.querySelector('main > .tool-page [data-result-busy="true"]'));
    check(!await busy.locator('[data-result-busy="true"]').count(), 'Invalidating a pending loss request clears its busy state');
    await busy.getByRole('button', { name: 'Create calculation report' }).click();
    check((await busy.getByRole('dialog', { name: 'Calculation report', exact: true }).innerText()).includes('Resolve the calculation error'), 'An invalidated loss request reports its input error instead of waiting forever');
  } finally { release(); await pending.close(); }

  // Sweep every string default again, including fields that are not enums.
  const registry = readFileSync('src/tools/registry.ts', 'utf8'); let cases = 0;
  for (const block of registry.split(/\n\s*path:\s*/).slice(1)) {
    const route = /^'([^']+)'/.exec(block)?.[1], file = /import\('\.\/(\w+)'\)/.exec(block)?.[1]; if (!route || !file) continue;
    const keys = stringDefaultKeys('src/tools/' + file + '.tsx');
    for (const key of keys) {
      await open(route + '?' + new URLSearchParams({ [key]: 'audit-unknown' })); await idle(); cases++;
      assert(!await page.getByRole('button', { name: 'Reset this tool', exact: true }).count(), route + '?' + key + ' stopped the tool');
      assert(!/\bNaN\b|\bundefined\b|\[object Object\]/.test(await page.locator('main').innerText()),route+'?'+key+' exposes an internal value');
    }
  }
  check(cases >= 120, cases + ' malformed string parameters are handled without stopping a tool');
  check(errors.length === 0, 'No browser runtime errors: ' + errors.join('; '));
  writeFileSync(out + '/report.json', JSON.stringify({ base, checks, malformedCases: cases, errors, passed: true }, null, 2));
  console.log(checks.length + ' reliability checks passed');
} catch (error) {
  await page.screenshot({ path: out + '/failure.png', fullPage: true }).catch(() => {});
  writeFileSync(out + '/report.json', JSON.stringify({ base, url: page.url(), checks, errors, passed: false, error: String(error) }, null, 2));
  console.error(error); process.exitCode = 1;
} finally { await browser.close(); }
