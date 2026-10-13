import { expect, it } from 'vitest';
import { PRESETS } from '../lib/stackups';
import { FAB_STACKUP_COUNT } from './fabStackupCount';

it('matches the number of fabricator stackups', () => expect(FAB_STACKUP_COUNT).toBe(PRESETS.length));
