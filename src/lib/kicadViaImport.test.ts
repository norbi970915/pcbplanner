import { describe, expect, it } from 'vitest';
import { exampleBoard, exampleProject } from './kicadExample';
import { parseKicadBoard } from './kicadImport';
import { parseKicadProject, type RawVia } from './kicadRouting';
import { viaImportValues } from './kicadViaImport';
import type { KicadProjectData } from './kicadProjectQueries';

const data: KicadProjectData = { boardName: 'example.kicad_pcb', board: parseKicadBoard(exampleBoard()), project: parseKicadProject(exampleProject(), 'example.kicad_pro'), otherBoards: [], roleOverrides: {} };
const via: RawVia = { x: 1, y: 1, net: 'GND', drill: 0.3, size: 0.6, layers: ['F.Cu', 'B.Cu'] };
describe('via dimensions from a KiCad project', () => {
  it('imports actual through-via dimensions but never invents plating or an antipad', () => {
    expect(viaImportValues(data, via)).toEqual({ len: data.board.thickness, hole: 0.3, pad: 0.6 });
    expect(viaImportValues(data)).toEqual({ len: data.board.thickness });
  });
  it('uses a shorter physical span for a blind via and leaves an unresolved span unchanged', () => {
    const blind = viaImportValues(data, { ...via, layers: ['F.Cu', 'In1.Cu'] });
    expect(blind.len).toBeGreaterThan(0);
    expect(blind.len).toBeLessThan(data.board.thickness! / 2);
    const missing = viaImportValues({ ...data, board: { ...data.board, stackup: null } }, { ...via, layers: ['F.Cu', 'In1.Cu'] });
    expect(missing).toEqual({ hole: 0.3, pad: 0.6 });
  });
});
