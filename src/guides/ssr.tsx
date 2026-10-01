// Build-time rendering of routed content pages to static HTML (used by scripts/prerender.mjs).
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import AcCouplingCaps from './AcCouplingCaps';
import BoostFormulas from './BoostFormulas';
import BuckFormulas from './BuckFormulas';
import ChoosingStackup from './ChoosingStackup';
import ControlledImpedance from './ControlledImpedance';
import CopperCooling from './CopperCooling';
import CreepageMains from './CreepageMains';
import GuidesIndex from './GuidesIndex';
import CrosstalkSpacing from './CrosstalkSpacing';
import ViaCurrent from './ViaCurrent';
import DecouplingCapacitors from './DecouplingCapacitors';
import PcieRouting from './PcieRouting';
import PcieGuidelines from './PcieGuidelines';
import Usb3Impedance from './Usb3Impedance';
import ViaFence from './ViaFence';
import VswrReturnLoss from './VswrReturnLoss';
import CoaxImpedanceFormula from './CoaxImpedanceFormula';
import LNetworkMatching from './LNetworkMatching';
import QuarterWaveMatching from './QuarterWaveMatching';
import SParametersExplained from './SParametersExplained';
import PhaseNoiseJitter from './PhaseNoiseJitter';
import RcFilterDesign from './RcFilterDesign';
import LdoEfficiency from './LdoEfficiency';
import I2cPullupGuide from './I2cPullupGuide';
import CrystalLoadGuide from './CrystalLoadGuide';
import DifferentialSParameters from './DifferentialSParameters';
import About from '../pages/About';
import NotFound from '../pages/NotFound';
import Schematic from '../pages/Schematic';
import Home from '../tools/Home';
import ToolsIndex from '../tools/ToolsIndex';

const PAGES: Record<string, () => React.JSX.Element> = {
  '/': Home,
  '/tools': ToolsIndex,
  '/schematic': Schematic,
  '/guides': GuidesIndex,
  '/guides/rc-filter-design': RcFilterDesign,
  '/guides/ldo-efficiency-power-dissipation': LdoEfficiency,
  '/guides/i2c-pullup-resistor-calculation': I2cPullupGuide,
  '/guides/crystal-load-capacitors-ppm': CrystalLoadGuide,
  '/guides/s4p-differential-s-parameters': DifferentialSParameters,
  '/guides/vswr-return-loss-explained': VswrReturnLoss,
  '/guides/coax-impedance-formula': CoaxImpedanceFormula,
  '/guides/l-network-impedance-matching': LNetworkMatching,
  '/guides/quarter-wave-impedance-transformer': QuarterWaveMatching,
  '/guides/s-parameters-s11-s21': SParametersExplained,
  '/guides/phase-noise-to-jitter': PhaseNoiseJitter,
  '/guides/buck-converter-formulas': BuckFormulas,
  '/guides/boost-converter-formulas': BoostFormulas,
  '/guides/via-fence-spacing': ViaFence,
  '/guides/pcb-crosstalk-3w-rule': CrosstalkSpacing,
  '/guides/pcb-via-current-capacity': ViaCurrent,
  '/guides/decoupling-capacitor-values': DecouplingCapacitors,
  '/guides/controlled-impedance': ControlledImpedance,
  '/guides/choosing-a-pcb-stackup': ChoosingStackup,
  '/guides/pcie-gen3-routing': PcieRouting,
  '/guides/pcie-routing-guidelines': PcieGuidelines,
  '/guides/copper-area-for-cooling': CopperCooling,
  '/guides/creepage-clearance-mains': CreepageMains,
  '/guides/ac-coupling-capacitors': AcCouplingCaps,
  '/guides/usb3-85-or-90-ohm': Usb3Impedance,
  '/about': About,
  '/404': NotFound,
};

// every tool module, so its exported Method (formulas, explanation, references) can be rendered
const TOOL_MODULES = import.meta.glob<{ Method?: () => React.JSX.Element }>('../tools/*.tsx', { eager: true });

/** Static HTML of a tool's method section, or '' when the tool has none. `file` is the module name, e.g. 'Impedance'. */
export function renderToolMethod(file: string): string {
  const Method = TOOL_MODULES[`../tools/${file}.tsx`]?.Method;
  if (!Method) return '';
  return renderToString(
    <MemoryRouter>
      <Method />
    </MemoryRouter>,
  );
}

/** Static HTML of a routed page that is not a tool: a guide article, the guide index or About. */
export function renderGuide(path: string): string {
  const Page = PAGES[path];
  if (!Page) throw new Error(`No page component for ${path}`);
  return renderToString(
    <MemoryRouter initialEntries={[path]}>
      <Page />
    </MemoryRouter>,
  );
}
