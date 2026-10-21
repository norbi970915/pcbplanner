/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { exampleBoard } from './kicadExample';
import { kicadStackup, parseKicadBoard } from './kicadImport';
import {
  adjacentByName,
  adjacentCoppers,
  arcPoints,
  defaultGroundNet,
  intersectionArea,
  isGroundName,
  pdnPlaneFields,
  planePairMessage,
  planePairs,
  planePairsFromAreas,
  readBoardGeometry,
  sameDielectric,
  seriesEr,
  shoelace,
  sweepArea,
  zoneNets,
  type Pt,
} from './kicadPlanes';
import { EPS0, planeCapacitance } from './pdn';

const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
// an L: 10 × 10 square less its 6 × 6 upper-right corner, area 64
const L = (x: number, y: number, s = 1): Pt[] => [[x, y], [x + 10 * s, y], [x + 10 * s, y + 4 * s], [x + 4 * s, y + 4 * s], [x + 4 * s, y + 10 * s], [x, y + 10 * s]];
const one = (p: Pt[]) => [[p]]; // a region of one shape of one ring

/** Sutherland–Hodgman clip of a polygon by a convex polygon (counter-clockwise): exact for a convex clip region. */
function clipConvex(subject: Pt[], clip: Pt[]): Pt[] {
  let out = subject;
  for (let i = 0; i < clip.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length];
    const side = (p: Pt) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const src = out;
    out = [];
    for (let j = 0; j < src.length; j++) {
      const p = src[(j + src.length - 1) % src.length], q = src[j];
      const sp = side(p), sq = side(q);
      const cut = (): Pt => [p[0] + ((q[0] - p[0]) * sp) / (sp - sq), p[1] + ((q[1] - p[1]) * sp) / (sp - sq)];
      if (sq >= 0) {
        if (sp < 0) out.push(cut());
        out.push(q);
      } else if (sp >= 0) out.push(cut());
    }
    if (!out.length) break;
  }
  return out;
}

