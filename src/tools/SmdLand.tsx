import { Sources } from '../components/Sources';
import { ToolPage } from '../components/ToolPage';
import { Big, LenField, Notes, Panel, Result, Section } from '../components/ui';
import { smdLand } from '../lib/smdLand';
import { fmt, fromMm } from '../lib/units';
import { useSettings } from '../state/settings';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = {
  lengthMin: 1.5, lengthMax: 1.7, widthMin: 0.7, widthMax: 0.9,
  terminalMin: 0.3, terminalMax: 0.5,
  toe: 0.15, heel: 0.05, side: 0.05,
  fabrication: 0.1, placement: 0.1, courtyard: 0.25, maskExpansion: 0.05,
};

export default function SmdLand() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const { unit } = useSettings();
  const r = smdLand(p);
  const L = (mm: number) => `${fmt(fromMm(mm, unit), 4)} ${unit}`;
  const errors: string[] = [];
  if (!(p.lengthMin > 0 && p.lengthMax >= p.lengthMin)) errors.push('Body length maximum must be at least its positive minimum.');
  if (!(p.widthMin > 0 && p.widthMax >= p.widthMin)) errors.push('Body width maximum must be at least its positive minimum.');
  if (!(p.terminalMin > 0 && p.terminalMax >= p.terminalMin && 2 * p.terminalMax < p.lengthMin)) errors.push('Termination lengths must be positive and leave a gap between the two terminals.');
  if (Object.values(p).some((v) => !Number.isFinite(v) || v < 0)) errors.push('All dimensions and allowances must be finite and non-negative.');
  if (!errors.length && !r) errors.push('These dimensions leave no valid copper gap. Check the part limits and solder-joint goals.');
  const notes = [
    'Example dimensions are illustrative. Enter the limits from the exact part datasheet; a package code alone does not define the terminal geometry.',
  ];
  if (r && r.maskWeb < 0.1) notes.push(`The nominal solder-mask web between pads is ${L(r.maskWeb)}. Ask your fabricator whether it can be retained; a gang opening may be needed.`);

  const properties = <>
    <Section title="Component dimensions (datasheet limits)">
      <LenField label="Body length, min" value={p.lengthMin} onChange={(v) => set({ lengthMin: v })} />
      <LenField label="Body length, max" value={p.lengthMax} onChange={(v) => set({ lengthMax: v })} />
      <LenField label="Body width, min" value={p.widthMin} onChange={(v) => set({ widthMin: v })} />
      <LenField label="Body width, max" value={p.widthMax} onChange={(v) => set({ widthMax: v })} />
      <LenField label="End terminal, min" value={p.terminalMin} onChange={(v) => set({ terminalMin: v })} hint="Length of each wraparound termination along the body, not its width." />
      <LenField label="End terminal, max" value={p.terminalMax} onChange={(v) => set({ terminalMax: v })} />
    </Section>
    <Section title="Solder-joint goals">
      <LenField label="Toe extension" value={p.toe} onChange={(v) => set({ toe: v })} allowZero />
      <LenField label="Heel extension" value={p.heel} onChange={(v) => set({ heel: v })} allowZero />
      <LenField label="Side extension" value={p.side} onChange={(v) => set({ side: v })} allowZero />
    </Section>
    <Section title="Process allowances">
      <LenField label="Fabrication tolerance" value={p.fabrication} onChange={(v) => set({ fabrication: v })} allowZero hint="Total dimensional variation, e.g. 0.10 mm for ±0.05 mm." />
      <LenField label="Placement tolerance" value={p.placement} onChange={(v) => set({ placement: v })} allowZero hint="Total positional allowance used in the RSS calculation." />
      <LenField label="Courtyard excess" value={p.courtyard} onChange={(v) => set({ courtyard: v })} allowZero hint="On every side of the larger of the body and copper outline." />
      <LenField label="Mask expansion" value={p.maskExpansion} onChange={(v) => set({ maskExpansion: v })} allowZero hint="On every side of each copper pad; paste starts at 1:1 copper." />
    </Section>
  </>;

  return <ToolPage
    title="Two-Terminal SMD Land Pattern Calculator"
    description="Calculate a first-pass resistor or MLCC footprint from the exact component's body and termination limits: two copper pads, centre pitch, courtyard and solder-mask openings."
    onReset={reset}
    properties={properties}
    status={r ? `Two ${L(r.padLength)} × ${L(r.padWidth)} pads · ${L(r.pitch)} centre pitch` : 'Check the inputs'}
    method={<Method />}
  >
    <Notes kind="error" items={errors} />
    <Notes items={notes} />
    {r && <div className="grid gap-3 xl:grid-cols-2">
      <Panel title="Copper land pattern">
        <div className="flex flex-wrap gap-8 px-2.5 py-2">
          <Big label="Each pad" value={`${fmt(fromMm(r.padLength, unit), 4)} × ${fmt(fromMm(r.padWidth, unit), 4)}`} unit={unit} />
          <Big label="Pad centre pitch" value={fmt(fromMm(r.pitch, unit), 4)} unit={unit} />
        </div>
        <table className="tbl"><tbody>
          <Result label="Copper gap (inner edges)" value={L(r.gap)} />
          <Result label="Overall copper length" value={L(r.outer)} />
          <Result label="Courtyard length × width" value={`${L(r.courtyardLength)} × ${L(r.courtyardWidth)}`} />
          <Result label="Mask opening per pad" value={`${L(r.maskOpeningLength)} × ${L(r.maskOpeningWidth)}`} />
          <Result label="Nominal mask web" value={L(r.maskWeb)} />
          <Result label="Paste aperture starting point" value={`${L(r.padLength)} × ${L(r.padWidth)}`} sub="1:1 with copper; confirm stencil reduction with assembler" />
        </tbody></table>
      </Panel>
      <Panel title="Top-view geometry">
        <LandDrawing outer={r.outer} gap={r.gap} width={r.padWidth} bodyLength={p.lengthMax} bodyWidth={p.widthMax} courtyardLength={r.courtyardLength} courtyardWidth={r.courtyardWidth} />
        <p className="px-2.5 py-2 text-muted">Outline: maximum body. Dashed rectangle: courtyard. Blue shapes: copper pads. Review the exact manufacturer's land recommendation before releasing the footprint.</p>
      </Panel>
    </div>}
  </ToolPage>;
}

