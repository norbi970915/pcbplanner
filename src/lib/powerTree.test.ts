import { describe, expect, it } from 'vitest';
import { calculatePowerTree, EXAMPLE_POWER_TREE, parsePowerTree, type PowerTreeInput } from './powerTree';

const clone = (): PowerTreeInput => structuredClone(EXAMPLE_POWER_TREE);

describe('power tree', () => {
  it('rolls cascaded loads and LDO quiescent current back to the input source', () => {
    const result = calculatePowerTree(clone());
    expect(result.errors).toEqual([]);
    expect(result.rails.map(entry => entry.rail.name)).toEqual(['5 V', '3.3 V']);
    const buck = result.rails[0];
    const ldo = result.rails[1];
    expect(ldo.peak.outputCurrentA).toBeCloseTo(0.3);
    expect(ldo.peak.inputCurrentA).toBeCloseTo(0.30005);
    expect(ldo.peak.lossW).toBeCloseTo(0.51025);
    expect(buck.peak.outputCurrentA).toBeCloseTo(1.10005);
    expect(buck.peak.inputPowerW).toBeCloseTo(5.50025 / 0.9);
    expect(result.source!.peakCurrentA).toBeCloseTo((5.50025 / 0.9) / 12);
    expect(result.source!.normalCurrentA).toBeLessThan(result.source!.peakCurrentA);
  });

  it('includes direct source loads and flags undersized source and regulator ratings', () => {
    const tree = clone();
    tree.loads.push({ id: 'l3', name: '12 V fan', railId: 'source', normalA: 0.3, peakA: 1 });
    tree.source.maxCurrentA = 1;
    tree.rails[1].maxCurrentA = 0.2;
    const result = calculatePowerTree(tree);
    expect(result.source!.peakCurrentA).toBeCloseTo(1 + (5.50025 / 0.9) / 12);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('3.3 V'),
      expect.stringContaining('input-source'),
    ]));
  });

  it('budgets boost input current from output power and entered efficiency', () => {
    const tree = clone();
    tree.rails = [{ ...tree.rails[0], type: 'boost', voltage: 15, efficiencyPct: 75 }];
    tree.loads = [{ id: 'load', name: '15 V load', railId: 'r1', normalA: 0.2, peakA: 0.5 }];
    const result = calculatePowerTree(tree);
    expect(result.errors).toEqual([]);
    expect(result.rails[0].peak.inputPowerW).toBeCloseTo(10);
    expect(result.rails[0].peak.inputCurrentA).toBeCloseTo(10 / 12);
    expect(result.rails[0].peak.lossW).toBeCloseTo(2.5);
  });

  it('rejects invalid topology, impossible regulator voltage and loads with peak below normal', () => {
    const tree = clone();
    tree.rails[0].parentId = 'r2';
    expect(calculatePowerTree(tree).errors.join(' ')).toContain('cycle');

    const wrongBuck = clone();
    wrongBuck.rails[0].voltage = 15;
    expect(calculatePowerTree(wrongBuck).errors.join(' ')).toContain('buck output');

    const wrongLoad = clone();
    wrongLoad.loads[0].peakA = 0.1;
    expect(calculatePowerTree(wrongLoad).errors.join(' ')).toContain('peak at least normal');

    const wrongLdo = clone();
    wrongLdo.rails[1].dropoutV = 2;
    expect(calculatePowerTree(wrongLdo).errors.join(' ')).toContain('dropout requirement');
  });

  it('honours an explicit startup dependency and rejects a startup cycle', () => {
    const tree = clone();
    tree.rails.push({ id: 'r3', name: '1.8 V', parentId: 'source', type: 'buck', voltage: 1.8, efficiencyPct: 85, dropoutV: 0, iqMa: 0, maxCurrentA: 1, afterId: 'r2' });
    expect(calculatePowerTree(tree).rails.map(entry => entry.rail.id)).toEqual(['r1', 'r2', 'r3']);
    tree.rails[0].afterId = 'r3';
    expect(calculatePowerTree(tree).errors.join(' ')).toContain('cycle');
  });

  it('parses shareable state without accepting malformed rows', () => {
    expect(parsePowerTree(JSON.stringify(clone()))?.rails).toHaveLength(2);
    expect(parsePowerTree('{bad')).toBeNull();
    expect(parsePowerTree(JSON.stringify({ ...clone(), rails: [{ id: 3 }] }))).toBeNull();
  });
});
