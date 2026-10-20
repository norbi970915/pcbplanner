/// <reference lib="webworker" />
// Solves the DC voltage drop of a power net off the main thread (see kicadPower.ts).
import { solveDc, type DcRequest, type DcResult } from './kicadPower';

export type KicadPowerResponse = { id: number; result: DcResult } | { id: number; error: string };

self.onmessage = (e: MessageEvent<{ id: number; req: DcRequest }>) => {
  const { id, req } = e.data;
  try {
    const result = solveDc(req);
    const buffers = result.ok ? result.layers.flatMap((l) => [l.drop.buffer as ArrayBuffer, l.density.buffer as ArrayBuffer]) : [];
    (self as DedicatedWorkerGlobalScope).postMessage({ id, result } satisfies KicadPowerResponse, buffers);
  } catch (err) {
    (self as DedicatedWorkerGlobalScope).postMessage({ id, error: err instanceof Error ? err.message : String(err) } satisfies KicadPowerResponse);
  }
};
