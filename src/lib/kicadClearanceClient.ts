// Runs a clearance check in a worker; a newer request ends the one before it.
import type { ClearanceRequest, ClearanceResult } from './kicadClearance';
import type { KicadClearanceResponse } from './kicadClearance.worker';

const current = new Map<string, Worker>();
let nextId = 1;

export async function checkClearanceInWorker(req: ClearanceRequest, channel = 'view'): Promise<ClearanceResult> {
  if (typeof Worker === 'undefined') {
    const { checkClearance } = await import('./kicadClearance');
    return checkClearance(req);
  }
  current.get(channel)?.terminate();
  const worker = new Worker(new URL('./kicadClearance.worker.ts', import.meta.url), { type: 'module' });
  current.set(channel, worker);
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
    if (current.get(channel) === worker) current.delete(channel);
  }
}
