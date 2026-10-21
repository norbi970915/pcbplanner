import { expect, it } from 'vitest';
import { reportTable } from './kicadProjectReport';

it('treats file-supplied references and net names as text in project reports', () => {
  const table = reportTable(['Net <name>'], [['<img src=x onerror="alert(1)">'], ['U1 & U2']]);
  expect(table).not.toContain('<img');
  expect(table).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  expect(table).toContain('U1 &amp; U2');
});
