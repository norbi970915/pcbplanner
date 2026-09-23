import { describe, expect, it } from 'vitest';
import { averageDk, formatPlies, parsePlies, pliesThickness, slabsAbove, slabsBelow } from './plies';

describe('ply lists', () => {
  it('parses and formats the URL form', () => {
    expect(parsePlies('')).toEqual([]);
    expect(parsePlies('0.084:3.91,0.2104:4.4')).toEqual([{ t: 0.084, dk: 3.91 }, { t: 0.2104, dk: 4.4 }]);
    expect(parsePlies('0.1:4.2:0.015')).toEqual([{ t: 0.1, dk: 4.2, df: 0.015 }]);
    expect(formatPlies([{ t: 0.084, dk: 3.91 }, { t: 0.2104, dk: 4.4, df: 0.02 }])).toBe('0.084:3.91,0.2104:4.4:0.02');
  });
  it('rejects nonsense', () => {
    for (const bad of ['x:4', '0.1:0.5', '-0.1:4', '0.1:4:2', '0.1']) expect(parsePlies(bad)).toBeNull();
  });
  it('thickness and weighted average Dk', () => {
    const p = [{ t: 0.084, dk: 3.91 }, { t: 0.2104, dk: 4.4 }];
    expect(pliesThickness(p)).toBeCloseTo(0.2944, 9);
    expect(averageDk(p)).toBeCloseTo((0.084 * 3.91 + 0.2104 * 4.4) / 0.2944, 9);
  });
  it('slabs below run from the plane up to the trace, without gaps', () => {
    const s = slabsBelow([{ t: 0.084, dk: 3.91 }, { t: 0.2104, dk: 4.4 }]);
    expect(s[0]).toEqual({ y0: 0, y1: 0.084, er: 3.91 });
    expect(s[1].y0).toBeCloseTo(0.084, 9);
    expect(s[1].y1).toBeCloseTo(0.2944, 9);
  });
  it('the first ply above includes the copper thickness (it fills beside the trace)', () => {
    const s = slabsAbove([{ t: 0.1, dk: 4 }, { t: 0.2, dk: 4.4 }], 0.3, 0.035);
    expect(s[0]).toEqual({ y0: 0.3, y1: 0.435, er: 4 });
    expect(s[1]).toEqual({ y0: 0.435, y1: 0.635, er: 4.4 });
  });
});

describe('stacked plies match the stackup path', () => {
  it('slabs built from a ply list equal the ones the advisor solves', async () => {
    const { toSolverGeometry } = await import('./design');
    const { geometryForLayer, PRESETS } = await import('./stackups');
    // a 4-layer build with two prepreg plies of different Dk under the outer layer
    const s = PRESETS.find((x) => x.id === 'std-4l-8-1080-2')!;
    const l1 = s.layers.find((l) => l.kind === 'copper')!;
    const sg = geometryForLayer(s, l1.id)!;
    expect(sg.below!.length).toBe(2);
    const plies = sg.below!.map((x) => ({ t: x.t, dk: x.er }));
    expect(slabsBelow(plies)).toEqual(toSolverGeometry(sg, 0.2, false, undefined, 0.0127).slabs);
    // the single-Dk shortcut is a different cross-section
    expect(averageDk(plies)).not.toBeCloseTo(plies[0].dk, 2);
  });
});

describe('library material per ply', () => {
  it('round-trips the material id, with and without Df', () => {
    expect(parsePlies('0.1:4.4::s1141')).toEqual([{ t: 0.1, dk: 4.4, mat: 's1141' }]);
    expect(parsePlies('0.1:4.4:0.015:np155f')).toEqual([{ t: 0.1, dk: 4.4, df: 0.015, mat: 'np155f' }]);
    expect(formatPlies([{ t: 0.1, dk: 4.4, mat: 's1141' }])).toBe('0.1:4.4::s1141');
    expect(formatPlies([{ t: 0.1, dk: 4.4, df: 0.015, mat: 'np155f' }])).toBe('0.1:4.4:0.015:np155f');
    expect(parsePlies(formatPlies([{ t: 0.2, dk: 3.9 }]))).toEqual([{ t: 0.2, dk: 3.9 }]);
  });
  it('rejects a material id that is not an id', () => {
    expect(parsePlies('0.1:4.4::bad id')).toBeNull();
  });
});
