// Frequency-accuracy budget of a crystal or oscillator, in ppm, and the clock tolerances of
// common interfaces. Tolerance terms are ± half-widths; the load-capacitance error is a signed
// offset that shifts the whole window. Capacitances in pF.
import type { DataSource } from '../data/source';
import { interfaceById } from '../data/interfaces';
import { crystalPullPpm } from './electronics';

/**
 * Aging over a service life from the two figures datasheets give: the first year, then a figure
 * per year after it. Less than a year still counts the whole first-year figure, because crystal
 * aging is fastest at the start. A datasheet that gives one figure per year: use it for both.
 */
export function agingPpm(firstYear: number, perYearAfter: number, years: number): number {
  if (!(years > 0)) return 0;
  return years <= 1 ? firstYear : firstYear + perYearAfter * (years - 1);
}

export interface LoadPull {
  offset: number; // signed ppm at the fitted load
  tol: number; // ± ppm for a ±dCl uncertainty of the load
}

/**
 * Pulling from a load capacitance other than the one the crystal was calibrated at, with the same
 * motional-capacitance model as the crystal tool (crystalPullPpm). cm in pF (fF × 1e-3).
 * The tolerance is the larger excursion for CL ± dCl; the curve is steeper at the smaller CL.
 * Returns null when CL − dCl would not be positive.
 */
export function loadPull(cm: number, c0: number, clSpec: number, clActual: number, dCl: number): LoadPull | null {
  if (!(cm >= 0 && c0 >= 0 && clSpec > 0 && clActual > 0 && dCl >= 0) || !(clActual - dCl > 0)) return null;
  const at = (cl: number) => crystalPullPpm(cm, c0, cl, clSpec);
  const offset = at(clActual);
  const tol = Math.max(Math.abs(at(clActual - dCl) - offset), Math.abs(at(clActual + dCl) - offset));
  return { offset, tol };
}

export interface BudgetTerm {
  key: string;
  label: string;
  ppm: number; // ± half-width, or the signed value of an offset
  kind: 'tol' | 'offset';
}

export interface Budget {
  terms: BudgetTerm[];
  offset: number; // sum of the signed offsets
  tolWorst: number; // linear sum of the ± terms
  tolRss: number; // root-sum-square of the ± terms
  worst: number; // largest |error|: |offset| + tolWorst
  rss: number; // |offset| + tolRss
  min: number; // worst-case window, offset ∓ tolWorst
  max: number;
}

/** Worst case adds every ± term linearly; RSS assumes they are independent. Offsets add to both. */
export function ppmBudget(terms: readonly BudgetTerm[]): Budget {
  const tols = terms.filter((t) => t.kind === 'tol').map((t) => Math.abs(t.ppm));
  const offset = terms.filter((t) => t.kind === 'offset').reduce((s, t) => s + t.ppm, 0);
  const tolWorst = tols.reduce((s, v) => s + v, 0);
  const tolRss = Math.sqrt(tols.reduce((s, v) => s + v * v, 0));
  return { terms: [...terms], offset, tolWorst, tolRss, worst: Math.abs(offset) + tolWorst, rss: Math.abs(offset) + tolRss, min: offset - tolWorst, max: offset + tolWorst };
}

/** Largest frequency offset between two independent clocks: their worst-case errors add. */
export const linkOffsetPpm = (a: number, b: number) => Math.abs(a) + Math.abs(b);

/**
 * Largest relative clock mismatch an ideal UART receiver tolerates. It finds the start edge within
 * one sample (1/oversampling of a bit) and samples every bit at its centre by its own clock; the
 * centre of the stop bit, bitsBeforeStop + ½ bits after the edge, must stay inside the stop bit.
 */
export const uartMaxMismatch = (bitsBeforeStop: number, oversampling: number) => (0.5 - 1 / oversampling) / (bitsBeforeStop + 0.5);

export interface ClockTolerance {
  id: string;
  label: string;
  /** Limit in ppm: for 'each', every clock against nominal; for 'link', the two ends against each other. */
  ppm: number;
  scope: 'each' | 'link';
  detail: string;
  sources: DataSource[];
}

const USB2: DataSource = {
  title: 'Universal Serial Bus Specification Rev 2.0 (27 April 2000)',
  url: 'https://www.usb.org/document-library/usb-20-specification',
  note: '§7.1.11 Data Signaling Rate: 480.00 Mb/s ±500 ppm for high speed, and ±0.05 % (500 ppm) at any speed for hosts, hubs and high-speed-capable functions; 12.000 Mb/s ±0.25 % (2,500 ppm) for full-speed-only functions; 1.50 Mb/s ±1.5 % (15,000 ppm) for low-speed functions. §11.7.1.3: the 500 ppm covers voltage, temperature and aging, so two clocks may differ by 1000 ppm.',
};
const UNH_CL40: DataSource = {
  title: 'UNH-IOL Gigabit Ethernet Consortium, Clause 40 PMA Test Suite v2.5 (May 2008)',
  url: 'https://www.iol.unh.edu/sites/default/files/testsuites/ethernet/CL40_PMA/PMA_Test_Suite_v2.5.pdf',
  note: 'Test 40.1.x transmit clock frequency, citing IEEE Std 802.3-2005 clause 40.6.1.2.6: 1000BASE-T symbols are timed from 125.00 MHz ±0.01 % (125 MHz ±12.5 kHz) in both MASTER and SLAVE timing mode.',
};
const UNH_CL25: DataSource = {
  title: 'UNH-IOL Fast Ethernet Consortium, Clause 25 PMD Test Suite v3.5 (September 2011)',
  url: 'https://www.iol.unh.edu/sites/default/files/testsuites/ethernet/CL25_PMD/PMD_Test_Suite_v3.5.pdf',
  note: 'Test 25.1.8 Transmit Clock Frequency, citing IEEE Std 802.3-2005 clause 25 and subclause 24.2.3.4: the 100BASE-TX transmit clock is 125 MHz ±6.25 kHz, i.e. ±50 ppm.',
};
const SATA31: DataSource = {
  title: 'Serial ATA Revision 3.1, Gold Revision (SATA-IO)',
  url: 'https://sata-io.org/system/files/specifications/SerialATA_Revision_3_1_Gold.pdf',
  note: 'Table 35, ftol TX Frequency Long Term Accuracy: −350 to +350 ppm of the nominal rate at 1.5, 3.0 and 6.0 Gb/s; §7.1.1: the receiver accepts ±350 ppm, plus 0 to −5000 ppm of spread-spectrum down-spread.',
};

