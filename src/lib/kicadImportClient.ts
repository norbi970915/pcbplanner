// Runs the .kicad_pcb reader in a Web Worker (falls back to the main thread where workers are missing).
import { parseKicadBoard, type KicadBoard } from './kicadImport';
import type { KicadWorkerResponse } from './kicadImport.worker';
import type { Stackup } from './stackups';
import { stackupStore } from '../state/stackupStore';

/** Largest board file accepted (KiCad boards with thousands of tracks stay well below this). */
export const MAX_KICAD_BYTES = 200e6;

let nextId = 1;

export async function readKicadFile(file: Blob): Promise<KicadBoard> {
  if (file.size > MAX_KICAD_BYTES) throw new Error(`The file is larger than ${MAX_KICAD_BYTES / 1e6} MB.`);
  const data = await file.arrayBuffer();
  if (typeof Worker === 'undefined') return parseKicadBoard(new TextDecoder('utf-8').decode(data));
  const worker = new Worker(new URL('./kicadImport.worker.ts', import.meta.url), { type: 'module' });
  const id = nextId++;
  try {
    return await new Promise<KicadBoard>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<KicadWorkerResponse>) => {
        if (e.data.id !== id) return;
        if (e.data.ok) resolve(e.data.board);
        else reject(new Error(e.data.error));
      };
      worker.onerror = () => reject(new Error('The file could not be read in this browser.'));
      worker.postMessage({ id, data }, [data]);
    });
  } finally {
    worker.terminate();
  }
}

/**
 * Save an imported stackup to “My stackups” and return its id. The same import is saved once; when a
 * stackup with that id was edited since, the import is saved beside it under a new id.
 */
export function saveImportedStackup(s: Stackup): string {
  const same = (a: Stackup) => JSON.stringify([a.name, a.layers]) === JSON.stringify([s.name, s.layers]);
  const existing = stackupStore.get().find((x) => x.id === s.id);
  if (existing && same(existing)) return s.id;
  const id = existing ? `${s.id}-${Date.now().toString(36)}` : s.id;
  stackupStore.save({ ...s, id });
  return id;
}
