import { describe, expect, it } from 'vitest';
import { parseKicadBoard } from './kicadImport';
import { addLaneChecks, buildGroups, checkItem, laneLink, netClassResolver, targetById, type ItemResult, type LayerSolve, type RouteItem } from './kicadRouting';
import { copperFaces, stubLength } from './kicadVias';

// four copper layers: 0.035 copper, 0.2 prepreg, 1.2 core, 0.2 prepreg
const STACK = `(layer "F.Cu" (type "copper") (thickness 0.035))
  (layer "dielectric 1" (type "prepreg") (thickness 0.2) (material "FR4") (epsilon_r 4.2) (loss_tangent 0.015))
  (layer "In1.Cu" (type "copper") (thickness 0.035))
  (layer "dielectric 2" (type "core") (thickness 1.2) (material "FR4") (epsilon_r 4.4) (loss_tangent 0.015))
  (layer "In2.Cu" (type "copper") (thickness 0.035))
  (layer "dielectric 3" (type "prepreg") (thickness 0.2) (material "FR4") (epsilon_r 4.2) (loss_tangent 0.015))
  (layer "B.Cu" (type "copper") (thickness 0.035))`;

const board = (extra: string) => `(kicad_pcb (version 20240108) (generator "pcbnew") (generator_version "8.0")
  (general (thickness 1.74))
  (layers (0 "F.Cu" signal) (1 "In1.Cu" signal) (2 "In2.Cu" signal) (31 "B.Cu" signal) (44 "Edge.Cuts" user))
  (setup (stackup ${STACK}))
  (net 0 "") (net 1 "GND") (net 2 "/D_P") (net 3 "/D_N") (net 4 "/SIG")
  (gr_rect (start 0 0) (end 100 50) (layer "Edge.Cuts"))
  ${extra}
)`;
const seg = (net: number, layer: string, x1: number, y1: number, x2: number, y2: number, w = 0.15) => `(segment (start ${x1} ${y1}) (end ${x2} ${y2}) (width ${w}) (layer "${layer}") (net ${net}) (uuid "s"))`;
const via = (net: number, x: number, y: number, more = '') => `(via ${more}(at ${x} ${y}) (size 0.45) (drill 0.2) (layers "F.Cu" "B.Cu") (net ${net}) (uuid "v"))`;

/** A pair from F.Cu through vias at x 30 to `inner`, with a ground via `gnd` mm from the positive via. */
const pairBoard = (inner: string, gnd: number, extra = '') =>
  board(
    seg(2, 'F.Cu', 10, 20, 30, 20) + seg(3, 'F.Cu', 10, 20.3, 30, 20.3) + via(2, 30, 20) + via(3, 30, 20.3) + seg(2, inner, 30, 20, 60, 20) + seg(3, inner, 30, 20.3, 60, 20.3) + via(1, 30 - gnd, 20) + extra,
  );

const itemOf = (text: string): RouteItem => {
  const r = parseKicadBoard(text).routing!;
  return buildGroups(r, netClassResolver(null))
    .flatMap((g) => g.items)
    .find((i) => i.name === '/D_')!;
};
const L = (mm: number) => mm.toFixed(3);
const solves = (planes: Record<string, string[]>): Record<string, LayerSolve> => Object.fromEntries(Object.entries(planes).map(([l, p]) => [l, { z: 90, eeff: 3.3, planes: p }]));

