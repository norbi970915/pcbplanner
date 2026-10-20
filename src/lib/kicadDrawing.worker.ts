/// <reference lib="webworker" />
// Reads what the board view draws off the main thread (see kicadDrawing.ts).
import { readBoardDrawing, type BoardDrawing } from './kicadDrawing';

export type KicadDrawingResponse = { id: number; ok: true; drawing: BoardDrawing } | { id: number; ok: false; error: string };

self.onmessage = (e: MessageEvent<{ id: number; data: ArrayBuffer }>) => {
  const { id, data } = e.data;
  try {
    const drawing = readBoardDrawing(new TextDecoder('utf-8').decode(data));
    (self as DedicatedWorkerGlobalScope).postMessage({ id, ok: true, drawing } satisfies KicadDrawingResponse, drawing.fills.map((f) => f.xy.buffer as ArrayBuffer));
  } catch (err) {
    (self as DedicatedWorkerGlobalScope).postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies KicadDrawingResponse);
  }
};
