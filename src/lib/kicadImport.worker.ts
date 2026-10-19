/// <reference lib="webworker" />
// Reads a .kicad_pcb file off the main thread, so a large board never freezes the page.
import { parseKicadBoard, type KicadBoard } from './kicadImport';

export type KicadWorkerResponse = { id: number; ok: true; board: KicadBoard } | { id: number; ok: false; error: string };

self.onmessage = (e: MessageEvent<{ id: number; data: ArrayBuffer }>) => {
  const { id, data } = e.data;
  try {
    const board = parseKicadBoard(new TextDecoder('utf-8').decode(data));
    (self as DedicatedWorkerGlobalScope).postMessage({ id, ok: true, board } satisfies KicadWorkerResponse);
  } catch (err) {
    (self as DedicatedWorkerGlobalScope).postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies KicadWorkerResponse);
  }
};
