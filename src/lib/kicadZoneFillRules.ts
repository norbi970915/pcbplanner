import type { BoardDrawing } from './kicadDrawing';
import type { KicadProjectData } from './kicadProjectQueries';
import { netClassResolver } from './kicadRouting';
import type { FillRules } from './kicadZoneFill';

export function zoneFillRules(data: KicadProjectData, raw: BoardDrawing | undefined): FillRules {
  const resolve = netClassResolver(data.project);
  const netClearance: Record<string, number> = {};
  if (raw) for (const n of new Set([...raw.pads, ...raw.tracks, ...raw.vias, ...raw.fills].map(x => x.net))) {
    const c = resolve(n).clearance;
    if (c !== undefined) netClearance[n] = c;
  }
  return { netClearance, edgeClearance: data.project?.edgeClearance, holeClearance: data.project?.holeClearance };
}
