import { useMemo, useState } from 'react';
import { ToolPage } from '../components/ToolPage';
import { Big, LenField, Notes, NumField, Panel, Result, Section, SelectField } from '../components/ui';
import { validateViaPair, viaPairImpedance, type AntipadShape } from '../lib/via2d';
import { C0, fmt, fromMm, si } from '../lib/units';
import { useSettings } from '../state/settings';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { hole: 0.2, plating: 0.025, pitch: 0.8, shape: 'oblong', antipad: 0.7, er: 4.2, len: 1.6, stub: 0.8, target: 100 };

export default function DiffVia() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const { unit } = useSettings();
  const d = p.hole + 2 * p.plating;
  const geom = { d, pitch: p.pitch, antipad: p.antipad, shape: p.shape as AntipadShape, er: p.er };
  const errors = [...validateViaPair(geom)];
  if (!(p.len > 0)) errors.push('Via length must be greater than 0.');
  if (p.stub < 0) errors.push('Stub length cannot be negative.');
  if (!(p.len > 0 && p.len < 1000 && Number.isFinite(p.stub) && p.stub < 1000)) errors.push('Via and stub lengths must be below 1000 mm.');
  // solver errors become a note instead of breaking the page
  const solved = useMemo(() => {
    if (errors.length) return { r: null, err: null };
    try {
      return { r: viaPairImpedance(geom), err: null };
    } catch (e) {
      return { r: null, err: e instanceof Error ? e.message : String(e) };
    }
  }, [JSON.stringify(geom), errors.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const r = solved.r;
  if (solved.err) errors.push(solved.err);
  const delayPs = ((p.len * 1e-3 * Math.sqrt(p.er)) / C0) * 1e12;
  const stubF = p.stub > 0 ? C0 / (4 * p.stub * 1e-3 * Math.sqrt(p.er)) : Infinity;
  const [solving, setSolving] = useState(false);
  const [solveMsg, setSolveMsg] = useState<string | null>(null);

  // Zdiff rises monotonically with the antipad size: bisection on the same mesh as the display.
  const solveAntipad = () => {
    setSolving(true);
    setSolveMsg(null);
    setTimeout(() => {
      try {
        const lo0 = d * 1.02;
        // upper bound: never beyond what validateViaPair accepts
        let hi = Math.max(d * 8, p.pitch * 3);
        while (hi > lo0 * 1.01 && validateViaPair({ ...geom, antipad: hi }).length) hi *= 0.9;
        let lo = lo0;
        const z = (ap: number) => viaPairImpedance({ ...geom, antipad: ap }).zDiff;
        const zLo = z(lo);
        const zHi = z(hi);
        if (p.target < zLo || p.target > zHi) {
          setSolveMsg(`${fmt(p.target, 4)} Ω is outside the reachable range (${fmt(zLo, 3)}–${fmt(zHi, 3)} Ω) for this barrel and pitch. Change the pitch or the hole size.`);
          return;
        }
        for (let i = 0; i < 22; i++) {
          const mid = (lo + hi) / 2;
          if (z(mid) < p.target) lo = mid;
          else hi = mid;
        }
        set({ antipad: (lo + hi) / 2 });
      } catch (e) {
        setSolveMsg(e instanceof Error ? e.message : String(e));
      } finally {
        setSolving(false);
      }
    }, 10);
  };

  const L = (mm: number) => `${fmt(fromMm(mm, unit), 4)} ${unit}`;
  const dev = r ? (100 * (r.zDiff - p.target)) / p.target : 0;
  const notes: string[] = [];
  if (r && Math.abs(dev) > 20) notes.push(`The via pair is ${fmt(Math.abs(dev), 3)} % ${dev > 0 ? 'above' : 'below'} the line impedance. Adjust the antipad or pitch (Solve antipad).`);
  if (Number.isFinite(stubF) && stubF < 20e9) notes.push(`The ${L(p.stub)} stub resonates at ${si(stubF, 'Hz', 3)}. Keep it well above the signal's highest harmonic, or back-drill.`);

  const properties = (
    <>
      <Section title="Via Pair">
        <LenField label="Finished hole" symbol="d" value={p.hole} onChange={(v) => set({ hole: v })} />
        <LenField label="Plating thickness" value={p.plating} onChange={(v) => set({ plating: v })} units={['um', 'mil', 'mm']} />
        <LenField label="Pitch (centre to centre)" symbol="p" value={p.pitch} onChange={(v) => set({ pitch: v })} />
        <NumField label="Dielectric constant" symbol="εr" value={p.er} onChange={(v) => set({ er: v })} min={1} allowZero />
      </Section>
      <Section title="Plane Clearance">
        <SelectField
          label="Antipad shape"
          value={p.shape as AntipadShape}
          onChange={(v) => set({ shape: v })}
          options={[
            { value: 'oblong', label: 'Shared oblong slot' },
            { value: 'round', label: 'Individual round' },
          ]}
        />
        <LenField label={p.shape === 'oblong' ? 'Slot width' : 'Antipad diameter'} symbol="D" value={p.antipad} onChange={(v) => set({ antipad: v })} />
      </Section>
      <Section title="Length and Target">
        <LenField label="Via length (signal path)" value={p.len} onChange={(v) => set({ len: v })} />
        <LenField label="Unused stub length" value={p.stub} onChange={(v) => set({ stub: v })} allowZero />
        <NumField label="Line Zdiff target" value={p.target} onChange={(v) => set({ target: v })} unit="Ω" />
        <div className="flex justify-end pt-0.5">
          <button className="btn btn-primary" disabled={!r || solving} onClick={solveAntipad}>
            {solving ? 'Solving…' : 'Solve Antipad'}
          </button>
        </div>
      </Section>
    </>
  );

  return (
    <ToolPage
      title="Differential Via"
      description="Differential, odd-, even- and common-mode impedance of a via pair through a reference plane, from a 2D field solution of the barrels in their antipad, plus the stub resonance and the delay through the board."
      onReset={reset}
      properties={properties}
      status={r ? `Via pair Zdiff ${fmt(r.zDiff, 4)} Ω (target ${fmt(p.target, 4)} Ω) · stub f0 ${Number.isFinite(stubF) ? si(stubF, 'Hz', 3) : '—'}` : 'Check the inputs'}
      method={<Method />}
    >
      <Notes kind="error" items={[...errors, ...(solveMsg ? [solveMsg] : [])]} />
      <Notes items={notes} />
      {r && (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Panel title="Results">
            <div className="flex flex-wrap gap-8 px-2.5 py-2">
              <Big label="Differential impedance (in the antipad)" value={fmt(r.zDiff, 4)} unit="Ω" />
              <Big label="Deviation from the line" value={`${dev >= 0 ? '+' : ''}${fmt(dev, 3)}`} unit="%" />
            </div>
            <table className="tbl">
              <tbody>
                <Result label="Odd-mode impedance" value={fmt(r.zOdd, 4)} unit="Ω" />
                <Result label="Even-mode impedance" value={fmt(r.zEven, 4)} unit="Ω" />
                <Result label="Common-mode impedance" value={fmt(r.zComm, 4)} unit="Ω" sub="Zeven / 2" />
                <Result label="Barrel diameter" value={L(d)} sub="finished hole + 2 × plating" />
                <Result label="Delay through the board" value={fmt(delayPs, 4)} unit="ps" />
                <Result label="Stub quarter-wave resonance" value={Number.isFinite(stubF) ? si(stubF, 'Hz') : 'no stub'} sub="c / (4 · L_stub · √εr)" />
              </tbody>
            </table>
          </Panel>
          <Panel title="Plan View">
            <div className="p-3">
              <ViaDrawing pitch={p.pitch} d={d} hole={p.hole} antipad={p.antipad} shape={p.shape as AntipadShape} />
            </div>
          </Panel>
        </div>
      )}
    </ToolPage>
  );
}

function ViaDrawing({ pitch, d, hole, antipad, shape }: { pitch: number; d: number; hole: number; antipad: number; shape: AntipadShape }) {
  const span = pitch + antipad;
  const s = 240 / Math.max(span * 1.25, 1e-6);
  const cx = 150;
  const cy = 90;
  const x1 = cx - (pitch / 2) * s;
  const x2 = cx + (pitch / 2) * s;
  const ra = (antipad / 2) * s;
  return (
    <svg viewBox="0 0 300 180" className="h-auto w-full" role="img" aria-label="Plan view of the via pair and antipad">
      <rect x="0" y="0" width="300" height="180" fill="var(--copper)" opacity="0.55" />
      {shape === 'oblong' ? (
        <rect x={x1 - ra} y={cy - ra} width={x2 - x1 + 2 * ra} height={2 * ra} rx={ra} fill="var(--laminate)" />
      ) : (
        <>
          <circle cx={x1} cy={cy} r={ra} fill="var(--laminate)" />
          <circle cx={x2} cy={cy} r={ra} fill="var(--laminate)" />
        </>
      )}
      {[x1, x2].map((x) => (
        <g key={x}>
          <circle cx={x} cy={cy} r={(d / 2) * s} fill="var(--copper)" stroke="var(--ink)" strokeWidth="0.7" />
          <circle cx={x} cy={cy} r={(hole / 2) * s} fill="var(--sheet)" stroke="var(--ink)" strokeWidth="0.5" />
        </g>
      ))}
      <line x1={x1} x2={x2} y1={cy + ra + 12} y2={cy + ra + 12} stroke="var(--ink)" strokeWidth="0.8" />
      <text x={cx} y={cy + ra + 24} textAnchor="middle" fill="var(--ink)" fontSize="10">
        pitch
      </text>
      <text x="6" y="14" fill="var(--ink)" fontSize="10">
        plane
      </text>
    </svg>
  );
}

function Method() {
  return (
    <>
      <h2>Model</h2>
      <p>
        Where the via pair passes through a reference plane, the barrels and the edge of the antipad form a shielded two-conductor line. The tool solves Laplace's equation for this
        cross-section on a fine grid, with curved-boundary correction, and derives the odd- and even-mode impedances in the same way as the trace field solver:
      </p>
      <div className="eq">
        <span className="no">(1)</span>
        <i>Z</i>
        <sub>diff</sub> = 2 <i>Z</i>
        <sub>odd</sub>,&nbsp;&nbsp; <i>Z</i>
        <sub>comm</sub> = <i>Z</i>
        <sub>even</sub> / 2
      </div>
      <p>
        The solver is validated against the exact coaxial result <i>Z</i> = (60/√εr)·ln(<i>D</i>/<i>d</i>) for a single via, and against the twin-wire limit for a pair in a very large clearance.
        Between planes a real via also couples to the nearest planes and to its return vias, so treat the value as the impedance of the plane crossings. For a full-length model,
        including pads and stubs, a 3D solver is required.
      </p>
      <div className="eq">
        <span className="no">(2)</span>
        <i>f</i>
        <sub>stub</sub> = <i>c</i> / (4 · <i>L</i>
        <sub>stub</sub> · √ε<sub>r</sub>)
      </div>
      <p>The unused part of the barrel below the exit layer is an open stub. It notches the channel at its quarter-wave frequency. Back-drilling removes it.</p>
      <h2>References</h2>
      <ol>
        <li>E. Bogatin, <i>Signal and Power Integrity – Simplified</i>, 3rd ed.</li>
        <li>H. Johnson, M. Graham, <i>High-Speed Signal Propagation: Advanced Black Magic</i>, 2003.</li>
      </ol>
    </>
  );
}
