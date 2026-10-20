// Runs a DC voltage drop solve in a worker; a newer request ends the one before it.
import type { DcRequest, DcResult } from './kicadPower';
import type { KicadPowerResponse } from './kicadPower.worker';

let current: Worker | null = null;
let nextId = 1;

export async function solveDcInWorker(req: DcRequest): Promise<DcResult> {
  if (typeof Worker === 'undefined') {
    const { solveDc } = await import('./kicadPower');
    return solveDc(req);
  }
  current?.terminate();
  const worker = new Worker(new URL('./kicadPower.worker.ts', import.meta.url), { type: 'module' });
  current = worker;
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
    if (current === worker) current = null;
  }
}

/** Ends a running solve (its promise never settles). */
export function cancelDcSolve() {
  current?.terminate();
  current = null;
}
