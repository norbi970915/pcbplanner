/// <reference types="node" />
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { designLine } from './design';
import { EXAMPLE_FILE, EXAMPLE_PRESET_ID, EXAMPLE_PROJECT_FILE, exampleBoard, exampleProject } from './kicadExample';
import { boardNotes, guessRoles, kicadStackup, parseKicadBoard, parseSexpr, readStackup, type SNode } from './kicadImport';
import { calcStackup, designRequest, impedanceLink, lossRequest, planLayers, TARGETS, toCsv, toText, type ImpedanceSettings } from './kicadImpedance';
import { toKicad } from './stackupExport';
import { geometryForLayer, PRESETS, type Stackup } from './stackups';

const settings: ImpedanceSettings = { gapRule: 'fixed', gap: 0.127, fGHz: 4, rqUm: 3.2 };
const stackupOf = (text: string, roles?: Record<string, 'signal' | 'plane'>) => kicadStackup(parseKicadBoard(text), { name: 'test', roles })!;

/** A minimal KiCad 8 board around a stackup body and extra top-level items. */
function board(stackup: string, extra = '', layers = '(0 "F.Cu" signal) (31 "B.Cu" signal)') {
  return `(kicad_pcb (version 20240108) (generator "pcbnew") (generator_version "8.0")
  (general (thickness 1.6))
  (layers ${layers} (44 "Edge.Cuts" user))
  (setup (stackup ${stackup} (dielectric_constraints no)) (pad_to_mask_clearance 0))
  (net 0 "")
  ${extra}
)`;
}
const TWO = `(layer "F.Mask" (type "Top Solder Mask") (thickness 0.01))
  (layer "F.Cu" (type "copper") (thickness 0.035))
  (layer "dielectric 1" (type "core") (thickness 1.51) (material "FR4") (epsilon_r 4.5) (loss_tangent 0.02))
  (layer "B.Cu" (type "copper") (thickness 0.035))
  (layer "B.Mask" (type "Bottom Solder Mask") (thickness 0.01))`;

describe('s-expression reader', () => {
  it('reads quoted and unquoted atoms, escapes and nesting', () => {
    const n = parseSexpr('(a "b c" d (e "f \\"g\\" (h)" 1.5) "\\\\")');
    expect(n).toEqual([['a', 'b c', 'd', ['e', 'f "g" (h)', '1.5'], '\\']]);
  });
  it('rejects files that are not KiCad boards, legacy .brd files and truncated files', () => {
    expect(() => parseKicadBoard('hello')).toThrow(/not a KiCad board/);
    expect(() => parseKicadBoard('PCBNEW-BOARD Version 1 date 2010')).toThrow(/legacy/);
    expect(() => parseKicadBoard('(kicad_pcb (version 20240108) (setup (stackup')).toThrow(/unclosed/);
  });
  it('parentheses inside strings do not end an item', () => {
    const b = parseKicadBoard(board(TWO, '(gr_text "a ) ( b" (at 0 0) (layer "F.SilkS")) (net 1 "(odd) net")'));
    expect(b.stackup).toHaveLength(5);
  });
});

