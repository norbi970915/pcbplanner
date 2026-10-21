import { describe, expect, it } from 'vitest';
import type { DrawPad } from './kicadDrawing';
import { spread } from './spreading';
import { decodeSources, encodeSources, faceCoefficients, K_CU_BOARD, solveThermal, type ThermalRequest } from './kicadThermal';

const rect = (x0: number, y0: number, x1: number, y1: number) => Float64Array.from([x0, y0, x1, y0, x1, y1, x0, y1]);
const pad = (ref: string, x: number, y: number, w: number, h: number, layers = ['F.Cu']): DrawPad => ({ x, y, w, h, angle: 0, shape: 'rect', layers, net: 'GND', ref, num: '1' });

function board(w: number, h: number, copper: string[], extra: Partial<ThermalRequest['d']> = {}): ThermalRequest['d'] {
  return {
    copper,
    outline: [[[0, 0], [w, 0], [w, h], [0, h]]],
    tracks: [],
    vias: [],
    fills: [],
    pads: [],
    parts: [],
    ...extra,
  };
}

const base = (d: ThermalRequest['d'], over: Partial<ThermalRequest> = {}): ThermalRequest => ({
  d,
  thickness: Object.fromEntries(d.copper.map((l) => [l, 0.035])),
  layerZ: Object.fromEntries(d.copper.map((l, i) => [l, d.copper.length > 1 ? (i * 1.6) / (d.copper.length - 1) : 0])),
  boardThickness: 1.6,
  sources: [],
  ambientC: 25,
  air: { mode: 'forced', h: 10 },
  emissivity: 0,
  kXY: 0,
  kZ: 0.3,
  platingMm: 0.025,
  ...over,
});

describe('board temperature', () => {
  it('a plate that spreads heat well sits at P / (2hA) above ambient', () => {
    // 50 × 50 mm, both layers solid 1 mm copper: nearly isothermal
    const d = board(50, 50, ['F.Cu', 'B.Cu'], {
      fills: [{ layer: 'F.Cu', xy: rect(0, 0, 50, 50), net: 'GND' } as never, { layer: 'B.Cu', xy: rect(0, 0, 50, 50), net: 'GND' } as never],
      pads: [pad('U1', 25, 25, 2, 2)],
      parts: [{ ref: 'U1', x: 25, y: 25, back: false }],
      vias: [{ net: 'GND', x: 25, y: 25, layers: ['F.Cu', 'B.Cu'], size: 0.6, drill: 0.3 }],
    });
    const r = solveThermal(base(d, { thickness: { 'F.Cu': 1, 'B.Cu': 1 }, sources: [{ ref: 'U1', watts: 1 }], res: 1 }));
    if (!r.ok) throw new Error(r.error);
    const rise = 1 / (2 * 10 * 0.05 * 0.05); // 20 °C
    expect(r.meanRise / rise).toBeCloseTo(1, 2); // the outline's edge cells
    expect(r.balanceW).toBeCloseTo(1, 4);
    const t = r.layers[0].temp.filter(Number.isFinite);
    expect(Math.min(...t) - 25).toBeGreaterThan(rise * 0.95);
    expect(Math.max(...t) - 25).toBeLessThan(rise * 1.1);
  });

  it('a copper strip heated at one end falls off as the fin solution cosh(m(L − x))', () => {
    // 100 × 5 mm, one layer of 35 µm copper cooled on both faces with h = 10: m = √(2h / (k t))
    const d = board(100, 5, ['F.Cu'], { fills: [{ layer: 'F.Cu', xy: rect(0, 0, 100, 5), net: 'GND' } as never], pads: [pad('U1', 0.5, 2.5, 1, 5)], parts: [{ ref: 'U1', x: 0.5, y: 2.5, back: false }] });
    const r = solveThermal(base(d, { sources: [{ ref: 'U1', watts: 0.1 }], res: 0.25 }));
    if (!r.ok) throw new Error(r.error);
    const m = Math.sqrt((2 * 10) / (K_CU_BOARD * 35e-6)) / 1000; // per mm
    const at = (x: number) => {
      const map = r.layers[0];
      return map.temp[Math.round((2.5 - map.y0) / map.res) * map.nx + Math.round((x - map.x0) / map.res)] - 25;
    };
    const fin = (x: number) => Math.cosh(m * (100 - x));
    expect(at(30) / at(10)).toBeCloseTo(fin(30) / fin(10), 2);
    expect(at(60) / at(20)).toBeCloseTo(fin(60) / fin(20), 2);
    // base: P / (√(2h·k·t) · W · tanh(mL))
    const theta0 = 0.1 / (Math.sqrt(2 * 10 * K_CU_BOARD * 35e-6) * 0.005 * Math.tanh(m * 100));
    expect(at(1) / theta0).toBeGreaterThan(0.93);
    expect(at(1) / theta0).toBeLessThan(1.05);
  });

  it('a part on the back heats the back layer, and vias carry the heat through', () => {
    const fills = [{ layer: 'F.Cu', xy: rect(0, 0, 30, 30), net: 'GND' } as never, { layer: 'B.Cu', xy: rect(0, 0, 30, 30), net: 'GND' } as never];
    const d0 = board(30, 30, ['F.Cu', 'B.Cu'], { fills, pads: [pad('U1', 15, 15, 3, 3, ['B.Cu'])], parts: [{ ref: 'U1', x: 15, y: 15, back: true }] });
    const vias = Array.from({ length: 9 }, (_, i) => ({ net: 'GND', x: 14 + (i % 3), y: 14 + Math.floor(i / 3), layers: ['F.Cu', 'B.Cu'], size: 0.6, drill: 0.3 }));
    const req = (d: ThermalRequest['d']) => base(d, { sources: [{ ref: 'U1', watts: 1 }], res: 0.5 });
    const without = solveThermal(req(d0));
    const withVias = solveThermal(req({ ...d0, vias }));
    if (!without.ok || !withVias.ok) throw new Error('solve');
    expect(without.parts[0].back).toBe(true);
    expect(without.hottest.layer).toBe('B.Cu');
    // nine vias under the part lower its temperature
    expect(withVias.parts[0].maxC).toBeLessThan(without.parts[0].maxC - 1);
    expect(withVias.balanceW).toBeCloseTo(1, 4);
  });
});

