import { ResizablePropertiesPanel } from './ResizablePropertiesPanel';
import { MobileToolNavigation } from './MobileToolNavigation';
import { GlobalSearch } from './GlobalSearch';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Analytics, type BeforeSendEvent } from '@vercel/analytics/react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { APP_NAME } from '../config';
import { currentToolUrl } from '../lib/toolUrl';
import { Home, PanelLeft, Sun, Moon } from 'lucide-react';
import { Button } from './shadcn/button';
import { Badge } from './shadcn/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
} from './shadcn/dropdown-menu';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from './shadcn/sheet';
import { ToolsNavigation } from './ToolsNavigation';
import { GUIDES } from '../guides/registry';
import {
  ANALYTICS_CONSENT_KEY,
  disableAnalytics,
  enableAnalytics,
  isAnalyticsHost,
  readAnalyticsChoice,
  saveAnalyticsChoice,
  type AnalyticsChoice,
} from '../lib/analytics';
import { useInstall, useOnline } from '../lib/pwa';
import { ErrorBoundary } from './ErrorBoundary';
import { CategoryIcon } from './CategoryIcon';
import { useSettings } from '../state/settings';
import { ShellContext, type ToolActions } from '../state/shell';
import { projectStore, useProjects } from '../state/projectStore';
import { GROUP_COLORS, GROUPS, TOOLS, toolByPath } from '../tools/registry';

const TABS_KEY = 'pcbtk-tabs';
const PANELS_KEY = 'pcbtk-panels';

