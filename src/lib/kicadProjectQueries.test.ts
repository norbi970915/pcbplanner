/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { toSolverGeometry } from './design';
import { solve } from './fieldsolver';
import { buildImpedanceGeometry, IMPEDANCE_DEFAULTS } from './impedanceGeometry';
import { exampleBoard, exampleProject, EXAMPLE_FILE, EXAMPLE_PROJECT_FILE } from './kicadExample';
import { guessRoles, kicadStackup, parseKicadBoard } from './kicadImport';
import { ACCURACY, analyseRequest, calcStackup, ETCH, planLayers } from './kicadImpedance';
import {
  copperThickness,
  impedancePatch,
  layerGeometry,
  netClasses,
  nets,
  netSummary,
  pairs,
  pairSummary,
  resolvePick,
  signalLayers,
  type KicadProjectData,
} from './kicadProjectQueries';
import { buildGroups, checkItem, itemLayers, netClassResolver, parseKicadProject, solveWidth, targetById, type LayerSolve, type RouteItem } from './kicadRouting';

const board = parseKicadBoard(exampleBoard());
const project = parseKicadProject(exampleProject(), EXAMPLE_PROJECT_FILE);
const data: KicadProjectData = { boardName: EXAMPLE_FILE, board, project, projectName: EXAMPLE_PROJECT_FILE, otherBoards: [], roleOverrides: {} };
const L = (mm: number) => mm.toFixed(4);

/** What /kicad-impedance builds before it solves: detected roles, kicadStackup, calcStackup with the mask switch, planLayers. */
function pagePlans(mask: boolean, roles?: Record<string, 'plane' | 'signal'>) {
  const r = roles ?? Object.fromEntries(Object.entries(guessRoles(board)).map(([k, g]) => [k, g.role]));
  const st = kicadStackup(board, { name: 'pcbplanner-example-6layer (KiCad)', roles: r })!.stackup;
  return planLayers(calcStackup(st, mask));
}

describe('layers and cross-sections of the example project', () => {
  it('signal layers top to bottom, with the planes found from the zones', () => {
    expect(signalLayers(data).map((l) => [l.name, l.kind, l.refs.join('/'), l.outer])).toEqual([
      ['F.Cu', 'coated microstrip', 'In1.Cu', true],
      ['In2.Cu', 'stripline', 'In1.Cu/In3.Cu', false],
      ['B.Cu', 'coated microstrip', 'In4.Cu', true],
    ]);
  });
  it('layerGeometry of F.Cu and In2.Cu is the cross-section /kicad-impedance solves, with and without mask', () => {
    for (const mask of [true, false])
      for (const name of ['F.Cu', 'In2.Cu']) {
        const g = layerGeometry(data, name, { mask })!;
        const page = pagePlans(mask).find((p) => p.layer.name === name)!;
        expect(g.sg).toEqual(page.sg);
        expect(g.kind).toBe(page.kind);
        expect([g.etch, g.accuracy]).toEqual([ETCH, ACCURACY]);
      }
    expect(layerGeometry(data, 'In1.Cu')).toBeNull(); // a plane
    expect(layerGeometry(data, 'Nope.Cu')).toBeNull();
  });
  it('the Impedance Calculator fields rebuild the solver geometry of the routing check', () => {
    for (const name of ['F.Cu', 'In2.Cu', 'B.Cu']) {
      const g = layerGeometry(data, name)!;
      const state = { ...IMPEDANCE_DEFAULTS, ...g.impedance, w: 0.13, mode: 'diff', s: 0.16 };
      const built = buildImpedanceGeometry(state).geom!;
      const ref = toSolverGeometry(g.sg, 0.13, true, 0.16, ETCH);
      expect(built.slabs.map((s) => [s.y0, s.y1, s.er].map((v) => Number(v.toFixed(9))))).toEqual(ref.slabs.map((s) => [s.y0, s.y1, s.er].map((v) => Number(v.toFixed(9)))));
      expect([built.yTrace, built.t, built.topPlane, built.wTop, built.mask]).toEqual([ref.yTrace, ref.t, ref.topPlane, ref.wTop, ref.mask]);
    }
  });
  it('layer roles changed by the user move the reference planes', () => {
    const changed = { ...data, roleOverrides: { 'In3.Cu': 'signal' as const } };
    const g = layerGeometry(changed, 'In2.Cu')!;
    const roles = { ...Object.fromEntries(Object.entries(guessRoles(board)).map(([k, v]) => [k, v.role])), 'In3.Cu': 'signal' as const };
    expect(g.sg).toEqual(pagePlans(true, roles).find((p) => p.layer.name === 'In2.Cu')!.sg);
    expect(g.refs).toEqual(['In1.Cu', 'In4.Cu']);
    expect(signalLayers(changed).map((l) => l.name)).toContain('In3.Cu');
  });
  it('copper thickness from the stackup', () => {
    const st = kicadStackup(board, { name: 'x' })!.stackup;
    expect(copperThickness(data, 'F.Cu')).toBe(st.layers.find((l) => l.name === 'F.Cu')!.t);
    expect(copperThickness(data, 'In2.Cu')).toBe(st.layers.find((l) => l.name === 'In2.Cu')!.t);
    expect(copperThickness(data, 'X.Cu')).toBeUndefined();
  });
});

