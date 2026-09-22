// Heat spreading in a copper pour around a hot component, cooled by natural convection and
// radiation. The pour is modelled as an annular fin (inner radius = source, outer radius = pour,
// both as equal-area circles) with an adiabatic rim, solved exactly with modified Bessel functions
// (Incropera & DeWitt, Fundamentals of Heat and Mass Transfer, §3.6.4). Several copper layers tied
// together by thermal vias add their sheet conductance.

/* ---------------- modified Bessel functions (Abramowitz & Stegun 9.8.1–9.8.8, |ε| < 2·10⁻⁷) ---------------- */

export function besselI0(x: number): number {
  const ax = Math.abs(x);
  if (ax < 3.75) {
    const y = (x / 3.75) ** 2;
    return 1 + y * (3.5156229 + y * (3.0899424 + y * (1.2067492 + y * (0.2659732 + y * (0.0360768 + y * 0.0045813)))));
  }
  const y = 3.75 / ax;
  return (Math.exp(ax) / Math.sqrt(ax)) * (0.39894228 + y * (0.01328592 + y * (0.00225319 + y * (-0.00157565 + y * (0.00916281 + y * (-0.02057706 + y * (0.02635537 + y * (-0.01647633 + y * 0.00392377))))))));
}

export function besselI1(x: number): number {
  const ax = Math.abs(x);
  let r: number;
  if (ax < 3.75) {
    const y = (x / 3.75) ** 2;
    r = ax * (0.5 + y * (0.87890594 + y * (0.51498869 + y * (0.15084934 + y * (0.02658733 + y * (0.00301532 + y * 0.00032411))))));
  } else {
    const y = 3.75 / ax;
    r = (Math.exp(ax) / Math.sqrt(ax)) * (0.39894228 + y * (-0.03988024 + y * (-0.00362018 + y * (0.00163801 + y * (-0.01031555 + y * (0.02282967 + y * (-0.02895312 + y * (0.01787654 - y * 0.00420059))))))));
  }
  return x < 0 ? -r : r;
}

export function besselK0(x: number): number {
  if (x <= 2) {
    const y = (x * x) / 4;
    return -Math.log(x / 2) * besselI0(x) + (-0.57721566 + y * (0.4227842 + y * (0.23069756 + y * (0.0348859 + y * (0.00262698 + y * (0.0001075 + y * 0.0000074))))));
  }
  const y = 2 / x;
  return (Math.exp(-x) / Math.sqrt(x)) * (1.25331414 + y * (-0.07832358 + y * (0.02189568 + y * (-0.01062446 + y * (0.00587872 + y * (-0.0025154 + y * 0.00053208))))));
}

export function besselK1(x: number): number {
  if (x <= 2) {
    const y = (x * x) / 4;
    return Math.log(x / 2) * besselI1(x) + (1 / x) * (1 + y * (0.15443144 + y * (-0.67278579 + y * (-0.18156897 + y * (-0.01919402 + y * (-0.00110404 - y * 0.00004686))))));
  }
  const y = 2 / x;
  return (Math.exp(-x) / Math.sqrt(x)) * (1.25331414 + y * (0.23498619 + y * (-0.0365562 + y * (0.01504268 + y * (-0.00780353 + y * (0.00325614 - y * 0.00068245))))));
}

/**
 * Efficiency of an annular fin of inner radius r1, outer r2 (m) with an adiabatic rim, fin parameter
 * m = √(h_total / (k·t)) where h_total is the heat-transfer coefficient summed over both faces.
 * Scaled Bessel products keep it finite for large m·r.
 */
export function annularFinEfficiency(r1: number, r2: number, m: number): number {
  if (r2 <= r1) return 1;
  const a = m * r1;
  const b = m * r2;
  if (b > 600) {
    // exp overflow: for large arguments I_n(x) ~ eˣ/√(2πx), K_n(x) ~ √(π/2x)·e⁻ˣ, so the Bessel ratio → tanh(b − a)
    return ((2 * r1) / (m * (r2 * r2 - r1 * r1))) * Math.tanh(b - a);
  }
  const num = besselK1(a) * besselI1(b) - besselI1(a) * besselK1(b);
  const den = besselI0(a) * besselK1(b) + besselK0(a) * besselI1(b);
  return ((2 * r1) / (m * (r2 * r2 - r1 * r1))) * (num / den);
}

/* ---------------- air properties and natural convection ---------------- */

/** Air at 1 atm, Incropera Table A.4: T (K), k (W/m·K), ν (m²/s), α (m²/s). */
const AIR: [number, number, number, number][] = [
  [250, 22.3e-3, 11.44e-6, 15.9e-6],
  [300, 26.3e-3, 15.89e-6, 22.5e-6],
  [350, 30.0e-3, 20.92e-6, 29.9e-6],
  [400, 33.8e-3, 26.41e-6, 38.3e-6],
  [450, 37.3e-3, 32.39e-6, 47.2e-6],
];

