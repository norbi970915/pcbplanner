/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { timeLimit } from './testTime';
import { INTERFACES } from '../data/interfaces';
import { designLine } from './design';
import { solve } from './fieldsolver';
import { exampleBoard, exampleProject, offsetPath } from './kicadExample';
import { kicadStackup, parseKicadBoard } from './kicadImport';
import { analyseRequest, designRequest, planLayers, TARGETS, type ImpedanceSettings } from './kicadImpedance';
import {
  analyseRouting,
  arcOf,
  buildGroups,
  busMembers,
  checkItem,
  COUPLING,
  decodeTargets,
  encodeTargets,
  familyOf,
  impedanceInName,
  itemLayers,
  matchDpSuffix,
  netClassResolver,
  netclassMatcher,
  pairCoupled,
  parseKicadProject,
  pickProjectFiles,
  solveWidth,
  suggestTarget,
  targetById,
  trackLength,
  type LayerSolve,
  type RouteItem,
} from './kicadRouting';

/** A KiCad board with a 4-layer stackup and the given top-level items. */
function board(items: string, version = 20240108) {
  return `(kicad_pcb (version ${version}) (generator "pcbnew") (generator_version "8.0")
  (general (thickness 1.6))
  (layers (0 "F.Cu" signal) (1 "In1.Cu" signal) (2 "In2.Cu" signal) (31 "B.Cu" signal) (44 "Edge.Cuts" user))
  (setup (stackup
    (layer "F.Cu" (type "copper") (thickness 0.035))
    (layer "dielectric 1" (type "prepreg") (thickness 0.2) (material "FR4") (epsilon_r 4.2) (loss_tangent 0.015))
    (layer "In1.Cu" (type "copper") (thickness 0.035))
    (layer "dielectric 2" (type "core") (thickness 1.0) (material "FR4") (epsilon_r 4.4) (loss_tangent 0.015))
    (layer "In2.Cu" (type "copper") (thickness 0.035))
    (layer "dielectric 3" (type "prepreg") (thickness 0.2) (material "FR4") (epsilon_r 4.2) (loss_tangent 0.015))
    (layer "B.Cu" (type "copper") (thickness 0.035))))
  (net 0 "")
  ${items}
)`;
}
const decl = (names: string[]) => names.map((n, i) => `(net ${i + 1} "${n}")`).join(' ');
const NETS = ['/D+', '/D-'];
const code = (n: string) => NETS.indexOf(n) + 1;
const seg = (net: string, a: [number, number], b: [number, number], w = 0.1, layer = 'F.Cu') => `(segment (start ${a[0]} ${a[1]}) (end ${b[0]} ${b[1]}) (width ${w}) (layer "${layer}") (net ${code(net)}) (uuid "u"))`;
const arc = (net: string, a: [number, number], m: [number, number], b: [number, number], w = 0.1, layer = 'F.Cu') =>
  `(arc (start ${a[0]} ${a[1]}) (mid ${m[0]} ${m[1]}) (end ${b[0]} ${b[1]}) (width ${w}) (layer "${layer}") (net ${code(net)}) (uuid "a"))`;
const poly = (net: string, pts: [number, number][], w = 0.1, layer = 'F.Cu') => pts.slice(1).map((p, i) => seg(net, pts[i], p, w, layer)).join(' ');
const pairOf = (text: string) => parseKicadBoard(text).routing!.pairs[0];
const len = (pts: [number, number][]) => pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

describe('differential pairs: KiCad’s suffix rule (BOARD::MatchDpSuffix)', () => {
  const cases: [string, ReturnType<typeof matchDpSuffix>][] = [
    ['USB_D+', { polarity: 1, base: 'USB_D', complement: 'USB_D-' }],
    ['USB_D-', { polarity: -1, base: 'USB_D', complement: 'USB_D+' }],
    ['/PCIE_TX0_P', { polarity: 1, base: '/PCIE_TX0_', complement: '/PCIE_TX0_N' }],
    ['/PCIE_TX0_N', { polarity: -1, base: '/PCIE_TX0_', complement: '/PCIE_TX0_P' }],
    ['LVDS_P1', { polarity: 1, base: 'LVDS_', complement: 'LVDS_N1' }],
    ['TX_P_1_', { polarity: 1, base: 'TX_', complement: 'TX_N_1_' }],
    ['USB1_DP', { polarity: 1, base: 'USB1_D', complement: 'USB1_DN' }],
    ['VIN', { polarity: -1, base: 'VI', complement: 'VIP' }],
    ['P', { polarity: 1, base: '', complement: 'N' }],
    ['GND', null],
    ['clk_p', null], // lower case does not count
    ['Net-(R1-Pad2)', null],
    ['+5V', null],
    ['123_4', null],
    ['', null],
  ];
  for (const [name, want] of cases) it(`${name || '(empty)'}`, () => expect(matchDpSuffix(name)).toEqual(want));
  it('a pair needs both nets; only one net of a pair being routed still makes a pair', () => {
    const r = analyseRouting([{ net: 'A_P', layer: 'F.Cu', w: 0.1, x1: 0, y1: 0, x2: 1, y2: 0 }], [], ['A_P', 'A_N', 'B_P']);
    expect(r.pairs.map((p) => [p.p, p.n])).toEqual([['A_P', 'A_N']]);
  });
});

