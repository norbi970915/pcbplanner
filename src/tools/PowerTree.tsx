import { useId, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ToolPage } from '../components/ToolPage';
import { Big, Notes, NumField, Panel, Section, SelectField } from '../components/ui';
import { calculatePowerTree, EXAMPLE_POWER_TREE, parsePowerTree, type PowerLoad, type PowerRail, type PowerTreeInput, type RegulatorType } from '../lib/powerTree';
import { fmt, si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { tree: JSON.stringify(EXAMPLE_POWER_TREE) };
const blankTree = (): PowerTreeInput => ({ source: { name: 'Input', voltage: 12, maxCurrentA: 0 }, rails: [], loads: [] });

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId();
  return <div className="grid min-h-[22px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
    <label htmlFor={id} className="text-muted">{label}</label>
    <input id={id} className="fld w-[160px]" maxLength={60} value={value} onChange={event => onChange(event.target.value)} />
  </div>;
}

function invalidParent(candidateId: string, railId: string, rails: PowerRail[]) {
  const seen = new Set<string>();
  let current = candidateId;
  while (current && current !== 'source' && !seen.has(current)) {
    if (current === railId) return true;
    seen.add(current);
    current = rails.find(rail => rail.id === current)?.parentId ?? '';
  }
  return false;
}

