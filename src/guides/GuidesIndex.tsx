import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useDocumentMeta } from '../components/ToolPage';
import { useShell } from '../state/shell';
import { GUIDES } from './registry';

export default function GuidesIndex() {
  useDocumentMeta('PCB Design Guides', 'Practical PCB design guides with worked examples: impedance, stackups, high-speed routing, crosstalk, via current, decoupling capacitors, cooling and conductor spacing.');
  const { statusEl } = useShell();
  return (
    <div className="p-3">
      <div className="mx-auto max-w-[860px] border border-line bg-sheet">
        <div className="flex h-[24px] items-center bg-panel-head px-2 font-semibold">Guides</div>
        <div className="px-5 py-4">
          <h1 className="text-[18px] font-semibold">PCB design guides</h1>
          <p className="mt-1 text-muted">Short, sourced articles that explain the design decisions behind the calculators, with numbers you can reproduce in the tools.</p>
        </div>
        <ul>
          {GUIDES.map((g) => (
            <li key={g.path} className="border-t border-line">
              <Link to={g.path} className="block px-5 py-3 no-underline hover:bg-hover">
                <div className="text-[14px] font-semibold text-accent-ink">{g.title}</div>
                <div className="mt-0.5 text-muted">{g.description}</div>
                <div className="mt-0.5 text-faint">{g.minutes} min read</div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      {statusEl && createPortal(<span>{GUIDES.length} guides</span>, statusEl)}
    </div>
  );
}
