import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CrossSection } from '../components/CrossSection';
import { FieldMap } from '../components/FieldMap';
import { ImpedanceSweep } from '../components/ImpedanceSweep';
import { ResultImageButtons } from '../components/ResultImageButtons';
import type { ResultCard } from '../lib/resultImage';
import { ToolPage } from '../components/ToolPage';
import { ComparisonButton, ComparisonPanel } from '../components/DesignComparison';
import { useDesignComparison } from '../state/useDesignComparison';
import { comparisonRow as row } from '../lib/designComparison';
import { Big, Check, LenField, Notes, NumField, Panel, Result, Section, Segmented, SelectField } from '../components/ui';
import { StackupPicker } from '../components/StackupPicker';
import { KicadProjectSource, type KicadPickValues } from '../components/KicadProjectSource';
import { impedancePatch } from '../lib/kicadProjectQueries';
import { microstripHJ, striplineAsym, striplineWheeler } from '../lib/closedform';
import type { Accuracy } from '../lib/fieldsolver';
import { delayPsPerMm, lineLC, nextCoefficient } from '../lib/signal';
import { runPooled, runSolver, useFieldSolve } from '../lib/solverClient';
import { geometryForLayer, type Stackup } from '../lib/stackups';
import { fmt, fromMm } from '../lib/units';
import { PlyEditor } from '../components/PlyEditor';
import { LAMINATES } from '../data/laminates';
import { averageDk, formatPlies, parsePlies, pliesThickness } from '../lib/plies';
import { IMPEDANCE_DEFAULTS as DEFAULTS, buildImpedanceGeometry as buildGeometry, materialDk as erOf } from '../lib/impedanceGeometry';
import { impedanceToleranceCorners } from '../lib/impedanceTolerance';
import { useSettings } from '../state/settings';
import { useUrlState } from '../state/useUrlState';

const MAT_OPTIONS = [{ value: 'custom', label: 'Custom εr', group: 'Custom' }, ...LAMINATES.map((l) => ({ value: l.id, label: `${l.vendor} ${l.name}`, group: l.cls }))];
const PAGE_DEFAULTS = { ...DEFAULTS, task: 'impedance' };
const TASKS = [{ value: 'impedance', label: 'Calculate impedance' }, { value: 'width', label: 'Find trace width' }, { value: 'spacing', label: 'Find pair spacing' }];