describe('arcs', () => {
  it('circle through three points and the true arc length, either direction', () => {
    const a = arcOf(3, 0, 0, 3, -3, 0)!;
    expect(a.r).toBeCloseTo(3, 12);
    expect(Math.abs(a.da)).toBeCloseTo(Math.PI, 12);
    expect(trackLength({ x1: 3, y1: 0, mx: 0, my: -3, x2: -3, y2: 0 })).toBeCloseTo(3 * Math.PI, 12);
    const s = Math.SQRT1_2 * 2;
    expect(trackLength({ x1: 2, y1: 0, mx: s, my: s, x2: 0, y2: 2 })).toBeCloseTo(Math.PI, 12);
    expect(trackLength({ x1: 0, y1: 0, mx: 1, my: 0, x2: 2, y2: 0 })).toBeCloseTo(2, 12); // degenerate: a line
  });
});

describe('pair geometry: width, gap, coupled length, lengths and skew', () => {
  it('parallel segments: gap = centre distance − (wP + wN)/2', () => {
    const p = pairOf(board(decl(NETS) + seg('/D+', [0, 0], [20, 0]) + seg('/D-', [0, 0.25], [20, 0.25])));
    expect(p).toMatchObject({ p: '/D+', n: '/D-', base: '/D' });
    expect(p.layers).toHaveLength(1);
    expect(p.layers[0]).toMatchObject({ layer: 'F.Cu', lenP: 20, lenN: 20, coupled: 20 });
    expect(p.layers[0].gap).toBeCloseTo(0.15, 9);
    expect(p.layers[0].gapMin).toBeCloseTo(0.15, 9);
    expect(p.layers[0].gapMax).toBeCloseTo(0.15, 9);
  });
  it('different widths: gap from both half-widths; the dominant width per layer is length-weighted', () => {
    const r = parseKicadBoard(board(decl(NETS) + seg('/D+', [0, 0], [15, 0], 0.1) + seg('/D+', [15, 0], [20, 0], 0.12) + seg('/D-', [0, 0.3], [20, 0.3], 0.14))).routing!;
    const dp = r.nets.find((n) => n.name === '/D+')!;
    expect(dp.layers[0]).toMatchObject({ layer: 'F.Cu', len: 20, w: 0.1, wMin: 0.1, wMax: 0.12 });
    expect(r.pairs[0].layers[0].gap).toBeCloseTo(0.3 - (0.1 + 0.14) / 2, 9); // the 15 mm at 0.1 mm dominate
  });
  it('a 45° jog: gap exact on every leg, coupled length = overlap of the parallel legs, no skew for opposite bends', () => {
    const P: [number, number][] = [[0, 0], [10, 0], [12, 2], [22, 2]];
    const N = offsetPath(P, -0.25);
    const p = pairOf(board(decl(NETS) + poly('/D+', P) + poly('/D-', N))).layers[0];
    // a mitred corner moves the offset trace's corner by c·tan(22.5°) along each leg: the inner leg
    // ends that much early (leg 1), the outer leg starts that much early (leg 3), leg 2 has both
    const s = 0.25 * Math.tan(Math.PI / 8);
    expect(p.gap).toBeCloseTo(0.15, 4);
    expect(p.coupled).toBeCloseTo(10 - s + (2 * Math.SQRT2 - s) + 10, 3);
    expect(p.lenP).toBeCloseTo(len(P), 9);
    expect(p.lenN).toBeCloseTo(len(N), 3);
    expect(Math.abs(p.lenP - p.lenN)).toBeLessThan(1e-3);
  });
  it('a 90° arc bend: gap from the radii, both arcs fully coupled, skew = Δr·π/2', () => {
    const s = Math.SQRT1_2;
    const inner = seg('/D+', [0, 0], [10, 0]) + arc('/D+', [10, 0], [10 + 3 * s, 3 - 3 * s], [13, 3]) + seg('/D+', [13, 3], [13, 13]);
    const outer = seg('/D-', [0, -0.25], [10, -0.25]) + arc('/D-', [10, -0.25], [10 + 3.25 * s, 3 - 3.25 * s], [13.25, 3]) + seg('/D-', [13.25, 3], [13.25, 13]);
    const r = parseKicadBoard(board(decl(NETS) + inner + outer)).routing!;
    const l = r.pairs[0].layers[0];
    expect(r.arcs).toBe(2);
    expect(l.lenP).toBeCloseTo(20 + 1.5 * Math.PI, 9);
    expect(l.lenN).toBeCloseTo(20 + 1.625 * Math.PI, 9);
    expect(l.gap).toBeCloseTo(0.15, 4);
    expect(l.coupled).toBeCloseTo(20 + ((1.5 + 1.625) * Math.PI) / 2, 3); // mean of the two traces' coupled lengths
    expect(l.lenN - l.lenP).toBeCloseTo((0.25 * Math.PI) / 2, 9);
  });
  it('a layer change through vias: per-layer lengths, via count per net', () => {
    const items =
      decl(NETS) +
      seg('/D+', [0, 0], [10, 0]) +
      seg('/D-', [0, 0.25], [10, 0.25]) +
      seg('/D+', [11, 0], [31, 0], 0.2, 'In2.Cu') +
      seg('/D-', [11, 0.35], [31, 0.35], 0.2, 'In2.Cu') +
      `(via (at 10 0) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 1) (uuid "v1")) (via (at 10 0.25) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 2) (uuid "v2"))`;
    const r = parseKicadBoard(board(items)).routing!;
    expect(r.vias).toBe(2);
    expect(r.nets.map((n) => [n.name, n.len, n.vias, n.layers.map((l) => l.layer)])).toEqual([
      ['/D-', 30, 1, ['In2.Cu', 'F.Cu']],
      ['/D+', 30, 1, ['In2.Cu', 'F.Cu']],
    ]);
    const layers = Object.fromEntries(r.pairs[0].layers.map((l) => [l.layer, l]));
    expect(layers['F.Cu'].gap).toBeCloseTo(0.15, 9);
    expect(layers['In2.Cu'].gap).toBeCloseTo(0.15, 9);
    expect(layers['In2.Cu'].coupled).toBeCloseTo(20, 9);
  });
  it('breakout to the pads is uncoupled; a section more than 3× the dominant gap apart is uncoupled too', () => {
    const P: [number, number][] = [[-1, -1], [0, 0], [20, 0], [30, 0]];
    const N: [number, number][] = [[-1, 1.25], [0, 0.25], [20, 0.25], [20.5, 0.75], [29.5, 0.75], [30, 0.25]];
    const l = pairOf(board(decl(NETS) + poly('/D+', P) + poly('/D-', N))).layers[0];
    expect(l.gap).toBeCloseTo(0.15, 9);
    expect(l.gapMax).toBeCloseTo(0.15, 9);
    // the 45° breakout legs are not parallel; the 9 mm at 0.65 mm gap is over 3 × 0.15 mm
    expect(l.coupled).toBeCloseTo(20, 9);
    expect((l.lenP + l.lenN) / 2 - l.coupled).toBeCloseTo((len(P) + len(N)) / 2 - 20, 9);
  });
  it('net formats: (net N) with declarations, (net "name") of KiCad 10, (layers …) instead of (layer …)', () => {
    const k10 = board(`(segment (start 0 0) (end 5 0) (width 0.1) (layers "F.Cu" "F.Mask") (net "/A_P") (uuid "a")) (segment (start 0 0.3) (end 5 0.3) (width 0.1) (layer "F.Cu") (net "/A_N") (uuid "b"))`, 20251101);
    const r = parseKicadBoard(k10).routing!;
    expect(r.nets.map((n) => n.name)).toEqual(['/A_N', '/A_P']);
    expect(r.pairs[0].layers[0].gap).toBeCloseTo(0.2, 9);
    const esc = board(`(net 1 "a \\"q\\" P") (net 2 "a \\"q\\" N") (segment (start 0 0) (end 5 0) (width 0.1) (layer "F.Cu") (net 1) (uuid "a")) (segment (start 0 0.3) (end 5 0.3) (width 0.1) (layer "F.Cu") (net 2) (uuid "b"))`);
    expect(parseKicadBoard(esc).routing!.pairs[0].p).toBe('a "q" P');
  });
  it('a board with 100 000 segments and 200 routed pairs is analysed within the time limit', () => {
    const parts: string[] = [];
    const names: string[] = [];
    for (let k = 0; k < 200; k++) names.push(`/L${k}_P`, `/L${k}_N`);
    for (let k = 0; k < 200; k++) {
      const y = (k % 100) * 2;
      const layer = k < 100 ? 'F.Cu' : 'In2.Cu';
      for (let i = 0; i < 250; i++) {
        parts.push(`(segment (start ${i * 0.4} ${y}) (end ${(i + 1) * 0.4} ${y}) (width 0.1) (layer "${layer}") (net ${2 * k + 1}) (uuid "p"))`);
        parts.push(`(segment (start ${i * 0.4} ${y + 0.25}) (end ${(i + 1) * 0.4} ${y + 0.25}) (width 0.1) (layer "${layer}") (net ${2 * k + 2}) (uuid "n"))`);
      }
    }
    // single-ended tracks on 1000 more nets, to 100 000 segments in all
    const others = Array.from({ length: 1000 }, (_, i) => `(net ${401 + i} "/S${i}")`).join(' ');
    const se: string[] = [];
    for (let i = 0; parts.length + se.length < 100000; i++) se.push(`(segment (start ${i % 300} ${300 + (i % 97)}) (end ${(i % 300) + 0.7} ${300 + (i % 97)}) (width 0.15) (layer "B.Cu") (net ${401 + (i % 1000)}) (uuid "s"))`);
    const text = board(`${decl(names)} ${others} ${parts.join(' ')} ${se.join(' ')}`);
    const t0 = performance.now();
    const r = parseKicadBoard(text).routing!;
    const ms = performance.now() - t0;
    expect(r.tracks).toBe(100000);
    expect(r.pairs).toHaveLength(200);
    expect(r.pairs.every((p) => Math.abs(p.layers[0].coupled - 100) < 1e-6 && Math.abs((p.layers[0].gap ?? 0) - 0.15) < 1e-9)).toBe(true);
    expect(ms).toBeLessThan(timeLimit(4000));
  });
});