export default function PowerTree() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const parsed = useMemo(() => parsePowerTree(p.tree), [p.tree]);
  const tree = parsed ?? EXAMPLE_POWER_TREE;
  const result = useMemo(() => calculatePowerTree(tree), [tree]);
  const update = (next: PowerTreeInput) => set({ tree: JSON.stringify(next) });
  const updateSource = (patch: Partial<PowerTreeInput['source']>) => update({ ...tree, source: { ...tree.source, ...patch } });
  const updateRail = (id: string, patch: Partial<PowerRail>) => update({ ...tree, rails: tree.rails.map(rail => rail.id === id ? { ...rail, ...patch } : rail) });
  const updateLoad = (id: string, patch: Partial<PowerLoad>) => update({ ...tree, loads: tree.loads.map(load => load.id === id ? { ...load, ...patch } : load) });
  const addRail = () => {
    if (tree.rails.length >= 20) return;
    const rail: PowerRail = {
      id: crypto.randomUUID(), name: 'New rail', parentId: 'source', type: 'buck',
      voltage: Math.max(0.1, Math.min(5, tree.source.voltage / 2)), efficiencyPct: 90,
      dropoutV: 0.25, iqMa: 0, maxCurrentA: 0, afterId: '',
    };
    update({ ...tree, rails: [...tree.rails, rail] });
  };
  const addLoad = () => {
    if (tree.loads.length >= 40) return;
    const load: PowerLoad = { id: crypto.randomUUID(), name: 'New load', railId: tree.rails[0]?.id ?? 'source', normalA: 0.1, peakA: 0.2 };
    update({ ...tree, loads: [...tree.loads, load] });
  };
  const supplyOptions = [{ value: 'source', label: `${tree.source.name || 'Input'} (${fmt(tree.source.voltage, 5)} V)` },
    ...tree.rails.map(rail => ({ value: rail.id, label: `${rail.name || 'Unnamed'} (${fmt(rail.voltage, 5)} V)` }))];
  const errors = [...(parsed ? [] : ['The power-tree link is invalid. Reset or start a blank tree to continue.']), ...result.errors];

  return <ToolPage title="Power Tree Planner"
    description="Budget input current, regulator losses and output ratings across cascaded supply rails. Record required power-up dependencies before finishing the schematic."
    onReset={reset} status={result.source ? `Input: ${si(result.source.normalCurrentA, 'A', 4)} normal · ${si(result.source.peakCurrentA, 'A', 4)} simultaneous peak` : 'Check the power-tree inputs'}
    method={<Method />}
    properties={<>
      <Section title="Input source">
        <TextField label="Name" value={tree.source.name} onChange={name => updateSource({ name })} />
        <NumField label="Voltage" value={tree.source.voltage} onChange={voltage => updateSource({ voltage })} unit="V" />
        <NumField label="Current rating" value={tree.source.maxCurrentA} onChange={maxCurrentA => updateSource({ maxCurrentA })} unit="A" allowZero hint="Enter 0 if the source rating is not known yet." />
        <p className="text-faint">A current rating of 0 means unspecified. Add direct input loads below as well as regulated rails.</p>
      </Section>
      <Section title="Start">
        <div className="flex flex-wrap justify-end gap-1">
          <button type="button" className="btn" onClick={() => update(blankTree())}>Start blank</button>
          <button type="button" className="btn" onClick={reset}>Load example</button>
        </div>
        <p className="text-faint">The initial 12 V → 5 V → 3.3 V tree is an editable example. Your inputs stay available in this app session, and the URL can be shared.</p>
      </Section>
    </>}>
    <Notes kind="error" items={errors} />
    <Notes items={result.warnings} />

    <Panel title="Supply Rails" right={<button type="button" className="btn" onClick={addRail} disabled={tree.rails.length >= 20}>Add rail</button>}>
      {!tree.rails.length && <p className="px-3 py-3 text-muted">No regulated rails yet. Add a rail, or attach a load directly to the input source.</p>}
      {tree.rails.map((rail, index) => {
        const referenced = tree.rails.some(child => child.parentId === rail.id || child.afterId === rail.id) || tree.loads.some(load => load.railId === rail.id);
        const parentOptions = supplyOptions.filter(option => !invalidParent(option.value, rail.id, tree.rails));
        const afterOptions = [{ value: '', label: 'No extra requirement' }, ...tree.rails.filter(other => !invalidParent(other.id, rail.id, tree.rails)).map(other => ({ value: other.id, label: other.name || 'Unnamed rail' }))];
        return <div key={rail.id} className="border-t border-line">
          <div className="flex items-center justify-between bg-panel-head px-3 py-1.5">
            <h3 className="font-semibold">{index + 1}. {rail.name || 'Unnamed rail'}</h3>
            <button type="button" className="btn" disabled={referenced} title={referenced ? 'Remove downstream rails, dependencies and loads first.' : undefined}
              onClick={() => update({ ...tree, rails: tree.rails.filter(item => item.id !== rail.id) })}>Remove</button>
          </div>
          <div className="power-tree-fields grid gap-x-8 gap-y-1 px-3 py-3 xl:grid-cols-2">
            <TextField label="Rail name" value={rail.name} onChange={name => updateRail(rail.id, { name })} />
            <SelectField label="Supplied from" value={rail.parentId} onChange={parentId => updateRail(rail.id, { parentId })} options={parentOptions} width={160} />
            <SelectField label="Regulator" value={rail.type} onChange={type => updateRail(rail.id, { type: type as RegulatorType })}
              options={[{ value: 'buck', label: 'Buck' }, { value: 'boost', label: 'Boost' }, { value: 'ldo', label: 'LDO' }]} width={160} />
            <NumField label="Output voltage" value={rail.voltage} onChange={voltage => updateRail(rail.id, { voltage })} unit="V" />
            {rail.type === 'ldo' ? <>
              <NumField label="Required dropout" value={rail.dropoutV} onChange={dropoutV => updateRail(rail.id, { dropoutV })} unit="V" allowZero hint="Use the datasheet dropout at the expected current and temperature." />
              <NumField label="Quiescent current" value={rail.iqMa} onChange={iqMa => updateRail(rail.id, { iqMa })} unit="mA" allowZero hint="Input quiescent current from the LDO datasheet." />
            </> : <NumField label="Estimated efficiency" value={rail.efficiencyPct} onChange={efficiencyPct => updateRail(rail.id, { efficiencyPct })} unit="%" hint="Use efficiency at the expected input voltage and load, from the regulator datasheet." />}
            <NumField label="Rated output current" value={rail.maxCurrentA} onChange={maxCurrentA => updateRail(rail.id, { maxCurrentA })} unit="A" allowZero hint="Enter 0 if no regulator has been selected yet." />
            <SelectField label="Power up after" value={rail.afterId} onChange={afterId => updateRail(rail.id, { afterId })} options={afterOptions} width={160} />
          </div>
        </div>;
      })}
    </Panel>

    <Panel title="Loads" right={<button type="button" className="btn" onClick={addLoad} disabled={tree.loads.length >= 40}>Add load</button>}>
      {!tree.loads.length && <p className="px-3 py-3 text-muted">Add the circuits drawing current from each rail. Use datasheet or measured normal and peak values.</p>}
      {tree.loads.map((load, index) => <div key={load.id} className="border-t border-line">
        <div className="flex items-center justify-between bg-panel-head px-3 py-1.5">
          <h3 className="font-semibold">{index + 1}. {load.name || 'Unnamed load'}</h3>
          <button type="button" className="btn" onClick={() => update({ ...tree, loads: tree.loads.filter(item => item.id !== load.id) })}>Remove</button>
        </div>
        <div className="power-tree-fields grid gap-x-8 gap-y-1 px-3 py-3 xl:grid-cols-2">
          <TextField label="Load name" value={load.name} onChange={name => updateLoad(load.id, { name })} />
          <SelectField label="Connected to" value={load.railId} onChange={railId => updateLoad(load.id, { railId })} options={supplyOptions} width={160} />
          <NumField label="Normal current" value={load.normalA} onChange={normalA => updateLoad(load.id, { normalA })} unit="A" allowZero />
          <NumField label="Peak current" value={load.peakA} onChange={peakA => updateLoad(load.id, { peakA })} unit="A" allowZero />
        </div>
      </div>)}
    </Panel>

    {result.source && <>
      <Panel title="Input Source Budget">
        <div className="flex flex-wrap gap-8 px-3 py-3">
          <Big label="Normal input current" value={fmt(result.source.normalCurrentA, 4)} unit="A" />
          <Big label="Normal input power" value={fmt(result.source.normalPowerW, 4)} unit="W" />
          <Big label="Simultaneous peak current" value={fmt(result.source.peakCurrentA, 4)} unit="A" />
          <Big label="Peak input power" value={fmt(result.source.peakPowerW, 4)} unit="W" />
        </div>
        <p className="px-3 pb-3 text-faint">All entered peak currents are assumed to occur at once. This is a conservative steady-state budget; capacitor charging, motor starts and regulator soft-start need separate checks.</p>
      </Panel>
      {!!result.rails.length && <Panel title="Regulator Budget">
        <table className="tbl"><thead><tr><th>Rail</th><th className="v">Normal out</th><th className="v">Peak out</th><th className="v">Peak input</th><th className="v">Normal loss</th><th className="v">Peak loss</th><th className="v">Rating headroom</th></tr></thead><tbody>
          {result.rails.map(entry => <tr key={entry.rail.id}>
            <td><span style={{ paddingLeft: Math.min(entry.depth, 4) * 12 }}>{entry.rail.name}</span><span className="ml-1 text-faint">({entry.rail.type.toUpperCase()})</span></td>
            <td className="v">{si(entry.normal.outputCurrentA, 'A', 4)}</td>
            <td className="v">{si(entry.peak.outputCurrentA, 'A', 4)}</td>
            <td className="v">{si(entry.peak.inputCurrentA, 'A', 4)} at {fmt(entry.inputVoltage, 5)} V</td>
            <td className="v">{si(entry.normal.lossW, 'W', 4)}</td>
            <td className="v">{si(entry.peak.lossW, 'W', 4)}</td>
            <td className="v">{entry.rail.maxCurrentA > 0 ? si(entry.rail.maxCurrentA - entry.peak.outputCurrentA, 'A', 4) : 'Unspecified'}</td>
          </tr>)}
        </tbody></table>
        <p className="px-3 py-2 text-faint">Input current includes every downstream branch. Check the calculated loss against the regulator package, board thermal design and datasheet limits.</p>
      </Panel>}
      {!!result.rails.length && <Panel title="Power-up Dependencies">
        <ol className="list-decimal space-y-1 px-8 py-3">
          {result.rails.map(entry => <li key={entry.rail.id}>
            <strong>{entry.rail.name}</strong> from {entry.rail.parentId === 'source' ? tree.source.name : tree.rails.find(rail => rail.id === entry.rail.parentId)?.name}
            {entry.rail.afterId && <>; after {tree.rails.find(rail => rail.id === entry.rail.afterId)?.name}</>}
          </li>)}
        </ol>
        <p className="px-3 pb-3 text-faint">This is one order satisfying the entered dependencies, not a timing simulation. Verify the IC's required sequence and implement it with enable, power-good or a sequencer as appropriate.</p>
      </Panel>}
    </>}
    <Panel title="Continue the Design">
      <div className="flex flex-wrap gap-2 px-3 py-3">
        <Link className="btn no-underline" to="/buck-converter">Size a buck stage</Link>
        <Link className="btn no-underline" to="/boost-converter">Size a boost stage</Link>
        <Link className="btn no-underline" to="/ldo">Check LDO heat</Link>
        <Link className="btn no-underline" to="/current-sense-shunt">Select a current shunt</Link>
      </div>
    </Panel>
  </ToolPage>;
}

