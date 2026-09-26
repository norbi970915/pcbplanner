// Generates public/sitemap.xml and public/robots.txt from the tool registry.
// Runs automatically before every build (see package.json "build").
//
// <lastmod> is the date of the last commit that touched the page's source (today while it has
// uncommitted edits). Where git history is not available (shallow or no clone, as on some build
// hosts), the dates already in the committed sitemap are kept, so commit the regenerated sitemap.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const SITE = 'https://www.pcbplanner.com';
const registry = readFileSync('src/tools/registry.ts', 'utf8');
const guides = readFileSync('src/guides/registry.ts', 'utf8');
const imports = (src, dir) =>
  [...src.matchAll(/path:\s*'([^']+)'[\s\S]*?import\('\.\/(\w+)'\)/g)].map((m) => [m[1], [`${dir}/${m[2]}.tsx`]]);

// route -> source files whose changes change the page
const pages = [
  ['/', ['src/tools/Home.tsx', 'src/tools/registry.ts']],
  ['/tools', ['src/tools/ToolsIndex.tsx', 'src/tools/registry.ts']],
  ['/schematic', ['src/pages/Schematic.tsx']],
  ...imports(registry, 'src/tools'),
  ['/guides', ['src/guides/GuidesIndex.tsx', 'src/guides/registry.ts']],
  ...imports(guides, 'src/guides'),
  ['/about', ['src/pages/About.tsx']],
];

const today = new Date().toISOString().slice(0, 10);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
let history = false;
try {
  history = git('rev-parse', '--is-shallow-repository') === 'false';
} catch {
  // not a git checkout
}
const previous = existsSync('public/sitemap.xml')
  ? Object.fromEntries([...readFileSync('public/sitemap.xml', 'utf8').matchAll(/<loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod>/g)].map((m) => [m[1], m[2]]))
  : {};

function lastmod(loc, files) {
  if (history) {
    if (git('status', '--porcelain', '--', ...files)) return today;
    const date = git('log', '-1', '--format=%cs', '--', ...files);
    if (date) return date;
  }
  return previous[loc] ?? today;
}

const urls = pages
  .map(([p, files]) => {
    const loc = `${SITE}${p}`;
    return `  <url><loc>${loc}</loc><lastmod>${lastmod(loc, files)}</lastmod><changefreq>monthly</changefreq><priority>${p === '/' ? '1.0' : '0.8'}</priority></url>`;
  })
  .join('\n');
writeFileSync('public/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
writeFileSync('public/robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`sitemap: ${pages.length} URLs${history ? '' : ' (no git history: kept the committed dates)'}`);
