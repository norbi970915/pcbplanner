import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { CategoryIcon } from '../components/CategoryIcon';
import { FeaturedTools } from '../components/FeaturedTools';
import { useDocumentMeta } from '../lib/useDocumentMeta';
import { APP_NAME } from '../config';
import {
  Search,
  ArrowRight,
  X,
  BookOpen,
  Check,
  ExternalLink,
  ChevronRight,
  FolderPlus,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '../components/shadcn/card';
import { Button } from '../components/shadcn/button';
import { Input } from '../components/shadcn/input';
import { Badge } from '../components/shadcn/badge';
import { NEWS } from '../data/news';
import { useShell } from '../state/shell';
import { CreateProjectDialog } from '../components/CreateProjectDialog';
import { GUIDES } from '../guides/registry';
import { searchEntries, type SearchEntry } from '../lib/siteSearch';
import { GROUP_COLORS, GROUPS, TOOLS } from './registry';

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
function HomeProjectStart() {
  const navigate = useNavigate();

  return (
    <section className="home-project-start" aria-labelledby="home-project-heading">
      <FolderPlus className="home-project-icon" size={22} aria-hidden="true" />
      <div className="home-project-copy">
        <h2 id="home-project-heading">Keep your board calculations together</h2>
        <p>Save calculator inputs in a project and reopen them in this browser, even after closing it. No account needed.</p>
        <div className="home-project-actions">
          <CreateProjectDialog onCreated={() => navigate('/projects')}>
            <Button size="sm"><FolderPlus size={15} />Create a project</Button>
          </CreateProjectDialog>
          <Link to="/projects">Your projects<ArrowRight size={13} /></Link>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  useDocumentMeta(
    'PCB impedance, stackup and design calculators',
    'PCB design calculators: impedance field solver, stackup advisor, trace width, via, thermal, crosstalk, PDN and electronics tools. Runs in your browser.',
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
        (target.closest('[role="dialog"]') ||
          target.isContentEditable ||
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
  const entries: SearchEntry[] = [
    ...TOOLS.map(tool => ({ path: tool.path, title: tool.title, description: tool.summary, kind: 'Tool' as const, group: tool.group, keywords: tool.nav })),
    ...GUIDES.map(guide => ({ path: guide.path, title: guide.title, description: guide.description, kind: 'Guide' as const, group: guide.category, keywords: guide.seoTitle })),
  ];
  const matches = searchEntries(entries, query);
  const toolMatches = matches.filter(entry => entry.kind === 'Tool').map(entry => TOOLS.find(tool => tool.path === entry.path)!);
  const guideMatches = matches.filter(entry => entry.kind === 'Guide').map(entry => GUIDES.find(guide => guide.path === entry.path)!);

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
            </div>
            <p className="intro">
              PCB design calculators for stackups, signals, power and
              components. Share a calculation by link, or save your setups
              together in a project.{' '}
              <Link to="/about">
                About PCB Planner <ExternalLink size={11} />
              </Link>
            </p>
            <HomeProjectStart />
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
          {!words.length && (
            <section className="welcome-news" aria-labelledby="home-news-heading">
              <div className="welcome-news-heading">
                <h2 id="home-news-heading">What's new</h2>
                <span className="section-meta">Latest update</span>
              </div>
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
            </section>
          )}
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
            <FeaturedTools />
            <section
              className="categories-section"
              aria-labelledby="categories-heading"
            >
              <div className="outside-heading">
                <h2 id="categories-heading">Browse by category</h2>
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
      {statusEl && createPortal(<span>Home</span>, statusEl)}
    </>
  );
}
