// Closed-form transmission-line formulas, used for instant estimates and as a
// cross-check against the field solver.
import { ETA0 } from './units';

// ---------- Hammerstad & Jensen (1980) microstrip, with thickness correction ----------
function hjZ01(u: number): number {
  const f = 6 + (2 * Math.PI - 6) * Math.exp(-Math.pow(30.666 / u, 0.7528));
  return (ETA0 / (2 * Math.PI)) * Math.log(f / u + Math.sqrt(1 + 4 / (u * u)));
}
function hjEeff(u: number, er: number): number {
  const a =
    1 +
    Math.log((u ** 4 + (u / 52) ** 2) / (u ** 4 + 0.432)) / 49 +
    Math.log(1 + (u / 18.1) ** 3) / 18.7;
  const b = 0.564 * Math.pow((er - 0.9) / (er + 3), 0.053);
  return (er + 1) / 2 + ((er - 1) / 2) * Math.pow(1 + 10 / u, -a * b);
}

/** Surface microstrip (no soldermask). w, h, t in any consistent unit. */
export function microstripHJ(w: number, h: number, t: number, er: number) {
  const u = w / h;
  let u1 = u;
  let ur = u;
  if (t > 0) {
    const th = t / h;
    const coth = 1 / Math.tanh(Math.sqrt(6.517 * u));
    const du1 = (th / Math.PI) * Math.log(1 + (4 * Math.E) / (th * coth * coth));
    const dur = 0.5 * (1 + 1 / Math.cosh(Math.sqrt(er - 1))) * du1;
    u1 = u + du1;
    ur = u + dur;
  }
  const eR = hjEeff(ur, er);
  const z0 = hjZ01(ur) / Math.sqrt(eR);
  const eeff = eR * (hjZ01(u1) / hjZ01(ur)) ** 2;
  return { z0, eeff };
}

// ---------- Wheeler (1978) symmetric stripline, with thickness ----------
/** Symmetric stripline: trace centred between planes `b` apart. */
export function striplineWheeler(w: number, b: number, t: number, er: number) {
  let m: number;
  if (t > 0) {
    const x = t / b;
    const n = 2 / (1 + (2 / 3) * (x / (1 - x)));
    const dW =
      (x / (Math.PI * (1 - x))) *
      (1 - 0.5 * Math.log((x / (2 - x)) ** 2 + Math.pow((0.0796 * x) / (w / b + 1.1 * x), n)));
    m = w / (b - t) + dW;
  } else {
    m = w / b;
  }
  const A = 8 / (Math.PI * m);
  const z0 = (30 / Math.sqrt(er)) * Math.log(1 + (4 / (Math.PI * m)) * (A + Math.sqrt(A * A + 6.27)));
  return { z0, eeff: er };
}

/**
 * Asymmetric (offset) stripline: h1 = plane to trace bottom, h2 = trace top to plane.
 * Parallel combination of two symmetric striplines — a common engineering approximation.
 */
export function striplineAsym(w: number, h1: number, h2: number, t: number, er: number) {
  const z1 = striplineWheeler(w, 2 * h1 + t, t, er).z0;
  const z2 = striplineWheeler(w, 2 * h2 + t, t, er).z0;
  return { z0: (2 * z1 * z2) / (z1 + z2), eeff: er };
}
