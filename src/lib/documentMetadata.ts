import { APP_NAME, SITE_URL } from '../config';

export interface PageMetadata {
  path: string;
  title: string;
  description: string;
  image: string;
  jsonLd: Record<string, unknown>;
  noindex?: boolean;
}

type MetadataCatalogue = Record<string, PageMetadata>;
let cached: { url: string; promise: Promise<MetadataCatalogue | null> } | undefined;

/** The build produces this catalogue alongside the static pages, with versioned image URLs. */
export function loadPageMetadata(): Promise<MetadataCatalogue | null> {
  const url = document.querySelector<HTMLMetaElement>('meta[name="pcbplanner:metadata"]')?.content;
  if (!url) return Promise.resolve(null);
  if (cached?.url === url) return cached.promise;
  const promise = fetch(url).then(async response => {
    if (!response.ok) throw new Error('Page metadata unavailable');
    return await response.json() as MetadataCatalogue;
  }).catch(() => {
    if (cached?.url === url) cached = undefined; // allow a later navigation to retry
    return null;
  });
  cached = { url, promise };
  return promise;
}

export function fallbackMetadata(path: string, title: string, description: string, noindex = false): PageMetadata {
  const fullTitle = title.endsWith(APP_NAME) ? title : title + ' \u2013 ' + APP_NAME;
  return {
    path, title: fullTitle, description, image: SITE_URL + '/og-image.png?v=3', noindex,
    jsonLd: { '@context': 'https://schema.org', '@type': 'WebPage', name: fullTitle,
      description, ...(noindex ? {} : { url: SITE_URL + path }) },
  };
}

/** Update the complete head, including clearing noindex/canonical state when leaving a 404. */
export function applyPageMetadata(page: PageMetadata, complete = true): void {
  const meta = (key: string, content: string | undefined, property = false) => {
    const attribute = property ? 'property' : 'name';
    let element = document.querySelector<HTMLMetaElement>('meta[' + attribute + '="' + key + '"]');
    if (content === undefined) { element?.remove(); return; }
    if (!element) {
      element = document.createElement('meta');
      element.setAttribute(attribute, key);
      document.head.appendChild(element);
    }
    element.content = content;
  };
  document.title = page.title;
  meta('description', page.description);
  meta('robots', page.noindex ? 'noindex' : undefined);
  let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  const url = page.noindex ? undefined : SITE_URL + page.path;
  if (!url) canonical?.remove();
  else {
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = url;
  }
  meta('og:url', url, true);
  meta('og:title', page.title, true);
  meta('og:description', page.description, true);
  meta('og:image', page.image, true);
  meta('twitter:title', page.title);
  meta('twitter:description', page.description);
  meta('twitter:image', page.image);
  let schema = document.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');
  if (!schema) {
    schema = document.createElement('script');
    schema.type = 'application/ld+json';
    document.head.appendChild(schema);
  }
  schema.textContent = JSON.stringify(page.jsonLd).replace(/</g, '\u003c');
  if (complete) schema.dataset.pagePath = page.path;
  else delete schema.dataset.pagePath;
}
