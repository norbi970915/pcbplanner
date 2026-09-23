import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export interface GuideDef {
  path: string;
  title: string; // headline on the page
  seoTitle: string; // shorter title for search results (under ~50 characters before the site name)
  description: string; // meta description and card text
  tools: string[]; // tools used in the guide; those tool pages link back to it
  date: string; // ISO date of publication
  minutes: number; // reading time
  component: LazyExoticComponent<ComponentType>;
}

export const GUIDES: GuideDef[] = [
  {
    path: '/guides/controlled-impedance',
    title: 'Controlled Impedance Explained: Microstrip, Stripline and Solder Mask',
    seoTitle: 'Controlled Impedance: Microstrip vs Stripline',
    tools: ['/impedance', '/timing', '/crosstalk', '/trace-loss', '/interface-rules'],
    description:
      'What PCB trace impedance is, when a trace needs it, how microstrip and stripline differ, and why solder mask, etching and closed-form formulas shift the result by several ohms. With field-solver numbers.',
    date: '2026-09-22',
    minutes: 8,
    component: lazy(() => import('./ControlledImpedance')),
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
    component: lazy(() => import('./ChoosingStackup')),
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
    component: lazy(() => import('./PcieRouting')),
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
    component: lazy(() => import('./AcCouplingCaps')),
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
    component: lazy(() => import('./Usb3Impedance')),
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
    component: lazy(() => import('./CopperCooling')),
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
    component: lazy(() => import('./CreepageMains')),
  },
];

export const guideByPath = (p: string) => GUIDES.find((g) => g.path === p);
/** Guides that use a given tool (listed as related guides on the tool page). */
export const guidesForTool = (toolPath: string) => GUIDES.filter((g) => g.tools.includes(toolPath));
