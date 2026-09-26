import { describe, expect, it } from 'vitest';
import { bandsFor, capCode, eia96Code, readBands, readCap, readDielectric, readSmd, smdCode, type BandColor } from './componentCodes';

const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.abs(b) * 1e-12);

describe('resistor colour bands (IEC 60062:2016)', () => {
  it.each<[BandColor[], number, number]>([
    [['yellow', 'violet', 'red', 'gold'], 4700, 5],
    [['brown', 'black', 'orange', 'none'], 10e3, 20],
    [['brown', 'black', 'black', 'brown', 'brown'], 1000, 1],
    [['red', 'red', 'black', 'black', 'red'], 220, 2],
    [['yellow', 'violet', 'gold', 'silver'], 4.7, 10],
    [['green', 'blue', 'silver', 'gold'], 0.56, 5],
    [['orange', 'white', 'white', 'pink', 'violet'], 0.399, 0.1],
    [['brown', 'black', 'white', 'grey'], 10e9, 0.01],
  ])('reads %j', (bands, ohms, tol) => {
    const r = readBands(bands)!;
    near(r.ohms, ohms);
    expect(r.tol).toBe(tol);
  });

  it('reads the temperature coefficient of a sixth band', () => {
    const r = readBands(['brown', 'black', 'black', 'red', 'brown', 'red'])!;
    near(r.ohms, 10e3);
    expect(r.tcr).toBe(50);
  });

  it('rejects colours that cannot stand in a position', () => {
    expect(readBands(['gold', 'violet', 'red', 'gold'])).toBeNull();
    expect(readBands(['yellow', 'violet', 'none', 'gold'])).toBeNull();
    expect(readBands(['yellow', 'violet', 'red', 'white'])).toBeNull();
    expect(readBands(['yellow', 'violet', 'red'])).toBeNull();
  });

  it('encodes values and reports rounding', () => {
    expect(bandsFor(4700, 2)).toEqual({ colors: ['yellow', 'violet', 'red'], ohms: 4700, exact: true });
    expect(bandsFor(4.7, 2)!.colors).toEqual(['yellow', 'violet', 'gold']);
    expect(bandsFor(0.47, 2)!.colors).toEqual(['yellow', 'violet', 'silver']);
    expect(bandsFor(49.9, 3)!.colors).toEqual(['yellow', 'white', 'white', 'gold']);
    const r = bandsFor(4990, 2)!;
    expect(r.exact).toBe(false);
    near(r.ohms, 5000);
    expect(bandsFor(1e12, 2)).toBeNull();
  });

  it('round-trips every E96 value through three-digit bands', () => {
    for (const v of [100, 102, 499, 976]) for (const e of [-2, 0, 3, 6]) {
      const ohms = v * 10 ** e;
      const b = bandsFor(ohms, 3)!;
      expect(b.exact).toBe(true);
      near(readBands([...b.colors, 'brown'])!.ohms, ohms);
    }
  });
});