/* ------------------------------------------------------------------ net classes */

const pro = (netSettings: object) => JSON.stringify({ meta: { version: 1 }, net_settings: netSettings });
const cls = (name: string, extra: object = {}) => ({ name, track_width: 0.2, diff_pair_width: 0.2, diff_pair_gap: 0.25, clearance: 0.2, ...extra });

describe('net classes from .kicad_pro (NET_SETTINGS, schema 0 to 5)', () => {
  it('KiCad 6 (schema 2): classes[].nets list exact net names', () => {
    const p = parseKicadProject(pro({ meta: { version: 2 }, classes: [cls('Default', { nets: [] }), cls('USB', { nets: ['/USB_D+', '/USB_D-'], diff_pair_width: 0.12 })] }), 'k6.kicad_pro');
    expect(p.kicad).toBe('6');
    const r = netClassResolver(p);
    expect(r('/USB_D+')).toMatchObject({ name: 'USB', dpWidth: 0.12 });
    expect(r('/USB_D')).toMatchObject({ name: 'Default' }); // exact, not a regular expression
    expect(r('')).toMatchObject({ name: 'Default' });
  });
  it('KiCad 7 and 8 (schema 3): explicit assignment first, then the first matching pattern; unknown class → Default', () => {
    const p = parseKicadProject(
      pro({
        meta: { version: 3 },
        classes: [cls('Default'), cls('USB', { diff_pair_gap: 0.15 }), cls('Fast')],
        netclass_patterns: [
          { netclass: 'USB', pattern: '/USB*' },
          { netclass: 'Fast', pattern: '/USB_D?' },
          { netclass: 'Fast', pattern: '^/PCIE_[RT]X\\d_[PN]$' },
          { netclass: 'Gone', pattern: '/OLD*' },
        ],
        netclass_assignments: { '/USB_ID': 'Fast', '/X': '' },
      }),
      'k8.kicad_pro',
    );
    expect(p.kicad).toBe('7 or 8');
    const r = netClassResolver(p);
    expect(r('/USB_D+').name).toBe('USB'); // first matching pattern wins
    expect(r('/USB_D+').dpGap).toBe(0.15);
    expect(r('/USB_ID').name).toBe('Fast');
    expect(r('/PCIE_TX0_P').name).toBe('Fast');
    expect(r('/PCIE_TX10_P').name).toBe('Default');
    expect(r('/OLD1').name).toBe('Default');
    expect(r('/X').name).toBe('Default');
    expect(parseKicadProject(pro({ meta: { version: 3 }, classes: [cls('Default')], netclass_assignments: null, netclass_patterns: [] }), 'n').assignments).toEqual({});
  });
  it('KiCad 9 (schema 4) and 10 (schema 5): every match applies; the lowest priority number decides, missing values fall through', () => {
    for (const version of [4, 5]) {
      const p = parseKicadProject(
        pro({
          meta: { version },
          classes: [cls('Default', { priority: 2147483647 }), { name: 'HS', priority: 1, diff_pair_gap: 0.1, tuning_profile: '' }, cls('USB', { priority: 0, diff_pair_width: 0.11, diff_pair_gap: undefined }), cls('Wide', { priority: 5, track_width: 0.5 })],
          netclass_patterns: [
            { netclass: 'HS', pattern: '/*_D?' },
            { netclass: 'USB', pattern: '/USB*' },
          ],
          netclass_assignments: { '/USB_D+': ['Wide'], '/LBL': ['Label only'] },
        }),
        'k9.kicad_pro',
      );
      expect(p.kicad).toBe(version === 4 ? '9' : '10');
      const r = netClassResolver(p);
      const u = r('/USB_D+');
      expect(u.all).toEqual(['USB', 'HS', 'Wide']);
      expect(u).toMatchObject({ name: 'USB', dpWidth: 0.11, dpGap: 0.1, trackWidth: 0.2 });
      expect(r('/ETH_D+')).toMatchObject({ name: 'HS', trackWidth: 0.2, dpGap: 0.1 }); // track width from Default
      expect(r('/LBL').name).toBe('Label only'); // an implicit class from a label
      expect(r('/Z').name).toBe('Default');
    }
  });
  it('pattern matcher: anchored regular expression or anchored wildcard, case-sensitive', () => {
    const lit = netclassMatcher('/HDMI/DP_MUX_AUX_A+');
    expect(lit('/HDMI/DP_MUX_AUX_A+')).toBe(true); // wildcard reading: + is literal
    expect(lit('/HDMI/DP_MUX_AUX_AA')).toBe(true); // regular-expression reading: A+
    expect(lit('/HDMI/DP_MUX_AUX_A-')).toBe(false);
    expect(netclassMatcher('/*USB_*')('/CM5/USB_C.D_P')).toBe(true);
    expect(netclassMatcher('/usb*')('/USB_D+')).toBe(false);
    expect(netclassMatcher('DDR_DQ?')('DDR_DQ7')).toBe(true);
    expect(netclassMatcher('DDR_DQ?')('DDR_DQ17')).toBe(false);
    expect(netclassMatcher('[bad')('[bad')).toBe(true); // invalid regex: wildcard only
    expect(busMembers('/D[0..2]')).toEqual(['/D0', '/D1', '/D2']);
    expect(netClassResolver(parseKicadProject(pro({ meta: { version: 3 }, classes: [cls('Default'), cls('Bus')], netclass_patterns: [{ netclass: 'Bus', pattern: '/D[0..3]' }] }), 'b'))('/D2').name).toBe('Bus');
  });
  it('no project: everything is Default; a damaged file is a plain error', () => {
    expect(netClassResolver(null)('/USB_D+').name).toBe('Default');
    expect(() => parseKicadProject('{', 'x.kicad_pro')).toThrow(/not valid JSON/);
    expect(parseKicadProject('{}', 'x.kicad_pro').classes).toEqual([]);
  });
});

