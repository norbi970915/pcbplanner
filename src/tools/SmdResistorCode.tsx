import { SiField } from '../components/SiField';
import { ToolPage } from '../components/ToolPage';
import { Big, Notes, Panel, Result, Section, TextField } from '../components/ui';
import { EIA96_LETTERS, eia96Code, readSmd, smdCode, type SmdKind } from '../lib/componentCodes';
import { E_SERIES } from '../lib/electronics';
import { si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { code: '472', r: 4700 };

// Typical tolerances of each marking style; the datasheet is the authority.
const USUAL_TOL: Record<SmdKind, string> = {
  '3-digit': 'usually ±5 % (E24 values)',
  '4-digit': 'usually ±1 % or better',
  'EIA-96': '±1 % (E96 values)',
  'R decimal': 'low values; tolerance from the part number',
  milliohm: 'current-sense resistor; tolerance from the part number',
  jumper: 'zero-ohm link',
};

const split = (v: number) => {
  const [num, unit] = si(v, 'Ω', 4).split(' ');
  return { num, unit };
};

export default function SmdResistorCode() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const readings = readSmd(p.code);
  const main = readings[0];
  const codes = p.r >= 0 ? { three: smdCode(p.r, 2), four: smdCode(p.r, 3), eia: eia96Code(p.r) } : null;

  const errors: string[] = [];
  if (p.code.trim() && !main) errors.push(`"${p.code.trim()}" is not a resistor marking: use 3 digits (472), 4 digits (4701), EIA-96 (01C) or R notation (4R7).`);
  if (!(p.r >= 0)) errors.push('Enter a resistance of 0 or more.');

  const properties = (
    <>
      <Section title="Read a marking">
        <TextField label="Code on the part" value={p.code} onChange={(v) => set({ code: v })} invalid={!!p.code.trim() && !main} placeholder="472, 4701, 01C, 4R7" />
      </Section>
      <Section title="Find the code">
        <SiField label="Resistance" symbol="R" value={p.r} onChange={(v) => set({ r: v })} unit="Ω" prefixes={['m', '', 'k', 'M']} digits={6} allowZero />
      </Section>
    </>
  );

  return (
    <ToolPage
      title="SMD Resistor Code Calculator"
      description="Decode SMD resistor markings: 3-digit and 4-digit codes, EIA-96 codes for 1 % parts, R and m decimal notation, and find the code for any value."
      onReset={reset}
      properties={properties}
      status={main ? `${p.code.trim()} = ${si(main.ohms, 'Ω', 4)}` : 'Enter a marking'}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      {main && (
        <Panel title={`Marking ${p.code.trim()}`}>
          <div className="flex flex-wrap gap-8 px-3 py-3">
            <Big label="Resistance" value={split(main.ohms).num} unit={split(main.ohms).unit} />
          </div>
          <table className="tbl">
            <tbody>
              <Result label="Code type" value={main.kind} sub={main.detail} />
              <Result label="Tolerance" value={USUAL_TOL[main.kind]} />
              {readings.slice(1).map((alt) => (
                <Result key={alt.kind} label="Could also be" value={si(alt.ohms, 'Ω', 4)} sub={`${alt.kind}: ${alt.detail}. Check the part's size and the other markings on the board.`} />
              ))}
            </tbody>
          </table>
        </Panel>
      )}
      {codes && (
        <Panel title={`Codes for ${si(p.r, 'Ω', 6)}`} className="mt-3">
          <table className="tbl">
            <tbody>
              <Result label="3-digit code" value={codes.three ?? '—'} sub={codes.three ? 'two significant digits' : 'needs more than two significant digits'} strong />
              <Result label="4-digit code" value={codes.four ?? '—'} sub={codes.four ? 'three significant digits' : 'needs more than three significant digits'} strong />
              <Result label="EIA-96 code" value={codes.eia ?? '—'} sub={codes.eia ? 'E96 index and multiplier letter' : 'only E96 values have an EIA-96 code'} strong />
            </tbody>
          </table>
        </Panel>
      )}
      <Panel title="EIA-96 codes" className="mt-3">
        <div className="grid grid-cols-4 gap-x-4 px-3 py-2 font-mono text-[12px] sm:grid-cols-6 lg:grid-cols-8">
          {E_SERIES.E96.map((v, i) => (
            <span key={v}>
              <span className="text-muted">{String(i + 1).padStart(2, '0')}</span> {v}
            </span>
          ))}
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Letter</th>
              <th className="v">Multiplier</th>
              <th className="v">Example</th>
            </tr>
          </thead>
          <tbody>
            {['Z', 'Y or R', 'X or S', 'A', 'B or H', 'C', 'D', 'E', 'F'].map((l) => {
              const mult = EIA96_LETTERS[l[0]];
              return (
                <tr key={l}>
                  <td>{l}</td>
                  <td className="v">×{mult}</td>
                  <td className="v">
                    01{l[0]} = {si(100 * mult, 'Ω', 3)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </ToolPage>
  );
}

export function Method() {
  return (
    <>
      <h2>3-digit and 4-digit codes</h2>
      <p>
        The last digit is the power of ten and the digits before it are the significant figures. 472 is 47 × 10² = 4.7 kΩ and 4701 is 470 × 10¹ = 4.7 kΩ. A 3-digit code usually marks a ±5 % part
        and a 4-digit code a ±1 % part, but the tolerance is not part of the code. 000 or 0 is a zero-ohm jumper.
      </p>
      <h2>R and m notation</h2>
      <p>Below 10 Ω (3-digit) or 100 Ω (4-digit) the letter R marks the decimal point: 4R7 = 4.7 Ω, R10 = 0.1 Ω, 47R5 = 47.5 Ω. Current-sense resistors often use a lower-case m for milliohms: 5m0 = 5.0 mΩ.</p>
      <h2>EIA-96</h2>
      <p>
        Small 1 % resistors (0603 and below) cannot fit four digits, so they use EIA-96: two digits give the position of the value in the E96 series (01 = 100, 02 = 102 … 96 = 976) and a letter gives
        the multiplier. 01C = 100 × 100 = 10 kΩ; 68X = 499 × 0.1 = 49.9 Ω.
      </p>
      <div className="eq">
        <span className="no">(1)</span>
        <i>R</i> = E96[code] × multiplier(letter)
      </div>
      <p>
        R and S are alternatives for Y and X, and H for B. That makes a code such as 10R ambiguous: EIA-96 reads it as 124 × 0.01 = 1.24 Ω, while R notation reads 10 Ω. The calculator shows both;
        the part's size and the other resistors on the board usually decide.
      </p>
      <h2>References</h2>
      <ol>
        <li>IEC 60062:2016, Marking codes for resistors and capacitors.</li>
        <li>EIA-96 marking code for 1 % surface-mount resistors, with the E96 series of IEC 60063.</li>
      </ol>
    </>
  );
}
