// Via electrical and thermal properties.
import { K_CU, rhoCu } from './copper';
import { currentFor, IPC2221 } from './ipc2221';
import { MM_PER_MIL } from './units';

export interface ViaInput {
  holeMm: number; // finished hole diameter
  platingMm: number; // barrel plating thickness
  lengthMm: number; // via length (usually board thickness)
  padMm: number; // pad diameter
  antipadMm: number; // plane clearance (antipad) diameter
  er: number;
  dTC: number; // allowed temperature rise
  ambientC: number;
  z0: number; // impedance of the line the via sits in
}

/** First-pass count for identical vias assumed to share current equally. */
export function parallelViaCount(targetA: number, capacityPerViaA: number): number {
  return Math.ceil(targetA / capacityPerViaA);
}

export function via(i: ViaInput) {
  const dOut = i.holeMm + 2 * i.platingMm;
  const areaMm2 = (Math.PI / 4) * (dOut * dOut - i.holeMm * i.holeMm);
  const areaMil2 = areaMm2 / (MM_PER_MIL * MM_PER_MIL);
  const tempC = i.ambientC + i.dTC;
  const resistance = (rhoCu(tempC) * i.lengthMm * 1e-3) / (areaMm2 * 1e-6);
  // IPC-2221 applied to the barrel cross-section (external-layer constant).
  const currentExt = currentFor(areaMil2, i.dTC, IPC2221.kExternal);
  const currentInt = currentFor(areaMil2, i.dTC, IPC2221.kInternal);
  const thermalRes = (i.lengthMm * 1e-3) / (K_CU * areaMm2 * 1e-6); // K/W

  // H. Johnson, High-Speed Digital Design: dimensions in inches.
  const T = i.lengthMm / 25.4;
  const D1 = i.padMm / 25.4;
  const D2 = i.antipadMm / 25.4;
  const d = dOut / 25.4;
  const capPf = D2 > D1 ? (1.41 * i.er * T * D1) / (D2 - D1) : NaN;
  const indNh = 5.08 * T * (Math.log((4 * T) / d) + 1);
  const zVia = Math.sqrt((indNh * 1e-9) / (capPf * 1e-12));
  const delayPs = Math.sqrt(indNh * 1e-9 * capPf * 1e-12) * 1e12;
  const riseDegradationPs = 2.2 * capPf * 1e-12 * (i.z0 / 2) * 1e12;

  return {
    barrelOuterMm: dOut,
    areaMm2,
    areaMil2,
    resistance,
    currentExt,
    currentInt,
    voltageDropAtCurrent: currentExt * resistance,
    powerAtCurrent: currentExt * currentExt * resistance,
    thermalRes,
    capPf,
    indNh,
    zVia,
    delayPs,
    riseDegradationPs,
    aspectRatio: i.lengthMm / i.holeMm,
    resonanceGHz: 1 / (2 * Math.PI * Math.sqrt(indNh * 1e-9 * capPf * 1e-12)) / 1e9,
  };
}
