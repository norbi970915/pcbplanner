// Writes a static HTML page per tool (dist/<route>.html) after `vite build`, so crawlers and
// link previews get the right title, description, canonical URL, Open Graph tags, JSON-LD and
// readable content without running JavaScript. React replaces the static content on load.
// Netlify, Cloudflare Pages, GitHub Pages and `vite preview` all serve /impedance from impedance.html.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const SITE = 'https://www.pcbplanner.com';
const APP = 'PCB Planner';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { TOOLS, GROUPS, relatedTools } = await vite.ssrLoadModule('/src/tools/registry.ts');
const { PRESETS } = await vite.ssrLoadModule('/src/lib/stackups.ts');
const { FLEX_PRESETS } = await vite.ssrLoadModule('/src/data/flexStackups.ts');
const { GUIDES } = await vite.ssrLoadModule('/src/guides/registry.ts');
const { renderGuide, renderToolMethod } = await vite.ssrLoadModule('/src/guides/ssr.tsx');
const { ABOUT_DESCRIPTION } = await vite.ssrLoadModule('/src/pages/About.tsx');
const { SCHEMATIC_DESCRIPTION } = await vite.ssrLoadModule('/src/pages/Schematic.tsx');
const { NOT_FOUND_DESCRIPTION } = await vite.ssrLoadModule('/src/pages/NotFound.tsx');
// full article HTML, rendered with React on the server side
const guideHtml = Object.fromEntries(['/', '/tools', '/schematic', '/guides', '/about', '/404', ...GUIDES.map((g) => g.path)].map((p) => [p, renderGuide(p)]));

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// route -> component file, from the lazy imports in the registry
const registrySrc = readFileSync('src/tools/registry.ts', 'utf8');
const fileByPath = Object.fromEntries(
  [...registrySrc.matchAll(/path:\s*'([^']+)'[\s\S]*?import\('\.\/(\w+)'\)/g)].map((m) => [m[1], m[2]]),
);

/** The description the tool passes to ToolPage, so the static and live pages say the same. */
function toolDescription(tool) {
  const file = fileByPath[tool.path];
  const src = file ? readFileSync(`src/tools/${file}.tsx`, 'utf8') : '';
  const m = src.match(/description=(?:"([^"]*)"|\{`([^`]*)`\})/);
  if (!m) console.warn(`prerender: no description in ${file ?? tool.path}, using the summary`);
  const text = m ? (m[1] ?? m[2]) : tool.summary;
  const values = { 'PRESETS.length': PRESETS.length, 'FLEX_PRESETS.length': FLEX_PRESETS.length };
  return text.replace(/\$\{([^}]+)\}/g, (_, expression) => {
    if (!(expression in values)) throw new Error('prerender: unresolved description expression in ' + file + ': ' + expression);
    return String(values[expression]);
  });
}

const template = readFileSync('dist/index.html', 'utf8');
const metadata = {};
const outputPages = [];


/** The page's own link-preview image from scripts/render-og.mjs, versioned by content; else the site image. */
function ogImage(path) {
  const file = `og/${path.slice(1).replace(/\//g, '-')}.png`;
  if (!existsSync(`public/${file}`)) {
    if (path !== '/' && path !== '/404') console.warn(`prerender: no preview image for ${path}, run scripts/render-og.mjs`);
    return `${SITE}/og-image.png?v=3`;
  }
  return `${SITE}/${file}?v=${createHash('sha1').update(readFileSync(`public/${file}`)).digest('hex').slice(0, 8)}`;
}

