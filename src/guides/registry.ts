import { lazyPage, type LazyPage } from '../lib/lazyPage';

export const GUIDE_CATEGORIES = ['RF & Measurement', 'Signal Integrity & Interfaces', 'PCB Layout & Safety', 'Power & Thermal'] as const;
export type GuideCategory = typeof GUIDE_CATEGORIES[number];

export interface GuideDef {
  path: string;
  title: string; // headline on the page
  seoTitle: string; // shorter title for search results (under ~50 characters before the site name)
  description: string; // meta description and card text
  tools: string[]; // tools used in the guide; those tool pages link back to it
  date: string; // ISO date of publication
  minutes: number; // reading time
  category: GuideCategory;
  component: LazyPage;
}

// newest first: the home page shows the three latest by date, and guides published on the same date keep this order
export const GUIDES: GuideDef[] = [
  {
    path: '/guides/vswr-return-loss-explained',
    title: 'VSWR, Return Loss and Reflected Power: What the Numbers Mean',
    seoTitle: 'VSWR to Return Loss and Reflected Power',
    tools: ['/vswr-calculator', '/s-parameter-viewer', '/attenuator'],
    description: 'Convert 1.5:1 VSWR into reflection coefficient, return loss, reflected power and mismatch loss, and learn why those dB figures describe different things.',
    date: '2026-10-01',
    minutes: 5,
    category: 'RF & Measurement',
    component: lazyPage(() => import('./VswrReturnLoss')),
  },
  {
    path: '/guides/coax-impedance-formula',
    title: 'Coaxial Cable Impedance: Diameter Ratio, Dielectric and Delay',
    seoTitle: 'Coax Impedance Formula and Worked Example',
    tools: ['/coax-impedance', '/quarter-wave-transformer'],
    description: 'Derive coax impedance from conductor diameters and dielectric constant, with a 50 Ω worked example, velocity factor, delay and practical cable limits.',
    date: '2026-10-01',
    minutes: 5,
    category: 'RF & Measurement',
    component: lazyPage(() => import('./CoaxImpedanceFormula')),
  },
  {
    path: '/guides/l-network-impedance-matching',
    title: 'L-Network Impedance Matching with a Smith Chart',
    seoTitle: 'L-Network Matching: Worked RF Example',
    tools: ['/impedance-matching', '/vswr-calculator', '/quarter-wave-transformer'],
    description: 'Two ways to match a complex RF load with a series and a shunt part, using Pozar’s 200 − j100 Ω example, a Smith chart and a bandwidth check.',
    date: '2026-10-01',
    minutes: 6,
    category: 'RF & Measurement',
    component: lazyPage(() => import('./LNetworkMatching')),
  },
  {
    path: '/guides/quarter-wave-impedance-transformer',
    title: 'Quarter-Wave Impedance Transformer: Matching 50 Ω to 100 Ω',
    seoTitle: 'Quarter-Wave Transformer: 50 to 100 Ohms',
    tools: ['/quarter-wave-transformer', '/impedance-matching', '/impedance'],
    description: 'Why a 70.71 Ω quarter-wave section matches 100 Ω to 50 Ω, how to calculate its physical length, and when multisection or lumped matching is better.',
    date: '2026-10-01',
    minutes: 5,
    category: 'RF & Measurement',
    component: lazyPage(() => import('./QuarterWaveMatching')),
  },
  {
    path: '/guides/s-parameters-s11-s21',
    title: 'S11 and S21 Explained: Reading Touchstone S-Parameter Files',
    seoTitle: 'S11 and S21: Return and Insertion Loss',
    tools: ['/s-parameter-viewer', '/interface-rules', '/trace-loss'],
    description: 'Read S11, S21, S12 and S22 from an .s2p file, understand the sign of return and insertion loss, and avoid port-order and reference-plane mistakes.',
    date: '2026-10-01',
    minutes: 6,
    category: 'RF & Measurement',
    component: lazyPage(() => import('./SParametersExplained')),
  },
  {
    path: '/guides/phase-noise-to-jitter',
    title: 'Phase Noise to RMS Jitter: Why the Integration Band Matters',
    seoTitle: 'Phase Noise to Jitter: Worked Example',
    tools: ['/clock-jitter', '/crystal', '/adc-input'],
    description: 'Integrate phase noise into RMS time jitter with an illustrative 100 MHz oscillator, then choose the offset band and apply the result to ADC SNR.',
    date: '2026-10-01',
    minutes: 5,
    category: 'Signal Integrity & Interfaces',
    component: lazyPage(() => import('./PhaseNoiseJitter')),
  },
  {
    path: '/guides/pcie-routing-guidelines',
    title: 'PCIe PCB Routing Guidelines: Impedance, Return Paths, Vias, Loss and Skew',
    seoTitle: 'PCIe Routing Guidelines for Gen3, Gen4 & Gen5',
    tools: ['/interface-rules', '/impedance', '/trace-loss', '/differential-via', '/timing', '/crosstalk'],
    description:
      'A practical PCIe Gen3–5 PCB routing checklist: choose differential impedance, preserve return paths, budget channel loss, control via stubs, place AC-coupling capacitors and check skew.',
    date: '2026-10-01',
    minutes: 8,
    category: 'Signal Integrity & Interfaces',
    component: lazyPage(() => import('./PcieGuidelines')),
  },
  {
    path: '/guides/buck-converter-formulas',
    title: 'Buck Converter Formulas: Duty Cycle, Inductor and Capacitors, Worked Through',
    seoTitle: 'Buck Converter Formulas with a Worked Example',
    tools: ['/buck-converter', '/feedback-divider', '/power-tree'],
    description:
      'The duty cycle, inductor, ripple current, peak current and capacitor equations for a buck converter, worked through for 12 V to 3.3 V at 2 A, with the worst-case input for each part.',
    date: '2026-09-26',
    minutes: 7,
    category: 'Power & Thermal',
    component: lazyPage(() => import('./BuckFormulas')),
  },
  {
    path: '/guides/boost-converter-formulas',
    title: 'Boost Converter Formulas: Why the Inductor Carries More Current than the Load',
    seoTitle: 'Boost Converter Formulas with a Worked Example',
    tools: ['/boost-converter', '/feedback-divider', '/power-tree'],
    description:
      'Duty cycle, inductor current, peak switch current, maximum load and output capacitor equations for a boost converter, worked through for a Li-ion cell to 5 V at 1 A.',
    date: '2026-09-26',
    minutes: 7,
    category: 'Power & Thermal',
    component: lazyPage(() => import('./BoostFormulas')),
  },
  {
    path: '/guides/via-fence-spacing',
    title: 'Via Fence and Stitching Via Spacing: From λ/20 to Millimetres',
    seoTitle: 'Via Fence Spacing: λ/10, λ/20 and Via Pitch',
    tools: ['/via-stitching', '/impedance', '/timing'],
    description:
      'How far apart to place via fence and stitching vias: the wavelength in the laminate, the λ/10 and λ/20 rules, via-grid cell resonance and leakage between vias, with a 5 GHz example.',
    date: '2026-09-26',
    minutes: 6,
    category: 'Signal Integrity & Interfaces',
    component: lazyPage(() => import('./ViaFence')),
  },
  {
    path: '/guides/pcb-crosstalk-3w-rule',
    title: 'PCB Crosstalk and the 3W Rule: How Much Spacing Is Enough?',
    seoTitle: 'PCB Crosstalk: 3W Rule and Trace Spacing',
    tools: ['/crosstalk', '/impedance', '/timing', '/interface-rules'],
    description:
      'What 3W means in edge-to-edge clearance, how the reference-plane distance changes crosstalk, and why coupled length and rise time matter. With reproducible field-solver examples.',
    date: '2026-09-23',
    minutes: 7,
    category: 'Signal Integrity & Interfaces',
    component: lazyPage(() => import('./CrosstalkSpacing')),
  },
  {
    path: '/guides/pcb-via-current-capacity',
    title: 'How Much Current Can a PCB Via Carry? Worked Examples for Power Rails',
    seoTitle: 'PCB Via Current Capacity: Size and Via Count',
    tools: ['/via', '/trace-width'],
    description:
      'Resistance and current estimates for a 0.3 mm PCB via, the effect of barrel plating, and parallel-via counts for a 5 A rail. Assumptions, voltage drop and thermal limits explained.',
    date: '2026-09-23',
    minutes: 7,
    category: 'PCB Layout & Safety',
    component: lazyPage(() => import('./ViaCurrent')),
  },
  {
    path: '/guides/decoupling-capacitor-values',
    title: '100 nF or 10 µF? Choosing Decoupling Capacitors for a PCB',
    seoTitle: 'Decoupling Capacitors: 100 nF or 10 µF?',
    tools: ['/pdn'],
    description:
      'Compare 100 nF and 10 µF decoupling capacitors using mounted impedance, series resonance and antiresonance. Worked examples, DC bias, placement and a PDN target-impedance budget.',
    date: '2026-09-23',
    minutes: 8,
    category: 'Power & Thermal',
    component: lazyPage(() => import('./DecouplingCapacitors')),
  },
  {
    path: '/guides/controlled-impedance',
    title: 'Controlled Impedance Explained: Microstrip, Stripline and Solder Mask',
    seoTitle: 'Controlled Impedance: Microstrip vs Stripline',
    tools: ['/impedance', '/timing', '/crosstalk', '/trace-loss', '/interface-rules'],
    description:
      'What PCB trace impedance is, when a trace needs it, how microstrip and stripline differ, and why solder mask, etching and closed-form formulas shift the result by several ohms. With field-solver numbers.',
    date: '2026-09-22',
    minutes: 8,
    category: 'Signal Integrity & Interfaces',
    component: lazyPage(() => import('./ControlledImpedance')),
  },
  {
    path: '/guides/choosing-a-pcb-stackup',
    title: 'How to Choose a PCB Stackup (and What 1080, 2116 and 7628 Mean)',
    seoTitle: 'How to Choose a PCB Stackup (1080, 2116, 7628)',
    tools: ['/stackup-advisor', '/stackup', '/impedance', '/pcb-materials'],
    description:
      'A practical guide to 4- and 6-layer PCB stackups: layer order, reference planes, and how the prepreg glass style under the outer layer sets your trace widths, from 0.12 mm to over 1 mm for 50 Ω.',
    date: '2026-09-22',
    minutes: 9,
    category: 'PCB Layout & Safety',
    component: lazyPage(() => import('./ChoosingStackup')),
  },
  {
    path: '/guides/pcie-gen3-routing',
    title: 'PCIe Gen3 Routing on a Hobby Budget: Lessons from an M.2 NVMe Carrier Card',
    seoTitle: 'PCIe Gen3 Routing Guide for M.2 Carrier Cards',
    tools: ['/impedance', '/trace-loss', '/timing', '/differential-via', '/stackup', '/interface-rules'],
    description:
      'Impedance, AC coupling, skew, loss budget, vias and the reference clock for PCIe Gen3 on a standard FR-4 six-layer board, with numbers for trace width and loss per inch at 4 GHz.',
    date: '2026-09-22',
    minutes: 10,
    category: 'Signal Integrity & Interfaces',
    component: lazyPage(() => import('./PcieRouting')),
  },
  {
    path: '/guides/ac-coupling-capacitors',
    title: 'AC Coupling Capacitors on High-Speed Links: the Value for Every Interface',
    seoTitle: 'AC Coupling Capacitor Values by Interface',
    tools: ['/interface-rules', '/impedance', '/trace-loss'],
    description:
      'Which high-speed links need a series AC coupling capacitor and which forbid one, the value each specification allows — PCIe, USB 3.2, SATA, SGMII, DisplayPort, HDMI, Ethernet — and why the package size matters more than the capacitance.',
    date: '2026-09-23',
    minutes: 7,
    category: 'Signal Integrity & Interfaces',
    component: lazyPage(() => import('./AcCouplingCaps')),
  },
  {
    path: '/guides/usb3-85-or-90-ohm',
    title: 'Is USB 3 85 Ω or 90 Ω? What the Specifications Actually Say',
    seoTitle: 'USB 3 Impedance: 85 Ω or 90 Ω?',
    tools: ['/interface-rules', '/impedance', '/stackup-advisor'],
    description:
      'USB 3.2 traces are designed to 90 Ω differential; 85 Ω is the mated Type-C connector target and the S-parameter reference. What each document says, and why the difference costs less return loss than your fabricator’s tolerance.',
    date: '2026-09-23',
    minutes: 6,
    category: 'Signal Integrity & Interfaces',
    component: lazyPage(() => import('./Usb3Impedance')),
  },
  {
    path: '/guides/copper-area-for-cooling',
    title: 'How Much Copper Does a Regulator Need? PCB Heat Spreading in Numbers',
    seoTitle: 'How Much Copper Does a Regulator Need?',
    tools: ['/copper-heat-spreading', '/ldo', '/thermal-vias', '/junction-temperature'],
    description:
      'Why a hot SOT-223 or DPAK needs copper around it, how the thermal resistance falls with pour size and copper weight, why the returns diminish, and what datasheet θJA really means.',
    date: '2026-09-22',
    minutes: 7,
    category: 'Power & Thermal',
    component: lazyPage(() => import('./CopperCooling')),
  },
  {
    path: '/guides/creepage-clearance-mains',
    title: 'Creepage and Clearance for Mains Circuits (IEC 60664-1)',
    seoTitle: 'Creepage and Clearance for Mains (IEC 60664-1)',
    tools: ['/creepage-clearance', '/conductor-spacing'],
    description:
      'How to find the minimum PCB spacing for 230 V and 120 V mains: rated impulse voltage, clearance, creepage, pollution degree, material group, reinforced insulation and slots, with worked examples.',
    date: '2026-09-22',
    minutes: 8,
    category: 'PCB Layout & Safety',
    component: lazyPage(() => import('./CreepageMains')),
  },
];

export const guideByPath = (p: string) => GUIDES.find((g) => g.path === p);
/** Guides that use a given tool (listed as related guides on the tool page). */
export const guidesForTool = (toolPath: string) => GUIDES.filter((g) => g.tools.includes(toolPath));
