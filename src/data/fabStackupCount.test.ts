import { expect, it } from 'vitest';
import { PRESETS } from '../lib/stackups';
import { FAB_STACKUP_COUNT } from './fabStackupCount';

it('matches the number of fabricator stackups', () => expect(FAB_STACKUP_COUNT).toBe(PRESETS.length));

import { FLEX_PRESETS } from './flexStackups';
import { stackupStore } from '../state/stackupStore';

it('exposes only the 178 rigid constructions and six flex/rigid-flex starters as built-ins', () => {
  expect(PRESETS).toHaveLength(178);
  expect(FLEX_PRESETS.filter(s => s.construction === 'flex')).toHaveLength(3);
  expect(FLEX_PRESETS.filter(s => s.construction === 'rigid-flex')).toHaveLength(3);
  const library = stackupStore.get().filter(s => s.builtin);
  expect(library).toHaveLength(184);
  expect(new Set(library.map(s => s.id)).size).toBe(184);
  expect(library.some(s => s.id.startsWith('pcbplanner-v1-'))).toBe(false);
  expect(library.find(s => s.id === 'std-4l-8-1080-2')?.layers.filter(l => l.kind === 'dielectric').map(l => l.name)).toEqual(['Prepreg 1080', 'Prepreg 7628', 'Core 0.10 mm', 'Prepreg 7628', 'Prepreg 1080']);
});
