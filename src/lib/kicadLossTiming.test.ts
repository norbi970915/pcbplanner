/// <reference types="node" />
// The Trace Loss and timing mappings of "From KiCad Project" on the example project, checked against
// the routing check of /kicad-project (kicadRoutingSolve.useRoutingCheck → checkItem).
import { describe, expect, it } from 'vitest';
import { KICAD_ANALYSIS_DEFAULTS } from '../components/kicad/useKicadAnalysis';
import { FOILS } from '../data/laminates';
import { djordjevicSarkar } from './dielectric';
import { solve } from './fieldsolver';
import { exampleBoard, exampleProject, EXAMPLE_FILE, EXAMPLE_PROJECT_FILE } from './kicadExample';
import { parseKicadBoard } from './kicadImport';
import { analyseRequest, lossRequest } from './kicadImpedance';
import { ROUTING_CHECK_FGHZ, ROUTING_CHECK_RQ, timingPatch, timingSource, traceLossPatch } from './kicadLossTiming';
import { projectCalc, projectPlans, resolvePick, routeGroups, type KicadPickSelection, type KicadProjectData } from './kicadProjectQueries';
import { checkItem, itemLayers, parseKicadProject, pairCoupled, solveWidth, targetById, type LayerSolve } from './kicadRouting';
import { lossGHz } from './kicadRoutingSolve';
import { psPerMm } from './interfaceRules';
import { lineLoss } from './loss';
import { delayPsPerMm } from './signal';
import type { LossRequest } from './solver.worker';
import { buildTraceLossRequest, TRACE_LOSS_DEFAULTS, type TraceLossInputs } from './traceLossRequest';

const board = parseKicadBoard(exampleBoard());
const project = parseKicadProject(exampleProject(), EXAMPLE_PROJECT_FILE);
const data: KicadProjectData = { boardName: EXAMPLE_FILE, board, project, projectName: EXAMPLE_PROJECT_FILE, otherBoards: [], roleOverrides: {} };
const L = (mm: number) => `${mm.toFixed(4)} mm`;
const settings = { gapRule: 'fixed' as const, gap: KICAD_ANALYSIS_DEFAULTS.gap, fGHz: KICAD_ANALYSIS_DEFAULTS.f, rqUm: FOILS.find((f) => f.id === KICAD_ANALYSIS_DEFAULTS.foil)!.rq };

const runLoss = ({ slabSpecs, maskSpec, ...rest }: LossRequest) => lineLoss({ ...rest, slabModels: slabSpecs.map(djordjevicSarkar), maskModel: maskSpec ? djordjevicSarkar(maskSpec) : undefined });

/** The routing check's item, target and loss frequency for a pair or net (its default settings, solder mask on). */
function routing(name: string) {
  const g = routeGroups(data).find((x) => x.items.some((i) => i.name === name))!;
  const item = g.items.find((i) => i.name === name)!;
  const target = targetById(g.suggest);
  return { item, target, f: lossGHz(target, settings.fGHz) };
}

/** What the routing check solves per layer: Z and εeff of the measured line, and its loss in dB/in at the target's frequency. */
function routingSolves(name: string, withLoss: boolean): Record<string, LayerSolve> {
  const { item, f } = routing(name);
  const calc = projectCalc(data)!;
  const plans = projectPlans(data);
  const out: Record<string, LayerSolve> = {};
  for (const l of itemLayers(item)) {
    const plan = plans.find((p) => p.layer.name === l.layer)!;
    if (item.kind === 'pair' && !pairCoupled(l)) continue;
    const w = solveWidth(l);
    const s = item.kind === 'pair' ? l.gap : undefined;
    const q = analyseRequest(plan.sg!, w, s);
    const r = solve(q.geom, q.opts);
    const solved: LayerSolve = s !== undefined ? { z: r.zdiff, eeff: r.odd?.eeff } : { z: r.se?.z, eeff: r.se?.eeff };
    if (withLoss) solved.dbPerIn = (runLoss(lossRequest(calc, plan, w, s, s !== undefined, { ...settings, fGHz: f })).points[0].alpha / 1000) * 25.4;
    out[l.layer] = solved;
  }
  return out;
}