const PCIE_BASE2: DataSource = {
  title: 'PCI Express Base Specification Rev. 2.0 (December 2006)',
  url: 'https://archive.org/download/os-dev-manuals/pcie%20spec%20rev%202.0.pdf',
  note: '§4.3.7.4: Refclk 100 MHz ±300 ppm with spread spectrum off; SSC adds +0 to −5000 ppm at 30–33 kHz. §4.2.7: clocks at the limits give a 600 ppm difference between the two ends of a link, which the SKP ordered sets absorb.',
};

/** The interface data file's own source for an interface, so the citation stays in one place. */
const specSource = (id: string, fallback: DataSource) => interfaceById(id)?.sources[0] ?? fallback;

/** Clock tolerances taken from the specification text (or an authoritative restatement, cited). */
export const CLOCK_TOLERANCES: readonly ClockTolerance[] = [
  { id: 'usb-hs', label: 'USB 2.0 high speed (480 Mb/s)', ppm: 500, scope: 'each', detail: 'Also applies to hosts, hubs and high-speed-capable devices when they run at full or low speed.', sources: [USB2] },
  { id: 'usb-fs', label: 'USB full-speed-only device', ppm: 2500, scope: 'each', detail: '12 Mb/s ±0.25 %, for a device that does not support high speed.', sources: [USB2] },
  { id: 'usb-ls', label: 'USB low-speed device', ppm: 15000, scope: 'each', detail: '1.5 Mb/s ±1.5 %, loose enough for a ceramic resonator.', sources: [USB2] },
  { id: 'eth-1000t', label: 'Ethernet 1000BASE-T', ppm: 100, scope: 'each', detail: '125 MHz ±0.01 % symbol clock (IEEE 802.3 clause 40.6.1.2.6).', sources: [UNH_CL40] },
  { id: 'eth-100tx', label: 'Ethernet 100BASE-TX', ppm: 50, scope: 'each', detail: '125 MHz ±6.25 kHz transmit clock (IEEE 802.3 clause 25 / 24.2.3.4).', sources: [UNH_CL25] },
  { id: 'rmii', label: 'RMII REF_CLK (50 MHz)', ppm: 50, scope: 'each', detail: 'The one 50 MHz reference shared by MAC and PHY.', sources: [specSource('rmii', USB2)] },
  { id: 'pcie', label: 'PCI Express REFCLK (100 MHz)', ppm: 300, scope: 'each', detail: 'Base Specification §4.3.7.4 and CEM §2.1.1, spread spectrum off. Spread spectrum, where used, is a separate 0 to −0.5 % down-spread. With a common REFCLK both ends share one clock and its error cancels.', sources: [PCIE_BASE2, specSource('pcie-gen1', PCIE_BASE2)] },
  { id: 'sata', label: 'SATA (1.5 / 3 / 6 Gb/s)', ppm: 350, scope: 'each', detail: 'Transmit frequency long-term accuracy, before spread spectrum.', sources: [SATA31] },
  {
    id: 'uart',
    label: 'UART 8N1, 16× oversampling (ideal)',
    ppm: uartMaxMismatch(9, 16) * 1e6,
    scope: 'link',
    detail: 'Derived limit for the mismatch between the two ends, from (½ − 1/16) / 9.5. Receivers that vote over three samples tolerate less; use the figure in the UART’s datasheet where it gives one.',
    sources: [],
  },
];

export const toleranceById = (id: string) => CLOCK_TOLERANCES.find((t) => t.id === id);

export interface Compliance {
  /** error compared against the limit, ppm */
  error: number;
  limit: number;
  margin: number; // limit − error; negative fails
  pass: boolean;
}

/**
 * Check against an interface. 'each' compares this clock alone; 'link' compares the sum of this
 * clock and the far-end clock with the limit.
 */
export function compliance(t: ClockTolerance, thisEnd: number, farEnd: number): Compliance {
  const error = t.scope === 'link' ? linkOffsetPpm(thisEnd, farEnd) : Math.abs(thisEnd);
  const margin = t.ppm - error;
  return { error, limit: t.ppm, margin, pass: margin >= 0 };
}
