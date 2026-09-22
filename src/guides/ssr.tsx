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

export function renderGuide(path: string): string {
  const Page = PAGES[path];
  if (!Page) throw new Error(`No guide component for ${path}`);
  return renderToString(
    <MemoryRouter initialEntries={[path]}>
      <Page />
    </MemoryRouter>,
  );
}
