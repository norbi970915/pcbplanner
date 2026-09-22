import { describe, expect, it } from 'vitest';
import { areaMil2, currentFor, IPC2221, ipc2221Warnings, tempRiseFor, traceWidth } from './ipc2221';
import { MM_PER_OZ } from './units';

describe('audit: IPC-2221', () => {
  it('constants', () => {
    // IPC-2221B §6.2 curve fit: I = k·ΔT^0.44·A^0.725, k = 0.048 external, 0.024 internal.
    expect(IPC2221).toEqual({ kExternal: 0.048, kInternal: 0.024, b: 0.44, c: 0.725 });
  });

  it('1 A, ΔT 10 °C, 1 oz: 11.8 mil external, 30.8 mil internal', () => {
    // Advanced Circuits trace-width calculator (4pcb.com/trace-width-calculator.html),
    // which implements the IPC-2221 fit with 1 oz = 1.378 mil: 11.8 mil ext, 30.8 mil int.
    const r = traceWidth({ currentA: 1, dTC: 10, thicknessMm: MM_PER_OZ, lengthMm: 10, ambientC: 25 });
    expect(r.external.widthMil).toBeCloseTo(11.8, 1);
    expect(r.internal.widthMil).toBeCloseTo(30.8, 1);
  });

  it('forward/inverse functions are consistent', () => {
    const a = areaMil2(3, 20, IPC2221.kExternal);
    expect(currentFor(a, 20, IPC2221.kExternal)).toBeCloseTo(3, 9);
    expect(tempRiseFor(3, a, IPC2221.kExternal)).toBeCloseTo(20, 9);
  });

  it('invalid inputs do not give finite widths', () => {
    expect(Number.isFinite(areaMil2(-1, 10, 0.048))).toBe(false);
    expect(Number.isFinite(areaMil2(1, 0, 0.048))).toBe(false);
  });

  it('warnings', () => {
    const w = ipc2221Warnings({ currentA: 40, dTC: 5, thicknessMm: MM_PER_OZ * 4, lengthMm: 1, ambientC: 25 }, 500);
    expect(w.length).toBe(4);
  });
});
