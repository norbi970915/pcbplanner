// Stackup model, presets and conversion to an impedance geometry.

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
}

let uid = 0;
export const newId = () => `l${Date.now().toString(36)}${(uid++).toString(36)}`;

const mask = (): Layer => ({ id: newId(), kind: 'mask', name: 'Solder mask', t: 0.0305, er: 3.8 });
const cu = (name: string, t: number, role: CopperRole): Layer => ({ id: newId(), kind: 'copper', name, t, role });
const di = (name: string, t: number, er: number): Layer => ({ id: newId(), kind: 'dielectric', name, t, er });

export const PRESETS: Stackup[] = [
  {
    id: 'generic-2l-1.6',
    name: 'Generic 2-layer 1.6 mm',
    builtin: true,
    layers: [mask(), cu('Top', 0.035, 'signal'), di('Core FR-4', 1.53, 4.5), cu('Bottom', 0.035, 'plane'), mask()],
  },
  {
    id: 'jlc04161h-7628',
    name: 'JLCPCB 4-layer 1.6 mm (JLC04161H-7628)',
    builtin: true,
    note: 'Values from the JLCPCB impedance calculator, September 2026.',
    layers: [
      mask(),
      cu('L1', 0.035, 'signal'),
      di('Prepreg 7628', 0.2104, 4.4),
      cu('L2', 0.0152, 'plane'),
      di('Core', 1.065, 4.6),
      cu('L3', 0.0152, 'plane'),
      di('Prepreg 7628', 0.2104, 4.4),
      cu('L4', 0.035, 'signal'),
      mask(),
    ],
  },
  {
    id: 'jlc04161h-3313',
    name: 'JLCPCB 4-layer 1.6 mm (JLC04161H-3313)',
    builtin: true,
    note: 'Values from the JLCPCB impedance calculator, September 2026.',
    layers: [
      mask(),
      cu('L1', 0.035, 'signal'),
      di('Prepreg 3313', 0.0994, 4.1),
      cu('L2', 0.0152, 'plane'),
      di('Core', 1.265, 4.6),
      cu('L3', 0.0152, 'plane'),
      di('Prepreg 3313', 0.0994, 4.1),
      cu('L4', 0.035, 'signal'),
      mask(),
    ],
  },
  {
    id: 'jlc06161h-1080a',
    name: 'JLCPCB 6-layer 1.6 mm (JLC06161H-1080A)',
    builtin: true,
    note: 'Values from the JLCPCB impedance calculator, September 2026.',
    layers: [
      mask(),
      cu('L1', 0.035, 'signal'),
      di('Prepreg 1080', 0.0764, 3.91),
      cu('L2', 0.0152, 'plane'),
      di('Core', 0.6, 4.36),
      cu('L3', 0.0152, 'signal'),
      di('Prepreg 3313', 0.0918, 4.1),
      cu('L4', 0.0152, 'plane'),
      di('Core', 0.6, 4.36),
      cu('L5', 0.0152, 'plane'),
      di('Prepreg 1080', 0.0764, 3.91),
      cu('L6', 0.035, 'signal'),
      mask(),
    ],
  },
];

export const totalThickness = (s: Stackup) => s.layers.reduce((a, l) => a + l.t, 0);

/** Thickness-weighted average εr of a run of dielectric layers. */
function combine(layers: Layer[]) {
  const t = layers.reduce((a, l) => a + l.t, 0);
  const er = t > 0 ? layers.reduce((a, l) => a + l.t * (l.er ?? 4), 0) / t : 4;
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
    let masks: Layer[] = [];
    let plane: Layer | null = null;
    for (let i = idx + dir; i >= 0 && i < s.layers.length; i += dir) {
      const l = s.layers[i];
      if (l.kind === 'copper') {
        if (l.role === 'plane') {
          plane = l;
          break;
        }
        dielectrics.push(l); // a signal layer in between: treat its thickness as dielectric
        continue;
      }
      if (l.kind === 'mask') masks = [...masks, l];
      else dielectrics.push(l);
    }
    return { dielectrics: dielectrics.filter((l) => l.kind === 'dielectric'), masks, plane };
  };
  const up = scan(-1);
  const down = scan(1);
  const planes = [up.plane, down.plane].filter(Boolean).length;

  if (planes === 0) return null;
  if (planes === 2) {
    const a = combine(down.dielectrics);
    const b = combine(up.dielectrics);
    return {
      type: 'stripline',
      h: a.t,
      er: a.er,
      h2: b.t,
      er2: b.er,
      t: trace.t,
      note: `Stripline between ${down.plane!.name} and ${up.plane!.name}.`,
    };
  }
  const ref = up.plane ? up : down;
  const open = up.plane ? down : up;
  const below = combine(ref.dielectrics);
  const cover = combine(open.dielectrics);
  if (cover.t === 0) {
    const m = open.masks[0];
    return {
      type: 'microstrip',
      h: below.t,
      er: below.er,
      t: trace.t,
      mask: m ? { c1: m.t, c2: m.t / 2, er: m.er ?? 3.8 } : undefined,
      note: `Surface microstrip over ${ref.plane!.name}${m ? ', coated with solder mask' : ''}.`,
    };
  }
  return {
    type: 'embedded',
    h: below.t,
    er: below.er,
    h2: cover.t,
    er2: cover.er,
    t: trace.t,
    note: `Embedded microstrip over ${ref.plane!.name}.`,
  };
}