function LandDrawing({ outer, gap, width, bodyLength, bodyWidth, courtyardLength, courtyardWidth }: {
  outer: number; gap: number; width: number; bodyLength: number; bodyWidth: number; courtyardLength: number; courtyardWidth: number;
}) {
  const scale = 220 / Math.max(courtyardLength, courtyardWidth, 0.1);
  const cx = 150;
  const cy = 82;
  const padLength = (outer - gap) / 2;
  const rect = (x: number, y: number, w: number, h: number) => ({ x: cx + x * scale, y: cy + y * scale, width: w * scale, height: h * scale });
  return <svg viewBox="0 0 300 164" className="mx-auto block w-full max-w-[420px]" role="img" aria-label="Top view of two copper pads, component body and courtyard">
    <rect {...rect(-courtyardLength / 2, -courtyardWidth / 2, courtyardLength, courtyardWidth)} fill="none" stroke="var(--muted)" strokeDasharray="4 3" />
    <rect {...rect(-outer / 2, -width / 2, padLength, width)} fill="var(--accent)" opacity="0.85" />
    <rect {...rect(gap / 2, -width / 2, padLength, width)} fill="var(--accent)" opacity="0.85" />
    <rect {...rect(-bodyLength / 2, -bodyWidth / 2, bodyLength, bodyWidth)} fill="none" stroke="var(--ink)" strokeWidth="1.5" />
    <text x="150" y="155" textAnchor="middle" fill="var(--muted)" fontSize="10">Top view · centred component</text>
  </svg>;
}

export function Method() {
  return <>
    <h2>How the land is calculated</h2>
    <p>This is a first-pass, two-terminal chip geometry using the Z/G/X land dimensions described by IPC-7351 and IPC-7352. It is not an IPC-certified footprint or a substitute for an exact part's recommended pattern. Enter minimum and maximum body length L and width W, and each end termination length T from the same datasheet.</p>
    <p>The estimated inner termination spacing ranges from Smin = Lmin − 2Tmax to Smax = Lmax − 2Tmin. Independent component limits are combined conservatively. With fabrication allowance F, placement allowance P, and chosen toe, heel and side extensions JT, JH and JS:</p>
    <div className="eq">Z = Lmin + 2JT + √[(Lmax − Lmin)² + F² + P²]</div>
    <div className="eq">G = Smax − 2JH − √[(Smax − Smin)² + F² + P²]</div>
    <div className="eq">X = Wmin + 2JS + √[(Wmax − Wmin)² + F² + P²]</div>
    <p>Each copper pad is (Z − G)/2 long and X wide, with centre pitch (Z + G)/2. The courtyard encloses whichever is larger, the maximum body or copper envelope, with the entered excess on each side. Solder-mask openings expand each pad by the entered amount. Paste starts at 1:1 copper; the assembly process may require a different stencil aperture.</p>
    <p>These root-sum-square allowances are design assumptions, not universal factory capabilities or joint goals. MLCC stress, tombstoning, solder volume, hand versus reflow assembly, and high-frequency pad discontinuities can change the pattern. Prefer the component manufacturer's recommended land and the assembler's stencil rules when available.</p>
    <Sources items={[
      { title: 'IPC-7351, Generic Requirements for Surface Mount Design and Land Pattern Standard', note: 'Component geometry, mounting conditions, tolerances and solder joints.', url: 'https://www.ipc.org/TOC/IPC-7351.pdf' },
      { title: 'IPC-7352 (2023), Generic Guideline for Land Pattern Design', note: 'Component tolerancing, solder-joint analysis and courtyard determination.', url: 'https://www.ipc.org/TOC/IPC-7352-TOC.pdf' },
      { title: 'Murata, MLCC mounting methods', note: 'Land symmetry and solder volume affect mounting reliability.', url: 'https://article.murata.com/en-eu/article/basics-of-capacitors-6' },
    ]} />
  </>;
}