function page({ path, title, description, h1, body, jsonLd, raw }) {
  const url = SITE + path;
  const image = ogImage(path);
  const noindex = path === '/404';
  if (/\$\{/.test(JSON.stringify({title,description,jsonLd}))) throw new Error('prerender: unresolved metadata for ' + path);
  metadata[path] = { path, title, description, image, jsonLd, ...(noindex ? { noindex: true } : {}) };
  outputPages.push(path === '/' ? 'dist/index.html' : 'dist' + path + '.html');
  const set = (html, re, value) => {
    if (!re.test(html)) throw new Error(`prerender: ${re} not found in dist/index.html`);
    return html.replace(re, value);
  };
  let html = template;
  html = set(html, /<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  html = set(html, /(<meta name="description" content=")[^"]*/, `$1${esc(description)}`);
  html = set(html, /(<link rel="canonical" href=")[^"]*/, `$1${url}`);
  html = set(html, /(<meta property="og:url" content=")[^"]*/, `$1${url}`);
  html = set(html, /(<meta property="og:title" content=")[^"]*/, `$1${esc(title)}`);
  html = set(html, /(<meta property="og:description" content=")[^"]*/, `$1${esc(description)}`);
  html = set(html, /(<meta name="twitter:title" content=")[^"]*/, `$1${esc(title)}`);
  html = set(html, /(<meta name="twitter:description" content=")[^"]*/, `$1${esc(description)}`);
  html = set(html, /(<meta property="og:image" content=")[^"]*/, `$1${image}`);
  html = set(html, /(<meta name="twitter:image" content=")[^"]*/, `$1${image}`);
  html = set(
    html,
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    `<meta name="pcbplanner:metadata" content="__PAGE_METADATA_URL__" />\n<script type="application/ld+json" data-page-path="${path}">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`,
  );
  html = set(html, /<div id="root"><\/div>/, `<div id="root">${raw ?? `<main class="prerender"><h1>${esc(h1)}</h1>${body}</main>`}</div>`);
  return html;
}

const toolNav = GROUPS.map(
  (g) =>
    `<h2>${esc(g)}</h2><ul>${TOOLS.filter((t) => t.group === g)
      .map((t) => `<li><a href="${t.path}">${esc(t.title)}</a> – ${esc(t.summary)}</li>`)
      .join('')}</ul>`,
).join('');

const app = (name, url, description) => ({
  '@type': 'WebApplication',
  name,
  url,
  description,
  applicationCategory: 'EngineeringApplication',
  operatingSystem: 'Any',
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
});

// Home: prerender the compact launchpad into dist/index.html
const homeDescription = readFileSync('src/tools/Home.tsx', 'utf8').match(/useDocumentMeta\(\s*'[^']*',\s*'([^']*)'/)[1];
const homeTitle = `PCB impedance, stackup and design calculators – ${APP}`;
writeFileSync(
  'dist/index.html',
  page({
    path: '/',
    title: homeTitle,
    description: homeDescription,
    h1: `${APP} – PCB design calculators`,
    raw: guideHtml['/'],
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', name: APP, url: `${SITE}/` },
        app(APP, `${SITE}/`, homeDescription),
      ],
    },
  }),
);

for (const tool of TOOLS) {
  const description = toolDescription(tool);
  const metaDescription = tool.metaDescription ?? description; // search snippet; the page text keeps the full description
  const url = SITE + tool.path;
  const cross = relatedTools(tool.path).filter((t) => t.group !== tool.group);
  const related = TOOLS.filter((t) => t.group === tool.group && t !== tool);
  // the tool's own method section (formulas, explanation, references), rendered on the server side
  const file = fileByPath[tool.path];
  const method = file ? renderToolMethod(file) : '';
  if (file && /method=\{<Method\b/.test(readFileSync('src/tools/' + file + '.tsx', 'utf8')) && !method) {
    throw new Error('prerender: export Method from ' + file + ' so the static explanation is included.');
  }
  const guides = GUIDES.filter((g) => g.tools.includes(tool.path));
  const body =
    `<p>${esc(description)}</p>` +
    (method ? `<section><h2>Method, formulas and references</h2>${method}</section>` : '') +
    (guides.length ? `<h2>Related guides</h2><ul>${guides.map((g) => `<li><a href="${g.path}">${esc(g.title)}</a></li>`).join('')}</ul>` : '') +
    (cross.length ? `<h2>Related tools</h2><ul>${cross.map((t) => `<li><a href="${t.path}">${esc(t.title)}</a></li>`).join('')}</ul>` : '') +
    (related.length
      ? `<h2>Related ${esc(tool.group.toLowerCase())} tools</h2><ul>${related
          .map((t) => `<li><a href="${t.path}">${esc(t.title)}</a></li>`)
          .join('')}</ul>`
      : '') +
    `<nav><h2>All calculators</h2>${toolNav}</nav>`;
  writeFileSync(
    `dist${tool.path}.html`,
    page({
      path: tool.path,
      title: `${tool.seoTitle ?? tool.title} – ${APP}`,
      description: metaDescription,
      h1: tool.title,
      body,
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          app(`${tool.seoTitle ?? tool.title} – ${APP}`, url, metaDescription),
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: APP, item: `${SITE}/` },
              { '@type': 'ListItem', position: 2, name: tool.title, item: url },
            ],
          },
        ],
      },
    }),
  );
}
writeFileSync(
  'dist/tools.html',
  page({
    path: '/tools',
    title: `PCB Design Calculators \u2013 ${APP}`,
    description: 'Browse PCB design calculators by category: signal integrity, stackups, thermal design, power, components and electronics.',
    raw: guideHtml['/tools'],
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'PCB Design Calculators',
      url: `${SITE}/tools`,
      hasPart: TOOLS.map((tool) => ({ '@type': 'WebApplication', name: tool.title, url: SITE + tool.path })),
    },
  }),
);
writeFileSync(
  'dist/schematic.html',
  page({
    path: '/schematic',
    title: `Schematic Design Tools – ${APP}`,
    description: SCHEMATIC_DESCRIPTION,
    raw: guideHtml['/schematic'],
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Schematic Design Tools',
      url: `${SITE}/schematic`,
      description: SCHEMATIC_DESCRIPTION,
      hasPart: ['/power-tree', '/buck-converter', '/boost-converter', '/ldo', '/feedback-divider', '/i2c-pullup', '/logic-levels', '/termination', '/crystal', '/rc-filter', '/current-sense-shunt', '/adc-input', '/resistors', '/reactance', '/pdn']
        .map((path) => ({ '@type': 'WebApplication', url: SITE + path })),
    },
  }),
);
// About: the page text rendered into the HTML, so it reads without JavaScript
writeFileSync(
  'dist/about.html',
  page({
    path: '/about',
    title: `About ${APP}`,
    description: ABOUT_DESCRIPTION,
    raw: guideHtml['/about'],
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'AboutPage',
      name: `About ${APP}`,
      url: `${SITE}/about`,
      description: ABOUT_DESCRIPTION,
      mainEntity: app(APP, `${SITE}/`, ABOUT_DESCRIPTION),
    },
  }),
);

