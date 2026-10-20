/// <reference lib="webworker" />
// Solves the board temperature off the main thread (see kicadThermal.ts).
import { solveThermal, type ThermalRequest, type ThermalResult } from './kicadThermal';

export type KicadThermalResponse = { id: number; result: ThermalResult } | { id: number; error: string };

self.onmessage = (e: MessageEvent<{ id: number; req: ThermalRequest }>) => {
  const { id, req } = e.data;
  try {
    const result = solveThermal(req);
    const buffers = result.ok ? result.layers.map((l) => l.temp.buffer as ArrayBuffer) : [];
    (self as DedicatedWorkerGlobalScope).postMessage({ id, result } satisfies KicadThermalResponse, buffers);
  } catch (err) {
    (self as DedicatedWorkerGlobalScope).postMessage({ id, error: err instanceof Error ? err.message : String(err) } satisfies KicadThermalResponse);
  }
};
