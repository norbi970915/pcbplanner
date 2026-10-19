// The example board behind “Try an example” on the KiCad impedance page
// (public/examples/pcbplanner-example-6layer.kicad_pcb). It is the site's own KiCad export of a
// 6-layer library stackup, with every copper layer left as a signal layer in the layer setup, plus an
// 80 × 60 mm outline, GND and +3V3 plane zones on In1, In3 and In4, a small GND pour on F.Cu and a few
// tracks, so the page has to find the planes from the zones as it would on a real board.
// kicadImport.test.ts checks that the file in public/ matches this generator.
import { toKicad } from './stackupExport';
import { PRESETS } from './stackups';

export const EXAMPLE_PRESET_ID = 'std-6l-16-1080-2';
export const EXAMPLE_FILE = 'pcbplanner-example-6layer.kicad_pcb';

export function exampleBoard(): string {
  const preset = PRESETS.find((s) => s.id === EXAMPLE_PRESET_ID)!;
  const signalOnly = { ...preset, name: 'PCBPlanner example 6-layer', layers: preset.layers.map((l) => (l.kind === 'copper' ? { ...l, role: 'signal' as const } : l)) };
  const pcb = toKicad(signalOnly)[0].content;
  let n = 0;
  const uuid = () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, '0')}`;
  const nets = ['GND', '+3V3', '/PCIE_TX0_P', '/PCIE_TX0_N', '/CLK', '/SDA'];
  const netNo = (name: string) => nets.indexOf(name) + 1;
  const zone = (net: string, layer: string, pts: [number, number][]) => `\t(zone
\t\t(net ${netNo(net)})
\t\t(net_name "${net}")
\t\t(layer "${layer}")
\t\t(uuid "${uuid()}")
\t\t(hatch edge 0.5)
\t\t(connect_pads
\t\t\t(clearance 0.3)
\t\t)
\t\t(min_thickness 0.25)
\t\t(filled_areas_thickness no)
\t\t(fill
\t\t\t(thermal_gap 0.5)
\t\t\t(thermal_bridge_width 0.5)
\t\t)
\t\t(polygon
\t\t\t(pts
\t\t\t\t${pts.map(([x, y]) => `(xy ${x} ${y})`).join(' ')}
\t\t\t)
\t\t)
\t)`;
  const seg = (layer: string, net: string, w: number, a: [number, number], b: [number, number]) => `\t(segment
\t\t(start ${a[0]} ${a[1]})
\t\t(end ${b[0]} ${b[1]})
\t\t(width ${w})
\t\t(layer "${layer}")
\t\t(net ${netNo(net)})
\t\t(uuid "${uuid()}")
\t)`;
  // zones are drawn a little larger than the board, as is common; KiCad clips the fill to Edge.Cuts
  const full: [number, number][] = [[99, 99], [181, 99], [181, 161], [99, 161]];
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
    seg('F.Cu', '/PCIE_TX0_P', 0.2, [130, 120], [175, 120]),
    seg('F.Cu', '/PCIE_TX0_N', 0.2, [130, 120.4], [175, 120.4]),
    seg('F.Cu', '/CLK', 0.2, [130, 130], [170, 130]),
    seg('In2.Cu', '/SDA', 0.2, [110, 140], [170, 140]),
    seg('In2.Cu', '/CLK', 0.2, [110, 145], [170, 145]),
    seg('B.Cu', '/SDA', 0.2, [110, 150], [160, 150]),
  ];
  return pcb
    .replace('(title "PCBPlanner example 6-layer stackup")', '(title "PCBPlanner example 6-layer board")')
    .replace('(comment 1 "Exported from pcbplanner.com")', '(comment 1 "Example for the KiCad stackup impedance calculator on pcbplanner.com")')
    .replace('\t(net 0 "")\n', `\t(net 0 "")\n${nets.map((name, i) => `\t(net ${i + 1} "${name}")\n`).join('')}${items.join('\n')}\n`);
}
