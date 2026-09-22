import { useMemo, useState } from 'react';
import { CrossSection } from '../components/CrossSection';
import { FieldMap } from '../components/FieldMap';
import { ToolPage } from '../components/ToolPage';
import { Big, Check, LenField, Notes, NumField, Panel, Result, Section, Segmented, SelectField } from '../components/ui';
import { StackupPicker } from '../components/StackupPicker';
import { microstripHJ, striplineAsym, striplineWheeler } from '../lib/closedform';
import type { Accuracy, Geometry } from '../lib/fieldsolver';
import { delayPsPerMm, lineLC, nextCoefficient } from '../lib/signal';
import { runSolver, useFieldSolve } from '../lib/solverClient';
import { geometryForLayer, type Stackup } from '../lib/stackups';
import { fmt, fromMm } from '../lib/units';
import { LAMINATES, laminateById } from '../data/laminates';
import { djordjevicSarkar } from '../lib/dielectric';
import { useSettings } from '../state/settings';
import { useUrlState } from '../state/useUrlState';

type LineType = 'microstrip' | 'embedded' | 'stripline';

const DEFAULTS = {
  type: 'microstrip',
  mode: 'se',
  mask: true,
  cpw: false,
  w: 0.15,
  etch: 0.0127,
  t: 0.035,
  h: 0.1,
  er: 4.1,
  h2: 0.1,
  er2: 4.1,
  c1: 0.0305,
  c2: 0.0152,
  erm: 3.8,
  s: 0.15,
  gap: 0.2,
  acc: 'normal',
  target: 50,
  mat: 'custom',
  mat2: 'custom',
  fq: 1,
};

/** εr from the material library at the design frequency, or the entered value. */
function erOf(mat: string, er: number, fGHz: number): number {
  const l = mat !== 'custom' ? laminateById(mat) : undefined;
  return l ? +djordjevicSarkar({ dk: l.dk, df: l.df, f0: l.fGHz * 1e9 }).dk(fGHz * 1e9).toFixed(4) : er;
}

const MAT_OPTIONS = [{ value: 'custom', label: 'Custom εr', group: 'Custom' }, ...LAMINATES.map((l) => ({ value: l.id, label: `${l.vendor} ${l.name}`, group: l.cls }))];

function buildGeometry(p: typeof DEFAULTS): { geom: Geometry | null; errors: string[] } {
  const errors: string[] = [];
  const type = p.type as LineType;
  const diff = p.mode === 'diff';
  const pos = (v: number, name: string) => {
    if (!(v > 0)) errors.push(`${name} must be greater than 0.`);
  };
  pos(p.w, 'Width W');
  pos(p.t, 'Thickness T');
  pos(p.h, 'Height H');
  if (!(p.er >= 1)) errors.push('εr must be at least 1.');
  if (type !== 'microstrip') {
    pos(p.h2, 'Height H2');
    if (!(p.er2 >= 1)) errors.push('Upper εr must be at least 1.');
  }
  if (diff) pos(p.s, 'Spacing S');
  if (p.cpw) pos(p.gap, 'Coplanar gap G');
  if (p.etch < 0 || p.etch >= p.w) errors.push('Etch must be between 0 and the trace width.');
  if (type === 'microstrip' && p.mask) {
    if (!(p.c1 >= 0 && p.c2 >= 0)) errors.push('Mask thickness cannot be negative.');
    if (!(p.erm >= 1)) errors.push('Mask εr must be at least 1.');
  }
  if (errors.length) return { geom: null, errors };

  const g: Geometry = {
    w: p.w,
    wTop: p.etch > 0 ? p.w - p.etch : undefined,
    t: p.t,
    yTrace: p.h,
    diff,
    s: diff ? p.s : undefined,
    coplanarGap: p.cpw ? p.gap : undefined,
    slabs: [{ y0: 0, y1: p.h, er: p.er }],
  };
  if (type === 'microstrip') {
    if (p.mask && (p.c1 > 0 || p.c2 > 0)) g.mask = { surfaceY: p.h, overSubstrate: p.c1, overTrace: p.c2, er: p.erm };
  } else {
    g.slabs.push({ y0: p.h, y1: p.h + p.t + p.h2, er: p.er2 });
    if (type === 'stripline') g.topPlane = p.h + p.t + p.h2;
  }
  return { geom: g, errors };
}

