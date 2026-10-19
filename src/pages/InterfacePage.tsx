import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { Card } from '../components/shadcn/card';
import type { DataSource } from '../data/source';
import type { InterfaceSpec } from '../data/interfaces';
import { interfaceDescription, interfacePageByPath, interfaceSeoTitle, interfaceTitle, INTERFACE_PAGES, interfacePagePath } from '../data/interfacePages';
import { specsOf } from '../data/interfacePageSpecs';
import { guideByPath } from '../guides/registry';
import { useDocumentMeta } from '../lib/useDocumentMeta';
import { fmt } from '../lib/units';
import { useShell } from '../state/shell';
import NotFound from './NotFound';

/** A board length in mm with its customary unit: mil below an inch, inches above. */
function len(mm: number): string {
  const mil = mm / 0.0254;
  return mm < 25.4 ? `${fmt(mm, 3)} mm (${fmt(mil, 3)} mil)` : `${fmt(mm, 3)} mm (${fmt(mm / 25.4, 3)} in)`;
}

const skew = (ps?: number, mm?: number) => [ps !== undefined ? `${ps} ps` : '', mm !== undefined ? len(mm) : ''].filter(Boolean).join(' or ');

/** Rows of the key-numbers table; a row appears only when some version has the value. */
const ROWS: { label: (s: InterfaceSpec[]) => string; value: (s: InterfaceSpec) => ReactNode }[] = [
  { label: () => 'Line rate', value: (s) => `${s.rateGbps} Gb/s` },
  { label: () => 'Nyquist frequency', value: (s) => `${s.nyquistGHz} GHz` },
  { label: () => 'Encoding', value: (s) => s.encoding },
  {
    label: () => 'Impedance',
    value: (s) => `${s.z.target} Ω ${s.z.kind === 'diff' ? 'differential' : 'single-ended'}${s.z.min !== undefined && s.z.max !== undefined ? ` (${s.z.min}–${s.z.max} Ω)` : ''}`,
  },
  { label: () => 'Second impedance', value: (s) => (s.z2 ? `${s.z2.label}` : undefined) },
  { label: (ss) => ss.find((s) => s.skewLabels?.intra)?.skewLabels?.intra ?? 'Intra-pair skew', value: (s) => {
      const v = skew(s.intraPairPs, s.intraPairMm);
      if (!v || !(s.intraPairGuideline || s.intraPairBudgetPs !== undefined)) return v || undefined;
      return `${v}, layout guideline${s.intraPairBudgetPs !== undefined ? `; the specification allows ${s.intraPairBudgetPs} ps` : ''}`;
    },
  },
  { label: (ss) => ss.find((s) => s.skewLabels?.lane)?.skewLabels?.lane ?? 'Lane-to-lane skew', value: (s) => skew(s.laneSkewPs, s.laneSkewMm) || undefined },
  { label: () => 'Board loss budget', value: (s) => (s.lossBudgetDb !== undefined ? `${s.lossBudgetDb} dB at ${s.nyquistGHz} GHz` : undefined) },
  { label: () => 'Laminate the lengths assume', value: (s) => (s.maxLossPerInGHz !== undefined ? `≤ ${s.maxLossPerInGHz} dB per inch per GHz` : undefined) },
  { label: () => 'Longest route', value: (s) => (s.maxLenMm !== undefined ? len(s.maxLenMm) : undefined) },
  { label: () => 'Longest route (delay)', value: (s) => (s.maxDelayPs !== undefined ? `${s.maxDelayPs} ps` : undefined) },
];

