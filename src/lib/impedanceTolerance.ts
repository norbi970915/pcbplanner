import type { Geometry } from './fieldsolver';

export interface ImpedanceVariation {
  widthMm: number;
  heightPct: number;
  dkPct: number;
  spacingMm: number;
}

/** Independent fabrication endpoints. Copper, etch, mask and CPW gap stay fixed. */
export function impedanceToleranceCorners(g: Geometry, v: ImpedanceVariation): Geometry[] {
  if (![v.widthMm, v.heightPct, v.dkPct, v.spacingMm].every(Number.isFinite) ||
      v.widthMm < 0 || v.heightPct < 0 || v.dkPct < 0 || v.spacingMm < 0 ||
      v.heightPct >= 100 || v.dkPct >= 100) {
    throw new RangeError('Variations must be non-negative; height and Dk must be below 100 %.');
  }
  if (g.w - v.widthMm <= 0 || (g.wTop !== undefined && g.wTop - v.widthMm <= 0)) {
    throw new RangeError('The minimum width must stay wider than the etch allowance.');
  }
  if (g.diff && (!(g.s && g.s - v.spacingMm > 0))) {
    throw new RangeError('The minimum pair spacing must stay above zero.');
  }
  if (g.slabs.some((slab) => slab.er * (1 - v.dkPct / 100) < 1)) {
    throw new RangeError('The minimum dielectric Dk must stay at least 1.');
  }

  const ends = (amount: number) => amount ? [-1, 1] : [0];
  const corners: Geometry[] = [];
  for (const widthSign of ends(v.widthMm))
    for (const heightSign of ends(v.heightPct))
      for (const dkSign of ends(v.dkPct))
        for (const spacingSign of ends(g.diff ? v.spacingMm : 0)) {
          const widthDelta = widthSign * v.widthMm;
          const heightScale = 1 + heightSign * v.heightPct / 100;
          const dkScale = 1 + dkSign * v.dkPct / 100;
          const yTrace = g.yTrace * heightScale;
          const scaleY = (y: number) => y <= g.yTrace
            ? y * heightScale
            : yTrace + g.t + (y - g.yTrace - g.t) * heightScale;
          corners.push({
            ...g,
            w: g.w + widthDelta,
            wTop: g.wTop === undefined ? undefined : g.wTop + widthDelta,
            yTrace,
            s: g.diff ? (g.s as number) + spacingSign * v.spacingMm : undefined,
            slabs: g.slabs.map((slab) => ({ y0: scaleY(slab.y0), y1: scaleY(slab.y1), er: slab.er * dkScale })),
            topPlane: g.topPlane === undefined ? undefined : scaleY(g.topPlane),
            mask: g.mask ? { ...g.mask, surfaceY: yTrace } : undefined,
          });
        }
  return corners;
}
