// The example project behind “Try an example” on the KiCad impedance page
// (public/examples/pcbplanner-example-6layer.kicad_pcb and .kicad_pro). The board is the site's own
// KiCad export of a 6-layer library stackup, with every copper layer left as a signal layer in the
// layer setup, plus an 80 × 60 mm outline, GND and +3V3 plane zones on In1, In3 and In4, a small GND
// pour on F.Cu and a few routed nets, so the page has to find the planes from the zones as it would
// on a real board. The routing is there to show the routing check:
//   /USB_D±     90 Ω pair, right on F.Cu (0.117/0.15 mm), then through two vias onto In2.Cu where it
//               keeps the 0.20 mm default width: too low an impedance there
//   /HDMI_D0±   100 Ω pair on F.Cu with an uncompensated 90° arc bend: 0.38 mm intra-pair skew
//   /PCIE_TX0±  85 Ω pair on F.Cu, routed right
//   /CLK        single-ended 50 Ω net (class 50R) on F.Cu and In2.Cu, each layer at its own width
// Along the bottom edge a small power section gives the Power, Thermal and Clearance views parts to work on:
// a 2-pin +5V connector J1, a SOT-223 3.3 V regulator U1 (tab on +3V3), a 4 × 4 mm IC U2 with an exposed
// ground pad and five thermal vias, its decoupling capacitor C1, and the +5V, +3V3 and GND tracks between them.
// The .kicad_pro is a KiCad 8 project (net settings schema 3) that puts the nets into classes with
// netclass_patterns and one explicit netclass_assignments entry.
// kicadImport.test.ts checks that the files in public/ match this generator.
import { EXAMPLE_FILLS } from './kicadExampleFills';
import { toKicad } from './stackupExport';
import { PRESETS } from './stackups';

export const EXAMPLE_PRESET_ID = 'std-6l-16-1080-2';
export const EXAMPLE_FILE = 'pcbplanner-example-6layer.kicad_pcb';
export const EXAMPLE_PROJECT_FILE = 'pcbplanner-example-6layer.kicad_pro';

type P = [number, number];
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

/** A polyline offset sideways by d (left of the direction of travel for d > 0), with mitred corners. */
export function offsetPath(pts: P[], d: number): P[] {
  const unit = (a: P, b: P): P => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  };
  return pts.map((p, i) => {
    const u1 = unit(pts[Math.max(0, i - 1)], pts[Math.max(1, i)]);
    const u2 = unit(pts[Math.min(pts.length - 2, i)], pts[Math.min(pts.length - 1, i + 1)]);
    const n1: P = [u1[1], -u1[0]];
    const n2: P = [u2[1], -u2[0]];
    const m: P = [n1[0] + n2[0], n1[1] + n2[1]];
    const ml = Math.hypot(m[0], m[1]);
    const k = d / ((m[0] * n1[0] + m[1] * n1[1]) / ml);
    return [r4(p[0] + (m[0] / ml) * k), r4(p[1] + (m[1] / ml) * k)];
  });
}

