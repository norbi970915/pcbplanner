// Routing rules of common high-speed interfaces.
//
// Every number here was read in the interface specification itself or in a chip-vendor
// layout guide, and each rule names the document it came from (`src` indexes the
// interface's own source list). Rules the specification makes mandatory are marked
// `normative`; the rest are vendor recommendations, which differ between vendors.
import type { DataSource } from './source';

export type RuleKey = 'z' | 'skew' | 'length' | 'loss' | 'cap' | 'via' | 'ref' | 'term' | 'space' | 'clock' | 'other';

export interface SpecRule {
  key: RuleKey;
  label: string;
  /** What the document requires, as text. */
  req: string;
  detail?: string;
  /** true when the interface specification itself demands it. */
  normative?: boolean;
  src: number;
}

export interface InterfaceSpec {
  id: string;
  name: string;
  family: string;
  /** One line for the tool header and the page description. */
  summary: string;
  /** Line rate per lane or per line, Gb/s. */
  rateGbps: number;
  nyquistGHz: number;
  encoding: string;
  /** Impedance the pair or line is built to. */
  z: { kind: 'diff' | 'se'; target: number; min?: number; max?: number; note?: string };
  /** A second controlled impedance on the same interface (clock pair, single-ended target of a pair, …). */
  z2?: { kind: 'diff' | 'se'; target: number; label: string };
  intraPairPs?: number;
  intraPairMm?: number;
  /** The intra-pair limit above is a vendor layout guideline, not a limit of the specification:
   *  a pair over it is a warning, and a fail only beyond intraPairBudgetPs. */
  intraPairGuideline?: boolean;
  /** Intra-pair skew the specification itself allows, ps, where the routing limit above is a tighter guideline. */
  intraPairBudgetPs?: number;
  laneSkewPs?: number;
  laneSkewMm?: number;
  /**
   * Vendor layout guidelines the routing check measures on a routed board, each with the index of the source
   * it was read in. They are recommendations, so a pair outside one is a warning, never a fail.
   */
  layout?: LayoutGuides;
  /** Names for the two skew limits where “intra-pair” and “lane-to-lane” do not fit. */
  skewLabels?: { intra?: string; lane?: string };
  /** Board share of the channel insertion loss at the Nyquist frequency, dB. */
  lossBudgetDb?: number;
  lossNote?: string;
  maxLenMm?: number;
  /** Limit given as a delay rather than a length (DDR and other memory buses). */
  maxDelayPs?: number;
  /** Laminate quality the published length limits assume, dB per inch per GHz. */
  maxLossPerInGHz?: number;
  rules: SpecRule[];
  sources: DataSource[];
}

/** A number from a source: `src` indexes the interface's sources. */
export interface Guide {
  value: number;
  src: number;
}

export interface LayoutGuides {
  /** Longest via stub, mm (the unused barrel beyond the outermost layer the signal uses). */
  viaStubMm?: Guide;
  /** Ground stitching via within this distance of each signal via (centre to centre, mm) where the pair moves to a layer with no common reference plane. */
  returnViaMm?: Guide;
  /** Most vias on each trace of a pair. */
  viasPerTrace?: Guide;
  /** Both traces of a pair have the same number of vias. */
  equalVias?: { src: number };
  /** Edge-to-edge spacing to any other signal on the same layer, mm. */
  spaceMm?: Guide;
  /** Edge-to-edge spacing to another pair, mm. */
  pairSpaceMm?: Guide;
  /** Spacing to another pair in trace widths (the 5W rule). */
  pairSpaceW?: Guide;
  /** Spacing to another pair in heights of the trace above its reference plane. */
  pairSpaceH?: Guide;
  /** Length difference between the lanes of one link (a layout guideline, mm or ps) … */
  laneSkewMm?: Guide;
  laneSkewPs?: Guide;
  /** … and the lane-to-lane skew the specification allows, ps: beyond it a lane fails. */
  laneSkewBudgetPs?: Guide;
}

const MIL = 0.0254;
const IN = 25.4;

// ── sources used by more than one interface ────────────────────────────────────
const TI_SNLA387: DataSource = {
  title: 'TI SNLA387 — Ethernet PHY PCB Design Layout Checklist (June 2021)',
  url: 'https://www.ti.com/lit/pdf/snla387',
  note: 'MDI and MII trace rules: 100 Ω ±10 % differential, MII 50 Ω ±10 % single-ended, 20 mil pair matching at 1 Gb/s, 2 in MDI and 6 in MII length limits, 3W/5W keep-out, 30 mil between pairs, 20 mil earth-ground moat, magnetics keep-out, ESD diode placement.',
};
const TI_DP83867: DataSource = {
  title: 'TI DP83867IR/CR data sheet SNLS484 (revision J: RGMII layout §9.2.2.1.1, MDI §9.2.2.2.1, transformer and vias §9.4.1)',
  url: 'https://www.ti.com/lit/ds/symlink/dp83867ir.pdf',
  note: 'MDI 50 Ω to ground and 100 Ω differential, 0.1 µF per isolated centre tap, no metal under the transformer, RGMII 11 ps (60 mil) intra-group skew, internal RGMII delay in 0.25 ns steps.',
};
const MCHP_KSZ9031: DataSource = {
  title: 'Microchip KSZ9031RNX data sheet DS00002117 (§3.9.3, §12.0)',
  url: 'https://ww1.microchip.com/downloads/aemDocuments/documents/UNG/ProductDocuments/DataSheets/KSZ9031RNX-Data-Sheet-DS00002117.pdf',
  note: 'Separate 0.1 µF common-mode capacitors per centre tap, Bob Smith termination 4 × 75 Ω with 1000 pF/2 kV, magnetics HIPOT 1500 V rms and 350 µH OCL, RGMII pad-skew registers in 0.06 ns steps, inter-pair delay correction in the PHY.',
};
const MCHP_AN1231: DataSource = {
  title: 'Microchip ENT-AN1231 VSC8541 Design and Layout Guide, VPPD-04420 Rev 1.1',
  url: 'https://ww1.microchip.com/downloads/en/Appnotes/VPPD-04420.pdf',
  note: 'MAC-interface series termination R = 50 Ω − driver output impedance (27–39 Ω on this PHY), 120 mil matching per port for MII, RMII and GMII, external 1.5–2.0 ns RGMII clock “trombone” delay, Bob Smith on the cable-side centre taps.',
};
const TI_SPRAAR7J: DataSource = {
  title: 'TI SPRAAR7J — High-Speed Interface Layout Guidelines (Feb 2023)',
  url: 'https://www.ti.com/lit/an/spraar7j/spraar7j.pdf',
  note: 'Per-interface impedance, intra-pair skew and trace-length limits for TI SoCs (Appendix A), plus the general rules: 5W pair-to-pair spacing, 200 mil ground-via distance, < 15 mil via stubs, ≤ 0603 series parts.',
};

const PCIE_CEM3: DataSource = {
  title: 'PCI Express Card Electromechanical Specification Rev. 3.0 (July 2013)',
  url: 'https://pcisig.com/specifications',
  note: '§4.7.7 intra-pair skew 5 mil on an add-in card and 10 mil on a system board; §4.7.8 trace impedance 68–105 Ω at 5 GT/s and 70–100 Ω at 8 GT/s, excluding vias, connectors and packages; §4.7.9 750 ps edge-finger delay; Table 4-5 lane-to-lane skew; §4.7.1 AC coupling on the transmit pair; §2.1.1 the 100 MHz ±300 ppm reference clock; §6 removal of the planes under the edge fingers. PCI-SIG membership is needed to download it, so these figures could not be checked against a free copy; the impedance ranges of §4.7.8 are also quoted in Keysight’s public PCIe material, and the 5 mil intra-pair figure in TI SLAAE45.',
};
const PCIE_BASE2: DataSource = {
  title: 'PCI Express Base Specification Rev. 2.0 (December 2006)',
  url: 'https://pcisig.com/specifications',
  note: 'Table 4-9: AC coupling capacitor 75–200 nF, transmitter lane-to-lane skew, unit interval; Table 4-12 receiver skew; §4.3.7.1 spread spectrum, 0 to −0.5 % at 30–33 kHz. PCI-SIG membership is needed to download it; the 75–200 nF window and the spread-spectrum limits are also stated in public NXP and TI data sheets.',
};
const TI_SNLA426: DataSource = {
  title: 'TI SNLA426 — High-Speed PCB Layout for PCIe Gen 5 (June 2023)',
  url: 'https://www.ti.com/lit/pdf/snla426',
  note: 'Table 2-1 loss budget per generation (add-in card 6.5 / 8.5 / 9.5 dB at Gen 3 / 4 / 5), 85 Ω for interoperable add-in cards, 15 mil via stubs and back-drilling, 10/20/40 drill-pad-antipad rule, stitching vias within 50 mil, capacitor placement and pad voiding, loss per inch per laminate.',
};
const TI_SLAAE45: DataSource = {
  title: 'TI SLAAE45 — Layout Guidelines of PCIe Gen 4.0 Application With the TMUXHS4412 Multiplexer (September 2021)',
  url: 'https://www.ti.com/lit/pdf/slaae45',
  note: 'Table 2-1: Nyquist frequency per generation, 100 Ω ±5 % for Gen 1/2 and 85 Ω ±5 % for Gen 3/4, 5 mil intra-pair, no inter-pair requirement, AC coupling 75–220 nF, at most two vias per high-speed trace, via stubs under 15 mil.',
};
const TI_SLLA414_GENERAL: DataSource = {
  title: 'TI SLLA414A — High-Speed Layout Guidelines for Signal Conditioners and USB Hubs (rev. January 2026)',
  url: 'https://www.ti.com/lit/an/slla414/slla414.pdf',
  note: 'General rules for USB, HDMI, DisplayPort, PCIe and SATA (§3–§4): stitching vias within 200 mil of the signal vias where the ground reference changes, 5W between pairs, 30 mil to other signals, via stubs under 15 mil, equal via counts on both traces.',
};
const SAMTEC_PCIE: DataSource = {
  title: 'Samtec — Successful PCIe Interconnect Guidelines at 8, 16 and 32 GT/s (April 2021)',
  url: 'https://blog.samtec.com/wp-content/uploads/2021/04/04_15_2021_successful_PCIe_interconnect_guidelines.pdf',
  note: 'Channel budgets 23.5 / 28 / 36 dB with 6.5 / 8.0 / 9.5 dB for the add-in card, reach goals of 20 in at 8 GT/s, 16 in at 16 GT/s and 14 in at 32 GT/s, loss per inch by laminate class, and when a via stub starts to matter (80 mil at Gen 3, 50 mil at Gen 4, every via at Gen 5).',
};

