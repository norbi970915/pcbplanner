export type RegulatorType = 'buck' | 'boost' | 'ldo';

export interface PowerRail {
  id: string;
  name: string;
  parentId: string;
  type: RegulatorType;
  voltage: number;
  efficiencyPct: number;
  dropoutV: number;
  iqMa: number;
  maxCurrentA: number;
  afterId: string;
}

export interface PowerLoad {
  id: string;
  name: string;
  railId: string;
  normalA: number;
  peakA: number;
}

export interface PowerTreeInput {
  source: { name: string; voltage: number; maxCurrentA: number };
  rails: PowerRail[];
  loads: PowerLoad[];
}

export interface PowerBudget {
  outputCurrentA: number;
  outputPowerW: number;
  inputCurrentA: number;
  inputPowerW: number;
  lossW: number;
}

export interface RailBudget {
  rail: PowerRail;
  inputVoltage: number;
  depth: number;
  normal: PowerBudget;
  peak: PowerBudget;
}

export interface PowerTreeResult {
  errors: string[];
  warnings: string[];
  rails: RailBudget[];
  source: { normalCurrentA: number; peakCurrentA: number; normalPowerW: number; peakPowerW: number } | null;
}

export const EXAMPLE_POWER_TREE: PowerTreeInput = {
  source: { name: '12 V input', voltage: 12, maxCurrentA: 2 },
  rails: [
    { id: 'r1', name: '5 V', parentId: 'source', type: 'buck', voltage: 5, efficiencyPct: 90, dropoutV: 0, iqMa: 0, maxCurrentA: 2, afterId: '' },
    { id: 'r2', name: '3.3 V', parentId: 'r1', type: 'ldo', voltage: 3.3, efficiencyPct: 90, dropoutV: 0.25, iqMa: 0.05, maxCurrentA: 0.5, afterId: '' },
  ],
  loads: [
    { id: 'l1', name: 'Logic', railId: 'r2', normalA: 0.15, peakA: 0.3 },
    { id: 'l2', name: '5 V peripherals', railId: 'r1', normalA: 0.4, peakA: 0.8 },
  ],
};

export function parsePowerTree(raw: string): PowerTreeInput | null {
  try {
    const tree: unknown = JSON.parse(raw);
    if (!tree || typeof tree !== 'object') return null;
    const item = tree as Partial<PowerTreeInput>;
    if (!item.source || typeof item.source !== 'object' || !Array.isArray(item.rails) || !Array.isArray(item.loads)) return null;
    if (item.rails.length > 20 || item.loads.length > 40) return null;
    if (typeof item.source.name !== 'string' || typeof item.source.voltage !== 'number' || typeof item.source.maxCurrentA !== 'number') return null;
    const railFields = (rail: PowerRail) => rail && typeof rail.id === 'string' && typeof rail.name === 'string' && typeof rail.parentId === 'string'
      && ['buck', 'boost', 'ldo'].includes(rail.type) && typeof rail.voltage === 'number' && typeof rail.efficiencyPct === 'number'
      && typeof rail.dropoutV === 'number' && typeof rail.iqMa === 'number' && typeof rail.maxCurrentA === 'number' && typeof rail.afterId === 'string';
    const loadFields = (load: PowerLoad) => load && typeof load.id === 'string' && typeof load.name === 'string' && typeof load.railId === 'string'
      && typeof load.normalA === 'number' && typeof load.peakA === 'number';
    return item.rails.every(railFields) && item.loads.every(loadFields) ? item as PowerTreeInput : null;
  } catch { return null; }
}

const finite = (value: number) => Number.isFinite(value);