describe('stackup grammar (FormatBoardStackup / parseBoardStackup)', () => {
  const node = (s: string) => parseSexpr(s)[0] as SNode[];
  it('sublayers after the bare addsublayer token, locked thickness, colour and frequency', () => {
    const { items, copperFinish } = readStackup(
      node(`(stackup
        (layer "F.SilkS" (type "Top Silk Screen") (color "White"))
        (layer "dielectric 1" (type "prepreg") (color "FR4 natural") (thickness 0.1 locked) (material "2116") (epsilon_r 4.2) (loss_tangent 0.018) (spec_frequency 10000000000) (dielectric_model djordjevic_sarkar) addsublayer (thickness 0.05) (material "106") (epsilon_r 3.9) (loss_tangent 0.02))
        (copper_finish "ENIG") (dielectric_constraints no) (future_token 1 2 3))`),
    );
    expect(copperFinish).toBe('ENIG');
    expect(items[1].subs).toEqual([
      { color: 'FR4 natural', t: 0.1, locked: true, material: '2116', er: 4.2, df: 0.018, fHz: 1e10, model: 'djordjevic_sarkar' },
      { t: 0.05, material: '106', er: 3.9, df: 0.02 },
    ]);
  });
  it('also accepts a list form (addsublayer …) and unquoted atoms', () => {
    const { items } = readStackup(node('(stackup (layer dielectric_1 (type core) (thickness 0.2) (material FR4) (addsublayer (thickness 0.3) (epsilon_r 4.1))))'));
    expect(items[0].type).toBe('core');
    expect(items[0].subs).toEqual([{ t: 0.2, material: 'FR4' }, { t: 0.3, er: 4.1 }]);
  });
  it('every sublayer becomes a ply; missing values take KiCad defaults and are noted', () => {
    const r = stackupOf(
      board(`(layer "F.Mask" (type "Top Solder Mask") (thickness 0.015))
      (layer "F.Cu" (type "copper"))
      (layer "dielectric 1" (type "prepreg") (thickness 0.1) (material "Prepreg 2116") (epsilon_r 4.2) addsublayer (thickness 0.08) (material "Prepreg 1080") (epsilon_r 4.0) (loss_tangent 0))
      (layer "B.Cu" (type "copper") (thickness 0.018))`),
    );
    const d = r.stackup.layers.filter((l) => l.kind === 'dielectric');
    expect(d.map((l) => [l.name, l.t, l.er, l.df])).toEqual([
      ['Prepreg 2116', 0.1, 4.2, 0.02],
      ['Prepreg 1080', 0.08, 4, 0],
    ]);
    expect(r.stackup.layers.find((l) => l.kind === 'mask')).toMatchObject({ t: 0.015, er: 3.3, df: 0.027 });
    expect(r.stackup.layers.find((l) => l.name === 'F.Cu')?.t).toBe(0.035);
    const text = r.notes.map((n) => n.text).join('\n');
    expect(text).toMatch(/F\.Mask: no Dk/);
    expect(text).toMatch(/F\.Cu: no copper thickness/);
    expect(text).toMatch(/dielectric 1 \(sublayer 1\): no loss tangent/);
    expect(text).toMatch(/dielectric 1 \(sublayer 2\): loss tangent 0/);
  });
  it('flags KiCad’s default FR4 values (Dk 4.5, Df 0.02) first', () => {
    const r = stackupOf(board(TWO));
    expect(r.notes[0]).toMatchObject({ kind: 'default' });
    expect(r.notes[0].text).toMatch(/dielectric 1: Dk 4\.5 and loss tangent 0\.02 are KiCad's defaults/);
    expect(r.stackup.layers.find((l) => l.kind === 'dielectric')?.name).toBe('FR4 core');
  });
  it('a dielectric without thickness is an error, not a guess', () => {
    expect(() => stackupOf(board('(layer "F.Cu" (type "copper")) (layer "dielectric 1" (type "core") (material "FR4")) (layer "B.Cu" (type "copper"))'))).toThrow(/no thickness/);
  });
});

describe('round trip with the KiCad export', () => {
  const counts = [2, 4, 6, 8, 10, 12];
  const presets = [...counts.map((n) => PRESETS.find((s) => s.layers.filter((l) => l.kind === 'copper').length === n)!), PRESETS.find((s) => s.id === 'std-4l-8-1080-2')!];
  for (const preset of presets) {
    it(`${preset.id}: plies, thicknesses, Dk, Df and roles survive toKicad → import`, () => {
      const b = parseKicadBoard(toKicad(preset)[0].content);
      expect(b.version).toBe(20240108);
      expect(b.kicad).toBe('8.0');
      const r = kicadStackup(b, { name: preset.name })!;
      const simple = (s: Stackup) => s.layers.map((l) => ({ kind: l.kind, t: l.t, er: l.kind === 'copper' ? undefined : l.er, df: l.kind === 'copper' ? undefined : l.df, role: l.kind === 'copper' ? (l.role ?? 'signal') : undefined }));
      expect(simple(r.stackup)).toEqual(simple(preset));
      expect(r.stackup.layers.filter((l) => l.kind === 'dielectric').map((l) => l.name)).toEqual(preset.layers.filter((l) => l.kind === 'dielectric').map((l) => l.name));
      expect(boardNotes(b)).toEqual(['No board outline (Edge.Cuts) and no zones were found, so plane layers could not be detected from zones. Set the layer roles by hand.']);
      expect(r.notes).toEqual([]);
    });
  }
});

describe('plane detection from zones', () => {
  const four = `(layer "F.Cu" (type "copper") (thickness 0.035))
    (layer "dielectric 1" (type "prepreg") (thickness 0.2) (material "FR4") (epsilon_r 4.2) (loss_tangent 0.015))
    (layer "In1.Cu" (type "copper") (thickness 0.035))
    (layer "dielectric 2" (type "core") (thickness 1.0) (material "FR4") (epsilon_r 4.4) (loss_tangent 0.015))
    (layer "In2.Cu" (type "copper") (thickness 0.035))
    (layer "dielectric 3" (type "prepreg") (thickness 0.2) (material "FR4") (epsilon_r 4.2) (loss_tangent 0.015))
    (layer "B.Cu" (type "copper") (thickness 0.035))`;
  const layers4 = '(0 "F.Cu" signal) (1 "In1.Cu" signal) (2 "In2.Cu" mixed) (31 "B.Cu" signal)';
  const rect = (x0: number, y0: number, x1: number, y1: number) => `(polygon (pts (xy ${x0} ${y0}) (xy ${x1} ${y0}) (xy ${x1} ${y1}) (xy ${x0} ${y1})))`;
  const zone = (net: string, layer: string, poly: string, more = '') => `(zone (net 1) (net_name "${net}") (layer "${layer}") (uuid "x") ${more} ${poly} (filled_polygon (layer "${layer}") (pts (xy 0 0) (xy 1 0) (xy 1 1))))`;
  const seg = (layer: string, len: number) => `(segment (start 10 10) (end ${10 + len} 10) (width 0.2) (layer "${layer}") (net 2) (uuid "s"))`;
  const outline = '(gr_line (start 0 0) (end 100 0) (stroke (width 0.1) (type default)) (layer "Edge.Cuts")) (gr_line (start 100 0) (end 100 50) (layer "Edge.Cuts")) (gr_line (start 0 50) (end 100 50) (layer "Edge.Cuts")) (gr_line (start 0 50) (end 0 0) (layer "Edge.Cuts"))';

  it('outline area from chained Edge.Cuts lines; zones clipped to the board; nets ranked', () => {
    const b = parseKicadBoard(board(four, outline + zone('GND', 'In1.Cu', rect(-5, -5, 105, 55)) + zone('+3V3', 'In2.Cu', rect(0, 0, 40, 50)) + zone('+1V8', 'In2.Cu', rect(40, 0, 70, 50)), layers4));
    expect(b.board).toMatchObject({ area: 5000, source: 'outline' });
    const in1 = b.copper.find((c) => c.name === 'In1.Cu')!;
    expect(in1.zoneArea).toBeCloseTo(5000, 6);
    const in2 = b.copper.find((c) => c.name === 'In2.Cu')!;
    expect(in2.nets.map((n) => n.net)).toEqual(['+3V3', '+1V8']);
    expect(in2.zoneArea).toBeCloseTo(3500, 6);
    const g = guessRoles(b);
    expect(g['In1.Cu'].role).toBe('plane');
    expect(g['In2.Cu'].role).toBe('plane'); // split plane: two nets, 70 %
    expect(g['F.Cu'].role).toBe('signal');
    expect(g['In1.Cu'].reason).toMatch(/GND 100 %/);
  });
  it('a ground pour on a busy signal layer stays a signal layer', () => {
    const b = parseKicadBoard(board(four, outline + zone('GND', 'F.Cu', rect(0, 0, 100, 50)) + zone('GND', 'In1.Cu', rect(0, 0, 100, 50)) + seg('F.Cu', 80) + seg('B.Cu', 60) + seg('In1.Cu', 5), layers4));
    const g = guessRoles(b);
    expect(g['F.Cu'].role).toBe('signal');
    expect(g['F.Cu'].reason).toMatch(/routing/);
    expect(g['In1.Cu'].role).toBe('plane'); // 5 mm of track is under a fifth of 80 mm
    expect(b.copper.find((c) => c.name === 'F.Cu')!.routedMm).toBeCloseTo(80, 9);
  });
  it('under half coverage is a signal layer; a declared power layer is a plane', () => {
    const b = parseKicadBoard(board(four, outline + zone('GND', 'In1.Cu', rect(0, 0, 45, 50)), '(0 "F.Cu" signal) (1 "In1.Cu" signal) (2 "In2.Cu" power) (31 "B.Cu" signal)'));
    const g = guessRoles(b);
    expect(g['In1.Cu'].role).toBe('signal');
    expect(g['In2.Cu'].role).toBe('plane');
    expect(g['In2.Cu'].reason).toMatch(/power/);
  });
  it('keepout and teardrop zones are ignored; F&B.Cu, *.Cu and KiCad 10 net names are read', () => {
    const extra =
      outline +
      zone('GND', 'In1.Cu', rect(0, 0, 100, 50), '(keepout (tracks not_allowed))') +
      zone('GND', 'In2.Cu', rect(0, 0, 100, 50), '(attr (teardrop (type padvia)))') +
      `(zone (net "VBUS") (layers "F&B.Cu") (uuid "y") ${rect(0, 0, 60, 50)})` +
      `(zone (net 3) (net_name "AGND") (layers "*.Cu") (uuid "z") ${rect(0, 0, 10, 10)})`;
    const b = parseKicadBoard(board(four, extra, layers4));
    expect(b.stats.zones).toBe(2);
    expect(b.copper.find((c) => c.name === 'In1.Cu')!.nets).toEqual([{ net: 'AGND', area: 100 }]);
    expect(b.copper.find((c) => c.name === 'F.Cu')!.nets.map((n) => n.net)).toEqual(['VBUS', 'AGND']);
    expect(b.copper.find((c) => c.name === 'B.Cu')!.nets[0]).toEqual({ net: 'VBUS', area: 3000 });
  });
  it('two-layer board: the poured side is the reference even when it carries tracks', () => {
    const b = parseKicadBoard(board(TWO, outline + zone('GND', 'B.Cu', rect(0, 0, 100, 50)) + seg('F.Cu', 50) + seg('B.Cu', 60)));
    expect(guessRoles(b)['B.Cu'].role).toBe('plane');
    const both = parseKicadBoard(board(TWO, outline + zone('GND', 'B.Cu', rect(0, 0, 100, 50)) + zone('GND', 'F.Cu', rect(0, 0, 100, 50)) + seg('F.Cu', 50) + seg('B.Cu', 60)));
    expect(Object.values(guessRoles(both)).map((g) => g.role)).toEqual(['signal', 'signal']);
  });
  it('outline from gr_rect, gr_poly and gr_circle; bounding box when the outline is open', () => {
    expect(parseKicadBoard(board(TWO, '(gr_rect (start 0 0) (end 20 10) (layer "Edge.Cuts"))')).board).toMatchObject({ area: 200, source: 'outline' });
    expect(parseKicadBoard(board(TWO, '(gr_poly (pts (xy 0 0) (xy 10 0) (xy 0 10)) (layer "Edge.Cuts"))')).board.area).toBeCloseTo(50, 9);
    expect(parseKicadBoard(board(TWO, '(gr_circle (center 0 0) (end 10 0) (layer "Edge.Cuts"))')).board.area).toBeCloseTo(Math.PI * 100, 6);
    expect(parseKicadBoard(board(TWO, '(gr_line (start 0 0) (end 20 0) (layer "Edge.Cuts")) (gr_line (start 20 0) (end 20 10) (layer "Edge.Cuts"))')).board).toMatchObject({ area: 200, source: 'bbox' });
    expect(parseKicadBoard(board(TWO, '(gr_rect (start 0 0) (end 20 10) (layer "F.SilkS"))')).board.source).toBe('none');
  });
  it('zone cut-outs are subtracted, overlapping zones of a net are counted once, zones are clipped to the real outline', () => {
    // KiCad writes a zone's cut-outs as further (polygon …) lists after the outline
    const holed = parseKicadBoard(board(four, outline + zone('GND', 'In1.Cu', rect(0, 0, 100, 50) + rect(10, 10, 60, 40)), layers4));
    expect(holed.copper.find((c) => c.name === 'In1.Cu')!.zoneArea).toBeCloseTo(5000 - 1500, 6);
    expect(guessRoles(holed)['In1.Cu'].coverage).toBeCloseTo(0.7, 6);
    const overlap = parseKicadBoard(board(four, outline + zone('GND', 'In1.Cu', rect(0, 0, 60, 50)) + zone('GND', 'In1.Cu', rect(40, 0, 100, 50)), layers4));
    expect(overlap.copper.find((c) => c.name === 'In1.Cu')!.nets).toEqual([{ net: 'GND', area: expect.closeTo(5000, 6) }]);
    // an L-shaped board: the zone over the missing corner does not count
    const lShape = '(gr_poly (pts (xy 0 0) (xy 100 0) (xy 100 25) (xy 50 25) (xy 50 50) (xy 0 50)) (layer "Edge.Cuts"))';
    const l = parseKicadBoard(board(four, lShape + zone('GND', 'In1.Cu', rect(0, 0, 100, 50)), layers4));
    expect(l.board.area).toBeCloseTo(3750, 6);
    expect(l.copper.find((c) => c.name === 'In1.Cu')!.zoneArea).toBeCloseTo(3750, 6);
  });
});

describe('KiCad 5 files', () => {
  const k5 = `(kicad_pcb (version 20171130) (host pcbnew "(5.1.9)-1")
  (general (thickness 1.6) (drawings 4) (tracks 2))
  (page A4)
  (layers (0 top_copper signal) (1 GND_layer power) (2 In2.Cu signal) (31 B.Cu signal) (44 Edge.Cuts user))
  (setup (last_trace_width 0.25) (pad_to_mask_clearance 0.05))
  (net 0 "") (net 1 GND)
  (gr_line (start 0 0) (end 50 0) (layer Edge.Cuts) (width 0.15)) (gr_line (start 50 0) (end 50 40) (layer Edge.Cuts) (width 0.15))
  (gr_line (start 50 40) (end 0 40) (layer Edge.Cuts) (width 0.15)) (gr_line (start 0 40) (end 0 0) (layer Edge.Cuts) (width 0.15))
  (segment (start 1 1) (end 21 1) (width 0.25) (layer top_copper) (net 1) (tstamp 5C0))
  (zone (net 1) (net_name GND) (layer GND_layer) (tstamp 0) (hatch edge 0.508) (connect_pads (clearance 0.5)) (min_thickness 0.254) (fill yes (arc_segments 32) (thermal_gap 0.508) (thermal_bridge_width 0.508)) (polygon (pts (xy 0 0) (xy 50 0) (xy 50 40) (xy 0 40))))
)`;
  it('has no stackup: reported as KiCad 5, user-named copper layers mapped by number', () => {
    const b = parseKicadBoard(k5);
    expect(b.kicad).toBe('5 or older');
    expect(b.generatorVersion).toBe('5.1.9');
    expect(b.stackup).toBeNull();
    expect(b.thickness).toBe(1.6);
    expect(b.copper.map((c) => [c.name, c.userName])).toEqual([
      ['F.Cu', 'top_copper'],
      ['In1.Cu', 'GND_layer'],
      ['In2.Cu', undefined],
      ['B.Cu', undefined],
    ]);
    expect(b.copper[0].routedMm).toBe(20);
    expect(guessRoles(b)['In1.Cu'].role).toBe('plane');
    expect(kicadStackup(b, { name: 'k5' })).toBeNull();
  });
});

describe('large files', () => {
  it('a ~30 MB board is read in well under the time limit and every track is counted', () => {
    const fp = (i: number) =>
      `\t(footprint "Resistor_SMD:R_0402_1005Metric" (layer "F.Cu") (uuid "f${i}") (at ${i % 300} ${i % 200})\n\t\t(property "Reference" "R${i} (x)" (at 0 0) (layer "F.SilkS"))\n\t\t(pad "1" smd roundrect (at -0.48 0) (size 0.56 0.62) (layers "F.Cu" "F.Paste" "F.Mask") (net 1 "GND"))\n\t\t(pad "2" smd roundrect (at 0.48 0) (size 0.56 0.62) (layers "F.Cu" "F.Paste" "F.Mask") (net 2 "/SIG"))\n\t)\n`;
    const sg = (i: number) => `\t(segment (start ${i % 300}.1 ${i % 200}.2) (end ${(i % 300) + 1}.1 ${i % 200}.2) (width 0.2) (layer "${i % 2 ? 'F.Cu' : 'B.Cu'}") (net 2) (uuid "00000000-0000-0000-0000-${String(i).padStart(12, '0')}"))\n`;
    const parts: string[] = [];
    for (let i = 0; i < 40000; i++) parts.push(fp(i));
    for (let i = 0; i < 120000; i++) parts.push(sg(i));
    const text = board(TWO, '(gr_rect (start 0 0) (end 300 200) (layer "Edge.Cuts"))\n' + parts.join(''));
    expect(text.length).toBeGreaterThan(25e6);
    const t0 = performance.now();
    const b = parseKicadBoard(text);
    const ms = performance.now() - t0;
    expect(b.stats.tracks).toBe(120000);
    expect(b.copper[0].routedMm).toBeCloseTo(60000, 3);
    expect(b.stackup).toHaveLength(5);
    expect(ms).toBeLessThan(4000);
  });
});

describe('example board and impedance plan', () => {
  const text = exampleBoard();
  const path = join('public', 'examples', EXAMPLE_FILE);
  const proPath = join('public', 'examples', EXAMPLE_PROJECT_FILE);
  it.runIf(!!process.env.WRITE_KICAD_EXAMPLE)('write the example board and project', () => {
    writeFileSync(path, text);
    writeFileSync(proPath, exampleProject());
  });
  it('public/examples holds the generated example board and project', () => {
    expect(readFileSync(path, 'utf8')).toBe(text);
    expect(readFileSync(proPath, 'utf8')).toBe(exampleProject());
  });
  const b = parseKicadBoard(text);
  const r = kicadStackup(b, { name: 'example' })!;
  it('planes are found from the zones, not from the layer setup', () => {
    expect(b.copper.every((c) => c.type === 'signal')).toBe(true);
    expect(r.stackup.layers.filter((l) => l.kind === 'copper' && l.role === 'plane').map((l) => l.name)).toEqual(['In1.Cu', 'In3.Cu', 'In4.Cu']);
    expect(guessRoles(b)['F.Cu']).toMatchObject({ role: 'signal' });
    expect(guessRoles(b)['F.Cu'].coverage).toBeCloseTo(0.3, 6);
    expect(b.board).toMatchObject({ area: 4800, source: 'outline' });
  });
  it('line types and reference planes', () => {
    const plans = planLayers(r.stackup);
    expect(plans.map((p) => [p.layer.name, p.kind, p.refs.join(' / ')])).toEqual([
      ['F.Cu', 'coated microstrip', 'In1.Cu'],
      ['In2.Cu', 'stripline', 'In1.Cu / In3.Cu'],
      ['B.Cu', 'coated microstrip', 'In4.Cu'],
    ]);
    expect(planLayers(calcStackup(r.stackup, false))[0].kind).toBe('microstrip');
    const dual = planLayers({ ...r.stackup, layers: r.stackup.layers.map((l) => (l.name === 'In3.Cu' ? { ...l, role: 'signal' as const } : l)) });
    expect(dual.find((p) => p.layer.name === 'In2.Cu')?.kind).toBe('dual stripline');
  });
  it('design requests equal the Layer Stack Manager’s for the same stackup, and so do the widths', () => {
    const preset = PRESETS.find((s) => s.id === EXAMPLE_PRESET_ID)!;
    const presetSignals = preset.layers.filter((l) => l.kind === 'copper' && l.role !== 'plane');
    const plans = planLayers(r.stackup);
    expect(plans).toHaveLength(presetSignals.length);
    plans.forEach((pl, i) => {
      const sg = geometryForLayer(preset, presetSignals[i].id)!;
      const strip = (g: typeof sg) => ({ ...g, note: '' });
      // the Layer Stack Manager's requests (StackupTool impedance view)
      const base = { sg, etch: 0.0127, accuracy: 'normal' as const };
      const se = { ...base, kind: 'se' as const, target: 50 };
      const diff = { ...base, kind: 'diff' as const, target: 100, rule: { mode: 'fixed' as const, s: 0.127, ratio: 1, minS: 0 } };
      const mine = designRequest(pl.sg!, TARGETS[0], settings);
      const mineDiff = designRequest(pl.sg!, TARGETS[2], settings);
      expect({ ...mine, sg: strip(mine.sg) }).toEqual({ ...se, sg: strip(sg) });
      expect({ ...mineDiff, sg: strip(mineDiff.sg) }).toEqual({ ...diff, sg: strip(sg) });
    });
    const sg = geometryForLayer(preset, presetSignals[0].id)!;
    const w = designLine(designRequest(plans[0].sg!, TARGETS[0], settings)).w;
    expect(w).toBeCloseTo(designLine({ sg, etch: 0.0127, accuracy: 'normal', kind: 'se', target: 50 }).w, 9);
    expect(w).toBeGreaterThan(0.1);
    expect(w).toBeLessThan(0.2);
  });
  it('loss request: one material per slab with the file’s Df, Dk moved to the loss frequency, mask Df from the mask layer', () => {
    const plans = planLayers(r.stackup);
    for (const pl of plans) {
      const req = lossRequest(r.stackup, pl, 0.15, 0.127, true, settings);
      expect(req.slabSpecs).toHaveLength(req.geom.slabs.length);
      expect(req.slabSpecs.every((s) => s.df === 0.015 && s.f0 === 1e9)).toBe(true);
      expect(req.geom.slabs.every((sl, i) => sl.er < req.slabSpecs[i].dk)).toBe(true); // Dk falls with frequency
      expect(req.freqs).toEqual([4e9]);
    }
    expect(lossRequest(r.stackup, plans[0], 0.15, undefined, false, settings).maskSpec).toMatchObject({ df: 0.027, dk: 3.8 });
  });
  it('impedance link carries the explicit geometry and the designed line', () => {
    const pl = planLayers(r.stackup)[1];
    const q = new URLSearchParams(impedanceLink(pl.sg!, TARGETS[2], 0.1, 0.127).split('?')[1]);
    expect(q.get('type')).toBe('stripline');
    expect(q.get('mode')).toBe('diff');
    expect(q.get('w')).toBe('0.1');
    expect(q.get('s')).toBe('0.127');
    expect(q.get('target')).toBe('100');
    expect(q.get('h2')).not.toBeNull();
  });
  it('CSV and text tables', () => {
    expect(toCsv([['a', 'b,c'], ['"q"', '1']])).toBe('a,"b,c"\r\n"""q""",1\r\n');
    expect(toText([['Layer', 'W'], ['In10.Cu', '0.1']])).toBe('Layer    W\nIn10.Cu  0.1\n');
  });
});

// Real open-hardware boards (not committed): KICAD_BOARDS=<folder with .kicad_pcb files, searched one level deep>
describe.runIf(!!process.env.KICAD_BOARDS)('real KiCad boards', () => {
  const dir = process.env.KICAD_BOARDS ?? '';
  const files = existsSync(dir)
    ? readdirSync(dir).flatMap((d) => {
        const p = join(dir, d);
        return statSync(p).isDirectory() ? readdirSync(p).filter((f) => f.endsWith('.kicad_pcb')).map((f) => join(p, f)) : p.endsWith('.kicad_pcb') ? [p] : [];
      })
    : [];
  for (const f of files) {
    it(f, () => {
      const b = parseKicadBoard(readFileSync(f, 'utf8'));
      expect(b.copper.length).toBeGreaterThanOrEqual(2);
      if (b.version < 20200000) {
        expect(b.stackup).toBeNull();
        return;
      }
      const r = kicadStackup(b, { name: f })!;
      expect(r.stackup.layers.filter((l) => l.kind === 'copper').map((l) => l.name)).toEqual(b.copper.map((c) => c.name));
      expect(Math.abs(r.stackup.layers.reduce((a, l) => a + l.t, 0) - (b.thickness ?? 0))).toBeLessThan(0.05);
      expect(planLayers(r.stackup).length).toBeGreaterThan(0);
    });
  }
});