describe('net classes, nets and pairs', () => {
  it('classes of the .kicad_pro with routed nets and pairs; Default only without one', () => {
    expect(netClasses(data).map((c) => [c.name, c.trackWidth, c.dpWidth, c.dpGap, c.nets, c.pairs])).toEqual([
      ['Default', 0.2, 0.2, 0.25, 1, 0], // /SDA
      ['50R', 0.12, 0.12, 0.25, 1, 0],
      ['HDMI', 0.09, 0.09, 0.15, 2, 1],
      ['PCIe', 0.133, 0.133, 0.15, 2, 1],
      ['USB', 0.117, 0.117, 0.15, 2, 1],
    ]);
    expect(netClasses({ ...data, project: null }).map((c) => [c.name, c.nets, c.pairs])).toEqual([['Default', 8, 3]]);
  });
  it('nets and pairs lists', () => {
    expect(nets(data).find((n) => n.name === '/USB_D+')).toMatchObject({ cls: 'USB', pair: '/USB_D', layers: ['In2.Cu', 'F.Cu'] });
    expect(pairs(data).map((p) => [p.name, p.cls, p.suggested?.id])).toEqual([
      ['/HDMI_D0', 'HDMI', 'hdmi-20'],
      ['/PCIE_TX0_', 'PCIe', 'pcie-gen3'],
      ['/USB_D', 'USB', 'usb2-hs'],
    ]);
  });

  // the routing check's own reading of each item (kicadRoutingSolve.useRoutingCheck → checkItem)
  const groups = buildGroups(board.routing!, netClassResolver(project));
  const checkOf = (name: string) => {
    const g = groups.find((x) => x.items.some((i) => i.name === name))!;
    const item = g.items.find((i) => i.name === name)! as RouteItem;
    const solves: Record<string, LayerSolve> = Object.fromEntries(itemLayers(item).map((l) => [l.layer, { z: 90, eeff: 3.2, dbPerIn: 0.3 }]));
    return { item, res: checkItem(item, targetById(g.suggest), solves, L) };
  };
  it('netSummary matches the routing check: length per layer, total length, vias, layers used', () => {
    const s = netSummary(data, '/CLK')!;
    const { res } = checkOf('/CLK');
    expect(s.len).toBe(res.len);
    expect(s.vias).toBe(res.vias);
    expect(s.layers.map((l) => [l.layer, l.len, l.w])).toEqual(res.layers.map((l) => [l.layer, l.len, l.w]));
    expect([...s.layersUsed].sort()).toEqual(['F.Cu', 'In2.Cu']);
    expect(s.cls.name).toBe('50R');
    expect(s.suggested?.id).toBe('se50');
    expect(netSummary(data, '/nothing')).toBeNull();
  });
  it('pairSummary matches the routing check: width, gap and coupled length per layer, lengths, skew, vias', () => {
    for (const name of ['/USB_D', '/HDMI_D0', '/PCIE_TX0_']) {
      const s = pairSummary(data, name)!;
      const { res } = checkOf(name);
      expect(s.layers.map((l) => [l.layer, l.len, l.w, l.wN, l.gap, l.coupled])).toEqual(res.layers.map((l) => [l.layer, l.len, l.w, l.wN, l.gap, l.coupled]));
      expect(s.layers.map((l) => l.wSolve)).toEqual(res.layers.map((l) => solveWidth(l)));
      expect([s.len, s.lenP, s.lenN, s.vias]).toEqual([res.len, res.lenP, res.lenN, res.vias]);
      expect(s.skewMm).toBe(res.skew!.mm);
    }
    expect(pairSummary(data, '/USB_D-')!.name).toBe('/USB_D'); // by either net
    expect(pairSummary(data, '/USB_D')!.mainLayer).toBe('In2.Cu'); // the checked layer with the most length
    expect(pairSummary(data, '/CLK')).toBeNull();
  });
});

