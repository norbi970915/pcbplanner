// The drawing of the active KiCad project for the board view: read from the board text the store saved
// (or the site's example), in a worker, once per loaded board. The number of track items read must match
// the loaded board, so a different board saved by another tab is never drawn.
import type { BoardDrawing } from './kicadDrawing';
import type { KicadDrawingResponse } from './kicadDrawing.worker';
import type { KicadProjectData } from './kicadProjectQueries';
import { boardText } from './kicadTracksClient';

const cache = new WeakMap<object, Promise<BoardDrawing>>();
let nextId = 1;

async function readInWorker(text: string): Promise<BoardDrawing> {
  if (typeof Worker === 'undefined') {
    const { readBoardDrawing } = await import('./kicadDrawing');
    return readBoardDrawing(text);
  }
  const data = new TextEncoder().encode(text).buffer as ArrayBuffer;
  const worker = new Worker(new URL('./kicadDrawing.worker.ts', import.meta.url), { type: 'module' });
  const id = nextId++;
  try {
    return await new Promise<BoardDrawing>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<KicadDrawingResponse>) => {
        if (e.data.id !== id) return;
        if (e.data.ok) resolve(e.data.drawing);
        else reject(new Error(e.data.error));
      };
      worker.onerror = () => reject(new Error('The board could not be drawn in this browser.'));
      worker.postMessage({ id, data }, [data]);
    });
  } finally {
    worker.terminate();
  }
}

/** The drawing of the active project. Rejects with a plain message when the board text is not available. */
export function projectDrawing(d: KicadProjectData): Promise<BoardDrawing> {
  const hit = cache.get(d.board);
  if (hit) return hit;
  const p = (async () => {
    const text = await boardText(d);
    if (text === null) throw new Error(`${d.boardName} cannot be drawn: this browser did not keep the board file. Load the board again on this page.`);
    const drawing = await readInWorker(text);
    if (drawing.read !== d.board.stats.tracks) throw new Error(`The board file saved in this browser is not the ${d.boardName} that is loaded. Load the board again on this page.`);
    return drawing;
  })();
  cache.set(d.board, p);
  p.catch(() => cache.delete(d.board));
  return p;
}
