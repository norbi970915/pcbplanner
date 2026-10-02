// Renders a 1200×630 link-preview image per page into public/og/, in the style of og-image.png.
// scripts/prerender.mjs points each page's og:image at its file (falling back to og-image.png).
// Usage: node scripts/render-og.mjs   (needs Microsoft Edge; run again after changing a title or summary)
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { TOOLS, GROUP_COLORS } = await vite.ssrLoadModule('/src/tools/registry.ts');
const { GUIDES } = await vite.ssrLoadModule('/src/guides/registry.ts');
const { ABOUT_DESCRIPTION } = await vite.ssrLoadModule('/src/pages/About.tsx');
const { SCHEMATIC_DESCRIPTION } = await vite.ssrLoadModule('/src/pages/Schematic.tsx');
await vite.close();

/** File name of a page's preview image (prerender.mjs uses the same rule). */
const ogSlug = (path) => path.slice(1).replace(/\//g, '-');

const ACCENT = '#e0953f';
const cards = [
  ...TOOLS.map((t) => ({ path: t.path, label: t.group, color: GROUP_COLORS[t.group] ?? ACCENT, title: t.title, text: t.summary })),
  ...GUIDES.map((g) => ({ path: g.path, label: 'Guide', color: ACCENT, title: g.title, text: g.description })),
  { path: '/tools', label: 'All tools', color: ACCENT, title: 'PCB Design Calculators', text: `${TOOLS.length} free calculators for signal integrity, stackups, thermal design, power and components.` },
  { path: '/schematic', label: 'Schematic design', color: ACCENT, title: 'Schematic Design Tools', text: SCHEMATIC_DESCRIPTION },
  { path: '/guides', label: 'Guides', color: ACCENT, title: 'PCB Design Guides', text: 'Practical PCB design guides with worked examples and reproducible calculations.' },
  { path: '/about', label: 'About', color: ACCENT, title: 'About PCB Planner', text: ABOUT_DESCRIPTION },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const svg = readFileSync(resolve('public/favicon.svg'), 'utf8');
const icon = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const clamp = (lines) => `display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:${lines};overflow:hidden`;

const html = (c) => {
  const size = c.title.length > 60 ? 54 : c.title.length > 34 ? 62 : 74;
  return `<html><body style="margin:0;width:1200px;height:630px;background:#1f1f1f;font-family:'Segoe UI',Arial,sans-serif;color:#dcdcdc;position:relative;overflow:hidden">
  <div style="position:absolute;inset:0;background-image:radial-gradient(#353b43 1.2px,transparent 1.3px);background-size:32px 32px;opacity:.9"></div>
  <div style="position:absolute;left:0;top:0;bottom:0;width:14px;background:${c.color}"></div>
  <div style="position:absolute;inset:56px 80px 52px 90px;display:flex;flex-direction:column">
    <div style="display:flex;align-items:center;gap:18px">
      <img src="${icon}" width="64" height="64">
      <div style="font-size:40px;font-weight:700;letter-spacing:-.5px"><span style="color:${ACCENT}">pcb</span>planner</div>
    </div>
    <div style="margin-top:auto;display:flex;align-items:center;gap:12px;font-size:26px;color:#a3a3a3;text-transform:uppercase;letter-spacing:1.5px">
      <span style="width:18px;height:18px;background:${c.color};display:inline-block"></span>${esc(c.label)}
    </div>
    <div style="margin-top:14px;font-size:${size}px;line-height:1.12;font-weight:700;color:#f0f0f0;letter-spacing:-.5px;${clamp(3)}">${esc(c.title)}</div>
    <div style="margin-top:18px;font-size:27px;line-height:1.35;color:#a3a3a3;${clamp(2)}">${esc(c.text)}</div>
    <div style="margin-top:auto;padding-top:26px;display:flex;justify-content:space-between;font-size:26px">
      <span style="color:#6aaef0">pcbplanner.com</span><span style="color:#8a8a8a">Free · runs in your browser</span>
    </div>
  </div></body></html>`;
};

mkdirSync('public/og', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const c of cards) {
  await page.setContent(html(c));
  await page.screenshot({ path: resolve('public/og', `${ogSlug(c.path)}.png`) });
}
await browser.close();
console.log(`${cards.length} preview images written to public/og/`);
