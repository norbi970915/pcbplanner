import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { EXAMPLE_SCENARIO } from './kicadExampleScenario';
import { readBoardDrawing } from './kicadDrawing';
import { dcScenario, solveDc } from './kicadPower';
import { settingsFor } from './kicadPowerSettings';
import { parseKicadBoard } from './kicadImport';
import type { KicadProjectData } from './kicadProjectQueries';
import { decodeSources } from './kicadThermal';

it('the demonstration has connected supply and return copper and a consistent dissipation budget', () => {
  const text = readFileSync('public/examples/linkbench-4/LinkBench-4.kicad_pcb', 'utf8'), d = readBoardDrawing(text);
  const data: KicadProjectData = { boardName: 'example', board: parseKicadBoard(text), project: null, otherBoards: [], roleOverrides: {} };
  const scenario = dcScenario(d, EXAMPLE_SCENARIO), s = settingsFor(data, d.copper, 10, 25);
  expect(scenario.source).toBe('J3');
  expect(scenario.loads).toEqual(['R1', 'R2', 'R3', 'R4'].map(ref => ({ ref, amps: 0.0735294 })));
  for (const nc of [scenario.nc!, scenario.retNc!]) {
    const result = solveDc({ nc, source: scenario.source, loads: scenario.loads, s });
    if (!result.ok) throw new Error(result.error);
    for (const load of result.loads) {
      expect(load.connected).toBe(true);
      expect(load.dropMv).toBeGreaterThan(0);
      expect(load.dropMv).toBeLessThan(10);
    }
  }
  const sources = decodeSources(EXAMPLE_SCENARIO.tsrc);
  expect(sources).toHaveLength(4);
  for (const source of sources) expect(source.watts).toBeCloseTo(25 / 68, 5);
  expect(sources.reduce((sum, source) => sum + source.watts, 0)).toBeCloseTo(EXAMPLE_SCENARIO.pv * EXAMPLE_SCENARIO.pi, 5);
  expect(d.pads.some(x => x.net === '+5V')).toBe(true);
});
