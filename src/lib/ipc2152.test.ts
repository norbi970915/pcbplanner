import { describe, expect, it } from 'vitest';
import {
  IPC2152_EXTERNAL,
  IPC2152_OTHER_FITS,
  SOURCES,
  ipc2152Current,
  ipc2152DeltaT,
  ipc2152Width,
} from '../data/ipc2152';

describe('IPC-2152 curve fits (Brooks & Adam 2015)', () => {
  it('external coefficients as published (Eq. 3-2)', () => {
    expect(IPC2152_EXTERNAL).toMatchObject({ K: 215.3, a: 2, b: -1.15, c: -1.0 });
  });

  it('reproduces points read off the paper\'s own plots (mil units)', () => {
    // Fig. 3-5: 3 oz (~4.2 mil), 100 mil wide, 20 A → ΔT ≈ 100 °C
    expect(ipc2152DeltaT(IPC2152_EXTERNAL, 20, 100, 4.2)).toBeGreaterThan(95);
    expect(ipc2152DeltaT(IPC2152_EXTERNAL, 20, 100, 4.2)).toBeLessThan(110);
    // Fig. 3-6: 1 oz (~1.35 mil), 50 mil wide, ~7.5 A → ΔT ≈ 100 °C
    expect(ipc2152Current(IPC2152_EXTERNAL, 100, 50, 1.35)).toBeGreaterThan(7.0);
    expect(ipc2152Current(IPC2152_EXTERNAL, 100, 50, 1.35)).toBeLessThan(8.0);
  });

  it('inverse functions are consistent', () => {
    const dT = ipc2152DeltaT(IPC2152_EXTERNAL, 3, 80, 1.4);
    expect(ipc2152Current(IPC2152_EXTERNAL, dT, 80, 1.4)).toBeCloseTo(3, 10);
    expect(ipc2152Width(IPC2152_EXTERNAL, 3, dT, 1.4)).toBeCloseTo(80, 8);
  });

  it('ΔT rises with current and falls with width and thickness for every fit', () => {
    for (const f of [IPC2152_EXTERNAL, ...IPC2152_OTHER_FITS]) {
      expect(f.a).toBeGreaterThan(0);
      expect(f.b).toBeLessThan(0);
      expect(f.c).toBeLessThan(0);
      expect(f.K).toBeGreaterThan(0);
    }
  });

  it('lists sources with URLs', () => {
    for (const s of SOURCES) expect(s.url).toMatch(/^https:\/\//);
  });
});
