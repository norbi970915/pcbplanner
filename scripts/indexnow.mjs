// Tells IndexNow search engines (Bing, Yandex, Seznam, Naver; DuckDuckGo and others use Bing's index)
// which pages changed, so they are crawled within hours instead of days.
//
// Usage:
//   node scripts/indexnow.mjs          pages whose sitemap <lastmod> is within the last 2 days
//   node scripts/indexnow.mjs --all    every page in the sitemap (first submission, or after a big change)
//   node scripts/indexnow.mjs --dry    print the list without sending it
//
// It reads the live sitemap, so run it after a deploy is live: the GitHub workflow
// .github/workflows/indexnow.yml does that for every production deploy. Resubmitting unchanged
// pages is discouraged by the protocol, hence the date filter.
import { existsSync } from 'node:fs';

const SITE = 'https://www.pcbplanner.com';
const HOST = 'www.pcbplanner.com';
// The key is public by design: search engines fetch it from the site to confirm the site owner sent the list.
const KEY = 'ba2612f4a708b10a33c09cecc9fd7986';
const KEY_LOCATION = `${SITE}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const DAYS = 2;

const args = new Set(process.argv.slice(2));
const all = args.has('--all');
const dry = args.has('--dry');

if (existsSync('public') && !existsSync(`public/${KEY}.txt`)) throw new Error(`indexnow: public/${KEY}.txt is missing`);

const key = await fetch(KEY_LOCATION).then((r) => (r.ok ? r.text() : ''));
if (key.trim() !== KEY) throw new Error(`indexnow: ${KEY_LOCATION} does not serve the key yet (deploy first)`);

const sitemap = await fetch(`${SITE}/sitemap.xml`).then((r) => {
  if (!r.ok) throw new Error(`indexnow: sitemap returned ${r.status}`);
  return r.text();
});
const entries = [...sitemap.matchAll(/<loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod>/g)].map((m) => ({ loc: m[1], lastmod: m[2] }));
const since = new Date(Date.now() - DAYS * 86400e3).toISOString().slice(0, 10);
const urlList = entries.filter((e) => all || e.lastmod >= since).map((e) => e.loc);

console.log(`indexnow: ${urlList.length} of ${entries.length} URLs${all ? ' (all)' : ` changed since ${since}`}`);
if (!urlList.length || dry) {
  for (const u of urlList) console.log('  ' + u);
  process.exit(0);
}

const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList }),
});
// 200 OK and 202 Accepted both mean the list was received; 202 means the key is still being validated
console.log(`indexnow: ${res.status} ${res.statusText}`);
if (res.status !== 200 && res.status !== 202) {
  console.error(await res.text());
  process.exit(1);
}
