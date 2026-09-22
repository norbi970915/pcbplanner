// IPC-2221 conductor sizing: I = k · ΔT^0.44 · A^0.725 (A in mil², ΔT in °C).
import { rhoCu } from './copper';
import { MM_PER_MIL } from './units';

export const IPC2221 = { kExternal: 0.048, kInternal: 0.024, b: 0.44, c: 0.725 } as const;
const MM2_PER_MIL2 = MM_PER_MIL * MM_PER_MIL;

/** Cross-section (mil²) needed to carry `currentA` with a rise of `dTC` °C. */
export function areaMil2(currentA: number, dTC: number, k: number): number {
  return Math.pow(currentA / (k * Math.pow(dTC, IPC2221.b)), 1 / IPC2221.c);
}

/** Current (A) a cross-section of `aMil2` mil² carries for a rise of `dTC` °C. */
export function currentFor(aMil2: number, dTC: number, k: number): number {
  return k * Math.pow(dTC, IPC2221.b) * Math.pow(aMil2, IPC2221.c);
}

export interface TraceInput {
  currentA: number;
  dTC: number;
  thicknessMm: number;
  lengthMm: number;
  ambientC: number;
}

export interface LayerResult {
  areaMm2: number;
  areaMil2: number;
  widthMm: number;
  widthMil: number;
  resistance: number;
  voltageDrop: number;
  power: number;
  currentDensity: number; // A/mm²
}

function layer(k: number, i: TraceInput): LayerResult {
  const aMil2 = areaMil2(i.currentA, i.dTC, k);
  const areaMm2 = aMil2 * MM2_PER_MIL2;
  const widthMm = areaMm2 / i.thicknessMm;
  const tempC = i.ambientC + i.dTC;
  const resistance = (rhoCu(tempC) * (i.lengthMm * 1e-3)) / (areaMm2 * 1e-6);
  return {
    areaMm2,
    areaMil2: aMil2,
    widthMm,
    widthMil: widthMm / MM_PER_MIL,
    resistance,
    voltageDrop: i.currentA * resistance,
    power: i.currentA * i.currentA * resistance,
    currentDensity: i.currentA / areaMm2,
  };
}

export function traceWidth(i: TraceInput) {
  return {
    external: layer(IPC2221.kExternal, i),
    internal: layer(IPC2221.kInternal, i),
    conductorTempC: i.ambientC + i.dTC,
  };
}

/** Notes when inputs fall outside the range the IPC-2221 charts cover. */
export function ipc2221Warnings(i: TraceInput, widthMil: number): string[] {
  const w: string[] = [];
  const oz = i.thicknessMm / (1.378 * MM_PER_MIL);
  if (i.currentA > 35) w.push('Current is above 35 A, beyond the IPC-2221 chart data.');
  if (widthMil > 400) w.push('Width is over 400 mil (10.2 mm), outside the charts — a pour or plane is usually better.');
  if (i.dTC < 10 || i.dTC > 100) w.push('Temperature rise outside 10–100 °C; the curve fit is extrapolated.');
  if (oz < 0.5 || oz > 3) w.push('Copper weight outside the 0.5–3 oz range of the charts.');
  if (i.ambientC + i.dTC > 105) w.push('Conductor temperature above 105 °C — check the laminate Tg and nearby parts.');
  return w;
}