/** Deterministic pseudo-random numbers (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const convex = (r: () => number, cx: number, cy: number, rad: number, n: number): Pt[] => {
  const angles = Array.from({ length: n }, () => r() * 2 * Math.PI).sort((a, b) => a - b);
  return angles.map((t): Pt => [cx + rad * Math.cos(t), cy + rad * Math.sin(t)]);
};
const star = (r: () => number, cx: number, cy: number, n: number): Pt[] =>
  Array.from({ length: n }, (_, i): Pt => {
    const t = (2 * Math.PI * i) / n;
    const rad = 2 + 8 * r();
    return [cx + rad * Math.cos(t), cy + rad * Math.sin(t)];
  });

describe('exact area of overlapping polygons', () => {
  it('two overlapping rectangles', () => {
    const o = intersectionArea([one(rect(0, 0, 10, 10)), one(rect(5, 5, 20, 20))]);
    expect(o.area).toBeCloseTo(25, 12);
    expect(o.bbox).toEqual([5, 5, 10, 10]);
    expect(intersectionArea([one(rect(0, 0, 10, 10)), one(rect(10, 0, 20, 10))]).area).toBe(0); // touching edges only
    expect(intersectionArea([one(rect(0, 0, 10, 10)), one(rect(20, 0, 30, 10))]).bbox).toBeNull();
  });
  it('L-shapes against a rectangle and against each other', () => {
    expect(sweepArea([[L(0, 0)]], (odd) => odd[0] === 1).area).toBeCloseTo(64, 12);
    // L ∩ [2, 8]²: the 36 mm² square less its [4, 8]² corner outside the L
    expect(intersectionArea([one(L(0, 0)), one(rect(2, 2, 8, 8))]).area).toBeCloseTo(20, 12);
    // the L and the same L turned by 180° about (5, 5) (a top bar and a right bar): two 4 × 4 corners
    const turned = L(0, 0).map(([x, y]): Pt => [10 - x, 10 - y]);
    expect(intersectionArea([one(L(0, 0)), one(turned)]).area).toBeCloseTo(32, 12);
    // shifted by (3, 3): its bottom bar meets the L in 7 + 3, its left bar in 4 + 6, and the two bars share 4 + 3 of that
    expect(intersectionArea([one(L(0, 0)), one(L(3, 3))]).area).toBeCloseTo(10 + 10 - 7, 12);
  });
  it('slanted edges that cross inside a strip', () => {
    // triangle x + y ≤ 10 against the 6 × 6 square: 36 less the corner triangle with 2 mm legs
    expect(intersectionArea([one([[0, 0], [10, 0], [0, 10]]), one(rect(0, 0, 6, 6))]).area).toBeCloseTo(34, 12);
    // two triangles forming a star of David: hexagon of 2/3 of either triangle's area
    const h = Math.sqrt(3) / 2;
    const up: Pt[] = [[0, 0], [1, 0], [0.5, h]];
    const down: Pt[] = [[0, (2 * h) / 3], [1, (2 * h) / 3], [0.5, -h / 3]];
    expect(intersectionArea([one(up), one(down)]).area).toBeCloseTo((2 / 3) * shoelace(up), 12);
  });
  it('random convex polygons agree with Sutherland–Hodgman clipping to 1e-9', () => {
    const r = rng(7);
    for (let k = 0; k < 200; k++) {
      const a = convex(r, 10 * r(), 10 * r(), 2 + 8 * r(), 3 + Math.floor(r() * 20));
      const b = convex(r, 10 * r(), 10 * r(), 2 + 8 * r(), 3 + Math.floor(r() * 20));
      const ref = shoelace(clipConvex(a, b));
      expect(Math.abs(intersectionArea([one(a), one(b)]).area - ref)).toBeLessThan(1e-9 * Math.max(1, ref));
    }
  });
  it('random star-shaped (non-convex) polygons: the area of each, and of each against a convex clip', () => {
    const r = rng(11);
    for (let k = 0; k < 100; k++) {
      const s = star(r, 0, 0, 5 + Math.floor(r() * 60));
      expect(sweepArea([[s]], (odd) => odd[0] === 1).area).toBeCloseTo(shoelace(s), 9);
      const c = convex(r, 4 * r() - 2, 4 * r() - 2, 3 + 6 * r(), 3 + Math.floor(r() * 12));
      expect(intersectionArea([one(s), one(c)]).area).toBeCloseTo(shoelace(clipConvex(s, c)), 9);
    }
  });
  it('cut-outs are removed and overlapping zones of one net count once', () => {
    // a 20 × 20 zone with a 10 × 10 cut-out, against the whole square
    expect(intersectionArea([[[rect(0, 0, 20, 20), rect(5, 5, 15, 15)]], one(rect(0, 0, 20, 20))]).area).toBeCloseTo(300, 12);
    // two zones of one net overlapping by 5 × 10: union 150
    expect(intersectionArea([[[rect(0, 0, 10, 10)], [rect(5, 0, 15, 10)]], one(rect(-100, -100, 100, 100))]).area).toBeCloseTo(150, 12);
  });
  it('arcs: chords of at most 5°, through the mid point', () => {
    const q = arcPoints([10, 0], [Math.SQRT1_2 * 10, Math.SQRT1_2 * 10], [0, 10]);
    expect(q.length).toBe(19); // 90° in 18 chords
    for (const p of q) expect(Math.hypot(p[0], p[1])).toBeCloseTo(10, 9);
    const cw = arcPoints([10, 0], [Math.SQRT1_2 * 10, -Math.SQRT1_2 * 10], [0, -10]);
    expect(cw.every((p) => p[1] <= 1e-9)).toBe(true);
    expect(arcPoints([0, 0], [1, 0], [2, 0])).toEqual([[0, 0], [2, 0]]);
  });
});

/* ------------------------------------------------------------------ boards */

