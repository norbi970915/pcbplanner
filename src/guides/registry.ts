import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export interface GuideDef {
  path: string;
  title: string;
  description: string; // meta description and card text
  date: string; // ISO date of publication
  minutes: number; // reading time
  component: LazyExoticComponent<ComponentType>;
}

export const GUIDES: GuideDef[] = [
  {
    path: '/guides/controlled-impedance',
    title: 'Controlled Impedance Explained: Microstrip, Stripline and Solder Mask',
    description:
      'What PCB trace impedance is, when a trace needs it, how microstrip and stripline differ, and why solder mask, etching and closed-form formulas shift the result by several ohms. With field-solver numbers.',
    date: '2026-09-22',
    minutes: 8,
    component: lazy(() => import('./ControlledImpedance')),
  },
  {
    path: '/guides/choosing-a-pcb-stackup',
    title: 'How to Choose a PCB Stackup (and What 1080, 2116 and 7628 Mean)',
    description:
      'A practical guide to 4- and 6-layer PCB stackups: layer order, reference planes, and how the prepreg glass style under the outer layer sets your trace widths, from 0.12 mm to over 1 mm for 50 Ω.',
    date: '2026-09-22',
    minutes: 9,
    component: lazy(() => import('./ChoosingStackup')),
  },
  {
    path: '/guides/pcie-gen3-routing',
    title: 'PCIe Gen3 Routing on a Hobby Budget: Lessons from an M.2 NVMe Carrier Card',
    description:
      'Impedance, AC coupling, skew, loss budget, vias and the reference clock for PCIe Gen3 on a standard FR-4 six-layer board, with numbers for trace width and loss per inch at 4 GHz.',
    date: '2026-09-22',
    minutes: 10,
    component: lazy(() => import('./PcieRouting')),
  },
  {
    path: '/guides/copper-area-for-cooling',
    title: 'How Much Copper Does a Regulator Need? PCB Heat Spreading in Numbers',
    description:
      'Why a hot SOT-223 or DPAK needs copper around it, how the thermal resistance falls with pour size and copper weight, why the returns diminish, and what datasheet θJA really means.',
    date: '2026-09-22',
    minutes: 7,
    component: lazy(() => import('./CopperCooling')),
  },
  {
    path: '/guides/creepage-clearance-mains',
    title: 'Creepage and Clearance for Mains Circuits (IEC 60664-1)',
    description:
      'How to find the minimum PCB spacing for 230 V and 120 V mains: rated impulse voltage, clearance, creepage, pollution degree, material group, reinforced insulation and slots, with worked examples.',
    date: '2026-09-22',
    minutes: 8,
    component: lazy(() => import('./CreepageMains')),
  },
];

export const guideByPath = (p: string) => GUIDES.find((g) => g.path === p);
