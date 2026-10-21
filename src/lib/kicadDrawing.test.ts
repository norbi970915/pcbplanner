import fs from 'node:fs';
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
    expect(d.parts).toEqual([{ ref: 'R7', x: 20, y: 15, back: false, body: [] }]);
    const [p1, p2, hole] = d.pads;
    expect([p1.x, p1.y, p1.angle, p1.shape, p1.rr, p1.net, p1.ref, p1.num]).toEqual([20, expect.closeTo(15.51, 9), 90, 'roundrect', 0.25, '/SIG', 'R7', '1']);
    expect(p2.y).toBeCloseTo(14.49, 9);
    expect(p1.layers).toEqual(['F.Cu']); // paste and mask are not copper
    expect(hole.layers).toEqual(['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu']); // *.Cu expanded
    expect(hole.drill).toBe(1);
    expect(hole.x).toBeCloseTo(22, 9); // (0, 2) turned by 90°
  });

  it('a pad written without an angle is at 0°, not at the footprint angle (KiCad leaves 0 out)', () => {
    // a QFN turned by 90°: the pins of one side end up horizontal on the board and are written without an angle
    const fp = `(footprint "QFN" (layer "B.Cu") (at 66.3 103.1 90)
      (property "Reference" "U6" (at 0 0 -90) (layer "B.SilkS"))
      (pad "46" smd roundrect (at 1.398 3.351) (size 0.7 0.2) (layers "B.Cu" "B.Paste" "B.Mask") (roundrect_rratio 0.25) (net 1 "GND"))
      (pad "59" thru_hole circle (at -0.152 -1.322 90) (size 0.45 0.45) (drill 0.1) (layers "*.Cu") (net 1 "GND")))`;
    const [pin, ep] = readBoardDrawing(board(fp)).pads;
    expect(pin.angle).toBe(0); // its 0.7 mm runs along x, across the row of pins
    expect(ep.angle).toBe(90);
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

describe('part bodies', () => {
  it('the body is the Fab drawing on the side of the part, turned like its pads; the courtyard when there is no Fab', () => {
    // a 2 × 1 body on F.Fab at (20, 15) turned by 90°: 1 wide in x, 2 tall in y; the silkscreen line is not body
    const fab = `(footprint "R_0805" (layer "F.Cu") (at 20 15 90)
      (property "Reference" "R1" (at 0 0 90) (layer "F.SilkS"))
      (fp_rect (start -1 -0.5) (end 1 0.5) (stroke (width 0.1) (type solid)) (fill none) (layer "F.Fab"))
      (fp_line (start -1 -1) (end 1 -1) (stroke (width 0.12) (type solid)) (layer "F.SilkS"))
      (fp_rect (start -2 -1) (end 2 1) (stroke (width 0.05) (type solid)) (fill none) (layer "F.CrtYd"))
      (pad "1" smd rect (at -1 0 90) (size 1 1) (layers "F.Cu") (net 1 "GND")))`;
    // a bottom part with only a courtyard circle
    const crt = `(footprint "TP" (layer "B.Cu") (at 10 10)
      (property "Reference" "TP1" (at 0 0) (layer "B.SilkS"))
      (fp_circle (center 0 0) (end 1.5 0) (stroke (width 0.05) (type solid)) (fill none) (layer "B.CrtYd"))
      (fp_line (start -1 0) (end 1 0) (stroke (width 0.1) (type solid)) (layer "F.Fab"))
      (pad "1" smd circle (at 0 0) (size 1 1) (layers "B.Cu") (net 1 "GND")))`;
    const d = readBoardDrawing(board(fab + crt));
    const [r1, tp] = d.parts;
    expect(r1.body).toHaveLength(1);
    const xs = r1.body![0].pts.map((p) => p[0]);
    const ys = r1.body![0].pts.map((p) => p[1]);
    expect(r1.body![0].closed).toBe(true);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2, 6);
    expect((Math.max(...ys) + Math.min(...ys)) / 2).toBeCloseTo(15, 6);
    // the F.Fab line of a bottom part is not its side; its courtyard circle (r 1.5) is the body
    expect(tp.back).toBe(true);
    expect(tp.body).toHaveLength(1);
    expect(Math.max(...tp.body![0].pts.map((p) => p[0]))).toBeCloseTo(11.5, 6);
    // the outline is still only the board's own rectangle
    expect(d.outline).toHaveLength(1);
  });

  it('the parts of the example board carry a Fab body', () => {
    const text = fs.readFileSync('public/examples/pcbplanner-example-6layer.kicad_pcb', 'utf8');
    const d = readBoardDrawing(text);
    expect(d.parts.map((p) => [p.ref, p.body?.length])).toEqual([['J1', 1], ['U1', 1], ['U2', 1], ['C1', 1]]);
  });
});

describe('board outline in a footprint', () => {
  it('Edge.Cuts lines inside a footprint are part of the outline, turned like its pads', () => {
    // a mechanical footprint at (50, 50) turned by 90°, its outline a 20 × 10 rectangle of fp_lines
    const fp = `(footprint "Outline" (layer "F.Cu") (at 50 50 90)
      (property "Reference" "MK1" (at 0 0 90) (layer "F.SilkS"))
      (fp_line (start -10 -5) (end 10 -5) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
      (fp_line (start 10 -5) (end 10 5) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
      (fp_line (start 10 5) (end -10 5) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
      (fp_line (start -10 5) (end -10 -5) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
      (fp_line (start 0 0) (end 1 1) (stroke (width 0.1) (type solid)) (layer "F.SilkS")))`;
    const d = readBoardDrawing(board(fp));
    // the board helper has its own 40 × 30 outline at the origin; the footprint's lies around (50, 50)
    const big = d.outline.find((l) => l.every((p) => p[0] > 40))!;
    const xs = big.map((p) => p[0]);
    const ys = big.map((p) => p[1]);
    // turned by 90°: 10 wide in x, 20 tall in y, around (50, 50)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(10, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(20, 6);
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(50, 6);
  });
});
