// Runs a clearance check in a worker; a newer request ends the one before it.
import type { ClearanceRequest, ClearanceResult } from './kicadClearance';
import type { KicadClearanceResponse } from './kicadClearance.worker';

let current: Worker | null = null;
let nextId = 1;

export async function checkClearanceInWorker(req: ClearanceRequest): Promise<ClearanceResult> {
  if (typeof Worker === 'undefined') {
    const { checkClearance } = await import('./kicadClearance');
    return checkClearance(req);
  }
  current?.terminate();
  const worker = new Worker(new URL('./kicadClearance.worker.ts', import.meta.url), { type: 'module' });
  current = worker;
  const id = nextId++;
  try {
    return await new Promise<ClearanceResult>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<KicadClearanceResponse>) => {
        if (e.data.id !== id) return;
        if ('result' in e.data) resolve(e.data.result);
        else reject(new Error(e.data.error));
      };
      worker.onerror = () => reject(new Error('The clearance could not be checked in this browser.'));
      worker.postMessage({ id, req });
    });
  } finally {
    worker.terminate();
    if (current === worker) current = null;
  }
}