// 404: served by the host for unknown URLs (with a 404 status); not indexed and has no canonical URL
writeFileSync(
  'dist/404.html',
  page({
    path: '/404',
    title: `Page not found – ${APP}`,
    description: NOT_FOUND_DESCRIPTION,
    raw: guideHtml['/404'],
    jsonLd: { '@context': 'https://schema.org', '@type': 'WebPage', name: 'Page not found' },
  })
    .replace(/\s*<link rel="canonical"[^>]*>/, '')
    .replace(/\s*<meta property="og:url"[^>]*>/, '')
    .replace('<meta name="viewport"', '<meta name="robots" content="noindex" />\n    <meta name="viewport"'),
);

// Guides: index and articles, with the full article text rendered into the page
mkdirSync('dist/guides', { recursive: true });
const guidesDescription = readFileSync('src/guides/GuidesIndex.tsx', 'utf8').match(/useDocumentMeta\(\s*'[^']*',\s*'([^']*)'/)[1];
writeFileSync(
  'dist/guides.html',
  page({
    path: '/guides',
    title: `PCB Design Guides – ${APP}`,
    description: guidesDescription,
    raw: guideHtml['/guides'],
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'PCB Design Guides',
      url: `${SITE}/guides`,
      description: guidesDescription,
      hasPart: GUIDES.map((g) => ({ '@type': 'Article', headline: g.title, url: SITE + g.path })),
    },
  }),
);
for (const g of GUIDES) {
  const url = SITE + g.path;
  writeFileSync(
    `dist${g.path}.html`,
    page({
      path: g.path,
      title: `${g.seoTitle} – ${APP}`,
      description: g.metaDescription ?? g.description,
      raw: guideHtml[g.path],
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'TechArticle',
            headline: g.title,
            description: g.metaDescription ?? g.description,
            datePublished: g.date,
            dateModified: g.date,
            url,
            mainEntityOfPage: url,
            image: ogImage(g.path),
            author: { '@type': 'Organization', name: APP, url: `${SITE}/` },
            publisher: { '@type': 'Organization', name: APP, url: `${SITE}/`, logo: { '@type': 'ImageObject', url: `${SITE}/icon-512.png?v=3` } },
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: APP, item: `${SITE}/` },
              { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE}/guides` },
              { '@type': 'ListItem', position: 3, name: g.title, item: url },
            ],
          },
        ],
      },
    }),
  );
}
// One generated metadata catalogue serves both static pages and client navigation.
// A content hash keeps it in step with the deploy and lets the existing service worker cache it offline.
const catalogue = JSON.stringify(metadata).replace(/</g, '\\u003c');
const metadataUrl = '/assets/page-metadata-' + createHash('sha256').update(catalogue).digest('hex').slice(0,12) + '.json';
writeFileSync('dist' + metadataUrl, catalogue);
for (const file of outputPages) {
  const html = readFileSync(file,'utf8');
  if (!html.includes('__PAGE_METADATA_URL__')) throw new Error('prerender: missing metadata link in ' + file);
  writeFileSync(file,html.replace('__PAGE_METADATA_URL__',metadataUrl));
}
await vite.close();
console.log(`prerender: ${TOOLS.length + 1} tool pages, ${GUIDES.length + 1} guide pages, about, 404`);