/** Apply in the Trace Loss calculator from its defaults, then what it solves at the frequency of interest. */
function appliedLoss(sel: KicadPickSelection, length: 'layer' | 'route' = 'layer', cur: TraceLossInputs = TRACE_LOSS_DEFAULTS) {
  const r = traceLossPatch(data, resolvePick(data, sel), cur, { length, L });
  if ('error' in r) throw new Error(r.error);
  const state = { ...cur, ...r.patch };
  const req = buildTraceLossRequest(state).req!;
  const at = runLoss({ ...req, freqs: [req.fRef] }).points[0];
  const dbPerIn = at.alpha / 39.3700787;
  return { ...r, state, dbPerIn, db: (dbPerIn * state.len) / 25.4 };
}

describe('Trace Loss from the KiCad project', () => {
  it('the routing check uses the defaults this mapping assumes', () => {
    expect(settings.rqUm).toBe(ROUTING_CHECK_RQ);
    expect(KICAD_ANALYSIS_DEFAULTS.f).toBe(ROUTING_CHECK_FGHZ);
    expect([TRACE_LOSS_DEFAULTS.rough, TRACE_LOSS_DEFAULTS.rq, TRACE_LOSS_DEFAULTS.temp]).toEqual(['hammerstad', ROUTING_CHECK_RQ, 20]);
  });

  it('a pair on a layer: cross-section, laminate, routed width, gap and layer length, and the Nyquist frequency', () => {
    const { patch, note } = appliedLoss({ layer: 'F.Cu', pair: '/HDMI_D0' });
    expect(patch).toMatchObject({ type: 'microstrip', mode: 'diff', w: 0.09, s: 0.15, h: 0.0764, t: 0.035, mat: 'custom', er: 3.91, df: 0.015, f0: 1, dl: '', mask: true, c1: 0.0305, c2: 0.01525, mmat: 'custom', erm: 3.8, f: 3, etch: 0.0127, acc: 'normal' });
    expect(patch.len).toBeCloseTo(43.900851, 5);
    expect(note).toContain('Nyquist frequency of HDMI 2.0');
    const strip = appliedLoss({ layer: 'In2.Cu', pair: '/USB_D' }).patch;
    expect(strip).toMatchObject({ type: 'stripline', w: 0.2, s: 0.15, h: 0.0918, h2: 0.6, er: 4.1, er2: 4.36, df2: 0.015, mat2: 'custom', f: 0.24 });
    expect(strip.len).toBeCloseTo(24.397024, 5);
  });

  it('the whole route instead of the layer length; a net is single-ended; the frequency stays without an interface', () => {
    expect(appliedLoss({ layer: 'In2.Cu', pair: '/USB_D' }, 'route').patch.len).toBeCloseTo((46.639457279872715 + 46.63987149343508) / 2, 5);
    const clk = appliedLoss({ layer: 'In2.Cu', net: '/CLK' }, 'layer', { ...TRACE_LOSS_DEFAULTS, f: 2.5 });
    expect(clk.patch).toMatchObject({ mode: 'se', w: 0.121, len: 65, f: 2.5 });
    expect(clk.patch.s).toBeUndefined();
    expect(appliedLoss({ layer: 'In2.Cu', net: '/CLK' }, 'route').patch.len).toBe(105);
    expect(traceLossPatch(data, resolvePick(data, { layer: 'In1.Cu', pair: '/USB_D' }), TRACE_LOSS_DEFAULTS, { length: 'layer', L })).toHaveProperty('error');
  });

  it('the loss equals the routing check’s loss for the same layer, length and frequency', { timeout: 120_000 }, () => {
    for (const [name, layer, kind] of [
      ['/HDMI_D0', 'F.Cu', 'pair'],
      ['/USB_D', 'In2.Cu', 'pair'],
      ['/USB_D', 'F.Cu', 'pair'],
      ['/CLK', 'In2.Cu', 'net'],
      ['/CLK', 'F.Cu', 'net'],
    ] as const) {
      const a = appliedLoss({ layer, [kind]: name });
      const check = routingSolves(name, true)[layer];
      const len = itemLayers(routing(name).item).find((l) => l.layer === layer)!.len;
      expect(a.state.f).toBe(routing(name).f);
      expect(a.dbPerIn / check.dbPerIn!).toBeCloseTo(1, 6);
      expect(a.db / ((check.dbPerIn! * len) / 25.4)).toBeCloseTo(1, 6);
    }
  });

  it('per-layer losses add up to the routing check’s total; a single-layer pair’s whole route equals it', { timeout: 120_000 }, () => {
    for (const name of ['/USB_D', '/HDMI_D0']) {
      const { item, target } = routing(name);
      const res = checkItem(item, target, routingSolves(name, true), L);
      const sum = itemLayers(item).filter(pairCoupled).reduce((acc, l) => acc + appliedLoss({ layer: l.layer, pair: name }).db, 0);
      expect(sum / res.loss!.db).toBeCloseTo(1, 6);
    }
    const { item, target } = routing('/HDMI_D0');
    const res = checkItem(item, target, routingSolves('/HDMI_D0', true), L);
    expect(appliedLoss({ layer: 'F.Cu', pair: '/HDMI_D0' }, 'route').db / res.loss!.db).toBeCloseTo(1, 6);
  });

  it('says when the copper model differs from the routing check’s', () => {
    expect(appliedLoss({ layer: 'F.Cu', pair: '/HDMI_D0' }).note).not.toContain('copper settings differ');
    const r = traceLossPatch(data, resolvePick(data, { layer: 'F.Cu', pair: '/HDMI_D0' }), { ...TRACE_LOSS_DEFAULTS, rough: 'huray' }, { length: 'layer', L });
    expect('note' in r && r.note).toContain('copper settings differ');
  });
});

