import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { useDocumentMeta } from '../components/ToolPage';
import { useShell } from '../state/shell';
import { GUIDE_CATEGORIES, GUIDES, type GuideCategory } from './registry';

export default function GuidesIndex() {
  useDocumentMeta('PCB Design Guides', 'Sourced PCB and electronics guides with worked examples for RF, S-parameters, PCIe routing, stackups, power supplies, RC filters, I²C pull-ups and crystal clocks.');
  const { statusEl } = useShell();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const requested = params.get('category');
  const selected = GUIDE_CATEGORIES.find(category => category === requested);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = GUIDES.filter(guide => {
    if (selected && guide.category !== selected) return false;
    const text = `${guide.title} ${guide.seoTitle} ${guide.description} ${guide.category}`.toLowerCase();
    return words.every(word => text.includes(word));
  });
  const categories = selected ? [selected] : GUIDE_CATEGORIES;

  function categoryUrl(category?: GuideCategory) {
    const next = new URLSearchParams();
    if (category) next.set('category', category);
    if (query) next.set('q', query);
    const search = next.toString();
    return search ? `/guides?${search}` : '/guides';
  }

  return (
    <div className="p-3">
      <div className="mx-auto max-w-[860px] border border-line bg-sheet">
        <div className="flex h-[24px] items-center bg-panel-head px-2 font-semibold">Guides</div>
        <div className="px-4 py-3">
          <h1 className="text-[18px] font-semibold">PCB design guides</h1>
          <p className="mt-1 text-muted">Short, sourced articles that explain the design decisions behind the calculators, with numbers you can reproduce in the tools.</p>
          <label className="mt-3 block max-w-[560px]">
            <span className="mb-1 block font-semibold">Search guides</span>
            <input className="fld w-full" style={{ height: 32 }} type="search" value={query}
              onChange={event => {
                const next = new URLSearchParams(params);
                if (event.target.value) next.set('q', event.target.value);
                else next.delete('q');
                setParams(next, { replace: true });
              }}
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  const next = new URLSearchParams(params);
                  next.delete('q');
                  setParams(next, { replace: true });
                  event.currentTarget.blur();
                }
              }}
              placeholder="Try PCIe, impedance, power, RF..." />
          </label>
          <nav aria-label="Guide categories" className="mt-3 flex flex-wrap gap-1.5">
            <Link to={categoryUrl()} className={`btn no-underline ${selected ? '' : 'btn-primary'}`}>All guides <span className="opacity-75">{GUIDES.length}</span></Link>
            {GUIDE_CATEGORIES.map(category => <Link key={category} to={categoryUrl(category)}
              className={`btn no-underline ${selected === category ? 'btn-primary' : ''}`}>
              {category} <span className="opacity-75">{GUIDES.filter(guide => guide.category === category).length}</span>
            </Link>)}
          </nav>
          <p role="status" aria-live="polite" className="mt-3 text-muted">Showing {matches.length} of {GUIDES.length} guides</p>
        </div>
        {matches.length ? categories.map(category => {
          const guides = matches.filter(guide => guide.category === category);
          if (!guides.length) return null;
          return <section key={category}>
            <h2 className="flex h-[24px] items-center justify-between border-t border-line bg-panel-head px-3 font-semibold">
              <span>{category}</span><span className="font-normal text-faint">{guides.length} {guides.length === 1 ? 'guide' : 'guides'}</span>
            </h2>
            <ul>
              {guides.map(guide => <li key={guide.path} className="border-t border-line">
                <Link to={guide.path} className="block px-4 py-3 no-underline hover:bg-hover">
                  <div className="text-[14px] font-semibold text-accent-ink">{guide.title}</div>
                  <div className="mt-0.5 text-muted">{guide.description}</div>
                  <div className="mt-0.5 text-faint">{guide.minutes} min read</div>
                </Link>
              </li>)}
            </ul>
          </section>;
        }) : <div className="border-t border-line px-4 py-5 text-muted">No guides match that search in this category. Try a broader term or <Link to="/guides">browse all guides</Link>.</div>}
      </div>
      {statusEl && createPortal(<span>{GUIDES.length} guides</span>, statusEl)}
    </div>
  );
}
