import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { useDocumentMeta } from '../components/ToolPage';
import { useShell } from '../state/shell';
import { GROUP_COLORS, GROUPS, TOOLS } from './registry';

export default function ToolsIndex() {
  useDocumentMeta('PCB Design Calculators', 'Browse PCB design calculators by category: signal integrity, stackups, thermal design, power, components and electronics.');
  const { statusEl } = useShell();
  const [params] = useSearchParams();
  const requested = params.get('group');
  const selected = requested && GROUPS.includes(requested) ? requested : null;
  const groups = selected ? [selected] : GROUPS;

  return <div className="p-3">
    <div className="border border-line bg-sheet">
      <div className="flex h-[24px] items-center bg-panel-head px-2 font-semibold">Tools</div>
      <div className="px-4 py-3">
        <h1 className="text-[18px] font-semibold">{selected ? `${selected} tools` : 'PCB design calculators'}</h1>
        <p className="mt-1 text-muted">{selected ? `${TOOLS.filter(tool => tool.group === selected).length} tools in this category. Choose one below or switch categories.` : `Browse all ${TOOLS.length} tools by category. Every calculator has a shareable URL.`}</p>
        <nav aria-label="Tool categories" className="mt-3 flex flex-wrap gap-1.5">
          <Link to="/tools" className={`btn no-underline ${selected ? '' : 'btn-primary'}`}>All tools</Link>
          {GROUPS.map(group => <Link key={group} to={`/tools?group=${encodeURIComponent(group)}`} className={`btn no-underline ${selected === group ? 'btn-primary' : ''}`}>
            <span className="h-[9px] w-[9px] border border-black/30" style={{ background: GROUP_COLORS[group] }} />{group}
          </Link>)}
        </nav>
      </div>
    </div>
    <div className="mt-3 grid gap-3 xl:grid-cols-2">
      {groups.map(group => <section key={group} className="min-w-0 border border-line bg-sheet">
        <h2 className="flex h-[24px] items-center gap-1.5 bg-panel-head px-2 font-semibold">
          <span className="h-[9px] w-[9px] border border-black/30" style={{ background: GROUP_COLORS[group] }} />{group}
          <span className="ml-auto font-normal text-faint">{TOOLS.filter(tool => tool.group === group).length} tools</span>
        </h2>
        <ul>{TOOLS.filter(tool => tool.group === group).map(tool => <li key={tool.path} className="border-t border-line">
          <Link to={tool.path} className="block px-3 py-2 no-underline hover:bg-hover">
            <div className="font-semibold text-accent-ink">{tool.nav}</div>
            <div className="mt-0.5 text-muted">{tool.summary}</div>
          </Link>
        </li>)}</ul>
      </section>)}
    </div>
    {statusEl && createPortal(<span>{selected ? TOOLS.filter(tool => tool.group === selected).length : TOOLS.length} tools</span>, statusEl)}
  </div>;
}
