// The estimated fill of the unfilled zones of chosen nets (kicadZoneFill.ts), in a worker, once per drawing
// and set of nets: the Power and Thermal views ask for the same estimate and share it.
import type { BoardDrawing } from './kicadDrawing';
import type { EstimatedFill, FillRules } from './kicadZoneFill';
import type { KicadZoneFillResponse, ZoneFillRequest } from './kicadZoneFill.worker';

const cache = new WeakMap<BoardDrawing, Map<string, Promise<EstimatedFill>>>();
let nextId = 1;

async function inWorker(req: ZoneFillRequest): Promise<EstimatedFill> {
  if (typeof Worker === 'undefined') {
    const { estimateFills } = await import('./kicadZoneFill');
    return estimateFills(req.d, req.nets, req.rules);
  }
  const worker = new Worker(new URL('./kicadZoneFill.worker.ts', import.meta.url), { type: 'module' });
  const id = nextId++;
  try {
    return await new Promise<EstimatedFill>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<KicadZoneFillResponse>) => {
        if (e.data.id !== id) return;
        if ('result' in e.data) resolve(e.data.result);
        else reject(new Error(e.data.error));
      };
      worker.onerror = () => reject(new Error('The zone fill could not be estimated in this browser.'));
      worker.postMessage({ id, req });
    });
  } finally {
    worker.terminate();
  }
}

/** The estimated fills of the given nets on a drawing; the same drawing and nets give the same promise. */
export function estimatedFills(d: BoardDrawing, nets: string[], rules: FillRules): Promise<EstimatedFill> {
  let m = cache.get(d);
  if (!m) cache.set(d, (m = new Map()));
  const key = [...nets].sort().join('\n');
  const hit = m.get(key);
  if (hit) return hit;
  const { copper, outline, tracks, vias, pads, fills, zones } = d;
  const p = inWorker({ d: { copper, outline, tracks, vias, pads, fills, zones }, nets, rules });
  m.set(key, p);
  p.catch(() => m.delete(key));
  return p;
}
