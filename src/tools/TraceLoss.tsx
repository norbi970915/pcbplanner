import { useMemo, useState } from 'react';
import { CrossSection } from '../components/CrossSection';
import { Sources } from '../components/Sources';
import { StackupPicker } from '../components/StackupPicker';
import { ToolPage } from '../components/ToolPage';
import { Big, Check, LenField, Notes, NumField, Panel, Result, Section, Segmented, SelectField } from '../components/ui';
import { FOILS, HURAY_SR, hurayRadius, LAMINATE_SOURCES, LAMINATES, laminateById, MASKS, maskById } from '../data/laminates';
import { djordjevicSarkar, type DielectricSpec } from '../lib/dielectric';
import type { Accuracy, Geometry } from '../lib/fieldsolver';
import type { LossPoint, RoughnessModel } from '../lib/loss';
import { logSpace } from '../lib/pdn';
import type { LossRequest } from '../lib/solver.worker';
import { useLossSolve } from '../lib/solverClient';
import { geometryForLayer, type Stackup } from '../lib/stackups';
import { fmt, fromMm, si } from '../lib/units';
import { useSettings } from '../state/settings';
import { useUrlState } from '../state/useUrlState';

type LineType = 'microstrip' | 'embedded' | 'stripline';

const DEFAULTS = {
  type: 'microstrip',
  mode: 'diff',
  mask: true,
  w: 0.12,
  etch: 0.0127,
  t: 0.035,
  s: 0.2,
  h: 0.1,
  h2: 0.1,
  mat: 's1141-2116',
  er: 4.2,
  df: 0.02,
  f0: 1,
  mat2: 's1141-2116',
  er2: 4.2,
  df2: 0.02,
  f02: 1,
  c1: 0.0305,
  c2: 0.0152,
  mmat: 'psr4000bn',
  erm: 3.8,
  dfm: 0.025,
  fm: 1,
  rough: 'hammerstad',
  foil: 'ed',
  rq: 3.2,
  hr: 0.6651,
  sr: 4.887,
  temp: 20,
  len: 254,
  f: 4,
  fmax: 20,
  acc: 'normal',
};
type P = typeof DEFAULTS;

const IN_PER_M = 39.3700787;

function specOf(mat: string, er: number, df: number, f0: number, lookup: typeof laminateById): DielectricSpec {
  const l = mat !== 'custom' ? lookup(mat) : undefined;
  return l ? { dk: l.dk, df: l.df, f0: l.fGHz * 1e9 } : { dk: er, df, f0: f0 * 1e9 };
}

