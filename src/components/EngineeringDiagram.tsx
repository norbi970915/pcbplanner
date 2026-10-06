import { useId, type ReactNode } from 'react';
import { useDiagramField, useFieldInteraction } from '../state/fieldInteraction';

export type DiagramPaint = { copper: string; laminate: string; prepreg: string; arrow: string };
export function EngineeringDiagram({ children, caption, legend = [], title }: {
  children: ReactNode; caption?: string; title?: string;
  legend?: { label: string; color: string }[];
}) {
  return <figure className="engineering-diagram">
    {title && <div className="diagram-heading">{title}</div>}
    <div className="diagram-stage">{children}</div>
    {legend.length > 0 && <div className="diagram-legend">{legend.map(item => <span key={item.label}><i style={{ background: item.color }} aria-hidden="true" />{item.label}</span>)}</div>}
    {caption && <figcaption className="diagram-caption">{caption}</figcaption>}
  </figure>;
}

/** Each drawing owns its paint IDs, including when several appear on one page. */
export function DiagramSvg({ viewBox, label, children }: {
  viewBox: string; label: string; children: (paint: DiagramPaint) => ReactNode;
}) {
  const id = useId().replace(/:/g, '');
  const [x, y, w, h] = viewBox.split(/\s+/).map(Number);
  return <svg viewBox={viewBox} className="diagram-svg" role="img" aria-label={label}>
    <defs>
      <pattern id={id + '-grid'} width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.7" fill="var(--line-strong)" opacity="0.45" /></pattern>
      <linearGradient id={id + '-copper'} x1="0" y1="0" x2="0.8" y2="1">
        <stop stopColor="color-mix(in srgb, var(--copper) 85%, var(--sheet))" />
        <stop offset="0.5" stopColor="var(--copper)" /><stop offset="1" stopColor="color-mix(in srgb, var(--copper) 88%, var(--ink))" />
      </linearGradient>
      {(['laminate', 'prepreg'] as const).map(material => <pattern key={material} id={id + '-' + material} width="12" height="12" patternUnits="userSpaceOnUse">
        <rect width="12" height="12" fill={'var(--' + material + ')'} fillOpacity="0.7" />
        <path d={material === 'laminate' ? 'M0 0H12 M0 6H12 M0 0V12 M6 0V12' : 'M-3 3L3 -3 M0 12L12 0 M9 15L15 9'} stroke="var(--ink)" strokeOpacity="0.08" strokeWidth="0.6" />
      </pattern>)}
      <marker id={id + '-arrow'} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M1 1L7 4L1 7" fill="none" stroke="var(--accent-ink)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></marker>
    </defs>
    <rect x={x} y={y} width={w} height={h} fill={'url(#' + id + '-grid)'} aria-hidden="true" />
    {children({ copper: 'url(#' + id + '-copper)', laminate: 'url(#' + id + '-laminate)', prepreg: 'url(#' + id + '-prepreg)', arrow: 'url(#' + id + '-arrow)' })}
  </svg>;
}

export function DiagramDimension({ x1, y1, x2, y2, label, arrow, field }: {
  x1: number; y1: number; x2: number; y2: number; label: string; arrow: string; field?: string;
}) {
  const active = useDiagramField(field ?? label.toLowerCase());
  const vertical = x1 === x2;
  return <g className="diagram-dimension" data-diagram-field={field ?? label.toLowerCase()} data-active={active || undefined}>
    {active && <line className="diagram-focus-line" x1={x1} y1={y1} x2={x2} y2={y2} />}
    <path d={vertical ? 'M' + (x1-5) + ' ' + y1 + 'h10 M' + (x2-5) + ' ' + y2 + 'h10' : 'M' + x1 + ' ' + (y1-5) + 'v10 M' + x2 + ' ' + (y2-5) + 'v10'} className="diagram-extension" />
    <line x1={x1} y1={y1} x2={x2} y2={y2} markerStart={arrow} markerEnd={arrow} />
    <text x={vertical ? x1 + 10 : (x1+x2)/2} y={vertical ? (y1+y2)/2 + 5 : y1-9} textAnchor={vertical ? 'start' : 'middle'} className="diagram-label">{label}</text>
  </g>;
}

/** An explicit outline supplements color so the selected component is easy to locate. */
export function DiagramFocus({ field, x, y, width, height }: {
  field: string | string[]; x: number; y: number; width: number; height: number;
}) {
  const active = useDiagramField(field);
  return active ? <rect data-diagram-field={Array.isArray(field) ? field.join(' ') : field}
    data-active="true" x={x} y={y} width={width} height={height} rx="5" className="diagram-focus-region" /> : null;
}
export function DiagramValues({ items }: { items: { label: string; value: string; color?: string; field?: string }[] }) {
  const { activeField } = useFieldInteraction();
  return <dl className="diagram-values">{items.map(item => {
    const field = item.field ?? item.label.split(' \u00b7 ')[0].toLowerCase();
    return <div key={item.label} data-diagram-field={field} data-active={field === activeField || undefined}><dt>{item.color && <i style={{ background: item.color }} aria-hidden="true" />}{item.label}</dt><dd>{item.value}</dd></div>;
  })}</dl>;
}
