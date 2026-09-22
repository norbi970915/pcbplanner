// Power-supply design equations: buck and boost power stages in continuous conduction
// (TI SLVA477B and SLVA372D, B. Hauke), LDO dissipation and feedback dividers.
// SI units throughout: V, A, H, F, Hz, Ω, W.
import { dividerPairs, type ESeries } from './electronics';

export interface BuckInput {
  vinMin: number;
  vinNom: number;
  vinMax: number;
  vout: number;
  iout: number; // maximum output current
  fs: number; // minimum switching frequency
  eff: number; // estimated efficiency 0…1
  rippleRatio: number; // ΔIL / Iout for the inductor estimate (TI: 0.2…0.4)
  l?: number; // inductor used; undefined → the calculated value
  dvout: number; // allowed output ripple (capacitive part)
  esr: number; // output capacitor ESR
  ilim?: number; // minimum switch current limit of the IC
  dvin: number; // allowed input ripple
  vf?: number; // rectifier diode forward voltage (non-synchronous only)
}

export function buck(b: BuckInput) {
  // SLVA477B eq. 1: duty cycle at the maximum input voltage (maximum switch current)
  const dMaxVin = b.vout / (b.vinMax * b.eff);
  const dMinVin = b.vout / (b.vinMin * b.eff);
  const dNom = b.vout / (b.vinNom * b.eff);
  // eq. 5 and 6: inductor for an estimated ripple at the typical input voltage
  const dIlEst = b.rippleRatio * b.iout;
  const lCalc = (b.vout * (b.vinNom - b.vout)) / (dIlEst * b.fs * b.vinNom);
  const l = b.l && b.l > 0 ? b.l : lCalc;
  // eq. 2: ripple with the chosen inductor at the maximum input voltage (worst case)
  const dIl = ((b.vinMax - b.vout) * dMaxVin) / (b.fs * l);
  // eq. 3 and 4
  const iMaxOut = b.ilim !== undefined && b.ilim > 0 ? b.ilim - dIl / 2 : undefined;
  const iSwMax = dIl / 2 + b.iout;
  const ilRms = Math.sqrt(b.iout * b.iout + (dIl * dIl) / 12);
  // eq. 12 and 13
  const coutMin = dIl / (8 * b.fs * b.dvout);
  const dvEsr = b.esr * dIl;
  // input capacitor: charge balance and RMS current (worst case D = 0.5 if reachable)
  const dCin = Math.min(Math.max(dMinVin, dMaxVin), 1);
  const dWorst = dMaxVin <= 0.5 && dMinVin >= 0.5 ? 0.5 : Math.abs(dMaxVin - 0.5) < Math.abs(dMinVin - 0.5) ? dMaxVin : dMinVin;
  const cinMin = (b.iout * dWorst * (1 - dWorst)) / (b.fs * b.dvin);
  const icinRms = b.iout * Math.sqrt(dWorst * (1 - dWorst));
  // eq. 7 and 8: non-synchronous rectifier (at maximum input, longest off time)
  const iDiode = b.iout * (1 - dMaxVin);
  const pDiode = b.vf !== undefined && b.vf > 0 ? iDiode * b.vf : undefined;
  return { dMaxVin, dMinVin, dNom, lCalc, l, dIl, iMaxOut, iSwMax, ilRms, coutMin, dvEsr, cinMin, icinRms, dCin, iDiode, pDiode };
}

export interface BoostInput {
  vinMin: number;
  vinNom: number;
  vout: number;
  iout: number;
  fs: number;
  eff: number;
  rippleRatio: number; // TI: ΔIL = (0.2…0.4) · Iout · Vout/Vin
  l?: number;
  dvout: number;
  esr: number;
  ilim?: number;
  vf?: number;
}

export function boost(b: BoostInput) {
  // SLVA372D eq. 1: duty cycle at the minimum input voltage
  const d = 1 - (b.vinMin * b.eff) / b.vout;
  const dNom = 1 - (b.vinNom * b.eff) / b.vout;
  // eq. 5 and 6
  const dIlEst = b.rippleRatio * b.iout * (b.vout / b.vinNom);
  const lCalc = (b.vinNom * (b.vout - b.vinNom)) / (dIlEst * b.fs * b.vout);
  const l = b.l && b.l > 0 ? b.l : lCalc;
  // eq. 2, 3, 4
  const dIl = (b.vinMin * d) / (b.fs * l);
  const iMaxOut = b.ilim !== undefined && b.ilim > 0 ? (b.ilim - dIl / 2) * (1 - d) : undefined;
  const iSwMax = dIl / 2 + b.iout / (1 - d);
  const ilAvg = b.iout / (1 - d);
  const ilRms = Math.sqrt(ilAvg * ilAvg + (dIl * dIl) / 12);
  // eq. 12 and 13
  const coutMin = (b.iout * d) / (b.fs * b.dvout);
  const dvEsr = b.esr * (b.iout / (1 - d) + dIl / 2);
  // eq. 7 and 8
  const iDiode = b.iout;
  const pDiode = b.vf !== undefined && b.vf > 0 ? iDiode * b.vf : undefined;
  return { d, dNom, lCalc, l, dIl, iMaxOut, iSwMax, ilAvg, ilRms, coutMin, dvEsr, iDiode, pDiode };
}

export interface LdoInput {
  vin: number;
  vout: number;
  iout: number;
  iq: number; // ground (quiescent) current
  thetaJA: number; // °C/W
  ta: number; // ambient, °C
  tjMax: number;
  vDropout: number;
}

export function ldo(x: LdoInput) {
  const pd = (x.vin - x.vout) * x.iout + x.vin * x.iq;
  const tj = x.ta + pd * x.thetaJA;
  const efficiency = (x.vout * x.iout) / (x.vin * (x.iout + x.iq));
  const headroom = x.vin - x.vout;
  // largest load current that keeps Tj ≤ Tj,max
  const pMax = (x.tjMax - x.ta) / x.thetaJA;
  const ioutMax = headroom > 0 ? (pMax - x.vin * x.iq) / headroom : Infinity;
  // θJA needed to meet Tj,max at this load
  const thetaNeeded = pd > 0 ? (x.tjMax - x.ta) / pd : Infinity;
  return { pd, tj, efficiency, headroom, dropoutOk: headroom >= x.vDropout, pMax, ioutMax, thetaNeeded };
}

export interface FeedbackPair {
  r1: number; // FB pin to Vout
  r2: number; // FB pin to GND
  vout: number; // including the FB bias current
  error: number; // relative to the target
  iDivider: number;
}

/**
 * Standard-value feedback dividers for Vout = VFB·(1 + R1/R2) + IFB·R1, with the divider current near
 * `iDiv` (TI: at least 100 × IFB). IFB is the current flowing out of the divider into the FB pin.
 */
export function feedbackPairs(vfb: number, vout: number, iDiv: number, series: ESeries, ifb = 0, count = 10): FeedbackPair[] {
  const ratio = vfb / vout; // R2/(R1+R2)
  const rTotal = vout / iDiv;
  return dividerPairs(ratio, rTotal, series, count * 3)
    .map(({ r1, r2 }) => {
      const v = vfb * (1 + r1 / r2) + ifb * r1;
      return { r1, r2, vout: v, error: v / vout - 1, iDivider: vfb / r2 };
    })
    .sort((a, b) => Math.abs(a.error) - Math.abs(b.error))
    .slice(0, count);
}
