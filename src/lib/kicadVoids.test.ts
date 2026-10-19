import { describe, expect, it } from 'vitest';
import { parseKicadBoard } from './kicadImport';
import { buildGroups, checkItem, netClassResolver, targetById, VOID, type RoutingSummary } from './kicadRouting';

const STACK = `(layer "F.Cu" (type "copper") (thickness 0.035))
  (layer "dielectric 1" (type "prepreg") (thickness 0.2) (material "FR4") (epsilon_r 4.2) (loss_tangent 0.015))
  (layer "In1.Cu" (type "copper") (thickness 0.035))
  (layer "dielectric 2" (type "core") (thickness 1.2) (material "FR4") (epsilon_r 4.4) (loss_tangent 0.015))
  (layer "B.Cu" (type "copper") (thickness 0.035))`;

const board = (extra: string) => `(kicad_pcb (version 20240108) (generator "pcbnew") (generator_version "8.0")
  (general (thickness 1.6))
  (layers (0 "F.Cu" signal) (1 "In1.Cu" signal) (31 "B.Cu" signal) (44 "Edge.Cuts" user))
  (setup (stackup ${STACK}))
  (net 0 "") (net 1 "GND") (net 2 "/D_P") (net 3 "/D_N") (net 4 "/E_P") (net 5 "/E_N")
  (gr_rect (start 0 0) (end 100 50) (layer "Edge.Cuts"))
  ${extra}
)`;

const rect = (x0: number, y0: number, x1: number, y1: number) => `(pts (xy ${x0} ${y0}) (xy ${x1} ${y0}) (xy ${x1} ${y1}) (xy ${x0} ${y1}))`;
// a GND plane on In1.Cu whose fill has a 2 mm slot from x 49 to 51 (as a track routed on the plane would cut it)
const slotted = `(zone (net 1) (net_name "GND") (layer "In1.Cu") (uuid "z") (polygon ${rect(0, 0, 100, 50)})
  (filled_polygon (layer "In1.Cu") ${rect(0, 0, 49, 50)}) (filled_polygon (layer "In1.Cu") ${rect(51, 0, 100, 50)}))`;
const seg = (net: number, x1: number, y1: number, x2: number, y2: number) => `(segment (start ${x1} ${y1}) (end ${x2} ${y2}) (width 0.15) (layer "F.Cu") (net ${net}) (uuid "s"))`;
// a pair across the slot, with a corner in the slot; a second pair that ends in the slot (at a pad or via)
const pairs =
  seg(2, 30, 20, 50, 20) + seg(2, 50, 20, 70, 20.5) + seg(3, 30, 20.3, 50, 20.3) + seg(3, 50, 20.3, 70, 20.8) +
  seg(4, 20, 40, 50, 40) + seg(5, 20, 40.3, 50, 40.3);

describe('gaps in the reference plane from the zone fills', () => {
  const b = parseKicadBoard(board(slotted + pairs));
  const r = b.routing!;
  const stat = (net: string) => r.nets.find((n) => n.name === net)!.layers.find((l) => l.layer === 'F.Cu')!;

  it('the layers with fills are listed; a trace across the slot has a 2 mm gap, joined across its corner', () => {
    expect(r.filled).toEqual(['In1.Cu']);
    const v = stat('/D_P').voids!;
    expect(v).toHaveLength(1);
    expect(v[0].layer).toBe('In1.Cu');
    expect(v[0].longest).toBeCloseTo(2, 1);
    expect(v[0].total).toBeCloseTo(v[0].longest, 9);
    expect(v[0].x).toBeGreaterThan(49);
    expect(v[0].x).toBeLessThan(51);
  });

  it('a stretch that reaches the end of the routing (a pad or via) is left out', () => {
    expect(stat('/E_P').voids).toBeUndefined();
  });

  it('a layer is not checked against its own fills, and a board without fills has none', () => {
    const own = parseKicadBoard(board(slotted.replaceAll('In1.Cu', 'F.Cu') + pairs)).routing!;
    expect(own.filled).toEqual(['F.Cu']);
    expect(own.nets.every((n) => n.layers.every((l) => !l.voids))).toBe(true);
    const unfilled = parseKicadBoard(board(`(zone (net 1) (net_name "GND") (layer "In1.Cu") (uuid "z") (polygon ${rect(0, 0, 100, 50)}))` + pairs)).routing!;
    expect(unfilled.filled).toEqual([]);
  });

  it('the routing check warns on a layer whose reference plane has the gap, with where it is', () => {
    const item = buildGroups(r as RoutingSummary, netClassResolver(null))
      .flatMap((g) => g.items)
      .find((i) => i.name === '/D_')!;
    const solves = { 'F.Cu': { z: 90, eeff: 3, refs: ['In1.Cu'] } };
    const res = checkItem(item, targetById('usb2-hs'), solves, (mm) => mm.toFixed(2));
    expect(res.layers[0]).toMatchObject({ status: 'warn', tag: 'over a gap in In1.Cu' });
    expect(res.layers[0].reason).toMatch(/over no copper on In1\.Cu, the longest 2\.\d\d mm at x (49|50|51)[\d.]*, y 20/);
    // without fills on the reference plane the layer passes
    expect(checkItem(item, targetById('usb2-hs'), { 'F.Cu': { z: 90, eeff: 3, refs: [] } }, (mm) => mm.toFixed(2)).layers[0].status).toBe('ok');
    expect(VOID.warn).toBeLessThanOrEqual(2);
  });
});
