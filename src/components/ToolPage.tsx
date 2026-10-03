import { useEffect, type CSSProperties, type ReactNode } from 'react';
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
  const { pathname } = useLocation();
  useDocumentMeta(toolByPath(pathname)?.seoTitle ?? title, description);
  const { propsEl, statusEl, headEl, setActions } = useShell();
  const related = guidesForTool(pathname);
  const relatedT = relatedTools(pathname);
  const tool = toolByPath(pathname);
  useEffect(() => {
    setActions({ reset: onReset });
    return () => setActions(null);
  }, [onReset, setActions]);

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
    <div className="document-page tool-page" style={{ '--tool-accent': GROUP_COLORS[tool?.group ?? ''] ?? 'var(--accent-ink)' } as CSSProperties}>
      {headEl && createPortal(mobileHead, headEl)}
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
          {tool && <FavoriteButton path={tool.path} title={tool.title} />}
          {onReset && (
            <Button variant="outline" size="sm" className="reset-button" onClick={onReset}>
              Reset
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-4">{children}</div>

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
          <div className="prose-doc px-4 py-3">{method}</div>
        </details>
      )}

      {propsEl && properties && createPortal(properties, propsEl)}
      {statusEl && status && createPortal(status, statusEl)}
    </div>
  );
}
