// Track geometry of the active KiCad project, for tools that measure the routed copper (the Crosstalk
// Calculator's parallel runs). The project store keeps the parsed board without coordinates, so the
// board text is read back from where the store saved it (IndexedDB, src/state/kicadProjectStore.ts),
// or fetched again for the site's example, and its tracks are read in a worker. The result is cached
// per loaded board. The number of items read must match the loaded board, so a different board saved
// by another tab is never measured.
import type { KicadProjectData } from './kicadProjectQueries';
import { unpackTracks, type PackedTracks } from './kicadTracks';
import type { KicadTracksResponse } from './kicadTracks.worker';
import type { RawTrack } from './kicadRouting';
import { indexedDbStorage, KICAD_EXAMPLE } from '../state/kicadProjectStore';

const cache = new WeakMap<object, Promise<RawTrack[]>>();
let nextId = 1;

async function readInWorker(text: string): Promise<PackedTracks> {
  const data = new TextEncoder().encode(text).buffer as ArrayBuffer;
  if (typeof Worker === 'undefined') {
    const { extractTracks, packTracks } = await import('./kicadTracks');
    const { tracks, read } = extractTracks(text);
    return packTracks(tracks, read);
  }
  const worker = new Worker(new URL('./kicadTracks.worker.ts', import.meta.url), { type: 'module' });
  const id = nextId++;
  try {
    return await new Promise<PackedTracks>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<KicadTracksResponse>) => {
        if (e.data.id !== id) return;
        if (e.data.ok) resolve(e.data.packed);
        else reject(new Error(e.data.error));
      };
      worker.onerror = () => reject(new Error('The board could not be read in this browser.'));
      worker.postMessage({ id, data }, [data]);
    });
  } finally {
    worker.terminate();
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The saved board text when it is the board that is loaded (the store saves it just after loading, so a fresh load is waited for briefly). */
async function boardText(d: KicadProjectData): Promise<string | null> {
  const s = indexedDbStorage();
  for (let i = 0; s && i < 6; i++) {
    try {
      const rec = (await s.get('files')) as { boardName?: unknown; boardText?: unknown } | undefined;
      if (rec && rec.boardName === d.boardName && typeof rec.boardText === 'string') return rec.boardText;
    } catch {
      break; // storage blocked
    }
    await wait(500);
  }
  if (d.boardName === KICAD_EXAMPLE.board.name && typeof fetch !== 'undefined') {
    const r = await fetch(KICAD_EXAMPLE.board.url);
    if (r.ok) return r.text();
  }
  return null;
}

/** Every copper track of the active project, with net and layer. Rejects with a plain message when the board text is not available. */
export function projectTracks(d: KicadProjectData): Promise<RawTrack[]> {
  const hit = cache.get(d.board);
  if (hit) return hit;
  const p = (async () => {
    const text = await boardText(d);
    if (text === null) throw new Error(`The track geometry of ${d.boardName} is not available: this browser did not keep the board file. Load the board again on the KiCad project page.`);
    const packed = await readInWorker(text);
    if (packed.read !== d.board.stats.tracks) throw new Error(`The board file saved in this browser is not the ${d.boardName} that is loaded. Load the board again on the KiCad project page.`);
    return unpackTracks(packed);
  })();
  cache.set(d.board, p);
  p.catch(() => cache.delete(d.board));
  return p;
}
