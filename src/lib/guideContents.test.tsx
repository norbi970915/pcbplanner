import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { insertGuideContents, prepareGuideContents } from './guideContents';
describe('guide contents', () => {
  it('keeps introductory text before contents and includes nested headings and inline math', () => {
    const prepared = prepareGuideContents(<><p>Introduction</p><h2>Spacing <sub>3W</sub> examples</h2><section><h2>Assumptions</h2></section><h2 id="references">Sources</h2></>);
    expect(prepared.sections).toEqual([{ id: 'spacing-3w-examples', title: 'Spacing 3W examples' },
      { id: 'assumptions', title: 'Assumptions' }, { id: 'references', title: 'Sources' }]);
    const html = renderToStaticMarkup(<>{insertGuideContents(prepared.body, <nav key="contents">Contents</nav>)}</>);
    expect(html.indexOf('Introduction')).toBeLessThan(html.indexOf('<nav'));
    expect(html.indexOf('<nav')).toBeLessThan(html.indexOf('<h2'));
    expect(html).toContain('id="references"');
    expect(html).toContain('tabindex="-1"');
  });
  it('creates stable, unique anchors and preserves numbered citations', () => {
    const prepared = prepareGuideContents(<><h2>{'R\u00e9sistor & bias'}</h2><h2>{'R\u00e9sistor & bias'}</h2><h2>Guide contents</h2><a href="#src-1">[1]</a><li id="src-1">Reference</li></>);
    expect(prepared.sections.map(s => s.id)).toEqual(['resistor-bias', 'resistor-bias-2', 'guide-contents-2']);
    expect(renderToStaticMarkup(<>{prepared.body}</>)).toContain('href="#src-1"');
    expect(renderToStaticMarkup(<>{prepared.body}</>)).toContain('id="src-1"');
  });
});
