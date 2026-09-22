import { Link } from 'react-router-dom';
import { useDocumentMeta } from '../components/ToolPage';
import { APP_NAME } from '../config';
import { GROUPS, TOOLS } from './registry';

export default function Home() {
  useDocumentMeta('Free PCB design calculators', 'Impedance field solver, trace width and current, via, stackup, timing, skin effect and fusing current calculators for PCB design. Runs in the browser.');
  return (
    <div className="mx-auto max-w-[1000px]">
      <h1 className="text-[22px] font-bold tracking-tight">{APP_NAME}</h1>
      <p className="mt-1 max-w-[75ch] text-[14px] text-muted">
        Calculators for printed circuit board design. Impedance uses a 2D field solver rather than approximate formulas. Every tool keeps its inputs in the URL, so any result can be
        shared as a link. Nothing to install. Your data stays in your browser.
      </p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {GROUPS.map((g) => (
          <section key={g} className="rounded border border-line bg-panel">
            <h2 className="border-b border-line px-3 py-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted">{g}</h2>
            <ul>
              {TOOLS.filter((t) => t.group === g).map((t) => (
                <li key={t.path} className="border-b border-line last:border-b-0">
                  <Link to={t.path} className="block px-3 py-2 no-underline hover:bg-panel-2">
                    <div className="text-[14px] font-medium text-accent">{t.nav}</div>
                    <div className="text-[12.5px] text-muted">{t.summary}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
