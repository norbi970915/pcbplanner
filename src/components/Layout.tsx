import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { APP_NAME } from '../config';
import { useSettings } from '../state/settings';
import { ShellContext, type ToolActions } from '../state/shell';
import { GROUP_COLORS, GROUPS, TOOLS, toolByPath } from '../tools/registry';

const TABS_KEY = 'pcbtk-tabs';
const PANELS_KEY = 'pcbtk-panels';

function readJson<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

const Swatch = ({ color }: { color: string }) => <span className="inline-block h-[9px] w-[9px] shrink-0 border border-black/30" style={{ background: color }} />;

/* ------------------------------ menu bar ------------------------------ */
function Menu({ label, open, onOpen, onHover, children }: { label: string; open: boolean; onOpen: () => void; onHover: () => void; children: ReactNode }) {
  return (
    <div className="relative">
      <button type="button" className={`h-[26px] px-2.5 ${open ? 'bg-sel' : 'hover:bg-chrome-2'}`} onClick={onOpen} onMouseEnter={onHover} aria-haspopup="menu" aria-expanded={open}>
        {label}
      </button>
      {open && (
        <div className="menu left-0 top-[26px]" role="menu">
          {children}
        </div>
      )}
    </div>
  );
}
function Item({ children, onClick, checked, hint }: { children: ReactNode; onClick: () => void; checked?: boolean; hint?: string }) {
  return (
    <button type="button" role="menuitem" className="menu-item relative" onClick={onClick}>
      {checked !== undefined && <span className="absolute left-2 text-accent-ink">{checked ? '✓' : ''}</span>}
      <span>{children}</span>
      {hint && <span className="text-faint">{hint}</span>}
    </button>
  );
}

