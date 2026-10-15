import type { Geometry } from './fieldsolver';
import { parsePlies, pliesThickness, slabsAbove, slabsBelow } from './plies';
import { laminateById } from '../data/laminates';
import { djordjevicSarkar } from './dielectric';
import { withResinLayer } from './resinLayer';

type LineType = 'microstrip' | 'embedded' | 'stripline';

export const IMPEDANCE_DEFAULTS = {
  type: 'microstrip',
  mode: 'se',
  coupling: 'edge',
  mask: true,
  cpw: false,
  w: 0.15,
  etch: 0.0127,
  t: 0.035,
  h: 0.1,
  er: 4.1,
  h2: 0.1,
  er2: 4.1,
  c1: 0.0305,
  c2: 0.0152,
  erm: 3.8,
  s: 0.15,
  gap: 0.2,
  acc: 'normal',
  target: 50,
  mat: 'custom',
  mat2: 'custom',
  fq: 1,
  tolEnabled: false,
  tolW: 0,
  tolH: 0,
  tolDk: 0,
  tolS: 0,
  tolLimit: 10,
  dl: '', // stacked dielectric below the trace: "t:dk,…" from the plane up to the trace
  dl2: '', // stacked dielectric above the trace, from the trace outward
  resin: false,
  resinDk: 0, // no assumed resin material: enter a value before enabling the model
  resinAbove: 0, // extra resin above the copper; the band always includes the copper height
  sw: '', // parameter swept in the Sweep panel ('' = none)
};

/** εr from the material library at the design frequency, or the entered value. */
export function materialDk(mat: string, er: number, fGHz: number): number {
  const l = mat !== 'custom' ? laminateById(mat) : undefined;
  return l ? +djordjevicSarkar({ dk: l.dk, df: l.df, f0: l.fGHz * 1e9 }).dk(fGHz * 1e9).toFixed(4) : er;
}

export function buildImpedanceGeometry(p: typeof IMPEDANCE_DEFAULTS): { geom: Geometry | null; errors: string[] } {
  const errors: string[] = [];
  const broadside = p.mode === 'diff' && p.coupling === 'broadside';
  const type = (broadside ? 'stripline' : p.type) as LineType;
  const diff = p.mode === 'diff';
  const pos = (v: number, name: string) => {
    if (!(v > 0)) errors.push(`${name} must be greater than 0.`);
  };
  pos(p.w, 'Width W');
  pos(p.t, 'Thickness T');
  if (!p.dl.trim()) pos(p.h, 'Height H');
  if (!(p.er >= 1)) errors.push('εr must be at least 1.');
  if (type !== 'microstrip' && !broadside) {
    if (!p.dl2.trim()) pos(p.h2, 'Height H2');
    if (!(p.er2 >= 1)) errors.push('Upper εr must be at least 1.');
  }
  if (diff) pos(p.s, 'Spacing S');
  if (!broadside && p.cpw) pos(p.gap, 'Coplanar gap G');
  if (p.etch < 0 || p.etch >= p.w) errors.push('Etch must be between 0 and the trace width.');
  const below = parsePlies(p.dl);
  const above = parsePlies(p.dl2);
  if (below === null) errors.push('Check the dielectric plies below the trace: each needs a thickness and a Dk of at least 1.');
  if (!broadside && above === null) errors.push('Check the dielectric plies above the trace: each needs a thickness and a Dk of at least 1.');
  if (type === 'microstrip' && p.mask) {
    if (!(p.c1 >= 0 && p.c2 >= 0)) errors.push('Mask thickness cannot be negative.');
    if (!(p.erm >= 1)) errors.push('Mask εr must be at least 1.');
  }
  if (errors.length || !below || (!broadside && !above)) return { geom: null, errors };

  // stacked plies model each prepreg / core exactly; a single Dk is the simple case
  const lib = (ps: typeof below) => ps.map((x) => (x.mat ? { ...x, dk: materialDk(x.mat, x.dk, p.fq) } : x));
  const belowR = lib(below);
  const aboveR = lib(above ?? []);
  const hBelow = below.length ? pliesThickness(below) : p.h;
  const hAbove = above?.length ? pliesThickness(above) : p.h2;
  const g: Geometry = {
    w: p.w,
    wTop: p.etch > 0 ? p.w - p.etch : undefined,
    t: p.t,
    yTrace: hBelow,
    diff,
    s: diff ? p.s : undefined,
    coplanarGap: !broadside && p.cpw ? p.gap : undefined,
    slabs: below.length ? slabsBelow(belowR) : [{ y0: 0, y1: hBelow, er: p.er }],
  };
  if (broadside) {
    if (!(p.er2 >= 1)) return { geom: null, errors: ['Inter-layer Dk must be at least 1.'] };
    const topPlane = 2 * hBelow + 2 * p.t + p.s;
    g.coupling = 'broadside';
    g.topPlane = topPlane;
    g.slabs = [...g.slabs, { y0: hBelow, y1: topPlane - hBelow, er: p.er2 },
      ...g.slabs.map(sl => ({ y0: topPlane - sl.y1, y1: topPlane - sl.y0, er: sl.er }))];
  } else if (type === 'microstrip') {
    if (p.mask && (p.c1 > 0 || p.c2 > 0)) g.mask = { surfaceY: hBelow, overSubstrate: p.c1, overTrace: p.c2, er: p.erm };
  } else {
    if (above?.length) g.slabs.push(...slabsAbove(aboveR, hBelow, p.t));
    else g.slabs.push({ y0: hBelow, y1: hBelow + p.t + hAbove, er: p.er2 });
    if (type === 'stripline') g.topPlane = hBelow + p.t + hAbove;
  }
  if (p.resin) {
    if (type === 'microstrip' || broadside) return { geom: null, errors: ['The resin-rich layer is available for embedded microstrip and edge-coupled stripline.'] };
    try { return { geom: withResinLayer(g, { dk: p.resinDk, above: p.resinAbove }), errors }; }
    catch (error) { return { geom: null, errors: [error instanceof Error ? error.message : 'Check the resin-rich layer.'] }; }
  }
  return { geom: g, errors };
}
