export interface ReportInput { section: string; label: string; value: string }
export interface ReportSnapshot {
  title: string; description: string; created: string; url: string; inputs: ReportInput[];
  results: string; comparison: string; method: string; blocked: string | null; usesLocalData: boolean;
}
export interface ReportOptions { diagrams: boolean; comparison: boolean; method: boolean; title: string; notes: string }
export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
const cleanText = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
function inputLabel(node: Element | null): string {
  if (!node) return '';
  const label = node.cloneNode(true) as Element;
  label.querySelectorAll('span').forEach(symbol => { symbol.textContent = ' (' + cleanText(symbol) + ')'; });
  return cleanText(label);
}
function controlValue(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string {
  if (control instanceof HTMLSelectElement) return Array.from(control.selectedOptions).map(option => option.text).join(', ');
  if (control instanceof HTMLInputElement && control.type === 'checkbox') return control.checked ? 'Yes' : 'No';
  if (control instanceof HTMLInputElement && control.type === 'file') return Array.from(control.files ?? []).map(file => file.name).join(', ') || 'No file selected';
  return control.value;
}
/** Read live values, including collapsed inputs; never serialize React's initial value attributes. */
export function collectReportInputs(roots: (HTMLElement | null)[]): ReportInput[] {
  const inputs: ReportInput[] = [];
  const seen = new Set<Element>();
  const add = (element: Element, label: string, value: string) => {
    if (!label) return;
    inputs.push({ section: cleanText(element.closest('.properties-section')?.querySelector('.properties-toggle') ?? null).replace(/^[^\p{L}\p{N}]+/u, '') || 'Design inputs', label, value });
  };
  for (const root of roots) {
    if (!root) continue;
    for (const row of root.querySelectorAll('.property-field')) {
      const controls = Array.from(row.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea'));
      if (!controls.length || row.closest('[data-report-ignore]')) continue;
      controls.forEach(control => seen.add(control));
      const units = controls.length === 1 ? cleanText(controls[0].parentElement?.querySelector('span') ?? null) : '';
      add(row, inputLabel(row.querySelector('.property-field-label')), controls.map(controlValue).join(' ') + (units ? ' ' + units : ''));
    }
    for (const group of root.querySelectorAll('[role="radiogroup"]')) {
      add(group, group.getAttribute('aria-label') ?? 'Selection', cleanText(group.querySelector('[aria-checked="true"]')));
    }
    for (const control of root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')) {
      if (seen.has(control) || control.closest('[data-report-ignore]') || control.closest('.design-comparison') || (control instanceof HTMLInputElement && ['hidden', 'file', 'button', 'submit'].includes(control.type))) continue;
      if (control.closest('[hidden]') && !control.closest('.properties-section')) continue;
      seen.add(control);
      const label = control.getAttribute('aria-label') ?? cleanText(control.labels?.[0] ?? null);
      add(control, label || control.name || 'Input', controlValue(control));
    }
  }
  return inputs;
}
export function reportBlockReason(results: HTMLElement, inputs: HTMLElement | null, status: HTMLElement | null): string | null {
  if (results.matches('[data-inputs-invalid="true"]') || results.querySelector('[data-inputs-invalid="true"], [aria-invalid="true"]') || inputs?.querySelector('[aria-invalid="true"]')) return 'Correct the highlighted inputs before creating a report.';
  if (results.querySelector('[data-result-busy="true"], [aria-busy="true"]') || /solving|calculating|loading|running/i.test(cleanText(status))) return 'Wait for the calculation to finish, then create the report.';
  const error = results.querySelector('[role="alert"]');
  if (error && cleanText(error)) return 'Resolve the calculation error before creating a report: ' + cleanText(error);
  return null;
}
function localPaint(value: string): string { return value.replace(/url\(["']?[^)"']*#([^)"']+)["']?\)/g, 'url(#$1)'); }
/** A static, self-contained copy: preserve SVG paint and canvas plots, discard application controls. */
export function snapshotMarkup(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement;
  const originals = [root, ...root.querySelectorAll('*')];
  const copies = [clone, ...clone.querySelectorAll('*')];
  originals.forEach((original, index) => {
    const copy = copies[index];
    copy.removeAttribute('style');
    for (const attribute of Array.from(copy.attributes)) if (/^on/i.test(attribute.name)) copy.removeAttribute(attribute.name);
    if (original instanceof SVGElement && copy instanceof SVGElement) {
      const style = getComputedStyle(original);
      for (const name of ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-opacity', 'stroke-opacity', 'font-size', 'font-family', 'font-weight', 'paint-order', 'text-anchor', 'dominant-baseline', 'stop-color', 'stop-opacity', 'color']) {
        copy.style.setProperty(name, localPaint(style.getPropertyValue(name)));
      }
      if (original.tagName.toLowerCase() === 'svg') {
        copy.style.background = getComputedStyle(document.documentElement).getPropertyValue('--sheet').trim() || '#fff';
      }
    }
    if (original.matches('.diagram-legend i, .diagram-values i') && copy instanceof HTMLElement) copy.style.backgroundColor = getComputedStyle(original).backgroundColor;
    if (original instanceof HTMLCanvasElement) {
      const image = document.createElement('img'); image.alt = original.getAttribute('aria-label') ?? 'Calculation plot';
      try { image.src = original.toDataURL(); copy.replaceWith(image); } catch { copy.replaceWith(document.createTextNode('Plot unavailable in this report.')); }
    }
    if (copy instanceof HTMLAnchorElement) {
      try { const url = new URL(original.getAttribute('href') ?? '', window.location.href); if (['http:', 'https:'].includes(url.protocol)) copy.href = url.href; else copy.removeAttribute('href'); } catch { copy.removeAttribute('href'); }
    }
    if (original instanceof HTMLInputElement || original instanceof HTMLSelectElement || original instanceof HTMLTextAreaElement) {
      const value = document.createElement('span'); value.textContent = controlValue(original); copy.replaceWith(value);
    }
  });
  clone.querySelectorAll('script, iframe, object, embed, button, .field-help-trigger, .comparison-actions, .comparison-trigger, .comparison-footnote, .diagram-editing, .diagram-focus-line, .diagram-focus-region, .sr-only, [hidden]').forEach(element => element.remove());
  clone.querySelectorAll('[data-active]').forEach(element => element.removeAttribute('data-active'));
  clone.querySelectorAll('details').forEach(element => element.setAttribute('open', ''));
  clone.removeAttribute('hidden');
  return clone.innerHTML;
}
export function captureReport(title: string, description: string, results: HTMLElement, inputs: HTMLElement | null, method: HTMLElement | null, status: HTMLElement | null): ReportSnapshot {
  const comparison = results.querySelector<HTMLElement>('.design-comparison');
  // Capture against live nodes first, so computed paint and canvas pixels are still available.
  const staticResults = document.createElement('div'); staticResults.innerHTML = snapshotMarkup(results);
  staticResults.querySelectorAll('.design-comparison').forEach(element => element.remove());
  return { title, description, created: new Date().toLocaleString(), url: window.location.href,
    inputs: collectReportInputs([inputs, results]), results: staticResults.innerHTML,
    comparison: comparison ? snapshotMarkup(comparison) : '', method: method ? snapshotMarkup(method) : '',
    blocked: reportBlockReason(results, inputs, status), usesLocalData: !!document.querySelector('.tool-page input[type="file"]') || !!inputs?.querySelector('input[type="file"]'),
  };
}
const REPORT_CSS = `
@page { size: A4; margin: 14mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #222831; background: #fff; font: 13px/1.55 Arial, sans-serif; --ink: #222831; --muted: #59616d; --faint: #59616d; --sheet: #fff; --line: #d9dee5; --copper: #d08a3c; --accent-ink: #3d8fe0; }
main { max-width: 960px; margin: auto; padding: 28px; }
header { border-bottom: 3px solid #d08a3c; padding-bottom: 16px; margin-bottom: 22px; }
.brand { color: #916024; font-weight: 700; letter-spacing: .04em; }
h1 { margin: 7px 0; font-size: 25px; line-height: 1.25; }
h2 { font-size: 17px; margin: 24px 0 12px; }
h3 { font-size: 14px; }
p { margin: 7px 0; } a { color: #285a8c; overflow-wrap: anywhere; }
.meta, .footnote, figcaption, .text-muted, .text-faint { color: #59616d; font-size: 11px; }
table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12px; table-layout: auto; }
thead { display: table-header-group; }
th, td { text-align: left; padding: 7px 9px; border-bottom: 1px solid #d9dee5; overflow-wrap: anywhere; vertical-align: top; }
th { font-weight: 600; } thead th { background: #f1f3f5; } tr { break-inside: avoid; }
.input-section { background: #f1f3f5; } .input-section th { color: #59616d; }
[data-slot="card"] { border: 1px solid #d9dee5; border-radius: 7px; padding: 12px; margin: 0 0 15px; min-width: 0; }
.section-heading { border-bottom: 1px solid #d9dee5; margin-bottom: 10px; } .section-heading h2 { margin: 0 0 8px; font-size: 15px; }
.headline-result { display: inline-block; vertical-align: top; margin: 0 26px 12px 0; }
[data-copy-value] { font-size: 23px; font-weight: 600; } [data-copy-unit] { font-size: 13px; }
svg { width: 100%; height: auto; max-height: 470px; } img { max-width: 100%; height: auto; }
figure, .diagram-stage { margin: 10px 0; break-inside: avoid; }
.diagram-values { display: flex; flex-wrap: wrap; gap: 12px; margin: 12px 0; } .diagram-values > div { flex: 1; min-width: 100px; padding: 7px; background: #f1f3f5; } dt { font-size: 11px; } dd { margin: 2px 0 0; font-weight: 600; }
.diagram-legend { display: flex; gap: 14px; font-size: 11px; } .diagram-legend i { display: inline-block; width: 9px; height: 9px; margin-right: 4px; }
details { margin: 12px 0; } summary { font-weight: 600; } .comparison-changed { background: #f5f8fc; }
.notes { white-space: pre-wrap; padding: 12px; border-left: 3px solid #d08a3c; background: #fbf7f0; }
.method { font-size: 12px; } .method svg { max-height: 280px; }
footer { margin-top: 22px; border-top: 1px solid #d9dee5; padding-top: 12px; }
@media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } main { max-width: none; padding: 0; } h2, h3, summary { break-after: avoid; } }
@media (max-width: 550px) { main { padding: 16px; } table { font-size: 11px; } th, td { padding: 5px; } }
`;
export function buildReportHtml(snapshot: ReportSnapshot, options: ReportOptions): string {
  const groups = new Map<string, ReportInput[]>();
  for (const input of snapshot.inputs) { const group = groups.get(input.section) ?? []; group.push(input); groups.set(input.section, group); }
  const inputs = [...groups].map(([section, values]) => '<tr class="input-section"><th colspan="2">' + escapeHtml(section) + '</th></tr>' +
    values.map(input => '<tr><th scope="row">' + escapeHtml(input.label) + '</th><td>' + escapeHtml(input.value) + '</td></tr>').join('')).join('');
  const omitDiagrams = (html: string) => {
    if (options.diagrams) return html;
    const holder = document.createElement('div'); holder.innerHTML = html;
    holder.querySelectorAll('figure, svg, canvas, img, .diagram-values, .diagram-legend').forEach(element => element.remove());
    holder.querySelectorAll('[data-slot="card"]').forEach(panel => {
      const content = panel.querySelector('.panel-content');
      if (content && !cleanText(content)) panel.remove();
    });
    return holder.innerHTML;
  };
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escapeHtml(options.title || snapshot.title) + ' - PCBPlanner report</title><style>' + REPORT_CSS + '</style></head><body><main>' +
    '<header><div class="brand">PCBPlanner / Calculation report</div><h1>' + escapeHtml(options.title || snapshot.title) + '</h1><p>' + escapeHtml(snapshot.description) + '</p><p class="meta">Snapshot created ' + escapeHtml(snapshot.created) + '</p></header>' +
    (options.notes.trim() ? '<section class="notes">' + escapeHtml(options.notes) + '</section>' : '') +
    (inputs ? '<h2>Inputs and configuration</h2><table><thead><tr><th>Input</th><th>Value</th></tr></thead><tbody>' + inputs + '</tbody></table>' : '<p>Configuration and design data are shown with the results below.</p>') +
    '<h2>Current calculation</h2>' + omitDiagrams(snapshot.results) +
    (options.comparison && snapshot.comparison ? '<h2>Design comparison: saved A and current B</h2>' + omitDiagrams(snapshot.comparison) + '<p class="footnote">Changes are B minus A in the units shown. pp means percentage points; a dash means unavailable or a different model.</p>' : '') +
    (options.method && snapshot.method ? '<h2>Method, assumptions and references</h2><section class="method">' + omitDiagrams(snapshot.method) + '</section>' : '') +
    '<footer><p><strong>Calculation link</strong><br><a href="' + escapeHtml(snapshot.url) + '">' + escapeHtml(snapshot.url) + '</a></p>' +
    (snapshot.usesLocalData ? '<p class="footnote">Uploaded files and browser-saved design data are not included in this link. Keep the original files with this report.</p>' : '') +
    '<p class="footnote">This report records the displayed estimates and their assumptions. Check the relevant tool method, component datasheets and fabrication requirements when applying the results.</p></footer></main></body></html>';
}
