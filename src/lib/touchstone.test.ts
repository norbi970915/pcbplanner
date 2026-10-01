import { describe, expect, it } from 'vitest';
import { parseTouchstone, portsFromFileName, type Network } from './touchstone';

/** S(i, j) at frequency point k, 1-based port numbers, as [re, im]. */
const s = (net: Network, k: number, i: number, j: number): [number, number] => {
  const n = net.ports;
  const p = k * n * n + (i - 1) * n + (j - 1);
  return [net.re[p], net.im[p]];
};
const ma = (mag: number, deg: number): [number, number] => [mag * Math.cos((deg * Math.PI) / 180), mag * Math.sin((deg * Math.PI) / 180)];
const close = (a: [number, number], b: [number, number], digits = 9) => {
  expect(a[0]).toBeCloseTo(b[0], digits);
  expect(a[1]).toBeCloseTo(b[1], digits);
};
// complex helpers for hand-computed conversions
type C = [number, number];
const add = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
const sub = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]];
const div = (a: C, b: C): C => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};

// Touchstone 2.1 specification, Example 15 (version 1.0, 4-port, rows on separate lines)
const EXAMPLE_15 = `! 4-port S-parameter data, taken at three frequency points
! note that data points need not be aligned
# GHz S MA R 50
5.00000 0.60 161.24 0.40 -42.20 0.42 -66.58 0.53 -79.34 ! row 1
        0.40 -42.20 0.60 161.20 0.53 -79.34 0.42 -66.58 ! row 2
        0.42 -66.58 0.53 -79.34 0.60 161.24 0.40 -42.20 ! row 3
        0.53 -79.34 0.42 -66.58 0.40 -42.20 0.60 161.24 ! row 4

6.00000 0.57 150.37 0.40 -44.34 0.41 -81.24 0.57 -95.77 ! row 1
        0.40 -44.34 0.57 150.37 0.57 -95.77 0.41 -81.24 ! row 2
        0.41 -81.24 0.57 -95.77 0.57 150.37 0.40 -44.34 ! row 3
        0.57 -95.77 0.41 -81.24 0.40 -44.34 0.57 150.37 ! row 4

7.00000 0.50 136.69 0.45 -46.41 0.37 -99.09 0.62 -114.19 ! row 1
        0.45  -46.41 0.50  136.69 0.62 -114.19 0.37 -99.09 ! row 2
        0.37  -99.09 0.62 -114.19 0.50  136.69 0.45 -46.41 ! row 3
        0.62 -114.19 0.37  -99.09 0.45  -46.41 0.50 136.69 ! row 4
`;

// Example 6 (Full) and Example 7 (Lower, [Reference] split over two lines)
const EXAMPLE_6 = `! 4-port S-parameter data
[Version] 2.1
# GHz S MA R 50
[Number of Ports] 4
[Number of Frequencies] 1
[Reference] 50 75 0.01 0.01
[Matrix Format] Full
[Network Data]
5.00000 0.60 161.24 0.40 -42.20 0.42 -66.58 0.53 -79.34 ! row 1
        0.40 -42.20 0.60 161.20 0.53 -79.34 0.42 -66.58 ! row 2
        0.42 -66.58 0.53 -79.34 0.60 161.24 0.40 -42.20 ! row 3
        0.53 -79.34 0.42 -66.58 0.40 -42.20 0.60 161.24 ! row 4
[End]
`;
const EXAMPLE_7 = `! 4-port S-parameter data
! Note that [Reference] arguments are split across two lines
[Version] 2.1
# GHz S MA R 50
[Number of Ports] 4
[Number of Frequencies] 1
[Reference] 50 75
0.01 0.01
[Matrix Format] Lower
[Network Data]
5.00000 0.60 161.24                                 ! row 1
        0.40 -42.20 0.60 161.20                     ! row 2
        0.42 -66.58 0.53 -79.34 0.60 161.24         ! row 3
        0.53 -79.34 0.42 -66.58 0.40 -42.20 0.60 161.24 ! row 4
[End]
`;

