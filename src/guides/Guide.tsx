import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { useDocumentMeta } from '../components/ToolPage';
import { useShell } from '../state/shell';
import { toolByPath } from '../tools/registry';
import { guideByPath, GUIDES } from './registry';

export interface Source {
  text: ReactNode;
  url?: string;
}

/** Article frame: title, date, body, the tools used, and numbered sources. */
export function Guide({ children, tools, sources }: { children: ReactNode; tools: string[]; sources: Source[] }) {
  const { pathname } = useLocation();
  const g = guideByPath(pathname)!;
  useDocumentMeta(g.title, g.description);
  const { statusEl } = useShell();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  const others = GUIDES.filter((x) => x.path !== g.path);
  return (
    <article className="p-3">
      <div className="mx-auto max-w-[860px] border border-line bg-sheet">
        <div className="flex h-[24px] items-center gap-1 bg-panel-head px-2 text-muted">
          <Link to="/guides">Guides</Link>
          <span>›</span>
          <span className="truncate">{g.title}</span>
        </div>
        <div className="prose-doc guide px-5 py-4">
          <h1>{g.title}</h1>
          <p className="text-faint">
            <time dateTime={g.date}>{new Date(g.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</time> · {g.minutes} min read · pcbplanner
          </p>
          {children}
          <h2>Tools used in this guide</h2>
          <ul>
            {tools.map((p) => {
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
          <h2>More guides</h2>
          <ul>
            {others.map((o) => (
              <li key={o.path}>
                <Link to={o.path}>{o.title}</Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {statusEl && createPortal(<span>Guide · {g.minutes} min read</span>, statusEl)}
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