export default function Impedance() {
  const [raw, set, reset] = useUrlState(DEFAULTS);
  // library materials replace the εr fields at the design frequency
  const p = useMemo(() => ({ ...raw, er: erOf(raw.mat, raw.er, raw.fq), er2: erOf(raw.mat2, raw.er2, raw.fq) }), [raw]);
  const usesLib = raw.mat !== 'custom' || (raw.type !== 'microstrip' && raw.mat2 !== 'custom');
  const { unit } = useSettings();
  const [stackNote, setStackNote] = useState<string | null>(null);
  const [solving, setSolving] = useState<null | 'w' | 's'>(null);
  const [solveErr, setSolveErr] = useState<string | null>(null);
  const [view, setView] = useState<'section' | 'field'>('section');

  const type = p.type as LineType;
  const diff = p.mode === 'diff';
  const acc = p.acc as Accuracy;
  const { geom, errors } = useMemo(() => buildGeometry(p), [p]);
  const solveState = useFieldSolve(geom, { accuracy: acc, field: true, even: true });
  const r = geom ? solveState.result : null;

  const z = r ? (diff ? r.zdiff : r.se?.z) : undefined;
  const eeff = r ? (diff ? r.odd?.eeff : r.se?.eeff) : undefined;
  const zLine = r ? (diff ? r.odd?.z : r.se?.z) : undefined;
  const lc = zLine && eeff ? lineLC(zLine, eeff) : null;

  // closed-form cross-check (single-ended, no coplanar ground)
  let cf: { z: number; name: string } | null = null;
  if (!diff && !p.cpw && geom) {
    const wAvg = p.w - p.etch / 2;
    if (type === 'microstrip' && !p.mask) cf = { z: microstripHJ(wAvg, p.h, p.t, p.er).z0, name: 'Hammerstad–Jensen' };
    if (type === 'stripline' && Math.abs(p.er - p.er2) < 1e-9) {
      cf =
        Math.abs(p.h - p.h2) < 1e-9
          ? { z: striplineWheeler(wAvg, 2 * p.h + p.t, p.t, p.er).z0, name: 'Wheeler' }
          : { z: striplineAsym(wAvg, p.h, p.h2, p.t, p.er).z0, name: 'Wheeler, offset approx.' };
    }
  }

  const applyLayer = (stack: Stackup, layerId: string) => {
    const g = layerId ? geometryForLayer(stack, layerId) : null;
    if (!g) {
      setStackNote('That layer has no reference plane marked in the stackup.');
      return;
    }
    set({
      type: g.type,
      h: g.h,
      er: g.er,
      mat: 'custom',
      t: g.t,
      ...(g.h2 !== undefined ? { h2: g.h2, er2: g.er2 ?? g.er, mat2: 'custom' } : {}),
      ...(g.type === 'microstrip' ? { mask: !!g.mask, ...(g.mask ? { c1: g.mask.c1, c2: g.mask.c2, erm: g.mask.er } : {}) } : {}),
    });
    setStackNote(g.note);
  };

  const solveFor = async (param: 'w' | 's') => {
    if (!geom) return;
    setSolving(param);
    setSolveErr(null);
    const res = await runSolver({ type: 'target', geom, opts: { accuracy: acc, field: false, even: false }, param, target: p.target });
    setSolving(null);
    if (res.ok && res.value) set(param === 'w' ? { w: res.value } : { s: res.value });
    else if (!res.ok) setSolveErr(res.error);
  };

  const toUnit = (mm: number) => fromMm(mm, unit);
  const busy = solveState.busy || solving !== null;
  const dev = z && p.target > 0 ? (100 * (z - p.target)) / p.target : null;

  const properties = (
    <>
      <Section title="Structure">
        <SelectField
          label="Line type"
          value={type}
          onChange={(v) => set({ type: v })}
          options={[
            { value: 'microstrip', label: 'Surface microstrip' },
            { value: 'embedded', label: 'Embedded microstrip' },
            { value: 'stripline', label: 'Stripline' },
          ]}
        />
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <span className="text-muted">Signal</span>
          <Segmented
            label="Signal type"
            value={p.mode as 'se' | 'diff'}
            onChange={(v) => set({ mode: v, target: v === 'diff' ? (p.target === 50 ? 100 : p.target) : [85, 90, 100].includes(p.target) ? 50 : p.target })}
            options={[
              { value: 'se', label: 'Single-ended' },
              { value: 'diff', label: 'Differential' },
            ]}
          />
        </div>
        <Check label="Coplanar ground on trace layer" checked={p.cpw} onChange={(v) => set({ cpw: v })} />
        {type === 'microstrip' && <Check label="Solder mask coating" checked={p.mask} onChange={(v) => set({ mask: v })} />}
      </Section>
      <Section title="Target">
        <NumField label={diff ? 'Target Zdiff' : 'Target Z0'} value={p.target} onChange={(v) => set({ target: v })} unit="Ω" />
        <div className="flex justify-end gap-1 pt-0.5">
          <button className="btn btn-primary" disabled={!geom || busy} onClick={() => solveFor('w')}>
            {solving === 'w' ? 'Solving…' : 'Solve Width'}
          </button>
          {diff && (
            <button className="btn" disabled={!geom || busy} onClick={() => solveFor('s')}>
              {solving === 's' ? 'Solving…' : 'Solve Spacing'}
            </button>
          )}
        </div>
      </Section>
      <Section title="Conductor">
        <LenField label="Width (bottom)" symbol="W" value={p.w} onChange={(v) => set({ w: v })} />
        <LenField label="Etch (W − top)" value={p.etch} onChange={(v) => set({ etch: v })} allowZero hint="Trapezoidal etch: the top of the trace is narrower by this amount. 0.5 mil is typical for 1 oz." />
        <LenField label="Thickness" symbol="T" value={p.t} onChange={(v) => set({ t: v })} units={['mm', 'mil', 'um', 'oz']} />
        {diff && <LenField label="Spacing" symbol="S" value={p.s} onChange={(v) => set({ s: v })} />}
        {p.cpw && <LenField label="Coplanar gap" symbol="G" value={p.gap} onChange={(v) => set({ gap: v })} />}
      </Section>
      <Section title={type === 'stripline' ? 'Dielectric Below' : 'Dielectric'}>
        <LenField label={type === 'stripline' ? 'Plane to trace' : 'Height to plane'} symbol="H" value={p.h} onChange={(v) => set({ h: v })} />
        <SelectField label="Material" value={raw.mat} onChange={(v) => set({ mat: v })} options={MAT_OPTIONS} width={176} />
        {raw.mat === 'custom' ? (
          <NumField label="Dielectric constant" symbol="εr" value={p.er} onChange={(v) => set({ er: v })} min={1} allowZero />
        ) : (
          <p className="text-faint">εr = {fmt(p.er, 4)} at {fmt(raw.fq, 4)} GHz</p>
        )}
      </Section>
      {type !== 'microstrip' && (
        <Section title={type === 'stripline' ? 'Dielectric Above' : 'Cover Dielectric'}>
          <LenField label={type === 'stripline' ? 'Trace to plane' : 'Cover thickness'} symbol="H2" value={p.h2} onChange={(v) => set({ h2: v })} />
          <SelectField label="Material" value={raw.mat2} onChange={(v) => set({ mat2: v })} options={MAT_OPTIONS} width={176} />
          {raw.mat2 === 'custom' ? (
            <NumField label="Dielectric constant" symbol="εr" value={p.er2} onChange={(v) => set({ er2: v })} min={1} allowZero />
          ) : (
            <p className="text-faint">εr = {fmt(p.er2, 4)} at {fmt(raw.fq, 4)} GHz</p>
          )}
        </Section>
      )}
      {usesLib && (
        <Section title="Material Library">
          <NumField label="Design frequency" value={raw.fq} onChange={(v) => set({ fq: v })} unit="GHz" hint="Laminate Dk falls slowly with frequency; use the frequency of your signal (Nyquist for digital links)." />
          <p className="text-faint">Datasheet Dk/Df, extended across frequency with the Djordjevic–Sarkar model. See the Trace Loss tool for the loss.</p>
        </Section>
      )}
      {type === 'microstrip' && p.mask && (
        <Section title="Solder Mask">
          <LenField label="Over laminate" symbol="C1" value={p.c1} onChange={(v) => set({ c1: v })} allowZero />
          <LenField label="Over trace" symbol="C2" value={p.c2} onChange={(v) => set({ c2: v })} allowZero />
          <NumField label="Mask εr" value={p.erm} onChange={(v) => set({ erm: v })} min={1} allowZero />
        </Section>
      )}
      <Section title="From Stackup">
        <StackupPicker onApply={applyLayer} />
        {stackNote && <p className="text-faint">{stackNote}</p>}
      </Section>
      <Section title="Solver" defaultOpen={false}>
        <SelectField
          label="Mesh accuracy"
          value={acc}
          onChange={(v) => set({ acc: v })}
          options={[
            { value: 'fast', label: 'Fast' },
            { value: 'normal', label: 'Normal' },
            { value: 'high', label: 'High' },
          ]}
        />
        <p className="text-faint">Normal agrees with a commercial 2D solver to within about 1 % on typical stackups. Use High to confirm a final design.</p>
      </Section>
    </>
  );

  const status = busy
    ? 'Solving…'
    : r
      ? `Field solver: ${r.nodes.toLocaleString()} nodes, ${acc} mesh · ${diff ? 'Zdiff' : 'Z0'} = ${z ? fmt(z, 4) : '—'} Ω`
      : errors.length
        ? 'Check the inputs'
        : 'Ready';

  return (
    <ToolPage
      title="Impedance Calculator"
      description="Characteristic and differential impedance of PCB traces from a 2D field solver: microstrip, solder-mask coated and embedded microstrip, stripline, coplanar waveguide. Solve for width or spacing from a target impedance."
      onReset={reset}
      properties={properties}
      status={status}
      method={<Method />}
    >
      <Notes kind="error" items={[...errors, ...(solveState.error && geom ? [solveState.error] : []), ...(solveErr ? [solveErr] : [])]} />
      <div className="grid gap-3 2xl:grid-cols-2">
        <Panel title="Results">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-2 px-2.5 pb-1 pt-2">
            <Big label={diff ? 'Differential impedance Zdiff' : 'Characteristic impedance Z0'} value={z ? fmt(z, 4) : '—'} unit="Ω" busy={busy} />
            <Big label="Effective εr" value={eeff ? fmt(eeff, 4) : '—'} unit="" busy={busy} />
          </div>
          <div className="px-2.5 pb-2">
            {dev !== null && Number.isFinite(dev) && (
              <span className={Math.abs(dev) <= 5 ? 'text-ok' : 'text-muted'}>
                {dev >= 0 ? '+' : ''}
                {fmt(dev, 3)} % from the {fmt(p.target, 4)} Ω target{Math.abs(dev) <= 10 ? ' (typical fab tolerance ±10 %)' : ''}
              </span>
            )}
          </div>
          <table className="tbl">
            <tbody>
              {diff && r?.odd && (
                <>
                  <Result label="Odd-mode impedance Zodd" value={fmt(r.odd.z, 4)} unit="Ω" />
                  <Result label="Even-mode impedance Zeven" value={r.even ? fmt(r.even.z, 4) : '—'} unit="Ω" />
                  <Result label="Common-mode impedance Zcomm" value={r.zcomm ? fmt(r.zcomm, 4) : '—'} unit="Ω" sub="Zeven / 2" />
                  <Result label="εeff odd / even" value={`${fmt(r.odd.eeff, 4)} / ${r.even ? fmt(r.even.eeff, 4) : '—'}`} />
                  {r.even && <Result label="Coupling (saturated NEXT)" value={`${fmt(100 * nextCoefficient(r.even.z, r.odd.z), 3)} %`} sub="if the two traces carried unrelated signals" />}
                </>
              )}
              {eeff && (
                <>
                  <Result label="Propagation delay" value={fmt(delayPsPerMm(eeff), 4)} unit="ps/mm" sub={`${fmt(delayPsPerMm(eeff) * 25.4, 4)} ps/in`} />
                  <Result label="Velocity" value={`${fmt(100 / Math.sqrt(eeff), 3)} %`} unit="of c" />
                </>
              )}
              {lc && (
                <>
                  <Result label={diff ? 'Inductance per line (odd)' : 'Inductance'} value={fmt(lc.lPerM * 1e6, 4)} unit="nH/mm" />
                  <Result label={diff ? 'Capacitance per line (odd)' : 'Capacitance'} value={fmt(lc.cPerM * 1e9, 4)} unit="pF/mm" />
                </>
              )}
              {cf && z && <Result label={`Closed-form check (${cf.name})`} value={fmt(cf.z, 4)} unit="Ω" sub={`${fmt((100 * (cf.z - z)) / z, 2)} % vs field solver`} />}
            </tbody>
          </table>
        </Panel>

        <Panel
          title={view === 'section' ? 'Cross-Section' : `Field (${diff ? 'odd mode' : 'single-ended'}), equipotentials every 10 %`}
          right={
            <Segmented
              label="View"
              value={view}
              onChange={setView}
              options={[
                { value: 'section', label: 'Section' },
                { value: 'field', label: 'Field' },
              ]}
            />
          }
        >
          <div className="p-2">
            {view === 'section' || !r?.field || !geom ? (
              <CrossSection
                spec={{ type, diff, w: p.w, wTop: p.w - p.etch, t: p.t, s: p.s, h: p.h, h2: p.h2, er: p.er, er2: p.er2, mask: p.mask, cpw: p.cpw, gap: p.gap }}
                unitLabel={unit}
                toUnit={toUnit}
              />
            ) : (
              <FieldMap field={r.field} geom={geom} />
            )}
          </div>
        </Panel>
      </div>
    </ToolPage>
  );
}