describe('Touchstone 1.x', () => {
  it('reads the 2-port column order N11 N21 N12 N22 with comments', () => {
    const net = parseTouchstone('! vendor model\n# MHz S RI R 50\n100 0.1 0.01 0.5 0.02 0.25 0.03 0.2 0.04 ! trailing comment\n200 0.2 0 0.25 0 0.125 0 0.4 0', { ports: 2 });
    expect(net.ports).toBe(2);
    expect(net.version).toBe('1.0');
    expect(Array.from(net.freq)).toEqual([100e6, 200e6]);
    close(s(net, 0, 1, 1), [0.1, 0.01]);
    close(s(net, 0, 2, 1), [0.5, 0.02]);
    close(s(net, 0, 1, 2), [0.25, 0.03]);
    close(s(net, 0, 2, 2), [0.2, 0.04]);
    expect(net.referenceOhms).toEqual([50, 50]);
  });

  it('reads 1-port MA and DB data in every frequency unit', () => {
    for (const [unit, scale] of [['Hz', 1], ['kHz', 1e3], ['MHz', 1e6], ['GHz', 1e9]] as const) {
      const net = parseTouchstone(`# ${unit} S MA R 50\n2.000 0.894 -12.136`, { ports: 1 });
      expect(net.freq[0]).toBeCloseTo(2 * scale, 6);
      close(s(net, 0, 1, 1), ma(0.894, -12.136));
    }
    const db = parseTouchstone('# GHz S DB R 50\n1 -20 90', { ports: 1 });
    close(s(db, 0, 1, 1), [0, 0.1]);
  });

  it('uses the defaults GHz, S, MA and 50 Ω for an empty option line', () => {
    const net = parseTouchstone('#\n1 0.5 0', { ports: 1 });
    expect(net.freq[0]).toBe(1e9);
    expect(net.format).toBe('MA');
    expect(net.referenceOhms).toEqual([50]);
  });

  it('reads the 4-port multi-line record of specification Example 15', () => {
    const net = parseTouchstone(EXAMPLE_15, { ports: 4 });
    expect(net.freq.length).toBe(3);
    expect(Array.from(net.freq)).toEqual([5e9, 6e9, 7e9]);
    close(s(net, 0, 1, 1), ma(0.6, 161.24));
    close(s(net, 0, 1, 3), ma(0.42, -66.58));
    close(s(net, 0, 2, 2), ma(0.6, 161.2));
    close(s(net, 2, 3, 4), ma(0.45, -46.41));
    close(s(net, 2, 4, 1), ma(0.62, -114.19));
  });

  it('reads a 3-port with one matrix row per line', () => {
    const net = parseTouchstone('# GHz S RI R 50\n1 11 0 12 0 13 0\n21 0 22 0 23 0\n31 0 32 0 33 0\n2 11 1 12 1 13 1\n21 1 22 1 23 1\n31 1 32 1 33 1', { ports: 3 });
    for (let i = 1; i <= 3; i++) for (let j = 1; j <= 3; j++) close(s(net, 1, i, j), [10 * i + j, 1]);
  });

  it('reads an 8-port whose rows wrap after four pairs', () => {
    const lines: string[] = ['# GHz S RI R 50'];
    for (let f = 1; f <= 3; f++) {
      for (let i = 1; i <= 8; i++) {
        const pairs = Array.from({ length: 8 }, (_, j) => `${i}.${j + 1} ${-f}`);
        lines.push(`${i === 1 ? f : ''} ${pairs.slice(0, 4).join(' ')}`.trim());
        lines.push(pairs.slice(4).join(' '));
      }
    }
    const net = parseTouchstone(lines.join('\n'), { ports: 8 });
    expect(net.ports).toBe(8);
    expect(net.freq.length).toBe(3);
    close(s(net, 2, 7, 5), [7.5, -3]);
    close(s(net, 0, 8, 8), [8.8, -1]);
  });

  it('reads per-port references of version 1.1', () => {
    const net = parseTouchstone('# S GHz RI R 0.1 75.0\n1 0 0 1 0 1 0 0 0', { ports: 2 });
    expect(net.version).toBe('1.1');
    expect(net.referenceOhms).toEqual([0.1, 75]);
  });

  it('skips the noise data of specification Example 19', () => {
    const net = parseTouchstone(`! 2-port network, S-parameter and noise data
! Default MA format, GHz frequencies, 50-ohm reference, S-parameters
#
! NETWORK PARAMETERS
2  0.95  -26  3.57 157 0.04 76 0.66 -14
22 0.60 -144  1.30  40 0.14 40 0.56 -85
! NOISE PARAMETERS
4  0.7 0.64  69 0.38
18 2.7 0.46 -33 0.40`, { ports: 2 });
    expect(net.freq.length).toBe(2);
    expect(net.noiseLines).toBe(2);
    close(s(net, 1, 2, 1), ma(1.3, 40));
  });

  it('ignores option lines after the first, reads a BOM and CR-only line ends', () => {
    const net = parseTouchstone('﻿# GHz S RI R 50\r1 0.5 0\r# MHz S DB R 75\r2 0.25 0', { ports: 1 });
    expect(Array.from(net.freq)).toEqual([1e9, 2e9]);
    expect(net.referenceOhms).toEqual([50]);
  });

  it('takes the port count from the file extension', () => {
    expect(portsFromFileName('via.s4p')).toBe(4);
    expect(portsFromFileName('BOARD.S12P')).toBe(12);
    expect(portsFromFileName('model.ts')).toBeNull();
    expect(() => parseTouchstone('# GHz S MA R 50\n1 0.1 0')).toThrow(/file extension/);
  });
});