describe('Delay and timing from the KiCad project', () => {
  /** Apply in the timing tool: the solve the tool runs on the worker, then the patch. */
  const applied = (sel: KicadPickSelection) => {
    const v = resolvePick(data, sel);
    const src = timingSource(v, L);
    if ('error' in src) throw new Error(src.error);
    const r = solve(src.req.geom, src.req.opts);
    const eeff = (src.diff ? r.odd?.eeff : r.se?.eeff)!;
    return { src, eeff, ...timingPatch(v, src, eeff, L) };
  };

  it('the delay per length is the routing check’s', () => {
    for (const e of [1, 2.9, 3.4, 4.36]) expect(delayPsPerMm(e)).toBeCloseTo(psPerMm(e), 12);
  });

  it('a pair fills both lengths and εeff of its main layer; the skew in ps equals the routing check’s', { timeout: 60_000 }, () => {
    for (const [name, layer] of [
      ['/USB_D', 'In2.Cu'],
      ['/HDMI_D0', 'F.Cu'],
    ]) {
      const { patch, src } = applied({ layer, pair: name });
      const { item, target } = routing(name);
      const res = checkItem(item, target, routingSolves(name, false), L);
      expect(src.diff).toBe(true);
      expect([patch.src, patch.len, patch.lenB]).toEqual(['direct', res.lenP, res.lenN]);
      const ps = Math.abs(patch.len! - patch.lenB!) * delayPsPerMm(patch.eeff);
      expect(res.skew!.ps).toBeGreaterThan(0);
      expect(ps / res.skew!.ps!).toBeCloseTo(1, 5);
    }
  });

  it('the allowed skew is the interface’s intra-pair limit in ps on that layer', () => {
    const { patch, eeff, note } = applied({ layer: 'F.Cu', pair: '/HDMI_D0' });
    expect(patch.skew! / delayPsPerMm(eeff)).toBeCloseTo(5 * 0.0254, 4);
    expect(note).toContain('intra-pair layout guideline of HDMI 2.0');
    expect(note).toContain('The specification itself allows 25 ps');
  });

  it('a net alone fills the first length with its single-ended εeff; a pair and a net compare the pair with the net', () => {
    const clk = applied({ layer: 'In2.Cu', net: '/CLK' });
    expect(clk.src.diff).toBe(false);
    expect(clk.patch.len).toBe(105);
    expect(clk.patch.lenB).toBeUndefined();
    expect(clk.patch.skew).toBeUndefined();
    expect(clk.eeff).toBeGreaterThan(4); // stripline: about the laminate's Dk
    const both = applied({ layer: 'F.Cu', pair: '/HDMI_D0', net: '/CLK' });
    expect([both.patch.len, both.patch.lenB, both.patch.skew]).toEqual([44.0893420416774, 105, undefined]);
    expect(timingSource(resolvePick(data, { layer: 'F.Cu' }), L)).toEqual({ error: 'Choose a pair or a net.' });
  });

  it('a pair not routed on the chosen layer falls back to its class and says where the routing check takes its delay', () => {
    const { src, note } = applied({ layer: 'B.Cu', pair: '/USB_D' });
    expect([src.w, src.s]).toEqual([0.117, 0.15]);
    expect(note).toContain('The routing check takes the delay of In2.Cu');
  });
});
