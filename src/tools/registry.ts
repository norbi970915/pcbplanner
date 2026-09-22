import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export interface ToolDef {
  path: string;
  title: string;
  nav: string;
  group: string;
  summary: string;
  component: LazyExoticComponent<ComponentType>;
}

/** Colour swatch per group, like layer colours in the PCB editor. */
export const GROUP_COLORS: Record<string, string> = {
  'Signal integrity': '#3d8fe0',
  Stackup: '#c9a227',
  Thermal: '#e0645a',
  'Power & conductors': '#d08a3c',
  Electronics: '#6cc28c',
  'Power integrity': '#b07ad8',
  Components: '#4ab3b3',
  Utilities: '#8a8a8a',
};

export const TOOLS: ToolDef[] = [
  {
    path: '/impedance',
    title: 'Impedance Calculator',
    nav: 'Impedance',
    group: 'Signal integrity',
    summary: 'Single-ended and differential microstrip, coated and embedded microstrip, stripline and coplanar lines, solved with a 2D field solver.',
    component: lazy(() => import('./Impedance')),
  },
  {
    path: '/timing',
    title: 'Propagation Delay & Timing',
    nav: 'Delay & timing',
    group: 'Signal integrity',
    summary: 'Propagation delay, length matching from skew, rise time to bandwidth, critical length and wavelength.',
    component: lazy(() => import('./Timing')),
  },
  {
    path: '/crosstalk',
    title: 'Crosstalk Calculator',
    nav: 'Crosstalk',
    group: 'Signal integrity',
    summary: 'Near- and far-end crosstalk between parallel traces from the field solver, with a sweep over the spacing (3W rule check).',
    component: lazy(() => import('./Crosstalk')),
  },
  {
    path: '/stackup-advisor',
    title: 'Stackup Advisor',
    nav: 'Stackup advisor',
    group: 'Stackup',
    summary: 'Enter board thickness, layer count and impedance requirements; the field solver ranks every matching fab stackup and gives the trace widths.',
    component: lazy(() => import('./StackupAdvisor')),
  },
  {
    path: '/stackup',
    title: 'Layer Stack Manager',
    nav: 'Layer stack manager',
    group: 'Stackup',
    summary: '176 fab stackups from 2 to 12 layers, editable, with any signal layer sent to the impedance calculator.',
    component: lazy(() => import('./StackupTool')),
  },
  {
    path: '/junction-temperature',
    title: 'Junction Temperature',
    nav: 'Junction temperature',
    group: 'Thermal',
    summary: 'Junction temperature from power and the thermal-resistance chain (θJA or θJC + θCS + θSA), and the maximum power for a Tj limit.',
    component: lazy(() => import('./ThermalJunction')),
  },
  {
    path: '/thermal-vias',
    title: 'Thermal Via Array',
    nav: 'Thermal vias',
    group: 'Thermal',
    summary: 'Thermal resistance of a via array under a hot pad, with plugged or filled vias, and the temperature drop through the board.',
    component: lazy(() => import('./ThermalVias')),
  },
  {
    path: '/trace-width',
    title: 'Trace Width, Current & Temperature Rise',
    nav: 'Trace width / current',
    group: 'Power & conductors',
    summary: 'IPC-2221: width for a current, current for a width, or temperature rise of a trace, with resistance, voltage drop and loss.',
    component: lazy(() => import('./TraceWidth')),
  },
  {
    path: '/via',
    title: 'Via Calculator',
    nav: 'Via',
    group: 'Power & conductors',
    summary: 'Via current capacity, resistance, thermal resistance, capacitance, inductance and rise-time impact.',
    component: lazy(() => import('./Via')),
  },
  {
    path: '/skin-effect',
    title: 'Skin Effect & AC Resistance',
    nav: 'Skin effect',
    group: 'Power & conductors',
    summary: 'Skin depth in copper and the AC resistance of a trace across frequency.',
    component: lazy(() => import('./SkinEffect')),
  },
  {
    path: '/fusing',
    title: 'Fusing Current',
    nav: 'Fusing current',
    group: 'Power & conductors',
    summary: 'Current that melts a trace in a given time (Onderdonk), for fault and surge analysis.',
    component: lazy(() => import('./Fusing')),
  },
  {
    path: '/pdn',
    title: 'PDN Impedance Calculator',
    nav: 'PDN',
    group: 'Power integrity',
    summary: 'Target impedance, plane-pair capacitance, decoupling-capacitor resonance and the number of capacitors needed, with a log-log |Z|(f) plot.',
    component: lazy(() => import('./Pdn')),
  },
  {
    path: '/planar-inductor',
    title: 'Planar Spiral Inductor',
    nav: 'Spiral inductor',
    group: 'Components',
    summary: 'Inductance of square, hexagonal, octagonal and circular PCB spirals (modified Wheeler and current-sheet models), with DC resistance and Q.',
    component: lazy(() => import('./PlanarInductor')),
  },
  {
    path: '/padstack',
    title: 'Through-Hole Padstack Calculator',
    nav: 'Padstack',
    group: 'Components',
    summary: 'Plated through-hole sizing per IPC-7251 / IPC-2221 / IPC-2222: hole, outer and inner pads, antipad, thermal relief and annular ring for levels A/B/C.',
    component: lazy(() => import('./Padstack')),
  },
  {
    path: '/ohms-law',
    title: "Ohm's Law & Power",
    nav: "Ohm's law",
    group: 'Electronics',
    summary: 'Enter any two of voltage, current, resistance and power to get the other two.',
    component: lazy(() => import('./OhmsLaw')),
  },
  {
    path: '/reactance',
    title: 'Reactance & LC Resonance',
    nav: 'Reactance & resonance',
    group: 'Electronics',
    summary: 'XL and XC at a frequency, LC resonance, the L or C for a target frequency, and series/parallel LC impedance with Q.',
    component: lazy(() => import('./Reactance')),
  },
  {
    path: '/crystal',
    title: 'Crystal Load Capacitors & PPM',
    nav: 'Crystal & ppm',
    group: 'Electronics',
    summary: 'Crystal load capacitors with the nearest E12/E24 values and resulting CL, plus frequency error ↔ ppm and clock drift.',
    component: lazy(() => import('./Crystal')),
  },
  {
    path: '/resistors',
    title: 'Resistor Tools',
    nav: 'Resistor tools',
    group: 'Electronics',
    summary: 'Voltage divider with best E12/E24/E96 pairs, LED series resistor with power rating, and series/parallel R, C and L.',
    component: lazy(() => import('./Resistors')),
  },
  {
    path: '/attenuator',
    title: 'Attenuator Pads',
    nav: 'Attenuator pads',
    group: 'Electronics',
    summary: 'Matched Pi, T and bridged-T pads with the nearest standard values, their actual loss and return loss, and resistor power.',
    component: lazy(() => import('./Attenuator')),
  },
  {
    path: '/units',
    title: 'Unit Converter',
    nav: 'Unit converter',
    group: 'Utilities',
    summary: 'Length, copper weight, temperature, power (dBm/W/V) and frequency/wavelength.',
    component: lazy(() => import('./Units')),
  },
];

export const GROUPS = [...new Set(TOOLS.map((t) => t.group))];
export const toolByPath = (p: string) => TOOLS.find((t) => t.path === p);
