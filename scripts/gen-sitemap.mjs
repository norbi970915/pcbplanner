// Generates public/sitemap.xml and public/robots.txt from the tool registry.
// Runs automatically before every build (see package.json "build").
import { readFileSync, writeFileSync } from 'node:fs';

const SITE = 'https://www.pcbplanner.com';
const registry = readFileSync('src/tools/registry.ts', 'utf8');
const guides = readFileSync('src/guides/registry.ts', 'utf8');
const paths = [
  '/',
  '/tools',
  '/schematic',
  ...[...registry.matchAll(/path:\s*'([^']+)'/g)].map((m) => m[1]),
  '/guides',
  ...[...guides.matchAll(/path:\s*'([^']+)'/g)].map((m) => m[1]),
  '/about',
];
const today = new Date().toISOString().slice(0, 10);
const urls = paths
  .map((p) => `  <url><loc>${SITE}${p === '/' ? '/' : p}</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>${p === '/' ? '1.0' : '0.8'}</priority></url>`)
  .join('\n');
writeFileSync('public/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
writeFileSync('public/robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`sitemap: ${paths.length} URLs`);
