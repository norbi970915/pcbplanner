import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { GROUPS, TOOLS } from '../tools/registry';
import { useSettings, type Theme } from '../state/settings';
import { AdSlot, PartnerBox } from './Ads';
import { Segmented } from './ui';
import { APP_NAME } from '../config';



function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Tools" className="py-2">
      {GROUPS.map((g) => (
        <div key={g} className="mb-3">
          <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">{g}</div>
          {TOOLS.filter((t) => t.group === g).map((t) => (
            <NavLink
              key={t.path}
              to={t.path}
              onClick={onNavigate}
              className={({ isActive }) =>
                `block border-l-2 px-3 py-[5px] text-[13.5px] no-underline ${
                  isActive ? 'border-accent bg-sel font-medium text-ink' : 'border-transparent text-ink hover:bg-panel-2'
                }`
              }
            >
              {t.nav}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

export function Layout() {
  const { unit, setUnit, theme, setTheme } = useSettings();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();
  useEffect(() => setOpen(false), [loc.pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-panel">
        <div className="flex h-11 items-center gap-3 px-3">
          <button className="btn px-2 lg:hidden" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            ☰
          </button>
          <Link to="/" className="flex items-baseline gap-2 text-ink no-underline">
            <span className="text-[15px] font-bold tracking-tight">{APP_NAME}</span>
            <span className="hidden text-[12px] text-muted sm:inline">calculators for PCB design</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Segmented label="Default length unit" value={unit} onChange={setUnit} options={[{ value: 'mm', label: 'mm' }, { value: 'mil', label: 'mil' }]} />
            <select className="fld hidden sm:block" aria-label="Theme" value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
              <option value="system">System theme</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-[210px] shrink-0 border-r border-line bg-panel lg:block">
          <div className="sticky top-11 max-h-[calc(100vh-44px)] overflow-y-auto">
            <Sidebar />
          </div>
        </aside>
        {open && (
          <div className="fixed inset-0 top-11 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)}>
            <div className="h-full w-[240px] overflow-y-auto border-r border-line bg-panel" onClick={(e) => e.stopPropagation()}>
              <Sidebar onNavigate={() => setOpen(false)} />
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1 px-3 py-4 sm:px-5">
          <div className="mb-3 lg:hidden">
            <select className="fld w-full" aria-label="Choose a tool" value={loc.pathname} onChange={(e) => navigate(e.target.value)}>
              <option value="/">All tools</option>
              {TOOLS.map((t) => (
                <option key={t.path} value={t.path}>
                  {t.nav}
                </option>
              ))}
            </select>
          </div>
          <Suspense fallback={<div className="p-6 text-muted">Loading…</div>}>
            <Outlet />
          </Suspense>
        </main>

        <aside className="hidden w-[300px] shrink-0 space-y-4 py-4 pr-4 2xl:block">
          <AdSlot slot="rail-300x250" />
          <PartnerBox />
          <AdSlot slot="rail-300x600" minHeight={600} />
        </aside>
      </div>

      <footer className="border-t border-line bg-panel px-4 py-3 text-[12px] text-muted">
        © {new Date().getFullYear()} {APP_NAME}. Results are engineering estimates. Verify critical designs with your fabricator.
      </footer>
    </div>
  );
}
