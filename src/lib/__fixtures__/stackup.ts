import type { Stackup } from '../stackups';

/** Independent synthetic multi-ply test geometry; not a production or supplier construction. */
export const multiPlyStackup: Stackup = {
  id: 'test-multi-ply', name: 'Synthetic multi-ply example', nominal: 1.106,
  layers: [
    { id: 'mt', kind: 'mask', name: 'Top mask', t: 0.02, er: 3.5 },
    { id: 'c1', kind: 'copper', name: 'L1', t: 0.035, role: 'signal' },
    { id: 'a1', kind: 'dielectric', name: 'Prepreg A', t: 0.1, er: 3.8 },
    { id: 'b1', kind: 'dielectric', name: 'Prepreg B', t: 0.2, er: 4.2 },
    { id: 'c2', kind: 'copper', name: 'L2', t: 0.018, role: 'plane' },
    { id: 'core', kind: 'dielectric', name: 'Core', t: 0.4, er: 4 },
    { id: 'c3', kind: 'copper', name: 'L3', t: 0.018, role: 'plane' },
    { id: 'b2', kind: 'dielectric', name: 'Prepreg B', t: 0.2, er: 4.2 },
    { id: 'a2', kind: 'dielectric', name: 'Prepreg A', t: 0.1, er: 3.8 },
    { id: 'c4', kind: 'copper', name: 'L4', t: 0.035, role: 'signal' },
    { id: 'mb', kind: 'mask', name: 'Bottom mask', t: 0.02, er: 3.5 },
  ],
};
