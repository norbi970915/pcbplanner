import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { CategoryIcon } from '../components/CategoryIcon';
import { useDocumentMeta } from '../components/ToolPage';
import { APP_NAME } from '../config';
import {
  Search,
  ArrowRight,
  X,
  BookOpen,
  Check,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '../components/shadcn/card';
import { Button } from '../components/shadcn/button';
import { Input } from '../components/shadcn/input';
import { Badge } from '../components/shadcn/badge';
import { NEWS } from '../data/news';
import { PRESETS } from '../lib/stackups';
import { useShell } from '../state/shell';
import { GUIDES } from '../guides/registry';
import { GROUP_COLORS, GROUPS, TOOLS } from './registry';

const QUICK_TASKS = [
  {
    path: '/impedance',
    action: 'Calculate trace impedance',
    detail: 'Single-ended and differential traces',
    group: 'Signal integrity',
  },
  {
    path: '/stackup-advisor',
    action: 'Choose a PCB stackup',
    detail: 'Layers, thickness and routing needs',
    group: 'Stackup',
  },
  {
    path: '/trace-width',
    action: 'Size a power trace',
    detail: 'Current, temperature rise and voltage drop',
    group: 'Power & conductors',
  },
  {
    path: '/via',
    action: 'Check a via',
    detail: 'Current, resistance and parasitics',
    group: 'Components',
  },
  {
    path: '/schematic',
    action: 'Plan a schematic',
    detail: 'Power tree, values and interface checks',
    group: 'Electronics',
  },
  {
    path: '/units',
    action: 'Convert units',
    detail: 'Copper weight, length, power and more',
    group: 'Utilities',
  },
];
const RECENT_GUIDES = [...GUIDES]
  .sort((a, b) => b.date.localeCompare(a.date))
  .slice(0, 3);
const HOME_SEARCH_KEY = 'pcbplanner:home-search';
const newsDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

function Heading({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <CardHeader className="section-heading">
      <h2>{children}</h2>
      {action}
    </CardHeader>
  );
}
export default function Home() {
  useDocumentMeta(
    'PCB impedance, stackup and design calculators',
    'Impedance field solver, stackup advisor, layer stack manager, trace width, via, thermal, crosstalk, PDN and electronics calculators for PCB design. Runs in the browser.',
  );
  const { statusEl } = useShell();
  const [query, setQuery] = useState(() => {
    try {
      return sessionStorage.getItem(HOME_SEARCH_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try {
      if (query) sessionStorage.setItem(HOME_SEARCH_KEY, query);
      else sessionStorage.removeItem(HOME_SEARCH_KEY);
    } catch {
      /* storage unavailable */
    }
  }, [query]);
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.altKey || event.metaKey)
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      )
        return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const toolMatches = words.length
    ? TOOLS.filter((tool) => {
        const text =
          `${tool.nav} ${tool.title} ${tool.group} ${tool.summary}`.toLowerCase();
        return words.every((word) => text.includes(word));
      })
    : [];
  const guideMatches = words.length
    ? GUIDES.filter((guide) => {
        const text =
          `${guide.title} ${guide.seoTitle} ${guide.description}`.toLowerCase();
        return words.every((word) => text.includes(word));
      })
    : [];

  return (
    <>
      <div className="home-content">
        <Card className="welcome-card">
          <Heading
            action={
              <Badge variant="outline" className="quiet-badge">
                Overview
              </Badge>
            }
          >
            Home
          </Heading>
          <CardContent className="welcome-content">
            <div className="welcome-top">
              <div>
                <div className="eyebrow">YOUR PCB DESIGN WORKBENCH</div>
                <h1>
                  {APP_NAME}
                  <span className="title-dot">.</span>
                </h1>
              </div>
              <div className="welcome-stats">
                <span>
                  <strong>{TOOLS.length}</strong> tools
                </span>
                <span>
                  <strong>{PRESETS.length}</strong> stackups
                </span>
              </div>
            </div>
            <p className="intro">
              PCB design calculators for stackups, signals, power and
              components. Inputs stay available while the app window is open,
              and result URLs are shareable.{' '}
              <Link to="/about">
                About PCB Planner <ExternalLink size={11} />
              </Link>
            </p>
            <p className="starter">
              <span className="starter-mark">↳</span> New here?{' '}
              <Link to="/impedance?type=microstrip&mode=se&mask=0&w=0.27&t=0.035&h=0.15&er=4.2&etch=0.0127&target=50">
                Try a 50 Ω microstrip example <ArrowRight size={13} />
              </Link>
              <span className="starter-detail">
                0.27 mm trace · 0.15 mm dielectric
              </span>
            </p>
            <div className="search-label">
              <label htmlFor="home-search">Find a tool or guide</label>
              <span>
                Press <kbd>/</kbd> to search
              </span>
            </div>
            <div className="search-box">
              <Search size={18} />
              <Input
                id="home-search"
                ref={searchRef}
                type="search"
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setQuery('');
                    e.currentTarget.blur();
                  }
                }}
                placeholder="Try impedance, via current, USB, buck…"
                aria-controls={words.length ? 'search-results' : undefined}
              />
              {query && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="clear-search"
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery('');
                    searchRef.current?.focus();
                  }}
                >
                  <X size={14} />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        {words.length ? (
          <Card id="search-results">
            <Heading
              action={
                <span className="section-meta" role="status" aria-live="polite">
                  {toolMatches.length} tools · {guideMatches.length} guides
                </span>
              }
            >
              Search results
            </Heading>
            {!toolMatches.length && !guideMatches.length && (
              <div className="empty-state">
                <Search size={28} />
                <h3>No matching tools or guides</h3>
                <p>
                  Try a broader term, or{' '}
                  <Link to="/tools">browse all tools</Link>.
                </p>
                <Button variant="outline" onClick={() => setQuery('')}>
                  Clear search
                </Button>
              </div>
            )}
            {toolMatches.length > 0 && (
              <>
                <h3 className="result-heading">Tools</h3>
                <div className="result-grid">
                  {toolMatches.map((t) => (
                    <Link className="result-item" to={t.path} key={t.path}>
                      <div className="result-title">
                        <CategoryIcon
                          group={t.group}
                          color={GROUP_COLORS[t.group]}
                        />
                        <h4>{t.nav}</h4>
                        <ArrowRight size={14} />
                      </div>
                      <span className="result-type">{t.group}</span>
                      <p>{t.summary}</p>
                    </Link>
                  ))}
                </div>
              </>
            )}
            {guideMatches.length > 0 && (
              <>
                <h3 className="result-heading">Guides</h3>
                <div className="result-grid">
                  {guideMatches.map((g) => (
                    <Link className="result-item" to={g.path} key={g.path}>
                      <div className="result-title">
                        <BookOpen size={16} />
                        <h4>{g.title}</h4>
                        <ArrowRight size={14} />
                      </div>
                      <span className="result-type">Guide</span>
                      <p>{g.description}</p>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </Card>
        ) : (
          <>
            <Card className="news-card">
              <Heading
                action={<span className="section-meta">Latest update</span>}
              >
                What's new
              </Heading>
              {NEWS.slice(0, 3).map((item) => (
                <div className="news-item" key={item.title}>
                  <div className="news-icon">
                    <Check size={17} />
                  </div>
                  <div>
                    <div className="news-title">
                      <h3>{item.title}</h3>
                      <time dateTime={item.date}>{newsDate(item.date)}</time>
                    </div>
                    <p>
                      {item.text}
                      {'links' in item &&
                        item.links?.map((link) => (
                          <Fragment key={link.to}>
                            {' '}
                            <Link to={link.to}>{link.label}</Link>
                          </Fragment>
                        ))}
                    </p>
                  </div>
                </div>
              ))}
            </Card>
            <Card>
              <Heading
                action={
                  <Link className="section-link" to="/tools">
                    All {TOOLS.length} tools <ArrowRight size={13} />
                  </Link>
                }
              >
                Quick access
              </Heading>
              <div className="quick-grid">
                {QUICK_TASKS.map((task) => (
                  <Link className="quick-task" to={task.path} key={task.path}>
                    <div className="task-icon">
                      <CategoryIcon
                        group={task.group}
                        color={GROUP_COLORS[task.group]}
                        size={20}
                      />
                    </div>
                    <div className="task-text">
                      <h3>{task.action}</h3>
                      <p>{task.detail}</p>
                    </div>
                    <ArrowRight size={15} />
                  </Link>
                ))}
              </div>
            </Card>
            <section
              className="categories-section"
              aria-labelledby="categories-heading"
            >
              <div className="outside-heading">
                <h2 id="categories-heading">Browse by category</h2>
                <span className="section-meta">
                  {GROUPS.length} disciplines
                </span>
              </div>
              <div className="category-grid">
                {GROUPS.map((group) => {
                  const entries = TOOLS.filter((t) => t.group === group);
                  return (
                    <Card className="category-card" key={group}>
                      <Link
                        className="category-link"
                        to={'/tools?group=' + encodeURIComponent(group)}
                      >
                        <div className="category-icon">
                          <CategoryIcon
                            group={group}
                            color={GROUP_COLORS[group]}
                            size={21}
                          />
                        </div>
                        <div className="category-text">
                          <h3>{group}</h3>
                          <p>
                            {entries
                              .slice(0, 3)
                              .map((t) => t.nav)
                              .join(' / ')}
                          </p>
                        </div>
                        <Badge variant="outline" className="category-count">
                          {entries.length}
                        </Badge>
                        <ChevronRight size={13} />
                      </Link>
                    </Card>
                  );
                })}
              </div>
            </section>
            <Card>
              <Heading
                action={
                  <Link className="section-link" to="/guides">
                    All guides <ArrowRight size={13} />
                  </Link>
                }
              >
                Recent guides
              </Heading>
              <div className="guide-grid">
                {RECENT_GUIDES.map((g) => (
                  <Link className="guide-card" key={g.path} to={g.path}>
                    <div className="guide-category">
                      <BookOpen size={14} />
                      <span>{g.category}</span>
                    </div>
                    <h3>{g.title}</h3>
                    <p>{g.description}</p>
                    <div className="guide-footer">
                      <ArrowRight size={15} />
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          </>
        )}
        <div className="content-footer">
          <span>PCB Planner · Engineering tools, in your browser.</span>
          <Link to="/about">
            About <ExternalLink size={11} />
          </Link>
        </div>
      </div>
      {statusEl &&
        createPortal(
          <span>
            {TOOLS.length} tools · {PRESETS.length} stackups
          </span>,
          statusEl,
        )}
    </>
  );
}