/* ------------------------------ layout ------------------------------ */
export function Layout() {
  const { unit, setUnit, theme, setTheme } = useSettings();
  const loc = useLocation();
  const navigate = useNavigate();
  const [menu, setMenu] = useState<string | null>(null);
  const [panels, setPanels] = useState(() => readJson(PANELS_KEY, { tools: true, props: true }));
  const [tabs, setTabs] = useState<string[]>(() => readJson(TABS_KEY, ['/', '/impedance']));
  const [propsEl, setPropsEl] = useState<HTMLElement | null>(null);
  const [statusEl, setStatusEl] = useState<HTMLElement | null>(null);
  const actions = useRef<ToolActions | null>(null);
  const setActions = useCallback((a: ToolActions | null) => {
    actions.current = a;
  }, []);
  const barRef = useRef<HTMLDivElement>(null);

  // keep a tab for every visited tool
  const path = loc.pathname;
  const known = path === '/' || !!toolByPath(path);
  useEffect(() => {
    if (!known) return;
    setTabs((t) => (t.includes(path) ? t : [...t, path]));
  }, [path, known]);
  useEffect(() => writeJson(TABS_KEY, tabs), [tabs]);
  useEffect(() => writeJson(PANELS_KEY, panels), [panels]);

  // close menus on outside click / Escape
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const run = (fn: () => void) => () => {
    setMenu(null);
    fn();
  };
  const closeTab = (p: string) => {
    const i = tabs.indexOf(p);
    const next = tabs.filter((t) => t !== p);
    setTabs(next);
    if (p === path) navigate(next[Math.max(0, i - 1)] ?? '/');
  };
  const shell = useMemo(() => ({ propsEl, statusEl, setActions }), [propsEl, statusEl, setActions]);
  const tabTitle = (p: string) => (p === '/' ? 'Home' : toolByPath(p)?.nav ?? p);
  const tabColor = (p: string) => (p === '/' ? '#8a8a8a' : GROUP_COLORS[toolByPath(p)?.group ?? ''] ?? '#8a8a8a');

  const menuProps = (name: string) => ({
    label: name,
    open: menu === name,
    onOpen: () => setMenu((m) => (m === name ? null : name)),
    onHover: () => menu && setMenu(name),
  });

  return (
    <ShellContext.Provider value={shell}>
      <div className="flex h-full flex-col">
        {/* menu bar */}
        <div ref={barRef} className="flex h-[26px] shrink-0 items-center border-b border-line bg-chrome">
          <Link to="/" className="flex h-full items-center gap-1.5 px-2.5 text-ink no-underline" title={`${APP_NAME} – pcbplanner.com`}>
            <img src="/favicon.svg" width="16" height="16" alt="" />
            <span className="font-semibold">
              <span className="text-[var(--copper)]">pcb</span>planner
            </span>
          </Link>
          <Menu {...menuProps('File')}>
            <Item onClick={run(() => navigator.clipboard?.writeText(window.location.href))} hint="Ctrl+L">
              Copy Link to Inputs
            </Item>
            <Item onClick={run(() => actions.current?.reset?.())}>Reset Inputs</Item>
            <div className="menu-sep" />
            <Item onClick={run(() => window.print())} hint="Ctrl+P">
              Print…
            </Item>
          </Menu>
          <Menu {...menuProps('View')}>
            <Item checked={theme === 'dark'} onClick={run(() => setTheme('dark'))}>
              Dark Gray Theme
            </Item>
            <Item checked={theme === 'light'} onClick={run(() => setTheme('light'))}>
              Light Gray Theme
            </Item>
            <Item checked={theme === 'system'} onClick={run(() => setTheme('system'))}>
              System Theme
            </Item>
            <div className="menu-sep" />
            <Item checked={unit === 'mm'} onClick={run(() => setUnit('mm'))}>
              Metric (mm)
            </Item>
            <Item checked={unit === 'mil'} onClick={run(() => setUnit('mil'))}>
              Imperial (mil)
            </Item>
            <div className="menu-sep" />
            <Item checked={panels.tools} onClick={run(() => setPanels((p: typeof panels) => ({ ...p, tools: !p.tools })))}>
              Tools Panel
            </Item>
            <Item checked={panels.props} onClick={run(() => setPanels((p: typeof panels) => ({ ...p, props: !p.props })))}>
              Properties Panel
            </Item>
          </Menu>
          <Menu {...menuProps('Tools')}>
            {GROUPS.map((g, gi) => (
              <div key={g}>
                {gi > 0 && <div className="menu-sep" />}
                <div className="px-3 py-0.5 text-[11px] text-faint">{g}</div>
                {TOOLS.filter((t) => t.group === g).map((t) => (
                  <Item key={t.path} onClick={run(() => navigate(t.path))}>
                    {t.nav}
                  </Item>
                ))}
              </div>
            ))}
          </Menu>
          <Menu {...menuProps('Help')}>
            <Item onClick={run(() => document.getElementById('method')?.scrollIntoView({ behavior: 'smooth' }))}>Method &amp; References</Item>
            <Item onClick={run(() => navigate('/'))}>About {APP_NAME}</Item>
          </Menu>
        </div>

        {/* document tabs */}
        <div className="flex h-[26px] shrink-0 items-end gap-px overflow-x-auto border-b border-line bg-chrome px-1" role="tablist" aria-label="Open tools">
          {tabs.map((t) => {
            const active = t === path;
            return (
              <div
                key={t}
                role="tab"
                aria-selected={active}
                className={`group flex h-[23px] shrink-0 cursor-pointer items-center gap-1.5 border border-b-0 pl-2 pr-1 ${
                  active ? 'border-line bg-[var(--tab-active)] text-ink' : 'border-transparent text-muted hover:bg-chrome-2'
                }`}
                style={active ? { boxShadow: `inset 0 2px 0 ${tabColor(t)}` } : undefined}
                onClick={() => navigate(t)}
                onAuxClick={(e) => e.button === 1 && closeTab(t)}
              >
                <Swatch color={tabColor(t)} />
                <span>{tabTitle(t)}</span>
                <button
                  type="button"
                  aria-label={`Close ${tabTitle(t)}`}
                  className={`ml-1 grid h-4 w-4 place-items-center text-[10px] hover:bg-btn-hover ${active ? '' : 'opacity-0 group-hover:opacity-100'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(t);
                  }}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>

        {/* workspace */}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {panels.tools && (
            <aside className="hidden w-[200px] shrink-0 flex-col border-r border-line bg-panel lg:flex">
              <div className="flex h-[24px] items-center border-b border-line bg-panel-head px-2 font-semibold">Tools</div>
              <nav className="min-h-0 flex-1 overflow-y-auto py-1" aria-label="Tools">
                {GROUPS.map((g) => (
                  <div key={g} className="mb-1">
                    <div className="flex items-center gap-1.5 px-2 py-[3px] font-semibold">
                      <span className="text-[9px] text-muted">▼</span>
                      <Swatch color={GROUP_COLORS[g]} />
                      {g}
                    </div>
                    {TOOLS.filter((t) => t.group === g).map((t) => (
                      <Link
                        key={t.path}
                        to={t.path}
                        className={`block py-[3px] pl-[34px] pr-2 no-underline ${t.path === path ? 'bg-sel text-ink' : 'text-ink hover:bg-hover'}`}
                      >
                        {t.nav}
                      </Link>
                    ))}
                  </div>
                ))}
              </nav>
            </aside>
          )}

          {/* on narrow screens the properties panel sits above the document */}
          {panels.props && (
            <aside className="order-first flex max-h-[45vh] shrink-0 flex-col border-b border-line bg-panel lg:order-last lg:max-h-none lg:w-[300px] lg:border-b-0 lg:border-l">
              <div className="flex h-[24px] shrink-0 items-center justify-between border-b border-line bg-panel-head px-2 font-semibold">
                Properties
                <span className="font-normal text-faint">{path === '/' ? '' : toolByPath(path)?.nav}</span>
              </div>
              <div ref={setPropsEl} className="min-h-0 flex-1 overflow-y-auto" />
            </aside>
          )}

          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-doc">
            <Suspense fallback={<div className="p-4 text-muted">Loading…</div>}>
              <Outlet />
            </Suspense>
          </main>
        </div>

        {/* status bar */}
        <div className="flex h-[22px] shrink-0 items-center gap-3 border-t border-line bg-chrome px-2 text-muted">
          <div ref={setStatusEl} className="min-w-0 flex-1 truncate" />
          <button type="button" className="hover:text-ink" onClick={() => setUnit(unit === 'mm' ? 'mil' : 'mm')} title="Toggle default unit">
            Units: {unit}
          </button>
          <span className="hidden sm:inline">Theme: {theme === 'dark' ? 'Dark Gray' : theme === 'light' ? 'Light Gray' : 'System'}</span>
          <button type="button" className="hover:text-ink" onClick={() => setMenu('View')}>
            Panels
          </button>
        </div>
      </div>
    </ShellContext.Provider>
  );
}