describe('project files from a folder or a multi-file pick', () => {
  const f = (path: string, size = 10) => ({ name: path.split('/').pop()!, path, size });
  it('board and project of the same name; backups and other files ignored', () => {
    const r = pickProjectFiles([f('proj/a.kicad_sch'), f('proj/a.kicad_pcb', 500), f('proj/a.kicad_pro'), f('proj/a-backups/a.kicad_pcb', 900), f('proj/lib/x.kicad_pcb', 1000), f('proj/fp-lib-table')]);
    expect(r.board?.path).toBe('proj/a.kicad_pcb');
    expect(r.project?.path).toBe('proj/a.kicad_pro');
    expect(r.otherBoards).toEqual(['proj/lib/x.kicad_pcb']);
    expect(r.ignored).toBe(3);
  });
  it('a single file still works; two boards side by side: the one with a project, else the largest', () => {
    expect(pickProjectFiles([f('b.kicad_pcb')])).toMatchObject({ board: { name: 'b.kicad_pcb' }, project: null });
    expect(pickProjectFiles([f('d/x.kicad_pcb', 900), f('d/y.kicad_pcb', 100), f('d/y.kicad_pro')]).board?.name).toBe('y.kicad_pcb');
    expect(pickProjectFiles([f('d/x.kicad_pcb', 900), f('d/y.kicad_pcb', 100)]).board?.name).toBe('x.kicad_pcb');
    expect(pickProjectFiles([f('d/x.kicad_pcb'), f('d/other.kicad_pro')]).project?.name).toBe('other.kicad_pro');
    expect(pickProjectFiles([f('d/x.kicad_pro')]).board).toBeNull();
  });
});

