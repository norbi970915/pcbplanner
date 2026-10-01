import { describe, expect, it } from 'vitest';
import { crystalPullPpm, driftSecondsPerDay, freqErrorFromPpm } from './electronics';
import { agingPpm, CLOCK_TOLERANCES, compliance, linkOffsetPpm, loadPull, ppmBudget, toleranceById, uartMaxMismatch, type BudgetTerm } from './ppmBudget';

const near = (a: number, b: number, rel = 1e-12) => expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.abs(b) * rel + 1e-15);
const tol = (key: string, ppm: number): BudgetTerm => ({ key, label: key, ppm, kind: 'tol' });

describe('aging', () => {
  it('adds the first year and the yearly figure after it', () => {
    expect(agingPpm(3, 1, 10)).toBe(12);
    expect(agingPpm(3, 1, 1)).toBe(3);
    expect(agingPpm(3, 1, 0.5)).toBe(3); // the first-year figure applies in full
    expect(agingPpm(3, 1, 0)).toBe(0);
    expect(agingPpm(2, 2, 5)).toBe(10); // one figure per year
  });
});

describe('budget sums', () => {
  it('adds ± terms linearly for the worst case and as RSS otherwise', () => {
    const b = ppmBudget([tol('initial', 10), tol('temp', 20), tol('aging', 5), tol('other', 2)]);
    expect(b.tolWorst).toBe(37);
    near(b.tolRss, Math.sqrt(100 + 400 + 25 + 4));
    expect(b.worst).toBe(37);
    expect(b.min).toBe(-37);
    expect(b.max).toBe(37);
  });

  it('shifts the window by a signed offset and adds it to both totals', () => {
    const b = ppmBudget([tol('initial', 30), tol('temp', 40), { key: 'load', label: 'load', ppm: -12, kind: 'offset' }]);
    expect(b.offset).toBe(-12);
    expect(b.min).toBe(-82);
    expect(b.max).toBe(58);
    expect(b.worst).toBe(82);
    near(b.rss, 12 + 50);
  });

  it('treats a negative ± entry as its magnitude', () => {
    expect(ppmBudget([tol('a', -10), tol('b', 10)]).tolWorst).toBe(20);
  });

  it('converts to hertz and drift with the crystal tool helpers', () => {
    near(freqErrorFromPpm(25e6, 50), 1250);
    near(driftSecondsPerDay(50), 4.32);
  });
});

describe('load-capacitance pulling', () => {
  it('uses the crystal tool formula for the offset', () => {
    const r = loadPull(0.005, 2, 18, 17.5, 0)!;
    near(r.offset, crystalPullPpm(0.005, 2, 17.5, 18));
    expect(r.offset).toBeGreaterThan(0); // a lower CL raises the frequency
    expect(r.tol).toBe(0);
  });

  it('takes the larger excursion for ±ΔCL, which is on the low-CL side', () => {
    const r = loadPull(0.005, 2, 18, 18, 2)!;
    near(r.offset, 0);
    const down = crystalPullPpm(0.005, 2, 16, 18);
    const up = crystalPullPpm(0.005, 2, 20, 18);
    expect(Math.abs(down)).toBeGreaterThan(Math.abs(up));
    near(r.tol, Math.abs(down));
    // Cm = 5 fF, C0 = 2 pF: 2.5e-3 · (1/18 − 1/20) · 1e6 ≈ 13.9 ppm
    near(down, 2.5e-3 * (1 / 18 - 1 / 20) * 1e6, 1e-12);
  });

  it('rejects a load uncertainty larger than the load', () => {
    expect(loadPull(0.005, 2, 18, 10, 10)).toBeNull();
    expect(loadPull(0.005, 2, 0, 10, 1)).toBeNull();
  });
});

describe('two-ended links and interfaces', () => {
  it('adds the errors of two independent clocks', () => {
    expect(linkOffsetPpm(50, -30)).toBe(80);
    // USB 2.0 §11.7.1.3: two 500 ppm clocks may differ by 1000 ppm
    expect(linkOffsetPpm(500, 500)).toBe(1000);
  });

  it('carries the specification values', () => {
    const v = Object.fromEntries(CLOCK_TOLERANCES.map((t) => [t.id, t.ppm]));
    expect(v['usb-hs']).toBe(500);
    expect(v['usb-fs']).toBe(2500);
    expect(v['usb-ls']).toBe(15000);
    expect(v['eth-1000t']).toBe(100);
    expect(v['eth-100tx']).toBe(50);
    expect(v.rmii).toBe(50);
    expect(v.pcie).toBe(300);
    expect(v.sata).toBe(350);
    for (const t of CLOCK_TOLERANCES) if (t.id !== 'uart') expect(t.sources.length).toBeGreaterThan(0);
  });

  it('derives the ideal UART limit, (½ − 1/16) / 9.5 ≈ 4.6 % for 8N1', () => {
    near(uartMaxMismatch(9, 16), 0.4375 / 9.5);
    near(toleranceById('uart')!.ppm, 46052.631578947, 1e-9);
  });

  it('checks one clock, or the sum of both ends for a link limit', () => {
    const usb = toleranceById('usb-hs')!;
    expect(compliance(usb, 480, 9999).pass).toBe(true);
    expect(compliance(usb, -520, 0).pass).toBe(false);
    near(compliance(usb, -520, 0).margin, -20);
    const uart = toleranceById('uart')!;
    const c = compliance(uart, 20000, 30000);
    expect(c.error).toBe(50000);
    expect(c.pass).toBe(false);
  });
});
