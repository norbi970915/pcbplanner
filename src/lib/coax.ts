// Coaxial line with a circular centre conductor (diameter d) inside a circular outer conductor (inner diameter D),
// filled with a homogeneous dielectric εr, μr = 1. Lengths in any consistent unit unless stated (the tool uses mm).
//
// Concentric line, D. M. Pozar, Microwave Engineering, 4th ed., Wiley 2012, §2.2 and Table 2.1:
//   L' = μ0/(2π) ln(D/d), C' = 2π ε0 εr / ln(D/d), Z0 = η0/(2π√εr) ln(D/d).
// Offset (eccentric) centre conductor, centres a distance s apart: the capacitance of eccentric cylinders
// (K. T. McDonald, "An Off-Center 'Coaxial' Cable", Princeton 1999, eq. 14), with radii a = d/2, b = D/2:
//   C' = 2π ε / acosh((a² + b² − s²)/(2ab)) = 2π ε / acosh((D² + d² − 4s²)/(2Dd)),
// so Z0 = η0/(2π√εr) acosh((D² + d² − 4s²)/(2Dd)); at s = 0 acosh((D² + d²)/(2Dd)) = ln(D/d).
// TE11 cutoff (Pozar §3.5): kc ≈ 2/(a + b), fc = c kc / (2π√εr) = c / (π √εr (D + d)/2).
// Loss (Pozar §2.7, perturbation method for coax, and §3.1 for TEM dielectric loss):
//   αc = Rs/(2η ln(b/a)) (1/a + 1/b) Np/m, Rs = √(ω μ0 / 2σ); αd = k tanδ / 2 = π f √εr tanδ / c Np/m.
import { C0, ETA0 } from './units';

/** Vacuum permeability and permittivity consistent with the c and η0 in units.ts (CODATA 2018). */
export const MU0 = ETA0 / C0;
export const EPS0 = 1 / (ETA0 * C0);
/** Nepers to decibels, 20 log10(e). */
export const NP_TO_DB = 20 / Math.LN10;
/** Metres per foot (exact). */
export const M_PER_FT = 0.3048;

/** Argument of acosh for the eccentric line, (D² + d² − 4s²)/(2Dd); 1 when the conductors touch. */
export const eccArg = (D: number, d: number, s: number) => (D * D + d * d - 4 * s * s) / (2 * D * d);

/**
 * Geometry factor G with Z0 = η0 G / (2π√εr), C' = 2π ε0 εr / G, L' = μ0 G / (2π).
 * ln(D/d) for a concentric line; acosh of eccArg with an offset s.
 */
export function geometryFactor(D: number, d: number, s = 0): number {
  if (s === 0) return Math.log(D / d);
  // acosh(x) = ln(1 + u + √(u(u + 2))) with u = x − 1 = (D − d − 2s)(D − d + 2s)/(2Dd), formed without cancellation
  const u = ((D - d - 2 * s) * (D - d + 2 * s)) / (2 * D * d);
  return Math.log1p(u + Math.sqrt(u * (u + 2)));
}

/** Why a geometry cannot be used, or null. Diameters D (outer, inner surface) and d (centre), offset s ≥ 0. */
export function geometryError(D: number, d: number, s = 0): string | null {
  if (!(d > 0 && Number.isFinite(d))) return 'The centre conductor diameter d must be greater than 0.';
  if (!(D > 0 && Number.isFinite(D))) return 'The outer conductor inner diameter D must be greater than 0.';
  if (!(s >= 0 && Number.isFinite(s))) return 'The offset must be 0 or more.';
  if (!(D > d)) return 'D must be larger than d.';
  if (!(s < (D - d) / 2)) return 'The offset must be less than (D − d)/2; at (D − d)/2 the centre conductor touches the outer conductor.';
  return null;
}

export const z0FromG = (g: number, er: number) => (ETA0 * g) / (2 * Math.PI * Math.sqrt(er));
export const gFromZ0 = (z0: number, er: number) => (2 * Math.PI * Math.sqrt(er) * z0) / ETA0;

