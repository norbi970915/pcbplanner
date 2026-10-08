import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { BookOpen, ArrowRight, Search } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../components/shadcn/card';
import { Input } from '../components/shadcn/input';
import { Badge } from '../components/shadcn/badge';
import { useDocumentMeta } from '../components/ToolPage';
import { useShell } from '../state/shell';
import { GUIDE_CATEGORIES, GUIDES, type GuideCategory } from './registry';
export default function GuidesIndex() {
  useDocumentMeta(
    'PCB Design Guides',
    'Sourced PCB and electronics guides with worked examples: RF, S-parameters, PCIe routing, stackups, power supplies, filters, I²C and crystals.',
  );
  const { statusEl } = useShell();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '',
    requested = params.get('category');
  const selected = GUIDE_CATEGORIES.find((c) => c === requested);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = GUIDES.filter(
    (g) =>
      (!selected || g.category === selected) &&
      words.every((w) =>
        (g.title + ' ' + g.seoTitle + ' ' + g.description + ' ' + g.category)
          .toLowerCase()
          .includes(w),
      ),
  );
  const categories = selected ? [selected] : GUIDE_CATEGORIES;
  function categoryUrl(category?: GuideCategory) {
    const next = new URLSearchParams();
    if (category) next.set('category', category);
    if (query) next.set('q', query);
    return '/guides' + (next.size ? '?' + next.toString() : '');
  }
  function updateSearch(value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set('q', value);
    else next.delete('q');
    setParams(next, { replace: true });
  }
  return (
    <div className="document-page guide-catalog">
      <Card>
        <CardHeader className="section-heading">
          <h2>Guides</h2>
          <Badge variant="outline" className="quiet-badge">
            {GUIDES.length} guides
          </Badge>
        </CardHeader>
        <CardContent className="catalog-intro">
          <div className="eyebrow">REFERENCE &amp; DESIGN NOTES</div>
          <h1>PCB design guides</h1>
          <p className="text-muted">
            Short, sourced guides that explain the design decisions behind the
            calculators, with numbers you can reproduce in the tools.
          </p>
          <label htmlFor="guides-search" className="search-label">
            Search guides
          </label>
          <div className="catalog-search" style={{ marginTop: 7 }}>
            <Search size={18} />
            <Input
              id="guides-search"
              className="fld w-full"
              type="search"
              value={query}
              onChange={(e) => updateSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  updateSearch('');
                  e.currentTarget.blur();
                }
              }}
              placeholder="Try PCIe, impedance, power, RF…"
            />
          </div>
          <nav aria-label="Guide categories" className="catalog-filters">
            <Link
              to={categoryUrl()}
              className={'btn' + (!selected ? ' btn-primary' : '')}
            >
              All guides <span className="opacity-75">{GUIDES.length}</span>
            </Link>
            {GUIDE_CATEGORIES.map((c) => (
              <Link
                key={c}
                to={categoryUrl(c)}
                className={'btn' + (selected === c ? ' btn-primary' : '')}
              >
                {c}{' '}
                <span className="opacity-75">
                  {GUIDES.filter((g) => g.category === c).length}
                </span>
              </Link>
            ))}
          </nav>
          <p
            role="status"
            aria-live="polite"
            className="mt-4 text-faint text-[11px]"
          >
            Showing {matches.length} of {GUIDES.length} guides
          </p>
        </CardContent>
      </Card>
      {matches.length ? (
        categories.map((category) => {
          const guides = matches.filter((g) => g.category === category);
          if (!guides.length) return null;
          return (
            <section key={category}>
              <div className="guide-browse-heading">
                <h2>{category}</h2>
                <span>
                  {guides.length} {guides.length === 1 ? 'guide' : 'guides'}
                </span>
              </div>
              <div className="guide-browse-grid">
                {guides.map((g) => (
                  <Card key={g.path}>
                    <Link className="guide-card" to={g.path}>
                      <div className="guide-category">
                        <BookOpen size={14} />
                        {g.category}
                      </div>
                      <h3>{g.title}</h3>
                      <p>{g.description}</p>
                      <div className="guide-footer">
                        <ArrowRight size={15} />
                      </div>
                    </Link>
                  </Card>
                ))}
              </div>
            </section>
          );
        })
      ) : (
        <Card className="mt-4">
          <div className="empty-state">
            <Search size={28} />
            <h2>No guides match that search</h2>
            <p>
              Try a broader term or <Link to="/guides">browse all guides</Link>.
            </p>
          </div>
        </Card>
      )}
      {statusEl && createPortal(<span>{GUIDES.length} guides</span>, statusEl)}
    </div>
  );
}
