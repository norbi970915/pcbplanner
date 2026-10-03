import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { applyPageMetadata, fallbackMetadata, loadPageMetadata } from './documentMetadata';

export function useDocumentMeta(title: string, description: string, options: { noindex?: boolean } = {}) {
  const { pathname } = useLocation();
  const noindex = options.noindex ?? false;
  useEffect(() => {
    const path = pathname.replace(/(.)\/$/, '$1');
    const initialPath = document.querySelector<HTMLScriptElement>('script[type="application/ld+json"]')?.dataset.pagePath;
    // A direct visit already has the full build-time metadata; no additional request is needed.
    if (initialPath === path || (noindex && initialPath === '/404')) return;
    applyPageMetadata(fallbackMetadata(path, title, description, noindex), false);
    let active = true;
    void loadPageMetadata().then(catalogue => {
      const page = catalogue?.[path] ?? (noindex ? catalogue?.['/404'] : undefined);
      if (active && page) applyPageMetadata(page);
    });
    // A slow response for the previous route must never overwrite the current page's metadata.
    return () => { active = false; };
  }, [pathname, title, description, noindex]);
}