export function exampleBoard(): string {
  const preset = PRESETS.find((s) => s.id === EXAMPLE_PRESET_ID)!;
  const signalOnly = { ...preset, name: 'PCBPlanner example 6-layer', layers: preset.layers.map((l) => (l.kind === 'copper' ? { ...l, role: 'signal' as const } : l)) };
  const pcb = toKicad(signalOnly)[0].content;
  let n = 0;
  const uuid = () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, '0')}`;
  const nets = ['GND', '+3V3', '/PCIE_TX0_P', '/PCIE_TX0_N', '/CLK', '/SDA', '/USB_D+', '/USB_D-', '/HDMI_D0+', '/HDMI_D0-', '+5V'];
  const netNo = (name: string) => nets.indexOf(name) + 1;
  // the zones carry KiCad's own fill (kicadExampleFills.ts, from scripts/refill-example.mjs), found by uuid
  const zone = (net: string, layer: string, pts: P[], id = uuid(), fill = EXAMPLE_FILLS[id]) => `\t(zone
\t\t(net ${netNo(net)})
\t\t(net_name "${net}")
\t\t(layer "${layer}")
\t\t(uuid "${id}")
\t\t(hatch edge 0.5)
\t\t(connect_pads
\t\t\t(clearance 0.3)
\t\t)
\t\t(min_thickness 0.25)
\t\t(filled_areas_thickness no)
\t\t(fill${fill ? ' yes' : ''}
\t\t\t(thermal_gap 0.5)
\t\t\t(thermal_bridge_width 0.5)
\t\t)
\t\t(polygon
\t\t\t(pts
\t\t\t\t${pts.map(([x, y]) => `(xy ${x} ${y})`).join(' ')}
\t\t\t)
\t\t)${fill ? `\n${fill}` : ''}
\t)`;
  const seg = (layer: string, net: string, w: number, a: P, b: P) => `\t(segment
\t\t(start ${a[0]} ${a[1]})
\t\t(end ${b[0]} ${b[1]})
\t\t(width ${w})
\t\t(layer "${layer}")
\t\t(net ${netNo(net)})
\t\t(uuid "${uuid()}")
\t)`;
  const arc = (layer: string, net: string, w: number, a: P, m: P, b: P) => `\t(arc
\t\t(start ${a[0]} ${a[1]})
\t\t(mid ${m[0]} ${m[1]})
\t\t(end ${b[0]} ${b[1]})
\t\t(width ${w})
\t\t(layer "${layer}")
\t\t(net ${netNo(net)})
\t\t(uuid "${uuid()}")
\t)`;
  const via = (net: string, at: P) => `\t(via
\t\t(at ${at[0]} ${at[1]})
\t\t(size 0.6)
\t\t(drill 0.3)
\t\t(layers "F.Cu" "B.Cu")
\t\t(net ${netNo(net)})
\t\t(uuid "${uuid()}")
\t)`;
  const path = (layer: string, net: string, w: number, pts: P[]) => pts.slice(1).map((p, i) => seg(layer, net, w, pts[i], p));
  type Pad = { num: string; net: string; at: P; size: P; shape?: 'rect' | 'roundrect' | 'circle'; drill?: number };
  // body: the package outline on F.Fab, w × h centred on the footprint
  const footprint = (lib: string, ref: string, value: string, at: P, body: P, pads: Pad[]) => `\t(footprint "${lib}"
\t\t(layer "F.Cu")
\t\t(uuid "${uuid()}")
\t\t(at ${at[0]} ${at[1]})
\t\t(property "Reference" "${ref}"
\t\t\t(at 0 -3 0)
\t\t\t(layer "F.SilkS")
\t\t\t(uuid "${uuid()}")
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size 1 1)
\t\t\t\t\t(thickness 0.15)
\t\t\t\t)
\t\t\t)
\t\t)
\t\t(property "Value" "${value}"
\t\t\t(at 0 3 0)
\t\t\t(layer "F.Fab")
\t\t\t(uuid "${uuid()}")
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size 1 1)
\t\t\t\t\t(thickness 0.15)
\t\t\t\t)
\t\t\t)
\t\t)
\t\t(fp_rect (start ${-body[0] / 2} ${-body[1] / 2}) (end ${body[0] / 2} ${body[1] / 2}) (stroke (width 0.1) (type solid)) (fill none) (layer "F.Fab") (uuid "${uuid()}"))
${pads
  .map((p) =>
    p.drill
      ? `\t\t(pad "${p.num}" thru_hole ${p.shape ?? 'circle'} (at ${p.at[0]} ${p.at[1]}) (size ${p.size[0]} ${p.size[1]}) (drill ${p.drill}) (layers "*.Cu" "*.Mask") (net ${netNo(p.net)} "${p.net}") (uuid "${uuid()}"))`
      : `\t\t(pad "${p.num}" smd ${p.shape ?? 'rect'} (at ${p.at[0]} ${p.at[1]}) (size ${p.size[0]} ${p.size[1]}) (layers "F.Cu" "F.Paste" "F.Mask")${p.shape === 'roundrect' ? ' (roundrect_rratio 0.25)' : ''} (net ${netNo(p.net)} "${p.net}") (uuid "${uuid()}"))`,
  )
  .join('\n')}
