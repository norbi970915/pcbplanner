import { describe, expect, it } from 'vitest';
import { readBoardDrawing } from './kicadDrawing';
import { estimateFills, unfilledNets } from './kicadZoneFill';
import { shoelace } from './kicadPlanes';

const board = (extra: string) => `(kicad_pcb (version 20240108) (generator "pcbnew")
  (general (thickness 1.6))
  (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (44 "Edge.Cuts" user))
  (net 0 "") (net 1 "GND") (net 2 "+5V")
  (gr_rect (start 0 0) (end 40 30) (layer "Edge.Cuts"))
  ${extra}
)`;

const rect = (x0: number, y0: number, x1: number, y1: number) => `(polygon (pts (xy ${x0} ${y0}) (xy ${x1} ${y0}) (xy ${x1} ${y1}) (xy ${x0} ${y1})))`;
const zone = (net: number, name: string, layer: string, poly: string, opts = '') =>
  `(zone (net ${net}) (net_name "${name}") (layer "${layer}") (hatch edge 0.5) ${opts || '(connect_pads (clearance 0.3)) (min_thickness 0.25) (fill (thermal_gap 0.5) (thermal_bridge_width 0.4))'} ${poly})`;

/** Even-odd point test on a flat polygon (the estimate's loops joined into one). */
function inside(xy: Float64Array, x: number, y: number) {
  let c = false;
  const n = xy.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = xy[2 * i + 1];
    const yj = xy[2 * j + 1];
    if (yi > y !== yj > y && x < ((xy[2 * j] - xy[2 * i]) * (y - yi)) / (yj - yi) + xy[2 * i]) c = !c;
  }
  return c;
}
const area = (xy: Float64Array) => {
  const pts: [number, number][] = [];
  for (let i = 0; i < xy.length; i += 2) pts.push([xy[i], xy[i + 1]]);
  return Math.abs(shoelace(pts));
};

describe('reading unfilled zones', () => {
  it('keeps the outline and fill settings of a zone saved without its fill, and the rule areas; a filled zone is not listed', () => {
    const d = readBoardDrawing(
      board(`
      ${zone(1, 'GND', 'F.Cu', rect(5, 5, 35, 25), '(priority 2) (connect_pads yes (clearance 0.2)) (min_thickness 0.3) (fill (thermal_gap 0.6) (thermal_bridge_width 0.45) (island_removal_mode 2) (island_area_min 4))')}
      (zone (net 0) (net_name "") (layers "F.Cu" "B.Cu") (hatch edge 0.5) (keepout (tracks allowed) (vias allowed) (pads allowed) (copperpour not_allowed) (footprints allowed)) ${rect(10, 10, 12, 12)})
      (zone (net 2) (net_name "+5V") (layer "B.Cu") (hatch edge 0.5) ${rect(5, 5, 35, 25)} (filled_polygon (layer "B.Cu") (pts (xy 5 5) (xy 35 5) (xy 35 25) (xy 5 25))))`),
    );
    expect(d.zones).toHaveLength(2);
    const [g, ko] = d.zones!;
    expect([g.net, g.filled, g.priority, g.keepout]).toEqual(['GND', false, 2, false]);
    expect(g.fill).toEqual({ clearance: 0.2, minThickness: 0.3, connect: 'solid', thermalGap: 0.6, thermalBridge: 0.45, islands: 'belowArea', islandMin: 4 });
    expect([ko.keepout, ko.layers]).toEqual([true, ['F.Cu', 'B.Cu']]);
    expect(unfilledNets(d)).toEqual([{ net: 'GND', zones: 1 }]);
    expect(d.fills.map((f) => f.net)).toEqual(['+5V']);
  });

  it('reads the zone connection and clearance a pad or its footprint sets', () => {
    const d = readBoardDrawing(
      board(`(footprint "MH" (layer "F.Cu") (at 20 15) (zone_connect 0) (clearance 1.2)
        (property "Reference" "H1" (at 0 0) (layer "F.SilkS"))
        (pad "1" thru_hole circle (at 0 0) (size 3 3) (drill 2) (layers "*.Cu") (net 1 "GND") (zone_connect 2))
        (pad "" np_thru_hole circle (at 5 0) (size 2 2) (drill 2) (layers "*.Cu") (clearance 1.7)))`),
    );
    const [p1, p2] = d.pads;
    expect([p1.zoneConnect, p1.clearance]).toEqual(['solid', 1.2]);
    expect([p2.zoneConnect, p2.clearance]).toEqual(['none', 1.7]);
  });
});

