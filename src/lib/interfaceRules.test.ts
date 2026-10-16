import { describe, expect, it } from 'vitest';
import { INTERFACES, interfaceById, type InterfaceSpec } from '../data/interfaces';
import { PRESETS, geometryForLayer } from './stackups';
import { designLine } from './design';
import { lineLoss } from './loss';
import { djordjevicSarkar } from './dielectric';
import { evaluateInterface, interfaceLossRequest, lengthForPs, maxLengthForLoss, psPerMm, type LineMetrics } from './interfaceRules';

const L = (mm: number) => `${mm.toFixed(3)} mm`;

const spec: InterfaceSpec = {
  id: 'test',
  name: 'Test link',
  family: 'Test',
  summary: 'test',
  rateGbps: 8,
  nyquistGHz: 4,
  encoding: '128b/130b',
  z: { kind: 'diff', target: 85, min: 70, max: 100 },
  intraPairPs: 5,
  laneSkewPs: 350,
  lossBudgetDb: 6.5,
  rules: [],
  sources: [],
};
const line: LineMetrics = {
  w: 0.15,
  s: 0.22,
  z: 85,
  eeff: 3.24,
  dbPerMm: 0.025,
};
const fab = { minW: 0.09, minS: 0.09, maxW: 0.4 };
const row = (rows: ReturnType<typeof evaluateInterface>, label: string) => rows.find((r) => r.label.startsWith(label));

describe('line delay', () => {
  it('gives 3.34 ps/mm per √εeff', () => {
    expect(psPerMm(1)).toBeCloseTo(3.3356, 3);
    // εeff 4 → twice the vacuum delay
    expect(psPerMm(4)).toBeCloseTo(6.6713, 3);
  });
  it('turns a skew budget into a trace length', () => {
    expect(lengthForPs(5, psPerMm(4))).toBeCloseTo(0.7495, 3); // 5 ps ≈ 0.75 mm on a stripline
  });
  it('divides the loss budget by the loss per mm', () => {
    expect(maxLengthForLoss(6.5, 0.025)).toBeCloseTo(260, 6);
  });
});

describe('interface checks', () => {
  const rows = evaluateInterface(spec, line, fab, 100, L);

  it('passes a geometry that the fab can build', () => {
    const r = row(rows, 'Trace width');
    expect(r?.status).toBe('ok');
    expect(r?.value).toBe('0.150 mm / 0.220 mm');
  });
  it('fails a width below the fab minimum', () => {
    const r = row(evaluateInterface(spec, { ...line, w: 0.05 }, fab, 100, L), 'Trace width');
    expect(r?.status).toBe('fail');
    expect(r?.note).toContain('minimum');
  });
  it('compares the loss over the route with the budget', () => {
    expect(row(rows, 'Insertion loss')?.value).toBe('2.50 dB over 100.000 mm');
    expect(row(rows, 'Insertion loss')?.status).toBe('ok');
    // 6.5 dB / 0.025 dB per mm
    expect(row(rows, 'Longest route')?.value).toBe('260.000 mm');
  });
  it('flags a route that is over budget, and warns just below it', () => {
    expect(row(evaluateInterface(spec, line, fab, 300, L), 'Insertion loss')?.status).toBe('fail');
    expect(row(evaluateInterface(spec, line, fab, 220, L), 'Insertion loss')?.status).toBe('warn');
  });
  it('converts both skew limits with the delay of this layer', () => {
    // 5 ps at 3.3356·√3.24 = 6.004 ps/mm
    expect(row(rows, 'Intra-pair')?.value).toBe('0.833 mm');
    expect(row(rows, 'Lane-to-lane')?.value).toBe('58.293 mm');
  });
  it('leaves out a rule the interface does not define', () => {
    const rows2 = evaluateInterface({ ...spec, laneSkewPs: undefined, lossBudgetDb: undefined }, line, fab, 100, L);
    expect(row(rows2, 'Lane-to-lane')).toBeUndefined();
    expect(row(rows2, 'Insertion loss')).toBeUndefined();
  });
  it('uses a skew limit that is given as a length as it is', () => {
    const rows2 = evaluateInterface({ ...spec, intraPairPs: undefined, intraPairMm: 0.127 }, line, fab, 100, L);
    expect(row(rows2, 'Intra-pair')?.value).toBe('0.127 mm');
  });
});

describe('a real interface on a real stackup', () => {
  it('designs an 85 Ω PCIe pair on the outer layer and prices its loss at 4 GHz', () => {
    const stack = PRESETS.find((s) => s.id === 'std-6l-16-1080-2');
    expect(stack).toBeDefined();
    const sg = geometryForLayer(stack!, stack!.layers.find((l) => l.kind === 'copper')!.id);
    expect(sg?.type).toBe('microstrip');
    const pcie = interfaceById('pcie-gen3')!;
    const d = designLine({ sg: sg!, kind: 'diff', target: pcie.z.target, etch: 0.0127, rule: { mode: 'ratio', s: 0.2, ratio: 1, minS: 0.09 }, accuracy: 'fast' });
    expect(d.z).toBeCloseTo(85, 0);
    expect(d.w).toBeGreaterThan(0.1);
    expect(d.w).toBeLessThan(0.17);

    // S1141 2116 prepreg (Df 0.017 at 5 GHz) on ED foil, at the 4 GHz Nyquist frequency
    const req = interfaceLossRequest(sg!, d.w, d.s, true, { etch: 0.0127, df: 0.017, f0Hz: 5e9, maskDf: 0.027, maskF0Hz: 1e9, rqUm: 3.2, accuracy: 'fast', fHz: 4e9 });
    const { slabSpecs, maskSpec, ...rest } = req;
    const pt = lineLoss({ ...rest, slabModels: slabSpecs.map(djordjevicSarkar), maskModel: maskSpec ? djordjevicSarkar(maskSpec) : undefined }).points[0];
    const dbPerIn = (pt.alpha / 1000) * 25.4;
    expect(dbPerIn).toBeGreaterThan(0.4);
    expect(dbPerIn).toBeLessThan(1.2);
    // an outer layer on FR-4 runs near 6 ps/mm, so the 750 ps edge-finger budget is about 130 mm
    const pm = psPerMm(pt.eeff);
    expect(pm).toBeGreaterThan(5);
    expect(pm).toBeLessThan(7);
    expect(lengthForPs(pcie.maxDelayPs!, pm)).toBeGreaterThan(100);
  });
});

describe('interface library', () => {
  it('has unique ids and sourced rules', () => {
    expect(new Set(INTERFACES.map((i) => i.id)).size).toBe(INTERFACES.length);
    for (const i of INTERFACES) {
      expect(i.sources.length, `${i.id} has no sources`).toBeGreaterThan(0);
      expect(i.rules.length, `${i.id} has no rules`).toBeGreaterThan(0);
      expect(i.nyquistGHz).toBeGreaterThan(0);
      for (const r of i.rules) expect(i.sources[r.src], `${i.id}: rule “${r.label}” points at source ${r.src}`).toBeDefined();
      for (const s of i.sources) expect(s.url).toMatch(/^https?:\/\//);
    }
  });
});