export default function InterfacePage() {
  const { pathname } = useLocation();
  const page = interfacePageByPath(pathname.replace(/\/$/, ''));
  const { statusEl } = useShell();
  const articleRef = useRef<HTMLElement>(null);
  useDocumentMeta(page ? interfaceSeoTitle(page) : 'Page not found', page ? interfaceDescription(page) : '');
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
  if (!page) return <NotFound />;
  const specs = specsOf(page);

  // one numbered source list for the page; each version's own indices map into it
  const sources: DataSource[] = [];
  const cite = specs.map((s) =>
    s.sources.map((src) => {
      let i = sources.findIndex((x) => x.url === src.url && x.title === src.title);
      if (i < 0) i = sources.push(src) - 1;
      return i + 1;
    }),
  );
  const rows = ROWS.filter((r) => specs.some((s) => r.value(s) !== undefined));
  const guides = page.guides.map(guideByPath).filter((g) => !!g);
  const others = INTERFACE_PAGES.filter((o) => o !== page);

  return (
    <article ref={articleRef} className="document-page">
      <Card className="mx-auto max-w-[920px] border border-line bg-sheet">
        <div className="flex h-[24px] items-center gap-1 bg-panel-head px-2 text-muted">
          <Link to="/interface-rules">Interface rules</Link>
          <span>›</span>
          <span className="truncate">{page.product}</span>
        </div>
        <div className="prose-doc guide px-6 py-6">
          <h1>{interfaceTitle(page)}</h1>
          <p>
            <b>{page.lead}</b>
          </p>
          <p>
            {specs.some((s) => s.rules.some((r) => r.normative))
              ? `Every rule below names the document it comes from: the ${page.product} specification where it makes the rule mandatory, otherwise a chip vendor’s layout guide.`
              : `Every rule below comes from a chip vendor’s layout guide or data sheet, each named in the sources; none is quoted from the ${page.product} specification itself.`}{' '}
            Vendor guides differ, so treat their numbers as good practice and follow your own device’s guide where it is stricter.
          </p>

          <h2>Key numbers</h2>
          <table className="tbl">
            <thead>
              <tr>
                <th>
                  <span className="sr-only">Quantity</span>
                </th>
                {specs.map((s) => (
                  <th key={s.id}>{s.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.label(specs)}</td>
                  {specs.map((s) => (
                    <td key={s.id}>{r.value(s) ?? '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {specs.some((s) => s.z.note || s.lossNote) && (
            <ul>
              {specs.map((s) => (
                <Fragment key={s.id}>
                  {s.z.note && (
                    <li>
                      {specs.length > 1 && <b>{s.name}: </b>}
                      {s.z.note}
                    </li>
                  )}
                  {s.lossNote && (
                    <li>
                      {specs.length > 1 && <b>{s.name}: </b>}
                      {s.lossNote}
                    </li>
                  )}
                </Fragment>
              ))}
            </ul>
          )}

          {specs.map((s, k) => (
            <Fragment key={s.id}>
              <h2>{specs.length > 1 ? `${s.name} routing rules` : 'Routing rules'}</h2>
              <p className="text-muted">{s.summary}</p>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Rule</th>
                    <th>Requirement</th>
                    <th>Basis</th>
                  </tr>
                </thead>
                <tbody>
                  {s.rules.map((r, i) => (
                    <tr key={i}>
                      <td>{r.label}</td>
                      <td>
                        {r.req}
                        {r.detail && <div className="text-muted">{r.detail}</div>}
                      </td>
                      <td>
                        {r.normative ? 'Specification' : 'Vendor guide'}{' '}
                        <sup className="cite">
                          [<a href={`#src-${cite[k][r.src]}`}>{cite[k][r.src]}</a>]
                        </sup>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                <Link to={`/interface-rules?ifid=${s.id}`}>Check {s.name} on your own stackup →</Link> The interface rules tool designs the trace for this impedance on a layer you
                choose and turns every limit above into a length on that board.
              </p>
            </Fragment>
          ))}

          {guides.length > 0 && (
            <>
              <h2>Related guides</h2>
              <ul>
                {guides.map((g) => (
                  <li key={g.path}>
                    <Link to={g.path}>{g.title}</Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h2>Sources</h2>
          <ol className="sources">
            {sources.map((s, i) => (
              <li key={s.url + s.title} id={`src-${i + 1}`}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.title}
                </a>
                . {s.note}
              </li>
            ))}
          </ol>

          <h2>Layout guidelines for other interfaces</h2>
          <p>
            {others.map((o, i) => (
              <Fragment key={o.slug}>
                {i > 0 && ' · '}
                <Link to={interfacePagePath(o.slug)}>{o.product}</Link>
              </Fragment>
            ))}
            {' · '}
            <Link to="/guides/pcie-routing-guidelines">PCIe</Link>
          </p>
        </div>
      </Card>
      {statusEl && createPortal(<span>Layout guidelines</span>, statusEl)}
    </article>
  );
}