const stackup = (cores: [string, number, number][]) => {
  const names = ['F.Cu', ...cores.slice(1).map((_, i) => `In${i + 1}.Cu`), 'B.Cu'];
  const items = names.flatMap((n, i) => [
    `(layer "${n}" (type "copper") (thickness 0.035))`,
    ...(i < cores.length ? [`(layer "dielectric ${i + 1}" (type "${cores[i][0]}") (thickness ${cores[i][1]}) (material "FR4") (epsilon_r ${cores[i][2]}) (loss_tangent 0.02))`] : []),
  ]);
  return { names, text: `(setup (stackup ${items.join(' ')}))` };
};
const zone = (net: string, layer: string, rings: Pt[][], extra = '') =>
  `(zone (net 1) (net_name "${net}") (layer "${layer}") ${extra} ${rings.map((r) => `(polygon (pts ${r.map((p) => `(xy ${p[0]} ${p[1]})`).join(' ')}))`).join(' ')})`;
const board = (st: { names: string[]; text: string }, items: string[], edge = '(gr_rect (start 0 0) (end 100 50) (layer "Edge.Cuts"))') =>
  `(kicad_pcb (version 20240108) (generator "test") (layers ${st.names.map((n, i) => `(${n === 'B.Cu' ? 31 : i} "${n}" signal)`).join(' ')} (44 "Edge.Cuts" user)) ${st.text} ${edge} ${items.join(' ')})`;

function pairsOf(text: string, power: string, ground: string) {
  const b = parseKicadBoard(text);
  const g = readBoardGeometry(text, { copper: b.copper.map((c) => c.name), bbox: b.board.bbox });
  const adj = adjacentCoppers(kicadStackup(b, { name: 't' })!.stackup);
  return { b, g, adj, pairs: planePairs(g, adj, power, ground) };
}