export const INTERFACES: InterfaceSpec[] = [
  // ── PCI Express ─────────────────────────────────────────────────────────────
  {
    id: 'pcie-gen1',
    name: 'PCIe Gen 1 (2.5 GT/s)',
    family: 'PCI Express',
    summary: 'One lane of first-generation PCI Express: a transmit pair and a receive pair.',
    rateGbps: 2.5,
    nyquistGHz: 1.25,
    encoding: '400 ps unit interval',
    z: { kind: 'diff', target: 100, min: 68, max: 105, note: 'The CEM allows 68–105 Ω up to 5 GT/s; TI recommends 100 Ω ±5 % for Gen 1 and 2.' },
    intraPairMm: 5 * MIL,
    laneSkewPs: 350,
    lossBudgetDb: 3.84,
    lossNote: 'The CEM (Rev 2.0, Table 4-3) allows 3.84 dB on the transmit side of an add-in card at 1.25 GHz (2.65 dB on the receive side), out of 13.2 dB for the whole path. Edge fingers and the connector are not included, the transmit coupling capacitor is.',
    maxDelayPs: 750,
    skewLabels: { lane: 'Lane-to-lane skew (add-in card)' },
    rules: [
      { key: 'z', label: 'Impedance', req: '68–105 Ω differential on both the add-in card and the system board. Vias, connectors, packages and cables are excluded.', normative: true, src: 0 },
      { key: 'skew', label: 'Intra-pair skew', req: 'Under 5 mil (0.127 mm) on an add-in card, under 10 mil (0.254 mm) on a system board.', normative: true, src: 0 },
      { key: 'skew', label: 'Lane-to-lane skew', req: '0.35 ns for an add-in card, 1.25 ns for a system board, 1.6 ns for the whole interconnect.', detail: 'The CEM puts that at about 2 in and 7 in of trace difference on FR-4.', normative: true, src: 0 },
      { key: 'length', label: 'Trace delay', req: 'At most 750 ps from the edge finger to the device on an add-in card.', normative: true, src: 0 },
      { key: 'cap', label: 'AC coupling', req: 'Mandatory on the transmit pair of both card and system board, 75–200 nF.', normative: true, src: 1 },
      { key: 'clock', label: 'Reference clock', req: '100 MHz ±300 ppm differential. Spread spectrum, if used, must be down-spread only: 0 to −0.5 % at 30–33 kHz.', normative: true, src: 0 },
      {
        key: 'other',
        label: 'Edge fingers',
        req: 'Remove the ground and power planes under the edge fingers of an add-in card.',
        detail: 'Left in place, the fingers add so much capacitance that the connector misses its own specification. Most tools pour ground under them by default, which makes this the classic first-board mistake.',
        normative: true,
        src: 0,
      },
      { key: 'via', label: 'Vias', req: 'The same number of vias on both traces of a pair; TI recommends at most two vias on a trace above 5 Gb/s.', src: 2 },
    ],
    sources: [PCIE_CEM3, PCIE_BASE2, TI_SLAAE45],
  },
  {
    id: 'pcie-gen2',
    name: 'PCIe Gen 2 (5 GT/s)',
    family: 'PCI Express',
    summary: 'Second-generation PCI Express: same rules as Gen 1 at twice the rate.',
    rateGbps: 5,
    nyquistGHz: 2.5,
    encoding: '200 ps unit interval',
    z: { kind: 'diff', target: 100, min: 68, max: 105 },
    intraPairMm: 5 * MIL,
    laneSkewPs: 350,
    maxDelayPs: 750,
    skewLabels: { lane: 'Lane-to-lane skew (add-in card)' },
    rules: [
      { key: 'z', label: 'Impedance', req: '68–105 Ω differential, on the card and on the system board.', normative: true, src: 0 },
      { key: 'skew', label: 'Intra-pair skew', req: 'Under 5 mil on an add-in card, 10 mil on a system board.', normative: true, src: 0 },
      { key: 'skew', label: 'Lane-to-lane skew', req: '0.35 ns add-in card, 1.25 ns system board, 1.6 ns total.', normative: true, src: 0 },
      { key: 'length', label: 'Trace delay', req: 'At most 750 ps from the edge finger to the device.', normative: true, src: 0 },
      { key: 'cap', label: 'AC coupling', req: 'Mandatory on the transmit pair, 75–200 nF.', normative: true, src: 1 },
      { key: 'other', label: 'Receiver skew', req: 'The receiver tolerates up to 8 ns of lane-to-lane skew at 5 GT/s (20 ns at 2.5 GT/s), which is why lane matching is far looser than pair matching.', normative: true, src: 1 },
      { key: 'other', label: 'Edge fingers', req: 'No ground or power plane under the edge fingers of an add-in card.', normative: true, src: 0 },
      { key: 'ref', label: 'Reference plane', req: 'Keep each pair over solid ground and never over a split.', src: 2 },
    ],
    sources: [PCIE_CEM3, PCIE_BASE2, TI_SLAAE45],
  },
  {
    id: 'pcie-gen3',
    name: 'PCIe Gen 3 (8 GT/s)',
    family: 'PCI Express',
    summary: 'Third-generation PCI Express, where 85 Ω and the loss budget start to bite.',
    rateGbps: 8,
    nyquistGHz: 4,
    encoding: '125 ps unit interval',
    layout: {
      viaStubMm: { value: 15 * MIL, src: 3 },
      returnViaMm: { value: 200 * MIL, src: 4 },
      viasPerTrace: { value: 2, src: 3 },
      equalVias: { src: 3 },
      spaceMm: { value: 30 * MIL, src: 4 },
      pairSpaceW: { value: 5, src: 4 },
    },
    z: { kind: 'diff', target: 85, min: 70, max: 100, note: 'The CEM requires 70–100 Ω at 8 GT/s; 85 Ω is the vendor target for an add-in card that has to work with any root complex.' },
    intraPairMm: 5 * MIL,
    laneSkewPs: 350,
    lossBudgetDb: 6.5,
    lossNote: 'Vendors budget 6.5 dB at 4 GHz for a 4 in add-in card, inside a 23.5 dB channel: about 3.5 dB for the CPU package, 13 dB for the system board, 0.5 dB for the connector.',
    maxDelayPs: 750,
    skewLabels: { lane: 'Lane-to-lane skew (add-in card)' },
    rules: [
      { key: 'z', label: 'Impedance', req: '70–100 Ω differential.', normative: true, src: 0 },
      {
        key: 'z',
        label: 'Target',
        req: '85 Ω for an interoperable add-in card.',
        detail: 'The 85 Ω figure does not apply to packages, connectors or cables, and a captive design that never meets another vendor’s card may pick another impedance.',
        src: 1,
      },
      { key: 'skew', label: 'Intra-pair skew', req: 'Under 5 mil on an add-in card, 10 mil on a system board.', detail: 'Correct the mismatch where it happens, at the start of the segment, not further down the trace: a late correction turns the skew into common-mode noise.', normative: true, src: 0 },
      { key: 'skew', label: 'Lane-to-lane skew', req: '0.35 ns add-in card, 1.25 ns system board, 1.6 ns total. Lanes do not need to be matched to each other.', normative: true, src: 0 },
      { key: 'loss', label: 'Insertion loss', req: 'About 6.5 dB at 4 GHz for the add-in card, in a 23.5 dB channel budget.', src: 2 },
      { key: 'length', label: 'Trace delay', req: 'At most 750 ps from the edge finger to the device on an add-in card.', normative: true, src: 0 },
      { key: 'length', label: 'Channel reach', req: 'About 20 in for the whole channel on ordinary FR-4.', src: 2 },
      { key: 'cap', label: 'AC coupling', req: 'Mandatory on the transmit pair. TI recommends 75–220 nF; at 8 GT/s the window is 176–265 nF (as NXP’s LS1046A data sheet quotes it), so 220 nF fits every generation.', detail: 'Use the smallest body you can (0201), void the reference plane under the pads two layers deep, and place both capacitors of a pair identically.', src: 3 },
      { key: 'via', label: 'Vias and stubs', req: 'At most two vias per trace, equal counts and spacing on both traces, stubs under 15 mil or back-drilled.', detail: 'Samtec’s guidelines tolerate stubs up to about 80 mil at 8 GT/s and suggest optimising them from about 50 mil at 16 GT/s.', src: 3 },
      { key: 'ref', label: 'Reference plane', req: 'Ground reference throughout and no reference to a power plane.', src: 1 },
      { key: 'ref', label: 'Stitching vias', req: 'Where the ground reference changes, stitching vias within 200 mil of the signal vias.', detail: 'TI’s PCIe Gen 5 guide tightens this to 50 mil.', src: 4 },
      { key: 'space', label: 'Spacing', req: '5W between pairs and 30 mil to other signals.', detail: 'TI’s PCIe Gen 5 guide asks for four times the trace-to-plane height between pairs, and 5W or five times that height, whichever is larger, to a plane edge.', src: 4 },
      { key: 'clock', label: 'Reference clock', req: 'Routed as 100 Ω differential, not 85 Ω like the data pairs.', src: 1 },
      { key: 'other', label: 'Edge fingers', req: 'Remove ground and power planes under the edge fingers.', normative: true, src: 0 },
      { key: 'other', label: 'Fibre weave', req: 'Skew from the glass weave shows up above about 2 GHz. Rotate the artwork 10–35° on the panel, or route in a zig-zag, on any board at 8 GT/s or faster.', src: 1 },
    ],
    sources: [PCIE_CEM3, TI_SNLA426, SAMTEC_PCIE, TI_SLAAE45, TI_SLLA414_GENERAL],
  },
  {
    id: 'pcie-gen4',
    name: 'PCIe Gen 4 (16 GT/s)',
    family: 'PCI Express',
    summary: 'Fourth-generation PCI Express: mid-loss laminate and back-drilling become normal.',
    rateGbps: 16,
    nyquistGHz: 8,
    encoding: '62.5 ps unit interval',
    layout: {
      viaStubMm: { value: 15 * MIL, src: 0 },
      returnViaMm: { value: 200 * MIL, src: 3 },
      viasPerTrace: { value: 2, src: 0 },
      equalVias: { src: 0 },
      spaceMm: { value: 30 * MIL, src: 3 },
      pairSpaceW: { value: 5, src: 3 },
    },
    z: { kind: 'diff', target: 85, min: 80.75, max: 89.25, note: '85 Ω ±5 % is TI’s rule for Gen 4; the CEM revision that covers 16 GT/s is not public.' },
    intraPairMm: 5 * MIL,
    lossBudgetDb: 8,
    lossNote: 'Vendors budget 8–8.5 dB at 8 GHz for the add-in card inside a 28 dB channel: about 5 dB package, 14 dB system board, 0.5 dB connector, plus up to 2 dB for crosstalk.',
    rules: [
      { key: 'z', label: 'Impedance', req: '85 Ω differential ±5 %.', src: 0 },
      { key: 'skew', label: 'Intra-pair skew', req: 'Under 5 mil.', src: 0 },
      { key: 'skew', label: 'Lane-to-lane skew', req: 'Lanes do not have to be matched for signal integrity; TI keeps the difference to about an inch, for the receiver’s buffers.', src: 1 },
      { key: 'loss', label: 'Insertion loss', req: 'About 8–8.5 dB at 8 GHz for a 4 in add-in card, in a 28 dB channel. The reach goal for the whole channel is about 16 in on mid-loss material.', src: 2 },
      { key: 'other', label: 'Material', req: 'At 8 GHz standard FR-4 loses about 0.69 dB/in, mid-loss laminates about 0.55–0.58 dB/in and very low loss about 0.19–0.25 dB/in.', detail: 'Insertion loss also rises by roughly a tenth over temperature and humidity, which the budget has to carry.', src: 1 },
      { key: 'cap', label: 'AC coupling', req: 'Mandatory on the transmit pair, 75–220 nF, 0201 preferred, with the plane voided under the pads.', src: 1 },
      { key: 'via', label: 'Vias and stubs', req: 'At most two vias per trace, and via stubs under 15 mil (back-drill longer ones).', src: 0 },
      { key: 'via', label: 'Stub length (Samtec)', req: 'Stubs of 50 mil and more need attention at 16 GT/s.', src: 2 },
      { key: 'ref', label: 'Reference plane', req: 'Ground reference throughout, stitching capacitors of 1 µF or less where a split is unavoidable.', src: 1 },
      { key: 'ref', label: 'Stitching vias', req: 'Where the ground reference changes, stitching vias within 200 mil of the signal vias.', detail: 'TI’s PCIe Gen 5 guide tightens this to 50 mil.', src: 3 },
      { key: 'space', label: 'Spacing', req: '5W between pairs and 30 mil to other signals.', detail: 'TI’s PCIe Gen 5 guide asks for four times the trace-to-plane height between pairs, five times it to a plane edge, and bends of at least 135°.', src: 3 },
      { key: 'other', label: 'Fibre weave', req: 'Route at an angle to the glass weave or use a spread-glass laminate.', src: 1 },
    ],
    sources: [TI_SLAAE45, TI_SNLA426, SAMTEC_PCIE, TI_SLLA414_GENERAL],
  },
  {
    id: 'pcie-gen5',
    name: 'PCIe Gen 5 (32 GT/s)',
    family: 'PCI Express',
    summary: 'Fifth-generation PCI Express: low-loss laminate, back-drilled vias and simulated launches.',
    rateGbps: 32,
    nyquistGHz: 16,
    encoding: '31.25 ps unit interval',
    layout: {
      viaStubMm: { value: 15 * MIL, src: 0 },
      returnViaMm: { value: 50 * MIL, src: 0 },
      pairSpaceH: { value: 4, src: 0 },
    },
    z: { kind: 'diff', target: 85, note: 'No free source gives a tolerance at 32 GT/s; the routing check applies its default ±10 %.' },
    intraPairMm: 5 * MIL,
    lossBudgetDb: 9.5,
    lossNote: 'Vendors budget 9.5 dB at 16 GHz for the add-in card inside a 36 dB channel: about 9 dB package, 16 dB system board, 1.5 dB connector, plus 4–5 dB for crosstalk and 2–3 dB for temperature and humidity.',
    rules: [
      { key: 'z', label: 'Impedance', req: '85 Ω differential for anything that has to interoperate.', src: 0 },
      { key: 'skew', label: 'Intra-pair skew', req: 'Under 5 mil, corrected at the point where the mismatch occurs.', src: 0 },
      { key: 'loss', label: 'Insertion loss', req: 'About 9.5 dB at 16 GHz for the add-in card, in a 36 dB channel; the whole channel reaches roughly 14 in on low-loss material.', src: 1 },
      { key: 'other', label: 'Bandwidth', req: 'A 12 ps edge needs about 29 GHz of bandwidth, so every discontinuity has to be modelled, not estimated.', src: 0 },
      { key: 'other', label: 'Material', req: 'Very low loss laminate: about 0.34 dB/in at 16 GHz for Megtron 6 class, against 1.3 dB/in for FR-4.', src: 0 },
      { key: 'via', label: 'Vias and stubs', req: 'Back-drill anything over 15 mil of stub; follow the 10/20/40 mil drill, pad and anti-pad rule and remove unused pads.', src: 0 },
      { key: 'via', label: 'Simulation', req: 'Expect to simulate every via.', detail: 'A short stub is not automatically better: it reflects less but couples more into its neighbours.', src: 1 },
      { key: 'ref', label: 'Reference plane and stitching', req: 'Ground reference throughout; where the ground reference changes, stitching vias within 50 mil of each signal via, as many around the anti-pad as fit, staggered rather than aligned.', src: 0 },
      { key: 'cap', label: 'AC coupling', req: 'Mandatory on the transmit pair, 75–220 nF (220 nF is the usual choice), 0201 body, plane voided under the pads two layers deep.', src: 0 },
      { key: 'clock', label: 'Reference clock', req: '100 MHz at 100 Ω differential, with random jitter under about 200 fs rms.', src: 0 },
      { key: 'space', label: 'Spacing', req: 'Four to five times the trace-to-plane height between pairs and between interfaces.', src: 0 },
      { key: 'other', label: 'Surface transitions', req: 'Keep surface transitions under half an inch.', src: 1 },
    ],
    sources: [TI_SNLA426, SAMTEC_PCIE],
  },

  // ── Ethernet ────────────────────────────────────────────────────────────────
  {
    id: 'eth-1000baset',
    name: '1000BASE-T (MDI)',
    family: 'Ethernet',
    summary: 'The four twisted pairs between a gigabit PHY and its magnetics and RJ45.',
    rateGbps: 0.25,
    nyquistGHz: 0.0625,
    encoding: 'PAM-5, 125 MBd per pair, four pairs',
    layout: {
      pairSpaceMm: { value: 30 * MIL, src: 0 },
    },
    z: { kind: 'diff', target: 100, min: 90, max: 110 },
    z2: { kind: 'se', target: 50, label: '50 Ω from each line to ground' },
    intraPairMm: 20 * MIL,
    intraPairGuideline: true,
    maxLenMm: 2 * IN,
    skewLabels: { intra: 'Pair length matching (P vs N)' },
    rules: [
      { key: 'other', label: 'Signalling', req: '125 MBd per pair, PAM-5 (2 bits per symbol) on four pairs, so 250 Mb/s per pair and 1 Gb/s in total.', normative: true, src: 3 },
      { key: 'z', label: 'Impedance', req: '100 Ω differential ±10 %.', detail: 'Match the impedance to the cable the board drives; a mismatch costs throughput and can break the link.', src: 0 },
      { key: 'z', label: 'Single-ended impedance', req: '50 Ω from each MDI line to ground.', src: 1 },
      { key: 'skew', label: 'Pair matching', req: '20 mil between the two traces of a pair at 1 Gb/s, 50 mil at 10/100 Mb/s.', detail: 'Given as a length, not a time. Put the compensation at the end where the mismatch is.', src: 0 },
      { key: 'skew', label: 'Pair-to-pair matching', req: 'The PHY measures and corrects the delay between the four pairs, so the pairs do not have to be matched to each other.', src: 2 },
      { key: 'length', label: 'Trace length', req: 'Under 2 in (2000 mil) per MDI trace.', src: 0 },
      {
        key: 'cap',
        label: 'AC coupling',
        req: 'A 1:1 isolation transformer couples the link. With a voltage-mode driver each PHY-side centre tap gets its own 0.1 µF to ground.',
        detail: 'Do not tie the centre taps of a voltage-mode PHY together: the common-mode voltage differs from pair to pair and with the speed mode.',
        src: 2,
      },
      { key: 'ref', label: 'Under the magnetics', req: 'No metal under the magnetics, unless it is separated from them by a ground plane; metal under an RJ45 with integrated magnetics is allowed.', detail: 'Void the planes about 20 mil beyond the body, on at least two layers.', src: 0 },
      { key: 'ref', label: 'Chassis ground', req: 'Isolate earth ground from the board with a keep-out of at least 20 mil on every layer.', detail: 'Bridge the moat only with a capacitor and a resistor of 1 MΩ or more.', src: 0 },
      { key: 'term', label: 'Termination', req: 'On-die in modern PHYs. On the cable side, Bob Smith termination: 4 × 75 Ω commoned through 1000 pF / 2 kV to chassis ground.', src: 2 },
      { key: 'space', label: 'Spacing', req: '3W minimum from copper pour on the same layer, 5W preferred; at least 30 mil to any other pair.', src: 0 },
      { key: 'via', label: 'Vias and stubs', req: 'Route a whole pair on one layer: no crossovers and no vias on the signal traces where possible.', src: 1 },
      { key: 'via', label: 'Ground vias', req: 'Put a ground via beside any signal via you cannot avoid.', src: 0 },
      { key: 'other', label: 'Magnetics', req: 'HIPOT at least 1500 V rms, 1 CT : 1 CT turns ratio, open-circuit inductance at least 350 µH, insertion loss at most 1 dB to 100 MHz.', src: 2 },
      { key: 'other', label: 'ESD protection', req: 'Protection diodes belong on the PHY side of the magnetics, not on the connector side.', detail: 'The cable side risks high common-mode voltage swings, and a protector there has to survive high voltages that are not ESD.', src: 0 },
    ],
    sources: [
      TI_SNLA387,
      TI_DP83867,
      MCHP_KSZ9031,
      {
        title: 'IEEE P802.3ab draft D1.1, changes to the Clause 1 definitions (1.4.183)',
        url: 'https://grouper.ieee.org/groups/802/3/ab/pub/ch40a.pdf',
        note: 'Defines the 1000BASE-T symbol rate as 125 MBd. The published IEEE 802.3 standard is not free; the PAM-5 coding on all four pairs is also stated in the Microchip KSZ9031RNX data sheet (§3.2.5–§3.2.6).',
      },
    ],
  },
  {
    id: 'rgmii',
    name: 'RGMII (MAC ↔ PHY)',
    family: 'Ethernet',
    summary: 'Reduced gigabit MII: four data lines per direction, clocked on both edges at 125 MHz.',
    rateGbps: 0.25,
    nyquistGHz: 0.125,
    encoding: 'DDR, 125 MHz clock (25 MHz at 100 Mb/s, 2.5 MHz at 10 Mb/s)',
    z: { kind: 'se', target: 50, min: 45, max: 55, note: 'Single-ended. The RGMII specification itself sets no impedance; 50 Ω ±10 % is the vendor rule.' },
    intraPairPs: 11,
    maxLenMm: 6 * IN,
    skewLabels: { intra: 'Skew inside TXD[3:0] or RXD[3:0]' },
    rules: [
      { key: 'clock', label: 'Clock delay (before v2.0)', req: 'The board must add more than 1.5 ns and less than 2.0 ns of extra delay to the clock, relative to the data.', detail: 'At about 180 ps per inch that is roughly 8–11 in of extra clock trace (an estimate), which is why the “trombone” was replaced by internal delay.', normative: true, src: 0 },
      { key: 'clock', label: 'Clock delay (v2.0, RGMII-ID)', req: 'The delay may instead sit inside the device; such parts are called RGMII-ID. The MAC delays TXC, the PHY delays RXC.', detail: 'The DP83867 sets its internal delay from 0.25 to 4.00 ns in 0.25 ns steps; use either the internal delay or a board delay, not both.', normative: true, src: 0 },
      { key: 'other', label: 'Timing budget', req: 'Data-to-clock skew at the transmitter −500 to +500 ps; at the receiver 1.0 to 2.6 ns (1.8 ns typical). With integrated delay, setup and hold are at least 1.2 ns at the transmitter and 1.0 ns at the receiver.', normative: true, src: 0 },
      { key: 'other', label: 'Clock', req: 'Cycle 8 ns (7.2–8.8 ns), duty cycle 45–55 % at 1 Gb/s (40–60 % at 10/100 Mb/s), rise and fall at most 0.75 ns (20–80 %).', normative: true, src: 0 },
      { key: 'z', label: 'Impedance', req: '50 Ω single-ended ±10 % (a vendor rule; the specification gives none).', src: 2 },
      { key: 'skew', label: 'Skew within a group', req: 'Under 11 ps between TXD[3:0], and between RXD[3:0]; TI calls that 60 mil on FR-4.', detail: 'Match transmit to transmit and receive to receive. The transmit group does not have to match the receive group.', src: 3 },
      { key: 'length', label: 'Trace length', req: '6 in maximum.', detail: 'TI’s DP83867 data sheet recommends under 2 in.', src: 2 },
      { key: 'term', label: 'Series termination', req: 'R = 50 Ω − the driver output impedance, placed at the driver. On a PHY with 11–23 Ω outputs that is 27–39 Ω.', src: 1 },
      { key: 'ref', label: 'Reference plane', req: 'An unbroken plane below (or above) every RGMII signal.', src: 1 },
      { key: 'via', label: 'Ground vias', req: 'A ground via next to each signal via.', src: 2 },
      { key: 'space', label: 'Spacing', req: '3W minimum from copper pour, 5W preferred.', src: 2 },
    ],
    sources: [
      {
        title: 'RGMII specification v2.0 (Hewlett-Packard, 1 April 2002)',
        url: 'https://community.nxp.com/pwmxy87654/attachments/pwmxy87654/imx-processors/20655/1/RGMIIv2_0_final_hp.pdf',
        note: 'Table 2 and its notes: the 1.5–2.0 ns board clock delay required before v2.0, the RGMII-ID internal delay added in v2.0, the setup/hold budget, clock cycle, duty cycle and edge rates. HSTL Class 1 signalling.',
      },
      MCHP_AN1231,
      TI_SNLA387,
      TI_DP83867,
    ],
  },
  {
    id: 'rmii',
    name: 'RMII (MAC ↔ PHY)',
    family: 'Ethernet',
    summary: 'Reduced MII: two data lines per direction on one shared 50 MHz reference clock.',
    rateGbps: 0.05,
    nyquistGHz: 0.025,
    encoding: 'SDR, 50 MHz REF_CLK, 2 bits per clock per direction',
    z: { kind: 'se', target: 50, min: 45, max: 55, note: 'Vendor convention: the RMII specification deliberately specifies no impedance.' },
    intraPairMm: 50 * MIL,
    maxLenMm: 6 * IN,
    skewLabels: { intra: 'Matching within TX and within RX' },
    rules: [
      { key: 'other', label: 'Reference clock', req: '50 MHz ±50 ppm, duty cycle 35–65 %, output edges 1–5 ns.', normative: true, src: 0 },
      { key: 'other', label: 'Setup and hold', req: 'Data valid at least 4 ns before the rising edge of REF_CLK and held at least 2 ns after it.', detail: 'With a 20 ns period that leaves about 14 ns of slack, which is why RMII matching is loose.', normative: true, src: 0 },
      { key: 'z', label: 'Impedance', req: 'None in the specification: it treats the connections as electrically short.', detail: 'The specification does ask for the lowest drive strength that works, to keep board noise and EMI down.', src: 0 },
      { key: 'z', label: 'Vendor impedance', req: '50 Ω single-ended ±10 %.', src: 2 },
      { key: 'skew', label: 'Length matching', req: '50 mil within the TX signals and within the RX signals.', src: 2 },
      { key: 'skew', label: 'Length matching (Microchip)', req: '120 mil per port.', src: 1 },
      { key: 'length', label: 'Trace length', req: 'Under 6 in per vendor guides. The specification only requires drivers to work into 25 pF, which it says covers over 12 in of trace.', src: 2 },
      { key: 'term', label: 'Series termination', req: 'R = 50 Ω − the driver output impedance, at the driver.', src: 1 },
      { key: 'ref', label: 'Reference plane', req: 'An unbroken plane below (or above) the signals.', src: 1 },
      { key: 'via', label: 'Ground vias', req: 'A ground via beside any signal via.', src: 2 },
      { key: 'other', label: 'Clock source', req: 'REF_CLK is sourced by the MAC or by an external source.', detail: 'Some PHYs can also drive REF_CLK themselves (the VSC8541 in its mode 2).', src: 0 },
    ],
    sources: [
      {
        title: 'RMII Specification Rev 1.2 (RMII Consortium, 20 March 1998)',
        url: 'https://community.nxp.com/pwmxy87654/attachments/pwmxy87654/MQX-Software-Solutions/13794/1/RMII_Spec_1_2.pdf',
        note: '§5.1 REF_CLK (50 MHz ±50 ppm), §7.4 AC characteristics (35–65 % duty, 4 ns setup, 2 ns hold, 1–5 ns edges, 25 pF load) and §7.2, which states that no characteristic impedance is within the scope of the specification.',
      },
      MCHP_AN1231,
      TI_SNLA387,
    ],
  },
  {
    id: 'sgmii',
    name: 'SGMII (MAC ↔ PHY)',
    family: 'Ethernet',
    summary: 'Serial gigabit MII: one differential pair per direction at 1.25 GBd.',
    rateGbps: 1.25,
    nyquistGHz: 0.625,
    encoding: '8b/10b, 1.25 GBd (1 Gb/s payload)',
    z: { kind: 'diff', target: 100, min: 95, max: 105, note: 'Routed to 100 Ω differential; TI’s SoC tables give 95 Ω ±5 % on one platform. The 80–120 Ω in the SGMII specification is the receiver input impedance, not a trace tolerance.' },
    intraPairPs: 5,
    intraPairGuideline: true,
    maxLenMm: 7500 * MIL,
    rules: [
      { key: 'other', label: 'Signalling', req: '1.25 GBd, 8b/10b coded, so the clock content sits at 625 MHz. Differential output 150–400 mV.', normative: true, src: 0 },
      { key: 'z', label: 'Impedance', req: '100 Ω differential; the receiver input presents 80–120 Ω.', src: 1 },
      { key: 'skew', label: 'Intra-pair skew', req: 'Under 5 ps between the two traces of a pair, which TI calls 30 mil on FR-4.', src: 1 },
      { key: 'skew', label: 'Pair-to-pair', req: 'The transmit pair does not have to match the receive pair. In six-wire mode the receive pair must match the clock pair within 5 ps.', src: 1 },
      { key: 'cap', label: 'AC coupling', req: 'Every SGMII connection is AC-coupled through 0.1 µF, in an 0402 package or smaller.', detail: 'An SFP transceiver usually has integrated AC-coupling capacitors, so a second set may not be needed.', src: 1 },
      { key: 'length', label: 'Trace length', req: 'Up to 7500 mil on TI’s AM65xx/DRA80xM, the SoC whose table gives a limit.', src: 2 },
      { key: 'ref', label: 'Layer and reference', req: 'Route both traces of a pair on one layer, referenced to a parallel ground plane.', src: 1 },
      { key: 'term', label: 'Termination', req: 'The receiver presents 80–120 Ω (100 Ω typical); only the 0.1 µF series capacitors are shown on the link.', src: 1 },
      { key: 'space', label: 'Spacing', req: '5W (30 mil) between pairs, 30 mil to any other signal, 50 mil to clocks.', src: 2 },
    ],
    sources: [
      {
        title: 'Cisco Serial-GMII Specification ENG-46158 Rev 1.8 (2 Nov 2005)',
        url: 'https://archive.org/stream/sgmii/SGMII_djvu.txt',
        note: '1.25 GBd, 8b/10b, 625 MHz DDR clocking, LVDS-family levels per IEEE 1596.3, receiver input impedance 80–120 Ω, output swing 150–400 mV.',
      },
      {
        title: 'TI DP83869HM data sheet SNLS614 (§9.4 layout)',
        url: 'https://www.ti.com/lit/ds/symlink/dp83869hm.pdf',
        note: '100 Ω differential routing, 5 ps (30 mil) intra-pair skew, 0.1 µF 0402 coupling capacitors on every SGMII connection, six-wire clock matching, same-layer routing over a parallel ground plane.',
      },
      TI_SPRAAR7J,
    ],
  },

  // ── USB ─────────────────────────────────────────────────────────────────────
  {
    id: 'usb2-hs',
    name: 'USB 2.0 High Speed',
    family: 'USB',
    summary: 'The D+/D− pair at 480 Mb/s, between the controller and its connector.',
    rateGbps: 0.48,
    nyquistGHz: 0.24,
    encoding: 'NRZI with bit stuffing (the clock is carried in the data)',
    layout: {
      viasPerTrace: { value: 4, src: 1 },
      spaceMm: { value: 30 * MIL, src: 1 },
    },
    z: { kind: 'diff', target: 90, min: 76.5, max: 103.5 },
    z2: { kind: 'se', target: 45, label: '45 Ω from each line to ground' },
    intraPairMm: 50 * MIL,
    intraPairGuideline: true,
    maxLenMm: 12 * IN,
    rules: [
      { key: 'z', label: 'Impedance', req: '90 Ω ±15 % differential on the board.', normative: true, src: 0 },
      { key: 'z', label: 'Single-ended impedance', req: '45 Ω from each line to ground.', detail: 'In the specification 45 Ω is the line termination (40.5–49.5 Ω); the 45 Ω trace target is TI’s.', src: 1 },
      { key: 'skew', label: 'Intra-pair matching', req: '50 mil between D+ and D− on the board.', src: 1 },
      { key: 'skew', label: 'Cable skew', req: 'The specification limits the skew of the cable to 100 ps; it sets no board limit.', normative: true, src: 0 },
      { key: 'length', label: 'Trace length', req: '4 in typical, 12 in maximum.', src: 1 },
      { key: 'length', label: 'Delay budget', req: 'The board may add 3 ns on the host or hub side and 1 ns on the device side.', normative: true, src: 0 },
      { key: 'cap', label: 'AC coupling', req: 'None: no series capacitors on the pair.', src: 2 },
      { key: 'cap', label: 'Capacitance', req: 'For High Speed, at most 10 pF on each line, matched within 1.0 pF.', normative: true, src: 0 },
      { key: 'term', label: 'Termination', req: '45 Ω from each line to ground at both ends (40.5–49.5 Ω), on-die or with external resistors.', normative: true, src: 0 },
      { key: 'other', label: 'Pull-up', req: 'A High-Speed-capable device pulls D+ up through 1.5 kΩ ±5 % to 3.3 V; a downstream port pulls both lines down through 15 kΩ.', normative: true, src: 0 },
      { key: 'via', label: 'Vias and stubs', req: 'At most four vias on each trace, no stubs (branches) on the pair, and no test points.', src: 1 },
      { key: 'space', label: 'Spacing', req: 'At least 30 mil to any other signal and 50 mil to a clock or other periodic signal.', src: 1 },
      { key: 'ref', label: 'Reference plane', req: 'Keep the pair over solid ground, never across a split or a void, and at least 90 mil from a plane edge.', src: 1 },
      {
        key: 'other',
        label: 'Connector entry',
        req: 'Land the pair on the bottom layer for a through-hole receptacle, on the top layer for a surface-mount one.',
        detail: 'Entering from the far side turns the through-hole pin into a stub.',
        src: 1,
      },
      { key: 'other', label: 'Edge rates', req: 'High Speed rise and fall times of at least 500 ps (10–90 %) at the receptacle.', normative: true, src: 0 },
    ],
    sources: [
      {
        title: 'Universal Serial Bus Specification Rev 2.0 (27 April 2000)',
        url: 'https://www.usb.org/document-library/usb-20-specification',
        note: '§7.1.6.1 the board 90 Ω ±15 % (§7.1.1.3 the cable), 45 Ω line termination; §7.1.6.2 High-Speed capacitance; §7.1.2.2 High-Speed edge rates; §7.1.3 cable skew 100 ps; §7.1.5.2 pull-ups; §7.1.16 the delay budget; Table 7-12 cable characteristics.',
      },
      TI_SPRAAR7J,
      TI_SLLA414_GENERAL,
    ],
  },
  {
    id: 'usb3-gen1',
    name: 'USB 3.2 Gen 1 (5 Gb/s)',
    family: 'USB',
    summary: 'SuperSpeed at 5 Gb/s: one transmit pair and one receive pair.',
    rateGbps: 5,
    nyquistGHz: 2.5,
    encoding: '8b/10b, with mandatory spread-spectrum clocking (30–33 kHz, 0 to −5000 ppm)',
    layout: {
      viaStubMm: { value: 15 * MIL, src: 1 },
      returnViaMm: { value: 200 * MIL, src: 1 },
      equalVias: { src: 1 },
      spaceMm: { value: 30 * MIL, src: 1 },
      pairSpaceW: { value: 5, src: 1 },
    },
    z: { kind: 'diff', target: 90, min: 76.5, max: 103.5, note: '90 Ω ±15 % on the board (TI); the silicon is specified at 72–120 Ω.' },
    intraPairMm: 5 * MIL,
    intraPairGuideline: true,
    lossNote: 'The USB 3.2 specification gives an informative budget of 8.5 dB for the host or device and 23 dB for the whole channel, plotted at 5 GHz (the Gen 2 Nyquist frequency), so it is not checked against Gen 1 loss at 2.5 GHz.',
    rules: [
      { key: 'z', label: 'Impedance', req: '90 Ω ±15 % differential on the board.', src: 1 },
      { key: 'z', label: 'Silicon', req: 'Transmitter and receiver are specified at 72–120 Ω differential.', normative: true, src: 0 },
      {
        key: 'z',
        label: 'The 85 Ω figure',
        req: 'Not a trace target: it is the impedance the Type-C S-parameters are normalised to, and the recommended mated-connector value (85 Ω ±9 Ω, informative).',
        src: 2,
      },
      { key: 'skew', label: 'Intra-pair matching', req: 'About 5 mil, or 15 ps per metre. The specification sets no board limit; the raw cable is recommended to stay within 10 ps per metre (informative).', src: 1 },
      { key: 'skew', label: 'Pair-to-pair matching', req: 'None. The transmit and receive pairs do not have to be the same length.', src: 1 },
      { key: 'loss', label: 'Insertion loss', req: 'Informative budget: 8.5 dB for the host or device, 23 dB end to end, plotted at 5 GHz.', src: 0 },
      { key: 'cap', label: 'AC coupling', req: 'Every transmitter is AC-coupled, 75–265 nF. A receiver may be coupled too, but then the window is 297–363 nF.', normative: true, src: 0 },
      { key: 'cap', label: 'Capacitor package', req: '0402 recommended, 0603 the largest.', src: 1 },
      { key: 'term', label: 'Termination', req: 'On-die, 72–120 Ω differential at both ends. Receiver termination is also how the link detects a partner, so apart from the AC capacitors nothing belongs on the pair.', normative: true, src: 0 },
      { key: 'via', label: 'Vias and stubs', req: 'Keep via stubs under 15 mil or back-drill them, use a 30 mil anti-pad on every layer, and give both traces of a pair the same number of vias.', src: 1 },
      { key: 'ref', label: 'Reference plane', req: 'Same solid ground reference from end to end; where the ground reference changes, place stitching vias symmetrically within 200 mil of the signal vias.', src: 1 },
      { key: 'space', label: 'Spacing', req: '5W between pairs, at least 30 mil to any other signal and 50 mil to a clock.', src: 1 },
      { key: 'other', label: 'Connector launch', req: 'Void the ground under the receptacle pads.', detail: 'Without the void, the launch impedance under a SuperSpeed receptacle can fall to about 40 Ω.', src: 3 },
      { key: 'other', label: 'Series parts', req: 'Void the reference plane under the pads of series components on the pair, at least two layers deep.', src: 1 },
      { key: 'other', label: 'Polarity', req: 'The two lines of a pair may be swapped to avoid a crossover; the link sorts it out.', src: 1 },
    ],
    sources: [
      {
        title: 'USB 3.2 Specification Rev 1.1 (June 2022)',
        url: 'https://www.usb.org/document-library/usb-32-revision-11-june-2022',
        note: 'Table 6-18 transmitter parameters (72–120 Ω, AC coupling 75–265 nF, de-emphasis), Table 6-22 receiver parameters (297–363 nF if coupled), §6.5.3 spread spectrum, §E.6.4.8 the informative 8.5 dB / 23 dB insertion-loss budget, plotted at 5 GHz.',
      },
      {
        title: 'TI SLLA414A — High-Speed Layout Guidelines for Signal Conditioners and USB Hubs (rev. January 2026)',
        url: 'https://www.ti.com/lit/an/slla414/slla414.pdf',
        note: 'Per-interface impedance and skew table (USB 3.2: 90 Ω ±15 %, 15 ps/m, no inter-pair requirement), 5W spacing, 15 mil via stubs and back-drilling, 30 mil anti-pads, 200 mil stitching vias, capacitor package sizes and pad voiding.',
      },
      {
        title: 'USB Type-C Cable and Connector Specification Release 2.0 (August 2019)',
        url: 'https://www.usb.org/sites/default/files/USB%20Type-C%20Spec%20R2.0%20-%20August%202019.pdf',
        note: '§3.7 S-parameters normalised to 85 Ω; informative recommendations of 85 Ω ±9 Ω for the mated connector (§3.7.3.1) and 90 Ω ±5 Ω with 10 ps/m intra-pair skew for the raw cable (§3.7.1); §E.2.2 AC coupling for alternate modes.',
      },
      {
        title: 'USB-IF — Managing Connector and Cable Assembly Performance for USB SuperSpeed (Rev 1.0, 2013)',
        url: 'https://www.usb.org/sites/default/files/USB_SuperSpeed_CabCon_Whitepaper.pdf',
        note: 'Mated connector 75–105 Ω, cable insertion-loss mask, and the ground voiding under receptacle pads without which the launch drops to about 40 Ω.',
      },
    ],
  },
  {
    id: 'usb3-gen2',
    name: 'USB 3.2 Gen 2 (10 Gb/s)',
    family: 'USB',
    summary: 'SuperSpeed at 10 Gb/s: the same pairs as Gen 1, at twice the rate.',
    rateGbps: 10,
    nyquistGHz: 5,
    encoding: '128b/132b, with mandatory spread-spectrum clocking',
    layout: {
      viaStubMm: { value: 15 * MIL, src: 1 },
      returnViaMm: { value: 200 * MIL, src: 1 },
      equalVias: { src: 1 },
      spaceMm: { value: 30 * MIL, src: 1 },
      pairSpaceW: { value: 5, src: 1 },
    },
    z: { kind: 'diff', target: 90, min: 76.5, max: 103.5 },
    intraPairMm: 5 * MIL,
    intraPairGuideline: true,
    lossBudgetDb: 8.5,
    lossNote: 'The USB 3.2 specification gives an informative budget of 8.5 dB for the host or device and 23 dB for the whole channel, at the 5 GHz Nyquist frequency.',
    rules: [
      { key: 'z', label: 'Impedance', req: '90 Ω ±15 % differential on the board.', src: 1 },
      { key: 'z', label: 'Silicon', req: 'Transmitter and receiver are specified at 72–120 Ω differential.', normative: true, src: 0 },
      {
        key: 'z',
        label: 'The 85 Ω figure',
        req: 'Not a trace target: it is the impedance the Type-C S-parameters are normalised to, and the recommended mated-connector value (85 Ω ±9 Ω, informative).',
        src: 2,
      },
      { key: 'skew', label: 'Intra-pair matching', req: 'About 5 mil, or 15 ps per metre.', src: 1 },
      { key: 'skew', label: 'Pair-to-pair matching', req: 'None: transmit and receive lengths are independent.', src: 1 },
      { key: 'loss', label: 'Insertion loss', req: 'Informative budget 8.5 dB for the host or device, 23 dB end to end, at the 5 GHz Nyquist frequency.', src: 0 },
      { key: 'cap', label: 'AC coupling', req: 'Mandatory on every transmitter, 75–265 nF (297–363 nF if a receiver is coupled as well).', normative: true, src: 0 },
      { key: 'cap', label: 'Capacitor package', req: '0402 recommended, 0603 the largest.', src: 1 },
      { key: 'term', label: 'Termination', req: 'On-die, 72–120 Ω differential; apart from the AC capacitors nothing belongs on the pair.', normative: true, src: 0 },
      { key: 'via', label: 'Vias and stubs', req: 'Under 15 mil of stub or back-drill; equal via count on both traces.', detail: 'At 5 GHz the stub, not the barrel, is what costs you the eye.', src: 1 },
      { key: 'ref', label: 'Reference plane', req: 'One solid ground reference end to end; where the ground reference changes, stitching vias within 200 mil of the signal vias.', src: 1 },
      { key: 'space', label: 'Spacing', req: '5W between pairs, 30 mil to other signals, 50 mil to clocks.', src: 1 },
      { key: 'other', label: 'Connector launch', req: 'Void the ground under the receptacle pads.', src: 3 },
      { key: 'other', label: 'Series parts', req: 'Void the plane under the coupling capacitors, at least two layers deep.', src: 1 },
    ],
    sources: [
      {
        title: 'USB 3.2 Specification Rev 1.1 (June 2022)',
        url: 'https://www.usb.org/document-library/usb-32-revision-11-june-2022',
        note: 'Gen 2 = 10 Gb/s with 128b/132b coding (§6.3.2); Table 6-18 and Table 6-22 give identical impedance and coupling windows for both generations; §E.6.4 names 5 GHz as the Gen 2 Nyquist frequency.',
      },
      {
        title: 'TI SLLA414A — High-Speed Layout Guidelines for Signal Conditioners and USB Hubs (rev. January 2026)',
        url: 'https://www.ti.com/lit/an/slla414/slla414.pdf',
        note: 'SuperSpeed 10 Gb/s row: 5 GHz Nyquist, 90 Ω ±15 %, 15 ps/m intra-pair, no inter-pair requirement; the general via, spacing and capacitor rules.',
      },
      {
        title: 'USB Type-C Cable and Connector Specification Release 2.0 (August 2019)',
        url: 'https://www.usb.org/sites/default/files/USB%20Type-C%20Spec%20R2.0%20-%20August%202019.pdf',
        note: 'Mated connector 85 Ω ±9 Ω, cable 90 Ω ±5 Ω, and the fitted insertion loss checked at each generation’s Nyquist frequency.',
      },
      {
        title: 'USB-IF — Managing Connector and Cable Assembly Performance for USB SuperSpeed (Rev 1.0, 2013)',
        url: 'https://www.usb.org/sites/default/files/USB_SuperSpeed_CabCon_Whitepaper.pdf',
        note: 'Connector launch design and the plane voiding under receptacle pads.',
      },
    ],
  },

  // ── Video ───────────────────────────────────────────────────────────────────
  {
    id: 'hdmi-14',
    name: 'HDMI 1.4 (TMDS, 3.4 Gb/s)',
    family: 'Video',
    summary: 'Three TMDS data pairs and a clock pair, up to 340 MHz clock.',
    rateGbps: 3.4,
    nyquistGHz: 1.7,
    encoding: 'TMDS, 10-bit characters, clock forwarded on its own pair',
    layout: {
      viaStubMm: { value: 15 * MIL, src: 0 },
      returnViaMm: { value: 200 * MIL, src: 0 },
      equalVias: { src: 0 },
      spaceMm: { value: 30 * MIL, src: 0 },
      pairSpaceW: { value: 5, src: 0 },
      laneSkewMm: { value: 1 * IN, src: 1 },
      laneSkewBudgetPs: { value: 588, src: 2 },
    },
    z: { kind: 'diff', target: 100, min: 85, max: 115, note: '100 Ω ±15 % differential; TI allows 75–110 Ω between a GPU and a redriver on a source board.' },
    z2: { kind: 'se', target: 50, label: '50 Ω from each line to ground' },
    intraPairMm: 5 * MIL,
    intraPairGuideline: true,
    intraPairBudgetPs: 44,
    laneSkewMm: 1 * IN,
    maxLossPerInGHz: 0.17,
    skewLabels: { intra: 'Intra-pair skew (source board)', lane: 'Channel-to-channel skew (source board)' },
    rules: [
      { key: 'z', label: 'Impedance', req: '100 Ω ±15 % differential, 50 Ω ±15 % single-ended.', src: 0 },
      { key: 'skew', label: 'Intra-pair skew', req: 'The specification allows 0.15 of a bit time at the transmitter and 0.4 at the receiver.', normative: true, src: 2 },
      { key: 'skew', label: 'Intra-pair routing', req: '5 mil on a source board, 2 mil on a sink board.', src: 1 },
      { key: 'skew', label: 'Channel-to-channel skew', req: 'The specification allows 0.2 of a character time at the transmitter; the three data pairs and the clock must reach the receiver at the same time.', normative: true, src: 2 },
      { key: 'skew', label: 'Channel-to-channel routing', req: '1 in on a source board, 0.10 in on a sink board.', src: 1 },
      { key: 'loss', label: 'Trace loss', req: 'Published length limits assume 0.1–0.17 dB per inch per GHz. A lossier board must be routed shorter.', detail: 'The TMDS1204 data sheet allows 1–10 in from the source to the redriver and 0.75–2 in from the redriver to the receptacle at 12 Gb/s.', src: 1 },
      { key: 'cap', label: 'AC coupling', req: 'None: TMDS is DC-coupled, the sink biasing the pair through its 50 Ω terminations.', src: 0 },
      { key: 'cap', label: 'Redriver in AC-coupled mode', req: '85–253 nF, and a 499 Ω pull-down to ground on every output between the capacitor and the receptacle to set an HDMI-compliant common-mode voltage.', src: 1 },
      { key: 'term', label: 'Termination', req: 'On-die: 50 Ω to the 3.3 V termination supply at the sink, driven by a 10 mA current sink, so nothing external belongs on the pair.', src: 3 },
      { key: 'space', label: 'Spacing', req: '5W between pairs, and 8W to 10W around the clock pair.', src: 1 },
      { key: 'space', label: 'Keep-out', req: 'At least 30 mil to any other signal, 50 mil to a clock or periodic one.', src: 0 },
      { key: 'via', label: 'Vias', req: 'At most two vias from the source to a redriver and one from the redriver to the receptacle.', src: 1 },
      { key: 'via', label: 'Via count and stubs', req: 'The same number of vias on both traces, stubs under 15 mil (back-drill longer ones) and no unconnected via pads.', src: 0 },
      { key: 'ref', label: 'Reference plane', req: 'Solid ground under the whole run; where the ground reference changes, stitching vias within 200 mil of the signal vias.', src: 0 },
      {
        key: 'other',
        label: 'Connector pads',
        req: 'No metal layer or trace under or between the pads of the HDMI connector.',
        detail: 'Copper left there may drag the differential impedance below 75 Ω and fail the board in TDR testing.',
        src: 2,
      },
      { key: 'other', label: 'ESD protection', req: 'Within 0.5 in of the receptacle, with any series resistor to the redriver under 2.5 Ω and within 0.25 in of the protector.', src: 1 },
      { key: 'other', label: 'Polarity', req: 'Swapping the two lines of a pair is not allowed, so a P/N mix-up has to be fixed in the schematic.', src: 0 },
    ],
    sources: [
      {
        title: 'TI SLLA414A — High-Speed Layout Guidelines for Signal Conditioners and USB Hubs (rev. January 2026)',
        url: 'https://www.ti.com/lit/an/slla414/slla414.pdf',
        note: '§2.3 HDMI: 340 MHz clock and 1.7 GHz Nyquist at HDMI 1.4b, 3 GHz at 2.0b, 100 Ω ±15 % / 50 Ω ±15 %, intra-pair 0.15 of a bit time, no AC capacitors, no polarity reversal; §3–§4 the plane, stitching, via, spacing and capacitor rules.',
      },
      {
        title: 'TI TMDS1204 data sheet SLLSF57A (Tables 8-2 and 8-6, §8.5.1)',
        url: 'https://www.ti.com/lit/ds/symlink/tmds1204.pdf',
        note: 'Source and sink routing budgets: 5 mil and 2 mil intra-pair, 1 in and 0.10 in channel-to-channel, via counts, 0.1–0.17 dB/in/GHz trace loss, 85–253 nF coupling with the 499 Ω pull-down, ESD placement, 8W–10W around the clock pair.',
      },
      {
        title: 'TI HDMI Design Guide (June 2007)',
        url: 'https://e2e.ti.com/cfs-file/__key/telligent-evolution-components-attachments/00-138-01-00-00-10-65-80/Texas-Instruments-HDMI-Design-Guide.pdf',
        note: '100 Ω ±15 %, intra-pair 0.15 of a bit time at the source and 0.4 at the sink, inter-pair 0.2 of a character time, and the warning that copper under the connector pads drops the impedance below 75 Ω and fails TDR.',
      },
      {
        title: 'TI TMDS141 data sheet SLLS737D',
        url: 'https://www.ti.com/lit/ds/symlink/tmds141.pdf',
        note: 'Integrated 50 Ω terminations to the 3.3 V termination supply at every receiver input, 10 mA current-mode driver, and the resulting output levels — the evidence that TMDS needs no external termination.',
      },
    ],
  },
  {
    id: 'hdmi-20',
    name: 'HDMI 2.0 (TMDS, 6 Gb/s)',
    family: 'Video',
    summary: 'The same four pairs at 6 Gb/s, with the clock running at a fortieth of the data rate.',
    rateGbps: 6,
    nyquistGHz: 3,
    encoding: 'TMDS, 10-bit characters, clock at 1/40 of the data rate in HDMI 2.0 mode',
    layout: {
      viaStubMm: { value: 15 * MIL, src: 0 },
      returnViaMm: { value: 200 * MIL, src: 0 },
      equalVias: { src: 0 },
      spaceMm: { value: 30 * MIL, src: 0 },
      pairSpaceW: { value: 5, src: 0 },
      laneSkewMm: { value: 1 * IN, src: 1 },
      laneSkewBudgetPs: { value: 333, src: 2 },
    },
    z: { kind: 'diff', target: 100, min: 85, max: 115 },
    z2: { kind: 'se', target: 50, label: '50 Ω from each line to ground' },
    intraPairMm: 5 * MIL,
    intraPairGuideline: true,
    intraPairBudgetPs: 25,
    laneSkewMm: 1 * IN,
    maxLossPerInGHz: 0.2,
    skewLabels: { intra: 'Intra-pair skew (source board)', lane: 'Channel-to-channel skew (source board)' },
    rules: [
      { key: 'z', label: 'Impedance', req: '100 Ω ±15 % differential, 50 Ω ±15 % single-ended.', src: 0 },
      { key: 'skew', label: 'Intra-pair skew', req: 'The specification allows 0.15 of a bit time at the transmitter, about 25 ps at 6 Gb/s.', normative: true, src: 2 },
      { key: 'skew', label: 'Intra-pair routing', req: '5 mil on a source board, 2 mil on a sink board.', src: 1 },
      { key: 'skew', label: 'Channel-to-channel skew', req: 'The specification allows 0.2 of a character time at the transmitter, about 333 ps at 6 Gb/s.', normative: true, src: 2 },
      { key: 'skew', label: 'Channel-to-channel routing', req: '1 in on a source board.', src: 1 },
      { key: 'loss', label: 'Trace loss', req: '0.1–0.2 dB per inch per GHz for the published lengths to hold, with crosstalk between neighbouring pairs below −24 dB up to 3 GHz.', src: 1 },
      { key: 'cap', label: 'AC coupling', req: 'None on a plain HDMI link. A redriver used in AC-coupled mode needs 85–253 nF within 0.3 in of the device, plus the 499 Ω pull-downs.', src: 1 },
      { key: 'term', label: 'Termination', req: 'At the sink, on-die 50 Ω to the 3.3 V termination supply. Above 3.4 Gb/s HDMI 2.0 also asks for a source termination of about 100 Ω.', src: 1 },
      { key: 'space', label: 'Spacing', req: '5W between pairs, 8W–10W around the clock pair.', src: 1 },
      { key: 'space', label: 'Keep-out', req: '30 mil to other signals, 50 mil to clocks and periodic ones.', src: 0 },
      { key: 'via', label: 'Vias', req: 'At most two vias between the source and a redriver and one between the redriver and the connector.', src: 1 },
      { key: 'via', label: 'Via count and stubs', req: 'The same number of vias on both traces, stubs under 15 mil (back-drill longer ones) and no unconnected via pads.', src: 0 },
      { key: 'ref', label: 'Reference plane', req: 'Solid ground under the whole run; where the ground reference changes, stitching vias within 200 mil of the signal vias.', src: 0 },
      { key: 'other', label: 'Connector pads', req: 'Keep copper out from under and between the connector pads, or the launch falls below 75 Ω.', src: 2 },
      { key: 'other', label: 'Test points', req: 'No probe or test points on a high-speed pair, and as few stubs as possible.', src: 0 },
    ],
    sources: [
      {
        title: 'TI SLLA414A — High-Speed Layout Guidelines for Signal Conditioners and USB Hubs (rev. January 2026)',
        url: 'https://www.ti.com/lit/an/slla414/slla414.pdf',
        note: '§2.3: HDMI 2.0b carries 6 Gb/s with a 150 MHz clock and a 3 GHz Nyquist frequency; impedance, skew and AC-coupling rows; the general layout rules in §3–§4.',
      },
      {
        title: 'TI TDP0604 data sheet SLLSFJ8A (Table 9-2) and TMDS1204 SLLSF57A',
        url: 'https://www.ti.com/lit/ds/symlink/tdp0604.pdf',
        note: '6 Gb/s HDMI 2.0 budgets: 1–16 in source to device and 0.75–2 in device to receptacle, 0.1–0.2 dB/in/GHz, 1 in channel-to-channel on a source board, two vias before and one after the redriver, −24 dB crosstalk, coupling capacitors of 85–253 nF; 5 mil intra-pair from the TMDS1204 data sheet (Table 8-2).',
      },
      {
        title: 'TI HDMI Design Guide (June 2007)',
        url: 'https://e2e.ti.com/cfs-file/__key/telligent-evolution-components-attachments/00-138-01-00-00-10-65-80/Texas-Instruments-HDMI-Design-Guide.pdf',
        note: 'Impedance and skew as fractions of the bit and character times, and the connector-pad voiding rule with its TDR consequence.',
      },
    ],
  },
  {
    id: 'dp-hbr2',
    name: 'DisplayPort 1.2 (HBR2, 5.4 Gb/s)',
    family: 'Video',
    summary: 'One, two or four AC-coupled, doubly terminated main-link lanes.',
    rateGbps: 5.4,
    nyquistGHz: 2.7,
    encoding: '1.62 / 2.7 / 5.4 Gb/s link rates',
    layout: {
      viaStubMm: { value: 15 * MIL, src: 0 },
      returnViaMm: { value: 200 * MIL, src: 0 },
      equalVias: { src: 0 },
      spaceMm: { value: 30 * MIL, src: 0 },
      pairSpaceW: { value: 5, src: 0 },
      laneSkewPs: { value: 370, src: 2 },
    },
    z: { kind: 'diff', target: 100, min: 90, max: 110, note: 'TI asks for ±10 %, NXP for ±20 %; some platforms deliberately target 85 Ω instead, to cut loss and match the connector.' },
    z2: { kind: 'se', target: 50, label: '50 Ω from each line to ground' },
    intraPairPs: 20,
    laneSkewPs: 370,
    rules: [
      { key: 'z', label: 'Impedance', req: '100 Ω differential ±10 %, 50 Ω single-ended ±15 %.', src: 0 },
      { key: 'skew', label: 'Intra-pair skew', req: '20 ps, which TI turns into about 5 mil of trace.', src: 0 },
      { key: 'skew', label: 'Lane-to-lane skew', req: 'At most 2 UI between lanes: 740 ps at 2.7 Gb/s.', detail: 'The guide was written for 2.7 Gb/s; at 5.4 Gb/s 2 UI is 370 ps, which the routing check uses as a guideline.', src: 2 },
      { key: 'cap', label: 'AC coupling', req: 'Required on the main link: 75–200 nF (100 nF is best), 0402 preferred, 0603 acceptable, no capacitor packs.', normative: true, src: 1 },
      { key: 'term', label: 'Termination', req: 'Doubly terminated: 50 Ω single-ended and 100 Ω differential.', src: 1 },
      { key: 'loss', label: 'Trace loss', req: 'Around 0.35–0.5 dB per inch, and each via pair may add 0.25 dB in corner cases, so vias may limit the reach.', src: 1 },
      { key: 'via', label: 'Vias', req: 'As few as possible; where a pair changes layer its two vias sit as a symmetric pair in the same place, with a pad of 25 mil or less, a finished hole of 14 mil or less and one to three ground stitching vias per pair.', src: 1 },
      { key: 'ref', label: 'Reference plane', req: 'Never straddle a plane split; keep the same ground reference through the whole run.', src: 1 },
      { key: 'space', label: 'Spacing', req: 'At least four times the dielectric height to other pairs, 30 mil to signals with significantly higher voltage levels or edge rates, and bends of 135° or more.', src: 1 },
      { key: 'other', label: 'Length matching', req: 'Correct a mismatch in the segment where it happens, and keep serpentine jogs at least three trace widths long.', src: 1 },
      { key: 'other', label: 'Connector pads', req: 'No copper under or between the connector pads; large pads and vias pull the impedance down.', src: 2 },
    ],
    sources: [
      {
        title: 'TI SLLA414A — High-Speed Layout Guidelines for Signal Conditioners and USB Hubs (rev. January 2026)',
        url: 'https://www.ti.com/lit/an/slla414/slla414.pdf',
        note: '§2.4 DisplayPort: 5.4 Gb/s with a 2.7 GHz Nyquist frequency at HBR2 and 8.1 Gb/s with 4.05 GHz at HBR3, 100 Ω ±10 % / 50 Ω ±15 %, 20 ps intra-pair (about 5 mil), AC capacitors required; no inter-pair row.',
      },
      {
        title: 'NXP AN10798 — DisplayPort PCB layout guidelines (Rev. 01, March 2009)',
        url: 'https://www.nxp.com/docs/en/application-note/AN10798.pdf', // the NXP link was offline when this was last checked; content of Rev. 01
        note: '50 Ω ±15 % single-ended and 100 Ω ±20 % differential, 5 mil intra-pair, coupling capacitors of 75–200 nF (100 nF best, 0402 preferred), via geometry and 0.25 dB per via pair, 0.35–0.5 dB per inch of FR-4, bend and serpentine geometry, and Intel’s move to 85 Ω on some platforms.',
      },
      {
        title: 'TI DisplayPort Design Guide (April 2009)',
        url: 'https://e2e.ti.com/cfs-file/__key/CommunityServer.Discussions.Components.Files/48/0552.Texas-Instruments-DisplayPort-Design-Guide.pdf',
        note: '100 Ω ±10 %, 20 ps intra-pair skew and 2 UI between lanes, and the rule that no metal may sit under or between the connector pads.',
      },
    ],
  },
  {
    id: 'dp-hbr3',
    name: 'DisplayPort 1.4 (HBR3, 8.1 Gb/s)',
    family: 'Video',
    summary: 'The same main-link lanes at 8.1 Gb/s.',
    rateGbps: 8.1,
    nyquistGHz: 4.05,
    encoding: '8.1 Gb/s per lane (HBR3)',
    layout: {
      viaStubMm: { value: 15 * MIL, src: 0 },
      returnViaMm: { value: 200 * MIL, src: 0 },
      equalVias: { src: 0 },
      spaceMm: { value: 30 * MIL, src: 0 },
      pairSpaceW: { value: 5, src: 0 },
    },
    z: { kind: 'diff', target: 100, min: 90, max: 110 },
    z2: { kind: 'se', target: 50, label: '50 Ω from each line to ground' },
    intraPairPs: 20,
    rules: [
      { key: 'z', label: 'Impedance', req: '100 Ω differential ±10 %, 50 Ω single-ended ±15 %.', src: 0 },
      { key: 'skew', label: 'Intra-pair skew', req: '20 ps, about 5 mil of trace.', src: 0 },
      { key: 'skew', label: 'Lane-to-lane skew', req: 'TI’s Jacinto 7 design guidelines budget 1250 ps between DisplayPort lanes.', src: 2 },
      { key: 'cap', label: 'AC coupling', req: 'Required on every main-link lane: 75–200 nF (100 nF is best), 0402 preferred.', normative: true, src: 1 },
      { key: 'term', label: 'Termination', req: 'Doubly terminated: 50 Ω single-ended and 100 Ω differential.', src: 1 },
      { key: 'loss', label: 'Trace loss', req: 'Around 0.35–0.5 dB per inch on FR-4 (NXP does not give the frequency); at 8.1 Gb/s a long run may need a better laminate or a redriver.', src: 1 },
      { key: 'other', label: 'Fibre weave', req: 'Route long runs at an off-angle to the board axes, so a trace does not follow the fibreglass bundles of the weave.', src: 1 },
      { key: 'via', label: 'Vias', req: 'The same number of vias on both traces, stubs under 15 mil or back-drilled, anti-pads of about 30 mil on every layer with no unconnected pads.', src: 0 },
      { key: 'ref', label: 'Reference plane', req: 'One ground reference from end to end; where the ground reference changes, stitching vias within 200 mil of the signal vias, and stitching capacitors of 1 µF or less if a split must be crossed.', src: 0 },
      { key: 'space', label: 'Spacing', req: '5W between pairs, 30 mil keep-out to other signals, 50 mil to clocks, bends of at least 135°, package escape within 0.25 in.', src: 0 },
    ],
    sources: [
      {
        title: 'TI SLLA414A — High-Speed Layout Guidelines for Signal Conditioners and USB Hubs (rev. January 2026)',
        url: 'https://www.ti.com/lit/an/slla414/slla414.pdf',
        note: '§2.4 lists HBR3 at 8.1 Gb/s with a 4.05 GHz Nyquist frequency, 100 Ω ±10 % / 50 Ω ±15 % and 20 ps intra-pair; §3.5 gives the stitching rules and §4 the via, anti-pad and spacing rules.',
      },
      {
        title: 'NXP AN10798 — DisplayPort PCB layout guidelines (Rev. 01, March 2009)',
        url: 'https://www.nxp.com/docs/en/application-note/AN10798.pdf',
        note: 'Written for 1.62 and 2.7 Gb/s links: coupling-capacitor values and placement, via geometry and per-via loss, loss per inch on FR-4, bend and serpentine rules, and routing at an angle to the glass weave.',
      },
      {
        title: 'TI SPRACP4A — Jacinto 7 High-Speed Interface Design Guidelines (rev. June 2024)',
        url: 'https://www.ti.com/lit/pdf/spracp4',
        note: 'Table 3-7: DisplayPort routing on Jacinto 7, including a 1250 ps lane-to-lane skew budget.',
      },
    ],
  },

  // ── Memory ──────────────────────────────────────────────────────────────────
  {
    id: 'ddr4',
    name: 'DDR4 (up to 3200 MT/s)',
    family: 'Memory',
    summary: 'Single-ended data and address lines with differential clock and strobes, routed fly-by.',
    rateGbps: 3.2,
    nyquistGHz: 1.6,
    encoding: 'Single-ended pseudo-open-drain (POD), double data rate',
    z: { kind: 'se', target: 40, min: 36, max: 44, note: 'TI uses 40 Ω; AMD 39 Ω for data and 36 Ω for address on the main board, 50 Ω in the BGA breakout; NXP 40 Ω or 50 Ω.' },
    z2: { kind: 'diff', target: 80, label: 'CK and DQS pairs (differential)' },
    intraPairPs: 0.4,
    laneSkewPs: 2,
    skewLabels: { intra: 'CK and DQS intra-pair skew', lane: 'DQ to DQS inside a byte lane' },
    maxDelayPs: 500,
    rules: [
      { key: 'z', label: 'Impedance', req: '40 Ω single-ended ±10 %, and 80 Ω differential for CK and DQS.', detail: 'TI sets the pair pitch to about 2W, so that the differential impedance is twice the single-ended value. Where a guide uses 50 Ω single-ended, NXP pairs it with about 100 Ω differential and AMD with 86 Ω.', src: 0 },
      { key: 'skew', label: 'DQ to DQS', req: 'Within 2 ps inside a byte lane (TI).', detail: 'The tolerance follows each PHY’s deskew capability, so use the number from the controller you are designing with.', src: 0 },
      { key: 'skew', label: 'DQ to DQS (AMD)', req: '±10 ps.', src: 1 },
      { key: 'skew', label: 'DQ to DQS (NXP)', req: '±20 mil, ±5 mil above 1600 MT/s.', src: 2 },
      { key: 'skew', label: 'Byte lane to byte lane', req: 'Not required. TI states that matching lengths across byte lanes is neither required nor recommended.', src: 0 },
      { key: 'skew', label: 'CK to DQS', req: 'A deliberately wide, asymmetric window (AMD: −149 to +1796 ps), because write levelling absorbs it.', detail: 'The clock touches every device on the fly-by chain and is therefore slower than any one strobe. Over-tightening this fights the topology.', src: 1 },
      { key: 'skew', label: 'Address and command to CK', req: '3 ps per segment and 4 ps in total (TI).', src: 0 },
      { key: 'skew', label: 'Address and command to CK (AMD)', req: '±8 ps (47 mil).', src: 1 },
      { key: 'length', label: 'Route delay', req: 'Each byte lane and the address lead-in stay under 500 ps, the A3 segment under 125 ps and the stubs under 17 ps.', detail: 'TI counts 1 ps as 5 mil of stripline, and asks you to divide microstrip lengths by 1.1 before adding them up, as JEDEC specifies.', src: 0 },
      { key: 'length', label: 'Data route (AMD)', req: '6 in of data route including the package.', src: 1 },
      { key: 'other', label: 'Topology', req: 'Fly-by is mandatory for DDR4: clock, address and command run from the controller to each device in turn with a short stub at each one, and terminate at the end. T-branch routing is not supported.', src: 0 },
      { key: 'term', label: 'Termination', req: 'VTT = half of VDDQ through a resistor equal to the trace impedance at the end of the fly-by chain, placed right after the last device. Series resistors at the driver are not allowed.', detail: 'A single-device design can drop VTT, but the differential clock still needs its terminator.', src: 0 },
      { key: 'term', label: 'On-die termination', req: 'ODT is 240, 120, 80, 60, 48, 40 or 34 Ω, set from RZQ = 240 Ω ±1 %. The driver is 34 Ω or 48 Ω.', normative: true, src: 3 },
      { key: 'ref', label: 'Reference plane', req: 'No reference-plane cuts anywhere in the DDR routing area, and the plane directly adjacent to the signal layer. Watch out for the voids that via anti-pads create.', detail: 'Data and clock reference ground; address and command may reference the DDR supply if both ends of each route are bypassed.', src: 0 },
      { key: 'via', label: 'Vias', req: 'At most two vias per data trace and three on clock, address and command; the same via count within a byte (clock and address may differ by one), and ground vias near each transition.', src: 0 },
      { key: 'space', label: 'Spacing', req: '4W from a clock or strobe to anything else, 3W between address lines and between the bits of one byte; 2W is allowed for up to 500 mil near the ends.', src: 0 },
      { key: 'other', label: 'Layer choice', req: 'Stripline is strongly preferred, and traces on adjacent layers must cross at right angles, offset by more than three times the trace-to-plane distance.', src: 0 },
      { key: 'other', label: 'VREF', req: 'VREF for command and address is routed on a nominal 20 mil trace with 0.1 µF near each device.', src: 0 },
      { key: 'other', label: 'VREF and VTT (NXP)', req: 'VREF and VTT may not share a plane; keep 20–25 mil of clearance around VREF.', src: 2 },
    ],
    sources: [
      {
        title: 'TI SPRAD06C — AM62x, AM62Lx DDR Board Design and Layout Guidelines (rev. March 2025)',
        url: 'https://www.ti.com/lit/pdf/sprad06',
        note: 'Tables 1-1, 2-6 and 2-7: 40 Ω / 80 Ω with ±10 %, 0.4 ps intra-pair, 2 ps DQ-to-DQS, 500 ps segment limits, 4W/3W spacing, zero plane cuts, via counts, fly-by requirement, VTT and VREF rules, and the 1 ps = 5 mil / ÷1.1 microstrip convention. These rules are written for up to 1600 MT/s.',
      },
      {
        title: 'AMD UG583 — UltraScale Architecture PCB Design User Guide',
        url: 'https://docs.amd.com/r/en-US/ug583-ultrascale-pcb-design',
        note: 'Main-board 39 Ω (data) and 36 Ω (address) single-ended and 76 Ω differential with 50/86 Ω breakouts, ±10 ps data-to-strobe, 2 ps intra-pair, ±8 ps address-to-clock, 6 in data routes, and the −149 to +1796 ps clock-to-strobe window that write levelling allows.',
      },
      {
        title: 'NXP AN5097 — Hardware and Layout Design Considerations for DDR4 SDRAM Memory Interfaces (Rev. 2, 2019)',
        url: 'https://community.nxp.com/pwmxy87654/attachments/pwmxy87654/imx-processors/231241/1/AN5097%20Hardware%20and%20Layout%20Design%20Considerations%20for%20DDR4%20SDRAM%20Memory%20Interfaces.pdf',
        note: '40–50 Ω single-ended with 75–95 Ω differential, or 50 Ω with about 100 Ω; ±5 mil intra-pair, ±20 mil (±5 mil above 1600 MT/s) data-to-strobe, VTT sizing and decoupling, and the rule that VREF and VTT may not share a plane.',
      },
      {
        title: 'JEDEC JESD79-4 — DDR4 SDRAM',
        url: 'https://www.jedec.org/standards-documents/docs/jesd79-4a',
        note: 'RZQ = 240 Ω ±1 %, the supported ODT values (240 down to 34 Ω) and the 34 Ω / 48 Ω driver settings. JEDEC does not specify PCB trace impedance at all. JEDEC sells the standard to non-members; the same ODT and driver values appear in public DDR4 data sheets such as ISSI’s IS43/46QR16256B.',
      },
    ],
  },
  {
    id: 'lpddr4',
    name: 'LPDDR4 / LPDDR4X (up to 4266 MT/s)',
    family: 'Memory',
    summary: 'Point-to-point low-power DDR: no board termination, per-bit deskew in the PHY.',
    rateGbps: 4.266,
    nyquistGHz: 2.133,
    encoding: 'Single-ended low-voltage swing terminated logic, double data rate',
    z: { kind: 'se', target: 40, min: 36, max: 44, note: 'TI and Efinix use 40 Ω; AMD uses 39 Ω (UltraScale) or 45 Ω (Versal).' },
    z2: { kind: 'diff', target: 80, label: 'CK and DQS pairs (differential)' },
    intraPairPs: 1.5,
    skewLabels: { intra: 'DQS intra-pair skew' },
    maxDelayPs: 450,
    rules: [
      { key: 'z', label: 'Impedance', req: '40 Ω single-ended ±10 %, 80 Ω differential for CK and DQS.', src: 0 },
      { key: 'z', label: 'LPDDR4X', req: 'Routed to the same 40 Ω / 80 Ω ±10 % as LPDDR4.', src: 2 },
      { key: 'skew', label: 'DQ to DQS', req: 'The strobe should arrive before every data line in its byte: a DQ may be at most 49 ps shorter than its DQS, and the strobe-to-byte skew stays within 150 ps.', detail: 'The window is asymmetric on purpose, so a length-matching tool set to match symmetrically will break it.', src: 0 },
      { key: 'skew', label: 'DQ to DQS (AMD Versal)', req: '±100 ps.', src: 1 },
      { key: 'skew', label: 'CK to DQS', req: 'The clock pair must be longer than every strobe pair, by 0 to 3 clock cycles (tCK).', src: 0 },
      { key: 'skew', label: 'Address and command to CK', req: 'Within ±312.5 ps at TI; AMD Versal asks for ±100 ps on the command bus and ±20 ps on the chip-select and clock-enable lines.', src: 0 },
      { key: 'length', label: 'Route delay', req: 'Clock, address, strobe and data all stay under 450 ps.', src: 0 },
      { key: 'length', label: 'Route length (AMD Versal)', req: '3600 mil, on inner signal layers only.', src: 1 },
      { key: 'term', label: 'Termination', req: 'No termination on any DDR signal, no VTT rail and no VREF routing on TI’s designs.', src: 0 },
      { key: 'skew', label: 'Deskew', req: 'Per-bit deskew in the PHY substantially loosens the skew tolerances.', src: 0 },
      { key: 'via', label: 'Vias and stubs', req: 'Two vias per data trace and three on clock and address; equal counts in a byte (clock and address may differ by one); via stubs typically 20 mil on clock and address and 40 mil on data. Ground vias within 250 mil of the transition vias.', detail: 'Signals with adjacent vias near the SoC must not also have adjacent vias near the DRAM, to keep crosstalk down.', src: 0 },
      { key: 'space', label: 'Spacing', req: '5W from a clock or strobe to anything else, 3W inside the address group and inside a byte; 2W for up to 500 mil near the ends.', src: 0 },
      { key: 'ref', label: 'Reference plane', req: 'No plane cuts in the routing area, plane directly adjacent to the signal layer, stripline strongly preferred.', src: 0 },
    ],
    sources: [
      {
        title: 'TI SPRAD06C — AM62x, AM62Lx DDR Board Design and Layout Guidelines (rev. March 2025)',
        url: 'https://www.ti.com/lit/pdf/sprad06',
        note: 'Table 1-1: 40 Ω / 80 Ω ±10 %; Tables 3-6 and 3-7: 1.5 ps DQS intra-pair, a DQ at most 49 ps shorter than its DQS, 150 ps strobe-to-byte skew, CK longer than every DQS by 0–3 tCK, 450 ps route limits, 5W/3W spacing, via and stub rules; §3.9–3.13 on the absence of VTT and VREF. These rules are written for up to 1600 MT/s.',
      },
      {
        title: 'AMD UG863 — Versal Adaptive SoC PCB Design User Guide, LPDDR4/4x rules',
        url: 'https://docs.amd.com/r/en-US/ug863-versal-pcb-design/Physical-Design-Rules-for-LPDDR4/4x-Signals',
        note: '45 Ω single-ended and 82 Ω differential ±10 %, ±100 ps data-to-strobe, 0–2 ps intra-pair, 3600 mil inner-layer routing, and spacing expressed in dielectric heights.',
      },
      {
        title: 'Efinix UG-PCB-DDR-TI v1.2 — Titanium DDR DRAM PCB Design User Guide',
        url: 'https://www.efinixinc.com/docs/pcb-guidelines-ddr-ti-ug-v1.2.pdf',
        note: '40 Ω / 80 Ω ±10 % for LPDDR4 and LPDDR4X alike, 75 ps DQ-to-DQS at 3700 Mb/s, 350 ps clock-to-strobe, 250 mil return vias, and 3× width spacing on FR-4 stripline.',
      },
    ],
  },

  // ── Camera, display and storage ─────────────────────────────────────────────
  {
    id: 'mipi-dphy',
    name: 'MIPI D-PHY (CSI-2 / DSI)',
    family: 'Camera & storage',
    summary: 'Camera and display lanes: a differential high-speed mode and a single-ended low-power mode on the same pair.',
    rateGbps: 2.5,
    nyquistGHz: 1.25,
    encoding: 'Double data rate: the clock lane runs at half the data rate, with a single-ended 1.2 V low-power mode on the same wires',
    layout: {
      viasPerTrace: { value: 2, src: 0 },
      equalVias: { src: 0 },
      pairSpaceW: { value: 5, src: 1 },
      laneSkewPs: { value: 40, src: 0 },
    },
    z: { kind: 'diff', target: 100, min: 85, max: 115, note: 'TI allows ±15 %, Efinix ±10 %. The single-ended value matters just as much, because low-power mode drives each wire on its own.' },
    z2: { kind: 'se', target: 50, label: '50 Ω from each line to ground (low-power mode)' },
    intraPairPs: 8,
    laneSkewPs: 40,
    maxLenMm: 10 * IN,
    skewLabels: { lane: 'Lane-to-lane skew' },
    rules: [
      {
        key: 'space',
        label: 'Coupling',
        req: 'Couple the pair loosely: it has to meet 100 Ω differential and 50 Ω single-ended at the same time.',
        detail: 'A tightly coupled pair optimised only for 100 Ω differential gets the single-ended impedance wrong.',
        src: 0,
      },
      { key: 'z', label: 'Impedance', req: '100 Ω differential and 50 Ω single-ended.', src: 0 },
      { key: 'skew', label: 'Intra-pair skew', req: 'About one fiftieth of a unit interval, roughly 8 ps at 2.5 Gb/s (TI’s estimate).', detail: 'The specification states it as mode-conversion S-parameters rather than a length, so the picosecond figure is an estimate the vendor offers.', src: 0 },
      { key: 'skew', label: 'Trace matching', req: 'CSI-2 traces matched to within 5 mil of each other.', src: 1 },
      { key: 'skew', label: 'Lane-to-lane skew', req: '0.1 of a unit interval, 40 ps at 2.5 Gb/s.', src: 0 },
      { key: 'term', label: 'Termination', req: 'Switched on only in high-speed mode; low-power mode sees a high-impedance receiver.', src: 2 },
      { key: 'length', label: 'Trace length', req: 'Up to 10 in.', src: 0 },
      { key: 'via', label: 'Vias and stubs', req: 'At most two vias per trace, no stubs and no test points, equal via counts across all lanes.', src: 0 },
      { key: 'ref', label: 'Reference plane', req: 'Solid ground under the whole run and never across a plane split; where the reference changes, stitching vias placed symmetrically within 200 mil of the signal vias.', src: 0 },
      { key: 'space', label: 'Spacing', req: 'Five trace widths between pairs, 50 mil to a clock, and bends of at least 135°.', src: 1 },
      { key: 'space', label: 'Spacing to other traces', req: 'Twice the pair’s own spacing to any other trace.', src: 0 },
      { key: 'clock', label: 'Clock lane', req: 'The clock lane runs at half the data rate, because the data is clocked on both edges.', src: 2 },
      { key: 'other', label: 'Specification', req: 'The D-PHY specification is available to MIPI Alliance members only; version 3.0 raises the rate to 9 Gb/s per lane.', src: 3 },
      { key: 'other', label: 'Levels', req: 'Low-power mode swings 0 to 1.2 V single-ended; high-speed mode is 200 mV differential around a 200 mV common mode.', src: 2 },
    ],
    sources: [
      {
        title: 'TI SPRACP4A — Jacinto 7 High-Speed Interface Design Guidelines (rev. June 2024)',
        url: 'https://www.ti.com/lit/pdf/spracp4',
        note: 'Table 3-12 for CSI-2 and DSI: 85/100/115 Ω differential with 50 Ω single-ended, intra-pair skew estimated at one fiftieth of a unit interval, 40 ps lane-to-lane skew (0.1 UI), 10 in maximum length, two vias and no stubs, and the note that the pairs must be loosely coupled; §2.4 symmetric stitching vias within 200 mil.',
      },
      {
        title: 'TI DS90UB936-Q1 data sheet SNLS571C (§10.1.3) and Efinix UG-PCB-MIPI v1.0',
        url: 'https://www.ti.com/lit/ds/symlink/ds90ub936-q1.pdf',
        note: '100 Ω ±10 % coupled routing, CSI-2 traces matched to within 5 mil, no routing over plane splits, at most two vias per trace, pair separation of five trace widths, bends of 135° or more, and stitching capacitors of 1 µF or less if a split must be crossed.',
      },
      {
        title: 'NXP AN13573 — i.MX 8/RT MIPI DSI/CSI-2 (Rev. 1.1, August 2024)',
        url: 'https://www.nxp.com/docs/en/application-note/AN13573.pdf',
        note: 'Table 2: low-power output 1.1–1.3 V, high-speed common mode 150–250 mV and differential swing 140–270 mV; the double-data-rate clocking that puts the clock lane at half the data rate; the receiver termination switched on only in high-speed mode.',
      },
      {
        title: 'MIPI Alliance — D-PHY specification page',
        url: 'https://www.mipi.org/specifications/d-phy',
        note: 'The specification itself is available to members only, so every value here comes from a chip-vendor guide restating it. Version 3.0 raised the rate to 9 Gb/s per lane; the 2.5 Gb/s used above is the rate of TI’s Jacinto 7 table (1.25 GHz).',
      },
    ],
  },
  {
    id: 'sata3',
    name: 'SATA 3.0 (6 Gb/s)',
    family: 'Camera & storage',
    summary: 'One transmit and one receive pair to a drive connector, AC-coupled at both ends.',
    rateGbps: 6,
    nyquistGHz: 3,
    encoding: '8b/10b NRZ; spread-spectrum clocking is optional, a 30–33 kHz down-spread when used',
    layout: {
      viaStubMm: { value: 15 * MIL, src: 1 },
      returnViaMm: { value: 200 * MIL, src: 1 },
      spaceMm: { value: 30 * MIL, src: 1 },
    },
    z: { kind: 'diff', target: 100, min: 85, max: 115, note: '85–115 Ω in TI’s SoC tables. At 6 Gb/s the specification sets the impedance through return loss; the cable is held to ±10 % and the mated connector to ±15 %.' },
    intraPairPs: 20,
    maxLenMm: 3500 * MIL,
    rules: [
      { key: 'z', label: 'Impedance', req: '100 Ω differential, 85–115 Ω.', src: 1 },
      { key: 'z', label: 'In the specification', req: 'At 6 Gb/s the impedance is specified through return loss; the 85–115 Ω and 40 Ω single-ended limits apply to Gen1.', normative: true, src: 0 },
      { key: 'skew', label: 'Intra-pair skew', req: '20 ps at the transmitter.', normative: true, src: 0 },
      { key: 'skew', label: 'Intra-pair routing', req: '5 mil on the board.', src: 1 },
      { key: 'skew', label: 'Pair-to-pair skew', req: 'None: transmit and receive lengths are independent.', src: 1 },
      { key: 'cap', label: 'AC coupling', req: 'Required at 6 Gb/s, at most 12 nF.', detail: 'The specification also advises (informatively) against bodies larger than 0603 and values under about 300 pF.', normative: true, src: 0 },
      { key: 'cap', label: 'Capacitor layout', req: '0402 or smaller, the plane voided under the pads, and both capacitors of a pair placed symmetrically.', src: 1 },
      { key: 'length', label: 'Trace length', req: 'TI budgets 3500 mil on its AM57xx SoCs and 5500 mil on KeyStone II.', src: 1 },
      { key: 'via', label: 'Vias and stubs', req: 'On its AM57xx and KeyStone II SoCs TI budgets no vias and no stubs on a SATA pair, and asks for the run on an outer layer next to ground. Any via stub over 15 mil must be back-drilled.', src: 1 },
      { key: 'space', label: 'Spacing', req: '30 mil to any other signal, 50 mil to a clock or periodic signal, 90 mil from a plane edge, and package escape completed within 0.25 in.', src: 1 },
      { key: 'other', label: 'Cable and connector', req: 'The cable must stay inside 100 Ω ±10 % with at most 10 ps of skew and 6 dB of loss to 4.5 GHz; the mated connector is allowed ±15 %.', normative: true, src: 0 },
      { key: 'other', label: 'Connector entry', req: 'For a through-hole receptacle, land the pair on the bottom layer so the pin is part of the line rather than a stub.', src: 1 },
    ],
    sources: [
      {
        title: 'Serial ATA Revision 3.1, Gold Revision (SATA-IO)',
        url: 'https://sata-io.org/system/files/specifications/SerialATA_Revision_3_1_Gold.pdf',
        note: 'Table 35 general specifications (6 Gb/s, unit interval, 100 Ω nominal, AC coupling at most 12 nF), §7.3.3 optional spread spectrum (30–33 kHz down-spread), Table 37 transmitter skew of 20 ps, Table 39 receiver impedance (Gen1 only: 85–115 Ω and 40 Ω single-ended), §7.2.2.4.6 return loss at 6 Gb/s, Table 20 cable and connector limits, §7.2.2.1.10 on capacitor size. SATA-IO publishes the Gold revisions free.',
      },
      TI_SPRAAR7J,
    ],
  },
];

export const interfaceById = (id: string) => INTERFACES.find((i) => i.id === id);
export const INTERFACE_FAMILIES = [...new Set(INTERFACES.map((i) => i.family))];
