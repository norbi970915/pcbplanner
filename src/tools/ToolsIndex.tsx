import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { CategoryIcon } from '../components/CategoryIcon';
import { Card, CardHeader, CardContent } from '../components/shadcn/card';
import { Badge } from '../components/shadcn/badge';
import { useDocumentMeta } from '../components/ToolPage';
import { useShell } from '../state/shell';
import { GROUP_COLORS, GROUPS, TOOLS } from './registry';
export default function ToolsIndex() {
  useDocumentMeta(
    'PCB Design Calculators',
    'Browse PCB design calculators by category: signal integrity, stackups, thermal design, power, components and electronics.',
  );
  const { statusEl } = useShell();
  const [params] = useSearchParams(),
    requested = params.get('group');
  const selected = requested && GROUPS.includes(requested) ? requested : null;
  const groups = selected ? [selected] : GROUPS;
  return (
    <div className="document-page tool-catalog">
      <Card>
        <CardHeader className="section-heading">
          <h2>Tools</h2>
          <Badge variant="outline" className="quiet-badge">
            {TOOLS.length} calculators
          </Badge>
        </CardHeader>
        <CardContent className="catalog-intro">
          <div className="eyebrow">YOUR PCB DESIGN WORKBENCH</div>
          <h1>{selected ? selected + ' tools' : 'PCB design calculators'}</h1>
          <p className="text-muted">
            {selected
              ? TOOLS.filter((t) => t.group === selected).length +
                ' tools in this category. Choose one below or switch categories.'
              : 'Browse all ' +
                TOOLS.length +
                ' tools by category. Every calculator has a shareable URL.'}
          </p>
          <nav aria-label="Tool categories" className="catalog-filters">
            <Link
              to="/tools"
              aria-current={!selected ? 'page' : undefined}
              className={'btn' + (!selected ? ' btn-primary' : '')}
            >
              All tools <span className="text-faint">{TOOLS.length}</span>
            </Link>
            {GROUPS.map((group) => (
              <Link
                key={group}
                to={'/tools?group=' + encodeURIComponent(group)}
                aria-current={selected === group ? 'page' : undefined}
                className={'btn' + (selected === group ? ' btn-primary' : '')}
              >
                <CategoryIcon
                  group={group}
                  color={GROUP_COLORS[group]}
                  size={14}
                />
                {group}
              </Link>
            ))}
          </nav>
        </CardContent>
      </Card>
      <div className="catalog-grid">
        {groups.map((group) => (
          <Card key={group}>
            <CardHeader className="section-heading">
              <h2 className="flex items-center gap-2">
                <CategoryIcon
                  group={group}
                  color={GROUP_COLORS[group]}
                  size={17}
                />
                {group}
              </h2>
              <span className="section-meta">
                {TOOLS.filter((t) => t.group === group).length} tools
              </span>
            </CardHeader>
            <ul>
              {TOOLS.filter((t) => t.group === group).map((t) => (
                <li key={t.path}>
                  <Link to={t.path} className="catalog-list-item">
                    <div>
                      <h3>{t.nav}</h3>
                      <p>{t.summary}</p>
                    </div>
                    <ArrowRight size={15} />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      {statusEl &&
        createPortal(
          <span>
            {selected
              ? TOOLS.filter((t) => t.group === selected).length
              : TOOLS.length}{' '}
            tools
          </span>,
          statusEl,
        )}
    </div>
  );
}
