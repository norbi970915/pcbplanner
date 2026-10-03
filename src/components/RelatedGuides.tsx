import { useId, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, ChevronDown } from 'lucide-react';
import { Button } from './shadcn/button';
import { Card } from './shadcn/card';
import type { GuideDef } from '../guides/registry';
import { toolByPath } from '../tools/registry';

export function RelatedGuides({ guides, toolPath }: { guides: GuideDef[]; toolPath: string }) {
  const [expanded, setExpanded] = useState(false);
  const headingId = useId();
  const gridId = useId();
  const group = toolByPath(toolPath)?.group;
  // Prefer this calculator as the main tool, then articles in the same discipline.
  const ranked = [...guides].sort((a, b) =>
    Number(b.tools[0] === toolPath) - Number(a.tools[0] === toolPath) ||
    Number(toolByPath(b.tools[0])?.group === group) - Number(toolByPath(a.tools[0])?.group === group) ||
    a.tools.indexOf(toolPath) - b.tools.indexOf(toolPath),
  );
  const shown = expanded ? ranked : ranked.slice(0, 3);
  const remaining = Math.max(0, ranked.length - 3);
  return (
    <section className="related-guides" aria-labelledby={headingId}>
      <div className="related-guides-heading">
        <h2 id={headingId}>Related {guides.length === 1 ? 'guide' : 'guides'}</h2>
        {remaining > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="related-guides-toggle"
            aria-expanded={expanded}
            aria-controls={gridId}
            onClick={() => setExpanded(value => !value)}
          >
            {expanded ? 'Show fewer guides' : 'Show ' + remaining + ' more guides'}
            <ChevronDown size={14} className={expanded ? 'rotate-180' : ''} aria-hidden="true" />
          </Button>
        )}
      </div>
      <div className="related-guides-grid" id={gridId} style={{ '--related-columns': Math.min(3, shown.length) } as CSSProperties}>
        {shown.map(guide => (
          <Card className="related-guide-card" key={guide.path}>
            <Link className="related-guide-link" to={guide.path}>
              <span className="related-guide-category"><BookOpen size={14} aria-hidden="true" />{guide.category}</span>
              <h3>{guide.title}</h3>
              <p>{guide.description}</p>
              <span className="related-guide-action">Read guide <ArrowRight size={14} aria-hidden="true" /></span>
            </Link>
          </Card>
        ))}
      </div>
    </section>
  );
}
