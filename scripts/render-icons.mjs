// Renders public/favicon.svg to PNG icons and builds the social preview image.
// Usage: node scripts/render-icons.mjs   (needs Microsoft Edge)
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const svg = readFileSync(resolve('public/favicon.svg'), 'utf8');
const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();

for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
  ['favicon-32.png', 32],
  ['favicon-96.png', 96],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent"><img src="${dataUrl}" width="${size}" height="${size}" style="display:block"></body></html>`);
  await page.screenshot({ path: resolve('public', name), omitBackground: true });
}

// 1200×630 social card
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`<html><body style="margin:0;width:1200px;height:630px;background:#1f1f1f;font-family:'Segoe UI',Arial,sans-serif;color:#dcdcdc;display:flex;align-items:center">
  <div style="position:absolute;inset:0;background-image:radial-gradient(#353b43 1.2px,transparent 1.3px);background-size:32px 32px;opacity:.9"></div>
  <div style="position:relative;display:flex;align-items:center;gap:56px;padding:0 90px">
    <img src="${dataUrl}" width="260" height="260">
    <div>
      <div style="font-size:84px;font-weight:700;letter-spacing:-1px"><span style="color:#e0953f">pcb</span>planner</div>
      <div style="font-size:30px;color:#a3a3a3;margin-top:12px">Impedance · Stackups · Thermal · PDN</div>
      <div style="font-size:26px;color:#6aaef0;margin-top:28px">pcbplanner.com</div>
    </div>
  </div></body></html>`);
await page.screenshot({ path: resolve('public', 'og-image.png') });
await browser.close();
console.log('icons written to public/');