export function Method() {
  return <>
    <h2>Method</h2>
    <p>Each load contributes its normal and peak current to its chosen supply. For every regulator, output current is the sum of directly connected loads and the input currents of regulators supplied by that rail. Calculation proceeds from the downstream rails back to the source.</p>
    <p>For a buck or boost regulator, P<sub>out</sub> = V<sub>out</sub> I<sub>out</sub>, P<sub>in</sub> = P<sub>out</sub> / η, I<sub>in</sub> = P<sub>in</sub> / V<sub>in</sub>, and estimated loss = P<sub>in</sub> − P<sub>out</sub>. Enter efficiency from the device's data at the relevant voltage and load; a single value is only an estimate across operating conditions. Switching-regulator idle current at zero load is not modelled.</p>
    <p>For an LDO, I<sub>in</sub> ≈ I<sub>out</sub> + I<sub>Q</sub> and estimated loss = V<sub>in</sub> I<sub>in</sub> − V<sub>out</sub> I<sub>out</sub>. The planner checks V<sub>in</sub> ≥ V<sub>out</sub> + the entered dropout requirement. Use worst-case datasheet values for dropout and I<sub>Q</sub> where appropriate.</p>
    <p>The peak budget adds all entered peak currents simultaneously; it does not model transient startup, inrush, switching ripple, current-limit behaviour, or output-voltage tolerance. Power-up dependencies are ordering requirements only, and do not calculate time delays or power-down order. Confirm the actual device data and circuit implementation.</p>
    <h2>References</h2><ol>
      <li><a href="https://www.ti.com/document-viewer/lit/html/SSZTB93" target="_blank" rel="noreferrer">Texas Instruments, Power-supply features and sequencing</a>, enable, power-good and soft-start behaviour.</li>
      <li><a href="https://www.ti.com/tool/TIDA-01568" target="_blank" rel="noreferrer">Texas Instruments TIDA-01568, 5-rail power sequencing reference design</a>, example of multi-rail power-tree and startup design.</li>
    </ol>
  </>;
}
