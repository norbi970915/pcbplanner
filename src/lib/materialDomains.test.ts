import { describe, expect, it } from 'vitest';
import { acResistance, copperTemperatureError, rhoCu } from './copper';
import { resistancePerM } from './wire';
import { buildTraceLossRequest, TRACE_LOSS_DEFAULTS } from './traceLossRequest';

describe('linear material model domains', () => {
  it.each([-250, -1000, NaN, Infinity, -Infinity])('rejects %s °C before producing nonpositive or nonfinite copper resistance', temp => {
    expect(() => rhoCu(temp)).toThrow(RangeError);
    expect(() => acResistance(100, .2, .035, 1e8, temp)).toThrow(RangeError);
    expect(copperTemperatureError(temp)).toMatch(/positive-resistivity/);
  });
  it.each(['copper', 'aluminium'] as const)('rejects nonphysical %s wire resistance', metal => {
    expect(() => resistancePerM(1, metal, -250)).toThrow(/positive-resistivity/);
    expect(resistancePerM(1, metal, -40)).toBeGreaterThan(0);
    expect(resistancePerM(1, metal, 125)).toBeGreaterThan(resistancePerM(1, metal, 20));
  });
  it('keeps normal cold and hot copper temperatures available', () => {
    for (const temp of [-40, 0, 20, 125]) {
      expect(copperTemperatureError(temp)).toBeNull();
      expect(acResistance(100, .2, .035, 1e8, temp).rac).toBeGreaterThan(0);
    }
    expect(rhoCu(120) / rhoCu(20)).toBeCloseTo(1.393, 10);
  });
  it('rejects invalid trace-loss temperatures before scheduling a field solve', () => {
    const request = buildTraceLossRequest({ ...TRACE_LOSS_DEFAULTS, temp: -250 });
    expect(request.req).toBeNull();
    expect(request.errors.join(' ')).toMatch(/positive-resistivity/);
  });
});
