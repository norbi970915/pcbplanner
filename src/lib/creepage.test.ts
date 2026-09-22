import { describe, expect, it } from 'vitest';
import { F2, F4 } from '../data/iec60664';
import { altitudeFactor, clearance, creepage, ratedImpulse, reinforcedImpulse } from './creepage';

describe('IEC 60664-1 table integrity', () => {
  it('F.2 rows ascend and clearances never decrease with voltage', () => {
    for (let i = 1; i < F2.length; i++) {
      expect(F2[i].kv).toBeGreaterThan(F2[i - 1].kv);
      for (let c = 0; c < 3; c++) {
        expect(F2[i].a[c]).toBeGreaterThanOrEqual(F2[i - 1].a[c]);
        expect(F2[i].b[c]).toBeGreaterThanOrEqual(F2[i - 1].b[c]);
      }
    }
  });
  it('F.4 rows ascend, creepage grows with voltage, PD and material group', () => {
    for (let i = 1; i < F4.length; i++) {
      expect(F4[i].v).toBeGreaterThan(F4[i - 1].v);
      expect(F4[i].pd1).toBeGreaterThanOrEqual(F4[i - 1].pd1);
      for (let g = 0; g < 3; g++) expect(F4[i].pd2[g]).toBeGreaterThanOrEqual(F4[i - 1].pd2[g]);
    }
    for (const r of F4) {
      expect(r.pd2[0]).toBeLessThanOrEqual(r.pd2[1]);
      expect(r.pd2[1]).toBeLessThanOrEqual(r.pd2[2]);
      if (r.pd3) for (let g = 0; g < 3; g++) expect(r.pd3[g]).toBeGreaterThan(r.pd2[g]);
    }
  });
});

describe('Table F.1 rated impulse voltage', () => {
  it('230/400 V mains, OVC II → 2500 V; 120 V (150 V row) OVC II → 1500 V', () => {
    expect(ratedImpulse(230, 2)).toEqual({ v: 2500, row: 300 });
    expect(ratedImpulse(120, 2)).toEqual({ v: 1500, row: 150 });
    expect(ratedImpulse(48, 1)).toEqual({ v: 330, row: 50 });
    expect(ratedImpulse(1200, 2)).toBeNull();
  });
  it('reinforced: one preferred step up, else 160 %', () => {
    expect(reinforcedImpulse(2500)).toBe(4000);
    expect(reinforcedImpulse(1500)).toBe(2500);
    expect(reinforcedImpulse(3000)).toBeCloseTo(4800, 9);
  });
});

describe('Table F.2 clearance', () => {
  it('reads the table: 2.5 kV case A PD2 = 1.5 mm; 4 kV = 3.0 mm; case B 4 kV = 1.2 mm', () => {
    expect(clearance(2.5, 'A', 2, false, false).mm).toBe(1.5);
    expect(clearance(4, 'A', 2, false, false).mm).toBe(3.0);
    expect(clearance(4, 'B', 2, false, false).mm).toBe(1.2);
  });
  it('PD2 floor is 0.2 mm, PD3 floor 0.8 mm; printed wiring at PD2 uses PD1 but ≥ 0.04 mm', () => {
    expect(clearance(0.5, 'A', 2, false, false).mm).toBe(0.2);
    expect(clearance(0.5, 'A', 3, false, false).mm).toBe(0.8);
    expect(clearance(0.5, 'A', 2, true, false).mm).toBe(0.04);
    expect(clearance(0.33, 'A', 2, true, false).mm).toBe(0.04);
    expect(clearance(0.8, 'A', 2, true, false).mm).toBe(0.1);
    expect(clearance(1.2, 'A', 2, true, false).mm).toBe(0.25); // not a floor row for case A
  });
  it('PD4 = PD3 but at least 1.6 mm', () => {
    expect(clearance(1.5, 'A', 4, false, false).mm).toBe(1.6);
    expect(clearance(4, 'A', 4, false, false).mm).toBe(3.0);
  });
  it('between rows: next higher row, or linear interpolation when chosen', () => {
    expect(clearance(3.5, 'A', 2, false, false)).toMatchObject({ mm: 3.0, rowKv: 4 });
    expect(clearance(3.5, 'A', 2, false, true).mm).toBeCloseTo(2.5, 12);
    expect(clearance(120, 'A', 2, false, false).outOfRange).toBe(true);
  });
});

describe('Table F.4 creepage', () => {
  it('reads the table: 250 V PD2 MG IIIa = 2.5 mm, MG I = 1.25 mm; printed wiring PD2 = 1.0 mm', () => {
    expect(creepage(250, 2, 'IIIa', false, false, false).mm).toBe(2.5);
    expect(creepage(250, 2, 'I', false, false, false).mm).toBe(1.25);
    expect(creepage(250, 2, 'IIIa', true, false, false).mm).toBe(1.0);
    expect(creepage(250, 1, 'IIIb', true, false, false).mm).toBe(0.56);
  });
  it('printed wiring PD2 does not apply to IIIb', () => {
    expect(creepage(250, 2, 'IIIb', true, false, false).mm).toBe(2.5);
  });
  it('rib values only at PD3 where bracketed', () => {
    expect(creepage(630, 3, 'I', false, true, false).mm).toBe(7.9);
    expect(creepage(500, 3, 'I', false, true, false).mm).toBe(6.3);
    expect(creepage(500, 3, 'IIIa', false, true, false).mm).toBe(7.9);
  });
  it('interpolation is linear between rows; below 10 V uses the 10 V row', () => {
    expect(creepage(225, 2, 'IIIa', false, false, true).mm).toBeCloseTo(2.25, 12);
    expect(creepage(225, 2, 'IIIa', false, false, false).mm).toBe(2.5);
    expect(creepage(5, 2, 'I', false, false, false).mm).toBe(0.4);
  });
  it('printed wiring columns stop at 1000 V; the general column takes over', () => {
    const r = creepage(1100, 2, 'I', true, false, false);
    expect(r.mm).toBe(6.3);
    expect(r.column).toContain('PD2, material group I');
  });
  it('PD3 above 10 kV and PD4 are not covered', () => {
    expect(creepage(12500, 3, 'I', false, false, false).mm).toBeNaN();
    expect(creepage(100, 4, 'I', false, false, false).mm).toBeNaN();
    expect(creepage(12500, 2, 'I', false, false, false).provisional).toBe(true);
  });
});

describe('Table A.2 altitude', () => {
  it('1 up to 2000 m, next higher row above', () => {
    expect(altitudeFactor(1500)?.k).toBe(1);
    expect(altitudeFactor(3000)?.k).toBe(1.14);
    expect(altitudeFactor(3500)?.k).toBe(1.29);
    expect(altitudeFactor(25000)).toBeNull();
  });
});
