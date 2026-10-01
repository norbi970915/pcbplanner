import { describe, expect, it } from 'vitest';
import { mixedIndex, pairPorts, toMixedMode, type PairConvention } from './mixedMode';
import type { Network } from './touchstone';

type C = [number, number];

/** A one-frequency 4-port from a map of 1-based "ij" → complex value; other entries are 0. */
function net4(entries: Record<string, C>, refs = [50, 50, 50, 50]): Network {
  const re = new Float64Array(16);
  const im = new Float64Array(16);
  for (const [k, v] of Object.entries(entries)) {
    const i = Number(k[0]) - 1, j = Number(k[1]) - 1;
    re[i * 4 + j] = v[0];
    im[i * 4 + j] = v[1];
  }
  return { ports: 4, freq: Float64Array.of(1e9), re, im, referenceOhms: refs, version: '1.0', format: 'RI', parameter: 'S', matrix: 'Full', twoPortOrder: null, noiseLines: 0, notes: [] };
}

const mm = (net: Network, conv: PairConvention, name: string): C => {
  const out = toMixedMode(net, conv);
  const [r, c] = mixedIndex(name)!;
  return [out.re[r * 4 + c], out.im[r * 4 + c]];
};
const close = (a: C, b: C) => {
  expect(a[0]).toBeCloseTo(b[0], 12);
  expect(a[1]).toBeCloseTo(b[1], 12);
};

describe('mixed-mode conversion', () => {
  it('maps parameter names to D1 D2 C1 C2 indices', () => {
    expect(mixedIndex('dd21')).toEqual([1, 0]);
    expect(mixedIndex('SCD21'.slice(1))).toEqual([3, 0]);
    expect(mixedIndex('dc12')).toEqual([0, 3]);
    expect(mixedIndex('cc22')).toEqual([3, 3]);
    expect(mixedIndex('xx11')).toBeNull();
    expect(pairPorts('13')).toEqual({ p: [0, 2], n: [1, 3] });
    expect(pairPorts('12')).toEqual({ p: [0, 1], n: [2, 3] });
  });

  it('gives SDD21 = 1 and no mode conversion for an ideal through pair in both numberings', () => {
    const one: C = [1, 0];
    const a = net4({ 31: one, 13: one, 42: one, 24: one });
    const b = net4({ 21: one, 12: one, 43: one, 34: one });
    for (const [net, conv] of [[a, '13'], [b, '12']] as const) {
      close(mm(net, conv, 'dd21'), [1, 0]);
      close(mm(net, conv, 'dd12'), [1, 0]);
      close(mm(net, conv, 'cc21'), [1, 0]);
      close(mm(net, conv, 'cd21'), [0, 0]);
      close(mm(net, conv, 'dc21'), [0, 0]);
      close(mm(net, conv, 'dd11'), [0, 0]);
    }
    // the wrong numbering sees no differential transmission at all
    close(mm(a, '12', 'dd21'), [0, 0]);
  });

  it('converts all differential signal to common mode when one line is inverted', () => {
    const net = net4({ 31: [1, 0], 13: [1, 0], 42: [-1, 0], 24: [-1, 0] });
    close(mm(net, '13', 'dd21'), [0, 0]);
    close(mm(net, '13', 'cd21'), [1, 0]);
    close(mm(net, '13', 'dc21'), [1, 0]);
    close(mm(net, '13', 'cc21'), [0, 0]);
  });

  it('matches a hand calculation for an asymmetric pair', () => {
    // line 1→3 passes 1, line 2→4 passes 0.5j; S11 = 0.2, S22 = 0
    const net = net4({ 31: [1, 0], 13: [1, 0], 42: [0, 0.5], 24: [0, 0.5], 11: [0.2, 0] });
    close(mm(net, '13', 'dd21'), [0.5, 0.25]); // (S31 − S32 − S41 + S42)/2
    close(mm(net, '13', 'cd21'), [0.5, -0.25]); // (S31 − S32 + S41 − S42)/2
    close(mm(net, '13', 'dc21'), [0.5, -0.25]); // (S31 + S32 − S41 − S42)/2
    close(mm(net, '13', 'cc21'), [0.5, 0.25]); // (S31 + S32 + S41 + S42)/2
    close(mm(net, '13', 'dd11'), [0.1, 0]); // (S11 − S12 − S21 + S22)/2
    close(mm(net, '13', 'cd11'), [0.1, 0]);
    close(mm(net, '13', 'cc11'), [0.1, 0]);
    close(mm(net, '13', 'dd22'), [0, 0]);
  });

  it('agrees with the explicit Bockelman–Eisenstadt sums for an arbitrary matrix', () => {
    const entries: Record<string, C> = {};
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    for (let i = 1; i <= 4; i++) for (let j = 1; j <= 4; j++) entries[`${i}${j}`] = [rnd(), rnd()];
    const net = net4(entries);
    for (const conv of ['13', '12'] as const) {
      const { p, n } = pairPorts(conv);
      const S = (i: number, j: number) => entries[`${i + 1}${j + 1}`];
      for (const [x, sx] of [['d', -1], ['c', 1]] as const) {
        for (const [y, sy] of [['d', -1], ['c', 1]] as const) {
          for (let i = 0; i < 2; i++) {
            for (let j = 0; j < 2; j++) {
              const terms: [C, number][] = [[S(p[i], p[j]), 1], [S(p[i], n[j]), sy], [S(n[i], p[j]), sx], [S(n[i], n[j]), sx * sy]];
              const want: C = [0, 0];
              for (const [v, w] of terms) {
                want[0] += (w * v[0]) / 2;
                want[1] += (w * v[1]) / 2;
              }
              close(mm(net, conv, `${x}${y}${i + 1}${j + 1}`), want);
            }
          }
        }
      }
    }
  });

  it('reports the mode references and pairs with unequal port references', () => {
    const out = toMixedMode(net4({}, [50, 50, 50, 75]), '13');
    expect(out.diffRefOhms).toEqual([100, 100]);
    expect(out.commonRefOhms).toEqual([25, 25]);
    expect(out.unequalPairs).toEqual([2]);
    expect(toMixedMode(net4({}), '12').unequalPairs).toEqual([]);
  });
});
