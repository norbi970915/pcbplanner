import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { FileText } from 'lucide-react';
import { HistoryControls } from './HistoryControls';
import { useHistoryShortcuts } from '../state/useHistoryShortcuts';
import { CalculationReport } from './CalculationReport';
import { captureReport, type ReportSnapshot } from '../lib/calculationReport';
import { createPortal } from 'react-dom';
import { RelatedGuides } from './RelatedGuides';
import { FavoriteButton } from './FavoriteButton';
import { Button } from './shadcn/button';
import { CategoryIcon } from './CategoryIcon';
import { useDocumentMeta } from '../lib/useDocumentMeta';
export { useDocumentMeta } from '../lib/useDocumentMeta';
import { Link, useLocation } from 'react-router-dom';
import { guidesForTool } from '../guides/registry';
import { useShell } from '../state/shell';
import { GROUP_COLORS, relatedTools, toolByPath } from '../tools/registry';
import { FieldInteractionContext, useFieldInteractionState } from '../state/fieldInteraction';

/**
 * Frame of every tool: the document (results, drawings, help) is rendered in
 * the centre; `properties` go into the docked Properties panel and `status`
 * into the status bar.
 */
export function ToolPage({
  title,
  description,
  properties,
  status,
  onReset,
  children,
  method,
  reportCapture,
}: {
  title: string;
  description: string;
  properties?: ReactNode;
  status?: ReactNode;
  onReset?: () => void;
  children: ReactNode;
  method?: ReactNode;
  reportCapture?: (snapshot: ReportSnapshot) => Promise<ReportSnapshot>;
}) {
  const { pathname } = useLocation();
  const interaction = useFieldInteractionState();
  const historyMessage = useHistoryShortcuts();
  const resultsRef = useRef<HTMLDivElement>(null);
  const methodRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  // a table wider than a phone scrolls inside itself (results or Method); make that box reachable by keyboard
  useEffect(() => {
    const page = pageRef.current;
    if (!page || typeof ResizeObserver === 'undefined') return;
    const mark = () => {
      for (const table of Array.from(page.querySelectorAll('table'))) {
        if (table.scrollWidth > table.clientWidth + 1) table.tabIndex = 0;
        else table.removeAttribute('tabindex');
      }
    };
    mark();
    const observer = new ResizeObserver(mark);
    observer.observe(page);
    return () => {
      observer.disconnect();
    };
  }, [pathname]);
  const reportReturnFocus = useRef<HTMLElement | null>(null);
  const [reportSnapshot, setReportSnapshot] = useState<ReportSnapshot | null>(null);
  const reportId = useRef(0);
  useEffect(() => () => { reportId.current++; }, [pathname]);
  const paused = interaction.issues.length > 0;
  const focusIssue = () => {
    showInputs();
    const input = document.getElementById(interaction.issues[0]?.id);
    const toggle = input?.closest('.properties-section')?.querySelector<HTMLButtonElement>('button[aria-expanded="false"]');
    toggle?.click();
    requestAnimationFrame(() => { input?.focus(); input?.scrollIntoView({ block: 'center' }); });
  };
  useDocumentMeta(toolByPath(pathname)?.seoTitle ?? title, toolByPath(pathname)?.metaDescription ?? description);
  const { propsEl, statusEl, headEl, setActions, showInputs } = useShell();
  const related = guidesForTool(pathname);
  const relatedT = relatedTools(pathname);
  const tool = toolByPath(pathname);
  const createReport = useCallback(async () => {
    reportReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!resultsRef.current) return;
    const snapshot = captureReport(title, description, resultsRef.current, propsEl, methodRef.current, statusEl);
    const id = ++reportId.current;
    if (!reportCapture || snapshot.blocked) { setReportSnapshot(snapshot); return; }
    setReportSnapshot({ ...snapshot, preparing: true, blocked: 'Solving the configured project analyses. This can take a moment on a large board.' });
    try {
      const report = await reportCapture(snapshot);
      if (id === reportId.current) setReportSnapshot(report);
    } catch (error) {
      if (id === reportId.current) setReportSnapshot({ ...snapshot, blocked: error instanceof Error ? error.message : String(error) });
    }
  }, [title, description, propsEl, statusEl, reportCapture]);
  const closeReport = () => {
    reportId.current++;
    setReportSnapshot(null);
    requestAnimationFrame(() => {
      const trigger = reportReturnFocus.current;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      else Array.from(document.querySelectorAll<HTMLButtonElement>('.report-trigger')).find(button => button.getClientRects().length)?.focus({ preventScroll: true });
    });
  };
  useEffect(() => {
    setActions({ reset: onReset, report: createReport });
    return () => setActions(null);
  }, [onReset, setActions, createReport]);

  // narrow screens: the header is shown above the inputs (Layout slot), so it is hidden here
  const mobileHead = (
    <div className="tool-heading mobile-tool-heading flex items-start justify-between gap-3 px-4 pb-4 pt-4">
      <div className="min-w-0">
        <div
          className="tool-title flex items-center gap-2.5 font-semibold"
          role="heading"
          aria-level={1}
        >
          {tool && (
            <CategoryIcon
              group={tool.group}
              color={GROUP_COLORS[tool.group]}
              size={23}
            />
          )}
          {title}
        </div>
        <p className="text-muted">{description}</p>
      </div>
      <div className="tool-actions">
        <HistoryControls />
        {tool && <Button type="button" variant="ghost" size="sm" className="report-trigger" onClick={createReport} aria-label="Create calculation report"><FileText size={15} /><span>Report</span></Button>}
        {tool && <FavoriteButton path={tool.path} title={tool.title} compact />}
        {onReset && (
          <Button variant="outline" size="sm" className="reset-button" onClick={onReset}>
            Reset
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <FieldInteractionContext.Provider value={interaction}>
    <div ref={pageRef} className="document-page tool-page" style={{ '--tool-accent': GROUP_COLORS[tool?.group ?? ''] ?? 'var(--accent-ink)' } as CSSProperties}>
      {headEl && createPortal(mobileHead, headEl)}
      <span className="sr-only" role="status" aria-live="polite">{historyMessage}</span>
      <div className="tool-heading mb-4 hidden flex-wrap items-end justify-between gap-3 lg:flex">
        <div className="min-w-0">
          <h1 className="tool-title flex items-center gap-2.5 font-semibold">
            {tool && (
              <CategoryIcon
                group={tool.group}
                color={GROUP_COLORS[tool.group]}
                size={24}
              />
            )}
            {title}
          </h1>
          <p className="max-w-[95ch] text-muted">{description}</p>
        </div>
        <div className="tool-actions">
        <HistoryControls />
          {tool && <Button type="button" variant="ghost" size="sm" className="report-trigger" onClick={createReport} aria-label="Create calculation report"><FileText size={15} />Report</Button>}
          {tool && <FavoriteButton path={tool.path} title={tool.title} />}
          {onReset && (
            <Button variant="outline" size="sm" className="reset-button" onClick={onReset}>
              Reset
            </Button>
          )}
        </div>
      </div>

      {paused && <div className="inputs-paused" role="status">
        <div><strong>Results paused</strong><p>{interaction.issues[0].label}: {interaction.issues[0].message}</p></div>
        <Button type="button" variant="outline" size="sm" onClick={focusIssue}>Go to input</Button>
      </div>}
      <div ref={resultsRef} className="space-y-4" data-inputs-invalid={paused || undefined}>{children}</div>

      {related.length > 0 && (
        <RelatedGuides key={pathname} guides={related} toolPath={pathname} />
      )}

      {relatedT.length > 0 && (
        <div
          className={`${related.length > 0 ? 'mt-2' : 'mt-4'} border border-line bg-sheet px-3 py-2`}
        >
          <span className="font-semibold">Related tools: </span>
          {relatedT.map((t, i) => (
            <span key={t.path}>
              {i > 0 && ' · '}
              <Link to={t.path}>{t.title}</Link>
            </span>
          ))}
        </div>
      )}

      {method && (
        <details id="method" className="mt-4 border border-line bg-sheet" open>
          <summary className="method-heading flex cursor-pointer select-none items-center bg-panel-head px-2 font-semibold">
            Method, formulas and references
          </summary>
          <div ref={methodRef} className="prose-doc px-4 py-3">{method}</div>
        </details>
      )}
      <p className="mt-3 px-1 text-faint">
        Results are engineering estimates, provided as is without warranty. Verify them before use. <Link to="/terms">Terms</Link> · <Link to="/privacy">Privacy</Link>
      </p>

      {propsEl && properties && createPortal(<FieldInteractionContext.Provider value={{ ...interaction, inProperties: true }}>{properties}</FieldInteractionContext.Provider>, propsEl)}
      {statusEl && status && createPortal(paused ? 'Results paused \u00b7 Check the inputs' : status, statusEl)}
    </div>
    {reportSnapshot && <CalculationReport key={`${reportSnapshot.preparing ? 'preparing' : 'ready'}:${reportSnapshot.title}`} snapshot={reportSnapshot} onClose={closeReport} />}
    </FieldInteractionContext.Provider>
  );
}
