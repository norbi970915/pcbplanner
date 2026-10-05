import { Card } from '../components/shadcn/card';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { useDocumentMeta } from '../components/ToolPage';
import { useShell } from '../state/shell';
import { toolByPath } from '../tools/registry';
import { guideByPath, relatedGuidesFor } from './registry';

export interface Source {
  text: ReactNode;
  url?: string;
}

/** Guide frame: title, body, the tools used, and numbered sources. */
export function Guide({
  children,
  sources,
}: {
  children: ReactNode;
  sources: Source[];
}) {
  const { pathname } = useLocation();
  const g = guideByPath(pathname)!;
  useDocumentMeta(g.seoTitle, g.description);
  const { statusEl } = useShell();
  // start each article at the top (the document area scrolls on desktop, the window on phones).
  // Block body on purpose: scrollTo returns a Promise in current browsers, and an effect must not return one.
  useEffect(() => {
    document.querySelector('main')?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }, [pathname]);
  const related = relatedGuidesFor(g.path);
  return (
    <article className="document-page">
      <Card className="mx-auto max-w-[860px] border border-line bg-sheet">
        <div className="flex h-[24px] items-center gap-1 bg-panel-head px-2 text-muted">
          <Link to="/guides">Guides</Link>
          <span>›</span>
          <span className="truncate">{g.title}</span>
        </div>
        <div className="prose-doc guide px-6 py-6">
          <h1>{g.title}</h1>
          {children}
          <h2>Tools used in this guide</h2>
          <ul>
            {g.tools.map((p) => {
              const t = toolByPath(p);
              return t ? (
                <li key={p}>
                  <Link to={p}>{t.title}</Link> – {t.summary}
                </li>
              ) : null;
            })}
          </ul>
          <h2>Sources</h2>
          <ol className="sources">
            {sources.map((s, i) => (
              <li key={i} id={`src-${i + 1}`}>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.text}
                  </a>
                ) : (
                  s.text
                )}
              </li>
            ))}
          </ol>
          {related.length > 0 && (
            <>
              <h2>Related guides</h2>
              <ul>
                {related.map((guide) => (
                  <li key={guide.path}>
                    <Link to={guide.path}>{guide.title}</Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p><Link to="/guides">Browse all guides</Link></p>
        </div>
      </Card>
      {statusEl && createPortal(<span>Guide</span>, statusEl)}
    </article>
  );
}

/** Citation marker linking to the numbered source list: <Cite n={2} /> → [2]. */
export function Cite({ n }: { n: number | number[] }) {
  const list = Array.isArray(n) ? n : [n];
  return (
    <sup className="cite">
      [
      {list.map((k, i) => (
        <span key={k}>
          {i > 0 && ', '}
          <a href={`#src-${k}`}>{k}</a>
        </span>
      ))}
      ]
    </sup>
  );
}

/** Callout linking to a tool with prefilled inputs. */
export function TryIt({ to, children }: { to: string; children: ReactNode }) {
  return (
    <p className="tryit">
      <Link to={to}>{children} →</Link>
    </p>
  );
}
