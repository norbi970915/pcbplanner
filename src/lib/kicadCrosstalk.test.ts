/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { CROSSTALK_DEFAULTS, crosstalkGeometry } from './crosstalk';
import { toSolverGeometry } from './design';
import type { Geometry } from './fieldsolver';
import { crosstalkLayerFields, crosstalkPatch } from './kicadCrosstalk';
import { exampleBoard, exampleProject, EXAMPLE_FILE, EXAMPLE_PROJECT_FILE } from './kicadExample';
import { ETCH } from './kicadImpedance';
import { parseKicadBoard } from './kicadImport';
import { indexTracks, parallelRun } from './kicadParallel';
import { layerGeometry, type KicadProjectData } from './kicadProjectQueries';
import { parseKicadProject } from './kicadRouting';
import { extractTracks } from './kicadTracks';

const text = exampleBoard();
const board = parseKicadBoard(text);
const data: KicadProjectData = { boardName: EXAMPLE_FILE, board, project: parseKicadProject(exampleProject(), EXAMPLE_PROJECT_FILE), projectName: EXAMPLE_PROJECT_FILE, otherBoards: [], roleOverrides: {} };
const ix = indexTracks(extractTracks(text).tracks);
const r9 = (v: number) => Number(v.toFixed(9));
const shape = (g: Geometry) => ({ slabs: g.slabs.map((s) => [s.y0, s.y1, s.er].map(r9)), rest: [g.w, g.wTop, g.t, g.yTrace, g.s, g.diff, g.topPlane, g.mask] });

describe('Crosstalk Calculator cross-section', () => {
  it('the defaults give the cross-section the tool always solved (mask 0.0305 / 0.0152 mm, εr 3.8; no etch)', () => {
    expect(crosstalkGeometry(CROSSTALK_DEFAULTS, 0.15).geom).toEqual({ w: 0.15, wTop: undefined, t: 0.035, yTrace: 0.1, diff: true, s: 0.15, coplanarGap: undefined, slabs: [{ y0: 0, y1: 0.1, er: 4.1 }], mask: { surfaceY: 0.1, overSubstrate: 0.0305, overTrace: 0.0152, er: 3.8 } });
    const sl = crosstalkGeometry({ ...CROSSTALK_DEFAULTS, type: 'stripline' }, 0.15).geom!;
    expect([sl.slabs, sl.topPlane, sl.mask]).toEqual([[{ y0: 0, y1: 0.1, er: 4.1 }, { y0: 0.1, y1: 0.1 + 0.035 + 0.2, er: 4.2 }], 0.1 + 0.035 + 0.2, undefined]);
  });

  it('the fields taken from a KiCad layer rebuild the geometry /kicad-impedance solves, on every signal layer and with or without mask', () => {
    for (const mask of [true, false])
      for (const name of ['F.Cu', 'In2.Cu', 'B.Cu']) {
        const g = layerGeometry(data, name, { mask })!;
        const built = crosstalkGeometry({ ...CROSSTALK_DEFAULTS, ...crosstalkLayerFields(g), w: 0.13 }, 0.16).geom!;
        expect(shape(built)).toEqual(shape(toSolverGeometry(g.sg, 0.13, true, 0.16, ETCH)));
      }
  });
});

describe('Apply from the example project', () => {
  it('the two nets of the PCIe pair on F.Cu set W, S and the coupled length', () => {
    const g = layerGeometry(data, 'F.Cu')!;
    const patch = crosstalkPatch(g, parallelRun(ix, 'F.Cu', '/PCIE_TX0_P', '/PCIE_TX0_N')!)!;
    expect(patch).toMatchObject({ type: 'microstrip', mask: true, w: 0.133, s: 0.15, len: 45, t: g.sg.t, etch: ETCH });
    expect(patch).not.toHaveProperty('tr');
    expect(patch).not.toHaveProperty('v');
  });

  it('a stripline layer brings H2 and εr2', () => {
    const g = layerGeometry(data, 'In2.Cu')!;
    const patch = crosstalkPatch(g, parallelRun(ix, 'In2.Cu', '/USB_D+', '/USB_D-')!)!;
    expect(patch).toMatchObject({ type: 'stripline', w: 0.2, s: 0.15, h: g.sg.h, h2: g.sg.h2 });
    expect(patch.len).toBeGreaterThan(22);
    expect(patch).not.toHaveProperty('mask');
  });

  it('nets that do not run in parallel set nothing', () => {
    expect(crosstalkPatch(layerGeometry(data, 'In2.Cu')!, parallelRun(ix, 'In2.Cu', '/CLK', '/SDA')!)).toBeNull();
  });
});