describe('Touchstone 2.x', () => {
  it('reads Full and Lower 4-port matrices of Examples 6 and 7 identically', () => {
    const full = parseTouchstone(EXAMPLE_6);
    const lower = parseTouchstone(EXAMPLE_7);
    expect(lower.matrix).toBe('Lower');
    expect(lower.referenceOhms).toEqual([50, 75, 0.01, 0.01]);
    expect(full.referenceOhms).toEqual([50, 75, 0.01, 0.01]);
    for (let i = 0; i < 16; i++) {
      expect(lower.re[i]).toBeCloseTo(full.re[i], 12);
      expect(lower.im[i]).toBeCloseTo(full.im[i], 12);
    }
    close(s(lower, 0, 1, 2), ma(0.4, -42.2));
    close(s(lower, 0, 3, 4), ma(0.4, -42.2));
  });

  it('reads an Upper 3-port matrix', () => {
    const net = parseTouchstone('[Version] 2.0\n# GHz S RI\n[Number of Ports] 3\n[Number of Frequencies] 1\n[Matrix Format] Upper\n[Network Data]\n1 11 0 12 0 13 0\n22 0 23 0\n33 0\n[End]');
    close(s(net, 0, 2, 1), [12, 0]);
    close(s(net, 0, 3, 2), [23, 0]);
    close(s(net, 0, 1, 3), [13, 0]);
    close(s(net, 0, 3, 3), [33, 0]);
  });

  it('follows [Two-Port Data Order] and reads a Lower 2-port as 11, 21, 22', () => {
    const head = (order: string) => `[Version] 2.1\n# GHz S DB R 50\n[Number of Ports] 2\n[Two-Port Data Order] ${order}\n[Number of Frequencies] 1\n[Reference] 50 75\n[Network Data]\n`;
    const a = parseTouchstone(`${head('12_21')}4 -20 0 -12 0 -3 0 -10 0\n[End]`);
    expect(20 * Math.log10(Math.hypot(...s(a, 0, 1, 2)))).toBeCloseTo(-12, 9);
    expect(20 * Math.log10(Math.hypot(...s(a, 0, 2, 1)))).toBeCloseTo(-3, 9);
    expect(a.referenceOhms).toEqual([50, 75]);
    const b = parseTouchstone(`${head('21_12')}4 -20 0 -12 0 -3 0 -10 0\n[End]`);
    expect(20 * Math.log10(Math.hypot(...s(b, 0, 2, 1)))).toBeCloseTo(-12, 9);
    const c = parseTouchstone(`[Version] 2.0\n# GHZ S MA R 50\n[Number of Ports] 2\n[Two-Port Data Order] 21_12\n[Number of Frequencies] 1\n[Matrix Format] Lower\n[Network Data]\n1 0.1 0\n0.5 45 0.2 90\n[End]`);
    close(s(c, 0, 1, 2), ma(0.5, 45));
    close(s(c, 0, 2, 1), ma(0.5, 45));
    close(s(c, 0, 2, 2), ma(0.2, 90));
  });

  it('reads a frequency record split over lines and several records on one line is rejected', () => {
    const ok = parseTouchstone('[Version] 2.1\n# GHz S RI\n[Number of Ports] 2\n[Two-Port Data Order] 21_12\n[Number of Frequencies] 1\n[Network Data]\n1\n0.1 0\n0.2 0 0.3 0\n0.4 0\n[End]');
    close(s(ok, 0, 2, 2), [0.4, 0]);
    expect(() => parseTouchstone('[Version] 2.1\n# GHz S RI\n[Number of Ports] 1\n[Number of Frequencies] 2\n[Network Data]\n1 0.1 0 2 0.2 0\n[End]')).toThrow(/Line 6: a frequency point must start on a new line/);
  });

  it('skips noise data and information blocks (Example 18)', () => {
    const net = parseTouchstone(`! 2-port network, S-parameter and noise data
[Version] 2.1
#
[Number of Ports] 2
[Two-Port Data Order] 21_12
[Number of Frequencies] 2
[Number of Noise Frequencies] 2
[Reference] 50 25.0
[Begin Information]
[End Information]
[Network Data]
2  0.95  -26 3.57 157 0.04 76 0.66 -14
22 0.60 -144 1.30  40 0.14 40 0.56 -85
[Noise Data]
4  0.7 0.64  69 19
18 2.7 0.46 -33 20
[End]`);
    expect(net.noiseLines).toBe(2);
    expect(net.referenceOhms).toEqual([50, 25]);
    close(s(net, 0, 2, 1), ma(3.57, 157));
  });

  it('rejects malformed files with the line number', () => {
    const v2 = (body: string) => `[Version] 2.1\n# GHz S MA R 50\n[Number of Ports] 1\n[Number of Frequencies] 2\n[Network Data]\n${body}\n[End]`;
    expect(() => parseTouchstone(v2('1 0.1 0\n2 0.1 abc'))).toThrow(/Line 7: "abc" is not a number/);
    expect(() => parseTouchstone(v2('1 0.1 0\n1 0.1 0'))).toThrow(/Line 7: the frequency 1 is not above/);
    expect(() => parseTouchstone(v2('1 0.1 0\n2 0.1'))).toThrow(/Line 7: the last frequency point is incomplete/);
    expect(() => parseTouchstone(v2('1 0.1 0'))).toThrow(/Number of Frequencies\] is 2, but the file contains 1/);
    expect(() => parseTouchstone(v2('1 -0.1 0\n2 0.1 0'))).toThrow(/Line 6: a magnitude cannot be negative/);
    expect(() => parseTouchstone('[Version] 2.1\n# GHz S MA R 50\n[Number of Ports] 1\n[Number of Frequencies] 1\n[Network Data]\n1 0.1 0')).toThrow(/does not end with \[End\]/);
    expect(() => parseTouchstone(`${v2('1 0.1 0\n2 0.1 0')}\n3 0 0`)).toThrow(/Line 9: content after \[End\]/);
    expect(() => parseTouchstone('[Version] 2.1\n# GHz S MA R 50\n[Number of Ports] 1\n[Network Data]\n1 0 0\n[End]')).toThrow(/Number of Frequencies\] is required/);
    expect(() => parseTouchstone('[Version] 3.0\n# GHz S MA R 50\n1 0.1 0')).toThrow(/Line 1: unsupported \[Version\]/);
    expect(() => parseTouchstone('[Version] 2.1\n# GHz S MA R 50\n[Number of Ports] 1\n[Frequency Unit] GHz')).toThrow(/Line 4: unknown keyword/);
    expect(() => parseTouchstone('[Version] 2.1\n# GHz S MA R 50\n[Number of Frequencies] 1')).toThrow(/Line 3: \[Number of Ports\] must be the first keyword/);
    expect(() => parseTouchstone('[Version] 2.1\n# GHz S MA R 50\n[Number of Ports] 2\n[Reference] 50\n[Network Data]')).toThrow(/Line 4: \[Reference\] lists 1 of 2/);
    expect(() => parseTouchstone('# GHz S MA Q 50\n1 0 0', { ports: 1 })).toThrow(/Line 1: unknown option-line entry "Q"/);
    expect(() => parseTouchstone('1 0.1 0\n# GHz S MA R 50', { ports: 1 })).toThrow(/Line 1: data before the option line/);
    expect(() => parseTouchstone('# GHz S MA R 50\n1 0.1 0 0.5 0 0.5 0 0.1 0', { ports: 4 })).toThrow(/incomplete/);
    expect(() => parseTouchstone('# GHz S MA R 50\n1 0.1 0 0.5 0 0.5 0 0.1 0\n2 0.1 0 0.5 0 0.5 0 0.1 0\n3 0.1 0 0.5 0 0.5 0 0.1 0\n4 0.1 0 0.5 0 0.5 0 0.1 0', { ports: 4 })).toThrow(/Line 5: a frequency point must start on a new line/);
  });

  it('reads a file that declares [Version] 1.x as a version 1 file, with a note', () => {
    const a = parseTouchstone('! exporter output\n[Version] 1.1\n# GHz S MA R 50 75\n1 0.1 0 0.5 0 0.5 0 0.1 0', { ports: 2 });
    expect(a.version).toBe('1.1');
    expect(a.referenceOhms).toEqual([50, 75]);
    close(s(a, 0, 2, 1), [0.5, 0]);
    expect(a.notes.join(' ')).toMatch(/declares \[Version\] 1\.1, which the specification does not define; it was read as a version 1 file/);
    const b = parseTouchstone('[Version] 1.0\n# GHz S MA R 50\n1 0.1 0', { ports: 1 });
    expect(b.version).toBe('1.0');
    expect(b.notes).toHaveLength(1);
    expect(() => parseTouchstone('[Version] 1.0\n[Number of Ports] 1\n# GHz S MA R 50\n1 0.1 0', { ports: 1 })).toThrow(/Line 2/);
    expect(() => parseTouchstone('[Version] 1.0\n# GHz S MA R 50\n1 0.1 0')).toThrow(/file extension/);
  });

  it('assumes 21_12 for a 2-port without [Two-Port Data Order] (Example 20), with a note', () => {
    const net = parseTouchstone(`! 2-port network, S-parameter and noise data
! Default MA format, GHz frequencies, 50-ohm reference, S-parameters
[Version] 2.1
#
[Number of Ports] 2
[Number of Frequencies] 2
[Number of Noise Frequencies] 2
[Reference] 50 25.0
[Network Data]
! NETWORK PARAMETERS
2  0.95  -26 3.57 157 0.04 76 0.66 -14
22 0.60 -144 1.30 40  0.14 40 0.56 -85
[Noise Data]
! NOISE PARAMETERS
4  0.7 0.64  69 19
18 2.7 0.46 -33 20
[End]`);
    expect(net.twoPortOrder).toBe('21_12');
    close(s(net, 0, 2, 1), ma(3.57, 157));
    close(s(net, 0, 1, 2), ma(0.04, 76));
    expect(net.noiseLines).toBe(2);
    expect(net.notes.join(' ')).toMatch(/no \[Two-Port Data Order\].*21_12.*S21 and S12 are swapped/);
  });

  it('rejects mixed-mode, H- and G-parameter files', () => {
    expect(() => parseTouchstone('[Version] 2.1\n# GHz S MA R 50\n[Number of Ports] 4\n[Number of Frequencies] 1\n[Mixed-Mode Order] D1,2 D3,4 C1,2 C3,4')).toThrow(/Line 5: mixed-mode/);
    expect(() => parseTouchstone('# kHz H MA R 1\n2 0.95 -26 3.57 157 0.04 76 0.66 -14', { ports: 2 })).toThrow(/H-parameter/);
    expect(() => parseTouchstone('# MHz G DB R 1\n2 0 0 0 0 0 0 0 0', { ports: 2 })).toThrow(/G-parameter/);
  });
});

