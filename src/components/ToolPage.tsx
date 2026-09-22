import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { APP_NAME, SITE_URL } from '../config';
import { Link, useLocation } from 'react-router-dom';
import { guidesForTool } from '../guides/registry';
import { useShell } from '../state/shell';

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
    // canonical and social URLs follow the current tool
    let canon = document.querySelector('link[rel="canonical"]');
    if (!canon) {
      canon = document.createElement('link');
      canon.setAttribute('rel', 'canonical');
      document.head.appendChild(canon);
    }
    const url = SITE_URL + window.location.pathname;
    canon.setAttribute('href', url);
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', url);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', `${title} – ${APP_NAME}`);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
    document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', `${title} – ${APP_NAME}`);
    document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', description);
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
  const { propsEl, statusEl, headEl, setActions } = useShell();
  const related = guidesForTool(useLocation().pathname);
  useEffect(() => {
    setActions({ reset: onReset });
    return () => setActions(null);
  }, [onReset, setActions]);

  // narrow screens: the header is shown above the inputs (Layout slot), so it is hidden here
  const mobileHead = (
    <div className="flex items-start justify-between gap-2 px-3 pb-2 pt-3">
      <div className="min-w-0">
        <div className="text-[16px] font-semibold" role="heading" aria-level={1}>
          {title}
        </div>
        <p className="text-muted">{description}</p>
      </div>
      {onReset && (
        <button className="btn" onClick={onReset}>
          Reset
        </button>
      )}
    </div>
  );

  return (
    <div className="p-3">
      {headEl && createPortal(mobileHead, headEl)}
      <div className="mb-2.5 hidden flex-wrap items-end justify-between gap-2 lg:flex">
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

      {related.length > 0 && (
        <div className="mt-4 border border-line bg-sheet px-3 py-2">
          <span className="font-semibold">Related {related.length > 1 ? 'guides' : 'guide'}: </span>
          {related.map((g, i) => (
            <span key={g.path}>
              {i > 0 && ' · '}
              <Link to={g.path}>{g.title}</Link>
            </span>
          ))}
        </div>
      )}

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
