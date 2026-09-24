import { eValuesInRange, type ESeries } from './electronics';

export type I2cMode = 'standard' | 'fast' | 'fastPlus';

export const I2C_LIMITS: Record<I2cMode, { label: string; minRiseNs: number; riseNs: number; busPf: number; frequencyKhz: number }> = {
  standard: { label: 'Standard-mode', minRiseNs: 0, riseNs: 1000, busPf: 400, frequencyKhz: 100 },
  fast: { label: 'Fast-mode', minRiseNs: 20, riseNs: 300, busPf: 400, frequencyKhz: 400 },
  fastPlus: { label: 'Fast-mode Plus', minRiseNs: 0, riseNs: 120, busPf: 550, frequencyKhz: 1000 },
};

/** Independent calculation for one open-drain SDA or SCL line. */
export function i2cPullup(vdd: number, capacitancePf: number, vol: number, sinkMa: number, mode: I2cMode, series: ESeries, tolerancePct = 0) {
  const limits = I2C_LIMITS[mode];
  if (!(vdd > vol && vol >= 0 && capacitancePf > 0 && sinkMa > 0 && tolerancePct >= 0 && tolerancePct < 100)) return null;
  const sinkMin = (vdd - vol) / (sinkMa * 1e-3);
  const riseMin = limits.minRiseNs * 1e-9 / (0.8473 * capacitancePf * 1e-12);
  const min = Math.max(sinkMin, riseMin);
  const max = (limits.riseNs * 1e-9) / (0.8473 * capacitancePf * 1e-12);
  const tolerance = tolerancePct / 100;
  const minNominal = min / (1 - tolerance);
  const maxNominal = max / (1 + tolerance);
  const options = minNominal <= maxNominal ? eValuesInRange(minNominal * (1 - 1e-12), maxNominal * (1 + 1e-12), series) : [];
  const suggested = options[Math.floor(options.length / 2)] ?? null;
  const evaluate = (resistance: number) => ({
    riseNs: 0.8473 * resistance * capacitancePf * 1e-3,
    sinkMa: (vdd - vol) / resistance * 1e3,
    fastestRiseNs: 0.8473 * resistance * (1 - tolerance) * capacitancePf * 1e-3,
    worstRiseNs: 0.8473 * resistance * (1 + tolerance) * capacitancePf * 1e-3,
    worstSinkMa: (vdd - vol) / (resistance * (1 - tolerance)) * 1e3,
    maximumLowMw: vdd ** 2 / (resistance * (1 - tolerance)) * 1e3,
  });
  return { min, max, sinkMin, riseMin, minNominal, maxNominal, options, suggested, evaluate, busCapExceeded: capacitancePf > limits.busPf };
}

export type TerminationKind = 'source' | 'parallel' | 'differential';

/** Ideal resistive line match. Driver output resistance is per line for differential source termination. */
export function termination(z0: number, driverOhms: number, kind: TerminationKind, chosenOhms: number, swingV: number) {
  if (!(z0 > 0 && driverOhms >= 0 && chosenOhms >= 0 && swingV > 0) || (kind !== 'source' && chosenOhms === 0)) return null;
  if (kind === 'source') {
    const ideal = Math.max(0, z0 - driverOhms);
    const gamma = (driverOhms + chosenOhms - z0) / (driverOhms + chosenOhms + z0);
    const stepCurrent = swingV / (driverOhms + chosenOhms + z0);
    // A high-impedance receiver reflects the initial edge; current and power here are initial-step peaks.
    return { ideal, gamma, current: stepCurrent, resistorWatts: stepCurrent ** 2 * chosenOhms, powerLabel: 'Initial-step peak' };
  }
  const ideal = z0;
  const gamma = (chosenOhms - z0) / (chosenOhms + z0);
  const resistorWatts = swingV ** 2 / chosenOhms;
  return { ideal, gamma, current: swingV / chosenOhms, resistorWatts, powerLabel: 'Continuous worst case' };
}

/** The burden voltage is a hard limit at maximum current; offset is an input-referred amplifier limit. */
export function shuntSelection(maxA: number, minA: number, maxDropMv: number, chosenMilliOhms: number, tolerancePct: number, tcrPpm: number, deltaC: number, offsetUv: number) {
  if (!(maxA > 0 && minA >= 0 && minA <= maxA && maxDropMv > 0 && chosenMilliOhms > 0 && tolerancePct >= 0 && tcrPpm >= 0 && deltaC >= 0 && offsetUv >= 0)) return null;
  const resistance = chosenMilliOhms * 1e-3;
  const idealMaxMilliOhms = maxDropMv / maxA;
  const resistorErrorPct = tolerancePct + tcrPpm * deltaC / 1e4;
  const highFactor = 1 + resistorErrorPct / 100;
  const dropMv = maxA * chosenMilliOhms;
  const worstDropMv = dropMv * highFactor;
  const watts = maxA ** 2 * resistance;
  const worstWatts = watts * highFactor;
  const signalMinMv = minA * chosenMilliOhms;
  const offsetErrorPct = minA > 0 ? offsetUv / (10 * signalMinMv) : null;
  return { idealMaxMilliOhms, dropMv, worstDropMv, watts, worstWatts, signalMinMv, offsetErrorPct, resistorErrorPct, worstErrorPct: offsetErrorPct === null ? null : resistorErrorPct + offsetErrorPct, dropExceeded: worstDropMv > maxDropMv };
}
