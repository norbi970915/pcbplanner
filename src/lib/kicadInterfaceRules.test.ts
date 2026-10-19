/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { FOILS } from '../data/laminates';
import { djordjevicSarkar } from './dielectric';
import { solve } from './fieldsolver';
import { exampleBoard, exampleProject, EXAMPLE_FILE, EXAMPLE_PROJECT_FILE } from './kicadExample';
import { guessRoles, kicadStackup, parseKicadBoard } from './kicadImport';
import { analyseRequest, calcStackup, lossRequest, planLayers, type ImpedanceSettings } from './kicadImpedance';
import { checkPair, interfaceForPick, interfaceRulesPatch, isProjectStackup, pairCheckPlan, ROUTING_CHECK_SETTINGS, type SolveReq } from './kicadInterfaceRules';
import { pairSummary, projectCalc, resolvePick, type KicadProjectData } from './kicadProjectQueries';
import { buildGroups, checkItem, itemLayers, netClassResolver, pairCoupled, parseKicadProject, solveWidth, targetById, type LayerSolve } from './kicadRouting';
import { lossGHz } from './kicadRoutingSolve';
import { lineLoss } from './loss';
import type { SolverResponse } from './solver.worker';
import type { Stackup } from './stackups';

const board = parseKicadBoard(exampleBoard());
const project = parseKicadProject(exampleProject(), EXAMPLE_PROJECT_FILE);
const data: KicadProjectData = { boardName: EXAMPLE_FILE, board, project, projectName: EXAMPLE_PROJECT_FILE, otherBoards: [], roleOverrides: {} };
const L = (mm: number) => mm.toFixed(4);

/** The solver worker, run in place. */
const solveNow = async (req: SolveReq): Promise<SolverResponse> => {
  if (req.type === 'solve') return { id: 0, ok: true, result: solve(req.geom, req.opts) };
  const { slabSpecs, maskSpec, ...rest } = req.req;
  return { id: 0, ok: true, loss: lineLoss({ ...rest, slabModels: slabSpecs.map(djordjevicSarkar), maskModel: maskSpec ? djordjevicSarkar(maskSpec) : undefined }) };
};

/** A picker selection as KicadProjectSource makes it: a pair moves the layer to its main layer and the class to its class. */
const pickPair = (pair: string, mask = true) => {
  const s = pairSummary(data, pair)!;
  return resolvePick(data, { pair, layer: s.mainLayer, netclass: s.cls.name, mask });
};

/** A stand-in for saveImportedStackup that records what was saved. */
const saver = () => {
  const saved: Stackup[] = [];
  return { saved, save: (s: Stackup) => (saved.push(s), s.id) };
};

describe('Apply: interface, stackup and layer from the picked pair or class', () => {
  it('/USB_D selects USB 2.0, the project stackup and In2.Cu, the route length and the pair', () => {
    const { saved, save } = saver();
    const v = pickPair('/USB_D');
    const r = interfaceRulesPatch(data, v, { ifid: 'pcie-gen3' }, save);
    const calc = projectCalc(data, true)!;
    expect(r.patch.ifid).toBe('usb2-hs');
    expect(saved).toEqual([calc]);
    expect(r.patch.stk).toBe(calc.id);
    expect(r.patch.lay).toBe(calc.layers.find((l) => l.name === 'In2.Cu')!.id);
    expect([r.patch.region, r.patch.kpair, r.patch.kmask]).toEqual(['', '/USB_D', true]);
    expect(r.patch.len).toBeCloseTo(pairSummary(data, '/USB_D')!.len, 3);
    expect(r.note).toMatch(/USB 2\.0/);
    expect(r.note).toMatch(/In2\.Cu/);
    expect(isProjectStackup(saved[0], data, true)).toBe(true);
  });
  it('/PCIE_TX0_ selects PCIe Gen 3 on its main layer', () => {
    const { save } = saver();
    const v = pickPair('/PCIE_TX0_');
    const r = interfaceRulesPatch(data, v, { ifid: 'usb2-hs' }, save);
    expect(r.patch.ifid).toBe('pcie-gen3');
    expect(r.patch.lay).toBe(projectCalc(data, true)!.layers.find((l) => l.name === v.layer!.layer)!.id);
    expect(r.patch.kpair).toBe('/PCIE_TX0_');
  });
  it('/HDMI_D0 selects HDMI; without solder mask the stackup is the mask-free one', () => {
    const { saved, save } = saver();
    const r = interfaceRulesPatch(data, resolvePick(data, { pair: '/HDMI_D0', layer: 'F.Cu', mask: false }), { ifid: 'pcie-gen3' }, save);
    expect(r.patch.ifid).toBe('hdmi-20');
    expect(saved[0]).toEqual(projectCalc(data, false));
    expect(saved[0].layers.some((l) => l.kind === 'mask')).toBe(false);
    expect(r.patch.kmask).toBe(false);
    expect(r.note).toMatch(/without solder mask/);
  });
  it('a net class alone selects the interface it names, with no pair to compare', () => {
    const { save } = saver();
    const r = interfaceRulesPatch(data, resolvePick(data, { netclass: 'PCIe', layer: 'In2.Cu' }), { ifid: 'usb2-hs' }, save);
    expect(r.patch.ifid).toBe('pcie-gen3');
    expect(r.patch.kpair).toBe('');
    expect(r.patch.len).toBeUndefined();
    expect(interfaceForPick(resolvePick(data, { netclass: 'USB' }))?.id).toBe('usb2-hs');
  });
  it('a class that names no interface keeps the current one', () => {
    const { save } = saver();
    const r = interfaceRulesPatch(data, resolvePick(data, { netclass: 'Default', layer: 'In2.Cu' }), { ifid: 'sata3' }, save);
    expect(r.patch.ifid).toBeUndefined();
    expect(r.note).toMatch(/SATA.*kept/);
    expect(r.patch.stk).toBeDefined();
  });
});