/** Characteristic impedance, Ω. */
export const coaxZ0 = (D: number, d: number, er: number, s = 0) => z0FromG(geometryFactor(D, d, s), er);

/**
 * Outer diameter D that gives z0 for centre conductor d and offset s.
 * Concentric: D = d e^G. Offset: the larger root of D² − 2dX·D + (d² − 4s²) = 0, X = cosh G.
 */
export function solveOuter(z0: number, d: number, er: number, s = 0): number {
  const g = gFromZ0(z0, er);
  if (s === 0) return d * Math.exp(g);
  const sh = Math.sinh(g); // x² − 1 = sinh² G
  return d * Math.cosh(g) + Math.sqrt(d * d * sh * sh + 4 * s * s);
}

/**
 * Centre conductor d that gives z0 inside D with offset s (requires 2s < D).
 * Concentric: d = D e^−G. Offset: the smaller root of d² − 2DX·d + (D² − 4s²) = 0, written without cancellation.
 */
export function solveInner(z0: number, D: number, er: number, s = 0): number {
  const g = gFromZ0(z0, er);
  if (s === 0) return D * Math.exp(-g);
  const sh = Math.sinh(g);
  // smaller root = (D² − 4s²) / (D x + √(D² sinh² G + 4s²))
  return (D * D - 4 * s * s) / (D * Math.cosh(g) + Math.sqrt(D * D * sh * sh + 4 * s * s));
}

export interface CoaxLine {
  z0: number;
  /** geometry factor ln(D/d) or acosh(…) */
  g: number;
  /** velocity factor v/c = 1/√εr */
  vf: number;
  /** delay, s/m */
  delay: number;
  /** capacitance, F/m */
  cPerM: number;
  /** external inductance, H/m */
  lPerM: number;
  /** TE11 cutoff of the concentric line, Hz (Pozar's kc ≈ 2/(a + b)) */
  te11: number;
}

/** Line constants. Diameters in mm. */
export function coaxLine(Dmm: number, dmm: number, er: number, smm = 0): CoaxLine {
  const g = geometryFactor(Dmm, dmm, smm);
  const meanRadiusM = ((Dmm + dmm) / 4) * 1e-3; // (a + b)/2
  return {
    z0: z0FromG(g, er),
    g,
    vf: 1 / Math.sqrt(er),
    delay: Math.sqrt(er) / C0,
    cPerM: (2 * Math.PI * EPS0 * er) / g,
    lPerM: (MU0 * g) / (2 * Math.PI),
    te11: C0 / (2 * Math.PI * Math.sqrt(er) * meanRadiusM), // c kc /(2π√εr), kc = 2/(a + b) = 1/meanRadius
  };
}

export interface CoaxLoss {
  /** skin depth, m */
  skin: number;
  /** surface resistance, Ω */
  rs: number;
  /** series resistance of both conductors, Ω/m */
  rPerM: number;
  /** conductor attenuation, Np/m */
  alphaC: number;
  /** dielectric attenuation, Np/m */
  alphaD: number;
}

/**
 * Attenuation of a concentric line at frequency f (Hz), both conductors smooth and of conductivity σ (S/m).
 * The dielectric term holds for any homogeneously filled TEM line; the conductor term needs δ ≪ d/2.
 */
export function coaxLoss(Dmm: number, dmm: number, er: number, tanD: number, sigma: number, f: number): CoaxLoss {
  const a = (dmm / 2) * 1e-3, b = (Dmm / 2) * 1e-3;
  const rs = Math.sqrt((Math.PI * f * MU0) / sigma); // √(ωμ0/2σ)
  const skin = 1 / Math.sqrt(Math.PI * f * MU0 * sigma);
  const rPerM = (rs / (2 * Math.PI)) * (1 / a + 1 / b);
  const eta = ETA0 / Math.sqrt(er);
  const alphaC = (rs / (2 * eta * Math.log(b / a))) * (1 / a + 1 / b);
  const alphaD = (Math.PI * f * Math.sqrt(er) * tanD) / C0;
  return { skin, rs, rPerM, alphaC, alphaD };
}