describe('via stubs from the stackup', () => {
  const faces = copperFaces(parseKicadBoard(board('')).stackup)!;
  it('copper faces from the stackup, mask and paste left out', () => {
    expect(faces.get('F.Cu')).toEqual({ top: 0, bottom: 0.035 });
    expect(faces.get('B.Cu')!.bottom).toBeCloseTo(1.74, 9);
  });
  it('the stub is the barrel beyond the outermost layers the signal uses', () => {
    expect(stubLength(['F.Cu', 'B.Cu'], ['F.Cu', 'B.Cu'], faces)).toBe(0);
    expect(stubLength(['F.Cu', 'B.Cu'], ['F.Cu', 'In1.Cu'], faces)).toBeCloseTo(1.74 - 0.27, 9);
    expect(stubLength(['F.Cu', 'B.Cu'], ['In2.Cu', 'B.Cu'], faces)).toBeCloseTo(1.47, 9); // from the top of In2.Cu up to the top of F.Cu
  });
  it('vias of a pair: layers used, stub, nearest ground via; back-drilled and one-sided vias are not measured', () => {
    const r = parseKicadBoard(pairBoard('In1.Cu', 1)).routing!;
    const v = r.nets.find((n) => n.name === '/D_P')!.viaUse!;
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ span: ['F.Cu', 'B.Cu'], used: ['F.Cu', 'In1.Cu'], retNet: 'GND' });
    expect(v[0].stub).toBeCloseTo(1.47, 4);
    expect(v[0].ret).toBeCloseTo(1, 9);
    expect(r.nets.find((n) => n.name === 'GND')?.viaUse).toBeUndefined(); // plane nets are not listed
    const bd = parseKicadBoard(pairBoard('In1.Cu', 1).replace('(via (at 30 20)', '(via (at 30 20) (backdrill (size 0.4) (layers "B.Cu" "In2.Cu"))')).routing!;
    const b0 = bd.nets.find((n) => n.name === '/D_P')!.viaUse![0];
    expect([b0.backdrill, b0.stub, b0.span]).toEqual([true, undefined, ['F.Cu', 'B.Cu']]);
    const blind = parseKicadBoard(pairBoard('In1.Cu', 1).replace('(via (at 30 20)', '(via blind (at 30 20)')).routing!;
    expect(blind.nets.find((n) => n.name === '/D_P')!.viaUse![0].kind).toBe('blind');
  });
});

describe('via checks against the interface guidelines (warnings, with the source)', () => {
  it('a 1.47 mm stub is over TI’s 15 mil; a stub-free transition passes', () => {
    const res = checkItem(itemOf(pairBoard('In1.Cu', 1)), targetById('usb3-gen1'), solves({ 'F.Cu': ['In2.Cu'], 'In1.Cu': ['In2.Cu'] }), L);
    const stub = res.checks!.find((c) => c.key === 'stub')!;
    expect(stub.status).toBe('warn');
    expect(stub.reason).toMatch(/2 of 2 vias over 0\.381 mm \(TI SLLA414\), the longest 1\.470 mm at x 30, y 20(\.3)? mm \(signal on F\.Cu and In1\.Cu, via F\.Cu to B\.Cu\)/);
    expect(res.overall).toBe('warn');
    const ok = checkItem(itemOf(pairBoard('B.Cu', 1)), targetById('usb3-gen1'), solves({ 'F.Cu': ['In1.Cu'], 'B.Cu': ['In2.Cu'] }), L);
    expect(ok.checks!.find((c) => c.key === 'stub')!.status).toBe('ok');
  });
  it('a return via is needed only where no reference plane is shared, within the interface’s distance', () => {
    const t = targetById('usb3-gen1'); // 200 mil = 5.08 mm
    const change = solves({ 'F.Cu': ['In1.Cu'], 'B.Cu': ['In2.Cu'] });
    expect(checkItem(itemOf(pairBoard('B.Cu', 1)), t, change, L).checks!.find((c) => c.key === 'return')!.status).toBe('ok');
    const far = checkItem(itemOf(pairBoard('B.Cu', 8)), t, change, L).checks!.find((c) => c.key === 'return')!;
    expect(far.status).toBe('warn');
    expect(far.reason).toMatch(/no ground via within 5\.080 mm \(TI SLLA414\); at x 30, y 20(\.3)? mm \(F\.Cu to B\.Cu\) the nearest is 8\.\d+ mm away \(GND\)/);
    // the same plane above and below the change: no return via needed
    expect(checkItem(itemOf(pairBoard('In2.Cu', 8)), t, solves({ 'F.Cu': ['In1.Cu'], 'In2.Cu': ['In1.Cu', 'B.Cu'] }), L).checks!.find((c) => c.key === 'return')).toBeUndefined();
  });
  it('via count per trace and equal counts', () => {
    const one = itemOf(pairBoard('B.Cu', 1, via(2, 50, 20)));
    const res = checkItem(one, targetById('mipi-dphy'), solves({ 'F.Cu': ['In1.Cu'], 'B.Cu': ['In2.Cu'] }), L);
    expect(res.checks!.find((c) => c.key === 'vias')).toMatchObject({ status: 'warn' });
    expect(res.checks!.find((c) => c.key === 'vias')!.reason).toMatch(/2 and 1 vias, not the same number \(TI SPRACP4A\)/);
    // an impedance-only target has no layout guidelines
    expect(checkItem(one, targetById('d90'), solves({ 'F.Cu': ['In1.Cu'], 'B.Cu': ['In2.Cu'] }), L).checks).toBeUndefined();
  });
});

