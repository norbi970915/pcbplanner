import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
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
  Compass,
  CircuitBoard,
  Layers,
  Files,
  Calculator,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '../components/shadcn/card';
import { Button } from '../components/shadcn/button';
import { Input } from '../components/shadcn/input';
import { Badge } from '../components/shadcn/badge';
import { NEWS } from '../data/news';
import { useShell } from '../state/shell';
import { GUIDES } from '../guides/registry';
import { searchEntries, type SearchEntry } from '../lib/siteSearch';
import { GROUP_COLORS, GROUPS, TOOLS } from './registry';

const RECENT_GUIDES = [...GUIDES]
  .sort((a, b) => b.date.localeCompare(a.date))
  .slice(0, 3);
const HOME_SEARCH_KEY = 'pcbplanner:home-search';
const HOME_TASKS = [
  { title: 'Check a KiCad board', to: '/kicad-project', description: 'Review routing, voltage drop, temperature and clearance.', icon: CircuitBoard, group: 'Stackup' },
  { title: 'Design a stackup', to: '/stackup', description: 'Choose layers, materials and impedance targets.', icon: Layers, group: 'Stackup' },
  { title: 'Inspect Gerbers', to: '/gerber-viewer', description: 'Inspect copper layers and compare board revisions.', icon: Files, group: 'Utilities' },
  { title: 'Find a calculator', to: '/tools', description: 'Browse tools for signals, power and components.', icon: Calculator, group: 'Electronics' },
] as const;
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
    'PCB design calculators: impedance field solver, stackup advisor, trace width, via, thermal, crosstalk, PDN and electronics tools. Runs in your browser.',
  );
  const { statusEl, openGuidance } = useShell();
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
            <div className="home-start-header">
              <div>
                <div className="eyebrow">YOUR PCB DESIGN WORKBENCH</div>
                <h1>
                  {APP_NAME}
                  <span className="title-dot">.</span>
                </h1>
                <p className="intro">Plan a stackup, review your board, or find the calculation you need.</p>
              </div>
              <div className="home-find">
                <div className="search-label">
                  <label htmlFor="home-search">Find a tool or guide</label>
                  <span>Press <kbd>/</kbd> to search</span>
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
                <div className="home-guidance-invitation">
                  <span>Not sure where to start?</span>
                  <Button type="button" variant="link" size="sm" onClick={openGuidance}>
                    <Compass size={15} aria-hidden="true" />Help me choose<ArrowRight size={13} aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </div>
            {!words.length && <>
              <nav className="home-task-grid" aria-label="Start a PCB task">
                {HOME_TASKS.map(task => <Link className="home-task" to={task.to} key={task.to}>
                  <task.icon size={22} aria-hidden="true" style={{ color: GROUP_COLORS[task.group] }} />
                  <h3>{task.title}</h3>
                  <p>{task.description}</p>
                  <span className="home-task-action">Get started <ArrowRight size={14} aria-hidden="true" /></span>
                </Link>)}
              </nav>
              <p className="home-local-note">KiCad and Gerber files stay in your browser. Both tools include an example to try.</p>
            </>}
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
            <Card className="welcome-news home-news" aria-labelledby="home-news-heading">
              <Heading action={<span className="section-meta">Latest updates</span>}><span id="home-news-heading">What's new</span></Heading>
              {NEWS.slice(0, 2).map(item => <div className="news-item" key={item.title}>
                <div className="news-icon"><Check size={17} aria-hidden="true" /></div>
                <div>
                  <div className="news-title"><h3>{item.title}</h3><time dateTime={item.date}>{newsDate(item.date)}</time></div>
                  <p>{item.text}{'links' in item && item.links?.map(link => <Fragment key={link.to}>{' '}<Link to={link.to}>{link.label}</Link></Fragment>)}</p>
                </div>
              </div>)}
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
