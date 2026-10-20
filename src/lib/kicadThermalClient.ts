// Runs a board temperature solve in a worker; a newer request ends the one before it.
import type { ThermalRequest, ThermalResult } from './kicadThermal';
import type { KicadThermalResponse } from './kicadThermal.worker';

let current: Worker | null = null;
let nextId = 1;

export async function solveThermalInWorker(req: ThermalRequest): Promise<ThermalResult> {
  if (typeof Worker === 'undefined') {
    const { solveThermal } = await import('./kicadThermal');
    return solveThermal(req);
  }
  current?.terminate();
  const worker = new Worker(new URL('./kicadThermal.worker.ts', import.meta.url), { type: 'module' });
  current = worker;
  const id = nextId++;
  try {
    return await new Promise<ThermalResult>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<KicadThermalResponse>) => {
        if (e.data.id !== id) return;
        if ('result' in e.data) resolve(e.data.result);
        else reject(new Error(e.data.error));
      };
      worker.onerror = () => reject(new Error('The board temperature could not be solved in this browser.'));
      worker.postMessage({ id, req });
    });
  } finally {
    worker.terminate();
    if (current === worker) current = null;
  }
}