describe('targets and suggestions', () => {
  it('interface targets carry the specification range; plain targets ±10 %; custom targets', () => {
    expect(targetById('usb2-hs')).toMatchObject({ kind: 'diff', z: 90, min: 76.5, max: 103.5 });
    expect(targetById('d100')).toMatchObject({ kind: 'diff', min: 90, max: 110, tol: '±10 %' });
    expect(targetById('se50')).toMatchObject({ kind: 'se', min: 45, max: 55 });
    expect(targetById('cd95')).toMatchObject({ kind: 'diff', z: 95 });
    expect(targetById('cs42.5')).toMatchObject({ kind: 'se', z: 42.5 });
    expect(targetById('none')).toBeNull();
    expect(targetById('cd5')).toBeNull();
  });
  it('family from the class name first, then from the net names', () => {
    expect(familyOf('', '/USB_D+', '/USB_D-')).toBe('usb2');
    expect(familyOf('', 'USBSS0_TX_P')).toBe('usb3');
    expect(familyOf('85Ohm-diff_USB_SS', '/USB Debug, DP/USBC0_D_P')).toBe('usb3');
    expect(familyOf('', '/HDMI/DP_MUX_D0+')).toBe('hdmi');
    expect(familyOf('', 'EDP_TX0_DP')).toBe('dp');
    expect(familyOf('', '/CM5/PCIE_PI.TX_P')).toBe('pcie');
    expect(familyOf('', 'GBE_MDI0_P')).toBe('eth');
    expect(familyOf('', 'CSI0_D0_P')).toBe('mipi');
    expect(familyOf('', 'XU+')).toBeUndefined();
    expect(impedanceInName('85Ohm-diff_PCIE')).toBe(85);
    expect(impedanceInName('90R')).toBe(90);
    expect(impedanceInName('Default')).toBeUndefined();
  });
  it('suggestions: interface when the class impedance is inside its range, else the class impedance', () => {
    expect(suggestTarget('pair', '85Ohm-diff_PCIE', 'pcie').id).toBe('pcie-gen3');
    expect(suggestTarget('pair', '85Ohm-diff_USB_SS', 'usb3').id).toBe('usb3-gen1');
    expect(suggestTarget('pair', '85Ohm-diff_CSI', 'mipi').id).toBe('d85'); // 15 % off the D-PHY nominal: the class's own 85 Ω
    expect(suggestTarget('pair', '120R_LVDS', 'hdmi').id).toBe('cd120');
    expect(suggestTarget('pair', '100ohm', undefined).id).toBe('d100');
    expect(suggestTarget('pair', 'Default', undefined).id).toBe('none');
    expect(suggestTarget('se', '50R', undefined).id).toBe('se50');
    expect(suggestTarget('se', 'DDR_ADDR', undefined).id).toBe('ddr4');
    expect(suggestTarget('se', '90ohm', undefined).id).toBe('none');
  });
  it('target overrides survive the URL round trip, keys with commas and equals signs included', () => {
    const m = { 'p:USB|usb2': 'd85', 's:a,b=c': 'cs45' };
    expect(decodeTargets(encodeTargets(m))).toEqual(m);
    expect(decodeTargets('')).toEqual({});
  });
});