describe('Y and Z conversion to S', () => {
  it('converts normalised Z of Example 10 and un-normalised Z of Example 11', () => {
    const ex10 = parseTouchstone('! 1-port Z-parameter file, multiple frequency points\n# MHz Z MA R 75\n! freq  magZ11 angZ11\n100 0.99 -4\n200 0.80 -22\n300 0.707 -45\n400 0.40 -62\n500 0.01 -89', { ports: 1 });
    const z = ma(0.99, -4);
    close(s(ex10, 0, 1, 1), div(sub(z, [1, 0]), add(z, [1, 0])), 12);
    expect(ex10.parameter).toBe('Z');
    const ex11 = parseTouchstone('[Version] 2.1\n# MHz Z MA\n[Number of Ports] 1\n[Number of Frequencies] 5\n[Reference] 20.0\n[Network Data]\n! freq  magZ11 angZ11\n100    74.25    -4\n200    60      -22\n300    53.025  -45\n400    30      -62\n500     0.75   -89\n[End]');
    const Z = ma(74.25, -4);
    close(s(ex11, 0, 1, 1), div(sub(Z, [20, 0]), add(Z, [20, 0])), 12);
  });

  it('converts the Y-matrix of a series impedance with equal and unequal references', () => {
    const zs: C = [25, 10];
    const y = div([1, 0], zs);
    const file = (refs: string) => `[Version] 2.1\n# GHz Y RI\n[Number of Ports] 2\n[Two-Port Data Order] 12_21\n[Number of Frequencies] 1\n[Reference] ${refs}\n[Network Data]\n1 ${y[0]} ${y[1]} ${-y[0]} ${-y[1]} ${-y[0]} ${-y[1]} ${y[0]} ${y[1]}\n[End]`;
    const eq = parseTouchstone(file('50 50'));
    close(s(eq, 0, 1, 1), div(zs, add(zs, [100, 0])), 12);
    close(s(eq, 0, 2, 1), div([100, 0], add(zs, [100, 0])), 12);
    // power waves with R1 = 50, R2 = 75: S11 = (Zs + R2 − R1)/(Zs + R1 + R2), S21 = 2√(R1 R2)/(Zs + R1 + R2)
    const un = parseTouchstone(file('50 75'));
    const den = add(zs, [125, 0]);
    close(s(un, 0, 1, 1), div(add(zs, [25, 0]), den), 12);
    close(s(un, 0, 2, 2), div(sub(zs, [25, 0]), den), 12);
    close(s(un, 0, 2, 1), div([2 * Math.sqrt(50 * 75), 0], den), 12);
    close(s(un, 0, 1, 2), div([2 * Math.sqrt(50 * 75), 0], den), 12);
  });

  it('converts the Z-matrix of a shunt impedance', () => {
    const net = parseTouchstone('[Version] 2.0\n# GHz Z RI R 50\n[Number of Ports] 2\n[Two-Port Data Order] 21_12\n[Number of Frequencies] 1\n[Network Data]\n1 30 0 30 0 30 0 30 0\n[End]');
    close(s(net, 0, 1, 1), [-50 / 110, 0], 12);
    close(s(net, 0, 2, 1), [60 / 110, 0], 12);
  });
});

describe('performance', () => {
  it('parses a 10 000-point 4-port file in well under a second', () => {
    const lines: string[] = ['! generated', '# GHz S RI R 50'];
    for (let k = 1; k <= 10_000; k++) {
      const f = (k * 0.004).toFixed(4);
      for (let i = 0; i < 4; i++) {
        const row = Array.from({ length: 4 }, (_, j) => `${(0.1 * (i + 1) + 0.01 * j).toFixed(6)} ${(-0.001 * k).toFixed(6)}`).join(' ');
        lines.push(i ? `        ${row}` : `${f} ${row}`);
      }
    }
    const text = lines.join('\n');
    const t0 = performance.now();
    const net = parseTouchstone(text, { ports: 4 });
    const ms = performance.now() - t0;
    expect(net.freq.length).toBe(10_000);
    expect(net.freq[9999]).toBeCloseTo(40e9, 0);
    close(s(net, 9999, 3, 2), [0.31, -10], 9);
    expect(ms).toBeLessThan(500);
  });
});
