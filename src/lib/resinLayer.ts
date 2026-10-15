import type { Geometry, Slab } from './fieldsolver';

export interface ResinLayer { dk: number; above: number }

/**
 * A planar band from the copper bottom through the copper height and R above it.
 * It REPLACES the original upper dielectric; the trace and reference planes stay put.
 * The band is uniform across x (not a local pocket and not a weave model).
 */
export function withResinLayer(g: Geometry, resin: ResinLayer): Geometry {
  if (g.coupling === 'broadside' || g.mask) throw new RangeError('Resin-rich layers require an internal, same-layer trace geometry.');
  if (!Number.isFinite(resin.dk) || resin.dk < 1 || resin.dk > 1000) throw new RangeError('Enter a resin-region Dk between 1 and 1000.');
  const start = g.yTrace;
  const surface = Math.max(...g.slabs.map(s => s.y1));
  const cover = (g.topPlane ?? surface) - start - g.t;
  if (!Number.isFinite(resin.above) || resin.above < 0 || resin.above > cover + 1e-10) throw new RangeError('Resin above copper must be between zero and the upper dielectric height H2.');
  const end = Math.min(start + g.t + resin.above, g.topPlane ?? surface);
  const slabs: Slab[] = [];
  const add = (slab: Slab) => {
    if (slab.y1 <= slab.y0) return;
    const previous = slabs.at(-1);
    if (previous && previous.er === slab.er && Math.abs(previous.y1 - slab.y0) < 1e-12) previous.y1 = slab.y1;
    else slabs.push({ ...slab });
  };
  for (const slab of [...g.slabs].sort((a,b) => a.y0-b.y0)) {
    if (slab.y0 >= end || slab.y1 <= start) { add(slab); continue; }
    if (slab.y0 < start) add({ ...slab, y1: start });
    add({ y0: Math.max(start, slab.y0), y1: Math.min(end, slab.y1), er: resin.dk });
    if (slab.y1 > end) add({ ...slab, y0: end });
  }
  return { ...g, slabs };
}