/* ------------------------------------------------------------------ checks */

const L = (mm: number) => String(Number(mm.toFixed(3)));
const pairItem = (layers: { layer: string; w: number; gap: number; len: number; coupled?: number }[], lenN?: number): RouteItem => {
  const lenP = layers.reduce((a, l) => a + l.len, 0);
  const net = (name: string, total: number) => ({ name, len: total, vias: 1, layers: layers.map((l) => ({ layer: l.layer, len: l.len, w: l.w, wMin: l.w, wMax: l.w })) });
  return {
    kind: 'pair',
    name: '/X_',
    cls: { name: 'Default', all: ['Default'] },
    pair: { base: '/X_', p: '/X_P', n: '/X_N', layers: layers.map((l) => ({ layer: l.layer, lenP: l.len, lenN: l.len, coupled: l.coupled ?? l.len, gap: l.gap, gapMin: l.gap, gapMax: l.gap })) },
    p: net('/X_P', lenP),
    n: net('/X_N', lenN ?? lenP),
  };
};

describe('checks against interfaces.ts limits', () => {
  const usb = targetById('usb2-hs');
  it('impedance per layer with a reason; the layer change is flagged', () => {
    const item = pairItem([
      { layer: 'F.Cu', w: 0.117, gap: 0.15, len: 20 },
      { layer: 'In2.Cu', w: 0.2, gap: 0.15, len: 23 },
    ]);
    const solves: Record<string, LayerSolve> = { 'F.Cu': { z: 89.6, eeff: 3.2, dbPerIn: 0.2 }, 'In2.Cu': { z: 71, eeff: 4.0, dbPerIn: 0.25 } };
    const r = checkItem(item, usb, solves, L);
    expect(r.layers.map((l) => l.status)).toEqual(['ok', 'fail']);
    expect(r.layers[1].reason).toBe('In2.Cu 0.2/0.15 mm → 71.0 Ω, target 76.5–103.5 Ω (USB 2.0 High Speed)');
    expect(r.layers.every((l) => l.change)).toBe(true);
    expect(r.notes[0]).toMatch(/Impedance changes with the layer: F\.Cu 89\.6 Ω, In2\.Cu 71\.0 Ω/);
    expect(r.overall).toBe('fail');
    expect(r.skew).toMatchObject({ mm: 0, status: 'ok' });
    expect(r.length?.status).toBe('ok'); // 43 mm against 4 in
    expect(r.loss?.db).toBeCloseTo((0.2 * 20 + 0.25 * 23) / 25.4, 9);
  });
  it('plain targets are ±10 %; no skew limit without an interface', () => {
    const r = checkItem(pairItem([{ layer: 'F.Cu', w: 0.1, gap: 0.15, len: 30 }]), targetById('d100'), { 'F.Cu': { z: 109, eeff: 3 } }, L);
    expect(r.layers[0].status).toBe('ok');
    expect(r.layers[0].reason).toMatch(/target 100 Ω ±10 %/);
    expect(r.skew?.status).toBe('info');
    expect(checkItem(pairItem([{ layer: 'F.Cu', w: 0.1, gap: 0.15, len: 30 }]), targetById('d100'), { 'F.Cu': { z: 111, eeff: 3 } }, L).overall).toBe('fail');
  });
  it('intra-pair skew: a length limit as it is, a ps limit through the layer delay', () => {
    const pcie = INTERFACES.find((s) => s.id === 'pcie-gen3')!;
    const specFail = checkItem(pairItem([{ layer: 'F.Cu', w: 0.09, gap: 0.15, len: 43.7 }], 44.08), targetById('pcie-gen3'), { 'F.Cu': { z: 85, eeff: 3.3 } }, L);
    expect(specFail.skew).toMatchObject({ status: 'fail', limitMm: pcie.intraPairMm });
    const hdmi = targetById('hdmi-20');
    const spec = INTERFACES.find((s) => s.id === 'hdmi-20')!;
    const long = checkItem(pairItem([{ layer: 'F.Cu', w: 0.09, gap: 0.15, len: 43.7 }], 44.08), hdmi, { 'F.Cu': { z: 100, eeff: 3.3 } }, L);
    // HDMI's 5 mil is TI's layout guideline: over it is a warning while the 25 ps of the specification holds
    expect(long.skew).toMatchObject({ status: 'warn', limitMm: spec.intraPairMm });
    expect(long.skew!.reason).toContain('layout guideline 0.127 mm; HDMI 2.0 (TMDS, 6 Gb/s) allows 25 ps');
    const far = checkItem(pairItem([{ layer: 'F.Cu', w: 0.09, gap: 0.15, len: 40 }], 45), hdmi, { 'F.Cu': { z: 100, eeff: 3.3 } }, L);
    expect(far.skew!.ps).toBeGreaterThan(25);
    expect(far.skew!.status).toBe('fail');
    const usb = checkItem(pairItem([{ layer: 'F.Cu', w: 0.14, gap: 0.15, len: 40 }], 50), targetById('usb2-hs'), { 'F.Cu': { z: 90, eeff: 3.3 } }, L);
    expect(usb.skew).toMatchObject({ status: 'warn' });
    expect(usb.skew!.reason).toMatch(/sets no board limit/);
    expect(long.skew!.mm).toBeCloseTo(0.38, 9);
    expect(long.skew!.ps).toBeCloseTo(0.38 * ((Math.sqrt(3.3) * 1e9) / 299792458), 6);
    const dp = INTERFACES.find((s) => s.id === 'dp-hbr2')!;
    const ok = checkItem(pairItem([{ layer: 'F.Cu', w: 0.09, gap: 0.15, len: 40 }], 41), targetById('dp-hbr2'), { 'F.Cu': { z: 100, eeff: 4 } }, L);
    const pm = (Math.sqrt(4) * 1e9) / 299792458;
    expect(ok.skew!.limitMm).toBeCloseTo(dp.intraPairPs! / pm, 9);
    expect(ok.skew!.status).toBe(1 <= dp.intraPairPs! / pm ? 'ok' : 'fail');
  });
  it('loss against the budget and length against the guideline: both warn, never fail', () => {
    const t = targetById('usb3-gen2'); // 8.5 dB informative budget
    const at = (dbPerIn: number, len: number) => checkItem(pairItem([{ layer: 'F.Cu', w: 0.1, gap: 0.15, len }]), t, { 'F.Cu': { z: 90, eeff: 3, dbPerIn } }, L);
    expect(at(0.5, 100).loss?.status).toBe('ok');
    expect(at(1, 190).loss?.status).toBe('warn');
    expect(at(1, 228).loss?.status).toBe('warn');
    const usb2 = targetById('usb2-hs'); // TI: 12 in maximum
    const len = (l: number) => checkItem(pairItem([{ layer: 'F.Cu', w: 0.1, gap: 0.15, len: l }]), usb2, { 'F.Cu': { z: 90, eeff: 3, dbPerIn: 0.01 } }, L);
    expect(len(300).length?.status).toBe('ok');
    expect(len(310).length).toMatchObject({ status: 'warn' });
    expect(len(310).length!.reason).toMatch(/guideline 304.8/);
    expect(len(310).overall).not.toBe('fail');
  });
  it('breakout layers are not checked; an uncoupled run is a warning; a coupled layer with long uncoupled parts warns', () => {
    const r = checkItem(
      pairItem([
        { layer: 'F.Cu', w: 0.1, gap: 0.15, len: 40 },
        { layer: 'B.Cu', w: 0.1, gap: 0.6, len: 2, coupled: 1.3 },
        { layer: 'In2.Cu', w: 0.1, gap: 0.6, len: 8, coupled: 0 },
      ]),
      targetById('d100'),
      { 'F.Cu': { z: 100, eeff: 3 } },
      L,
    );
    expect(r.layers.map((l) => l.status)).toEqual(['ok', 'info', 'warn']);
    expect(r.layers[1].reason).toMatch(/short section near the pads/);
    expect(r.layers[2].reason).toMatch(/run apart/);
    const loose = checkItem(pairItem([{ layer: 'F.Cu', w: 0.1, gap: 0.15, len: 40, coupled: 20 }]), targetById('d100'), { 'F.Cu': { z: 100, eeff: 3 } }, L);
    expect(loose.layers[0].status).toBe('warn');
    expect(pairCoupled({ coupled: 2.9, gap: 0.1 })).toBe(false);
    expect(pairCoupled({ coupled: 3, gap: 0.1 })).toBe(true);
  });
  it('no target: informational, never a failure; pending while solving; a layer without a reference plane warns', () => {
    const item = pairItem([{ layer: 'F.Cu', w: 0.1, gap: 0.15, len: 40 }]);
    expect(checkItem(item, null, { 'F.Cu': { z: 30, eeff: 3 } }, L).overall).toBe('info');
    expect(checkItem(item, targetById('d100'), {}, L).overall).toBe('pending');
    expect(checkItem(item, targetById('d100'), { 'F.Cu': { noRef: true } }, L).layers[0].status).toBe('warn');
  });
});

