import { Link } from 'react-router-dom';
import { useDocumentMeta } from '../components/ToolPage';
import { toolByPath, type ToolDef } from '../tools/registry';

export const NOT_FOUND_DESCRIPTION = 'This page does not exist or has moved. Open one of the PCB design calculators or guides instead.';

const POPULAR = ['/impedance', '/trace-width', '/stackup-advisor', '/via', '/creepage-clearance', '/buck-converter']
  .map(toolByPath)
  .filter((t): t is ToolDef => !!t);

export default function NotFound() {
  useDocumentMeta('Page not found', NOT_FOUND_DESCRIPTION);
  return <div className="p-3">
    <section className="border border-line bg-sheet">
      <div className="flex h-[24px] items-center bg-panel-head px-2 font-semibold">404</div>
      <div className="px-4 py-3">
        <h1 className="text-[18px] font-semibold">Page not found</h1>
        <p className="mt-1 max-w-[95ch] text-muted">There is no page at this address. It may have moved, or the link may be mistyped.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/tools" className="btn btn-primary no-underline">Browse all tools</Link>
          <Link to="/guides" className="btn no-underline">Read the guides</Link>
          <Link to="/" className="btn no-underline">Home</Link>
        </div>
      </div>
    </section>
    <section className="mt-3 border border-line bg-sheet">
      <h2 className="flex h-[24px] items-center bg-panel-head px-2 font-semibold">Popular calculators</h2>
      <ul>{POPULAR.map(tool => <li key={tool.path} className="border-t border-line first:border-t-0">
        <Link to={tool.path} className="block px-3 py-2 no-underline hover:bg-hover">
          <span className="font-semibold text-accent-ink">{tool.title}</span>
          <span className="mt-0.5 block text-muted">{tool.summary}</span>
        </Link>
      </li>)}</ul>
    </section>
  </div>;
}
