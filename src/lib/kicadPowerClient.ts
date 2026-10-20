// Runs a DC voltage drop solve in a worker; a newer request on the same channel ends the one before it
// (the supply and the return net solve side by side on two channels).
import type { DcRequest, DcResult } from './kicadPower';
import type { KicadPowerResponse } from './kicadPower.worker';

const current = new Map<string, Worker>();
let nextId = 1;

export async function solveDcInWorker(req: DcRequest, channel = 'supply'): Promise<DcResult> {
  if (typeof Worker === 'undefined') {
    const { solveDc } = await import('./kicadPower');
    return solveDc(req);
  }
  current.get(channel)?.terminate();
  const worker = new Worker(new URL('./kicadPower.worker.ts', import.meta.url), { type: 'module' });
  current.set(channel, worker);
  const id = nextId++;
  try {
    return await new Promise<DcResult>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<KicadPowerResponse>) => {
        if (e.data.id !== id) return;
        if ('result' in e.data) resolve(e.data.result);
        else reject(new Error(e.data.error));
      };
      worker.onerror = () => reject(new Error('The voltage drop could not be solved in this browser.'));
      worker.postMessage({ id, req });
    });
  } finally {
    worker.terminate();
    if (current.get(channel) === worker) current.delete(channel);
  }
}

/** Ends a running solve (its promise never settles). */
export function cancelDcSolve(channel = 'supply') {
  current.get(channel)?.terminate();
  current.delete(channel);
}
