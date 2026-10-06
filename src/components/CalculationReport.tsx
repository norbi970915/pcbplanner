import { useMemo, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { Download, Printer, X } from 'lucide-react';
import { Button } from './shadcn/button';
import { buildReportHtml, type ReportOptions, type ReportSnapshot } from '../lib/calculationReport';

export function CalculationReport({ snapshot, onClose }: { snapshot: ReportSnapshot; onClose: () => void }) {
  const { title } = snapshot;
  const [options, setOptions] = useState<ReportOptions>({ title, notes: '', diagrams: true, comparison: !!snapshot.comparison, method: true });
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);
  const html = useMemo(() => snapshot.blocked ? '' : buildReportHtml(snapshot, options), [snapshot, options]);
  const change = (update: Partial<ReportOptions>) => { setLoaded(false); setOptions(value => ({ ...value, ...update })); };
  const download = () => {
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url;
    anchor.download = (options.title || title).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 80) + '-report.html';
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    setMessage('Report saved as HTML. It can be opened and printed later.');
  };
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal><Dialog.Overlay className="workspace-dialog-overlay" /><Dialog.Content className="calculation-report-dialog" onCloseAutoFocus={event => event.preventDefault()}>
      <div className="report-dialog-heading"><div><Dialog.Title>Calculation report</Dialog.Title><Dialog.Description>A snapshot of this design. Print it or choose Save as PDF in the print dialog.</Dialog.Description></div>
        <Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close report"><X size={18} /></Button></Dialog.Close></div>
      {snapshot.blocked ? <div className="report-blocked" role="alert"><strong>Report not ready</strong><p>{snapshot.blocked}</p><Button variant="outline" size="sm" onClick={onClose}>Back to calculation</Button></div> : <>
        <div className="report-options">
          <label>Report title<input className="fld" value={options.title} maxLength={160} onChange={event => change({ title: event.target.value })} /></label>
          <label>Design notes <span className="text-faint">(optional)</span><textarea className="fld" value={options.notes} maxLength={3000} rows={2} placeholder="Board revision, design target, review notes..." onChange={event => change({ notes: event.target.value })} /></label>
          <div className="report-toggles">
            <label><input type="checkbox" checked={options.diagrams} onChange={event => change({ diagrams: event.target.checked })} />Diagrams and plots</label>
            {snapshot.method && <label><input type="checkbox" checked={options.method} onChange={event => change({ method: event.target.checked })} />Method and references</label>}
            {snapshot.comparison && <label><input type="checkbox" checked={options.comparison} onChange={event => change({ comparison: event.target.checked })} />A/B comparison</label>}
          </div>
        </div>
        <iframe ref={frame} title="Calculation report preview" className="report-preview" srcDoc={html} onLoad={() => setLoaded(true)} />
        <div className="report-dialog-footer"><p role="status">{message || 'Inputs and results are fixed at the moment you opened this report.'}</p><div>
          <Button variant="outline" size="sm" onClick={download}><Download size={14} />Save HTML</Button>
          <Button size="sm" disabled={!loaded} onClick={() => { try { frame.current?.contentWindow?.focus(); frame.current?.contentWindow?.print(); } catch { setMessage('Use Save HTML, then open the saved report to print it.'); } }}><Printer size={14} />Print / Save PDF</Button>
        </div></div>
      </>}
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
