import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { APP_NAME } from '../config';
import { useShell } from '../state/shell';
import { AdSlot, PartnerBox } from './Ads';

export function useDocumentMeta(title: string, description: string) {
  useEffect(() => {
    document.title = `${title} – ${APP_NAME}`;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', description);
  }, [title, description]);
}

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
}: {
  title: string;
  description: string;
  properties?: ReactNode;
  status?: ReactNode;
  onReset?: () => void;
  children: ReactNode;
  method?: ReactNode;
}) {
  useDocumentMeta(title, description);
  const { propsEl, statusEl, setActions } = useShell();
  useEffect(() => {
    setActions({ reset: onReset });
    return () => setActions(null);
  }, [onReset, setActions]);

  return (
    <div className="p-3">
      <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-[15px] font-semibold">{title}</h1>
          <p className="max-w-[95ch] text-muted">{description}</p>
        </div>
        {onReset && (
          <button className="btn" onClick={onReset}>
            Reset
          </button>
        )}
      </div>

      <div className="space-y-3">{children}</div>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_280px]">
        <AdSlot slot="document-inline" minHeight={100} />
        <PartnerBox />
      </div>

      {method && (
        <details id="method" className="mt-4 border border-line bg-sheet" open>
          <summary className="flex h-[24px] cursor-pointer select-none items-center bg-panel-head px-2 font-semibold">Method, formulas and references</summary>
          <div className="prose-doc px-4 py-3">{method}</div>
        </details>
      )}

      {propsEl && properties && createPortal(properties, propsEl)}
      {statusEl && status && createPortal(status, statusEl)}
    </div>
  );
}
