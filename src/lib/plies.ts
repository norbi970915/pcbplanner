// Stacked dielectric entry: a list of plies (thickness + Dk, and Df where loss matters),
// kept in the URL as "t:dk[:df[:material]],…". Below the trace the list runs from the
// reference plane up to the trace; above it runs from the trace outward.
// A ply may name a material from the laminate library instead of its own numbers; the
// stored dk/df are then only a cache for display, and the library value is what counts.
export interface PlyInput {
  t: number; // mm
  dk: number;
  df?: number;
  mat?: string; // laminate library id
}

/** Parse the URL form; returns [] when the text is empty, null when it does not parse. */
export function parsePlies(text: string): PlyInput[] | null {
  const s = text.trim();
  if (!s) return [];
  const out: PlyInput[] = [];
  for (const part of s.split(',')) {
    const [a, b, c, m] = part.split(':');
    const t = Number.parseFloat(a);
    const dk = Number.parseFloat(b);
    const df = c === undefined || c === '' ? undefined : Number.parseFloat(c);
    const mat = m === undefined || m === '' ? undefined : m;
    if (!(t > 0) || !(dk >= 1) || (df !== undefined && !(df >= 0 && df < 1))) return null;
    if (mat !== undefined && !/^[\w.-]+$/.test(mat)) return null;
    out.push({ t, dk, ...(df === undefined ? {} : { df }), ...(mat === undefined ? {} : { mat }) });
  }
  return out;
}

const n = (v: number) => Number(v.toFixed(6));
export const formatPlies = (plies: PlyInput[]): string =>
  plies
    .map((p) => {
      const df = p.df === undefined ? '' : String(n(p.df));
      return p.mat ? `${n(p.t)}:${n(p.dk)}:${df}:${p.mat}` : `${n(p.t)}:${n(p.dk)}${df === '' ? '' : `:${df}`}`;
    })
    .join(',');

export const pliesThickness = (plies: PlyInput[]) => plies.reduce((a, p) => a + p.t, 0);

/** Thickness-weighted average Dk (what a single-layer model would use). */
export const averageDk = (plies: PlyInput[], fallback = 4) => {
  const t = pliesThickness(plies);
  return t > 0 ? plies.reduce((a, p) => a + p.t * p.dk, 0) / t : fallback;
};

/** Slabs from the reference plane (y = 0) up to the trace. */
export function slabsBelow(plies: PlyInput[]): { y0: number; y1: number; er: number }[] {
  let y = 0;
  return plies.map((p) => {
    const slab = { y0: y, y1: y + p.t, er: p.dk };
    y += p.t;
    return slab;
  });
}

/**
 * Slabs above the trace, starting at the trace bottom `yTrace`: the first ply also fills
 * the space beside the trace, so it includes the copper thickness.
 */
export function slabsAbove(plies: PlyInput[], yTrace: number, copperT: number): { y0: number; y1: number; er: number }[] {
  let y = yTrace;
  return plies.map((p, i) => {
    const t = p.t + (i === 0 ? copperT : 0);
    const slab = { y0: y, y1: y + t, er: p.dk };
    y += t;
    return slab;
  });
}