describe('spacing to other signals', () => {
  it('a signal 0.4 mm from the pair for 20 mm, away from pads, is closer than 30 mil; breakout near the ends is not counted', () => {
    const text = board(seg(2, 'F.Cu', 0, 20, 60, 20) + seg(3, 'F.Cu', 0, 20.3, 60, 20.3) + seg(4, 'F.Cu', 20, 20.85, 40, 20.85));
    const item = itemOf(text);
    const s = item.n!.layers[0].space!;
    expect(s.near.net).toBe('/SIG');
    expect(s.near.d).toBeCloseTo(0.85 - 0.3 - 0.15, 3);
    expect(s.other.reduce((a, v) => a + v, 0)).toBeGreaterThan(19);
    const res = checkItem(item, targetById('usb3-gen1'), solves({ 'F.Cu': ['In1.Cu'] }), L);
    const sp = res.checks!.find((c) => c.key === 'space')!;
    expect(sp.status).toBe('warn');
    expect(sp.reason).toMatch(/closer than 0\.762 mm to other signals \(TI SLLA414\) and 5W to other pairs \(TI SLLA414\), outside 2\.5 mm of pads and vias; nearest 0\.400 mm to SIG/);
    // the same signal 2 mm away is fine
    const far = itemOf(board(seg(2, 'F.Cu', 0, 20, 60, 20) + seg(3, 'F.Cu', 0, 20.3, 60, 20.3) + seg(4, 'F.Cu', 20, 22.6, 40, 22.6)));
    expect(checkItem(far, targetById('usb3-gen1'), solves({ 'F.Cu': ['In1.Cu'] }), L).checks!.find((c) => c.key === 'space')!.status).toBe('ok');
  });
});

describe('lane-to-lane matching', () => {
  it('lanes of one link by name', () => {
    expect(['HDMI_D0_', 'HDMI_D2_', 'HDMI_CLK_', '/CM5/HDMI_PI.CK_', '/CM5/HDMI_PI.D1_'].map(laneLink)).toEqual(['HDMI_', 'HDMI_', 'HDMI_', '/CM5/HDMI_PI.', '/CM5/HDMI_PI.']);
    expect(['DPHY0_P.C_', 'DPHY0_P.D3_', 'HDMI_TXC', 'HDMI_TX2'].map(laneLink)).toEqual(['DPHY0_P.', 'DPHY0_P.', 'HDMI_', 'HDMI_']);
  });
  const lane = (name: string, len: number) => {
    const res: ItemResult = { layers: [], len, vias: 0, overall: 'ok', notes: [], skew: { mm: 1, ps: 6, status: 'ok', reason: '' } };
    return { groupKey: 'g', item: { kind: 'pair', name, cls: { name: 'Default', all: ['Default'] } } as RouteItem, target: targetById('hdmi-20'), res };
  };
  it('HDMI: over 1 in is a warning, beyond the 333 ps of the specification a fail', () => {
    const lanes = [lane('HDMI_D0_', 100), lane('HDMI_D1_', 120), lane('HDMI_D2_', 130), lane('HDMI_CLK_', 160)];
    addLaneChecks(lanes, L);
    const st = lanes.map((c) => c.res.checks![0].status);
    expect(st).toEqual(['ok', 'ok', 'warn', 'fail']); // 0, 20, 30 and 60 mm; 60 mm × 6 ps/mm = 360 ps
    expect(lanes[3].res.checks![0].reason).toMatch(/60\.000 mm \(360 ps\) longer than HDMI_D0, the shortest lane; guideline 25\.400 mm \(TI TDP0604 data sheet SLLSFJ8A\); HDMI 2\.0 \(TMDS, 6 Gb\/s\) allows 333 ps \(TI HDMI Design Guide\)/);
    expect(lanes[3].res.overall).toBe('fail');
  });
});
