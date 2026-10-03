import type { Geometry } from './fieldsolver';

/** Scale dielectric heights and move the upper trace, preserving both copper thicknesses. */
export function resizeBroadside(g: Geometry, heightScale: number, gap: number): Geometry {
  const h = g.yTrace;
  const t = g.t;
  const oldGap = g.s!;
  const nextH = h * heightScale;
  const scaleY = (y: number) => {
    if (y <= h) return y * heightScale;
    if (y <= h + t) return nextH + (y - h);
    if (y <= h + t + oldGap) return nextH + t + (y - h - t) * gap / oldGap;
    if (y <= h + 2 * t + oldGap) return nextH + t + gap + (y - h - t - oldGap);
    return nextH + 2 * t + gap + (y - h - 2 * t - oldGap) * heightScale;
  };
  return { ...g, yTrace: nextH, s: gap, topPlane: scaleY(g.topPlane!),
    slabs: g.slabs.map(sl => ({ ...sl, y0: scaleY(sl.y0), y1: scaleY(sl.y1) })) };
}
