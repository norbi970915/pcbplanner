import { describe, expect, it } from 'vitest';
import { designLine } from './design';
import { GeometryError, solve } from './fieldsolver';

// Regression tests for the E2E findings: absurd inputs must fail fast with a clear error, never hang.
describe('solver robustness', () => {
  it('rejects a 1e9 mm spacing quickly', () => {
    const t0 = performance.now();
    expect(() => solve({ w: 0.1, t: 0.035, yTrace: 0.1, diff: true, s: 1e9, slabs: [{ y0: 0, y1: 0.1, er: 4 }] })).toThrow(GeometryError);
    expect(performance.now() - t0).toBeLessThan(200);
  });
  it('rejects a feature-size ratio beyond 2e4', () => {
    expect(() => solve({ w: 500, t: 0.001, yTrace: 0.1, diff: false, slabs: [{ y0: 0, y1: 0.1, er: 4 }] })).toThrow(GeometryError);
  });
  it('the stack-manager design path surfaces the error instead of freezing', () => {
    const t0 = performance.now();
    expect(() =>
      designLine({
        sg: { type: 'stripline', h: 0.2, er: 4, h2: 0.2, er2: 4, t: 0.0152, outer: false, note: '' },
        kind: 'diff',
        target: 100,
        etch: 0,
        rule: { mode: 'fixed', s: 1e9, ratio: 1, minS: 0 },
        accuracy: 'normal',
      }),
    ).toThrow();
    expect(performance.now() - t0).toBeLessThan(1000);
  });
  it('via pair: an absurd pitch is rejected by validation and never allocates a huge grid', async () => {
    const { validateViaPair, viaPairImpedance } = await import('./via2d');
    const g = { d: 0.25, pitch: 1e9, antipad: 0.7, shape: 'oblong' as const, er: 4 };
    expect(validateViaPair(g).length).toBeGreaterThan(0);
    const t0 = performance.now();
    expect(() => viaPairImpedance(g)).toThrow();
    expect(performance.now() - t0).toBeLessThan(200);
  });
  it('normal geometries still solve', () => {
    expect(solve({ w: 0.15, t: 0.035, yTrace: 0.1, diff: false, slabs: [{ y0: 0, y1: 0.1, er: 4.1 }] }).se!.z).toBeGreaterThan(40);
  });
});
