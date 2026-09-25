import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useDocumentMeta } from '../components/ToolPage';
import { APP_NAME } from '../config';
import { PRESETS } from '../lib/stackups';
import { useShell } from '../state/shell';
import { GUIDES } from '../guides/registry';
import { GROUP_COLORS, GROUPS, TOOLS } from './registry';

const QUICK_TASKS = [
  { path: '/impedance', action: 'Calculate trace impedance', detail: 'Single-ended and differential traces' },
  { path: '/stackup-advisor', action: 'Choose a PCB stackup', detail: 'Filter by layers, thickness and routing needs' },
  { path: '/trace-width', action: 'Size a power trace', detail: 'Current, temperature rise and voltage drop' },
  { path: '/via', action: 'Check a via', detail: 'Current, resistance and parasitics' },
  { path: '/schematic', action: 'Plan a schematic', detail: 'Power tree, component values and interface checks' },
  { path: '/units', action: 'Convert units', detail: 'Copper weight, length, power and more' },
];
const RECENT_GUIDES = [...GUIDES].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
const HOME_SEARCH_KEY = 'pcbplanner:home-search';

export default function Home() {
  useDocumentMeta(
    'PCB impedance, stackup and design calculators',
    'Impedance field solver, stackup advisor, layer stack manager, trace width, via, thermal, crosstalk, PDN and electronics calculators for PCB design. Runs in the browser.',
  );
  const { statusEl } = useShell();
  const [query, setQuery] = useState(() => {
    try { return sessionStorage.getItem(HOME_SEARCH_KEY) ?? ''; } catch { return ''; }
  });
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try {
      if (query) sessionStorage.setItem(HOME_SEARCH_KEY, query);
      else sessionStorage.removeItem(HOME_SEARCH_KEY);
    } catch { /* storage unavailable */ }
  }, [query]);
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.altKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const toolMatches = words.length ? TOOLS.filter(tool => {
    const text = `${tool.nav} ${tool.title} ${tool.group} ${tool.summary}`.toLowerCase();
    return words.every(word => text.includes(word));
  }) : [];
  const guideMatches = words.length ? GUIDES.filter(guide => {
    const text = `${guide.title} ${guide.seoTitle} ${guide.description}`.toLowerCase();
    return words.every(word => text.includes(word));
  }) : [];

  return (
    <div className="p-3">
      <section className="border border-line bg-sheet">
        <div className="flex h-[24px] items-center bg-panel-head px-2 font-semibold">Home</div>
        <div className="px-4 py-3">
          <h1 className="text-[18px] font-semibold">{APP_NAME}</h1>
          <p className="mt-1 max-w-[95ch] text-muted">PCB design calculators for stackups, signals, power and components. Inputs stay available while this app window is open, and result URLs are shareable. <Link to="/about">About PCB Planner</Link></p>
          <label className="mt-3 block max-w-[560px]">
            <span className="mb-1 flex items-center justify-between font-semibold"><span>Find a tool or guide</span><span className="hidden font-normal text-faint sm:inline">Press / to search</span></span>
            <input ref={searchRef} className="fld w-full" style={{ height: 32 }} type="search" value={query} onChange={event => setQuery(event.target.value)}
              onKeyDown={event => { if (event.key === 'Escape') { setQuery(''); event.currentTarget.blur(); } }}
              placeholder="Try impedance, via current, USB, buck..." />
          </label>
        </div>
      </section>

      {words.length ? <section id="home-search-results" className="mt-3 border border-line bg-sheet">
        <h2 className="flex h-[24px] items-center justify-between bg-panel-head px-2 font-semibold"><span>Search results</span><span role="status" aria-live="polite" className="font-normal text-muted">{toolMatches.length} {toolMatches.length === 1 ? 'tool' : 'tools'} · {guideMatches.length} {guideMatches.length === 1 ? 'guide' : 'guides'}</span></h2>
        {toolMatches.length > 0 && <>
          <h3 className="border-t border-line px-3 py-1.5 font-semibold">Tools</h3>
          <ul className="grid md:grid-cols-2 2xl:grid-cols-3">
            {toolMatches.map(tool => <li key={tool.path} className="border-t border-line md:border-r">
              <Link to={tool.path} className="block h-full px-3 py-2 no-underline hover:bg-hover">
                <div className="font-semibold text-accent-ink">{tool.nav}</div>
                <div className="text-faint">{tool.group}</div>
                <div className="mt-0.5 line-clamp-2 text-muted">{tool.summary}</div>
              </Link>
            </li>)}
          </ul>
        </>}
        {guideMatches.length > 0 && <>
          <h3 className="border-t border-line px-3 py-1.5 font-semibold">Guides</h3>
          <ul className="grid md:grid-cols-2 2xl:grid-cols-3">
            {guideMatches.map(guide => <li key={guide.path} className="border-t border-line md:border-r">
              <Link to={guide.path} className="block h-full px-3 py-2 no-underline hover:bg-hover">
                <div className="font-semibold text-accent-ink">{guide.title}</div>
                <div className="text-faint">Guide · {guide.minutes} min read</div>
                <div className="mt-0.5 line-clamp-2 text-muted">{guide.description}</div>
              </Link>
            </li>)}
          </ul>
        </>}
        {!toolMatches.length && !guideMatches.length && <p className="px-3 py-3 text-muted">No matching tools or guides. Try a broader term, <Link to="/tools">browse all tools</Link> or <Link to="/guides">browse all guides</Link>.</p>}
      </section> : <>
        <section className="mt-3 border border-line bg-sheet">
          <h2 className="flex h-[24px] items-center justify-between bg-panel-head px-2 font-semibold"><span>Quick access</span><Link to="/tools" className="font-normal">All {TOOLS.length} tools →</Link></h2>
          <ul className="grid sm:grid-cols-2 xl:grid-cols-3">
            {QUICK_TASKS.map(task => <li key={task.path} className="border-t border-line sm:border-r">
              <Link to={task.path} className="block h-full px-3 py-2.5 no-underline hover:bg-hover">
                <div className="font-semibold text-accent-ink">{task.action}</div>
                <div className="mt-0.5 text-muted">{task.detail}</div>
              </Link>
            </li>)}
          </ul>
        </section>

        <section className="mt-3">
          <h2 className="mb-2 font-semibold">Browse by category</h2>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {GROUPS.map(group => <Link key={group} to={`/tools?group=${encodeURIComponent(group)}`} className="flex min-h-[66px] items-center gap-2.5 border border-line bg-sheet px-3 py-2 no-underline hover:bg-hover">
              <span className="h-3 w-3 shrink-0 border border-black/30" style={{ background: GROUP_COLORS[group] }} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-accent-ink">{group}</span>
                <span className="block truncate text-muted">{TOOLS.filter(tool => tool.group === group).slice(0, 3).map(tool => tool.nav).join(' / ')}</span>
              </span>
              <span className="text-faint">{TOOLS.filter(tool => tool.group === group).length}</span>
            </Link>)}
          </div>
        </section>

        <section className="mt-3 border border-line bg-sheet">
          <h2 className="flex h-[24px] items-center justify-between bg-panel-head px-2 font-semibold"><span>Recent guides</span><Link to="/guides" className="font-normal">All guides →</Link></h2>
          <ul className="grid md:grid-cols-2 2xl:grid-cols-3">
            {RECENT_GUIDES.map(guide => <li key={guide.path} className="border-t border-line md:border-r">
              <Link to={guide.path} className="block h-full px-3 py-2 no-underline hover:bg-hover">
                <div className="font-semibold text-accent-ink">{guide.title}</div>
                <div className="mt-0.5 line-clamp-2 text-muted">{guide.description}</div>
                <div className="mt-0.5 text-faint">{guide.minutes} min read</div>
              </Link>
            </li>)}
          </ul>
        </section>
      </>}
      {statusEl && createPortal(<span>{TOOLS.length} tools · {PRESETS.length} stackups</span>, statusEl)}
    </div>
  );
}
