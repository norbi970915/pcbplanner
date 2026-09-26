import { SiField } from '../components/SiField';
import { ToolPage } from '../components/ToolPage';
import { Big, Notes, Panel, Result, Section, Segmented, SelectField } from '../components/ui';
import { bandsFor, COLORS, DIGIT_COLORS, MULT_COLORS, readBands, TCR_COLORS, TOL_COLORS, type BandColor } from '../lib/componentCodes';
import { eNearest } from '../lib/electronics';
import { si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

// Band roles rather than positions, so switching between 4, 5 and 6 bands keeps each colour's meaning.
const DEFAULTS = { mode: 'read', n: 4, d1: 'yellow', d2: 'violet', d3: 'black', mult: 'red', tol: 'gold', tcr: 'brown', r: 4700 };

const label = (c: BandColor) => c[0].toUpperCase() + c.slice(1);
const expText = (e: number) => (e >= 0 ? `×${si(10 ** e, '', 3).trim()}` : `×${10 ** e}`);

export default function ResistorColorCode() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const n = p.n === 5 || p.n === 6 ? p.n : 4;
  const digits = n === 4 ? 2 : 3;
  const read = p.mode !== 'find';

  // "find" mode: the colours for a value; "read" mode: the value of the chosen colours
  const found = read ? null : bandsFor(p.r, digits);
  const bands: BandColor[] = read
    ? ([p.d1, p.d2, ...(n > 4 ? [p.d3] : []), p.mult, p.tol, ...(n === 6 ? [p.tcr] : [])] as BandColor[])
    : found
      ? [...found.colors, p.tol as BandColor, ...(n === 6 ? [p.tcr as BandColor] : [])]
      : [];
  const r = bands.length ? readBands(bands) : null;

  const errors: string[] = [];
  if (read && !r) errors.push('Those colours do not form a valid code: gold, silver and pink are multipliers or tolerances, never digits.');
  if (!read && !(p.r > 0)) errors.push('Enter a resistance greater than 0.');
  else if (!read && !found) errors.push('The value is outside the range the colour code can mark (0.001 Ω to 99.9 GΩ).');
  const notes: string[] = [];
  if (!read && found && !found.exact) notes.push(`${si(p.r, 'Ω', 6)} needs more than ${digits} significant digits; the bands show ${si(found.ohms, 'Ω', 4)}.${digits === 2 ? ' Use 5 bands for 3 digits.' : ''}`);
  if (r && r.ohms === 0) notes.push('A single black band marks a zero-ohm jumper.');

  const switchBands = (next: number) => {
    // keep the value when the new band count can show it
    const b = r ? bandsFor(r.ohms, next === 4 ? 2 : 3) : null;
    if (read && b?.exact) {
      const [a, bb, c, d] = b.colors;
      set(next === 4 ? { n: next, d1: a, d2: bb, mult: c } : { n: next, d1: a, d2: bb, d3: c, mult: d });
    } else set({ n: next });
  };

  const colorSelect = (key: 'd1' | 'd2' | 'd3' | 'mult' | 'tol' | 'tcr', title: string, options: BandColor[], describe: (c: BandColor) => string) => (
    <SelectField
      label={title}
      value={p[key]}
      onChange={(v) => set({ [key]: v })}
      options={options.map((c) => ({ value: c, label: `${label(c)} – ${describe(c)}` }))}
      width={170}
    />
  );

  const properties = (
    <>
      <Section title="Resistor">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <span className="text-muted">Calculate</span>
          <Segmented
            label="Calculate"
            value={read ? 'read' : 'find'}
            onChange={(v) => set({ mode: v })}
            options={[
              { value: 'read', label: 'Value' },
              { value: 'find', label: 'Colours' },
            ]}
          />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <span className="text-muted">Bands</span>
          <Segmented
            label="Number of bands"
            value={String(n) as '4' | '5' | '6'}
            onChange={(v) => switchBands(Number(v))}
            options={[
              { value: '4', label: '4' },
              { value: '5', label: '5' },
              { value: '6', label: '6' },
            ]}
          />
        </div>
      </Section>
      {read ? (
        <Section title="Band colours">
          {colorSelect('d1', '1st digit', DIGIT_COLORS, (c) => String(COLORS[c].digit))}
          {colorSelect('d2', '2nd digit', DIGIT_COLORS, (c) => String(COLORS[c].digit))}
          {n > 4 && colorSelect('d3', '3rd digit', DIGIT_COLORS, (c) => String(COLORS[c].digit))}
          {colorSelect('mult', 'Multiplier', MULT_COLORS, (c) => expText(COLORS[c].exp!))}
          {colorSelect('tol', 'Tolerance', TOL_COLORS, (c) => `±${COLORS[c].tol} %`)}
          {n === 6 && colorSelect('tcr', 'Temp. coefficient', TCR_COLORS, (c) => `${COLORS[c].tcr} ppm/K`)}
        </Section>
      ) : (
        <Section title="Value">
          <SiField label="Resistance" symbol="R" value={p.r} onChange={(v) => set({ r: v })} unit="Ω" prefixes={['m', '', 'k', 'M', 'G']} digits={6} />
          {colorSelect('tol', 'Tolerance', TOL_COLORS, (c) => `±${COLORS[c].tol} %`)}
          {n === 6 && colorSelect('tcr', 'Temp. coefficient', TCR_COLORS, (c) => `${COLORS[c].tcr} ppm/K`)}
        </Section>
      )}
    </>
  );

  return (
    <ToolPage
      title="Resistor Color Code Calculator"
      description="Read the value, tolerance and temperature coefficient of a 4-, 5- or 6-band resistor from its colours, or find the bands for a value, using the IEC 60062 colour code."
      onReset={reset}
      properties={properties}
      status={r ? `${si(r.ohms, 'Ω', 4)} ±${r.tol} %${r.tcr ? `, ${r.tcr} ppm/K` : ''}` : 'Check the colours'}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      <Notes items={notes} />
      {r && (
        <Panel title={`${n}-band resistor`}>
          <div className="px-3 pt-3">
            <ResistorDrawing bands={bands} n={n} />
          </div>
          <div className="flex flex-wrap gap-8 px-3 py-3">
            <Big label="Resistance" value={si(r.ohms, 'Ω', 4).split(' ')[0]} unit={si(r.ohms, 'Ω', 4).split(' ')[1]} />
            <Big label="Tolerance" value={`±${r.tol}`} unit="%" />
            {r.tcr !== undefined && <Big label="Temperature coefficient" value={String(r.tcr)} unit="ppm/K" />}
          </div>
          <table className="tbl">
            <tbody>
              <Result label="Bands, left to right" value={bands.map(label).join(', ')} />
              <Result label="Range with tolerance" value={`${si(r.ohms * (1 - r.tol / 100), 'Ω', 5)} to ${si(r.ohms * (1 + r.tol / 100), 'Ω', 5)}`} />
              <Result label="Tolerance letter" value={r.tolLetter} sub="as printed on SMD and datasheet part numbers (IEC 60062)" />
              {r.ohms > 0 && (
                <Result
                  label="Preferred-value series"
                  value={(['E12', 'E24', 'E96'] as const).filter((s) => Math.abs(eNearest(r.ohms, s) / r.ohms - 1) < 1e-9).join(', ') || 'not a standard value'}
                  sub="IEC 60063 series that contain this value"
                />
              )}
            </tbody>
          </table>
        </Panel>
      )}
      <Panel title="Colour code (IEC 60062:2016)" className="mt-3">
        <table className="tbl">
          <thead>
            <tr>
              <th>Colour</th>
              <th className="v">Digit</th>
              <th className="v">Multiplier</th>
              <th className="v">Tolerance</th>
              <th className="v">Temp. coefficient</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(COLORS) as BandColor[]).map((c) => {
              const d = COLORS[c];
              return (
                <tr key={c}>
                  <td>
                    <span className="mr-2 inline-block h-[10px] w-[18px] border border-line align-middle" style={{ background: d.hex }} />
                    {c === 'none' ? 'None (no band)' : label(c)}
                  </td>
                  <td className="v">{d.digit ?? '—'}</td>
                  <td className="v">{d.exp !== undefined ? expText(d.exp) : '—'}</td>
                  <td className="v">{d.tol !== undefined ? `±${d.tol} % (${d.tolLetter})` : '—'}</td>
                  <td className="v">{d.tcr !== undefined ? `${d.tcr} ppm/K` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </ToolPage>
  );
}

/** Through-hole resistor with its bands; the tolerance band stands apart on the right. */
function ResistorDrawing({ bands, n }: { bands: BandColor[]; n: number }) {
  const W = 420, H = 90, x0 = 110, x1 = 310;
  const valueBands = n === 4 ? 3 : 4;
  const xs = bands.map((_, i) => (i < valueBands ? x0 + 26 + i * 26 : x0 + 26 + valueBands * 26 + 20 + (i - valueBands) * 26));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block h-auto w-full max-w-[420px]" role="img" aria-label={`Resistor with bands ${bands.join(', ')}`}>
      <line x1={10} y1={H / 2} x2={W - 10} y2={H / 2} stroke="var(--muted)" strokeWidth={4} strokeLinecap="round" />
      <rect x={x0} y={18} width={x1 - x0} height={H - 36} rx={20} fill="#d9c3a0" stroke="#a88c62" />
      {bands.map((c, i) =>
        c === 'none' ? null : <rect key={i} x={xs[i]} y={18.5} width={14} height={H - 37} fill={COLORS[c].hex} stroke={c === 'white' || c === 'silver' ? '#999' : 'none'} />,
      )}
    </svg>
  );
}

export function Method() {
  return (
    <>
      <h2>Reading the bands</h2>
      <p>
        Hold the resistor with the tolerance band on the right. That band usually stands a little apart from the others, and gold or silver never appears on the left: they are only multipliers or
        tolerances.
      </p>
      <ul>
        <li>
          <b>4 bands:</b> two digits, multiplier, tolerance. Yellow, violet, red, gold = 47 × 100 Ω = 4.7 kΩ ±5 %.
        </li>
        <li>
          <b>5 bands:</b> three digits, multiplier, tolerance, used for 1 % and better parts. Brown, black, black, brown, brown = 100 × 10 Ω = 1 kΩ ±1 %.
        </li>
        <li>
          <b>6 bands:</b> as 5 bands plus the temperature coefficient (TCR) in ppm/K.
        </li>
        <li>
          <b>3 bands:</b> a 4-band code with no tolerance band, which means ±20 %.
        </li>
      </ul>
      <div className="eq">
        <span className="no">(1)</span>
        <i>R</i> = (digits) × 10<sup>multiplier</sup> Ω
      </div>
      <p>
        Gold multiplies by 0.1, silver by 0.01 and pink by 0.001. A single black band marks a zero-ohm link. The colours follow IEC 60062:2016. Before that edition some manufacturers used grey for
        ±0.05 %; the standard now assigns grey to ±0.01 %.
      </p>
      <h2>Finding the colours for a value</h2>
      <p>
        The value is rounded to two significant digits for 4 bands or three for 5 and 6 bands. Values from the E12 and E24 series fit in two digits; E96 values need three. The result lists the
        IEC 60063 series that contain the value.
      </p>
      <h2>References</h2>
      <ol>
        <li>IEC 60062:2016, Marking codes for resistors and capacitors.</li>
        <li>IEC 60063:2015, Preferred number series for resistors and capacitors.</li>
      </ol>
    </>
  );
}