export function calculatePowerTree(tree: PowerTreeInput): PowerTreeResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { source, rails, loads } = tree;
  if (!(finite(source.voltage) && source.voltage > 0)) errors.push('Input source voltage must be greater than 0 V.');
  if (!(finite(source.maxCurrentA) && source.maxCurrentA >= 0)) errors.push('Source current rating cannot be negative.');
  if (rails.length > 20 || loads.length > 40) errors.push('Use at most 20 rails and 40 loads in one power tree.');

  const byId = new Map(rails.map(rail => [rail.id, rail]));
  if (byId.size !== rails.length || rails.some(rail => !rail.id || rail.id === 'source')) errors.push('Each rail needs a unique identifier.');
  const loadIds = new Set(loads.map(load => load.id));
  if (loadIds.size !== loads.length || loads.some(load => !load.id)) errors.push('Each load needs a unique identifier.');

  for (const rail of rails) {
    const name = rail.name.trim() || 'Unnamed rail';
    if (!rail.name.trim()) errors.push('Give every rail a name.');
    if (rail.parentId === rail.id || (rail.parentId !== 'source' && !byId.has(rail.parentId))) errors.push(`${name}: select a valid upstream supply.`);
    if (rail.afterId === rail.id || (rail.afterId && !byId.has(rail.afterId))) errors.push(`${name}: select a valid power-up dependency.`);
    if (!(finite(rail.voltage) && rail.voltage > 0)) errors.push(`${name}: output voltage must be greater than 0 V.`);
    if (!(finite(rail.maxCurrentA) && rail.maxCurrentA >= 0)) errors.push(`${name}: rated output current cannot be negative.`);
    if (rail.type !== 'ldo' && !(finite(rail.efficiencyPct) && rail.efficiencyPct > 0 && rail.efficiencyPct <= 100)) errors.push(`${name}: efficiency must be above 0 and at most 100%.`);
    if (rail.type === 'ldo' && (!(finite(rail.dropoutV) && rail.dropoutV >= 0) || !(finite(rail.iqMa) && rail.iqMa >= 0))) errors.push(`${name}: dropout and quiescent current cannot be negative.`);
  }
  for (const load of loads) {
    const name = load.name.trim() || 'Unnamed load';
    if (!load.name.trim()) errors.push('Give every load a name.');
    if (load.railId !== 'source' && !byId.has(load.railId)) errors.push(`${name}: select a valid supply rail.`);
    if (!(finite(load.normalA) && finite(load.peakA) && load.normalA >= 0 && load.peakA >= load.normalA)) errors.push(`${name}: enter non-negative currents with peak at least normal.`);
  }
  if (errors.length) return { errors, warnings, rails: [], source: null };

  // Both electrical parentage and optional start-after requirements must be acyclic.
  const state = new Map<string, number>();
  const ordered: PowerRail[] = [];
  const visit = (rail: PowerRail): boolean => {
    if (state.get(rail.id) === 1) return false;
    if (state.get(rail.id) === 2) return true;
    state.set(rail.id, 1);
    for (const dependencyId of [rail.parentId, rail.afterId]) {
      const dependency = byId.get(dependencyId);
      if (dependency && !visit(dependency)) return false;
    }
    state.set(rail.id, 2);
    ordered.push(rail);
    return true;
  };
  if (rails.some(rail => !visit(rail))) return { errors: ['Supply or power-up dependencies contain a cycle.'], warnings, rails: [], source: null };

  const depthById = new Map<string, number>();
  for (const rail of ordered) {
    const parent = byId.get(rail.parentId);
    const inputV = parent?.voltage ?? source.voltage;
    depthById.set(rail.id, parent ? (depthById.get(parent.id) ?? 0) + 1 : 0);
    if (rail.type === 'buck' && !(rail.voltage < inputV)) errors.push(`${rail.name}: a buck output must be below its input voltage.`);
    if (rail.type === 'boost' && !(rail.voltage > inputV)) errors.push(`${rail.name}: a boost output must be above its input voltage.`);
    if (rail.type === 'ldo' && inputV < rail.voltage + rail.dropoutV) errors.push(`${rail.name}: input voltage is below output plus the entered dropout requirement.`);
  }
  if (errors.length) return { errors, warnings, rails: [], source: null };

  const budgets = new Map<string, RailBudget>();
  for (const rail of [...ordered].reverse()) {
    const parent = byId.get(rail.parentId);
    const inputVoltage = parent?.voltage ?? source.voltage;
    const children = rails.filter(child => child.parentId === rail.id);
    const budget = (peak: boolean): PowerBudget => {
      const localA = loads.filter(load => load.railId === rail.id).reduce((sum, load) => sum + (peak ? load.peakA : load.normalA), 0);
      const childA = children.reduce((sum, child) => sum + (peak ? budgets.get(child.id)!.peak.inputCurrentA : budgets.get(child.id)!.normal.inputCurrentA), 0);
      const outputCurrentA = localA + childA;
      const outputPowerW = rail.voltage * outputCurrentA;
      const inputCurrentA = rail.type === 'ldo' ? outputCurrentA + rail.iqMa / 1000 : outputPowerW / (rail.efficiencyPct / 100 * inputVoltage);
      const inputPowerW = inputVoltage * inputCurrentA;
      return { outputCurrentA, outputPowerW, inputCurrentA, inputPowerW, lossW: inputPowerW - outputPowerW };
    };
    const entry: RailBudget = { rail, inputVoltage, depth: depthById.get(rail.id) ?? 0, normal: budget(false), peak: budget(true) };
    budgets.set(rail.id, entry);
    if (rail.maxCurrentA > 0 && entry.peak.outputCurrentA > rail.maxCurrentA + 1e-9) warnings.push(`${rail.name}: simultaneous peak demand exceeds the entered output-current rating.`);
  }

  const directNormalA = loads.filter(load => load.railId === 'source').reduce((sum, load) => sum + load.normalA, 0);
  const directPeakA = loads.filter(load => load.railId === 'source').reduce((sum, load) => sum + load.peakA, 0);
  const roots = rails.filter(rail => rail.parentId === 'source');
  const normalCurrentA = directNormalA + roots.reduce((sum, rail) => sum + budgets.get(rail.id)!.normal.inputCurrentA, 0);
  const peakCurrentA = directPeakA + roots.reduce((sum, rail) => sum + budgets.get(rail.id)!.peak.inputCurrentA, 0);
  if (source.maxCurrentA > 0 && peakCurrentA > source.maxCurrentA + 1e-9) warnings.push('Simultaneous peak demand exceeds the entered input-source current rating.');
  if (!loads.length) warnings.push('Add at least one load to calculate a useful current budget.');

  return {
    errors,
    warnings,
    rails: ordered.map(rail => budgets.get(rail.id)!),
    source: { normalCurrentA, peakCurrentA, normalPowerW: source.voltage * normalCurrentA, peakPowerW: source.voltage * peakCurrentA },
  };
}
