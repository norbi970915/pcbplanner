// Build-time rendering of the guide articles to static HTML (used by scripts/prerender.mjs).
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import ChoosingStackup from './ChoosingStackup';
import ControlledImpedance from './ControlledImpedance';
import CopperCooling from './CopperCooling';
import CreepageMains from './CreepageMains';
import GuidesIndex from './GuidesIndex';
import PcieRouting from './PcieRouting';

const PAGES: Record<string, () => React.JSX.Element> = {
  '/guides': GuidesIndex,
  '/guides/controlled-impedance': ControlledImpedance,
  '/guides/choosing-a-pcb-stackup': ChoosingStackup,
  '/guides/pcie-gen3-routing': PcieRouting,
  '/guides/copper-area-for-cooling': CopperCooling,
  '/guides/creepage-clearance-mains': CreepageMains,
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

export function renderGuide(path: string): string {
  const Page = PAGES[path];
  if (!Page) throw new Error(`No guide component for ${path}`);
  return renderToString(
    <MemoryRouter initialEntries={[path]}>
      <Page />
    </MemoryRouter>,
  );
}
