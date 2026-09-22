// Round wire (AWG) properties, resistance and voltage drop.

export type Metal = 'copper' | 'aluminium';
/** Resistivity at 20 °C (Ω·m) and temperature coefficient (1/°C). Copper: IEC 60028 annealed; aluminium: IEC 60889 hard-drawn (61 % IACS). */
export const METALS: Record<Metal, { rho20: number; alpha: number; preeceK: number; label: string }> = {
  copper: { rho20: 1.7241e-8, alpha: 0.00393, preeceK: 10244, label: 'Copper (annealed)' },
  aluminium: { rho20: 2.8264e-8, alpha: 0.00403, preeceK: 7585, label: 'Aluminium' },
};

/** Gauge labels and their numeric index n (0000 → −3 … 40). */
export const GAUGES: { label: string; n: number }[] = [
  { label: '0000 (4/0)', n: -3 },
  { label: '000 (3/0)', n: -2 },
  { label: '00 (2/0)', n: -1 },
  { label: '0 (1/0)', n: 0 },
  ...Array.from({ length: 40 }, (_, i) => ({ label: String(i + 1), n: i + 1 })),
];

/** ASTM B258 diameter: d = 0.005 in · 92^((36 − n)/39). Returns mm. */
export const awgDiameterMm = (n: number) => 0.005 * Math.pow(92, (36 - n) / 39) * 25.4;
export const awgAreaMm2 = (n: number) => (Math.PI / 4) * awgDiameterMm(n) ** 2;

export function resistancePerM(areaMm2: number, metal: Metal, tempC: number) {
  const m = METALS[metal];
  return (m.rho20 * (1 + m.alpha * (tempC - 20))) / (areaMm2 * 1e-6);
}

export interface DropInput {
  n: number;
  metal: Metal;
  lengthM: number; // one-way cable length
  roundTrip: boolean;
  currentA: number;
  supplyV: number;
  tempC: number;
}

export function voltageDrop(i: DropInput) {
  const area = awgAreaMm2(i.n);
  const rpm = resistancePerM(area, i.metal, i.tempC);
  const len = i.lengthM * (i.roundTrip ? 2 : 1);
  const R = rpm * len;
  const V = i.currentA * R;
  return {
    diameterMm: awgDiameterMm(i.n),
    areaMm2: area,
    rPerKm: rpm * 1000,
    R,
    V,
    dropPct: i.supplyV > 0 ? (100 * V) / i.supplyV : NaN,
    loadV: i.supplyV - V,
    power: i.currentA * i.currentA * R,
  };
}

/** Thinnest gauge (largest n) whose drop stays at or below maxPct. */
export function minimumGauge(i: Omit<DropInput, 'n'>, maxPct: number) {
  for (let k = GAUGES.length - 1; k >= 0; k--) {
    const g = GAUGES[k];
    if (voltageDrop({ ...i, n: g.n }).dropPct <= maxPct) return g;
  }
  return null;
}

/** Preece fusing current (in free air, long duration): I = K · d^1.5, d in inches. */
export const preeceFusing = (dMm: number, metal: Metal) => METALS[metal].preeceK * Math.pow(dMm / 25.4, 1.5);
