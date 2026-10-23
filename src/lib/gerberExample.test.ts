import { describe, expect, it, vi } from 'vitest';
import { GERBER_EXAMPLE_FILES, loadGerberExample } from './gerberExample';

describe('downloadable Gerber example', () => {
  it('fetches six matching native layers for the requested revision with cancellation', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(async () => new Response('G04 native artwork*\nM02*'));
    const files = await loadGerberExample('b', controller.signal, fetcher as typeof fetch);
    expect(files.map(file => file.name)).toEqual(GERBER_EXAMPLE_FILES.map(suffix => 'LinkBench-4-' + suffix));
    for (const [url, options] of fetcher.mock.calls as unknown as [string, RequestInit][]) {
      expect(url).toMatch(/^\/examples\/linkbench-4\/gerbers\/rev-b\/LinkBench-4-/);
      expect(options.signal).toBe(controller.signal);
    }
  });
  it('reports a missing download instead of importing its error page as artwork', async () => {
    const fetcher = vi.fn(async () => new Response('Not found', { status: 404 }));
    await expect(loadGerberExample('a', new AbortController().signal, fetcher as typeof fetch)).rejects.toThrow('HTTP 404');
  });
});