\t)`;
  const viaAt = (net: string, at: P, layers = '"F.Cu" "B.Cu"') => via(net, at).replace('(layers "F.Cu" "B.Cu")', `(layers ${layers})`);

  // the power section along the bottom edge (y 150–160, clear of the routed nets above it)
  const power = [
    footprint('Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical', 'J1', '+5V in', [128, 155], [2.54, 5.08], [
      { num: '1', net: '+5V', at: [0, -1.27], size: [1.7, 1.7], shape: 'rect', drill: 1 },
      { num: '2', net: 'GND', at: [0, 1.27], size: [1.7, 1.7], drill: 1 },
    ]),
    footprint('Package_TO_SOT_SMD:SOT-223-3_TabPin2', 'U1', 'AMS1117-3.3', [140, 155], [6.5, 3.5], [
      { num: '1', net: 'GND', at: [-2.3, 3.15], size: [1.2, 2] },
      { num: '2', net: '+3V3', at: [0, 3.15], size: [1.2, 2] },
      { num: '3', net: '+5V', at: [2.3, 3.15], size: [1.2, 2] },
      { num: '4', net: '+3V3', at: [0, -3.15], size: [3.3, 2] },
    ]),
    footprint('Package_DFN_QFN:QFN-16-1EP_4x4mm_P0.65mm', 'U2', 'MCU', [165, 155], [4, 4], [
      { num: '1', net: '+3V3', at: [-2, -0.5], size: [0.8, 0.3], shape: 'roundrect' },
      { num: '2', net: 'GND', at: [-2, 0.5], size: [0.8, 0.3], shape: 'roundrect' },
      { num: '3', net: '+3V3', at: [2, -0.5], size: [0.8, 0.3], shape: 'roundrect' },
      { num: '4', net: 'GND', at: [2, 0.5], size: [0.8, 0.3], shape: 'roundrect' },
      { num: '5', net: 'GND', at: [0, 0], size: [2.2, 2.2] },
    ]),
    footprint('Capacitor_SMD:C_0603_1608Metric', 'C1', '10uF', [159.5, 154.6], [0.8, 1.6], [
      { num: '1', net: '+3V3', at: [0, -0.8], size: [0.9, 0.8], shape: 'roundrect' },
      { num: '2', net: 'GND', at: [0, 0.8], size: [0.9, 0.8], shape: 'roundrect' },
    ]),
    // +5V: J1 along B.Cu to a via next to U1 pin 3
    ...path('B.Cu', '+5V', 1, [[128, 153.73], [142.3, 153.73], [142.3, 156]]),
    viaAt('+5V', [142.3, 156]),
    seg('F.Cu', '+5V', 1, [142.3, 156], [142.3, 158.15]),
    // +3V3: from the regulator tab to C1 and both sides of U2
    seg('F.Cu', '+3V3', 0.8, [141.65, 151.85], [168.5, 151.85]),
    seg('F.Cu', '+3V3', 0.8, [159.5, 151.85], [159.5, 153.8]),
    ...path('F.Cu', '+3V3', 0.5, [[162, 151.85], [162, 154.5], [163, 154.5]]),
    ...path('F.Cu', '+3V3', 0.5, [[168.5, 151.85], [168.5, 154.5], [167, 154.5]]),
    // GND: J1 to U1 pin 1 on F.Cu, then along B.Cu to C1 and the thermal vias under U2
    ...path('F.Cu', 'GND', 1, [[128, 156.27], [129.88, 158.15], [137.7, 158.15]]),
    viaAt('GND', [135.5, 158.15]),
    ...path('B.Cu', 'GND', 1, [[135.5, 158.15], [165, 158.15], [165, 155]]),
    seg('B.Cu', 'GND', 0.5, [159.5, 158.15], [159.5, 156.6]),
    viaAt('GND', [159.5, 156.6]),
    seg('F.Cu', 'GND', 0.5, [159.5, 156.6], [159.5, 155.4]),
    seg('F.Cu', 'GND', 0.3, [163, 155.5], [163.9, 155.5]),
    seg('F.Cu', 'GND', 0.3, [167, 155.5], [166.1, 155.5]),
    ...[[165, 155], [164.4, 154.4], [165.6, 154.4], [164.4, 155.6], [165.6, 155.6]].map((at) => viaAt('GND', at as P)),
  ];

  // USB: 0.117/0.15 mm on F.Cu with a 45° jog, two vias, 0.20/0.15 mm on In2.Cu
  const usbF: P[] = [[130, 108], [140, 108], [142, 110], [150, 110]];
  const usbFN = offsetPath(usbF, -(0.117 + 0.15));
  const viaP: P = [151, 109];
  const viaN: P = [151, r4(usbFN[3][1] + 1)];
  const in2P: P[] = [viaP, [r4(151 + 0.958), r4(109 + 0.958)], [175, r4(109 + 0.958)]];
  const in2N: P[] = [viaN, [r4(viaN[0] + (viaN[1] - (in2P[1][1] + 0.35))), r4(in2P[1][1] + 0.35)], [175, r4(in2P[1][1] + 0.35)]];
  // HDMI: 0.09/0.15 mm on F.Cu, a 90° arc bend with N on the outside
  const c = 0.09 + 0.15;
  const s45 = Math.SQRT1_2;
  const hdmi = (net: string, r: number, y: number) => [
    seg('F.Cu', net, 0.09, [130, y], [158, y]),
    arc('F.Cu', net, 0.09, [158, y], [r4(158 + r * s45), r4(127 - r * s45)], [r4(158 + r), 127]),
    seg('F.Cu', net, 0.09, [r4(158 + r), 127], [r4(158 + r), 138]),
  ];

  // zones are drawn a little larger than the board, as is common; KiCad clips the fill to Edge.Cuts
  const full: P[] = [[99, 99], [181, 99], [181, 161], [99, 161]];
  const items = [
    `\t(gr_rect
\t\t(start 100 100)
\t\t(end 180 160)
\t\t(stroke
\t\t\t(width 0.05)
\t\t\t(type default)
\t\t)
\t\t(fill none)
\t\t(layer "Edge.Cuts")
\t\t(uuid "${uuid()}")
\t)`,
    zone('GND', 'In1.Cu', full),
    zone('GND', 'In3.Cu', full),
    zone('+3V3', 'In4.Cu', full),
    zone('GND', 'F.Cu', [[100, 100], [124, 100], [124, 160], [100, 160]]),
    ...path('F.Cu', '/USB_D+', 0.117, usbF),
    seg('F.Cu', '/USB_D+', 0.117, usbF[3], viaP),
    ...path('F.Cu', '/USB_D-', 0.117, usbFN),
    seg('F.Cu', '/USB_D-', 0.117, usbFN[3], viaN),
    via('/USB_D+', viaP),
    via('/USB_D-', viaN),
    ...path('In2.Cu', '/USB_D+', 0.2, in2P),
    ...path('In2.Cu', '/USB_D-', 0.2, in2N),
    seg('F.Cu', '/PCIE_TX0_P', 0.133, [130, 118], [175, 118]),
    seg('F.Cu', '/PCIE_TX0_N', 0.133, [130, 118.283], [175, 118.283]),
    ...hdmi('/HDMI_D0+', 3, 124),
    ...hdmi('/HDMI_D0-', 3 + c, 124 - c),
    seg('F.Cu', '/CLK', 0.12, [130, 150], [170, 150]),
    seg('In2.Cu', '/SDA', 0.2, [110, 140], [170, 140]),
    seg('In2.Cu', '/CLK', 0.121, [110, 145], [170, 145]),
    seg('B.Cu', '/SDA', 0.2, [110, 150], [160, 150]),
    ...power,
  ];
  return pcb
    .replace('(title "PCBPlanner example 6-layer stackup")', '(title "PCBPlanner example 6-layer board")')
    .replace('(comment 1 "Exported from pcbplanner.com")', '(comment 1 "Example for the KiCad stackup impedance calculator on pcbplanner.com")')
    .replace('\t(net 0 "")\n', `\t(net 0 "")\n${nets.map((name, i) => `\t(net ${i + 1} "${name}")\n`).join('')}${items.join('\n')}\n`);
}

/** The KiCad 8 project file next to the example board: net classes and their assignment. */
export function exampleProject(): string {
  const cls = (name: string, track: number, dpw: number, dpg: number) => ({
    bus_width: 12,
    clearance: 0.15,
    diff_pair_gap: dpg,
    diff_pair_via_gap: 0.25,
    diff_pair_width: dpw,
    line_style: 0,
    microvia_diameter: 0.3,
    microvia_drill: 0.1,
    name,
    pcb_color: 'rgba(0, 0, 0, 0.000)',
    schematic_color: 'rgba(0, 0, 0, 0.000)',
    track_width: track,
    via_diameter: 0.6,
    via_drill: 0.3,
    wire_width: 6,
  });
  const pro = {
    board: { design_settings: { defaults: {}, diff_pair_dimensions: [], drc_exclusions: [], rules: { min_clearance: 0.1, min_track_width: 0.08, min_via_annular_width: 0.1, min_via_diameter: 0.5, min_through_hole_diameter: 0.3 }, track_widths: [], via_dimensions: [] }, layer_presets: [], viewports: [] },
    boards: [],
    libraries: { pinned_footprint_libs: [], pinned_symbol_libs: [] },
    meta: { filename: EXAMPLE_PROJECT_FILE, version: 1 },
    net_settings: {
      classes: [cls('Default', 0.2, 0.2, 0.25), cls('USB', 0.117, 0.117, 0.15), cls('HDMI', 0.09, 0.09, 0.15), cls('PCIe', 0.133, 0.133, 0.15), cls('50R', 0.12, 0.12, 0.25)],
      meta: { version: 3 },
      net_colors: null,
      netclass_assignments: { '/CLK': '50R' },
      netclass_patterns: [
        { netclass: 'USB', pattern: '/USB_D*' },
        { netclass: 'HDMI', pattern: '/HDMI_*' },
        { netclass: 'PCIe', pattern: '/PCIE_*' },
      ],
    },
    pcbnew: { last_paths: { gencad: '', idf: '', netlist: '', plot: '', pos_files: '', specctra_dsn: '', step: '', svg: '', vrml: '' }, page_layout_descr_file: '' },
    sheets: [],
    text_variables: {},
  };
  return JSON.stringify(pro, null, 2) + '\n';
}