function buildRequest(p: P): { req: LossRequest | null; errors: string[] } {
  const errors: string[] = [];
  const type = p.type as LineType;
  const diff = p.mode === 'diff';
  const pos = (v: number, name: string) => {
    if (!(v > 0)) errors.push(`${name} must be greater than 0.`);
  };
  pos(p.w, 'Width W');
  pos(p.t, 'Thickness T');
  pos(p.h, 'Height H');
  if (type !== 'microstrip') pos(p.h2, 'Height H2');
  if (diff) pos(p.s, 'Spacing S');
  pos(p.len, 'Length');
  pos(p.f, 'Frequency');
  if (!(p.fmax > 0.01 && p.fmax <= 200)) errors.push('Sweep limit must be between 0.01 and 200 GHz.');
  if (p.f > 200) errors.push('Frequency must be at most 200 GHz.');
  if (p.etch < 0 || p.etch >= p.w) errors.push('Etch must be between 0 and the trace width.');
  const checkMat = (mat: string, er: number, df: number, f0: number, what: string) => {
    if (mat !== 'custom') return;
    if (!(er >= 1 && er <= 100)) errors.push(`${what} Dk must be between 1 and 100.`);
    if (!(df >= 0 && df < 1)) errors.push(`${what} Df must be between 0 and 1.`);
    if (!(f0 > 0 && f0 <= 200)) errors.push(`${what} datasheet frequency must be between 0 and 200 GHz.`);
  };
  checkMat(p.mat, p.er, p.df, p.f0, 'Dielectric');
  if (type !== 'microstrip') checkMat(p.mat2, p.er2, p.df2, p.f02, 'Upper dielectric');
  const hasMask = type === 'microstrip' && p.mask && (p.c1 > 0 || p.c2 > 0);
  if (hasMask) checkMat(p.mmat, p.erm, p.dfm, p.fm, 'Mask');
  if (type === 'microstrip' && p.mask && !(p.c1 >= 0 && p.c2 >= 0)) errors.push('Mask thickness cannot be negative.');
  if (p.rough === 'hammerstad' || p.rough === 'groiss') {
    if (!(p.rq >= 0 && p.rq <= 20)) errors.push('RMS roughness must be between 0 and 20 µm.');
  }
  if (p.rough === 'huray') {
    if (!(p.hr > 0 && p.hr <= 10)) errors.push('Sphere radius must be between 0 and 10 µm.');
    if (!(p.sr >= 0 && p.sr <= 20)) errors.push('Surface ratio must be between 0 and 20.');
  }
  if (errors.length) return { req: null, errors };

  const fRef = p.f * 1e9;
  const s1 = specOf(p.mat, p.er, p.df, p.f0, laminateById);
  const s2 = specOf(p.mat2, p.er2, p.df2, p.f02, laminateById);
  const sm = specOf(p.mmat, p.erm, p.dfm, p.fm, maskById);
  const dkAt = (s: DielectricSpec) => djordjevicSarkar(s).dk(fRef);

  const geom: Geometry = {
    w: p.w,
    wTop: p.etch > 0 ? p.w - p.etch : undefined,
    t: p.t,
    yTrace: p.h,
    diff,
    s: diff ? p.s : undefined,
    slabs: [{ y0: 0, y1: p.h, er: dkAt(s1) }],
  };
  const slabSpecs = [s1];
  if (type === 'microstrip') {
    if (hasMask) geom.mask = { surfaceY: p.h, overSubstrate: p.c1, overTrace: p.c2, er: dkAt(sm) };
  } else {
    geom.slabs.push({ y0: p.h, y1: p.h + p.t + p.h2, er: dkAt(s2) });
    slabSpecs.push(s2);
    if (type === 'stripline') geom.topPlane = p.h + p.t + p.h2;
  }
  const freqs = [...logSpace(1e7, p.fmax * 1e9, 81), fRef];
  return {
    req: {
      geom,
      slabSpecs,
      maskSpec: geom.mask ? sm : undefined,
      fRef,
      freqs,
      rough: { model: p.rough as RoughnessModel, rq: p.rq, radius: p.hr, sr: p.sr },
      tempC: p.temp,
      accuracy: p.acc as Accuracy,
    },
    errors,
  };
}