export function airProps(tK: number) {
  const t = Math.min(Math.max(tK, AIR[0][0]), AIR[AIR.length - 1][0]);
  let i = 0;
  while (i < AIR.length - 2 && t > AIR[i + 1][0]) i++;
  const [t0, k0, n0, a0] = AIR[i];
  const [t1, k1, n1, a1] = AIR[i + 1];
  const f = (t - t0) / (t1 - t0);
  return { k: k0 + f * (k1 - k0), nu: n0 + f * (n1 - n0), alpha: a0 + f * (a1 - a0) };
}

const G = 9.81;
export const SIGMA = 5.670374419e-8;

export type Orientation = 'horizontal' | 'vertical';

/**
 * Natural-convection coefficient (W/m²·K) for a square plate of side L (m), averaged over the two
 * faces: horizontal = hot upper face (0.54·Ra^¼ / 0.15·Ra^⅓) and hot lower face (0.52·Ra^⅕), with
 * L* = area/perimeter; vertical = Churchill–Chu on each face with L = height.
 */
export function naturalConvection(side: number, dT: number, taC: number, orient: Orientation): { top: number; bottom: number } {
  if (!(dT > 0)) return { top: 0, bottom: 0 };
  const tf = taC + 273.15 + dT / 2;
  const { k, nu, alpha } = airProps(tf);
  const beta = 1 / tf;
  if (orient === 'vertical') {
    const ra = (G * beta * dT * side ** 3) / (nu * alpha);
    const pr = nu / alpha;
    const nuL = (0.825 + (0.387 * ra ** (1 / 6)) / (1 + (0.492 / pr) ** (9 / 16)) ** (8 / 27)) ** 2;
    const h = (nuL * k) / side;
    return { top: h, bottom: h };
  }
  const lc = side / 4; // area / perimeter of a square
  const ra = (G * beta * dT * lc ** 3) / (nu * alpha);
  const nuUp = ra < 1e7 ? 0.54 * ra ** 0.25 : 0.15 * ra ** (1 / 3);
  const nuDown = 0.52 * ra ** 0.2;
  return { top: (nuUp * k) / lc, bottom: (nuDown * k) / lc };
}

/** Linearised radiation coefficient εσ(Ts² + Ta²)(Ts + Ta). */
export function radiationH(emissivity: number, tsC: number, taC: number): number {
  const ts = tsC + 273.15;
  const ta = taC + 273.15;
  return emissivity * SIGMA * (ts * ts + ta * ta) * (ts + ta);
}

/* ---------------- the spreading problem ---------------- */

export interface SpreadInput {
  power: number; // W
  taC: number; // ambient
  sourceSide: number; // m, side of the square hot footprint (exposed pad / package)
  pourSide: number; // m, side of the square copper pour (≥ source)
  copperT: number; // m, thickness of one copper layer
  layers: number; // copper layers tied together by thermal vias
  kCu: number; // W/m·K
  emissivity: number; // board surface (solder mask ≈ 0.9)
  orient: Orientation;
  hForced?: number; // W/m²·K per face; replaces natural convection when given
}

export interface SpreadResult {
  theta: number; // °C/W, footprint to ambient
  tBoard: number; // °C at the footprint
  efficiency: number;
  hConv: number; // average convective h per face
  hRad: number;
  m: number;
  iterations: number;
}

/** Thermal resistance (°C/W) from the source footprint to ambient for fixed per-face h (W/m²·K). */
export function spreadResistance(sourceSide: number, pourSide: number, kt: number, hFaces: number): { theta: number; eta: number; m: number } {
  const r1 = sourceSide / Math.sqrt(Math.PI);
  const r2 = Math.max(pourSide, sourceSide) / Math.sqrt(Math.PI);
  const m = Math.sqrt(hFaces / kt);
  const eta = annularFinEfficiency(r1, r2, m);
  // the footprint itself also sheds heat from both faces, in parallel with the fin
  const g = hFaces * Math.PI * r1 * r1 + eta * hFaces * Math.PI * (r2 * r2 - r1 * r1);
  return { theta: 1 / g, eta, m };
}

export function spread(x: SpreadInput): SpreadResult {
  const kt = x.kCu * x.copperT * x.layers;
  let dT = 20;
  let res = { theta: NaN, eta: 1, m: 0 };
  let hc = 0;
  let hr = 0;
  let it = 0;
  for (; it < 100; it++) {
    // mean surface excess of the fin area ≈ η·ΔT at the base
    const dMean = Math.max(dT * res.eta, 0.01);
    if (x.hForced && x.hForced > 0) hc = x.hForced;
    else {
      const n = naturalConvection(x.pourSide, dMean, x.taC, x.orient);
      hc = (n.top + n.bottom) / 2;
    }
    hr = radiationH(x.emissivity, x.taC + dMean, x.taC);
    res = spreadResistance(x.sourceSide, x.pourSide, kt, 2 * (hc + hr));
    const next = x.power * res.theta;
    if (Math.abs(next - dT) < 1e-6 * Math.max(1, next)) {
      dT = next;
      break;
    }
    dT = 0.5 * dT + 0.5 * next;
  }
  return { theta: res.theta, tBoard: x.taC + dT, efficiency: res.eta, hConv: hc, hRad: hr, m: res.m, iterations: it + 1 };
}
