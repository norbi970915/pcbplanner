// Writes dist/third-party-notices.txt: the licence of every production dependency shipped in the
// site's bundle (MIT, ISC and Apache-2.0 require their notices to accompany copies), plus the
// shadcn/ui component licence. Runs after `vite build` (see package.json "build").
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

let listing;
try {
  listing = execSync('npm ls --omit=dev --all --parseable', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
} catch (e) {
  // npm ls exits non-zero for warnings (e.g. extraneous packages) but still prints the list
  listing = e.stdout ?? '';
}
const root = process.cwd();
const dirs = [...new Set(listing.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && l !== root))];

const seen = new Map();
for (const dir of dirs) {
  const pkgFile = join(dir, 'package.json');
  if (!existsSync(pkgFile)) continue;
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
  const key = `${pkg.name}@${pkg.version}`;
  if (seen.has(key)) continue;
  const licenceFile = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f));
  const text = licenceFile ? readFileSync(join(dir, licenceFile), 'utf8').trim() : `License: ${typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.license ?? 'see package')}`;
  seen.set(key, { name: pkg.name, version: pkg.version, license: typeof pkg.license === 'string' ? pkg.license : '', text });
}
if (seen.size === 0) throw new Error('gen-licenses: no production dependencies found; is node_modules installed?');

const entries = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
const gerberBundleNotices = readFileSync('node_modules/gerber-to-svg/dist/gerber-to-svg.min.js.LICENSE.txt', 'utf8').trim();
const shadcn = readFileSync('src/components/shadcn/LICENSE.md', 'utf8').trim();
const rule = '-'.repeat(72);
const body = [
  'PCB Planner (www.pcbplanner.com) – third-party software notices',
  '',
  'The site includes the open-source software listed below. Each package is used under its own licence,',
  'reproduced here as required by that licence.',
  '',
  rule,
  'shadcn/ui components (adapted in src/components/shadcn)',
  rule,
  shadcn,
  '', rule, 'gerber-to-svg browser bundle: embedded dependency notices', rule, gerberBundleNotices,
  ...entries.flatMap((e) => ['', rule, `${e.name} ${e.version}${e.license ? ` (${e.license})` : ''}`, rule, e.text]),
  '',
].join('\n');
writeFileSync('dist/third-party-notices.txt', body);
console.log(`licences: ${entries.length} packages`);
