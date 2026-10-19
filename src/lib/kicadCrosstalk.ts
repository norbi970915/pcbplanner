// The Crosstalk Calculator's inputs from a KiCad project: a signal layer's cross-section (the one
// /kicad-project solves, as kicadProjectQueries.ts layerGeometry gives it) and a measured parallel run
// of two nets on that layer (kicadParallel.ts). Rise time and swing are not in a board file and stay
// as the user set them.
import type { CrosstalkInputs } from './crosstalk';
import type { ParallelRun } from './kicadParallel';
import type { LayerGeometry } from './kicadProjectQueries';

export type CrosstalkPatch = Partial<Omit<CrosstalkInputs, 'tr' | 'v'>>;

const r5 = (v: number) => Number(v.toFixed(5));

/** The cross-section fields of a layer, mapped as impedancePatch maps them for the Impedance Calculator. */
export function crosstalkLayerFields(g: LayerGeometry): CrosstalkPatch {
  const f = g.impedance;
  return {
    type: f.type,
    h: f.h,
    er: f.er,
    ...(f.h2 !== undefined ? { h2: f.h2, er2: f.er2 ?? f.er } : {}),
    ...(f.type === 'microstrip' ? { mask: !!f.mask, ...(f.mask ? { c1: f.c1, c2: f.c2, erm: f.erm } : {}) } : {}),
    dl: f.dl,
    dl2: f.dl2,
    t: f.t,
    etch: f.etch,
  };
}

/**
 * Inputs for a parallel run on the layer: the cross-section, W (the mean of the two nets' widths over the
 * coupled stretches when they differ, as the routing check solves an unequal pair), S the dominant edge
 * spacing and the coupled length. Null when the nets do not run in parallel.
 */
export function crosstalkPatch(g: LayerGeometry, run: ParallelRun): CrosstalkPatch | null {
  if (!(run.coupled > 0) || run.gap === undefined) return null;
  const ws = [run.wA, run.wB].filter((w): w is number => w !== undefined);
  return { ...crosstalkLayerFields(g), w: r5(ws.reduce((a, b) => a + b, 0) / ws.length), s: r5(run.gap), len: r5(run.coupled) };
}
