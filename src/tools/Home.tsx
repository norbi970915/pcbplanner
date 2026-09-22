import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useDocumentMeta } from '../components/ToolPage';
import { APP_NAME } from '../config';
import { PRESETS } from '../lib/stackups';
import { useShell } from '../state/shell';
import { GROUP_COLORS, GROUPS, TOOLS } from './registry';

export default function Home() {
  useDocumentMeta(
    'PCB design calculators with a field solver',
    'Impedance field solver, stackup advisor, layer stack manager, trace width, via, thermal, crosstalk, PDN and electronics calculators for PCB design. Runs in the browser.',
  );
  const { propsEl, statusEl } = useShell();
  return (
    <div className="p-3">
      <div className="border border-line bg-sheet">
        <div className="flex h-[24px] items-center bg-panel-head px-2 font-semibold">Home</div>
        <div className="px-4 py-3">
          <h1 className="text-[18px] font-semibold">{APP_NAME}</h1>
          <p className="mt-1 max-w-[95ch] text-muted">
            Calculators for printed circuit board design. The impedance and crosstalk tools use a 2D field solver rather than approximate formulas, and the stackup advisor designs every line
            on {PRESETS.length} fabricator stackups to recommend one. Every input is kept in the URL, so any result can be shared as a link. Nothing to install; your data stays in your
            browser.
          </p>
        </div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {GROUPS.map((g) => (
          <section key={g} className="border border-line bg-sheet">
            <h2 className="flex h-[24px] items-center gap-1.5 bg-panel-head px-2 font-semibold">
              <span className="inline-block h-[9px] w-[9px] border border-black/30" style={{ background: GROUP_COLORS[g] }} />
              {g}
            </h2>
            <ul>
              {TOOLS.filter((t) => t.group === g).map((t) => (
                <li key={t.path} className="border-t border-line first:border-t-0">
                  <Link to={t.path} className="block px-2.5 py-1.5 no-underline hover:bg-hover">
                    <div className="font-semibold text-accent-ink">{t.nav}</div>
                    <div className="text-muted">{t.summary}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {propsEl &&
        createPortal(
          <div className="space-y-2 p-2 text-muted">
            <p>Select a tool from the Tools panel, the Tools menu or the list.</p>
            <p>Each tool puts its inputs here, in the Properties panel, and its results in the document area.</p>
          </div>,
          propsEl,
        )}
      {statusEl && createPortal(<span>{TOOLS.length} tools · {PRESETS.length} stackups</span>, statusEl)}
    </div>
  );
}
