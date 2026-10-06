import { describe, expect, it } from 'vitest';
import { buildReportHtml, type ReportSnapshot, type ReportOptions } from './calculationReport';
const snapshot: ReportSnapshot = {
  title: 'Divider', description: 'Output voltage', created: '6 October 2026', url: 'https://www.pcbplanner.com/feedback-divider?vout=3.3&vfb=0.8',
  inputs: [{ section: 'Target', label: 'Output <voltage>', value: '3.3 V' }],
  results: '<p>Current: 69.565 uA</p>', comparison: '<table><tr><td>A: 50</td><td>B: 45</td><td>-5</td></tr></table>',
  method: '<p>Assumed bias current</p>', blocked: null, usesLocalData: false,
};
const options: ReportOptions = { title: 'Review <script>alert(1)</script>', notes: '<img src=x onerror=alert(1)>', diagrams: true, comparison: true, method: true };
describe('calculation reports', () => {
  it('escapes user notes, titles, input labels and link parameters in the exported document', () => {
    const html = buildReportHtml(snapshot, options);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('Output &lt;voltage&gt;');
    expect(html).toContain('vout=3.3&amp;vfb=0.8');
    expect(html).toContain('Current: 69.565 uA');
  });
  it('omits optional sections and explains links that depend on local data', () => {
    const html = buildReportHtml({ ...snapshot, usesLocalData: true }, { ...options, comparison: false, method: false });
    expect(html).not.toContain('A: 50');
    expect(html).not.toContain('Assumed bias current');
    expect(html).toContain('Uploaded files and browser-saved design data are not included in this link');
    expect(snapshot.comparison).toContain('A: 50');
  });
});
