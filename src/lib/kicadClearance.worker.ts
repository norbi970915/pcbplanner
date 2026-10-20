/// <reference lib="webworker" />
// Checks the clearance of high-voltage nets off the main thread (see kicadClearance.ts).
import { checkClearance, type ClearanceRequest, type ClearanceResult } from './kicadClearance';

export type KicadClearanceResponse = { id: number; result: ClearanceResult } | { id: number; error: string };

self.onmessage = (e: MessageEvent<{ id: number; req: ClearanceRequest }>) => {
  const { id, req } = e.data;
  try {
    (self as DedicatedWorkerGlobalScope).postMessage({ id, result: checkClearance(req) } satisfies KicadClearanceResponse);
  } catch (err) {
    (self as DedicatedWorkerGlobalScope).postMessage({ id, error: err instanceof Error ? err.message : String(err) } satisfies KicadClearanceResponse);
  }
};