export default function TraceLoss() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const { unit } = useSettings();
  const [stackNote, setStackNote] = useState<string | null>(null);
  const type = p.type as LineType;
  const diff = p.mode === 'diff';
  const { req, errors } = useMemo(() => buildRequest(p), [p]);
  const st = useLossSolve(req);
  const res = req ? st.result : null;
  const at = res ? res.points[res.points.length - 1] : null;
  const sweep = res ? res.points.slice(0, -1) : [];
  const lenIn = p.len / 25.4;

  const applyLayer = (stack: Stackup, layerId: string) => {
    const g = layerId ? geometryForLayer(stack, layerId) : null;
    if (!g) {
      setStackNote('That layer has no reference plane marked in the stackup.');
      return;
    }
    set({
      type: g.type,
      h: g.h,
      t: g.t,
      mat: 'custom',
      er: g.er,
      ...(g.h2 !== undefined ? { h2: g.h2, mat2: 'custom', er2: g.er2 ?? g.er } : {}),
      ...(g.type === 'microstrip' ? { mask: !!g.mask, ...(g.mask ? { c1: g.mask.c1, c2: g.mask.c2, mmat: 'custom', erm: g.mask.er } : {}) } : {}),
    });
    setStackNote(`${g.note} The stackup lists Dk only: check Df and its frequency below.`);
  };

  const matOptions = [{ value: 'custom', label: 'Custom (enter Dk, Df)', group: 'Custom' }, ...LAMINATES.map((l) => ({ value: l.id, label: `${l.vendor} ${l.name}`, group: l.cls }))];
  const maskOptions = [{ value: 'custom', label: 'Custom (enter Dk, Df)' }, ...MASKS.map((l) => ({ value: l.id, label: `${l.vendor} ${l.name}` }))];

  const material = (
    label: string,
    mat: string,
    er: number,
    df: number,
    f0: number,
    keys: { mat: keyof P; er: keyof P; df: keyof P; f0: keyof P },
    opts: { value: string; label: string; group?: string }[] = matOptions,
    lookup = laminateById,
  ) => {
    const l = mat !== 'custom' ? lookup(mat) : undefined;
    const model = djordjevicSarkar(l ? { dk: l.dk, df: l.df, f0: l.fGHz * 1e9 } : { dk: er, df, f0: f0 * 1e9 });
    const ok = l || (er >= 1 && df >= 0 && df < 1 && f0 > 0);
    return (
      <>
        <SelectField label={label} value={mat} onChange={(v) => set({ [keys.mat]: v } as Partial<P>)} options={opts} width={176} />
        {l ? (
          <p className="text-faint">
            Datasheet: Dk {l.dk}, Df {l.df} at {l.fGHz} GHz{l.tg ? ` · Tg ${l.tg} °C` : ''}. {l.note}
          </p>
        ) : (
          <>
            <NumField label="Dk" symbol="εr" value={er} onChange={(v) => set({ [keys.er]: v } as Partial<P>)} min={1} allowZero />
            <NumField label="Df (loss tangent)" symbol="tanδ" value={df} onChange={(v) => set({ [keys.df]: v } as Partial<P>)} allowZero />
            <NumField label="…specified at" value={f0} onChange={(v) => set({ [keys.f0]: v } as Partial<P>)} unit="GHz" />
          </>
        )}
        {ok && p.f > 0 && (
          <p className="text-faint">
            At {fmt(p.f, 4)} GHz: Dk {fmt(model.dk(p.f * 1e9), 4)}, Df {fmt(model.df(p.f * 1e9), 3)}
          </p>
        )}
      </>
    );
  };

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
            onChange={(v) => set({ mode: v })}
            options={[
              { value: 'se', label: 'Single-ended' },
              { value: 'diff', label: 'Differential' },
            ]}
          />
        </div>
        {type === 'microstrip' && <Check label="Solder mask coating" checked={p.mask} onChange={(v) => set({ mask: v })} />}
      </Section>
      <Section title="Line">
        <NumField label="Frequency of interest" symbol="f" value={p.f} onChange={(v) => set({ f: v })} unit="GHz" hint="For a digital link use the Nyquist frequency: half the bit rate (PCIe Gen3 8 GT/s → 4 GHz)." />
        <LenField label="Length" symbol="L" value={p.len} onChange={(v) => set({ len: v })} units={['mm', 'cm', 'in', 'mil']} />
        <NumField label="Sweep up to" value={p.fmax} onChange={(v) => set({ fmax: v })} unit="GHz" />
      </Section>
      <Section title="Conductor">
        <LenField label="Width (bottom)" symbol="W" value={p.w} onChange={(v) => set({ w: v })} />
        <LenField label="Etch (W − top)" value={p.etch} onChange={(v) => set({ etch: v })} allowZero />
        <LenField label="Thickness" symbol="T" value={p.t} onChange={(v) => set({ t: v })} units={['mm', 'mil', 'um', 'oz']} />
        {diff && <LenField label="Spacing" symbol="S" value={p.s} onChange={(v) => set({ s: v })} />}
        <NumField label="Temperature" value={p.temp} onChange={(v) => set({ temp: v })} unit="°C" allowNegative />
      </Section>
      <Section title="Copper Roughness">
        <SelectField
          label="Model"
          value={p.rough as RoughnessModel}
          onChange={(v) => set({ rough: v })}
          options={[
            { value: 'smooth', label: 'Smooth copper' },
            { value: 'hammerstad', label: 'Hammerstad (Rq)' },
            { value: 'groiss', label: 'Groiss (Rq)' },
            { value: 'huray', label: 'Huray (spheres)' },
          ]}
        />
        {p.rough !== 'smooth' && (
          <SelectField
            label="Foil type"
            value={p.foil}
            onChange={(v) => {
              const f = FOILS.find((x) => x.id === v);
              set(f ? { foil: v, rq: +f.rq.toFixed(3), hr: +hurayRadius(f.rz).toFixed(4), sr: +HURAY_SR.toFixed(3) } : { foil: v });
            }}
            options={[{ value: 'custom', label: 'Custom values' }, ...FOILS.map((f) => ({ value: f.id, label: f.name }))]}
            width={176}
          />
        )}
        {(p.rough === 'hammerstad' || p.rough === 'groiss') && (
          <NumField label="RMS roughness" symbol="Rq" value={p.rq} onChange={(v) => set({ rq: v, foil: 'custom' })} unit="µm" allowZero />
        )}
        {p.rough === 'huray' && (
          <>
            <NumField label="Sphere radius" symbol="a" value={p.hr} onChange={(v) => set({ hr: v, foil: 'custom' })} unit="µm" hint="Cannonball model: a ≈ 0.06·Rz." />
            <NumField label="Surface ratio" symbol="SR" value={p.sr} onChange={(v) => set({ sr: v, foil: 'custom' })} allowZero hint="N·4πa² / A_flat. Cannonball model: 14 spheres on a 36a² tile = 4.89." />
          </>
        )}
        {p.rough !== 'smooth' && p.foil !== 'custom' && <p className="text-faint">{FOILS.find((f) => f.id === p.foil)?.note} Treated sides differ; oxide or micro-etch changes the roughness.</p>}
      </Section>
      <Section title={type === 'stripline' ? 'Dielectric Below' : 'Dielectric'}>
        <LenField label={type === 'stripline' ? 'Plane to trace' : 'Height to plane'} symbol="H" value={p.h} onChange={(v) => set({ h: v })} />
        {material('Material', p.mat, p.er, p.df, p.f0, { mat: 'mat', er: 'er', df: 'df', f0: 'f0' })}
      </Section>
      {type !== 'microstrip' && (
        <Section title={type === 'stripline' ? 'Dielectric Above' : 'Cover Dielectric'}>
          <LenField label={type === 'stripline' ? 'Trace to plane' : 'Cover thickness'} symbol="H2" value={p.h2} onChange={(v) => set({ h2: v })} />
          {material('Material', p.mat2, p.er2, p.df2, p.f02, { mat: 'mat2', er: 'er2', df: 'df2', f0: 'f02' })}
        </Section>
      )}
      {type === 'microstrip' && p.mask && (
        <Section title="Solder Mask">
          <LenField label="Over laminate" symbol="C1" value={p.c1} onChange={(v) => set({ c1: v })} allowZero />
          <LenField label="Over trace" symbol="C2" value={p.c2} onChange={(v) => set({ c2: v })} allowZero />
          {material('Mask', p.mmat, p.erm, p.dfm, p.fm, { mat: 'mmat', er: 'erm', df: 'dfm', f0: 'fm' }, maskOptions, maskById)}
        </Section>
      )}
      <Section title="From Stackup">
        <StackupPicker onApply={applyLayer} />
        {stackNote && <p className="text-faint">{stackNote}</p>}
      </Section>
      <Section title="Solver" defaultOpen={false}>
        <SelectField
          label="Mesh accuracy"
          value={p.acc as Accuracy}
          onChange={(v) => set({ acc: v })}
          options={[
            { value: 'fast', label: 'Fast' },
            { value: 'normal', label: 'Normal' },
            { value: 'high', label: 'High' },
          ]}
        />
      </Section>
    </>
  );

  const toUnit = (mm: number) => fromMm(mm, unit);
  const status = st.busy
    ? 'Solving…'
    : at
      ? `${fmt(at.alpha / IN_PER_M, 4)} dB/in at ${fmt(p.f, 4)} GHz · ${fmt((at.alpha / IN_PER_M) * lenIn, 4)} dB over ${fmt(p.len, 4)} mm · ${res!.nodes.toLocaleString()} nodes`
      : errors.length
        ? 'Check the inputs'
        : 'Ready';

  return (
    <ToolPage
      title="Trace Loss (Insertion Loss) Calculator"
      description="Insertion loss of PCB traces in dB per inch and over the full length: conductor loss with copper roughness and dielectric loss from a 2D field solver, for microstrip, stripline and differential pairs, with laminate Dk/Df modelled across frequency."
      onReset={reset}
      properties={properties}
      status={status}
      method={<Method />}
    >
      <Notes kind="error" items={[...errors, ...(st.error && req ? [st.error] : [])]} />
      <div className="grid gap-3 2xl:grid-cols-2">
        <Panel title={`At ${fmt(p.f, 4)} GHz${diff ? ' (differential)' : ''}`}>
          <div className="flex flex-wrap items-end gap-x-8 gap-y-2 px-2.5 pb-2 pt-2">
            <Big label="Loss per inch" value={at ? fmt(at.alpha / IN_PER_M, 4) : '—'} unit="dB/in" busy={st.busy} />
            <Big label={`Over ${fmt(p.len, 4)} mm`} value={at ? fmt((at.alpha / IN_PER_M) * lenIn, 4) : '—'} unit="dB" busy={st.busy} />
            <Big label={diff ? 'Zdiff' : 'Z0'} value={at ? fmt(diff ? 2 * at.z : at.z, 4) : '—'} unit="Ω" busy={st.busy} />
          </div>
          {at && res && (
            <table className="tbl">
              <tbody>
                <Result label="Conductor loss" value={fmt(at.alphaC / IN_PER_M, 4)} unit="dB/in" sub={`${fmt((100 * at.alphaC) / at.alpha, 3)} % of the total`} />
                <Result label="Dielectric loss" value={fmt(at.alphaD / IN_PER_M, 4)} unit="dB/in" sub={`${fmt((100 * at.alphaD) / at.alpha, 3)} % of the total`} />
                <Result label="Total loss" value={fmt(at.alpha / 100, 4)} unit="dB/cm" strong />
                <Result label="Remaining amplitude" value={`${fmt(100 * 10 ** (-((at.alpha / IN_PER_M) * lenIn) / 20), 3)} %`} sub={`after ${fmt(p.len, 4)} mm`} />
                <Result label="Skin depth" value={fmt(at.skinUm, 4)} unit="µm" />
                <Result label="Roughness factor K" value={fmt(at.rough, 4)} sub="multiplies the skin-effect resistance" />
                <Result label={diff ? 'AC resistance per line' : 'AC resistance'} value={fmt(at.rPerM / 1000, 4)} unit="Ω/mm" sub={`trace + return path · DC ${fmt(res.rdc / 1000, 4)} Ω/mm (trace)`} />
                <Result label="Effective εr" value={fmt(at.eeff, 4)} />
                <Result label="Effective loss tangent" value={fmt(at.tanEff, 4)} sub="field-weighted over laminate, mask and air" />
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Cross-Section">
          <div className="p-2">
            <CrossSection
              spec={{
                type,
                diff,
                w: p.w,
                wTop: p.w - p.etch,
                t: p.t,
                s: p.s,
                h: p.h,
                h2: p.h2,
                er: req?.geom.slabs[0].er ?? p.er,
                er2: req?.geom.slabs[1]?.er ?? p.er2,
                mask: p.mask,
                cpw: false,
                gap: 0,
              }}
              unitLabel={unit}
              toUnit={toUnit}
            />
          </div>
        </Panel>
      </div>
      {sweep.length > 0 && (
        <Panel title="Loss versus Frequency" className="mt-3">
          <LossPlot points={sweep} fMark={p.f * 1e9} />
        </Panel>
      )}
      {sweep.length > 0 && (
        <Panel title="Table" className="mt-3">
          <table className="tbl">
            <thead>
              <tr>
                <th>Frequency</th>
                <th className="v">Conductor dB/in</th>
                <th className="v">Dielectric dB/in</th>
                <th className="v">Total dB/in</th>
                <th className="v">Over {fmt(p.len, 4)} mm</th>
                <th className="v">{diff ? 'Zdiff' : 'Z0'}</th>
              </tr>
            </thead>
            <tbody>
              {pickRows(sweep, p.fmax * 1e9).map((q) => (
                <tr key={q.f}>
                  <td>{si(q.f, 'Hz', 3)}</td>
                  <td className="v">{fmt(q.alphaC / IN_PER_M, 3)}</td>
                  <td className="v">{fmt(q.alphaD / IN_PER_M, 3)}</td>
                  <td className="v">{fmt(q.alpha / IN_PER_M, 3)}</td>
                  <td className="v">{fmt((q.alpha / IN_PER_M) * lenIn, 3)} dB</td>
                  <td className="v">{fmt(diff ? 2 * q.z : q.z, 4)} Ω</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </ToolPage>
  );
}

/** Rows at round frequencies (1-2-5 steps) from the sweep. */
function pickRows(pts: LossPoint[], fmax: number): LossPoint[] {
  const out: LossPoint[] = [];
  for (let d = 7; d <= 11; d++)
    for (const m of [1, 2, 5]) {
      const f = m * 10 ** d;
      if (f > fmax * 1.001) continue;
      const q = pts.reduce((a, b) => (Math.abs(Math.log(b.f / f)) < Math.abs(Math.log(a.f / f)) ? b : a));
      if (Math.abs(Math.log(q.f / f)) < 0.02) out.push(q);
    }
  const last = pts[pts.length - 1];
  if (!out.includes(last)) out.push(last);
  return out;
}

function LossPlot({ points, fMark }: { points: LossPoint[]; fMark: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 280, ml = 50, mr = 14, mt = 30, mb = 34;
  const fs = points.map((q) => q.f);
  const tot = points.map((q) => q.alpha / IN_PER_M);
  const cond = points.map((q) => q.alphaC / IN_PER_M);
  const diel = points.map((q) => q.alphaD / IN_PER_M);
  const hi = niceCeil(Math.max(...tot));
  const x0 = Math.log10(fs[0]), x1 = Math.log10(fs[fs.length - 1]);
  const X = (f: number) => ml + ((Math.log10(f) - x0) / (x1 - x0)) * (W - ml - mr);
  const Y = (v: number) => mt + (1 - v / hi) * (H - mt - mb);
  const path = (vs: number[]) => vs.map((v, i) => `${i ? 'L' : 'M'}${X(fs[i]).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  const decades = [];
  for (let d = Math.ceil(x0); d <= Math.floor(x1); d++) decades.push(10 ** d);
  const yTicks = Array.from({ length: 6 }, (_, i) => (hi * i) / 5);
  const legend = [
    { label: 'Total', stroke: 'var(--accent)', dash: undefined },
    { label: 'Conductor', stroke: 'var(--copper)', dash: '6 4' },
    { label: 'Dielectric', stroke: 'var(--muted)', dash: '2 3' },
  ];
  const hf = hover === null ? null : fs[hover];
  return (
    <div className="px-2 py-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full max-w-[900px]"
        role="img"
        aria-label="Trace loss in dB per inch versus frequency"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * W;
          if (x < ml || x > W - mr) return setHover(null);
          const lf = x0 + ((x - ml) / (W - ml - mr)) * (x1 - x0);
          let best = 0;
          fs.forEach((f, i) => {
            if (Math.abs(Math.log10(f) - lf) < Math.abs(Math.log10(fs[best]) - lf)) best = i;
          });
          setHover(best);
        }}
      >
        {decades.map((f) => (
          <g key={f}>
            <line x1={X(f)} x2={X(f)} y1={mt} y2={H - mb} stroke="var(--line)" />
            <text x={X(f)} y={H - mb + 14} textAnchor="middle" fontSize={11} fill="var(--muted)">
              {si(f, 'Hz', 3)}
            </text>
          </g>
        ))}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={ml} x2={W - mr} y1={Y(v)} y2={Y(v)} stroke="var(--line)" strokeWidth={v === 0 ? 1 : 0.5} />
            <text x={ml - 5} y={Y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
              {fmt(v, 3)}
            </text>
          </g>
        ))}
        <text x={12} y={mt - 10} fontSize={11} fill="var(--muted)">
          dB/in
        </text>
        <text x={(ml + W - mr) / 2} y={H - 4} textAnchor="middle" fontSize={11} fill="var(--muted)">
          Frequency
        </text>
        <g fill="none" strokeWidth={2} strokeLinejoin="round">
          <path d={path(diel)} stroke="var(--muted)" strokeDasharray="2 3" />
          <path d={path(cond)} stroke="var(--copper)" strokeDasharray="6 4" />
          <path d={path(tot)} stroke="var(--accent)" />
          {fMark >= fs[0] && fMark <= fs[fs.length - 1] && <line x1={X(fMark)} x2={X(fMark)} y1={mt} y2={H - mb} stroke="var(--muted)" strokeWidth={1} strokeDasharray="1 3" />}
        </g>
        <rect x={ml} y={mt} width={W - ml - mr} height={H - mt - mb} fill="none" stroke="var(--line)" />
        {legend.map((l, i) => (
          <g key={l.label} transform={`translate(${ml + 60 + i * 110}, 12)`}>
            <line x1={0} x2={22} y1={0} y2={0} stroke={l.stroke} strokeWidth={2} strokeDasharray={l.dash} />
            <text x={28} y={4} fontSize={11} fill="var(--ink)">
              {l.label}
            </text>
          </g>
        ))}
        {hover !== null && hf !== null && (
          <g pointerEvents="none">
            <line x1={X(hf)} x2={X(hf)} y1={mt} y2={H - mb} stroke="var(--ink)" strokeWidth={1} opacity={0.6} />
            <circle cx={X(hf)} cy={Y(tot[hover])} r={4} fill="var(--accent)" stroke="var(--sheet)" strokeWidth={2} />
            <g transform={`translate(${X(hf) < W / 2 ? X(hf) + 8 : X(hf) - 168}, ${mt + 6})`}>
              <rect width={160} height={62} fill="var(--sheet)" stroke="var(--line-strong)" />
              <text x={8} y={15} fontSize={11} fill="var(--ink)" fontWeight={600}>
                {si(hf, 'Hz', 3)}
              </text>
              <text x={8} y={30} fontSize={11} fill="var(--ink)">
                total {fmt(tot[hover], 3)} dB/in
              </text>
              <text x={8} y={44} fontSize={11} fill="var(--muted)">
                conductor {fmt(cond[hover], 3)}
              </text>
              <text x={8} y={57} fontSize={11} fill="var(--muted)">
                dielectric {fmt(diel[hover], 3)}
              </text>
            </g>
          </g>
        )}
      </svg>
    </div>
  );
}

function niceCeil(v: number): number {
  if (!(v > 0)) return 1;
  const e = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * e >= v) return m * e;
  return 10 * e;
}

export function Method() {
  return (
    <>
      <h2>How the loss is calculated</h2>
      <p>
        The loss of a line has two parts: resistive loss in the copper and polarisation loss in the dielectric. Both are computed from the 2D field solution of the actual cross-section, the
        same solver the impedance calculator uses.
      </p>
      <h3>Dielectric loss</h3>
      <p>
        The solver splits the stored electric energy between the regions of the cross-section: laminate below and above, solder mask and air. The effective loss tangent is the
        energy-weighted average, and the attenuation follows from it:
      </p>
      <div className="eq">
        <span className="no">(1)</span>tanδ<sub>eff</sub> = Σ ε<sub>r,i</sub> tanδ<sub>i</sub> p<sub>i</sub> / ε<sub>eff</sub>,&nbsp;&nbsp; α<sub>d</sub> = π <i>f</i> √ε<sub>eff</sub> tanδ
        <sub>eff</sub> / <i>c</i>
      </div>
      <p>
        On a surface microstrip part of the field is in air, so the effective loss tangent is lower than the laminate's. In a stripline it equals the laminate's.
      </p>
      <h3>Laminate Dk and Df versus frequency</h3>
      <p>
        Datasheets give Dk and Df at one frequency. The tool fits the Djordjevic–Sarkar wideband model to that point. The model is causal, so the loss and the permittivity stay
        consistent: Df is nearly flat across the band and Dk falls slightly as frequency rises. The impedance and εeff shown are at the frequency of interest. Checked against
        datasheets that list several frequencies (Shengyi S1141, Isola FR408HR), the fitted Dk stays within 1.5 % from 1 to 10 GHz. Ultra-low-loss laminates whose Df rises
        steeply with frequency are best entered at the frequency you care about.
      </p>
      <div className="eq">
        <span className="no">(2)</span>ε(ω) = ε<sub>∞</sub> + Δε / (m<sub>2</sub> − m<sub>1</sub>) · log<sub>10</sub>( (ω<sub>2</sub> + jω) / (ω<sub>1</sub> + jω) ),&nbsp;&nbsp; ω<sub>1</sub> = 10
        <sup>4</sup>, ω<sub>2</sub> = 10<sup>12</sup> rad/s
      </div>
      <h3>Conductor loss</h3>
      <p>
        Wheeler's incremental-inductance rule gives the skin-effect resistance of any cross-section. The solver recedes every copper surface (trace sides, top, bottom and the planes)
        by a small depth, and the change in the air-filled impedance gives the resistance:
      </p>
      <div className="eq">
        <span className="no">(3)</span>
        <i>R</i>′ = (<i>R</i>
        <sub>s</sub> / η<sub>0</sub>) · ∂<i>Z</i>
        <sub>0,air</sub>/∂<i>n</i>,&nbsp;&nbsp; <i>R</i>
        <sub>s</sub> = √(π <i>f</i> μ<sub>0</sub> ρ),&nbsp;&nbsp; α<sub>c</sub> = <i>R</i>′ / (2<i>Z</i>
        <sub>0</sub>)
      </div>
      <p>
        This includes the current crowding at the trace edges, the return current in the planes, trapezoidal etching and the coupling of a differential pair. Below the frequency
        where the skin depth is comparable with the copper thickness, the resistance blends into the DC value: <i>R</i> = √(<i>R</i>
        <sub>dc</sub>² + <i>R</i>
        <sub>ac</sub>²). For a differential pair the tool reports the odd-mode loss, which is the differential insertion loss (SDD21) per unit length.
      </p>
      <h3>Copper roughness</h3>
      <p>The treated copper surface makes the current path longer at high frequency. The skin-effect resistance is multiplied by a factor K:</p>
      <ul>
        <li>
          Hammerstad: K = 1 + (2/π)·atan(1.4 (R<sub>q</sub>/δ)²). This is the classic model; it saturates at 2 and underestimates very rough foils above about 10 GHz.
        </li>
        <li>Groiss: K = 1 + exp(−(δ / 2R<sub>q</sub>)<sup>1.6</sup>). It fits measured data better for moderate roughness, and also saturates at 2.</li>
        <li>
          Huray: K = 1 + 1.5·SR / (1 + δ/a + δ²/2a²). This models the surface as spheres of radius a. It does not saturate, and it is the most accurate model when the parameters come
          from the foil maker or a measurement.
        </li>
      </ul>
      <h3>Accuracy</h3>
      <p>
        The automated tests check the dielectric loss against the exact stripline result and the quasi-static microstrip formula (within 3 %). The conductor loss is checked against
        Pozar's incremental-inductance stripline formula (within 4 %) and against the Hammerstad–Jensen microstrip derivative (within 5 %). In practice the input data limits the
        accuracy more than the solver does: laminate Dk/Df vary with resin content and glass style, and foil roughness varies from lot to lot. Datasheet values are typical; for a tight
        loss budget, ask the fabricator for the values of the actual construction.
      </p>
      <h2>References</h2>
      <ol>
        <li>H. A. Wheeler, “Formulas for the Skin Effect,” Proc. IRE, vol. 30, 1942.</li>
        <li>D. M. Pozar, <i>Microwave Engineering</i>, 4th ed., Wiley, 2012, sections 3.7–3.8.</li>
        <li>A. R. Djordjevic et al., “Wideband Frequency-Domain Characterization of FR-4 and Time-Domain Causality,” IEEE Trans. EMC, vol. 43, no. 4, 2001.</li>
        <li>E. Hammerstad, Ø. Jensen, “Accurate Models for Microstrip Computer-Aided Design,” IEEE MTT-S, 1980.</li>
        <li>S. Groiss et al., “Parameters of Lines on Rough Substrates,” Proc. European Microwave Conf., 1996.</li>
        <li>P. G. Huray et al., “Impact of Copper Surface Texture on Loss: A Model that Works,” DesignCon 2010.</li>
      </ol>
      {LAMINATE_SOURCES.length > 0 && <Sources items={LAMINATE_SOURCES} />}
    </>
  );
}
