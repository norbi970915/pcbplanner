// Writes a static HTML page per tool (dist/<route>.html) after `vite build`, so crawlers and
// link previews get the right title, description, canonical URL, Open Graph tags, JSON-LD and
// readable content without running JavaScript. React replaces the static content on load.
// Netlify, Cloudflare Pages, GitHub Pages and `vite preview` all serve /impedance from impedance.html.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const SITE = 'https://www.pcbplanner.com';
const APP = 'pcbplanner';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { TOOLS, GROUPS } = await vite.ssrLoadModule('/src/tools/registry.ts');
const { PRESETS } = await vite.ssrLoadModule('/src/lib/stackups.ts');
const { GUIDES } = await vite.ssrLoadModule('/src/guides/registry.ts');
const { renderGuide, renderToolMethod } = await vite.ssrLoadModule('/src/guides/ssr.tsx');
const { ABOUT_DESCRIPTION } = await vite.ssrLoadModule('/src/pages/About.tsx');
// full article HTML, rendered with React on the server side
const guideHtml = Object.fromEntries(['/guides', '/about', ...GUIDES.map((g) => g.path)].map((p) => [p, renderGuide(p)]));

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
  return text.replace(/\$\{PRESETS\.length\}/g, String(PRESETS.length));
}

const template = readFileSync('dist/index.html', 'utf8');

function page({ path, title, description, h1, body, jsonLd, raw }) {
  const url = SITE + path;
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
  html = set(
    html,
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`,
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

// Home: rewrite dist/index.html itself with the tool index as content
const homeDescription = readFileSync('src/tools/Home.tsx', 'utf8').match(/useDocumentMeta\(\s*'[^']*',\s*'([^']*)'/)[1];
const homeTitle = `PCB impedance, stackup and design calculators – ${APP}`;
writeFileSync(
  'dist/index.html',
  page({
    path: '/',
    title: homeTitle,
    description: homeDescription,
    h1: `${APP} – PCB design calculators`,
    body: `<p>${esc(homeDescription)}</p><h2>Guides</h2><ul>${GUIDES.map((g) => `<li><a href="${g.path}">${esc(g.title)}</a> – ${esc(g.description)}</li>`).join('')}</ul>${toolNav}`,
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
  const url = SITE + tool.path;
  const related = TOOLS.filter((t) => t.group === tool.group && t !== tool);
  // the tool's own method section (formulas, explanation, references), rendered on the server side
  const method = fileByPath[tool.path] ? renderToolMethod(fileByPath[tool.path]) : '';
  const guides = GUIDES.filter((g) => g.tools.includes(tool.path));
  const body =
    `<p>${esc(description)}</p>` +
    (method ? `<section><h2>Method, formulas and references</h2>${method}</section>` : '') +
    (guides.length ? `<h2>Related guides</h2><ul>${guides.map((g) => `<li><a href="${g.path}">${esc(g.title)}</a></li>`).join('')}</ul>` : '') +
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
      title: `${tool.title} – ${APP}`,
      description,
      h1: tool.title,
      body,
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          app(`${tool.title} – ${APP}`, url, description),
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

// Guides: index and articles, with the full article text rendered into the page
mkdirSync('dist/guides', { recursive: true });
const guidesDescription = 'Practical PCB design guides with real numbers: controlled impedance, choosing a stackup, PCIe Gen3 routing, copper area for cooling, and creepage and clearance for mains.';
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
      description: g.description,
      raw: guideHtml[g.path],
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'TechArticle',
            headline: g.title,
            description: g.description,
            datePublished: g.date,
            dateModified: g.date,
            url,
            mainEntityOfPage: url,
            image: `${SITE}/og-image.png`,
            author: { '@type': 'Organization', name: APP, url: `${SITE}/` },
            publisher: { '@type': 'Organization', name: APP, url: `${SITE}/`, logo: { '@type': 'ImageObject', url: `${SITE}/icon-512.png` } },
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
await vite.close();
console.log(`prerender: ${TOOLS.length + 1} tool pages, ${GUIDES.length + 1} guide pages, about`);