function beforeVercelSend(event: BeforeSendEvent): BeforeSendEvent | null {
  try {
    const url = new URL(event.url, window.location.origin);
    return { ...event, url: url.origin + url.pathname };
  } catch {
    return null;
  }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(sessionStorage.getItem(key) || 'null');
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, v: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

const Swatch = ({ color }: { color: string }) => (
  <span
    className="inline-block h-[9px] w-[9px] shrink-0 border border-black/30"
    style={{ background: color }}
  />
);

/* ------------------------------ menu bar ------------------------------ */
function Menu({
  label,
  open,
  onOpenChange,
  onHover,
  children,
}: {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onHover: () => void;
  children: ReactNode;
}) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="menu-trigger" onMouseEnter={onHover}>
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="application-menu"
        align="start"
        sideOffset={7}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
function Item({
  children,
  onClick,
  checked,
  hint,
}: {
  children: ReactNode;
  onClick: () => void;
  checked?: boolean;
  hint?: string;
}) {
  const content = (
    <>
      <span>{children}</span>
      {hint && <span className="menu-hint">{hint}</span>}
    </>
  );
  return checked === undefined ? (
    <DropdownMenuItem onSelect={onClick}>{content}</DropdownMenuItem>
  ) : (
    <DropdownMenuCheckboxItem checked={checked} onSelect={onClick}>
      {content}
    </DropdownMenuCheckboxItem>
  );
}
/* ------------------------------ layout ------------------------------ */
export function Layout() {
  const { unit, setUnit, theme, setTheme } = useSettings();
  const install = useInstall();
  const online = useOnline();
  const loc = useLocation();
  const navigate = useNavigate();
  const [menu, setMenu] = useState<string | null>(null);
  const [mobileTools, setMobileTools] = useState(false);
  const [panels, setPanels] = useState(() =>
    readJson(PANELS_KEY, { tools: true, props: true }),
  );
  const [tabs, setTabs] = useState<string[]>(() =>
    readJson(TABS_KEY, ['/', '/impedance']),
  );
  const [propsEl, setPropsEl] = useState<HTMLElement | null>(null);
  const [statusEl, setStatusEl] = useState<HTMLElement | null>(null);
  const [headEl, setHeadEl] = useState<HTMLElement | null>(null);
  const { projects, activeId } = useProjects();
  const activeProject = projects.find((p) => p.id === activeId);
  const [saved, setSaved] = useState<string | null>(null);
  const [analyticsChoice, setAnalyticsChoice] =
    useState<AnalyticsChoice | null>(readAnalyticsChoice);
  const [consentOpen, setConsentOpen] = useState(
    () => readAnalyticsChoice() === null,
  );
  const consentButtonRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const lastPageView = useRef<string | null>(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const actions = useRef<ToolActions | null>(null);
  const setActions = useCallback((a: ToolActions | null) => {
    actions.current = a;
  }, []);
  const barRef = useRef<HTMLDivElement>(null);

  // keep a tab for every visited tool
  const path = loc.pathname;
  useEffect(() => {
    if (analyticsChoice === 'accepted') return;
    disableAnalytics(analyticsChoice === 'declined');
    lastPageView.current = null;
  }, [analyticsChoice]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ANALYTICS_CONSENT_KEY && event.key !== null) return;
      const choice = readAnalyticsChoice();
      setAnalyticsChoice(choice);
      setConsentOpen(choice === null);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  useEffect(() => {
    if (consentOpen) consentButtonRef.current?.focus();
  }, [consentOpen]);
  useEffect(() => {
    // Query parameters contain calculator inputs, and change while typing.
    // Count route changes only; send a path-only location to Analytics.
    if (analyticsChoice !== 'accepted' || !enableAnalytics()) return;
    const timer = window.setTimeout(() => {
      const pageLocation = window.location.origin + path;
      if (lastPageView.current === pageLocation) return;
      const gtag = (window as Window & { gtag?: (...args: unknown[]) => void })
        .gtag;
      if (!gtag) return;
      const title =
        toolByPath(path)?.title ??
        GUIDES.find((guide) => guide.path === path)?.seoTitle ??
        (path === '/'
          ? 'PCB impedance, stackup and design calculators'
          : path === '/tools'
            ? 'All PCB Tools'
            : path === '/schematic'
              ? 'Schematic Design'
              : path === '/guides'
                ? 'PCB Design Guides'
                : path === '/about'
                  ? `About ${APP_NAME}`
                  : document.title);
      const pageTitle = title.endsWith(` – ${APP_NAME}`)
        ? title
        : `${title} – ${APP_NAME}`;
      let pageReferrer = lastPageView.current ?? document.referrer;
      if (pageReferrer) {
        try {
          const referrer = new URL(pageReferrer);
          if (referrer.origin === window.location.origin)
            pageReferrer = referrer.origin + referrer.pathname;
        } catch {
          /* preserve a browser-supplied referrer we cannot parse */
        }
      }
      gtag('set', { page_location: pageLocation, page_title: pageTitle });
      gtag('event', 'page_view', {
        page_location: pageLocation,
        page_title: pageTitle,
        page_referrer: pageReferrer,
      });
      lastPageView.current = pageLocation;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [path, analyticsChoice]);
  const known =
    path === '/' ||
    path === '/tools' ||
    path === '/schematic' ||
    !!toolByPath(path);
  // article pages (guides) have no inputs: no Properties panel
  const isDoc = path === '/guides' || path.startsWith('/guides/');
  useEffect(() => {
    if (!known) return;
    setTabs((t) => (t.includes(path) ? t : [...t, path]));
  }, [path, known]);
  useEffect(() => {
    writeJson(TABS_KEY, tabs);
  }, [tabs]);
  useEffect(() => {
    setSaved(null);
  }, [path]);
  useEffect(() => {
    writeJson(PANELS_KEY, panels);
  }, [panels]);

  const openReport = () => { setMenu(null); actions.current?.report?.(); };
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
  const chooseAnalytics = (choice: AnalyticsChoice) => {
    if (choice === 'declined') disableAnalytics(true);
    saveAnalyticsChoice(choice);
    setAnalyticsChoice(choice);
    setConsentOpen(false);
  };
  const tabId = (p: string) =>
    `tool-tab-${p === '/' ? 'home' : p.slice(1).replaceAll('/', '-')}`;
  const moveTabFocus = (current: string, key: string) => {
    const index = tabs.indexOf(current);
    const next =
      key === 'Home'
        ? tabs[0]
        : key === 'End'
          ? tabs[tabs.length - 1]
          : key === 'ArrowLeft'
            ? tabs[(index - 1 + tabs.length) % tabs.length]
            : tabs[(index + 1) % tabs.length];
    tabRefs.current.get(next)?.focus();
    navigate(next);
  };
  const showInputs = useCallback(() => setPanels(previous => ({ ...previous, props: true })), []);
  const shell = useMemo(
    () => ({ propsEl, statusEl, headEl, setActions, showInputs }),
    [propsEl, statusEl, headEl, setActions, showInputs],
  );
  const keyboardTab = tabs.includes(path) ? path : tabs[tabs.length - 1];
  const tabTitle = (p: string) =>
    p === '/'
      ? 'Home'
      : p === '/tools'
        ? 'All tools'
        : p === '/schematic'
          ? 'Schematic design'
          : (toolByPath(p)?.nav ?? p);
  const tabColor = (p: string) =>
    p === '/'
      ? '#8a8a8a'
      : (GROUP_COLORS[toolByPath(p)?.group ?? ''] ?? '#8a8a8a');

  const menuProps = (name: string) => ({
    label: name,
    open: menu === name,
    onOpenChange: (open: boolean) =>
      setMenu((current) => (open ? name : current === name ? null : current)),
    onHover: () => menu && setMenu(name),
  });

  return (
    <ShellContext.Provider value={shell}>
      <div className="app-shell flex h-full flex-col">
        <a className="skip-link" href="#tool-panel">
          Skip to content
        </a>
        {/* menu bar */}
        <div ref={barRef} className="menu-bar">
          <Link to="/" className="brand" title={`${APP_NAME} – pcbplanner.com`}>
            <img src="/favicon.svg?v=3" width="22" height="22" alt="" />
            <span className="font-semibold">
              <span className="text-[var(--copper)]">pcb</span>planner
            </span>
          </Link>
          <Sheet open={mobileTools} onOpenChange={setMobileTools}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="mobile-panel-toggle"
                aria-label="Open tools panel"
              >
                <PanelLeft size={16} />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="mobile-tools-sheet">
              <SheetHeader>
                <SheetTitle>Tools</SheetTitle>
                <SheetDescription>
                  Browse PCB design calculators and guides.
                </SheetDescription>
              </SheetHeader>
              <ToolsNavigation
                path={path}
                onNavigate={() => setMobileTools(false)}
              />
            </SheetContent>
          </Sheet>
          <Menu {...menuProps('File')}>
            <Item
              onClick={run(() =>
                navigator.clipboard?.writeText(currentToolUrl()),
              )}
              hint="Ctrl+L"
            >
              Copy Link to Inputs
            </Item>
            <Item onClick={run(() => actions.current?.reset?.())}>
              Reset Inputs
            </Item>
            <div className="menu-sep" />
            <Item
              onClick={run(() => {
                const tool = toolByPath(path);
                if (!tool) return;
                const id = activeId ?? projectStore.create('My board').id;
                projectStore.saveTool(id, path, new URL(currentToolUrl()).search.slice(1));
                setSaved(
                  `Saved to ${projects.find((x) => x.id === id)?.name ?? 'project'}`,
                );
              })}
            >
              Save Tool to Project
            </Item>
            <Item onClick={run(() => navigate('/projects'))}>Projects…</Item>
            <div className="menu-sep" />
            {!!toolByPath(path) && <Item onClick={openReport}>Calculation report...</Item>}
            <Item onClick={run(() => window.print())} hint="Ctrl+P">
              Print…
            </Item>
            {install && (
              <>
                <div className="menu-sep" />
                <Item onClick={run(install)}>Install as App…</Item>
              </>
            )}
          </Menu>
          <Menu {...menuProps('View')}>
            <Item
              checked={theme === 'dark'}
              onClick={run(() => setTheme('dark'))}
            >
              Dark Gray Theme
            </Item>
            <Item
              checked={theme === 'light'}
              onClick={run(() => setTheme('light'))}
            >
              Light Gray Theme
            </Item>
            <Item
              checked={theme === 'system'}
              onClick={run(() => setTheme('system'))}
            >
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
            <Item
              checked={panels.tools}
              onClick={run(() =>
                setPanels((p: typeof panels) => ({ ...p, tools: !p.tools })),
              )}
            >
              Tools Panel
            </Item>
            <Item
              checked={panels.props}
              onClick={run(() =>
                setPanels((p: typeof panels) => ({ ...p, props: !p.props })),
              )}
            >
              Properties Panel
            </Item>
          </Menu>
          <Menu {...menuProps('Tools')}>
            <Item onClick={run(() => navigate('/tools'))}>
              Browse all tools...
            </Item>
            <Item onClick={run(() => navigate('/schematic'))}>
              Schematic design...
            </Item>
            <div className="menu-sep" />
            {GROUPS.map((g, gi) => (
              <div key={g}>
                {gi > 0 && <div className="menu-sep" />}
                <div className="flex items-center gap-1.5 px-3 py-0.5 text-[11px] text-faint">
                  <CategoryIcon group={g} color={GROUP_COLORS[g]} size={14} />
                  {g}
                </div>
                {TOOLS.filter((t) => t.group === g).map((t) => (
                  <Item key={t.path} onClick={run(() => navigate(t.path))}>
                    {t.nav}
                  </Item>
                ))}
              </div>
            ))}
          </Menu>
          <Menu {...menuProps('Help')}>
            <Item
              onClick={run(() =>
                document
                  .getElementById('method')
                  ?.scrollIntoView({ behavior: 'smooth' }),
              )}
            >
              Method &amp; References
            </Item>
            <Item onClick={run(() => navigate('/guides'))}>Guides</Item>
            <Item onClick={run(() => navigate('/about'))}>
              About {APP_NAME}
            </Item>
            <div className="menu-sep" />
            <Item onClick={run(() => setConsentOpen(true))}>
              Analytics preferences
            </Item>
          </Menu>
          <Link
            to="/schematic"
            className={`hidden h-[26px] items-center px-2.5 text-ink no-underline hover:bg-chrome-2 sm:flex ${path === '/schematic' ? 'bg-sel' : ''}`}
          >
            Schematic
          </Link>
          <Link
            to="/guides"
            className={`flex h-[26px] items-center px-2.5 text-ink no-underline hover:bg-chrome-2 ${isDoc ? 'bg-sel' : ''}`}
          >
            Guides
          </Link>
          <div className="header-spacer" />
          <GlobalSearch />
          <Button
            variant="ghost"
            size="icon"
            className="theme-toggle"
            aria-label={
              'Switch to ' + (theme === 'light' ? 'dark' : 'light') + ' theme'
            }
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </Button>
        </div>

        {/* document tabs */}
        <div
          className="document-bar flex shrink-0 items-end gap-px overflow-x-auto border-b border-line bg-chrome px-2"
          role="tablist"
          aria-label="Open tools"
        >
          {tabs.map((t) => {
            const active = t === path;
            return (
              <div
                key={t}
                role="presentation"
                className={`document-tab group flex h-[29px] shrink-0 items-center gap-1.5 border border-b-0 pr-1 ${
                  active
                    ? 'border-line bg-[var(--tab-active)] text-ink'
                    : 'border-transparent text-muted hover:bg-chrome-2'
                }`}
                style={
                  active
                    ? { boxShadow: `inset 0 2px 0 ${tabColor(t)}` }
                    : undefined
                }
              >
                <button
                  ref={(node) => {
                    if (node) tabRefs.current.set(t, node);
                    else tabRefs.current.delete(t);
                  }}
                  type="button"
                  role="tab"
                  id={tabId(t)}
                  aria-selected={active}
                  aria-controls="tool-panel"
                  tabIndex={t === keyboardTab ? 0 : -1}
                  className="flex h-full items-center gap-1.5 pl-2 focus-visible:outline-1 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
                  onClick={() => navigate(t)}
                  onAuxClick={(event) => {
                    if (event.button === 1) closeTab(t);
                  }}
                  onKeyDown={(event) => {
                    if (
                      ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(
                        event.key,
                      )
                    ) {
                      event.preventDefault();
                      moveTabFocus(t, event.key);
                    }
                  }}
                >
                  {t === '/' ? (
                    <Home size={14} className="text-accent-ink" />
                  ) : (
                    <Swatch color={tabColor(t)} />
                  )}
                  <span>{tabTitle(t)}</span>
                </button>
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

        {/* workspace: on narrow screens one scrolling column (title, inputs, results); from lg up, docked panels */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          {panels.tools && (
            <aside className="tools-panel hidden shrink-0 flex-col border-r border-line bg-panel lg:flex">
              <div className="panel-heading">
                <span>Tools</span>
                <Badge variant="outline">{TOOLS.length}</Badge>
              </div>
              <ToolsNavigation path={path} />
              <div className="sidebar-footer">
                <span className="ready-dot" />
                Built for PCB design
              </div>
            </aside>
          )}

          {/* narrow screens: the tool's title goes above its inputs */}
          <div
            ref={setHeadEl}
            className="order-first shrink-0 bg-doc lg:hidden"
          />

          {!!toolByPath(path) && <MobileToolNavigation key={path} mainRef={mainRef} statusEl={statusEl} onShowInputs={showInputs}/>}

          {/* on narrow screens, calculator inputs sit above their results */}
          {path !== '/' &&
            path !== '/tools' &&
            path !== '/schematic' && (
              <ResizablePropertiesPanel
                className={`properties-panel ${panels.props ? "" : "properties-panel-is-hidden"} order-first shrink-0 flex-col border-b border-line bg-panel lg:order-last lg:border-b-0 lg:border-l ${isDoc ? 'hidden' : 'flex lg:flex'}`}
              >
                <div className="properties-heading flex h-[42px] shrink-0 items-center justify-between border-b border-line bg-panel-head px-2 font-semibold lg:h-[24px]">
                  <span>
                    Properties{' '}
                    <span className="hidden font-normal text-faint lg:inline">
                      {toolByPath(path)?.nav}
                    </span>
                  </span>

                </div>
                <div
                  ref={setPropsEl}
                  className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
                />
              </ResizablePropertiesPanel>
            )}

          <main
            ref={mainRef}
            id="tool-panel"
            role={known ? 'tabpanel' : undefined}
            aria-labelledby={known ? tabId(path) : undefined}
            className="min-w-0 shrink-0 bg-doc lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
          >
            <ErrorBoundary key={path}>
              <Suspense
                fallback={<div className="p-4 text-muted">Loading…</div>}
              >
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>

        {/* status bar */}
        <div className="status-bar flex shrink-0 items-center gap-3 border-t border-line bg-chrome px-3 text-muted">
          <div ref={setStatusEl} className="min-w-0 flex-1 truncate" />
          {!online && (
            <span title="No network connection: the calculators keep working from the saved copy">
              Offline
            </span>
          )}
          {(saved || activeProject) && (
            <Link
              to="/projects"
              className="hidden truncate text-muted no-underline hover:text-ink sm:inline"
              title="Projects"
            >
              {saved ?? `Project: ${activeProject?.name}`}
            </Link>
          )}
          <button
            type="button"
            className="hover:text-ink"
            onClick={() => setUnit(unit === 'mm' ? 'mil' : 'mm')}
            title="Toggle default unit"
          >
            Units: {unit}
          </button>
          <span className="hidden sm:inline">
            Theme:{' '}
            {theme === 'dark'
              ? 'Dark Gray'
              : theme === 'light'
                ? 'Light Gray'
                : 'System'}
          </span>
          <button
            type="button"
            className="hover:text-ink"
            onClick={() => setMenu('View')}
          >
            Panels
          </button>
        </div>
        {analyticsChoice === 'accepted' && isAnalyticsHost() && (
          <Analytics
            mode="production"
            route={path}
            path={path}
            beforeSend={beforeVercelSend}
          />
        )}
        {consentOpen && (
          <aside
            role="region"
            aria-labelledby="analytics-consent-title"
            className="fixed inset-x-0 bottom-0 z-50 border-t border-line-strong bg-chrome px-4 py-3 shadow-[0_-6px_24px_#0008]"
          >
            <div className="mx-auto flex max-w-[1100px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-[75ch]">
                <h2
                  id="analytics-consent-title"
                  className="font-semibold text-ink"
                >
                  Site analytics
                </h2>
                <p className="mt-1 text-muted">
                  May we use Google Analytics and Vercel Web Analytics to
                  measure visits and pages viewed? Google Analytics uses
                  cookies; Vercel Web Analytics does not. You can change your
                  choice under Help &gt; Analytics preferences.{' '}
                  <Link to="/about">How your data is used</Link>.
                </p>
                {analyticsChoice && (
                  <p className="mt-1 text-faint">
                    Current choice:{' '}
                    {analyticsChoice === 'accepted' ? 'accepted' : 'declined'}.
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  ref={consentButtonRef}
                  type="button"
                  className="btn h-[30px] flex-1 sm:flex-none"
                  onClick={() => chooseAnalytics('declined')}
                >
                  Decline
                </button>
                <button
                  type="button"
                  className="btn btn-primary h-[30px] flex-1 sm:flex-none"
                  onClick={() => chooseAnalytics('accepted')}
                >
                  Accept analytics
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>
    </ShellContext.Provider>
  );
}
