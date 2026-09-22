// Thermal calculations: junction temperature and thermal via arrays.
import { K_CU } from './copper';

export interface JunctionInput {
  powerW: number;
  ambientC: number;
  mode: 'ja' | 'chain';
  thetaJA: number; // °C/W
  thetaJC: number;
  thetaCS: number; // case to sink (interface material)
  thetaSA: number; // sink to ambient
  tjMaxC: number;
}

export function junction(i: JunctionInput) {
  const theta = i.mode === 'ja' ? i.thetaJA : i.thetaJC + i.thetaCS + i.thetaSA;
  const tj = i.ambientC + i.powerW * theta;
  const maxPower = (i.tjMaxC - i.ambientC) / theta;
  const nodes =
    i.mode === 'chain'
      ? {
          case: tj - i.powerW * i.thetaJC,
          sink: tj - i.powerW * (i.thetaJC + i.thetaCS),
        }
      : null;
  // heatsink needed to hit Tj,max with the given θJC and θCS
  const thetaSARequired = i.mode === 'chain' ? (i.tjMaxC - i.ambientC) / i.powerW - i.thetaJC - i.thetaCS : NaN;
  return { theta, tj, maxPower, margin: i.tjMaxC - tj, nodes, thetaSARequired };
}

/** Thermal conductivity presets for via fill, W/(m·K). */
export const FILLS = {
  none: { k: 0, label: 'Open (air)' },
  epoxy: { k: 0.25, label: 'Non-conductive epoxy' },
  conductive: { k: 3.5, label: 'Conductive (silver) epoxy' },
  copper: { k: K_CU, label: 'Copper-filled' },
} as const;
export type Fill = keyof typeof FILLS;

export interface ViaArrayInput {
  count: number;
  holeMm: number;
  platingMm: number;
  lengthMm: number;
  fillK: number; // W/(m·K)
  padAreaMm2: number; // copper pad area under the part (for laminate conduction)
  kLaminate: number; // through-plane conductivity of the laminate, W/(m·K)
  powerW: number;
}

export function viaArray(i: ViaArrayInput) {
  const L = i.lengthMm * 1e-3;
  const dOut = i.holeMm + 2 * i.platingMm;
  const aBarrel = (Math.PI / 4) * (dOut * dOut - i.holeMm * i.holeMm) * 1e-6; // m²
  const aHole = (Math.PI / 4) * i.holeMm * i.holeMm * 1e-6;
  const gBarrel = (K_CU * aBarrel) / L; // W/K per via
  const gFill = (i.fillK * aHole) / L;
  const gVia = gBarrel + gFill;
  const aVias = i.count * (Math.PI / 4) * dOut * dOut * 1e-6;
  const aLam = Math.max(0, i.padAreaMm2 * 1e-6 - aVias);
  const gLam = (i.kLaminate * aLam) / L;
  const gTotal = i.count * gVia + gLam;
  return {
    rVia: 1 / gVia,
    rBarrel: 1 / gBarrel,
    rArray: 1 / (i.count * gVia),
    rLaminate: gLam > 0 ? 1 / gLam : Infinity,
    rTotal: 1 / gTotal,
    deltaT: i.powerW / gTotal,
    viaShare: (i.count * gVia) / gTotal,
    viaAreaFraction: i.padAreaMm2 > 0 ? aVias / (i.padAreaMm2 * 1e-6) : NaN,
  };
}
