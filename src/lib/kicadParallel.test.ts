/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { exampleBoard, exampleProject, EXAMPLE_FILE, EXAMPLE_PROJECT_FILE } from './kicadExample';
import { parseKicadBoard } from './kicadImport';
import { indexTracks, maxCoupledGap, measureParallel, neighbours, parallelLayers, parallelRun, PARALLEL } from './kicadParallel';
import { pairSummary, type KicadProjectData } from './kicadProjectQueries';
import { parseKicadProject, trackLength, type RawTrack } from './kicadRouting';
import { extractTracks, packTracks, unpackTracks } from './kicadTracks';

const seg = (net: string, x1: number, y1: number, x2: number, y2: number, w = 0.1, layer = 'F.Cu'): RawTrack => ({ net, layer, w, x1, y1, x2, y2 });

describe('parallel runs of two nets (synthetic)', () => {
  it('two straight traces: the spacing, coupled length and widths exactly', () => {
    const r = measureParallel([seg('A', 0, 0, 20, 0)], [seg('B', 0, 0.3, 20, 0.3)]);
    expect(r.coupled).toBeCloseTo(20, 9);
    expect([r.coupledA, r.coupledB].map((v) => +v.toFixed(9))).toEqual([20, 20]);
    expect([r.gap, r.gapMin, r.gapMax, r.wA, r.wB]).toEqual([0.2, 0.2, 0.2, 0.1, 0.1]);
    expect(r.maxGap).toBe(0.5);
  });

  it('a jog and a partial overlap: each stretch at its own spacing, the 45° jog and the run past the end not counted', () => {
    // A runs 30 mm; B runs alongside for 12 mm at 0.2 mm, jogs 0.1 mm outward, then 7.9 mm at 0.3 mm, and stops at x = 20
    const a = [seg('A', 0, 0, 10, 0), seg('A', 10, 0, 30, 0)];
    const b = [seg('B', 0, 0.3, 12, 0.3), seg('B', 12, 0.3, 12.1, 0.4), seg('B', 12.1, 0.4, 20, 0.4)];
    const r = measureParallel(a, b);
    expect(r.coupledA).toBeCloseTo(19.9, 9);
    expect(r.coupledB).toBeCloseTo(19.9, 9);
    expect(r.coupled).toBeCloseTo(19.9, 9);
    expect([r.gap, r.gapMin, r.gapMax]).toEqual([0.2, 0.2, 0.3]); // 12 mm at 0.2 dominates 7.9 mm at 0.3
  });

  it('direction does not matter; different widths are reported per net and the spacing is edge to edge', () => {
    const r = measureParallel([seg('A', 20, 0, 0, 0, 0.2)], [seg('B', 5, 0.4, 15, 0.4, 0.1)]);
    expect(r.coupled).toBeCloseTo(10, 9);
    expect([r.gap, r.wA, r.wB]).toEqual([0.25, 0.2, 0.1]);
    expect(r.maxGap).toBe(maxCoupledGap(0.2, 0.1)); // 5 × 0.2 = 1.0
    expect(r.maxGap).toBe(1);
  });

  it('beyond the coupled spacing, crossing at an angle, or overlapping copper: no parallel run', () => {
    expect(measureParallel([seg('A', 0, 0, 20, 0)], [seg('B', 0, 0.7, 20, 0.7)]).coupled).toBe(0); // 0.6 mm > 0.5 mm
    expect(measureParallel([seg('A', 0, 0, 20, 0)], [seg('B', 0, 0.7, 20, 0.7)], { maxGap: 1 }).gap).toBe(0.6);
    const tilt = (deg: number) => [seg('B', 0, 0.3, 20 * Math.cos((deg * Math.PI) / 180), 0.3 + 20 * Math.sin((deg * Math.PI) / 180))];
    expect(measureParallel([seg('A', 0, 0, 20, 0)], tilt(PARALLEL.parallelDeg + 2), { maxGap: 50 }).coupled).toBe(0);
    expect(measureParallel([seg('A', 0, 0, 20, 0)], tilt(PARALLEL.parallelDeg - 2), { maxGap: 50 }).coupled).toBeGreaterThan(0);
    expect(measureParallel([seg('A', 0, 0, 20, 0)], [seg('B', 0, 0.05, 20, 0.05)]).coupled).toBe(0);
  });

  it('concentric arcs: the arc lengths and the radial spacing', () => {
    const arc = (net: string, r: number): RawTrack => ({ net, layer: 'F.Cu', w: 0.1, x1: r, y1: 0, mx: r * Math.SQRT1_2, my: r * Math.SQRT1_2, x2: 0, y2: r });
    const r = measureParallel([arc('A', 10)], [arc('B', 10.3)]);
    expect(r.gap).toBeCloseTo(0.2, 3);
    expect(r.coupled).toBeCloseTo(((10 + 10.3) / 2) * (Math.PI / 2), 1);
  });

  it('a board index: per layer, and the layers where two nets run together', () => {
    const ix = indexTracks([seg('A', 0, 0, 20, 0), seg('B', 0, 0.3, 20, 0.3), seg('A', 0, 0, 20, 0, 0.1, 'In2.Cu'), seg('B', 0, 0.35, 10, 0.35, 0.1, 'In2.Cu'), seg('C', 0, 5, 20, 5, 0.1, 'B.Cu')]);
    expect(parallelRun(ix, 'F.Cu', 'A', 'C')).toBeNull();
    expect(parallelLayers(ix, 'A', 'B').map((r) => [r.layer, +r.coupled.toFixed(6), r.gap])).toEqual([
      ['F.Cu', 20, 0.2],
      ['In2.Cu', 10, 0.25],
    ]);
    expect(parallelLayers(ix, 'A', 'C')).toEqual([]);
  });

  it('nearest neighbours: longest coupled length first, the far net and the crossing net left out', () => {
    const ix = indexTracks([
      seg('AGG', 0, 0, 30, 0),
      seg('N1', 0, 0.3, 30, 0.3), // 30 mm at 0.2
      seg('N2', 5, -0.4, 15, -0.4), // 10 mm at 0.3
      seg('FAR', 0, 3, 30, 3), // 2.9 mm away
      seg('X', 0, -5, 10, 5), // crosses at 45°
    ]);
    const n = neighbours(ix, 'F.Cu', 'AGG', 8, (net) => (net === 'AGG' ? 'N1' : undefined));
    expect(n.map((r) => [r.b, +r.coupled.toFixed(6), r.gap, !!r.partner])).toEqual([
      ['N1', 30, 0.2, true],
      ['N2', 10, 0.3, false],
    ]);
  });
});

