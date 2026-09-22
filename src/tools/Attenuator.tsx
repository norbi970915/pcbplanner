import { SiField } from '../components/SiField';
import { ToolPage } from '../components/ToolPage';
import { Big, Notes, NumField, Panel, Result, Section, SelectField } from '../components/ui';
import { analyzePad, bridgedTPad, eNearest, padBranches, piPad, tPad, type ESeries, type PadTopology } from '../lib/electronics';
import { fmt, si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { db: 3, z0: 50, topo: 'pi', ser: 'E96', pin: 0.1 };

const TOPOS: { value: PadTopology; label: string }[] = [
  { value: 'pi', label: 'Pi' },
  { value: 't', label: 'T' },
  { value: 'bt', label: 'Bridged T' },
];

/** Exact resistor values in the order of padBranches(). */
function padValues(topo: PadTopology, db: number, z0: number): number[] {
  if (topo === 'pi') {
    const p = piPad(db, z0);
    return [p.shunt, p.series, p.shunt];
  }
  if (topo === 't') {
    const t = tPad(db, z0);
    return [t.series, t.shunt, t.series];
  }
  const b = bridgedTPad(db, z0);
  return [b.arm, b.arm, b.bridge, b.shunt];
}

const rl = (v: number) => (v > 99 ? '> 99 dB' : `${fmt(v, 3)} dB`);

export default function Attenuator() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const topo = (TOPOS.some((t) => t.value === p.topo) ? p.topo : 'pi') as PadTopology;
  const ser: ESeries = p.ser === 'E12' || p.ser === 'E24' ? p.ser : 'E96';
  const errors: string[] = [];
  if (!(p.db > 0)) errors.push('Attenuation must be greater than 0 dB.');
  if (!(p.z0 > 0)) errors.push('Impedance must be greater than 0.');
  if (!(p.pin >= 0)) errors.push('Input power cannot be negative.');
  const ok = errors.length === 0;

  const exact = ok ? padValues(topo, p.db, p.z0) : [];
  const std = exact.map((v) => eNearest(v, ser));
  const branches = ok ? padBranches(topo, exact) : [];
  const aExact = ok ? analyzePad(branches, p.z0) : null;
  const aStd = ok ? analyzePad(padBranches(topo, std), p.z0) : null;
  const notes: string[] = [];
  if (ok && p.db > 40) notes.push('Above about 40 dB, leakage around a single pad usually limits the real attenuation; cascade two pads and shield them.');

  const properties = (
    <>
      <Section title="Pad">
        <SelectField label="Topology" value={topo} onChange={(v) => set({ topo: v })} options={TOPOS} />
        <NumField label="Attenuation" symbol="A" value={p.db} onChange={(v) => set({ db: v })} unit="dB" />
        <NumField label="Impedance" symbol="Z0" value={p.z0} onChange={(v) => set({ z0: v })} unit="Ω" />
      </Section>
      <Section title="Parts">
        <SelectField
          label="Standard values"
          value={ser}
          onChange={(v) => set({ ser: v })}
          options={[
            { value: 'E12', label: 'E12 (10 %)' },
            { value: 'E24', label: 'E24 (5 %)' },
            { value: 'E96', label: 'E96 (1 %)' },
          ]}
        />
        <SiField label="Input power" symbol="Pin" value={p.pin} onChange={(v) => set({ pin: v })} unit="W" prefixes={['µ', 'm', '']} allowZero hint="Power into the pad, used for the resistor dissipation." />
      </Section>
    </>
  );

  return (
    <ToolPage
      title="Attenuator Pads"
      description="Resistor values for matched Pi, T and bridged-T attenuators between equal impedances, with the nearest standard values, the attenuation and match they actually give, and the power in each resistor."
      onReset={reset}
      properties={properties}
      status={ok ? `${fmt(p.db, 4)} dB ${TOPOS.find((t) => t.value === topo)?.label} pad, ${fmt(p.z0, 4)} Ω: ${exact.map((v) => `${fmt(v, 4)} Ω`).join(', ')}` : 'Check the inputs'}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      <Notes items={notes} />
      {ok && aExact && aStd && (
        <>
          <Panel title="Result">
            <div className="flex flex-wrap gap-8 px-3 py-3">
              {topo === 'pi' && (
                <>
                  <Big label="Shunt R1 = R3" value={fmt(exact[0], 4)} unit="Ω" />
                  <Big label="Series R2" value={fmt(exact[1], 4)} unit="Ω" />
                </>
              )}
              {topo === 't' && (
                <>
                  <Big label="Series R1 = R3" value={fmt(exact[0], 4)} unit="Ω" />
                  <Big label="Shunt R2" value={fmt(exact[1], 4)} unit="Ω" />
                </>
              )}
              {topo === 'bt' && (
                <>
                  <Big label="Arms R1 = R2 = Z0" value={fmt(exact[0], 4)} unit="Ω" />
                  <Big label="Bridge R3" value={fmt(exact[2], 4)} unit="Ω" />
                  <Big label="Shunt R4" value={fmt(exact[3], 4)} unit="Ω" />
                </>
              )}
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th className="text-left">Resistor</th>
                  <th className="v">Exact</th>
                  <th className="v">Nearest {ser}</th>
                  <th className="v">Dissipation</th>
                  <th className="v">Share of Pin</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((b, i) => (
                  <tr key={b.name}>
                    <th scope="row" className="text-left font-normal">
                      {b.name}
                    </th>
                    <td className="v">{fmt(exact[i], 5)} Ω</td>
                    <td className="v">{si(std[i], 'Ω')}</td>
                    <td className="v">{si(aExact.dissipation[i] * p.pin, 'W')}</td>
                    <td className="v">{fmt(aExact.dissipation[i] * 100, 3)} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <div className="grid gap-3 xl:grid-cols-2">
            <Panel title="Performance">
              <table className="tbl">
                <thead>
                  <tr>
                    <th />
                    <th className="v">Exact values</th>
                    <th className="v">{ser} values</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row" className="text-left font-normal">Attenuation</th>
                    <td className="v">{fmt(aExact.loss, 4)} dB</td>
                    <td className="v">{fmt(aStd.loss, 4)} dB</td>
                  </tr>
                  <tr>
                    <th scope="row" className="text-left font-normal">Input impedance</th>
                    <td className="v">{fmt(aExact.zin, 5)} Ω</td>
                    <td className="v">{fmt(aStd.zin, 5)} Ω</td>
                  </tr>
                  <tr>
                    <th scope="row" className="text-left font-normal">Return loss</th>
                    <td className="v">{rl(aExact.returnLoss)}</td>
                    <td className="v">{rl(aStd.returnLoss)}</td>
                  </tr>
                  <tr>
                    <th scope="row" className="text-left font-normal">Output power</th>
                    <td className="v">{si(p.pin * 10 ** (-aExact.loss / 10), 'W')}</td>
                    <td className="v">{si(p.pin * 10 ** (-aStd.loss / 10), 'W')}</td>
                  </tr>
                </tbody>
              </table>
            </Panel>
            <Panel title={`All topologies, ${fmt(p.db, 4)} dB at ${fmt(p.z0, 4)} Ω`}>
              <table className="tbl">
                <tbody>
                  <Result label="Pi: shunt / series" value={`${fmt(piPad(p.db, p.z0).shunt, 4)} / ${fmt(piPad(p.db, p.z0).series, 4)}`} unit="Ω" />
                  <Result label="T: series / shunt" value={`${fmt(tPad(p.db, p.z0).series, 4)} / ${fmt(tPad(p.db, p.z0).shunt, 4)}`} unit="Ω" />
                  <Result label="Bridged T: bridge / shunt" value={`${fmt(bridgedTPad(p.db, p.z0).bridge, 4)} / ${fmt(bridgedTPad(p.db, p.z0).shunt, 4)}`} unit="Ω" sub={`arms ${fmt(p.z0, 4)} Ω`} />
                  <Result label="Voltage ratio K = 10^(A/20)" value={fmt(10 ** (p.db / 20), 5)} />
                </tbody>
              </table>
            </Panel>
          </div>
        </>
      )}
    </ToolPage>
  );
}

export function Method() {
  return (
    <>
      <h2>Design equations</h2>
      <p>
        For a pad matched to <i>Z</i>
        <sub>0</sub> at both ports and attenuation <i>A</i> in dB, let <i>K</i> = 10<sup><i>A</i>/20</sup>.
      </p>
      <div className="eq">
        <span className="no">(1)</span>
        Pi: <i>R</i>
        <sub>shunt</sub> = <i>Z</i>
        <sub>0</sub> (<i>K</i> + 1)/(<i>K</i> − 1), <i>R</i>
        <sub>series</sub> = <i>Z</i>
        <sub>0</sub> (<i>K</i>
        <sup>2</sup> − 1)/(2<i>K</i>)
      </div>
      <div className="eq">
        <span className="no">(2)</span>
        T: <i>R</i>
        <sub>series</sub> = <i>Z</i>
        <sub>0</sub> (<i>K</i> − 1)/(<i>K</i> + 1), <i>R</i>
        <sub>shunt</sub> = <i>Z</i>
        <sub>0</sub> · 2<i>K</i>/(<i>K</i>
        <sup>2</sup> − 1)
      </div>
      <div className="eq">
        <span className="no">(3)</span>
        Bridged T: arms = <i>Z</i>
        <sub>0</sub>, <i>R</i>
        <sub>bridge</sub> = <i>Z</i>
        <sub>0</sub> (<i>K</i> − 1), <i>R</i>
        <sub>shunt</sub> = <i>Z</i>
        <sub>0</sub>/(<i>K</i> − 1)
      </div>
      <h2>Check with standard values</h2>
      <p>
        The pad, driven from a <i>Z</i>
        <sub>0</sub> source and terminated in <i>Z</i>
        <sub>0</sub>, is solved by nodal analysis. Attenuation is the insertion loss relative to a direct connection, return loss is −20 log |Γ| with Γ = (<i>Z</i>
        <sub>in</sub> − <i>Z</i>
        <sub>0</sub>)/(<i>Z</i>
        <sub>in</sub> + <i>Z</i>
        <sub>0</sub>), and the dissipation of each resistor is its share of the power entering the pad. The model is purely resistive: at RF, resistor parasitics and layout set the upper
        frequency limit.
      </p>
      <h2>References</h2>
      <ol>
        <li>
          <i>The ARRL Handbook for Radio Communications</i>, American Radio Relay League, chapter on RF techniques (attenuator tables and formulas).
        </li>
        <li>
          <i>Reference Data for Engineers: Radio, Electronics, Computer and Communications</i>, 9th ed., Newnes, 2002, ch. 11 (attenuators).
        </li>
      </ol>
    </>
  );
}
