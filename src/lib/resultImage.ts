// PNG export of a calculation: the headline result, the inputs and the drawing on one branded card,
// composed as SVG and rasterised in the browser (no screenshots, no external services).

const PAINT = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'paint-order', 'opacity', 'font-family', 'font-size', 'font-style', 'font-weight', 'letter-spacing', 'text-anchor', 'dominant-baseline', 'stop-color', 'stop-opacity', 'display', 'visibility'];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Serialised copy of an on-page SVG with every computed paint value written inline, so CSS variables
 * and theme colours survive outside the page. Placed at (x, y) with the given size.
 */
export function inlineSvg(svg: SVGSVGElement, x: number, y: number, width: number, height: number): string {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  const src = [svg, ...svg.querySelectorAll('*')];
  const dst = [copy, ...copy.querySelectorAll('*')];
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    const style = PAINT.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';');
    dst[i].setAttribute('style', style);
    dst[i].removeAttribute('class');
  });
  copy.setAttribute('x', String(x));
  copy.setAttribute('y', String(y));
  copy.setAttribute('width', String(width));
  copy.setAttribute('height', String(height));
  copy.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return new XMLSerializer().serializeToString(copy);
}

export interface ResultCard {
  tool: string; // "Impedance Calculator"
  headline: { label: string; value: string; unit: string };
  sub: string; // one line under the headline
  rows: [string, string][]; // inputs, label → value
  drawing: SVGSVGElement | HTMLCanvasElement | null;
  path: string; // "/impedance"
}

/** Theme colours of the page, so the card matches what the user sees. */
function theme() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return { bg: v('--doc', '#1c1d20'), card: v('--sheet', '#252629'), ink: v('--ink', '#dedfe3'), muted: v('--muted', '#b1b5be'), line: v('--line', '#393b40'), accent: v('--accent-ink', '#6b9bd2'), copper: v('--copper', '#d08a3c') };
}

/** The card as an SVG string and its size. */
export function cardSvg(c: ResultCard): { svg: string; width: number; height: number } {
  const t = theme();
  const W = 1200, pad = 48, font = "'Segoe UI', Helvetica, Arial, sans-serif";
  const drawW = 700, colX = pad + drawW + 40;
  let drawH = 0;
  let drawing = '';
  if (c.drawing instanceof HTMLCanvasElement && c.drawing.width > 0) {
    drawH = Math.round((drawW * c.drawing.height) / c.drawing.width);
    drawing = `<image x="${pad}" y="__Y__" width="${drawW}" height="${drawH}" href="${c.drawing.toDataURL('image/png')}"/>`;
  } else if (c.drawing instanceof SVGSVGElement) {
    const vb = c.drawing.viewBox.baseVal;
    drawH = vb && vb.width > 0 ? Math.round((drawW * vb.height) / vb.width) : 360;
    drawing = '__SVG__';
  }
  const top = 250;
  // values longer than the column wrap at commas (about 30 characters of 22 px text fit)
  const wrap = (s: string) => {
    const lines: string[] = [];
    for (const part of s.split(/(?<=,) /)) {
      const last = lines.length - 1;
      if (last >= 0 && (lines[last] + ' ' + part).length <= 30) lines[last] += ' ' + part;
      else lines.push(part);
    }
    return lines;
  };
  const wrapped = c.rows.map(([label, value]) => [label, wrap(value)] as const);
  const rowY: number[] = [];
  let rowsH = 0;
  for (const [, lines] of wrapped) {
    rowY.push(top + rowsH);
    rowsH += 30 + lines.length * 28;
  }
  const bodyH = Math.max(drawH, rowsH);
  const H = top + bodyH + 96;
  if (drawing === '__SVG__') drawing = inlineSvg(c.drawing as SVGSVGElement, pad, top, drawW, drawH);
  else drawing = drawing.replace('__Y__', String(top));
  const rows = wrapped
    .map(([label, lines], i) => {
      const y = rowY[i];
      const value = lines.map((l, k) => `<tspan x="${colX}" dy="${k ? 28 : 0}">${esc(l)}</tspan>`).join('');
      return `<text x="${colX}" y="${y + 18}" font-size="17" fill="${t.muted}">${esc(label)}</text><text x="${colX}" y="${y + 43}" font-size="22" font-weight="600" fill="${t.ink}">${value}</text>`;
    })
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${font}">
<rect width="${W}" height="${H}" fill="${t.bg}"/>
<rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="14" fill="${t.card}" stroke="${t.line}"/>
<text x="${pad}" y="74" font-size="24" fill="${t.muted}">${esc(c.tool)}</text>
<text x="${W - pad}" y="74" font-size="24" font-weight="600" text-anchor="end" fill="${t.accent}">pcbplanner.com</text>
<text x="${pad}" y="118" font-size="20" fill="${t.muted}">${esc(c.headline.label)}</text>
<text x="${pad}" y="186" font-size="64" font-weight="700" fill="${t.ink}">${esc(c.headline.value)}<tspan font-size="34" font-weight="400" fill="${t.muted}" dx="10">${esc(c.headline.unit)}</tspan></text>
<text x="${pad}" y="222" font-size="20" fill="${t.muted}">${esc(c.sub)}</text>
<line x1="${colX - 20}" x2="${colX - 20}" y1="${top}" y2="${top + bodyH}" stroke="${t.line}"/>
${drawing}
${rows}
<text x="${pad}" y="${H - 44}" font-size="18" fill="${t.muted}">Estimate, provided as is · verify before use · recalculate at pcbplanner.com${esc(c.path)}</text>
</svg>`;
  return { svg, width: W, height: H };
}

/** The card rasterised at 2× as a PNG blob. */
export async function cardPng(c: ResultCard): Promise<Blob> {
  const { svg, width, height } = cardSvg(c);
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  ctx.scale(2, 2);
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The image could not be created.'))), 'image/png'));
}

export const canCopyImage = () => typeof navigator !== 'undefined' && !!navigator.clipboard?.write && typeof ClipboardItem !== 'undefined';

export async function copyPng(make: () => Promise<Blob>) {
  // passing the promise keeps the user gesture valid in Safari
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': make() })]);
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