describe('the example project', () => {
  const text = exampleBoard();
  const board = parseKicadBoard(text);
  const data: KicadProjectData = { boardName: EXAMPLE_FILE, board, project: parseKicadProject(exampleProject(), EXAMPLE_PROJECT_FILE), projectName: EXAMPLE_PROJECT_FILE, otherBoards: [], roleOverrides: {} };
  const { tracks, read } = extractTracks(text);
  const ix = indexTracks(tracks);

  it('the track reader finds the tracks the board reader counted, with the same lengths per net and layer', () => {
    expect(read).toBe(board.stats.tracks);
    for (const n of board.routing!.nets)
      for (const l of n.layers) {
        const len = tracks.filter((t) => t.net === n.name && t.layer === l.layer).reduce((s, t) => s + trackLength(t), 0);
        expect(len).toBeCloseTo(l.len, 9);
      }
    expect(unpackTracks(packTracks(tracks, read))).toEqual(tracks);
  });

  it('the two nets of a pair, taken as aggressor and victim, give the routing check’s gap and coupled length', () => {
    const r = parallelRun(ix, 'F.Cu', '/PCIE_TX0_P', '/PCIE_TX0_N')!;
    const ps = pairSummary(data, '/PCIE_TX0_')!.layers.find((l) => l.layer === 'F.Cu')!;
    expect([r.gap, r.wA, r.wB]).toEqual([0.15, 0.133, 0.133]);
    expect(r.gap).toBe(ps.gap);
    expect(r.coupled).toBeCloseTo(45, 6);
    expect(r.coupled).toBeCloseTo(ps.coupled, 6);
    for (const [p, n] of [
      ['/USB_D+', '/USB_D-'],
      ['/HDMI_D0+', '/HDMI_D0-'],
    ]) {
      const pr = pairSummary(data, p)!.layers.find((l) => l.layer === 'F.Cu')!;
      const x = parallelRun(ix, 'F.Cu', p, n)!;
      expect(x.gap).toBe(pr.gap);
      expect(x.coupled).toBeCloseTo(pr.coupled, 1);
    }
  });

  it('separate nets that are far apart do not count: /CLK and /SDA are 4.8 mm apart on In2.Cu', () => {
    expect(parallelLayers(ix, '/CLK', '/SDA')).toEqual([]);
    const r = parallelRun(ix, 'In2.Cu', '/CLK', '/SDA')!;
    expect(r.coupled).toBe(0);
    expect(r.maxGap).toBe(1); // 5 × 0.2 mm
    expect(r.lenA).toBeCloseTo(60, 9);
    // with a wider limit, the 60 mm run at 4.8395 mm shows
    expect(measureParallel(ix.get('In2.Cu')!.get('/CLK')!, ix.get('In2.Cu')!.get('/SDA')!, { maxGap: 6 })).toMatchObject({ gap: 4.84, coupled: 60 });
  });

  it('nearest neighbours of a pair net are its partner only (the pairs are more than 5 mm apart)', () => {
    const partner = (net: string) => {
      const p = board.routing!.pairs.find((x) => x.p === net || x.n === net);
      return p && (p.p === net ? p.n : p.p);
    };
    expect(neighbours(ix, 'F.Cu', '/PCIE_TX0_P', 8, partner).map((r) => [r.b, !!r.partner])).toEqual([['/PCIE_TX0_N', true]]);
    expect(neighbours(ix, 'F.Cu', '/HDMI_D0-').map((r) => r.b)).toEqual(['/HDMI_D0+']);
    // /CLK's only neighbour on F.Cu is the +3V3 rail of the power section, 1.4 mm below it
    expect(neighbours(ix, 'F.Cu', '/CLK').map((r) => r.b)).toEqual(['+3V3']);
  });
});

describe('performance', () => {
  it('a 100 000-segment layer: the neighbours of one net and a pair measurement', () => {
    // 1000 nets in a bus at 0.35 mm pitch, each 100 one-millimetre segments with a small jog every 10 mm
    const tracks: RawTrack[] = [];
    for (let i = 0; i < 1000; i++)
      for (let k = 0; k < 100; k++) {
        const y = i * 0.35 + (Math.floor(k / 10) % 2 ? 0.01 : 0);
        tracks.push(seg(`N${i}`, k, y, k + 1, y));
      }
    const t0 = performance.now();
    const ix = indexTracks(tracks);
    const n = neighbours(ix, 'F.Cu', 'N500');
    const r = parallelRun(ix, 'F.Cu', 'N500', 'N501')!;
    const ms = performance.now() - t0;
    expect(n.map((x) => x.b).sort()).toEqual(['N499', 'N501']);
    expect(r.coupled).toBeCloseTo(100, 6);
    expect(r.gap).toBe(0.25);
    expect(ms).toBeLessThan(3000);
    // a second aggressor on the same layer reuses the layer's pieces
    const t1 = performance.now();
    neighbours(ix, 'F.Cu', 'N10');
    expect(performance.now() - t1).toBeLessThan(1500);
  });
});