describe('picker values and the Impedance Calculator', () => {
  it('resolvePick returns only what was chosen and found', () => {
    const v = resolvePick(data, { layer: 'In2.Cu', netclass: 'USB', pair: '/USB_D', net: '/missing' });
    expect(v.layer?.layer).toBe('In2.Cu');
    expect(v.netClass?.dpGap).toBe(0.15);
    expect(v.pair?.name).toBe('/USB_D');
    expect(v.pairLayer?.layer).toBe('In2.Cu');
    expect(v.net).toBeUndefined();
    expect(v.copperT).toBeGreaterThan(0);
  });

  /** The routing check's impedance of a pair on a layer: its solve of the measured width and gap. */
  const routingZ = (pairName: string, layer: string) => {
    const s = pairSummary(data, pairName)!;
    const l = s.layers.find((x) => x.layer === layer)!;
    const pl = pagePlans(true).find((p) => p.layer.name === layer)!;
    const q = analyseRequest(pl.sg!, l.wSolve, l.gap);
    return solve(q.geom, q.opts).zdiff!;
  };
  /** What the Impedance Calculator solves after Apply. */
  const appliedZ = (pairName: string, layer: string) => {
    const r = impedancePatch(resolvePick(data, { layer, pair: pairName, netclass: pairSummary(data, pairName)!.cls.name }), IMPEDANCE_DEFAULTS)!;
    const state = { ...IMPEDANCE_DEFAULTS, ...r.patch };
    const geom = buildImpedanceGeometry(state).geom!;
    return { z: solve(geom, { accuracy: state.acc as 'normal', even: false }).zdiff!, r, state };
  };

  it('Apply with a routed pair: Z at the pair’s width and gap equals the routing check on each layer', () => {
    for (const [pair, layer] of [['/USB_D', 'F.Cu'], ['/USB_D', 'In2.Cu'], ['/HDMI_D0', 'F.Cu'], ['/PCIE_TX0_', 'F.Cu']]) {
      const { z, r, state } = appliedZ(pair, layer);
      expect(state.mode).toBe('diff');
      expect(z / routingZ(pair, layer)).toBeCloseTo(1, 3);
      expect(r.note).toMatch(/W and S as routed/);
    }
  });
  it('Apply sets line type, geometry, εr, mask, W, S and the suggested target', () => {
    const { r } = appliedZ('/USB_D', 'F.Cu');
    const g = layerGeometry(data, 'F.Cu')!;
    const l = pairSummary(data, '/USB_D')!.layers.find((x) => x.layer === 'F.Cu')!;
    expect(r.patch).toMatchObject({ type: 'microstrip', h: g.sg.h, er: g.sg.er, t: g.sg.t, mask: true, c1: g.sg.mask!.c1, c2: g.sg.mask!.c2, erm: g.sg.mask!.er, etch: ETCH, acc: ACCURACY, mode: 'diff', target: 90 });
    expect(r.patch.w).toBeCloseTo(l.wSolve, 5);
    expect(r.patch.s).toBeCloseTo(l.gap!, 5);
  });
  it('a net class alone gives W from the class: diff-pair width and gap in differential mode, track width otherwise', () => {
    const diff = impedancePatch(resolvePick(data, { layer: 'In2.Cu', netclass: 'PCIe' }), { mode: 'diff', target: 85 })!;
    expect([diff.patch.mode, diff.patch.w, diff.patch.s, diff.patch.type]).toEqual(['diff', 0.133, 0.15, 'stripline']);
    const se = impedancePatch(resolvePick(data, { layer: 'In2.Cu', netclass: '50R' }), { mode: 'se', target: 50 })!;
    expect([se.patch.mode, se.patch.w, se.patch.s]).toEqual(['se', 0.12, undefined]);
    expect(impedancePatch(resolvePick(data, { netclass: '50R' }), { mode: 'se', target: 50 })).toBeNull();
  });
  it('a pair not routed on the chosen layer falls back to its class', () => {
    const r = impedancePatch(resolvePick(data, { layer: 'B.Cu', pair: '/USB_D' }), IMPEDANCE_DEFAULTS)!;
    expect([r.patch.w, r.patch.s]).toEqual([0.117, 0.15]);
    expect(r.note).toMatch(/not routed on B\.Cu/);
  });
});
