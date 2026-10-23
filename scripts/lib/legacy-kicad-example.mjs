// Keep the earlier board's deliberately failing routing/48 V cases in regression coverage.
// Download only the site's public fixtures, rather than relying on the current Try an example board.
export async function loadLegacyKicadExample(page, base) {
  const scenario = { pnet: '+3V3', pmode: 'dc', pi: '0.2', psrc: 'U1', ploads: 'U2:0.2', pret: 'GND', pv: '3.3',
    pdt: '10', pamb: '25', pmap: 'drop', tsrc: 'U1:0.34,U2:0.66', tamb: '25', tair: 'h', teps: '0.9', tkxy: '0.8', tkz: '0.35', hvnets: '+48V:48' };
  await page.goto(base + '/kicad-project?' + new URLSearchParams(scenario));
  const files = await Promise.all(['kicad_pcb', 'kicad_pro'].map(async extension => {
    const name = 'pcbplanner-example-6layer.' + extension;
    const response = await page.request.get(base + '/examples/' + name);
    if (!response.ok()) throw Error('Could not load public legacy regression fixture: ' + name);
    return { name, mimeType: 'text/plain', buffer: await response.body() };
  }));
  await page.locator('input[type=file][accept*=".kicad_pcb"]').setInputFiles(files);
}
