import { SiField } from '../components/SiField';
import { ToolPage } from '../components/ToolPage';
import { Big, Notes, Panel, Result, Section, TextField } from '../components/ui';
import { CAP_TOLERANCES, CAP_VOLTAGE_CODES, capCode, readCap, readDielectric } from '../lib/componentCodes';
import { si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { code: '104K', diel: 'X7R', c: 1e-7 };

const split = (v: number) => {
  const [num, unit] = si(v, 'F', 4).split(' ');
  return { num, unit };
};

/** RKM form as printed on film and small ceramic capacitors: 4n7, 100n, 2p2. */
function rkm(f: number): string {
  const [num, unit] = si(f, 'F', 3).split(' ');
  const prefix = unit.replace('F', '');
  if (!['p', 'n', 'µ'].includes(prefix)) return '—';
  return num.includes('.') ? num.replace('.', prefix) : `${num}${prefix}`;
}

export default function CapacitorCode() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const cap = p.code.trim() ? readCap(p.code) : null;
  const diel = p.diel.trim() ? readDielectric(p.diel) : null;
  const code = p.c > 0 ? capCode(p.c) : null;

  const errors: string[] = [];
  if (p.code.trim() && !cap) errors.push(`"${p.code.trim()}" is not a capacitor value code: use 3 digits (104), a pF value (47) or RKM notation (4n7), optionally with a voltage code in front (2A) and a tolerance letter after (K).`);
  if (p.diel.trim() && !diel) errors.push(`"${p.diel.trim()}" is not an EIA dielectric code such as C0G, X7R, X5R or Y5V.`);
  if (!(p.c > 0)) errors.push('Enter a capacitance greater than 0.');

  const properties = (
    <>
      <Section title="Read a marking">
        <TextField label="Code on the part" value={p.code} onChange={(v) => set({ code: v })} invalid={!!p.code.trim() && !cap} placeholder="104K, 2A473J, 4n7" />
        <TextField label="Dielectric" value={p.diel} onChange={(v) => set({ diel: v })} invalid={!!p.diel.trim() && !diel} placeholder="X7R, C0G" />
      </Section>
      <Section title="Find the code">
        <SiField label="Capacitance" symbol="C" value={p.c} onChange={(v) => set({ c: v })} unit="F" prefixes={['p', 'n', 'µ']} digits={6} />
      </Section>
    </>
  );

  return (
    <ToolPage
      title="Capacitor Code Calculator"
      description="Decode capacitor markings: 3-digit codes such as 104, tolerance letters, voltage codes such as 2A and 1H, and ceramic dielectric codes such as X7R and C0G, or find the code for a value."
      onReset={reset}
      properties={properties}
      status={cap ? `${p.code.trim()} = ${si(cap.farads, 'F', 4)}${cap.tolerance ? ` ${cap.tolerance.text}` : ''}${cap.voltage ? `, ${cap.voltage.volts} V` : ''}` : 'Enter a marking'}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      {cap && (
        <Panel title={`Marking ${p.code.trim()}`}>
          <div className="flex flex-wrap gap-8 px-3 py-3">
            <Big label="Capacitance" value={split(cap.farads).num} unit={split(cap.farads).unit} />
            {cap.tolerance && <Big label="Tolerance" value={cap.tolerance.text.replace(/\s?(%|pF)$/, '')} unit={cap.tolerance.text.endsWith('pF') ? 'pF' : '%'} />}
            {cap.voltage && <Big label="Rated voltage" value={String(cap.voltage.volts)} unit="V DC" />}
          </div>
          <table className="tbl">
            <tbody>
              <Result label="Value code" value={cap.valueCode} sub={cap.detail} />
              <Result label="In other units" value={`${si(cap.farads, 'F', 4)} = ${Number((cap.farads * 1e12).toPrecision(6))} pF = ${Number((cap.farads * 1e9).toPrecision(6))} nF = ${Number((cap.farads * 1e6).toPrecision(6))} µF`} />
              {cap.tolerance && <Result label="Tolerance letter" value={cap.tolerance.letter} sub={cap.tolerance.text} />}
              {cap.voltage && <Result label="Voltage code" value={cap.voltage.code} sub={`${cap.voltage.volts} V DC rating`} />}
            </tbody>
          </table>
        </Panel>
      )}
      {diel && (
        <Panel title={`Dielectric ${p.diel.trim().toUpperCase()}`} className="mt-3">
          <table className="tbl">
            <tbody>
              {diel.cls === 2 ? (
                <>
                  <Result label="Class" value="2 (high permittivity)" sub="capacitance also falls with DC bias and ageing" />
                  <Result label="Temperature range" value={`${diel.low} °C to +${diel.high} °C`} />
                  <Result label="Capacitance change over that range" value={diel.change} strong />
                </>
              ) : (
                <>
                  <Result label="Class" value="1 (temperature-stable)" sub="no DC-bias or ageing loss" />
                  <Result label="Temperature coefficient" value={`${diel.tempco} ±${diel.tol} ppm/K`} strong />
                </>
              )}
            </tbody>
          </table>
        </Panel>
      )}
      {p.c > 0 && (
        <Panel title={`Codes for ${si(p.c, 'F', 6)}`} className="mt-3">
          <table className="tbl">
            <tbody>
              <Result label="3-digit code" value={code ?? '—'} sub={code ? 'two digits and a multiplier, in pF' : 'needs more than two significant digits, or outside 0.1 pF to 99 µF'} strong />
              <Result label="RKM code" value={rkm(p.c)} sub="as printed on film capacitors" />
            </tbody>
          </table>
        </Panel>
      )}
      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <Panel title="Tolerance letters">
          <table className="tbl">
            <tbody>
              {Object.entries(CAP_TOLERANCES).map(([l, t]) => (
                <tr key={l}>
                  <td>{l}</td>
                  <td className="v">
                    {t.text}
                    {t.smallPf ? ` (${t.smallPf} below 10 pF)` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Voltage codes">
          <div className="grid grid-cols-3 gap-x-4 px-3 py-2 sm:grid-cols-4">
            {Object.entries(CAP_VOLTAGE_CODES).map(([c, v]) => (
              <span key={c}>
                <span className="font-semibold">{c}</span> <span className="text-muted">{v >= 1000 ? `${v / 1000} kV` : `${v} V`}</span>
              </span>
            ))}
          </div>
        </Panel>
      </div>
    </ToolPage>
  );
}

export function Method() {
  return (
    <>
      <h2>3-digit value code</h2>
      <p>
        The value is in picofarads: two significant digits and a power of ten. 104 = 10 × 10⁴ pF = 100 nF, 472 = 4.7 nF, 105 = 1 µF. A third digit of 9 multiplies by 0.1 and 8 by 0.01, so 479 =
        4.7 pF; 7 is not used. A one- or two-digit number is the value in pF (47 = 47 pF).
      </p>
      <div className="eq">
        <span className="no">(1)</span>
        <i>C</i> = (first two digits) × 10<sup>third digit</sup> pF
      </div>
      <h2>RKM notation</h2>
      <p>The letter replaces the decimal point and gives the unit: 4n7 = 4.7 nF, 2p2 = 2.2 pF, 100n = 100 nF, u47 = 0.47 µF. On small ceramic parts R is the decimal point in pF: 4R7 = 4.7 pF.</p>
      <h2>Tolerance and voltage</h2>
      <p>
        A letter after the value gives the tolerance: J = ±5 %, K = ±10 %, M = ±20 %, Z = +80 / −20 %. Below 10 pF, B, C and D are absolute: ±0.1, ±0.25 and ±0.5 pF. A two-character voltage code
        may come first: its digit is the decade and its letter the mantissa, so 1H = 50 V, 2A = 100 V and 2J = 630 V. 2A104J is therefore 100 nF, ±5 %, 100 V.
      </p>
      <p>Surface-mount ceramic capacitors are usually not marked at all; their value is only on the reel label.</p>
      <h2>Dielectric codes (EIA-198)</h2>
      <p>
        Class 2 codes give the temperature range and the capacitance change over it: X7R is −55 to +125 °C with ±15 %. The first letter is the low temperature (X = −55, Y = −30, Z = +10 °C), the digit
        the high temperature (5 = +85, 6 = +105, 7 = +125 °C) and the last letter the change (R = ±15 %, S = ±22 %, V = +22 / −82 %). Class 2 capacitors also lose capacitance with DC bias, which the
        code does not show. Class 1 codes such as C0G (NP0) give a temperature coefficient: 0 ±30 ppm/K.
      </p>
      <h2>References</h2>
      <ol>
        <li>IEC 60062:2016, Marking codes for resistors and capacitors.</li>
        <li>EIA-198 (RS-198), Ceramic dielectric capacitors classes I, II, III and IV.</li>
      </ol>
    </>
  );
}
