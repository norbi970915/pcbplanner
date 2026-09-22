// Transmission-line loss of PCB traces from the 2D field solver.
//
// Dielectric loss: the solver splits the stored electric energy by dielectric region, which gives
// the exact effective loss tangent of a mixed cross-section (mask, prepreg, core, air):
//   tanδeff = Σ εr,i·tanδi·p_i / εeff,   αd = π·f·√εeff·tanδeff / c        [Np/m]
// Conductor loss: Wheeler's incremental-inductance rule on the air-filled line,
//   R' = (Rs / η0) · ∂Z0,air/∂n,   Rs = √(π f μ0 ρ),   αc = R' / (2 Z0)       [Np/m]
// where ∂/∂n recedes every conductor surface (trace and planes) by the same small depth.
// It is exact in the skin-effect limit for any cross-section, including trapezoidal traces,
// coplanar ground and coupled pairs. Surface roughness multiplies the skin-effect part.
import { MU0, rhoCu } from './copper';
import type { DielectricModel } from './dielectric';
import { solve, type Accuracy, type Geometry } from './fieldsolver';
import { C0, ETA0 } from './units';

export const NP_TO_DB = 20 / Math.LN10; // 8.686 dB per neper

export type RoughnessModel = 'smooth' | 'hammerstad' | 'groiss' | 'huray';

export interface Roughness {
  model: RoughnessModel;
  rq?: number; // RMS roughness, µm (Hammerstad, Groiss)
  radius?: number; // Huray sphere radius, µm
  sr?: number; // Huray surface ratio N·4πa²/A_flat
}

/** Surface-roughness loss factor K ≥ 1 applied to the skin-effect resistance. δ in µm. */
export function roughnessFactor(r: Roughness, deltaUm: number): number {
  switch (r.model) {
    case 'hammerstad': {
      const q = (r.rq ?? 0) / deltaUm;
      return 1 + (2 / Math.PI) * Math.atan(1.4 * q * q);
    }
    case 'groiss':
      return r.rq && r.rq > 0 ? 1 + Math.exp(-((deltaUm / (2 * r.rq)) ** 1.6)) : 1;
    case 'huray': {
      const a = r.radius ?? 0;
      const sr = r.sr ?? 0;
      if (!(a > 0) || !(sr > 0)) return 1;
      return 1 + (1.5 * sr) / (1 + deltaUm / a + (deltaUm * deltaUm) / (2 * a * a));
    }
    default:
      return 1;
  }
}

/** Air-filled copy of the geometry with every conductor surface receded by d (mm); d < 0 grows it. */
export function recede(g: Geometry, d: number): Geometry {
  return {
    w: g.w - 2 * d,
    wTop: g.wTop !== undefined ? g.wTop - 2 * d : undefined,
    t: g.t - 2 * d,
    // the bottom plane moves down by d and the trace bottom up by d
    yTrace: g.yTrace + 2 * d,
    diff: g.diff,
    s: g.s !== undefined ? g.s + 2 * d : undefined,
    slabs: [],
    topPlane: g.topPlane !== undefined ? g.topPlane + 2 * d : undefined,
    coplanarGap: g.coplanarGap !== undefined ? g.coplanarGap + 2 * d : undefined,
  };
}

function lineZ(g: Geometry, accuracy: Accuracy): number {
  const r = solve(g, { accuracy, even: false });
  return (g.diff ? r.odd?.z : r.se?.z) ?? NaN;
}

/**
 * ∂Z0,air/∂n in Ω/mm by a central difference. The step is small against every feature
 * (so the difference stays in the linear range) but large against the mesh noise.
 */
export function incrementalDZ(g: Geometry, accuracy: Accuracy): number {
  const feats = [g.t, g.w, g.wTop ?? g.w, g.yTrace, g.s, g.coplanarGap, g.topPlane !== undefined ? g.topPlane - g.yTrace - g.t : undefined].filter(
    (v): v is number => v !== undefined && v > 0,
  );
  const d = 0.02 * Math.min(...feats);
  return (lineZ(recede(g, d), accuracy) - lineZ(recede(g, -d), accuracy)) / (2 * d);
}

export interface LossInput {
  /** Cross-section with each slab / mask εr set to the material Dk at `fRef`. */
  geom: Geometry;
  /** Material of each slab (same order as geom.slabs) and of the mask. */
  slabModels: DielectricModel[];
  maskModel?: DielectricModel;
  fRef: number;
  freqs: number[]; // Hz
  rough: Roughness;
  tempC: number;
  accuracy: Accuracy;
}

export interface LossPoint {
  f: number;
  z: number; // Z0, or Zodd for a pair (Zdiff = 2·Zodd)
  eeff: number;
  tanEff: number;
  rough: number; // K
  skinUm: number;
  rPerM: number; // Ω/m per line incl. roughness
  alphaC: number; // conductor loss, dB/m
  alphaD: number; // dielectric loss, dB/m
  alpha: number; // total, dB/m
}

export interface LossResult {
  points: LossPoint[];
  zAir: number;
  dZdn: number; // Ω/mm
  rdc: number; // Ω/m per line
  nodes: number;
}

export function lineLoss(inp: LossInput): LossResult {
  const g = inp.geom;
  const sol = solve(g, { accuracy: inp.accuracy, even: false, parts: true });
  const mode = g.diff ? sol.odd : sol.se;
  if (!mode?.parts) throw new Error('Solver returned no result.');
  const parts = mode.parts;
  const zAir = mode.z * Math.sqrt(mode.eeff);
  const dZdn = incrementalDZ(g, inp.accuracy); // Ω/mm
  const rho = rhoCu(inp.tempC);
  const area = (((g.w + (g.wTop ?? g.w)) / 2) * g.t) * 1e-6; // m²
  const rdc = rho / area;

  const points = inp.freqs.map((f): LossPoint => {
    let eeff = parts.air;
    let lossSum = 0;
    g.slabs.forEach((_, i) => {
      const m = inp.slabModels[i];
      const er = m.dk(f);
      eeff += er * parts.slabs[i];
      lossSum += er * m.df(f) * parts.slabs[i];
    });
    if (g.mask && inp.maskModel) {
      const er = inp.maskModel.dk(f);
      eeff += er * parts.mask;
      lossSum += er * inp.maskModel.df(f) * parts.mask;
    }
    const tanEff = lossSum / eeff;
    const z = zAir / Math.sqrt(eeff);
    const alphaDnp = (Math.PI * f * Math.sqrt(eeff) * tanEff) / C0;

    const rs = Math.sqrt(Math.PI * f * MU0 * rho);
    const skinUm = Math.sqrt(rho / (Math.PI * f * MU0)) * 1e6;
    const k = roughnessFactor(inp.rough, skinUm);
    const rSkin = (k * rs * dZdn * 1e3) / ETA0; // Ω/m
    // blend towards the DC resistance where the skin depth exceeds the copper
    const r = Math.sqrt(rdc * rdc + rSkin * rSkin);
    const alphaCnp = r / (2 * z);
    return {
      f,
      z,
      eeff,
      tanEff,
      rough: k,
      skinUm,
      rPerM: r,
      alphaC: alphaCnp * NP_TO_DB,
      alphaD: alphaDnp * NP_TO_DB,
      alpha: (alphaCnp + alphaDnp) * NP_TO_DB,
    };
  });
  return { points, zAir, dZdn, rdc, nodes: sol.nodes };
}
