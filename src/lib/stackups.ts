// Stackup model, presets and conversion to an impedance geometry.
import { JLC_STACKUPS, type RawStackup } from '../data/jlcStackups';

export type LayerKind = 'mask' | 'copper' | 'dielectric';
export type CopperRole = 'signal' | 'plane';

export interface Layer {
  id: string;
  kind: LayerKind;
  name: string;
  t: number; // mm
  er?: number;
  role?: CopperRole;
}

export interface Stackup {
  id: string;
  name: string;
  layers: Layer[];
  builtin?: boolean;
  note?: string;
  vendor?: string;
  nominal?: number; // nominal finished thickness, mm
}

let uid = 0;
export const newId = () => `l${Date.now().toString(36)}${(uid++).toString(36)}`;

/**
 * Default signal/plane assignment per copper count. Every signal layer gets at
 * least one adjacent reference plane; inner signal layers sit between planes.
 */
export const ROLE_PATTERNS: Record<number, string> = {
  2: 'SP',
  4: 'SPPS',
  6: 'SPSPPS',
  8: 'SPSPPSPS',
  10: 'SPSPPSPSPS',
  12: 'SPSPSPPSPSPS',
};

const MASK_T = 0.0305; // 1.2 mil, JLCPCB calculator default
const MASK_ER = 3.8;

function fromRaw(r: RawStackup): Stackup {
  const pattern = ROLE_PATTERNS[r.n] ?? '';
  let ci = 0;
  const layers: Layer[] = [{ id: `${r.id}-mt`, kind: 'mask', name: 'Top Solder', t: MASK_T, er: MASK_ER }];
  r.L.forEach((l, i) => {
    if (l[0] === 'c') {
      const role: CopperRole = pattern[ci] === 'P' ? 'plane' : 'signal';
      ci++;
      layers.push({ id: `${r.id}-${i}`, kind: 'copper', name: l[1], t: l[2], role });
    } else {
      layers.push({ id: `${r.id}-${i}`, kind: 'dielectric', name: l[1], t: l[2], er: l[3] });
    }
  });
  layers.push({ id: `${r.id}-mb`, kind: 'mask', name: 'Bottom Solder', t: MASK_T, er: MASK_ER });
  return {
    id: r.id,
    name: `${r.name} · ${r.n}L ${r.nominal} mm`,
    layers,
    builtin: true,
    vendor: 'JLCPCB',
    nominal: r.nominal,
    note: 'JLCPCB impedance template (NP-155F laminate), fetched 2026-09-22. Default layer roles assigned; edit as needed.',
  };
}

export const PRESETS: Stackup[] = JLC_STACKUPS.map(fromRaw);

export const copperCount = (s: Stackup) => s.layers.filter((l) => l.kind === 'copper').length;
export const signalLayers = (s: Stackup) => s.layers.filter((l) => l.kind === 'copper' && l.role !== 'plane');
export const totalThickness = (s: Stackup) => s.layers.reduce((a, l) => a + l.t, 0);
/** Thickness without solder mask (what the fab quotes as board thickness). */
export const boardThickness = (s: Stackup) => s.layers.filter((l) => l.kind !== 'mask').reduce((a, l) => a + l.t, 0);

export interface Ply {
  t: number;
  er: number;
}

/**
 * Plies of a run of layers, in order. Copper of an intermediate (unreferenced)
 * signal layer is kept as a ply with the εr of the surrounding dielectric,
 * because the resin fills around it.
 */
function plies(layers: Layer[]): Ply[] {
  const known = layers.filter((l) => l.kind === 'dielectric');
  const tk = known.reduce((a, l) => a + l.t, 0);
  const avg = tk > 0 ? known.reduce((a, l) => a + l.t * (l.er ?? 4), 0) / tk : 4;
  return layers.map((l) => ({ t: l.t, er: l.kind === 'dielectric' ? (l.er ?? 4) : avg }));
}

/** Total thickness and thickness-weighted average εr of a list of plies. */
function combine(p: Ply[]) {
  const t = p.reduce((a, l) => a + l.t, 0);
  const er = t > 0 ? p.reduce((a, l) => a + l.t * l.er, 0) / t : 4;
  return { t, er };
}

export interface StackupGeometry {
  type: 'microstrip' | 'embedded' | 'stripline';
  h: number;
  er: number;
  t: number;
  h2?: number;
  er2?: number;
  mask?: { c1: number; c2: number; er: number };
  /** plies from the reference plane up to the trace (sum = h) */
  below?: Ply[];
  /** plies from the trace upward to the other plane or the surface (sum = h2) */
  above?: Ply[];
  outer: boolean;
  note: string;
}

/**
 * Derive the impedance cross-section for a copper layer from the stackup.
 * The reference planes are the nearest copper layers marked as planes.
 */
export function geometryForLayer(s: Stackup, layerId: string): StackupGeometry | null {
  const idx = s.layers.findIndex((l) => l.id === layerId);
  if (idx < 0 || s.layers[idx].kind !== 'copper') return null;
  const trace = s.layers[idx];

  const scan = (dir: 1 | -1) => {
    const dielectrics: Layer[] = [];
    const masks: Layer[] = [];
    let plane: Layer | null = null;
    for (let i = idx + dir; i >= 0 && i < s.layers.length; i += dir) {
      const l = s.layers[i];
      if (l.kind === 'copper') {
        if (l.role === 'plane') {
          plane = l;
          break;
        }
        dielectrics.push(l); // an intermediate signal layer: its thickness is part of the spacing
        continue;
      }
      if (l.kind === 'mask') masks.push(l);
      else dielectrics.push(l);
    }
    // plies ordered outward from the trace
    return { run: plies(dielectrics), masks, plane };
  };
  const up = scan(-1);
  const down = scan(1);
  const planes = [up.plane, down.plane].filter(Boolean).length;

  if (planes === 0) return null;
  if (planes === 2) {
    const a = combine(down.run);
    const b = combine(up.run);
    return {
      type: 'stripline',
      h: a.t,
      er: a.er,
      h2: b.t,
      er2: b.er,
      t: trace.t,
      below: [...down.run].reverse(),
      above: up.run,
      outer: false,
      note: `${trace.name}: stripline between ${down.plane!.name} and ${up.plane!.name}.`,
    };
  }
  const ref = up.plane ? up : down;
  const open = up.plane ? down : up;
  const below = combine(ref.run);
  const cover = combine(open.run);
  if (cover.t === 0) {
    const m = open.masks[0];
    return {
      type: 'microstrip',
      h: below.t,
      er: below.er,
      t: trace.t,
      mask: m ? { c1: m.t, c2: m.t / 2, er: m.er ?? MASK_ER } : undefined,
      below: [...ref.run].reverse(),
      outer: true,
      note: `${trace.name}: surface microstrip over ${ref.plane!.name}${m ? ', solder-mask coated' : ''}.`,
    };
  }
  return {
    type: 'embedded',
    h: below.t,
    er: below.er,
    h2: cover.t,
    er2: cover.er,
    t: trace.t,
    below: [...ref.run].reverse(),
    above: open.run,
    outer: false,
    note: `${trace.name}: embedded microstrip over ${ref.plane!.name}.`,
  };
}
