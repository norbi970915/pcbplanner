import { Link } from 'react-router-dom';
import {
  Home,
  PanelLeft,
  CircuitBoard,
  ChevronRight,
  BookOpen,
} from 'lucide-react';
import { CategoryIcon } from './CategoryIcon';
import { Separator } from './shadcn/separator';
import { GROUP_COLORS, GROUPS, TOOLS } from '../tools/registry';
export function ToolsNavigation({
  path,
  onNavigate,
}: {
  path: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="tools-navigation" aria-label="Tools">
      <Link
        className={'side-link' + (path === '/' ? ' current' : '')}
        aria-current={path === '/' ? 'page' : undefined}
        to="/"
        onClick={onNavigate}
      >
        <Home size={16} />
        Home
      </Link>
      <Link
        className={'side-link' + (path === '/tools' ? ' current' : '')}
        to="/tools"
        onClick={onNavigate}
      >
        <PanelLeft size={16} />
        Browse all tools
        <ChevronRight size={12} />
      </Link>
      <Link
        className={'side-link' + (path === '/schematic' ? ' current' : '')}
        to="/schematic"
        onClick={onNavigate}
      >
        <CircuitBoard size={16} />
        Schematic design
      </Link>
      <Separator className="nav-separator" />
      {GROUPS.map((group) => (
        <details className="nav-group" key={group} open>
          <summary>
            <CategoryIcon group={group} color={GROUP_COLORS[group]} />
            <span>{group}</span>
            <span className="group-count">
              {TOOLS.filter((t) => t.group === group).length}
            </span>
            <ChevronRight size={12} />
          </summary>
          <div>
            {TOOLS.filter((t) => t.group === group).map((t) => (
              <Link
                className={'tool-link' + (path === t.path ? ' current' : '')}
                aria-current={path === t.path ? 'page' : undefined}
                to={t.path}
                key={t.path}
                onClick={onNavigate}
              >
                {t.nav}
              </Link>
            ))}
          </div>
        </details>
      ))}
      <Separator className="nav-separator" />
      <Link
        className={'side-link' + (path.startsWith('/guides') ? ' current' : '')}
        to="/guides"
        onClick={onNavigate}
      >
        <BookOpen size={16} />
        All guides
      </Link>
    </nav>
  );
}