/* ------------------------------------------------------------------ the example project, end to end */

describe('example project: the routing check finds what it was built to show', () => {
  const b = parseKicadBoard(exampleBoard());
  const project = parseKicadProject(exampleProject(), 'pcbplanner-example-6layer.kicad_pro');
  const groups = buildGroups(b.routing!, netClassResolver(project));
  const st = kicadStackup(b, { name: 'example' })!.stackup;
  const plans = planLayers(st);
  const solves = (item: RouteItem) => {
    const out: Record<string, LayerSolve> = {};
    for (const l of itemLayers(item)) {
      const pl = plans.find((p) => p.layer.name === l.layer)!;
      const q = analyseRequest(pl.sg!, solveWidth(l), item.kind === 'pair' ? l.gap : undefined);
      const res = solve(q.geom, q.opts);
      out[l.layer] = item.kind === 'pair' ? { z: res.zdiff, eeff: res.odd!.eeff, dbPerIn: 0.3 } : { z: res.se!.z, eeff: res.se!.eeff, dbPerIn: 0.3 };
    }
    return out;
  };
  const result = (key: string) => {
    const g = groups.find((x) => x.key === key)!;
    return checkItem(g.items[0], targetById(g.suggest), solves(g.items[0]), L);
  };
  it('classes, pairs and suggested targets', () => {
    expect(groups.map((g) => [g.key, g.suggest, g.items.map((i) => i.name)])).toEqual([
      ['p:HDMI|hdmi', 'hdmi-20', ['/HDMI_D0']],
      ['p:PCIe|pcie', 'pcie-gen3', ['/PCIE_TX0_']],
      ['p:USB|usb2', 'usb2-hs', ['/USB_D']],
      ['s:50R', 'se50', ['/CLK']],
    ]);
  });
  it('USB: right on F.Cu, too low on In2.Cu after the vias', () => {
    const r = result('p:USB|usb2');
    expect(r.layers.map((l) => [l.layer, l.status])).toEqual([
      ['In2.Cu', 'fail'],
      ['F.Cu', 'ok'],
    ]);
    expect(r.layers.find((l) => l.layer === 'F.Cu')!.solve.z).toBeCloseTo(90, -0.5);
    expect(r.layers.find((l) => l.layer === 'In2.Cu')!.solve.z).toBeLessThan(76.5);
    expect(r.vias).toBe(2);
    expect(r.skew!.mm).toBeLessThan(0.01);
    expect(r.notes[0]).toMatch(/Impedance changes with the layer/);
  });
  it('HDMI: impedance right, 0.38 mm skew from the arc bend is over the 5 mil guideline', () => {
    const r = result('p:HDMI|hdmi');
    expect(r.layers[0].status).toBe('ok');
    expect(r.skew!.mm).toBeCloseTo(0.24 * (Math.PI / 2), 3);
    expect(r.skew!.status).toBe('warn');
    expect(r.overall).toBe('warn');
  });
  it('PCIe and the 50 Ω clock pass', () => {
    expect(result('p:PCIe|pcie').overall).toBe('ok');
    expect(result('s:50R').layers.map((l) => l.status)).toEqual(['ok', 'ok']);
  });
  it('cross-check: a width designed for 90 Ω on a layer analyses back to 90 Ω', () => {
    const settings: ImpedanceSettings = { gapRule: 'fixed', gap: 0.15, fGHz: 4, rqUm: 3.2 };
    for (const pl of plans) {
      for (const t of [TARGETS[1], TARGETS[0]]) {
        const d = designLine(designRequest(pl.sg!, t, settings));
        const q = analyseRequest(pl.sg!, d.w, t.kind === 'diff' ? d.s : undefined);
        const res = solve(q.geom, q.opts);
        expect(t.kind === 'diff' ? res.zdiff! : res.se!.z).toBeCloseTo(t.z, 1);
      }
    }
  });
  it('coupling thresholds are the ones the Method section states', () => {
    expect(COUPLING).toMatchObject({ parallelDeg: 10, gapFactor: 3, minCoupled: 3, apartCoupled: 1, apartLen: 5 });
  });
});

