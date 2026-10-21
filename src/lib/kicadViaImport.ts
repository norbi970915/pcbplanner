import { stackupItemThickness } from './kicadImport';
import type { KicadProjectData } from './kicadProjectQueries';
import type { RawVia } from './kicadRouting';
import { copperFaces } from './kicadVias';

/** Import only dimensions present in the file. Plating and antipads are fabrication assumptions. */
export function viaImportValues(data: KicadProjectData, selected?: RawVia): { len?: number; hole?: number; pad?: number } {
  const total = data.board.thickness ?? stackupItemThickness(data.board);
  let len = total > 0 ? total : undefined;
  if (selected) {
    const copper = data.board.copper.map(l => l.name);
    const layers = selected.layers.filter(l => copper.includes(l));
    const through = layers.includes(copper[0]) && layers.includes(copper[copper.length - 1]);
    if (!through) {
      const faces = copperFaces(data.board.stackup);
      const positions = layers.map(l => faces?.get(l)).filter(x => x !== undefined);
      len = positions.length >= 2 ? Math.max(...positions.map(x => x.bottom)) - Math.min(...positions.map(x => x.top)) : undefined;
    }
  }
  return { ...(len !== undefined && len > 0 ? { len } : {}), ...(selected?.drill !== undefined && selected.drill > 0 ? { hole: selected.drill } : {}), ...(selected?.size !== undefined && selected.size > 0 ? { pad: selected.size } : {}) };
}
