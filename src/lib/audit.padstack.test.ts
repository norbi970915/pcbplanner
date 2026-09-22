import { describe, expect, it } from 'vitest';
import { fabAllowance2221, leadDiagonal, padstack } from './padstack';

describe('audit: padstack', () => {
  it('IPC-7251 worked example: 0.55 mm lead, Level B → 0.75 mm hole, 1.35 mm pad', () => {
    // PCB 3D, "How to calculate PTH hole and pad diameter sizes according to IPC-7251,
    // IPC-2222 and IPC-2221": hole = 0.55 + 0.20; pad = hole + 2·0.05 + 0.5.
    const r = padstack({ leadMm: 0.55, level: 'B', basis: 'ipc7251', holeTolMm: 0, drillOversizeMm: 0.1, copperOz: 1, layers: 4, spokes: 4, planes: 2, round: true });
    expect(r.hole).toBeCloseTo(0.75, 9);
    expect(r.padOuter).toBeCloseTo(1.35, 9);
  });

  it('IPC-2221 land = a + 2b + c with Table 9-1 notes', () => {
    expect(fabAllowance2221('B', 2, 10)).toBeCloseTo(0.25 + 0.05 + 0.05, 12);
    const r = padstack({ leadMm: 0.6, level: 'B', basis: 'ipc2221', holeTolMm: 0.05, drillOversizeMm: 0.1, copperOz: 1, layers: 4, spokes: 4, planes: 1, round: false });
    expect(r.padOuter).toBeCloseTo(0.8 + 0.05 + 2 * 0.05 + 0.25, 12);
    expect(r.padInnerMin).toBeCloseTo(0.9 + 0.05 + 2 * 0.03 + 0.25, 12);
    expect(r.ringExtWorst).toBeCloseTo(0.05, 12);
  });

  it('lead diagonal', () => expect(leadDiagonal(0.64, 0.64)).toBeCloseTo(0.905, 3));
});
