// Every guide's <Cite n={…}> points at an entry of its sources list, and every listed source is cited.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dir = 'src/guides';
const files = readdirSync(dir).filter((f) => f.endsWith('.tsx') && !['Guide.tsx', 'GuidesIndex.tsx', 'ssr.tsx'].includes(f));

describe('guide citations', () => {
  for (const f of files) {
    it(f, () => {
      const s = readFileSync(`${dir}/${f}`, 'utf8');
      const a = s.indexOf('sources={[');
      expect(a, `${f} has no sources list`).toBeGreaterThanOrEqual(0);
      const n = (s.slice(a, s.indexOf(']}', a)).match(/\{\s*text:/g) ?? []).length;
      const cited = new Set<number>();
      for (const m of s.matchAll(/<Cite n=\{(\[[^\]]*\]|\d+)\}/g)) for (const k of m[1].replace(/[[\]]/g, '').split(',')) cited.add(Number(k.trim()));
      for (const k of cited) expect(k >= 1 && k <= n, `${f}: <Cite n={${k}}> but only ${n} sources`).toBe(true);
      for (let k = 1; k <= n; k++) expect(cited.has(k), `${f}: source ${k} is listed but never cited`).toBe(true);
    });
  }
});
