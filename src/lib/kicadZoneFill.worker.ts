/// <reference lib="webworker" />
// Estimates the fill of unfilled zones off the main thread (see kicadZoneFill.ts).
import type { BoardDrawing } from './kicadDrawing';
import { estimateFills, type EstimatedFill, type FillRules } from './kicadZoneFill';

export type ZoneFillRequest = { d: Pick<BoardDrawing, 'copper' | 'outline' | 'tracks' | 'vias' | 'pads' | 'fills' | 'zones'>; nets: string[]; rules: FillRules };
export type KicadZoneFillResponse = { id: number; result: EstimatedFill } | { id: number; error: string };

self.onmessage = (e: MessageEvent<{ id: number; req: ZoneFillRequest }>) => {
  const { id, req } = e.data;
  try {
    const result = estimateFills(req.d, req.nets, req.rules);
    (self as DedicatedWorkerGlobalScope).postMessage({ id, result } satisfies KicadZoneFillResponse, result.fills.map((f) => f.xy.buffer as ArrayBuffer));
  } catch (err) {
    (self as DedicatedWorkerGlobalScope).postMessage({ id, error: err instanceof Error ? err.message : String(err) } satisfies KicadZoneFillResponse);
  }
};
