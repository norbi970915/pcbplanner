import { copperThickness, type KicadProjectData } from './kicadProjectQueries';
import { copperFaces } from './kicadVias';
import type { PowerSettings } from './kicadPower';

export function settingsFor(data: KicadProjectData, copper: string[], dT: number, ambient: number): PowerSettings {
  const thickness = Object.fromEntries(copper.map(l => [l, copperThickness(data, l) ?? 0.035]));
  const faces = copperFaces(data.board.stackup);
  const total = data.board.thickness ?? 1.6;
  const layerZ = Object.fromEntries(copper.map((l, i) => {
    const f = faces?.get(l);
    return [l, f ? (f.top + f.bottom) / 2 : copper.length > 1 ? i * total / (copper.length - 1) : 0];
  }));
  return { thickness, layerZ, platingMm: 0.025, tempC: ambient + dT, dTC: dT };
}