describe('plane pairs of a synthetic board', () => {
  const st4 = stackup([['prepreg', 0.2, 4], ['core', 1.0, 4.5], ['prepreg', 0.1, 3.8]]);
  it('rectangles on adjacent layers: exact overlap and C = ε0·εr·A/d', () => {
    const text = board(st4, [zone('GND', 'In1.Cu', [rect(-5, -5, 60, 55)]), zone('+5V', 'In2.Cu', [rect(40, 10, 110, 40)])]);
    const { pairs } = pairsOf(text, '+5V', 'GND');
    expect(pairs).toHaveLength(1);
    const p = pairs[0];
    expect([p.upper, p.lower, p.powerLayer, p.groundLayer]).toEqual(['In1.Cu', 'In2.Cu', 'In2.Cu', 'In1.Cu']);
    expect(p.area).toBeCloseTo(20 * 30, 9); // x 40…60 (GND ends at 60), y 10…40; the +5V zone past the board edge is clipped
    expect(p.bbox).toEqual([40, 10, 60, 40]);
    expect([p.d, p.er]).toEqual([1.0, 4.5]);
    expect(p.c).toBeCloseTo((EPS0 * 4.5 * 600e-6) / 1e-3, 18);
    expect(p.c).toBeCloseTo(planeCapacitance(p.area, p.d, p.er), 18);
    const f = pdnPlaneFields(pairs)!;
    expect(f).toEqual({ pl: 20, pw: 30, pd: 1, er: 4.5 });
    expect(planeCapacitance(f.pl * f.pw, f.pd!, f.er!)).toBeCloseTo(p.c, 18);
  });
  it('L-shapes on adjacent layers, both orders on a split layer, and no pair across a non-adjacent layer', () => {
    const text = board(st4, [
      zone('GND', 'F.Cu', [L(0, 0, 4)]), // 40 × 40 L, area 1024
      zone('+3V3', 'In1.Cu', [rect(10, 10, 50, 50)]),
      zone('+3V3', 'In2.Cu', [rect(0, 0, 100, 50)]),
      zone('GND', 'B.Cu', [rect(0, 0, 100, 50)]),
    ]);
    const { pairs } = pairsOf(text, '+3V3', 'GND');
    // F.Cu L ∩ In1 [10,50]×[10,50]: the L is [0,40]×[0,16] ∪ [0,16]×[0,40] → [10,40]×[10,16] + [10,16]×[16,40] = 180 + 144
    const top = pairs.find((p) => p.groundLayer === 'F.Cu')!;
    expect(top.area).toBeCloseTo(180 + 144, 9);
    expect(top.c).toBeCloseTo((EPS0 * 4 * 324e-6) / 0.2e-3, 18);
    const bottom = pairs.find((p) => p.groundLayer === 'B.Cu')!;
    expect(bottom.area).toBeCloseTo(5000, 9);
    expect([bottom.d, bottom.er]).toEqual([0.1, 3.8]);
    expect(pairs.map((p) => `${p.powerLayer}/${p.groundLayer}`).sort()).toEqual(['In1.Cu/F.Cu', 'In2.Cu/B.Cu']); // In1 +3V3 / In2 +3V3 is no pair
    expect(pairs[0].groundLayer).toBe('B.Cu'); // largest capacitance first
    expect(sameDielectric(pairs)).toBe(false);
    expect(planePairs(pairsOf(text, 'GND', 'GND').g, [], 'GND', 'GND')).toEqual([]);
  });
  it('cut-outs, higher-priority zones of other nets and pour keepouts are taken out; same-net zones are not double counted', () => {
    const text = board(st4, [
      zone('GND', 'In1.Cu', [rect(0, 0, 100, 50), rect(10, 10, 20, 20)]), // 100 mm² cut-out
      zone('GND', 'In1.Cu', [rect(0, 0, 50, 50)]), // overlaps the first: counted once
      zone('+1V8', 'In1.Cu', [rect(30, 30, 40, 40)], '(priority 2)'), // 100 mm² island of another net, higher priority
      zone('+9V', 'In1.Cu', [rect(60, 0, 70, 10)]), // same priority as GND: does not cut it
      '(zone (net 0) (net_name "") (layers "*.Cu") (keepout (tracks allowed) (vias allowed) (pads allowed) (copperpour not_allowed) (footprints allowed)) (polygon (pts (xy 80 0) (xy 90 0) (xy 90 10) (xy 80 10))))',
      '(zone (net 0) (net_name "") (layers "*.Cu") (keepout (tracks not_allowed) (vias allowed) (pads allowed) (copperpour allowed) (footprints allowed)) (polygon (pts (xy 0 40) (xy 10 40) (xy 10 50) (xy 0 50))))',
      zone('+5V', 'In2.Cu', [rect(0, 0, 100, 50)]),
    ]);
    const { pairs } = pairsOf(text, '+5V', 'GND');
    expect(pairs).toHaveLength(1);
    // the cut-out lies inside the second GND zone, which fills it again; the island and the keepout are taken out
    expect(pairs[0].area).toBeCloseTo(5000 - 100 - 100, 9);
  });
  it('a board outline of lines and arcs clips the zones', () => {
    // 100 × 50 with a 10 mm radius arc at the top-right corner instead of the square corner
    const s2 = Math.SQRT1_2;
    const edge = [
      '(gr_line (start 0 0) (end 90 0) (layer "Edge.Cuts"))',
      `(gr_arc (start 90 0) (mid ${90 + 10 * s2} ${10 - 10 * s2}) (end 100 10) (layer "Edge.Cuts"))`,
      '(gr_line (start 100 10) (end 100 50) (layer "Edge.Cuts"))',
      '(gr_line (start 0 50) (end 100 50) (layer "Edge.Cuts"))',
      '(gr_line (start 0 50) (end 0 0) (layer "Edge.Cuts"))',
    ].join(' ');
    const text = board(st4, [zone('GND', 'In1.Cu', [rect(-10, -10, 110, 60)]), zone('VDD', 'In2.Cu', [rect(-10, -10, 110, 60)])], edge);
    const { g, pairs } = pairsOf(text, 'VDD', 'GND');
    expect(g.outlineSource).toBe('outline');
    const exact = 5000 - (100 - 25 * Math.PI); // the corner square less the quarter circle
    const chordLoss = 25 * Math.PI * (1 - Math.sin((2 * Math.PI) / 72) / ((2 * Math.PI) / 72)); // quarter circle in 18 chords
    expect(pairs[0].area).toBeCloseTo(exact - chordLoss, 9);
    expect(Math.abs(pairs[0].area - exact) / exact).toBeLessThan(1e-4);
  });
  it('several pairs on one dielectric can be summed into one input', () => {
    const st = stackup([['prepreg', 0.1, 4], ['core', 0.5, 4.4], ['prepreg', 0.1, 4]]);
    const text = board(st, [zone('VCC', 'F.Cu', [rect(0, 0, 50, 50)]), zone('GND', 'In1.Cu', [rect(0, 0, 100, 50)]), zone('GND', 'In2.Cu', [rect(0, 0, 100, 50)]), zone('VCC', 'B.Cu', [rect(50, 0, 100, 50)])]);
    const { pairs } = pairsOf(text, 'VCC', 'GND');
    expect(pairs).toHaveLength(2);
    expect(sameDielectric(pairs)).toBe(true);
    const f = pdnPlaneFields(pairs)!;
    expect(f.pl * f.pw).toBeCloseTo(5000, 6);
    expect(planeCapacitance(f.pl * f.pw, f.pd!, f.er!)).toBeCloseTo(pairs[0].c + pairs[1].c, 18);
  });
  it('several plies between two layers: d is their sum and εr their series (harmonic) mean', () => {
    const plies = [{ name: 'a', t: 0.1, er: 3.5 }, { name: 'b', t: 0.3, er: 4.5 }];
    const er = seriesEr(plies);
    expect(er).toBeCloseTo(0.4 / (0.1 / 3.5 + 0.3 / 4.5), 12);
    // two parallel-plate capacitors in series equal one with d = Σt and the series εr
    const c1 = planeCapacitance(100, 0.1, 3.5), c2 = planeCapacitance(100, 0.3, 4.5);
    expect(planeCapacitance(100, 0.4, er)).toBeCloseTo(1 / (1 / c1 + 1 / c2), 20);
    const text = board(stackup([['prepreg', 0.1, 4], ['core', 0.5, 4.4], ['prepreg', 0.1, 4]]), [zone('GND', 'F.Cu', [rect(0, 0, 10, 10)]), zone('P', 'In1.Cu', [rect(0, 0, 10, 10)])]).replace(
      '(layer "dielectric 1" (type "prepreg") (thickness 0.1) (material "FR4") (epsilon_r 4) (loss_tangent 0.02))',
      '(layer "dielectric 1" (type "prepreg") (thickness 0.1) (material "FR4") (epsilon_r 3.5) (loss_tangent 0.02) addsublayer (thickness 0.3) (material "FR4") (epsilon_r 4.5) (loss_tangent 0.02))',
    );
    const p = pairsOf(text, 'P', 'GND').pairs[0];
    expect(p.plies).toHaveLength(2);
    expect(p.d).toBeCloseTo(0.4, 12);
    expect(p.c).toBeCloseTo(planeCapacitance(100, 0.4, er), 20);
  });
});

