import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export interface ToolDef {
  path: string;
  title: string;
  nav: string;
  group: string;
  summary: string;
  component: LazyExoticComponent<ComponentType>;
}

export const TOOLS: ToolDef[] = [
  {
    path: '/impedance',
    title: 'Impedance Calculator (Field Solver)',
    nav: 'Impedance',
    group: 'Signal integrity',
    summary: 'Single-ended and differential microstrip, coated and embedded microstrip, stripline and coplanar lines, solved with a 2D field solver.',
    component: lazy(() => import('./Impedance')),
  },
  {
    path: '/stackup',
    title: 'Stackup Editor',
    nav: 'Stackup',
    group: 'Signal integrity',
    summary: 'Define layer stackups once and send any layer to the impedance calculator.',
    component: lazy(() => import('./StackupTool')),
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
    path: '/trace-width',
    title: 'Trace Width & Current (IPC-2221)',
    nav: 'Trace width / current',
    group: 'Power & conductors',
    summary: 'Required width for a current, or the current a given width can carry, with resistance, voltage drop and loss.',
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
    title: 'Fusing Current (Onderdonk)',
    nav: 'Fusing current',
    group: 'Power & conductors',
    summary: 'Current that melts a trace in a given time, for fault and surge analysis.',
    component: lazy(() => import('./Fusing')),
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
