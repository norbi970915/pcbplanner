import { expect, it } from 'vitest';
import { exampleBoard } from './kicadExample';
import { EXAMPLE_SCENARIO } from './kicadExampleScenario';
import { readBoardDrawing } from './kicadDrawing';
import { dcScenario, solveDc } from './kicadPower';
import { settingsFor } from './kicadPowerSettings';
import { parseKicadBoard } from './kicadImport';
import type { KicadProjectData } from './kicadProjectQueries';
import { decodeSources } from './kicadThermal';

it('the demonstration has connected supply and return copper and a consistent dissipation budget', () => {
  const text = exampleBoard(), d = readBoardDrawing(text);
  const data: KicadProjectData = { boardName: 'example', board: parseKicadBoard(text), project: null, otherBoards: [], roleOverrides: {} };
  const scenario = dcScenario(d, EXAMPLE_SCENARIO), s = settingsFor(data, d.copper, 10, 25);
  expect(scenario.source).toBe('U1');
  expect(scenario.loads).toEqual([{ ref: 'U2', amps: 0.2 }]);
  for (const nc of [scenario.nc!, scenario.retNc!]) {
    const result = solveDc({ nc, source: scenario.source, loads: scenario.loads, s });
    if (!result.ok) throw new Error(result.error);
    expect(result.loads[0].connected).toBe(true);
    expect(result.loads[0].dropMv).toBeGreaterThan(0);
    expect(result.loads[0].dropMv).toBeLessThan(10);
  }
  const sources = decodeSources(EXAMPLE_SCENARIO.tsrc);
  expect(sources.find(x => x.ref === 'U1')!.watts).toBeCloseTo((5 - 3.3) * 0.2);
  expect(sources.find(x => x.ref === 'U2')!.watts).toBeCloseTo(3.3 * 0.2);
  expect(d.pads.some(x => x.net === '+48V')).toBe(true);
});