describe('the example project', () => {
  const text = exampleBoard();
  const b = parseKicadBoard(text);
  const copper = b.copper.map((c) => c.name);
  const g = readBoardGeometry(text, { copper, bbox: b.board.bbox });
  const adj = adjacentCoppers(kicadStackup(b, { name: 'example' })!.stackup);
  it('zone nets: GND is the ground net to start with', () => {
    const zn = zoneNets(g, copper);
    expect(zn.map((n) => n.net)).toEqual(['GND', '+3V3']);
    expect(zn[0].layers.map((l) => [l.layer, Math.round(l.area)])).toEqual([['F.Cu', 1440], ['In1.Cu', 4800], ['In3.Cu', 4800]]);
    expect(defaultGroundNet(zn)).toBe('GND');
    expect(isGroundName('/power/AGND')).toBe(true);
    expect(isGroundName('+3V3')).toBe(false);
  });
  it('+3V3 on In4.Cu over GND on In3.Cu: the 80 × 60 mm board on the 0.6 mm core', () => {
    const pairs = planePairs(g, adj, '+3V3', 'GND');
    expect(pairs).toHaveLength(1);
    const p = pairs[0];
    expect([p.powerLayer, p.groundLayer, p.d, p.er]).toEqual(['In4.Cu', 'In3.Cu', 0.6, 4.36]);
    expect(p.area).toBeCloseTo(4800, 9); // zones drawn 1 mm past the edge, clipped to the outline
    expect(p.c * 1e12).toBeCloseTo(308.834, 3); // ε0 · 4.36 · 4800 mm² / 0.6 mm
    const f = pdnPlaneFields(pairs)!;
    expect(f).toEqual({ pl: 80, pw: 60, pd: 0.6, er: 4.36 });
    expect(planeCapacitance(f.pl * f.pw, f.pd!, f.er!)).toBeCloseTo(p.c, 18);
    expect(planePairMessage(zoneNets(g, copper), '+3V3', 'GND', pairs)).toBeNull();
  });
  it('the estimate from zone areas alone (no geometry) is an upper bound', () => {
    const est = planePairsFromAreas(b.copper, adj, '+3V3', 'GND');
    expect(est).toHaveLength(1);
    expect(est[0].estimate).toBe(true);
    expect(est[0].area).toBeGreaterThanOrEqual(4800 - 1e-9);
  });
  it('no plane pair: a clear message', () => {
    // with only In1 and In2 as neighbours (+3V3 is on In4) the two nets form no pair
    const far = adjacentByName(['In1.Cu', 'In2.Cu']);
    const pairs = planePairs(g, far, '+3V3', 'GND');
    expect(pairs).toEqual([]);
    expect(planePairMessage(zoneNets(g, copper), '+3V3', 'GND', pairs)).toBe('No plane pair: +3V3 and GND have no zones on neighbouring copper layers that overlap inside the board.');
    expect(planePairMessage([], undefined, undefined, [])).toMatch(/no zones/);
    expect(pdnPlaneFields([])).toBeNull();
  });
});

