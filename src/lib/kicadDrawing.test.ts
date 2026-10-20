import { describe, expect, it } from 'vitest';
import { padToBoard, readBoardDrawing } from './kicadDrawing';

const board = (extra: string, version = 20240108) => `(kicad_pcb (version ${version}) (generator "pcbnew")
  (general (thickness 1.6))
  (layers (0 "F.Cu" signal) (1 "In1.Cu" signal) (2 "In2.Cu" signal) (31 "B.Cu" signal) (44 "Edge.Cuts" user))
  (net 0 "") (net 1 "GND") (net 2 "/SIG")
  (gr_rect (start 0 0) (end 40 30) (layer "Edge.Cuts"))
  ${extra}
)`;

describe('pads and footprints', () => {
  it('a pad offset turns with the footprint (KiCad: counter-clockwise on screen, y down)', () => {
    // +x in the footprint points up on the screen (−y) once the footprint is turned by 90°
    const [x, y] = padToBoard(10, 10, 90, 1, 0);
    expect(x).toBeCloseTo(10, 9);
    expect(y).toBeCloseTo(9, 9);
    const [x2, y2] = padToBoard(10, 10, -90, -0.51, 0);
    expect(x2).toBeCloseTo(10, 9);
    expect(y2).toBeCloseTo(9.49, 9);
  });

  it('pads of a footprint: position, absolute angle, shape, copper layers, net and reference', () => {
    const fp = `(footprint "R_0402" (layer "F.Cu") (at 20 15 90)
      (property "Reference" "R7" (at 0 0 90) (layer "F.SilkS"))
      (pad "1" smd roundrect (at -0.51 0 90) (size 0.54 0.64) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.25) (net 2 "/SIG"))
      (pad "2" smd roundrect (at 0.51 0 90) (size 0.54 0.64) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.25) (net 1 "GND"))
      (pad "" np_thru_hole circle (at 0 2) (size 1 1) (drill 1) (layers "*.Cu" "*.Mask")))`;
    const d = readBoardDrawing(board(fp));
    expect(d.parts).toEqual([{ ref: 'R7', x: 20, y: 15, back: false }]);
    const [p1, p2, hole] = d.pads;
    expect([p1.x, p1.y, p1.angle, p1.shape, p1.rr, p1.net, p1.ref, p1.num]).toEqual([20, expect.closeTo(15.51, 9), 90, 'roundrect', 0.25, '/SIG', 'R7', '1']);
    expect(p2.y).toBeCloseTo(14.49, 9);
    expect(p1.layers).toEqual(['F.Cu']); // paste and mask are not copper
    expect(hole.layers).toEqual(['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu']); // *.Cu expanded
    expect(hole.drill).toBe(1);
    expect(hole.x).toBeCloseTo(22, 9); // (0, 2) turned by 90°
  });

  it('KiCad 10 writes the net name on the item; codes are resolved through the net list otherwise', () => {
    const k10 = readBoardDrawing(
      board(`(footprint "TP" (layer "B.Cu") (at 5 5) (property "Reference" "TP1") (pad "1" smd circle (at 0 0) (size 1 1) (layers "B.Cu") (net "/SIG")))
        (segment (start 1 1) (end 9 1) (width 0.2) (layer "F.Cu") (net "/SIG") (uuid "s"))`, 20251028),
    );
    expect(k10.pads[0].net).toBe('/SIG');
    expect(k10.parts[0].back).toBe(true);
    expect(k10.tracks[0].net).toBe('/SIG');
    const k8 = readBoardDrawing(board(`(segment (start 1 1) (end 9 1) (width 0.2) (layer "F.Cu") (net 2) (uuid "s")) (via (at 9 1) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 1))`));
    expect(k8.tracks[0].net).toBe('/SIG');
    expect(k8.vias[0]).toMatchObject({ net: 'GND', x: 9, y: 1, size: 0.6, drill: 0.3 });
    expect(k8.read).toBe(1);
  });

  it('zone fills with their net and layer, keepouts left out, and the board outline', () => {
    const z = `(zone (net 1) (net_name "GND") (layer "In1.Cu") (uuid "z") (polygon (pts (xy 0 0) (xy 40 0) (xy 40 30) (xy 0 30)))
        (filled_polygon (layer "In1.Cu") (pts (xy 1 1) (xy 39 1) (xy 39 29) (xy 1 29))))
      (zone (net 0) (net_name "") (layer "In2.Cu") (uuid "k") (keepout (copperpour not_allowed)) (polygon (pts (xy 0 0) (xy 5 0) (xy 5 5)))
        (filled_polygon (layer "In2.Cu") (pts (xy 0 0) (xy 5 0) (xy 5 5))))`;
    const d = readBoardDrawing(board(z));
    expect(d.fills).toHaveLength(1);
    expect(d.fills[0]).toMatchObject({ net: 'GND', layer: 'In1.Cu' });
    expect(Array.from(d.fills[0].xy)).toEqual([1, 1, 39, 1, 39, 29, 1, 29]);
    expect(d.outline).toHaveLength(1);
    expect(d.copper).toEqual(['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu']);
  });
});
