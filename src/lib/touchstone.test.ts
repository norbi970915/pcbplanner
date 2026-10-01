import { describe, expect, it } from 'vitest';
import { parseS2p, sampleS2p } from './touchstone';

describe('two-port Touchstone reader', () => {
  it('reads v1 RI data with comments and wrapped rows in S11, S21, S12, S22 order', () => {
    const data = parseS2p(`! vendor model\n# MHz S RI R 50\n100 0.1 0 0.5 0 ! first two pairs\n0.25 0 0.2 0\n200 0.2 0 0.25 0 0.125 0 0.4 0`);
    expect(data.points).toHaveLength(2);
    expect(data.points[0].fHz).toBe(100e6);
    expect(data.points[0].s21Db).toBeCloseTo(-6.0206, 3);
    expect(data.points[0].s12Db).toBeCloseTo(-12.0412, 3);
    expect(data.points[0].s11Db).toBeCloseTo(-20, 6);
    expect(data.referenceOhms).toEqual([50, 50]);
    expect(sampleS2p(data.points, 150e6)?.s21Db).toBeCloseTo(-9.0309, 3);
    expect(sampleS2p(data.points, 300e6)).toBeNull();
  });

  it('reads a v2 file with alternate S12/S21 ordering and per-port references', () => {
    const data = parseS2p(`[Version] 2.1\n# GHz S DB R 50\n[Number of Ports] 2\n[Two-Port Data Order] 12_21\n[Number of Frequencies] 1\n[Reference] 50 75\n[Network Data]\n4 -20 0 -12 0 -3 0 -10 0\n[End]`);
    expect(data.points[0]).toMatchObject({ fHz: 4e9, s11Db: -20, s21Db: -3, s12Db: -12, s22Db: -10 });
    expect(data.referenceOhms).toEqual([50, 75]);
  });

  it('reads symmetric MA data and copies S21 to S12', () => {
    const data = parseS2p(`[Version] 2.0\n# GHZ S MA R 50\n[Number of Ports] 2\n[Two-Port Data Order] 21_12\n[Matrix Format] Lower\n[Network Data]\n1 0.1 0 0.5 45 0.2 90\n[End]`);
    expect(data.points[0].s21Db).toBeCloseTo(-6.0206, 3);
    expect(data.points[0].s12Db).toBeCloseTo(data.points[0].s21Db);
    expect(data.points[0].s22Db).toBeCloseTo(-13.9794, 3);
  });

  it('accepts a declared Touchstone 1.1 file', () => {
    const data = parseS2p('[Version] 1.1\n# GHz S MA R 50\n1 0.1 0 0.5 0 0.5 0 0.1 0');
    expect(data.version).toBe('1.1');
    expect(data.points[0].s21Db).toBeCloseTo(-6.0206, 3);
  });

  it('rejects incomplete, unordered, non-S, mixed-mode and multi-port data', () => {
    expect(() => parseS2p('# GHz S MA R 50\n1 0.1 0')).toThrow(/Incomplete/);
    expect(() => parseS2p('# GHz S MA R 50\n1 0.1 0 0.5 0 0.5 0 0.1 0\n1 0.1 0 0.5 0 0.5 0 0.1 0')).toThrow(/strictly increasing/);
    expect(() => parseS2p('# GHz Z RI R 50\n1 0.1 0 0.5 0 0.5 0 0.1 0')).toThrow(/S-parameters only/);
    expect(() => parseS2p('[Version] 2.1\n# GHz S MA R 50\n[Number of Ports] 4\n[Mixed-Mode Order] D1,2\n[Network Data]\n1 0.1 0\n[End]')).toThrow(/two-port/);
    expect(() => parseS2p('[Version] 2.1\n# GHz S MA R 50\n[Number of Ports] 2\n[Two-Port Data Order] 21_12\n[Mixed-Mode Order] D1,2\n[Network Data]\n1 0.1 0 0.5 0 0.5 0 0.1 0\n[End]')).toThrow(/Mixed-mode/);
  });

  it('rejects a mismatched declared frequency count', () => {
    expect(() => parseS2p('[Version] 2.0\n# GHz S MA R 50\n[Number of Ports] 2\n[Two-Port Data Order] 21_12\n[Number of Frequencies] 2\n[Network Data]\n1 0.1 0 0.5 0 0.5 0 0.1 0\n[End]')).toThrow(/contains 1/);
  });
});
