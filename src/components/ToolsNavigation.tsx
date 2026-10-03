import { Link } from 'react-router-dom';
import {
  Home,
  PanelLeft,
  CircuitBoard,
  ChevronRight,
  BookOpen,
  Star,
} from 'lucide-react';
import { CategoryIcon } from './CategoryIcon';
import { FavoriteButton } from './FavoriteButton';
import { useFavorites } from '../state/favoritesStore';
import { Separator } from './shadcn/separator';
import { GROUP_COLORS, GROUPS, TOOLS } from '../tools/registry';
export function ToolsNavigation({
  path,
  onNavigate,
}: {
  path: string;
  onNavigate?: () => void;
}) {
  const favorites = useFavorites();
  const pinned = favorites.flatMap((path) => {
    const tool = TOOLS.find((item) => item.path === path);
    return tool ? [tool] : [];
  });
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
      <section className="favorites-navigation" aria-label="Favorite tools">
        <div className="favorites-heading">
          <Star size={14} aria-hidden="true" />
          <span>Favorites</span>
          {pinned.length > 0 && <span className="group-count">{pinned.length}</span>}
        </div>
        {pinned.length ? pinned.map((tool) => (
          <div className="nav-tool-row favorite-tool-row" key={tool.path}>
            <Link
              className={'tool-link' + (path === tool.path ? ' current' : '')}
              aria-current={path === tool.path ? 'page' : undefined}
              to={tool.path}
              onClick={onNavigate}
            >
              <CategoryIcon group={tool.group} color={GROUP_COLORS[tool.group]} size={14} />
              <span>{tool.nav}</span>
            </Link>
            <FavoriteButton path={tool.path} title={tool.title} compact />
          </div>
        )) : <p className="favorites-empty">Star a tool to pin it here.</p>}
      </section>
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
              <div className="nav-tool-row" key={t.path}>
                <Link
                  className={'tool-link' + (path === t.path ? ' current' : '')}
                  aria-current={path === t.path ? 'page' : undefined}
                  to={t.path}
                  onClick={onNavigate}
                >
                  {t.nav}
                </Link>
                <FavoriteButton path={t.path} title={t.title} compact />
              </div>
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