describe('board outline of the plane reader', () => {
  const pcb = (extra: string) => `(kicad_pcb (version 20240108) (generator "pcbnew")
  (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (44 "Edge.Cuts" user))
  (net 0 "")
  ${extra}
)`;
  it('reads an outline inside a turned footprint', () => {
    const fp = `(footprint "Outline" (layer "F.Cu") (at 50 50 90)
      (fp_rect (start -20 -10) (end 20 10) (stroke (width 0.1) (type solid)) (fill none) (layer "Edge.Cuts")))`;
    const g = readBoardGeometry(pcb(fp), { copper: ['F.Cu', 'B.Cu'] });
    expect(g.outlineSource).toBe('outline');
    const xs = g.outline[0].map((p) => p[0]);
    const ys = g.outline[0].map((p) => p[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(20, 9); // turned: 20 wide, 40 tall
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(40, 9);
  });
  it('a slot that leaves the board the import settled on is not taken as the outline', () => {
    const g = readBoardGeometry(pcb('(gr_rect (start 40 20) (end 46 21) (layer "Edge.Cuts"))'), { copper: ['F.Cu', 'B.Cu'], bbox: [0, 0, 100, 50] });
    expect(g.outlineSource).toBe('bbox');
    expect(g.outline[0]).toEqual([[0, 0], [100, 0], [100, 50], [0, 50]]);
  });
});