export function Method() {
  return (
    <>
      <h2>How the impedance is calculated</h2>
      <p>
        Closed-form formulas such as IPC-2141 are fits to a limited set of geometries. They lose accuracy for thin dielectrics, coated or trapezoidal traces and coupled pairs. This
        calculator solves the electrostatic field of the actual cross-section instead.
      </p>
      <p>
        The cross-section is divided into a graded rectangular mesh, finest at conductor edges and dielectric interfaces. The solver then computes the Laplace equation ∇·(ε∇φ) = 0 with
        the traces held at a fixed potential and the planes grounded. The capacitance per unit length follows from the stored field energy. That calculation is repeated with every
        dielectric replaced by air:
      </p>
      <div className="eq">
        <span className="no">(1)</span>
        <i>Z</i>
        <sub>0</sub> = 1 / ( <i>c</i> · √(<i>C</i> · <i>C</i>
        <sub>air</sub>) ),&nbsp;&nbsp; ε<sub>eff</sub> = <i>C</i> / <i>C</i>
        <sub>air</sub>
      </div>
      <p>
        For a differential pair the solver runs twice, using the symmetry plane between the traces. An electric wall gives the odd mode and a magnetic wall gives the even mode:
      </p>
      <div className="eq">
        <span className="no">(2)</span>
        <i>Z</i>
        <sub>diff</sub> = 2 <i>Z</i>
        <sub>odd</sub>,&nbsp;&nbsp; <i>Z</i>
        <sub>comm</sub> = <i>Z</i>
        <sub>even</sub> / 2
      </div>
      <h3>Validation</h3>
      <p>These results were compared with a commercial 2D field solver (Polar SI9000) on solder-mask coated microstrip:</p>
      <table className="tbl mb-4 font-sans text-[13px]">
        <thead>
          <tr>
            <th>Stackup / geometry</th>
            <th className="v">Reference</th>
            <th className="v">This tool</th>
            <th className="v">Diff.</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>H 0.0994 mm, εr 4.1, W 0.157 mm</td><td className="v">50 Ω</td><td className="v">49.60 Ω</td><td className="v">−0.8 %</td></tr>
          <tr><td>H 0.0994 mm, εr 4.1, W/S 0.145/0.127 mm</td><td className="v">85 Ω</td><td className="v">85.21 Ω</td><td className="v">+0.25 %</td></tr>
          <tr><td>H 0.0994 mm, εr 4.1, W/S 0.122/0.203 mm</td><td className="v">100 Ω</td><td className="v">99.86 Ω</td><td className="v">−0.14 %</td></tr>
          <tr><td>H 0.0764 mm, εr 3.91, W 0.116 mm</td><td className="v">50 Ω</td><td className="v">50.10 Ω</td><td className="v">+0.2 %</td></tr>
          <tr><td>H 0.0764 mm, εr 3.91, W/S 0.113/0.114 mm</td><td className="v">85 Ω</td><td className="v">85.00 Ω</td><td className="v">0.0 %</td></tr>
          <tr><td>H 0.0764 mm, εr 3.91, W/S 0.097/0.203 mm</td><td className="v">100 Ω</td><td className="v">99.86 Ω</td><td className="v">−0.14 %</td></tr>
        </tbody>
      </table>
      <p>
        The automated tests also check the solver against Hammerstad–Jensen microstrip and Wheeler stripline formulas; both must agree within 2 %. Real boards vary more than that.
        Laminate εr depends on frequency and resin content, and etching changes the width, so fabricators quote impedance to ±10 % (±5 % on request).
      </p>
      <h3>Tips</h3>
      <ul>
        <li>Use the εr your fabricator quotes for the specific prepreg or core and the signal frequency, not the generic 4.5 for FR-4.</li>
        <li>Solder mask lowers the impedance of surface traces by a few ohms. Leave it switched on for outer layers.</li>
        <li>In a stripline, the prepreg and the core often have different εr. Enter them separately.</li>
      </ul>
      <h2>References</h2>
      <ol>
        <li>E. Hammerstad, Ø. Jensen, “Accurate Models for Microstrip Computer-Aided Design,” IEEE MTT-S Int. Microwave Symp., 1980.</li>
        <li>H. A. Wheeler, “Transmission-Line Properties of a Strip Line Between Parallel Planes,” IEEE Trans. MTT, 1978.</li>
        <li>B. C. Wadell, <i>Transmission Line Design Handbook</i>, Artech House, 1991.</li>
        <li>H. Johnson, M. Graham, <i>High-Speed Digital Design</i>, Prentice Hall, 1993.</li>
      </ol>
    </>
  );
}