describe('SMD resistor codes', () => {
  const one = (code: string) => {
    const r = readSmd(code);
    expect(r.length).toBe(1);
    return r[0];
  };
  it.each<[string, number, string]>([
    ['472', 4700, '3-digit'],
    ['100', 10, '3-digit'],
    ['1002', 10e3, '4-digit'],
    ['4R7', 4.7, 'R decimal'],
    ['R10', 0.1, 'R decimal'],
    ['47R5', 47.5, 'R decimal'],
    ['01C', 10e3, 'EIA-96'],
    ['68X', 49.9, 'EIA-96'],
    ['96F', 97.6e6, 'EIA-96'],
    ['01Z', 0.1, 'EIA-96'],
    ['5m0', 0.005, 'milliohm'],
    ['000', 0, 'jumper'],
  ])('reads %s', (code, ohms, kind) => {
    const r = one(code);
    near(r.ohms, ohms);
    expect(r.kind).toBe(kind);
  });

  it('gives both readings of an ambiguous code, EIA-96 first', () => {
    const r = readSmd('10R');
    expect(r.map((x) => x.kind)).toEqual(['EIA-96', 'R decimal']);
    near(r[0].ohms, 1.24);
    near(r[1].ohms, 10);
  });

  it('treats R, S and H as EIA-96 alternatives', () => {
    near(readSmd('01Y')[0].ohms, readSmd('01R')[0].ohms);
    near(readSmd('01X')[0].ohms, readSmd('01S')[0].ohms);
    near(readSmd('01B')[0].ohms, readSmd('01H')[0].ohms);
  });

  it('ignores codes that are not markings', () => {
    expect(readSmd('97A')).toEqual([]);
    expect(readSmd('abc')).toEqual([]);
    expect(readSmd('')).toEqual([]);
  });

  it.each<[number, string | null, string | null, string | null]>([
    [4700, '472', '4701', null],
    [10, '100', '10R0', '01X'],
    [4.7, '4R7', '4R70', null],
    [0.47, 'R47', 'R470', null],
    [49.9, null, '49R9', '68X'],
    [10e3, '103', '1002', '01C'],
    [1.5e6, '155', '1504', '18E'],
    [0, '000', '0000', null],
  ])('encodes %s Ω', (ohms, three, four, eia) => {
    expect(smdCode(ohms, 2)).toBe(three);
    expect(smdCode(ohms, 3)).toBe(four);
    expect(eia96Code(ohms)).toBe(eia);
  });
});

describe('capacitor codes', () => {
  it.each<[string, number]>([
    ['104', 100e-9],
    ['103', 10e-9],
    ['222', 2.2e-9],
    ['105', 1e-6],
    ['479', 4.7e-12],
    ['109', 1e-12],
    ['508', 0.5e-12],
    ['47', 47e-12],
    ['4n7', 4.7e-9],
    ['2p2', 2.2e-12],
    ['4R7', 4.7e-12],
    ['u47', 0.47e-6],
  ])('reads %s', (code, farads) => near(readCap(code)!.farads, farads));

  it('reads tolerance letters and voltage codes', () => {
    const r = readCap('2A104J')!;
    near(r.farads, 100e-9);
    expect(r.voltage).toEqual({ code: '2A', volts: 100 });
    expect(r.tolerance).toEqual({ letter: 'J', text: '±5 %' });
    expect(readCap('104K')!.voltage).toBeUndefined();
    expect(readCap('1H 470 K')!.voltage!.volts).toBe(50);
  });

  it('uses absolute tolerances below 10 pF', () => {
    expect(readCap('4R7C')!.tolerance!.text).toBe('±0.25 pF');
    expect(readCap('100C')!.tolerance!.text).toBe('±0.25 %');
  });

  it('rejects an unused multiplier digit and unreadable text', () => {
    expect(readCap('107')).toBeNull();
    expect(readCap('X7R')).toBeNull();
    expect(readCap('')).toBeNull();
  });

  it.each<[number, string | null]>([
    [100e-9, '104'],
    [10e-6, '106'],
    [4.7e-12, '479'],
    [1e-12, '109'],
    [0.5e-12, '508'],
    [22e-12, '220'],
    [4.75e-9, null],
    [100e-6, null],
  ])('encodes %s F', (f, code) => expect(capCode(f)).toBe(code));
});

describe('dielectric codes (EIA-198)', () => {
  it('reads class 2 codes', () => {
    expect(readDielectric('X7R')).toEqual({ cls: 2, low: -55, high: 125, change: '±15 %' });
    expect(readDielectric('x5r')).toEqual({ cls: 2, low: -55, high: 85, change: '±15 %' });
    expect(readDielectric('Y5V')).toEqual({ cls: 2, low: -30, high: 85, change: '+22 / −82 %' });
  });

  it('reads class 1 codes, with NP0 as C0G', () => {
    expect(readDielectric('C0G')).toEqual({ cls: 1, tempco: 0, tol: 30 });
    expect(readDielectric('NP0')).toEqual({ cls: 1, tempco: 0, tol: 30 });
    expect(readDielectric('U2J')).toEqual({ cls: 1, tempco: -750, tol: 120 });
  });

  it('rejects unknown codes', () => {
    expect(readDielectric('X7Q')).toBeNull();
    expect(readDielectric('ABC')).toBeNull();
  });
});
