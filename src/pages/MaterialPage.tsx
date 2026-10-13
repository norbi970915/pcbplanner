import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { Card } from '../components/shadcn/card';
import { LAMINATE_SOURCES } from '../data/laminates';
import { dkText, entriesOf, headline, isMask, MATERIAL_PAGES, materialDescription, materialPageByPath, materialPath, materialSeoTitle, materialTitle } from '../data/materialPages';
import { djordjevicSarkar } from '../lib/dielectric';
import { useDocumentMeta } from '../lib/useDocumentMeta';
import { useShell } from '../state/shell';
import NotFound from './NotFound';

/** Frequencies of the modelled table, GHz. */
const FREQS = [1, 2, 5, 10, 20];

export default function MaterialPage() {
  const { pathname } = useLocation();
  const m = materialPageByPath(pathname.replace(/\/$/, ''));
  const { statusEl } = useShell();
  const articleRef = useRef<HTMLElement>(null);
  // a table wider than a phone scrolls inside itself; make that box reachable by keyboard
  useEffect(() => {
    const article = articleRef.current;
    if (!article || typeof ResizeObserver === 'undefined') return;
    const mark = () => {
      for (const table of Array.from(article.querySelectorAll('table'))) {
        if (table.scrollWidth > table.clientWidth + 1) table.tabIndex = 0;
        else table.removeAttribute('tabindex');
      }
    };
    mark();
    const observer = new ResizeObserver(mark);
    observer.observe(article);
    return () => {
      observer.disconnect();
    };
  }, [pathname]);
  useDocumentMeta(m ? materialSeoTitle(m) : 'Page not found', m ? materialDescription(m) : '');
  if (!m) return <NotFound />;
  const entries = entriesOf(m);
  const mask = isMask(m);
  const cls = entries[0].cls;
  const similar = MATERIAL_PAGES.filter((o) => o !== m && isMask(o) === mask && entriesOf(o).some((l) => l.cls === cls));
  const sources = [...new Set(entries.map((l) => l.src))].map((i) => LAMINATE_SOURCES[i]);
  const tg = entries.find((l) => l.tg)?.tg;

  return (
    <article ref={articleRef} className="document-page">
      <Card className="mx-auto max-w-[860px] border border-line bg-sheet">
        <div className="flex h-[24px] items-center gap-1 bg-panel-head px-2 text-muted">
          <Link to="/pcb-materials">Materials (Dk/Df)</Link>
          <span>›</span>
          <span className="truncate">{m.product}</span>
        </div>
        <div className="prose-doc guide px-6 py-6">
          <h1>{materialTitle(m)}</h1>
          <p>
            <b>
              {m.vendor} {m.product}: {headline(m)} at {entries[0].fGHz} GHz
            </b>{' '}
            ({entries[0].note.replace(/\.$/, '')}).{' '}
            {mask
              ? 'It is a liquid photoimageable solder mask, so it sets the coating over outer-layer traces, not the dielectric between layers.'
              : `In the pcbplanner material library it is listed under ${cls.toLowerCase()} materials${tg ? `, with a glass transition temperature of ${tg} °C` : ''}.`}
          </p>

          <h2>Datasheet values</h2>
          <table className="tbl">
            <thead>
              <tr>
                <th>Entry</th>
                <th className="v">Dk</th>
                <th className="v">Df</th>
                <th className="v">at</th>
                <th className="v">Tg</th>
                <th>Construction and test method</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((l) => (
                <tr key={l.id}>
                  <td>{l.name}</td>
                  <td className="v">{dkText(l.dk)}</td>
                  <td className="v">{l.df}</td>
                  <td className="v">{l.fGHz} GHz</td>
                  <td className="v">{l.tg ? `${l.tg} °C` : '—'}</td>
                  <td className="text-muted">{l.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Dk and Df depend on the glass style, the resin content and the test method, so the same product has different values in different constructions. Compare materials at the same
            frequency and, where possible, with the same method; for a construction not listed here, use the manufacturer’s construction table.
          </p>

          <h2>Dk and Df from 1 to 20 GHz</h2>
          <p>
            The datasheet gives one frequency. The table extends that point with the Djordjevic–Sarkar wideband Debye model, the same model the impedance and trace-loss calculators use:
            it keeps Df nearly flat and lets Dk fall slowly with frequency. These are model values, not measurements.
          </p>
          <table className="tbl">
            <thead>
              <tr>
                <th>Entry</th>
                {FREQS.map((f) => (
                  <th key={f} className="v">
                    {f} GHz
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((l) => {
                const model = djordjevicSarkar({ dk: l.dk, df: l.df, f0: l.fGHz * 1e9 });
                return (
                  <tr key={l.id}>
                    <td>{l.name}</td>
                    {FREQS.map((f) => (
                      <td key={f} className="v">
                        {model.dk(f * 1e9).toFixed(2)} / {model.df(f * 1e9).toPrecision(2)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-muted">Each cell is Dk / Df.</p>

          {!mask && (
            <>
              <h2>Use it in a calculation</h2>
              <ul>
                {entries.map((l) => (
                  <li key={l.id}>
                    <Link to={`/impedance?mat=${l.id}`}>Impedance and trace width on {l.name}</Link> · <Link to={`/trace-loss?mat=${l.id}`}>insertion loss per inch</Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          {mask && (
            <p>
              Solder mask lowers the impedance of an outer-layer trace by a few ohms. The <Link to="/impedance">impedance calculator</Link> includes the mask thickness and Dk, and the{' '}
              <Link to="/guides/controlled-impedance">controlled impedance guide</Link> shows how much it changes.
            </p>
          )}

          {similar.length > 0 && (
            <>
              <h2>Similar materials</h2>
              <ul>
                {similar.map((o) => {
                  const l = entriesOf(o)[0];
                  return (
                    <li key={o.slug}>
                      <Link to={materialPath(o.slug)}>
                        {o.vendor} {o.product}
                      </Link>{' '}
                      – {headline(o)} at {l.fGHz} GHz
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          <h2>Sources</h2>
          <ol className="sources">
            {sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.title}
                </a>
                . {s.note}
              </li>
            ))}
          </ol>
          <p>
            <Link to="/pcb-materials">All laminates, solder masks and copper foils</Link>
          </p>
        </div>
      </Card>
      {statusEl && createPortal(<span>Material datasheet</span>, statusEl)}
    </article>
  );
}