describe('estimated fill', () => {
  it('keeps the zone clearance to another net and removes the island that touches none of its net', () => {
    // a 30 × 20 GND zone split by a +5V track along y = 15; one GND via in the upper half only
    const d = readBoardDrawing(
      board(`${zone(1, 'GND', 'F.Cu', rect(5, 5, 35, 25))}
      (segment (start 0 15) (end 40 15) (width 0.5) (layer "F.Cu") (net 2))
      (via (at 20 10) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 1))`),
    );
    const est = estimateFills(d, ['GND'], { edgeClearance: 0.5 });
    expect(est.zones).toBe(1);
    expect(est.fills).toHaveLength(1);
    const f = est.fills[0];
    expect([f.net, f.layer, f.estimated]).toEqual(['GND', 'F.Cu', true]);
    // the upper half: 30 wide, from 5 to 15 − 0.25 − 0.3; the lower half is an island and goes
    expect(area(f.xy)).toBeCloseTo(30 * (10 - 0.55), -0.5);
    expect(inside(f.xy, 20, 7)).toBe(true);
    // the track's edge is at 14.75, so the fill ends at 14.45 (stepped by a raster cell, about 0.08 here)
    expect(inside(f.xy, 20, 14.6)).toBe(false);
    expect(inside(f.xy, 20, 14.3)).toBe(true);
    expect(inside(f.xy, 20, 20)).toBe(false); // the island
    // the board edge is 5 mm away: the zone's own edge is the limit
    expect(inside(f.xy, 5.1, 7)).toBe(true);
  });

  it('keeps an island when the zone says so, and the board edge clearance where the zone reaches the edge', () => {
    const d = readBoardDrawing(
      board(`${zone(1, 'GND', 'F.Cu', rect(-5, 5, 45, 25), '(connect_pads (clearance 0.3)) (min_thickness 0.25) (fill (island_removal_mode 1))')}
      (segment (start 0 15) (end 40 15) (width 0.5) (layer "F.Cu") (net 2))`),
    );
    const f = estimateFills(d, ['GND'], { edgeClearance: 0.8 }).fills[0];
    expect(inside(f.xy, 20, 20)).toBe(true); // kept
    expect(inside(f.xy, 0.7, 10)).toBe(false); // within 0.8 of the board edge at x = 0
    expect(inside(f.xy, 0.9, 10)).toBe(true);
  });

  it('a pad of the net gets a thermal gap and spokes along its axes', () => {
    const d = readBoardDrawing(
      board(`${zone(1, 'GND', 'F.Cu', rect(5, 5, 35, 25))}
      (footprint "R" (layer "F.Cu") (at 20 15)
        (property "Reference" "R1" (at 0 0) (layer "F.SilkS"))
        (pad "1" smd rect (at 0 0) (size 2 2) (layers "F.Cu") (net 1 "GND")))`),
    );
    const f = estimateFills(d, ['GND']).fills[0];
    // the gap: 0.5 around the 2 × 2 pad, so a diagonal point 0.3 off the corner is empty
    expect(inside(f.xy, 21.2, 16.2)).toBe(false);
    // a spoke along +x crosses the gap at the pad's middle; off the spoke (0.4 wide) the gap stays
    expect(inside(f.xy, 21.25, 15)).toBe(true);
    expect(inside(f.xy, 21.25, 15.5)).toBe(false);
    // beyond the gap, copper
    expect(inside(f.xy, 21.7, 16.7)).toBe(true);
  });

  it('a zone of higher priority fills first and cuts the zone of another net below it', () => {
    const d = readBoardDrawing(
      board(`${zone(2, '+5V', 'F.Cu', rect(15, 10, 25, 20), '(priority 1) (connect_pads (clearance 0.3)) (min_thickness 0.25)')}
      ${zone(1, 'GND', 'F.Cu', rect(5, 5, 35, 25))}
      (via (at 20 15) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 2))
      (via (at 8 8) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 1))`),
    );
    const est = estimateFills(d, ['GND', '+5V']);
    const p5 = est.fills.find((f) => f.net === '+5V')!;
    const gnd = est.fills.find((f) => f.net === 'GND')!;
    expect(inside(p5.xy, 16, 11)).toBe(true);
    expect(inside(gnd.xy, 16, 11)).toBe(false);
    // the +5V fill's edge is at x = 15: GND ends 0.3 before it
    expect(inside(gnd.xy, 14.85, 15)).toBe(false);
    expect(inside(gnd.xy, 14.55, 15)).toBe(true);
    // only the chosen nets: GND alone leaves the +5V zone out and fills through it
    const alone = estimateFills(d, ['GND']).fills;
    expect(alone).toHaveLength(1);
    expect(inside(alone[0].xy, 16, 11)).toBe(true);
  });
});