describe('faces', () => {
  it('still air on a horizontal board: the heat balance holds at the rise it finds', () => {
    const f = faceCoefficients(2, 0.01, 25, { mode: 'natural', orient: 'horizontal' }, 0.9);
    expect(f.dT * (f.hTop + f.hBottom + 2 * f.hRad) * 0.01).toBeCloseTo(2, 6);
    // natural convection a few W/m²K per face, radiation about 6 W/m²K near room temperature
    expect(f.hTop).toBeGreaterThan(f.hBottom);
    expect(f.hRad).toBeGreaterThan(5);
    expect(f.hRad).toBeLessThan(8);
  });

  it('keeps the sources in the address', () => {
    const list = [{ ref: 'U3', watts: 1.2, psi: 12 }, { ref: 'U5', watts: 0.4 }];
    expect(encodeSources(list)).toBe('U3:1.2:12,U5:0.4');
    expect(decodeSources('U3:1.2:12,U5:0.4')).toEqual([{ ref: 'U3', watts: 1.2, psi: 12 }, { ref: 'U5', watts: 0.4, psi: undefined }]);
  });
});

describe('against the heat-spreading tool', () => {
  it('a square pour around a hot pad agrees with the annular-fin solution', () => {
    // 50 × 50 mm of 70 µm copper, a 5 × 5 mm hot pad in the middle, h = 10 W/m²K per face
    const d = board(50, 50, ['F.Cu'], { fills: [{ layer: 'F.Cu', xy: rect(0, 0, 50, 50), net: 'GND' } as never], pads: [pad('U1', 25, 25, 5, 5)], parts: [{ ref: 'U1', x: 25, y: 25, back: false }] });
    const r = solveThermal(base(d, { thickness: { 'F.Cu': 0.07 }, sources: [{ ref: 'U1', watts: 1 }], res: 0.25 }));
    if (!r.ok) throw new Error(r.error);
    const fin = spread({ power: 1, taC: 25, sourceSide: 0.005, pourSide: 0.05, copperT: 70e-6, layers: 1, kCu: K_CU_BOARD, emissivity: 0, orient: 'horizontal', hForced: 10 });
    const ratio = (r.parts[0].meanC - 25) / (fin.tBoard - 25);
    expect(ratio).toBeGreaterThan(0.93);
    expect(ratio).toBeLessThan(1.07);
  });
});

describe('which outline is the board', () => {
  const fill = (x0: number, y0: number, x1: number, y1: number) => ({ layer: 'F.Cu', xy: rect(x0, y0, x1, y1), net: 'GND' }) as never;
  const heat = { pads: [pad('U1', 20, 20, 2, 2)], parts: [{ ref: 'U1', x: 20, y: 20, back: false }] };

  it('the largest closed shape is the board and a shape inside it is a cut-out', () => {
    const d = board(40, 40, ['F.Cu'], { ...heat, fills: [fill(0, 0, 40, 40)] });
    d.outline = [d.outline[0], [[30, 30], [36, 30], [36, 36], [30, 36]], [[100, 100], [110, 100], [110, 110], [100, 110]]];
    const r = solveThermal(base(d, { sources: [{ ref: 'U1', watts: 1 }], res: 0.5 }));
    if (!r.ok) throw new Error(r.error);
    expect(r.outlineUsed).toBe('outline');
    const m = r.layers[0];
    const at = (x: number, y: number) => m.temp[Math.round((y - m.y0) / m.res) * m.nx + Math.round((x - m.x0) / m.res)];
    expect(at(33, 33)).toBeNaN(); // the cut-out is not board
    expect(at(10, 10)).toBeGreaterThan(25);
    expect(r.boardAreaMm2).toBeCloseTo(40 * 40 - 6 * 6, -1); // the stray shape far away is left out
  });

  it('a small closed shape that leaves the copper out is not taken as the board', () => {
    // only a 6 × 1 mm slot is closed in the file; the copper spans 40 × 40 mm
    const d = board(40, 40, ['F.Cu'], { ...heat, fills: [fill(0, 0, 40, 40)] });
    d.outline = [[[10, 30], [16, 30], [16, 31], [10, 31]]];
    const r = solveThermal(base(d, { sources: [{ ref: 'U1', watts: 1 }], res: 0.5 }));
    if (!r.ok) throw new Error(r.error);
    expect(r.outlineUsed).toBe('copper');
    expect(r.boardAreaMm2).toBeGreaterThan(1500);
  });
});
