import { describe, expect, it } from 'vitest';
import { preferredLoads, spreadSelectedLoads } from './kicadLoadSelection';

describe('explicit DC load selection', () => {
  it('offers consuming parts before capacitors without removing manual choices or mutating the source', () => {
    const parts = [{ ref: 'C1' }, { ref: 'J1' }, { ref: 'U2' }, { ref: 'Q3' }, { ref: 'R1' }];
    expect(preferredLoads(parts).map(p => p.ref)).toEqual(['U2', 'Q3', 'R1', 'C1', 'J1']);
    expect(parts[0].ref).toBe('C1');
  });
  it('distributes only among selected loads and never adds a capacitor', () => {
    const loads = [{ ref: 'U2', amps: 0 }, { ref: 'U3', amps: 0.1 }];
    expect(spreadSelectedLoads(loads, 0.6)).toEqual([{ ref: 'U2', amps: 0.3 }, { ref: 'U3', amps: 0.3 }]);
    expect(loads[0].amps).toBe(0);
    expect(spreadSelectedLoads([], 1)).toEqual([]);
    expect(spreadSelectedLoads(loads, NaN)).toBe(loads);
  });
});
