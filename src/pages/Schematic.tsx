import { Link } from 'react-router-dom';
import { useDocumentMeta } from '../components/ToolPage';

export const SCHEMATIC_DESCRIPTION = 'Plan PCB schematic power rails and loads, then check logic-level compatibility, ADC input settling, pull-ups, filters and component values.';

const SECTIONS = [
  {
    title: 'Power rails and loads',
    description: 'Start with the complete supply tree, then size and check individual stages.',
    tools: [
      { path: '/power-tree', name: 'Power tree planner', detail: 'Cascaded rails, source current, peak demand and losses' },
      { path: '/buck-converter', name: 'Buck converter', detail: 'Inductor, capacitors, current limits and operating range' },
      { path: '/boost-converter', name: 'Boost converter', detail: 'Power stage, ratings and operating limits' },
      { path: '/ldo', name: 'LDO dissipation', detail: 'Dropout headroom and thermal loss' },
      { path: '/feedback-divider', name: 'Feedback divider', detail: 'Output voltage and resistor choice' },
    ],
  },
  {
    title: 'Signals and interfaces',
    description: 'Check the small circuits around IC pins before choosing footprints.',
    tools: [
      { path: '/i2c-pullup', name: 'I²C pull-up', detail: 'Rise time, bus capacitance and resistor range' },
      { path: '/logic-levels', name: 'Logic-level compatibility', detail: 'Worst-case HIGH/LOW margins and receiver voltage limits' },
      { path: '/termination', name: 'Signal termination', detail: 'Source and load termination with preferred resistor values' },
      { path: '/crystal', name: 'Crystal load capacitors', detail: 'Load capacitance and frequency offset' },
      { path: '/rc-filter', name: 'RC filters', detail: 'Cutoff, impedance and transient response' },
    ],
  },
  {
    title: 'Components and measurement',
    description: 'Choose values and check power or sensing trade-offs.',
    tools: [
      { path: '/current-sense-shunt', name: 'Current-sense shunt', detail: 'Burden voltage, power and first-order error' },
      { path: '/adc-input', name: 'ADC input settling', detail: 'Source impedance, RC filter and sample-capacitor acquisition' },
      { path: '/resistors', name: 'Resistor tools', detail: 'Dividers, parallel combinations and preferred values' },
      { path: '/reactance', name: 'Reactance and resonance', detail: 'Capacitor, inductor and LC behaviour' },
      { path: '/pdn', name: 'PDN impedance', detail: 'Target impedance and decoupling resonance' },
    ],
  },
];

export default function Schematic() {
  useDocumentMeta('Schematic Design Tools', SCHEMATIC_DESCRIPTION);
  return <div className="p-3">
    <section className="border border-line bg-sheet">
      <div className="flex h-[24px] items-center bg-panel-head px-2 font-semibold">Schematic design</div>
      <div className="px-4 py-3">
        <h1 className="text-[18px] font-semibold">Schematic Design Tools</h1>
        <p className="mt-1 max-w-[95ch] text-muted">Work through power, interfaces and component values before layout. Each calculator opens in the same workspace and has a shareable result URL.</p>
        <Link to="/power-tree" className="btn btn-primary mt-3 no-underline">Start with a power tree →</Link>
      </div>
    </section>
    <div className="mt-3 grid gap-3 xl:grid-cols-2">
      {SECTIONS.map(section => <section key={section.title} className="border border-line bg-sheet">
        <h2 className="flex h-[24px] items-center bg-panel-head px-2 font-semibold">{section.title}</h2>
        <p className="px-3 py-2 text-muted">{section.description}</p>
        <ul>{section.tools.map(tool => <li key={tool.path} className="border-t border-line">
          <Link to={tool.path} className="block px-3 py-2 no-underline hover:bg-hover">
            <span className="font-semibold text-accent-ink">{tool.name}</span>
            <span className="mt-0.5 block text-muted">{tool.detail}</span>
          </Link>
        </li>)}</ul>
      </section>)}
    </div>
  </div>;
}
