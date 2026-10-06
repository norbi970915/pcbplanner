import { useEffect, useRef, useState } from 'react';
import { ChevronDown, List } from 'lucide-react';
import { guideScrollRoot, type GuideSection } from '../lib/guideContents';

export function GuideContents({ sections }: { sections: GuideSection[] }) {
  const details = useRef<HTMLDetailsElement>(null);
  const [active, setActive] = useState('');
  useEffect(() => {
    const media = window.matchMedia('(min-width: 700px)');
    const update = () => { if (details.current) details.current.open = media.matches; };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const container = details.current;
    if (!container) return;
    let root = guideScrollRoot(container), frame = 0;
    const update = () => {
      frame = 0;
      const top = root instanceof HTMLElement ? root.getBoundingClientRect().top : 0;
      const headings = sections.map(section => document.getElementById(section.id)).filter((node): node is HTMLElement => !!node);
      const current = headings.filter(node => node.getBoundingClientRect().top <= top + 80).at(-1);
      setActive(current?.id ?? '');
    };
    const scroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    const resize = () => {
      root.removeEventListener('scroll', scroll);
      root = guideScrollRoot(container);
      root.addEventListener('scroll', scroll, { passive: true });
      scroll();
    };
    root.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('resize', resize);
    scroll();
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener('scroll', scroll);
      window.removeEventListener('resize', resize);
    };
  }, [sections]);
  return <details id="guide-contents" ref={details} className="guide-contents">
    <summary><List size={16} aria-hidden="true" /><span>On this page</span><ChevronDown size={16} aria-hidden="true" /></summary>
    <nav aria-label="Guide contents"><ol>{sections.map(section =>
      <li key={section.id}><a href={'#' + encodeURIComponent(section.id)} aria-current={active === section.id ? 'location' : undefined}
        onClick={() => {
          if (!window.matchMedia('(min-width: 700px)').matches && details.current) details.current.open = false;
          requestAnimationFrame(() => document.getElementById(section.id)?.focus({ preventScroll: true }));
        }}>{section.title}</a></li>
    )}</ol></nav>
  </details>;
}
