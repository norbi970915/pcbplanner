/** Curated starting points, not engineering decisions or calculator presets. */
export interface GuidedTask {
  id: string;
  label: string;
  tool: string;
  to?: string;
  why: string;
  prepare: string[];
  guide?: string;
}
export interface GuidedCategory {
  id: string;
  title: string;
  description: string;
  group: string;
  tasks: GuidedTask[];
}
export const GUIDED_CATEGORIES: GuidedCategory[] = [
  { id: 'layout', title: 'PCB layout & stackup', description: 'Trace sizes, vias, layer stacks and clearance.', group: 'Stackup', tasks: [
    { id: 'trace', label: 'Size a trace for current', tool: '/trace-width', why: 'Start here to estimate trace width, temperature rise, voltage drop and loss.', prepare: ['Required current and acceptable temperature rise.', 'Copper thickness, trace length and internal or external layer.'], guide: '/guides/pcb-trace-width-current-calculation' },
    { id: 'via', label: 'Check via current and resistance', tool: '/via', why: 'Check the electrical and thermal estimates for a plated via before choosing its geometry.', prepare: ['Finished hole diameter, plating thickness and board thickness.', 'Current through each via.'], guide: '/guides/pcb-via-current-capacity' },
    { id: 'stackup', label: 'Choose a board stackup', tool: '/stackup-advisor', why: 'Find candidate stackups from layer count, board thickness and impedance requirements. Use Layer Stack Manager to edit a chosen stack.', prepare: ['Layer count and target board thickness.', 'Board type and any controlled-impedance requirements.'], guide: '/guides/choosing-a-pcb-stackup' },
    { id: 'clearance', label: 'Check clearance and creepage', tool: '/creepage-clearance', why: 'Explore insulation spacing estimates for mains-related designs. Confirm the requirements in the applicable end-product safety standard.', prepare: ['Working voltage, insulation type and overvoltage category.', 'Pollution degree, material group and operating altitude.'], guide: '/guides/creepage-clearance-mains' },
  ] },
  { id: 'communication', title: 'Communication interfaces', description: 'I²C, SPI, CAN, RS-485 and high-speed interfaces.', group: 'Communication interfaces', tasks: [
    { id: 'i2c', label: 'Choose I²C pull-up resistors', tool: '/i2c-pullup', why: 'Estimate the pull-up resistor range from rise-time and low-level current constraints.', prepare: ['Supply voltage, bus capacitance and bus speed.', 'Device low-level voltage and sink-current limits.'], guide: '/guides/i2c-pullup-resistor-calculation' },
    { id: 'spi', label: 'Check an SPI timing budget', tool: '/spi-timing', why: 'Check the opposite-edge read setup margin using the outbound clock path and returning data path.', prepare: ['SCLK frequency and outbound / return propagation delays.', 'Slave clock-to-output delay and receiver setup time.'] },
    { id: 'can', label: 'Find CAN or CAN FD bit timing', tool: '/can-bit-timing', why: 'Search bit timing counts for a target bit rate and sample point, using Bosch M_CAN timing limits.', prepare: ['CAN peripheral clock, target bit rate and sample point.', 'Nominal or data phase; verify limits against your controller.'] },
    { id: 'rs485', label: 'Plan RS-485 biasing or Modbus timing', tool: '/rs485-modbus', why: 'Check a conservative RS-485 bias-resistor bound, stub guidance and Modbus RTU frame timing.', prepare: ['Minimum supply voltage, termination and bias resistor tolerance.', 'For Modbus: baud rate, frame lengths and device processing time.'] },
    { id: 'highspeed', label: 'Look up USB, PCIe or Ethernet requirements', tool: '/interface-rules', why: 'Choose the exact interface and generation to see its impedance, timing and layout references.', prepare: ['Exact interface and generation.', 'Relevant device datasheets and board stackup.'] },
  ] },
  { id: 'signals', title: 'Signal integrity', description: 'Impedance, spacing, delay, loss and via transitions.', group: 'Signal integrity', tasks: [
    { id: 'impedance', label: 'Calculate trace or differential impedance', tool: '/impedance', why: 'Solve impedance from your cross-section, or find width and spacing for a target impedance.', prepare: ['Line geometry, dielectric heights and copper thickness.', 'Material Dk and the target impedance.'], guide: '/guides/controlled-impedance' },
    { id: 'crosstalk', label: 'Explore trace spacing and crosstalk', tool: '/crosstalk', why: 'Explore how geometry, parallel length and rise time affect the crosstalk estimate.', prepare: ['Trace width, copper gap and reference-plane distance.', 'Parallel run length and signal rise time.'], guide: '/guides/pcb-crosstalk-3w-rule' },
    { id: 'timing', label: 'Check propagation delay or length matching', tool: '/timing', why: 'Convert trace length to delay and a skew budget to a length-matching estimate.', prepare: ['Trace geometry and dielectric properties.', 'Trace length, rise time or allowed skew.'] },
    { id: 'loss', label: 'Estimate transmission-line loss', tool: '/trace-loss', why: 'Explore conductor and dielectric loss for your PCB trace and frequency range.', prepare: ['Trace geometry and length.', 'Frequency, material Dk / Df and copper properties.'], guide: '/guides/controlled-impedance' },
    { id: 'transition', label: 'Check a differential via transition', tool: '/differential-via', why: 'Explore a differential via geometry and its stub-related limits.', prepare: ['Via, pad, antipad and pair geometry.', 'Board thickness, stub length and signal bandwidth.'], guide: '/guides/via-stub-back-drilling' },
  ] },
  { id: 'power', title: 'Power & cooling', description: 'Power rails, regulators, decoupling and temperature.', group: 'Thermal', tasks: [
    { id: 'board-drop', label: 'Check voltage drop on a KiCad board', tool: '/kicad-project', to: '/kicad-project?view=power&pmode=dc', why: 'Solve the supply and return copper of a routed board, including tracks, zones and vias, and inspect the voltage-drop map.', prepare: ['A .kicad_pcb saved with filled zones; optionally its .kicad_pro.', 'Source part, consuming parts and their actual load currents.'], guide: '/guides/kicad-voltage-drop-thermal' },
    { id: 'board-thermal', label: 'Map the temperature of a KiCad board', tool: '/kicad-project', to: '/kicad-project?view=thermal', why: 'Estimate board temperature from the placed parts and copper, then inspect heat sources and hot spots.', prepare: ['A .kicad_pcb saved with filled zones.', 'Part dissipation, ambient conditions and optional datasheet ψJB.'], guide: '/guides/kicad-voltage-drop-thermal' },
    { id: 'rails', label: 'Plan the board power rails', tool: '/power-tree', why: 'Build a power tree and budget source currents, regulator losses and ratings across your rails.', prepare: ['Input sources and regulator connections.', 'Load currents, rail voltages, efficiencies and ratings.'] },
    { id: 'buck', label: 'Size a buck converter power stage', tool: '/buck-converter', why: 'Estimate the inductor and capacitors, then check ratings and IC timing limits across the input range.', prepare: ['Input range, output voltage and load current.', 'Switching frequency, ripple targets and IC limits.'], guide: '/guides/buck-converter-formulas' },
    { id: 'boost', label: 'Size a boost converter power stage', tool: '/boost-converter', why: 'Check boost-stage currents and component requirements across the input range.', prepare: ['Input range, output voltage and load current.', 'Switching frequency, ripple targets and IC limits.'], guide: '/guides/boost-converter-formulas' },
    { id: 'ldo', label: 'Check an LDO regulator', tool: '/ldo', why: 'Estimate dropout margin, power dissipation and efficiency before checking the thermal design.', prepare: ['Input and output voltage ranges, load and ground current.', 'Dropout and thermal data from the regulator datasheet.'], guide: '/guides/ldo-efficiency-power-dissipation' },
    { id: 'decoupling', label: 'Explore decoupling and PDN impedance', tool: '/pdn', why: 'Start with a target impedance, then explore capacitor resonance and the modelled PDN response.', prepare: ['Rail voltage, allowed ripple and transient current.', 'Capacitance, ESR and ESL estimates.'], guide: '/guides/decoupling-capacitor-values' },
    { id: 'temperature', label: 'Estimate component junction temperature', tool: '/junction-temperature', why: 'Estimate junction temperature using the thermal-resistance model appropriate to your available data.', prepare: ['Power dissipation and ambient or case temperature.', 'Relevant thermal resistances and junction-temperature limit.'], guide: '/guides/copper-area-for-cooling' },
    { id: 'thermal-vias', label: 'Explore a thermal via array', tool: '/thermal-vias', why: 'Estimate the thermal path through a via array, including barrel geometry and optional filling.', prepare: ['Via count, finished hole diameter and plating thickness.', 'Board thickness, pad area and fill material.'], guide: '/guides/thermal-via-array-design' },
  ] },
  { id: 'circuits', title: 'Circuits & components', description: 'Dividers, filters, amplifiers, footprints and markings.', group: 'Electronics', tasks: [
    { id: 'feedback', label: 'Choose regulator feedback resistors', tool: '/feedback-divider', why: 'Choose standard resistor pairs and examine tolerance and feedback bias-current error.', prepare: ['Target output and reference voltages.', 'Resistor series / tolerance and feedback bias current.'], guide: '/guides/feedback-divider-resistor-selection' },
    { id: 'resistors', label: 'Calculate a voltage divider or LED resistor', tool: '/resistors', why: 'Use the divider, LED resistor or series / parallel component calculators in Resistor Tools.', prepare: ['Voltages and desired divider ratio or LED current.', 'Preferred component values and relevant ratings.'] },
    { id: 'rc', label: 'Design a passive RC filter', tool: '/rc-filter', why: 'Explore low-pass or high-pass response, standard values and source / load effects.', prepare: ['Target cutoff frequency and low-pass or high-pass topology.', 'Source and load resistance, and a starting R or C.'], guide: '/guides/rc-filter-design' },
    { id: 'amplifier', label: 'Set an op-amp gain', tool: '/op-amp-gain', why: 'Choose a topology and examine gain, standard resistor pairs and practical amplifier limits.', prepare: ['Required gain, signal range and supply rails.', 'Op-amp bandwidth, slew rate and offset data.'] },
    { id: 'footprint', label: 'Size a resistor or capacitor footprint', tool: '/smd-land-pattern', why: 'Estimate a two-terminal chip footprint from the exact component dimensions and process tolerances.', prepare: ['Part body and terminal dimensions from its drawing.', 'Manufacturing tolerances and soldering process.'] },
    { id: 'marking', label: 'Decode an SMD resistor marking', tool: '/smd-resistor-code', why: 'Read three-digit, four-digit and EIA-96 resistor markings, or find a marking from the value.', prepare: ['The printed marking or the resistance value.'] },
  ] },
  { id: 'files', title: 'Inspect design files', description: 'Gerber layouts, revision differences and S-parameters.', group: 'Utilities', tasks: [
    { id: 'kicad', label: 'Check a KiCad project', tool: '/kicad-project', why: 'Inspect a board and its stackup, routing, voltage drop, thermal behaviour and same-layer clearance without uploading the files.', prepare: ['A .kicad_pcb and optionally the .kicad_pro, or use the demonstration project.'] },
    { id: 'gerber', label: 'Inspect Gerbers or compare board revisions', tool: '/gerber-viewer', why: 'Load one layout to inspect it, or two layouts to overlay selected layers and highlight their differences. You can also analyse copper distribution.', prepare: ['Gerber layer files or ZIP archives.', 'For copper distribution: a closed board outline. Files stay on your device.'] },
    { id: 'touchstone', label: 'Inspect Touchstone S-parameter files', tool: '/s-parameter-viewer', why: 'View S-parameter plots and inspect transmission, reflection and supported differential measurements.', prepare: ['A Touchstone file from measurement or simulation.', 'Port order and reference impedance. Files stay on your device.'], guide: '/guides/s-parameters-s11-s21' },
  ] },
  { id: 'rf', title: 'RF & matching', description: 'Return loss, coaxial lines and impedance matching.', group: 'RF', tasks: [
    { id: 'vswr', label: 'Convert VSWR, return loss or reflection', tool: '/vswr-calculator', why: 'Convert mismatch measures and see what they imply for reflected power.', prepare: ['VSWR, return loss or reflection coefficient.'], guide: '/guides/vswr-return-loss-explained' },
    { id: 'matching', label: 'Design an L-network matching circuit', tool: '/impedance-matching', why: 'Find ideal matching component values and inspect the impedance transformation on a Smith chart.', prepare: ['Source and load impedance at the operating frequency.', 'Operating frequency and component constraints.'], guide: '/guides/l-network-impedance-matching' },
    { id: 'coax', label: 'Calculate coaxial-line impedance', tool: '/coax-impedance', why: 'Estimate impedance and delay from coaxial geometry and dielectric properties.', prepare: ['Inner-conductor and outer-conductor inside diameters.', 'Dielectric permittivity and cable length.'], guide: '/guides/coax-impedance-formula' },
  ] },
];
export interface WorkspaceTopic {
  id: string;
  title: string;
  description: string;
  steps: string[];
  note: string;
  action?: { label: string; to: string };
}
export const WORKSPACE_TOPICS: WorkspaceTopic[] = [
  { id: 'compare', title: 'Compare two designs', description: 'Keep a baseline while changing inputs.', steps: ['On impedance, crosstalk or a thermal calculator, set up design A and wait for valid results.', 'Choose Compare beside the results to keep A as the baseline.', 'Change your inputs for design B. The comparison shows changed inputs and result differences; Restore A brings back the saved inputs.'], note: 'Available on impedance, crosstalk, junction temperature, thermal vias and copper heat spreading. The baseline stays in this browser tab.', action: { label: 'Open impedance calculator', to: '/impedance' } },
  { id: 'share', title: 'Share a calculation', description: 'Send someone the inputs as a link.', steps: ['Open a calculator and finish editing its inputs.', 'Choose File → Copy Link to Inputs, or copy the calculator address from your browser.', 'Send the link. It opens that calculator with its encoded inputs.'], note: 'Local Gerber and Touchstone files are not included in a calculator link.' },
  { id: 'favourites', title: 'Keep favourite tools handy', description: 'Pin the calculators you return to.', steps: ['Open a tool and choose its star / Favorite button.', 'Find it under Favorites in the Tools sidebar. On a phone, open the Tools panel first.', 'Choose the star again to remove it from your favourites.'], note: 'Favourites stay in this browser after closing it, unless site data is cleared.' },
  { id: 'inputs', title: 'Find inputs and explanations', description: 'Understand a field, result or calculation method.', steps: ['On a desktop, edit inputs in the Properties panel. On a phone, inputs appear above the results.', 'Use the information button beside an input for its explanation. If Properties is hidden, turn it on in View.', 'Read Method, formulas and references below the results for the model and its assumptions; related guides give worked examples.'], note: 'The Help menu also provides Method & References and a link to all guides.', action: { label: 'Browse guides', to: '/guides' } },
];
