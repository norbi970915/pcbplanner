// Copper material properties and conductor-level calculations.

/** Resistivity of annealed copper at 20 °C, ohm·m (IEC 60028: 1/58 Ω·mm²/m). */
export const RHO20 = 1.7241e-8;
/** Temperature coefficient of resistance of copper at 20 °C, 1/°C. */
export const ALPHA20 = 0.00393;
/** Thermal conductivity of copper, W/(m·K). */
export const K_CU = 401;
/** Relative permeability of copper. */
export const MU_R_CU = 0.999994;
export const MU0 = 4e-7 * Math.PI;
/** Melting point of copper, °C. */
export const T_MELT_CU = 1084.62;

/** Copper resistivity at temperature T (°C), ohm·m. */
export function rhoCu(tempC: number): number {
  return RHO20 * (1 + ALPHA20 * (tempC - 20));
}

/** DC resistance of a conductor, ohm. Lengths in mm, area in mm². */
export function dcResistance(lengthMm: number, areaMm2: number, tempC = 20): number {
  return (rhoCu(tempC) * (lengthMm * 1e-3)) / (areaMm2 * 1e-6);
}

/** Skin depth in copper, metres. */
export function skinDepth(freqHz: number, tempC = 20): number {
  return Math.sqrt(rhoCu(tempC) / (Math.PI * freqHz * MU0 * MU_R_CU));
}

/**
 * AC resistance of a rectangular trace using the classic current-crowding model:
 * current flows in a skin-depth shell around the perimeter (both sides for a
 * trace over a plane is conservative; we use the full perimeter with an
 * exponential transition so Rac → Rdc at low frequency).
 */
export function acResistance(lengthMm: number, widthMm: number, thickMm: number, freqHz: number, tempC = 20) {
  const rho = rhoCu(tempC);
  const d = skinDepth(freqHz, tempC) * 1e3; // mm
  const w = widthMm, t = thickMm;
  // effective conducting area: full area minus the core that is deeper than δ from every surface
  const coreW = Math.max(0, w - 2 * d);
  const coreT = Math.max(0, t - 2 * d);
  const aEff = w * t - coreW * coreT;
  const rdc = (rho * lengthMm * 1e-3) / (w * t * 1e-6);
  const rac = (rho * lengthMm * 1e-3) / (aEff * 1e-6);
  return { rdc, rac, ratio: rac / rdc, skinDepthMm: d };
}

/**
 * Onderdonk's equation: current that raises a copper conductor from ambient
 * to melting in `seconds`. Area in mm². Valid for short pulses (< ~10 s),
 * where heat loss to the surroundings is negligible.
 */
export function onderdonk(areaMm2: number, seconds: number, ambientC = 25, meltC = T_MELT_CU): number {
  const cmil = (areaMm2 / (0.0254 * 0.0254)) * (4 / Math.PI); // mm² → circular mils
  return cmil * Math.sqrt(Math.log10((meltC - ambientC) / (234 + ambientC) + 1) / (33 * seconds));
}