/**
 * The routing check of /kicad-project at its defaults, rebuilt step by step as
 * kicadRoutingSolve.useRoutingCheck does it: its groups, the page's plans, a solve of each coupled
 * layer, the loss at the target's Nyquist frequency, then checkItem.
 */
async function routingCheckOf(name: string, mask = true) {
  const groups = buildGroups(board.routing!, netClassResolver(project));
  const g = groups.find((x) => x.items.some((i) => i.name === name))!;
  const item = g.items.find((i) => i.name === name)!;
  const target = targetById(g.suggest);
  const roles = Object.fromEntries(Object.entries(guessRoles(board)).map(([k, x]) => [k, x.role]));
  const calc = calcStackup(kicadStackup(board, { name: 'pcbplanner-example-6layer (KiCad)', roles })!.stackup, mask);
  const plans = planLayers(calc);
  const settings: ImpedanceSettings = { gapRule: 'fixed', gap: 0.127, fGHz: 4, rqUm: FOILS.find((f) => f.id === 'ed')!.rq };
  const f = lossGHz(target, settings.fGHz);
  const solves: Record<string, LayerSolve> = {};
  for (const l of itemLayers(item)) {
    const plan = plans.find((p) => p.layer.name === l.layer);
    if (!plan?.sg) {
      solves[l.layer] = { noRef: true };
      continue;
    }
    if (!pairCoupled(l)) {
      solves[l.layer] = { pending: true };
      continue;
    }
    const w = solveWidth(l);
    const q = analyseRequest(plan.sg, w, l.gap);
    const r = solve(q.geom, q.opts);
    const loss = (await solveNow({ type: 'loss', req: lossRequest(calc, plan, w, l.gap, true, { ...settings, fGHz: f }) })) as Extract<SolverResponse, { ok: true }>;
    solves[l.layer] = { z: r.zdiff, eeff: r.odd?.eeff, dbPerIn: (loss.loss!.points[0].alpha / 1000) * 25.4 };
  }
  return { suggest: g.suggest, res: checkItem(item, target, solves, L) };
}

describe('Your routing: the pair checked as the routing check checks it', () => {
  it('settings are the routing check defaults', () => {
    expect(ROUTING_CHECK_SETTINGS).toEqual({ gapRule: 'fixed', gap: 0.127, fGHz: 4, rqUm: FOILS.find((f) => f.id === 'ed')!.rq });
  });
  for (const name of ['/USB_D', '/PCIE_TX0_', '/HDMI_D0'])
    it(`${name}: impedance, status, skew, length and loss equal the routing check's`, async () => {
      const rc = await routingCheckOf(name);
      const plan = pairCheckPlan(data, name, rc.suggest)!;
      const res = await checkPair(plan, solveNow, L);
      expect(res.layers.map((l) => [l.layer, l.w, l.gap, l.coupled, l.solve.z, l.status, l.tag])).toEqual(rc.res.layers.map((l) => [l.layer, l.w, l.gap, l.coupled, l.solve.z, l.status, l.tag]));
      expect(res.skew).toEqual(rc.res.skew);
      expect(res.length).toEqual(rc.res.length);
      expect(res.loss?.db).toBeCloseTo(rc.res.loss!.db, 9);
      expect(res.loss?.status).toBe(rc.res.loss!.status);
      expect(res.overall).toBe(rc.res.overall);
      expect(res.notes).toEqual(rc.res.notes);
    });
  it('/USB_D fails on In2.Cu against USB 2.0, as the routing check shows', async () => {
    const res = await checkPair(pairCheckPlan(data, '/USB_D', 'usb2-hs')!, solveNow, L);
    const in2 = res.layers.find((l) => l.layer === 'In2.Cu')!;
    expect(in2.status).toBe('fail');
    expect(res.overall).toBe('fail');
  });
  it('another interface changes the target only; a single-ended interface gives no target', async () => {
    const usb = pairCheckPlan(data, '/USB_D', 'usb2-hs')!;
    const pcie = pairCheckPlan(data, '/USB_D', 'pcie-gen3')!;
    expect([...pcie.z.values()]).toEqual([...usb.z.values()]);
    expect(pcie.target?.id).toBe('pcie-gen3');
    const ddr = pairCheckPlan(data, '/USB_D', 'ddr4')!;
    expect([ddr.target, ddr.kindMismatch, ddr.loss.size]).toEqual([null, true, 0]);
    expect(pairCheckPlan(data, '/USB_D-', 'usb2-hs')!.item.name).toBe('/USB_D'); // by either net
    expect(pairCheckPlan(data, '/CLK', 'usb2-hs')).toBeNull();
  });
});
