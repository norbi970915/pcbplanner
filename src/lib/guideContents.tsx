import { Children, cloneElement, isValidElement, type ReactNode, type ReactElement } from 'react';

export interface GuideSection { id: string; title: string; }
type NodeProps = { children?: ReactNode; id?: string; className?: string; tabIndex?: number };

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (isValidElement<NodeProps>(node)) return textOf(node.props.children);
  return Children.toArray(node).map(child => textOf(child)).join('');
}
export function guideSlug(title: string) {
  return title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'section';
}

/** Assign headings before rendering so anchors and contents also exist in static HTML. */
export function prepareGuideContents(body: ReactNode) {
  const sections: GuideSection[] = [];
  const used = new Set<string>(['guide-contents']);
  const visit = (nodes: ReactNode): ReactNode => Children.map(nodes, node => {
    if (!isValidElement<NodeProps>(node)) return node;
    const children = node.props.children;
    if (node.type === 'h2') {
      const title = textOf(children).replace(/\s+/g, ' ').trim();
      const base = node.props.id || guideSlug(title);
      let id = base, suffix = 2;
      while (used.has(id)) id = base + '-' + suffix++;
      used.add(id);
      sections.push({ id, title });
      return cloneElement(node, { id, tabIndex: -1, className: [node.props.className, 'guide-section-heading'].filter(Boolean).join(' ') });
    }
    return children === undefined ? node : cloneElement(node, {}, visit(children));
  });
  return { body: visit(body), sections };
}

export function insertGuideContents(body: ReactNode, contents: ReactElement): ReactNode {
  let inserted = false;
  const visit = (nodes: ReactNode): ReactNode => Children.map(nodes, node => {
    if (!isValidElement<NodeProps>(node)) return node;
    if (!inserted && node.type === 'h2') {
      inserted = true;
      return [contents, node];
    }
    return node.props.children === undefined ? node : cloneElement(node, {}, visit(node.props.children));
  });
  return visit(body);
}

/** The desktop document pane and mobile workspace each own scrolling. */
export function guideScrollRoot(element: HTMLElement): HTMLElement | Window {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight) return parent;
  }
  return window;
}