export default function Impedance() {
  const [raw, set, reset] = useUrlState(PAGE_DEFAULTS);
  // library materials replace the εr fields at the design frequency
  const p = useMemo(() => ({ ...raw, er: erOf(raw.mat, raw.er, raw.fq), er2: erOf(raw.mat2, raw.er2, raw.fq) }), [raw]);
  const usesLib =
    raw.mat !== 'custom' ||
    ((raw.type !== 'microstrip' || (raw.mode === 'diff' && raw.coupling === 'broadside')) && raw.mat2 !== 'custom') ||
    [...(parsePlies(raw.dl) ?? []), ...(raw.coupling === 'broadside' && raw.mode === 'diff' ? [] : parsePlies(raw.dl2) ?? [])].some((x) => x.mat);
  const { unit } = useSettings();
  const [stackNote, setStackNote] = useState<string | null>(null);
  const [kicadNote, setKicadNote] = useState<string | null>(null);
  const [solving, setSolving] = useState<null | 'w' | 's'>(null);
  const [solveErr, setSolveErr] = useState<string | null>(null);
  const [view, setView] = useState<'section' | 'field'>('section');
  const drawingRef = useRef<HTMLDivElement>(null);

  const broadside = p.mode === 'diff' && p.coupling === 'broadside';
  const type = (broadside ? 'stripline' : p.type) as 'microstrip' | 'embedded' | 'stripline';
  const resinActive = raw.resin && !broadside && type !== 'microstrip';
  const diff = p.mode === 'diff';
  const task = raw.task === 'width' ? 'width' : raw.task === 'spacing' && diff ? 'spacing' : 'impedance';
  const chooseTask = (task: string) => {
    setSolveErr(null);
    set({ task, ...(task === 'spacing' ? { mode: 'diff', target: raw.mode === 'se' && raw.target === 50 ? 100 : raw.target } : {}) });
  };
  const acc = p.acc as Accuracy;
  // stacked plies: the drawing and the closed-form check use the weighted average Dk
  const plyBelow = parsePlies(raw.dl) ?? [];
  const plyAbove = broadside ? [] : parsePlies(raw.dl2) ?? [];
  const erShown = plyBelow.length ? averageDk(plyBelow, p.er) : p.er;
  const er2Shown = plyAbove.length ? averageDk(plyAbove, p.er2) : p.er2;
  const hShown = plyBelow.length ? pliesThickness(plyBelow) : p.h;
  const h2Shown = plyAbove.length ? pliesThickness(plyAbove) : p.h2;
  const { geom, errors } = useMemo(() => buildGeometry(p), [p]);
  const targetRequest = useRef(0);
  const targetInputs = useRef('');
  targetInputs.current = JSON.stringify([geom, acc, p.target, task]);
  useEffect(() => () => { targetRequest.current++; }, []);
  const solveState = useFieldSolve(geom, { accuracy: acc, field: true, even: true });
  const r = geom ? solveState.result : null;
  const tolerance = useMemo(() => {
    if (!raw.tolEnabled || !geom) return { corners: null, error: null };
    if (!(raw.target > 0) || !(raw.tolLimit >= 0 && raw.tolLimit < 100)) {
      return { corners: null, error: 'Target impedance must be positive and the allowed tolerance must be from 0 to less than 100 %.' };
    }
    if (!(raw.tolW > 0 || raw.tolH > 0 || raw.tolDk > 0 || (geom.diff && raw.tolS > 0))) {
      return { corners: null, error: 'Enter at least one non-zero fabrication variation to check.' };
    }
    try {
      return { corners: impedanceToleranceCorners(geom, { widthMm: raw.tolW, heightPct: raw.tolH, dkPct: raw.tolDk, spacingMm: raw.tolS }), error: null };
    } catch (error) {
      return { corners: null, error: error instanceof Error ? error.message : 'Check the fabrication variations.' };
    }
  }, [geom, raw.tolEnabled, raw.target, raw.tolLimit, raw.tolW, raw.tolH, raw.tolDk, raw.tolS]);
  const toleranceKey = JSON.stringify([tolerance.corners, acc]);
  const [toleranceState, setToleranceState] = useState<{ key: string; values: number[]; error: string | null }>({ key: '', values: [], error: null });
  const toleranceSeq = useRef(0);
  useEffect(() => {
    const sequence = ++toleranceSeq.current;
    if (!tolerance.corners) return;
    const corners = tolerance.corners;
    const timer = setTimeout(() => {
      void Promise.all(corners.map((corner) => runPooled({ type: 'solve', geom: corner, opts: { accuracy: acc, field: false, even: false } }))).then((responses) => {
        if (sequence !== toleranceSeq.current) return;
        const values = responses.map((response) => response.ok && response.result
          ? (geom!.diff ? response.result.zdiff : response.result.se?.z) ?? NaN
          : NaN);
        const valid = values.every(Number.isFinite);
        setToleranceState({
          key: toleranceKey,
          values: valid ? values : [],
          error: valid ? null : 'A fabrication corner could not be solved. Reduce the variation or check the geometry.',
        });
      }).catch(() => {
        if (sequence === toleranceSeq.current) setToleranceState({ key: toleranceKey, values: [], error: 'The fabrication corners could not be solved. Try again with smaller variations.' });
      });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toleranceKey]);

  const z = r ? (diff ? r.zdiff : r.se?.z) : undefined;
  const eeff = r ? (diff ? r.odd?.eeff : r.se?.eeff) : undefined;
  const zLine = r ? (diff ? r.odd?.z : r.se?.z) : undefined;
  const lc = zLine && eeff ? lineLC(zLine, eeff) : null;

  // closed-form cross-check (single-ended, no coplanar ground)
  let cf: { z: number; name: string } | null = null;
  if (!diff && !p.cpw && geom && !plyBelow.length && !plyAbove.length && !resinActive) {
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
    const asPlies = (ps?: { t: number; er: number }[]) => (ps && ps.length > 1 ? formatPlies(ps.map((x) => ({ t: x.t, dk: x.er }))) : '');
    set({
      type: g.type,
      coupling: 'edge',
      resin: false,
      h: g.h,
      er: g.er,
      dl: asPlies(g.below),
      dl2: asPlies(g.above),
      mat: 'custom',
      t: g.t,
      ...(g.h2 !== undefined ? { h2: g.h2, er2: g.er2 ?? g.er, mat2: 'custom' } : {}),
      ...(g.type === 'microstrip' ? { mask: !!g.mask, ...(g.mask ? { c1: g.mask.c1, c2: g.mask.c2, erm: g.mask.er } : {}) } : {}),
    });
    setStackNote(g.note);
  };

  // From KiCad project: the layer's cross-section, and W (and S) from the routed pair or net, or the net class
  const applyKicad = (v: KicadPickValues) => {
    const r = impedancePatch(v, raw);
    if (!r) {
      setKicadNote('That layer has no reference plane in the KiCad project.');
      return;
    }
    set(r.patch);
    setKicadNote(r.note);
  };

  const solveFor = async (param: 'w' | 's') => {
    if (!geom || !(p.target > 0) || !Number.isFinite(p.target)) return;
    const request = ++targetRequest.current;
    const signature = targetInputs.current;
    setSolving(param);
    setSolveErr(null);
    try {
      const res = await runSolver({ type: 'target', geom, opts: { accuracy: acc, field: false, even: false }, param, target: p.target });
      if (request !== targetRequest.current || signature !== targetInputs.current) return;
      if (res.ok && res.value && Number.isFinite(res.value)) set(param === 'w' ? { w: res.value } : { s: res.value });
      else setSolveErr(res.ok ? 'No solution was found for this target and geometry.' : res.error);
    } catch {
      if (request === targetRequest.current && signature === targetInputs.current) setSolveErr('The target could not be solved. Try again.');
    } finally {
      if (request === targetRequest.current) setSolving(null);
    }
  };

  const toUnit = (mm: number) => fromMm(mm, unit);
  const busy = solveState.busy || solving !== null;
  const dev = z && p.target > 0 ? (100 * (z - p.target)) / p.target : null;
  const toleranceValues = toleranceState.key === toleranceKey && !busy && z ? [...toleranceState.values, z] : [];
  const toleranceMin = toleranceValues.length ? Math.min(...toleranceValues) : null;
  const toleranceMax = toleranceValues.length ? Math.max(...toleranceValues) : null;
  const toleranceLowLimit = p.target * (1 - raw.tolLimit / 100);
  const toleranceHighLimit = p.target * (1 + raw.tolLimit / 100);
  const tolerancePass = toleranceMin !== null && toleranceMax !== null && toleranceMin >= toleranceLowLimit && toleranceMax <= toleranceHighLimit;

  // the PNG card: headline result, the inputs that define the line, and the drawing on screen
  const resultCard = (): ResultCard | null => {
    if (!z || !eeff) return null;
    const L = (mm: number) => `${fmt(fromMm(mm, unit), 4)} ${unit}`;
    const structure = [
      type === 'microstrip' ? (p.mask ? 'Surface microstrip, solder-mask coated' : 'Surface microstrip') : type === 'embedded' ? 'Embedded microstrip' : 'Stripline',
      ...(diff ? [broadside ? 'broadside differential pair' : 'differential pair'] : []),
      ...(!broadside && p.cpw ? ['coplanar ground'] : []),
    ].join(', ');
    const rows: [string, string][] = [
      ['Structure', structure],
      ['Trace width W', L(p.w) + (p.etch > 0 ? ` (etch ${L(p.etch)})` : '')],
      ['Copper thickness T', L(p.t)],
      ...(resinActive ? [['Resin-region Dk', fmt(raw.resinDk, 4)], ['Resin above copper R', L(raw.resinAbove)]] as [string, string][] : []),
      ['Dielectric below H', `${L(hShown)}, Dk ${fmt(erShown, 3)}`],
      ...(type !== 'microstrip' && !broadside ? [['Dielectric above H2', `${L(h2Shown)}, Dk ${fmt(er2Shown, 3)}`] as [string, string]] : []),
      ...(diff ? [[broadside ? 'Inter-layer gap S' : 'Pair spacing S', L(p.s)] as [string, string]] : []),
      ...(!broadside && p.cpw ? [['Gap to coplanar ground G', L(p.gap)] as [string, string]] : []),
      ...(type === 'microstrip' && p.mask ? [['Solder mask', `${L(p.c2)} over the trace, Dk ${fmt(p.erm, 3)}`] as [string, string]] : []),
    ];
    const sub = [
      ...(dev !== null && Number.isFinite(dev) ? [`${dev >= 0 ? '+' : ''}${fmt(dev, 3)} % from the ${fmt(p.target, 4)} Ω target`] : []),
      `εeff ${fmt(eeff, 4)}`,
      `${fmt(delayPsPerMm(eeff), 4)} ps/mm`,
    ].join(' · ');
    return {
      tool: 'Impedance Calculator',
      headline: { label: diff ? 'Differential impedance Zdiff' : 'Characteristic impedance Z0', value: fmt(z, 4), unit: 'Ω' },
      sub,
      rows,
      drawing: drawingRef.current?.querySelector('svg, canvas') as SVGSVGElement | HTMLCanvasElement | null,
      path: '/impedance',
    };
  };

  const comparison = useDesignComparison('/impedance', {
    state: raw,
    inputs: [
      row('type', 'Line type', type), row('mode', 'Signal', diff ? 'Differential' : 'Single-ended'),
      ...(diff ? [row('coupling', 'Pair coupling', broadside ? 'Broadside' : 'Edge-coupled'), row('s', broadside ? 'Inter-layer gap' : 'Edge gap', p.s, 'mm')] : []),
      row('w', 'Trace width', p.w, 'mm'), row('t', 'Copper thickness', p.t, 'mm'), row('etch', 'Etch', p.etch, 'mm'),
      row('h', 'Lower dielectric height', hShown, 'mm'), row('er', 'Lower dielectric Dk', erShown),
      row('dl', 'Lower dielectric plies', raw.dl || 'Single dielectric'),
      ...(!broadside && type !== 'microstrip' ? [row('h2', 'Upper dielectric height', h2Shown, 'mm'), row('er2', 'Upper dielectric Dk', er2Shown), row('dl2', 'Upper dielectric plies', raw.dl2 || 'Single dielectric')] : []),
      ...(broadside ? [row('er2', 'Inter-layer Dk', p.er2)] : []),
      ...(type === 'microstrip' ? [row('mask', 'Solder mask', p.mask), ...(p.mask ? [row('c1', 'Mask over substrate', p.c1, 'mm'), row('c2', 'Mask over trace', p.c2, 'mm'), row('erm', 'Mask Dk', p.erm)] : [])] : []),
      ...(!broadside ? [row('cpw', 'Coplanar ground', p.cpw), ...(p.cpw ? [row('gap', 'Coplanar gap', p.gap, 'mm')] : [])] : []),
      ...(!broadside && type !== 'microstrip' ? [row('resin', 'Planar resin-rich layer', resinActive), ...(resinActive ? [row('resinDk', 'Resin-region Dk', raw.resinDk), row('resinAbove', 'Resin above copper', raw.resinAbove, 'mm')] : [])] : []),
      row('target', 'Target impedance', p.target, '\u03a9'), row('acc', 'Mesh accuracy', p.acc),
      ...(usesLib ? [row('fq', 'Material frequency', p.fq, 'GHz')] : []),
    ],
    results: [
      row(diff ? 'zdiff' : 'z0', diff ? 'Differential impedance' : 'Characteristic impedance', z ?? null, '\u03a9'),
      row(diff ? 'eeff-odd' : 'eeff-se', diff ? 'Effective Dk (odd)' : 'Effective Dk', eeff ?? null),
      row('target-error', 'Deviation from target', dev, '%'),
      row('delay', 'Propagation delay', eeff ? delayPsPerMm(eeff) : null, 'ps/mm'),
      ...(diff ? [row('zodd', 'Odd-mode impedance', r?.odd?.z ?? null, '\u03a9'), row('zeven', 'Even-mode impedance', r?.even?.z ?? null, '\u03a9'), row('zcomm', 'Common-mode impedance', r?.zcomm ?? null, '\u03a9')] : []),
    ],
  }, !!geom && !!z && !busy && !solveState.error, set);

  const properties = (
    <>
      <Section title="Task">
        <SelectField label="Working mode" value={task} onChange={chooseTask} options={TASKS} width={184} />
      </Section>
      <Section title="Structure">
        {!broadside && <SelectField
          label="Line type"
          value={type}
          onChange={(v) => set({ type: v, ...(v === 'microstrip' ? { resin: false } : {}) })}
          options={[
            { value: 'microstrip', label: 'Surface microstrip' },
            { value: 'embedded', label: 'Embedded microstrip' },
            { value: 'stripline', label: 'Stripline' },
          ]}
        />}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <span className="text-muted">Signal</span>
          <Segmented
            label="Signal type"
            value={p.mode as 'se' | 'diff'}
            onChange={(v) => set({ mode: v, ...(v === 'se' ? { coupling: 'edge', ...(task === 'spacing' ? { task: 'impedance' } : {}) } : {}), target: v === 'diff' ? (p.target === 50 ? 100 : p.target) : [85, 90, 100].includes(p.target) ? 50 : p.target })}
            options={[
              { value: 'se', label: 'Single-ended' },
              { value: 'diff', label: 'Differential' },
            ]}
          />
        </div>
        {diff && <SelectField label="Pair coupling" value={broadside ? 'broadside' : 'edge'}
          onChange={(coupling) => set({ coupling, ...(coupling === 'broadside' ? { type: 'stripline', cpw: false, resin: false } : {}) })}
          options={[{ value: 'edge', label: 'Edge-coupled (same layer)' }, { value: 'broadside', label: 'Broadside (two layers)' }]} />}
        {broadside ? <p className="text-faint">Balanced shielded stripline: matching, aligned traces on two signal layers between ground planes. Outer dielectric plies and trace etch are mirrored.</p>
          : <Check label="Coplanar ground on trace layer" checked={p.cpw} onChange={(v) => set({ cpw: v })} />}
        {type === 'microstrip' && <Check label="Solder mask coating" checked={p.mask} onChange={(v) => set({ mask: v })} />}
      </Section>
      <Section title={task === 'impedance' ? 'Target comparison' : 'Solve to target'}>
        <NumField label={diff ? 'Target Zdiff' : 'Target Z0'} value={p.target} onChange={(v) => set({ target: v })} unit="Ω" />
        {task !== 'impedance' && <div className="flex justify-end pt-1"><button type="button" className="btn btn-primary" disabled={!geom || busy || !(p.target > 0)} onClick={() => void solveFor(task === 'width' ? 'w' : 's')}>
          {solving ? 'Solving…' : task === 'width' ? 'Solve Width' : 'Solve Spacing'}
        </button></div>}
        {task === 'impedance' && <p className="text-faint">Used to show deviation. Choose Find trace width or Find pair spacing to solve a dimension.</p>}
      </Section>
      <Section title="Conductor">
        <div className={task === 'width' ? 'solve-variable' : undefined}>
          {task === 'width' && <p className="solve-variable-label">Solved variable · W</p>}
          <LenField label={broadside ? "Width (outer face)" : "Width (bottom)"} hint="Copper trace width. The cross-section is schematic; use the numerical dimensions for fabrication." symbol="W" value={p.w} onChange={(v) => set({ w: v })} />
          {task === 'width' && <p className="text-faint">Solve Width replaces this starting value.</p>}
        </div>
        <LenField label={broadside ? "Etch (W - facing)" : "Etch (W − top)"} diagramKey="etch" value={p.etch} onChange={(v) => set({ etch: v })} allowZero hint={broadside ? "Mirrored etch: each face toward the inter-layer gap is narrower by this amount. Set zero for rectangular copper." : "Trapezoidal etch: the top of the trace is narrower by this amount. 0.5 mil is typical for 1 oz."} />
        <LenField label="Thickness" hint="Copper thickness after processing. Selecting oz converts copper weight to an approximate thickness." symbol="T" value={p.t} onChange={(v) => set({ t: v })} units={['mm', 'mil', 'um', 'oz']} />
        {diff && <div className={task === 'spacing' ? 'solve-variable' : undefined}>
          {task === 'spacing' && <p className="solve-variable-label">Solved variable · S</p>}
          <LenField label={broadside ? "Inter-layer gap" : "Spacing"} hint="For edge-coupled pairs, the copper edge-to-edge gap. For broadside pairs, the copper-to-copper inter-layer gap." symbol="S" value={p.s} onChange={(v) => set({ s: v })} />
          {task === 'spacing' && <p className="text-faint">Solve Spacing replaces this starting value.</p>}
        </div>}
        {!broadside && p.cpw && <LenField label="Coplanar gap" symbol="G" value={p.gap} onChange={(v) => set({ gap: v })} />}
      </Section>
      <Section title={broadside ? 'Outer Dielectric (both sides)' : type === 'stripline' ? 'Dielectric Below' : 'Dielectric'}>
        <Check
          label="Stacked plies (different Dk)"
          checked={!!plyBelow.length}
          onChange={(v) => set({ dl: v ? formatPlies([{ t: p.h / 2, dk: p.er }, { t: p.h / 2, dk: p.er }]) : '' })}
          hint="Model each prepreg or core between the plane and the trace separately, with its own Dk."
        />
        {plyBelow.length ? (
          <PlyEditor value={raw.dl} onChange={(v) => set({ dl: v })} firstLabel="plane" materials={MAT_OPTIONS.slice(1)} resolve={(m) => ({ dk: erOf(m, 4, raw.fq) })} />
        ) : (
          <>
            <LenField label={type === 'stripline' ? 'Plane to trace' : 'Height to plane'} hint="Dielectric distance from the nearest copper trace face to the reference plane; copper thickness is separate." symbol="H" value={p.h} onChange={(v) => set({ h: v })} />
            <SelectField label="Material" value={raw.mat} onChange={(v) => set({ mat: v })} options={MAT_OPTIONS} width={176} />
            {raw.mat === 'custom' ? (
              <NumField label="Dielectric constant" diagramKey="er" hint="Relative permittivity (Dk). Use a laminate value appropriate for your signal frequency." symbol="εr" value={p.er} onChange={(v) => set({ er: v })} min={1} allowZero />
            ) : (
              <p className="text-faint">εr = {fmt(p.er, 4)} at {fmt(raw.fq, 4)} GHz</p>
            )}
          </>
        )}
      </Section>
      {broadside && <Section title="Between Signal Layers">
        <SelectField label="Material" value={raw.mat2} onChange={(mat2) => set({ mat2 })} options={MAT_OPTIONS} width={176} />
        {raw.mat2 === 'custom' ? <NumField label="Dielectric constant" diagramKey="er2" symbol="Dk" value={p.er2} onChange={(er2) => set({ er2 })} min={1} allowZero />
          : <p className="text-faint">Dk = {fmt(p.er2, 4)} at {fmt(raw.fq, 4)} GHz</p>}
        <p className="text-faint">S is the dielectric gap between the facing copper surfaces. H is the clearance from each outer copper surface to its ground plane.</p>
      </Section>}
      {!broadside && type !== 'microstrip' && (
        <Section title={type === 'stripline' ? 'Dielectric Above' : 'Cover Dielectric'}>
          <Check
            label="Stacked plies (different Dk)"
            checked={!!plyAbove.length}
            onChange={(v) => set({ dl2: v ? formatPlies([{ t: p.h2 / 2, dk: p.er2 }, { t: p.h2 / 2, dk: p.er2 }]) : '' })}
            hint="Model each prepreg or core between the trace and the layer above separately."
          />
          {plyAbove.length ? (
            <PlyEditor value={raw.dl2} onChange={(v) => set({ dl2: v })} firstLabel="trace" materials={MAT_OPTIONS.slice(1)} resolve={(m) => ({ dk: erOf(m, 4, raw.fq) })} />
          ) : (
            <>
              <LenField label={type === 'stripline' ? 'Trace to plane' : 'Cover thickness'} hint="Dielectric distance between the trace and the upper reference plane or cover boundary." symbol="H2" value={p.h2} onChange={(v) => set({ h2: v })} />
              <SelectField label="Material" value={raw.mat2} onChange={(v) => set({ mat2: v })} options={MAT_OPTIONS} width={176} />
              {raw.mat2 === 'custom' ? (
                <NumField label="Dielectric constant" diagramKey="er2" hint="Relative permittivity (Dk). Use a laminate value appropriate for your signal frequency." symbol="εr" value={p.er2} onChange={(v) => set({ er2: v })} min={1} allowZero />
              ) : (
                <p className="text-faint">εr = {fmt(p.er2, 4)} at {fmt(raw.fq, 4)} GHz</p>
              )}
            </>
          )}
        </Section>
      )}
      {!broadside && type !== 'microstrip' && <Section title="Resin-rich Layer">
        <Check label="Model a planar resin-rich layer" checked={raw.resin} onChange={(resin) => set({ resin })}
          hint="Replace the dielectric beside the copper and, optionally, just above it with a separate Dk. The plane positions stay fixed." />
        {raw.resin && <>
          <NumField label="Resin-region Dk" diagramKey="resindk" value={raw.resinDk} onChange={(resinDk) => set({ resinDk })} min={1} max={1000} allowZero
            hint="Enter the Dk of the local resin-rich region at your signal frequency. The laminate library describes glass/resin composites, not this region." />
          <LenField label="Resin above copper" diagramKey="resinabove" symbol="R" value={raw.resinAbove} onChange={(resinAbove) => set({ resinAbove })} allowZero max={h2Shown}
            hint="Extra resin thickness above the trace top, included within H2. Zero still models resin beside the full copper height T. H and H2 do not increase." />
          <p className="text-faint">Use fabricator data, or treat these as assumptions. This is a flat band across the signal layer; it does not predict resin flow or glass-weave skew.</p>
          <Link to="/guides/resin-rich-layer-impedance">How to choose and interpret these inputs</Link>
        </>}
      </Section>}
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
      <KicadProjectSource pick={['layer', 'netclass', 'pair']} onApply={applyKicad} note={kicadNote} />
      <Section title="From Stackup">
        <StackupPicker onApply={applyLayer} />
        {broadside && <p className="text-faint">Applying a single stackup layer switches back to edge coupling. Broadside uses two signal layers; enter their balanced cross-section here.</p>}
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
        <p className="text-faint">Normal agrees within about 1 % on the coated-microstrip reference cases shown in the method. Broadside is checked against symmetry and parallel-plate limits. Use High to check mesh convergence.</p>
      </Section>
      <Section title="Fabrication Tolerance" defaultOpen={false}>
        <Check label="Check impedance variation" checked={raw.tolEnabled} onChange={(tolEnabled) => set({ tolEnabled })} />
        {raw.tolEnabled && <>
          <LenField label="Trace width ±" value={raw.tolW} onChange={(tolW) => set({ tolW })} allowZero />
          {diff && <LenField label={broadside ? "Inter-layer gap ±" : "Pair spacing ±"} value={raw.tolS} onChange={(tolS) => set({ tolS })} allowZero />}
          <NumField label="Dielectric height ±" value={raw.tolH} onChange={(tolH) => set({ tolH })} unit="%" allowZero />
          <NumField label="Dielectric Dk ±" value={raw.tolDk} onChange={(tolDk) => set({ tolDk })} unit="%" allowZero />
          <NumField label="Allowed impedance ±" value={raw.tolLimit} onChange={(tolLimit) => set({ tolLimit })} unit="%" allowZero />
          <p className="text-faint">Enter your fabricator's limits. A zero variation is ignored. Dielectric height scales every ply; Dk changes every dielectric by the entered percentage.</p>
        </>}
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
      description="Calculate PCB trace impedance, or find the width or pair spacing needed to meet a target, using a 2D field solver."
      onReset={reset}
      properties={properties}
      status={status}
      reportBusy={busy}
      method={<Method />}
    >
      <div className="tool-task-picker" role="group" aria-label="Impedance task">
        {TASKS.map(option => <button key={option.value} type="button" className={`btn ${task === option.value ? 'btn-primary' : ''}`} aria-pressed={task === option.value} onClick={() => chooseTask(option.value)}>{option.label}</button>)}
        <p className="text-muted">{task === 'impedance' ? 'Dimensions → impedance. Results update as you edit.' : task === 'width' ? 'Target impedance + stackup → trace width W. Set the inputs, then press Solve Width.' : 'Target impedance + width + stackup → pair spacing S. Set the inputs, then press Solve Spacing.'}</p>
      </div>
      <Notes kind="error" items={[...errors, ...(solveState.error && geom ? [solveState.error] : []), ...(solveErr ? [solveErr] : [])]} />
      <div className="grid gap-3 2xl:grid-cols-2">
        <Panel
          title="Results"
          right={
            <span className="flex items-center gap-1">
              <ResultImageButtons card={resultCard} fileName={`pcbplanner-impedance-${z ? fmt(z, 4).replace(/[^0-9.]/g, '') : 'result'}-ohm.png`} disabled={!z || busy} />
              <ComparisonButton comparison={comparison} />
            </span>
          }
        >
          <div className="flex flex-wrap items-end gap-x-8 gap-y-2 px-2.5 pb-1 pt-2">
            <Big label={diff ? 'Differential impedance Zdiff' : 'Characteristic impedance Z0'} value={z ? fmt(z, 4) : '—'} unit="Ω" busy={busy} />
            {task !== 'impedance' && <Big label={task === 'width' ? 'Trace width W' : broadside ? 'Inter-layer gap S' : 'Pair spacing S'} value={fmt(toUnit(task === 'width' ? p.w : p.s), 5)} unit={unit} busy={busy} />}
            <Big label="Effective εr" value={eeff ? fmt(eeff, 4) : '—'} unit="" busy={busy} />
          </div>
          <div className="px-2.5 pb-2">
            {dev !== null && Number.isFinite(dev) && (
              <span className={Math.abs(dev) <= 5 ? 'text-ok' : 'text-muted'}>
                {dev >= 0 ? '+' : ''}
                {fmt(dev, 3)} % from the {fmt(p.target, 4)} Ω target{Math.abs(dev) <= 10 ? ' (typical fab tolerance ±10 %)' : ''}
              </span>
            )}
            {z && !busy && <div className="pt-1"><Link to={`/termination?kind=${diff ? 'differential' : 'source'}&z0=${Number(z.toPrecision(7))}&chosen=${Number((diff ? z : Math.max(0, z - 17)).toPrecision(7))}&swing=${diff ? 0.4 : 3.3}&handoff=1`}>Size a termination for this {diff ? 'pair' : 'trace'} →</Link></div>}
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
          <div className="p-2" ref={drawingRef}>
            {view === 'section' || !r?.field || !geom ? (
              <CrossSection
                spec={{ type, diff, coupling: broadside ? 'broadside' : 'edge', w: p.w, wTop: p.w - p.etch, t: p.t, s: p.s, h: hShown, h2: broadside ? hShown : h2Shown, er: erShown, er2: broadside ? p.er2 : er2Shown, mask: p.mask, cpw: !broadside && p.cpw, gap: p.gap, resin: resinActive && geom ? { above: raw.resinAbove, er: raw.resinDk } : undefined }}
                unitLabel={unit}
                toUnit={toUnit}
              />
            ) : (
              <FieldMap field={r.field} geom={geom} />
            )}
          </div>
        </Panel>
      </div>
      <ImpedanceSweep geom={geom} acc={acc} param={raw.sw} onParam={(sw) => set({ sw })} target={p.target} currentZ={busy ? undefined : z} unit={unit} />
      <ComparisonPanel comparison={comparison} />
      {raw.tolEnabled && <Panel title="Fabrication Tolerance Check" className="mt-3">
        {tolerance.error ? <p className="px-3 py-3 text-muted">{tolerance.error}</p> : toleranceState.error && toleranceState.key === toleranceKey ? <p className="px-3 py-3 text-[var(--err-line)]">{toleranceState.error}</p> : toleranceMin === null || toleranceMax === null ? <p aria-busy="true" className="px-3 py-3 text-muted">Checking {tolerance.corners?.length ?? 0} fabrication corners…</p> : <>
          <div className="flex flex-wrap gap-8 px-3 py-3">
            <Big label="Estimated low" value={fmt(toleranceMin, 4)} unit="Ω" />
            <Big label="Estimated high" value={fmt(toleranceMax, 4)} unit="Ω" />
          </div>
          <table className="tbl"><tbody>
            <Result label="Allowed band" value={`${fmt(toleranceLowLimit, 4)}–${fmt(toleranceHighLimit, 4)} Ω`} sub={`${fmt(p.target, 4)} Ω ±${fmt(raw.tolLimit, 3)} %`} />
            <Result label="Corner check" value={tolerancePass ? 'Within allowed band' : 'Outside allowed band'} strong sub={`${tolerance.corners?.length ?? 0} combinations of the entered endpoints`} />
          </tbody></table>
          <p className="px-3 py-2 text-faint">Screening estimate from the field solver at each endpoint combination. Copper thickness, etch, solder mask and coplanar gap stay fixed. Confirm limits and final impedance with your fabricator.</p>
        </>}
      </Panel>}
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
        For an edge-coupled differential pair the solver runs twice, using the symmetry plane between the traces. An electric wall gives the odd mode and a magnetic wall gives the even mode. Broadside pairs instead drive both vertically aligned traces explicitly, with opposite voltages for odd mode and equal voltages for even mode:
      </p>
      <div className="eq">
        <span className="no">(2)</span>
        <i>Z</i>
        <sub>diff</sub> = 2 <i>Z</i>
        <sub>odd</sub>,&nbsp;&nbsp; <i>Z</i>
        <sub>comm</sub> = <i>Z</i>
        <sub>even</sub> / 2
      </div>
      <h3>Broadside differential pairs</h3>
      <p>Broadside means the two traces sit on different copper layers. This model is a balanced shielded stripline: two ground planes, equal outer clearances, matching trace dimensions, mirrored etch and mirrored outer dielectric plies. The central dielectric can have a different Dk. S is the copper-to-copper vertical gap. Width solving changes both traces; spacing solving moves the upper trace and its ground plane together while preserving H and copper thickness.</p>
      <p>Offset traces, unequal copper widths or thicknesses, asymmetric dielectrics, and unshielded broadside pairs are outside this model. The fabrication corner check varies both traces together and keeps the pair balanced; it does not model registration error or imbalance between layers.</p>
      <p>Broadside tests check the odd-mode symmetry against an equivalent half-height stripline, homogeneous-dielectric scaling, the wide-trace parallel-plate limits for both modes, and mesh convergence. The coated-microstrip comparison below is a separate validation and does not establish broadside accuracy against commercial tools. See <a href="https://www.polarinstruments.com/support/cits/AP143.pdf" target="_blank" rel="noreferrer">Polar application note 143</a> for the distinction between balanced and unbalanced pairs.</p>
      <h3>Planar resin-rich layer</h3>
      <p>The optional internal-layer model replaces a flat band from the trace bottom to T + R above it with the entered resin-region Dk. H and H2 keep their original meanings and the planes do not move. R is measured from the trace top, so the remaining upper dielectric is H2 minus R. A zero R still fills the space beside the copper with resin. Upper plies are split at that boundary; lower plies are unchanged.</p>
      <p>This is an explicit dielectric geometry solved by the same field solver, not an empirical impedance correction. It supports single-ended and edge-coupled internal traces, including coplanar ground. Surface microstrip and broadside pairs are outside this option. The resin Dk is a fixed user input at the frequency of interest; it is not inferred from a laminate name or resin percentage. See the <Link to="/guides/resin-rich-layer-impedance">resin-rich layer guide</Link> for assumptions and references.</p>
      <p>Width and spacing solves preserve the band. Height sweeps and fabrication-height endpoints scale R with H2 while keeping copper thickness fixed; Dk sweeps and endpoints scale every dielectric, including the resin region. No independent resin-process tolerance is inferred. Tests check equal-material limits, thin-layer convergence and the wide-strip parallel-plate limit. The coated-microstrip comparisons below do not establish accuracy for resin-rich layers on manufactured boards.</p>
      <h3>Validation</h3>
      <p>These results were compared with a commercial 2D field solver on solder-mask coated microstrip:</p>
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
      <p>The optional fabrication tolerance check solves every combination of the entered trace-width, dielectric-height, Dk and pair-spacing endpoints. It reports the lowest and highest solved impedance against the allowed band around the target. It is an endpoint screening estimate, not a statistical yield or a fabrication guarantee; thickness, etch, mask and coplanar-gap variations are held fixed. Ask the fabricator for realistic variation limits. <a href="https://www.rogerscorp.com/blog/2017/the-role-of-pcb-materials-in-printed-circuit-impedance" target="_blank" rel="noreferrer">Rogers explains how material and geometry variation affect impedance</a>.</p>
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
