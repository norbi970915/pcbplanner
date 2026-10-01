import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ToolPage } from '../components/ToolPage';
import { Big, Notes, NumField, Panel, Section } from '../components/ui';
import { parseS2p, sampleS2p, type S2pData, type S2pPoint } from '../lib/touchstone';
import { fmt } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = { f: 4 };
const MAX_FILE_BYTES = 5_000_000;

function displayDb(db: number) {
  return db === Infinity ? '∞' : db === -Infinity ? '−∞' : fmt(db, 2);
}

function TracePlot({ points, markerHz, kind }: { points: S2pPoint[]; markerHz: number; kind: 'insertion' | 'return' }) {
  const W = 760, H = 260, left = 57, right = 15, top = 29, bottom = 37;
  const f0 = points[0].fHz, f1 = points[points.length - 1].fHz;
  const fields = kind === 'insertion' ? (['s21Db', 's12Db'] as const) : (['s11Db', 's22Db'] as const);
  const traces = fields.map((field, i) => ({ name: field.toUpperCase(), field, colour: i ? 'var(--copper)' : 'var(--accent)', dash: i ? '5 4' : undefined }));
  let minRaw = Infinity, maxRaw = -Infinity, hasZeroMagnitude = false;
  for (const point of points) for (const field of fields) {
    const v = -point[field];
    if (v === Infinity) hasZeroMagnitude = true;
    else if (Number.isFinite(v)) { minRaw = Math.min(minRaw, v); maxRaw = Math.max(maxRaw, v); }
  }
  // Keep narrow notches in large files by plotting the minimum and maximum per horizontal bucket.
  const lo = Number.isFinite(minRaw) ? Math.max(-20, Math.min(110, Math.floor(minRaw / 10) * 10)) : 0;
  const hi = hasZeroMagnitude ? 120 : Number.isFinite(maxRaw) ? Math.max(lo + 10, Math.min(120, Math.ceil(maxRaw / 10) * 10)) : 120;
  const x = (f: number) => left + ((f - f0) / (f1 - f0 || 1)) * (W - left - right);
  const y = (v: number) => top + (1 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (H - top - bottom);
  const drawPoints = useMemo(() => {
    if (points.length <= 2_000) return points;
    const selected = new Set<number>([0, points.length - 1]);
    const bucketSize = Math.ceil(points.length / 700);
    for (let start = 0; start < points.length; start += bucketSize) {
      const end = Math.min(points.length, start + bucketSize);
      for (const field of fields) {
        let low = start, high = start;
        for (let i = start + 1; i < end; i++) {
          if (points[i][field] < points[low][field]) low = i;
          if (points[i][field] > points[high][field]) high = i;
        }
        selected.add(low); selected.add(high);
      }
    }
    return [...selected].sort((a, b) => a - b).map((i) => points[i]);
    // Fields are fixed for each plot kind.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, kind]);
  const path = (field: typeof fields[number]) => drawPoints.map((p, i) => {
    const v = -p[field];
    return `${i ? 'L' : 'M'}${x(p.fHz).toFixed(1)},${y(Number.isFinite(v) ? v : hi).toFixed(1)}`;
  }).join('');
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  const markerVisible = markerHz >= f0 && markerHz <= f1;

  return <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full max-w-[900px]" role="img" aria-label={`${kind === 'insertion' ? 'Insertion loss' : 'Return loss'} against frequency`}>
    {ticks.map((v) => <g key={v}>
      <line x1={left} x2={W - right} y1={y(v)} y2={y(v)} stroke="var(--line)" />
      <text x={left - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{v.toFixed(0)}</text>
    </g>)}
    {[0, 0.25, 0.5, 0.75, 1].map((t) => <g key={t}>
      <line x1={left + t * (W - left - right)} x2={left + t * (W - left - right)} y1={top} y2={H - bottom} stroke="var(--line)" />
      <text x={left + t * (W - left - right)} y={H - bottom + 15} textAnchor="middle" fontSize={11} fill="var(--muted)">{fmt((f0 + t * (f1 - f0)) / 1e9, 2)}</text>
    </g>)}
    <text x={left} y={16} fontSize={11} fill="var(--muted)">Loss (dB)</text>
    <text x={(left + W - right) / 2} y={H - 4} textAnchor="middle" fontSize={11} fill="var(--muted)">Frequency (GHz)</text>
    {traces.map((trace) => <g key={trace.name}>
      <path d={path(trace.field)} fill="none" stroke={trace.colour} strokeWidth={2} strokeDasharray={trace.dash} strokeLinejoin="round" />
      <line x1={left + traces.indexOf(trace) * 95} x2={left + 22 + traces.indexOf(trace) * 95} y1={23} y2={23} stroke={trace.colour} strokeWidth={2} strokeDasharray={trace.dash} />
      <text x={left + 27 + traces.indexOf(trace) * 95} y={27} fontSize={11} fill="var(--ink)">{trace.name}</text>
    </g>)}
    {markerVisible && <line x1={x(markerHz)} x2={x(markerHz)} y1={top} y2={H - bottom} stroke="var(--ink)" strokeDasharray="3 3" />}
    <rect x={left} y={top} width={W - left - right} height={H - top - bottom} fill="none" stroke="var(--line-strong)" />
  </svg>;
}

export default function SParameterViewer() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const [fileName, setFileName] = useState('');
  const [data, setData] = useState<S2pData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const readSeq = useRef(0);
  const marker = data ? sampleS2p(data.points, p.f * 1e9) : null;
  const importFile = async (file: File) => {
    const id = ++readSeq.current;
    setError(null);
    setData(null);
    setFileName('');
    try {
      if (!file.name.toLowerCase().endsWith('.s2p')) throw new Error('Choose a .s2p Touchstone file.');
      if (file.size > MAX_FILE_BYTES) throw new Error('The file is larger than the 5 MB viewer limit.');
      const parsed = parseS2p(await file.text());
      if (id !== readSeq.current) return;
      setData(parsed);
      setFileName(file.name);
    } catch (e) {
      if (id === readSeq.current) setError(e instanceof Error ? e.message : String(e));
    }
  };
  const clear = () => { ++readSeq.current; setData(null); setFileName(''); setError(null); reset(); };
  const notes: string[] = [];
  if (data && !marker) notes.push(`The ${fmt(p.f, 3)} GHz marker is outside this file's ${fmt(data.points[0].fHz / 1e9, 3)}–${fmt(data.points[data.points.length - 1].fHz / 1e9, 3)} GHz range.`);
  if (data && data.referenceOhms.some((z) => z !== 50)) notes.push(`This file uses ${data.referenceOhms.join(' / ')} Ω port references. Compare it with measurements and limits at the same reference impedance.`);
  const properties = <Section title="Frequency Marker">
    <NumField label="Frequency" value={p.f} onChange={(v) => set({ f: v })} unit="GHz" min={0} width={84} />
    <p className="text-faint">Choose a frequency in the file. Values between samples are interpolated in dB.</p>
  </Section>;

  return <ToolPage title="S-Parameter Viewer (.s2p)" description="Inspect insertion and return loss from a conventional two-port Touchstone file. View S21, S12, S11 and S22 at a chosen frequency without uploading the file." properties={properties} onReset={clear} status={data ? `${fileName} · ${data.points.length} frequency points · ${data.referenceOhms.join(' / ')} Ω reference` : 'No file loaded'} method={<Method />}>
    <Panel title="Touchstone File">
      <div className="space-y-2 px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">Open .s2p file</span>
          <input ref={fileInput} type="file" accept=".s2p" className="sr-only" aria-label="Choose .s2p file" onChange={(e) => { const file = e.target.files?.[0]; if (file) void importFile(file); e.target.value = ''; }} />
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>Choose file</button>
          <span className="min-w-0 break-all text-muted">{fileName || 'No file selected'}</span>
        </div>
        <p className="text-muted">The file stays in this browser tab. Supports S-parameter RI, MA and DB data in Touchstone 1.x or 2.x; 5 MB / 100,000 point limit.</p>
        {data && <p className="text-faint break-all">{fileName} · {fmt(data.points[0].fHz / 1e9, 3)}–{fmt(data.points[data.points.length - 1].fHz / 1e9, 3)} GHz · version {data.version} · {data.format} format</p>}
      </div>
    </Panel>
    <Notes kind="error" items={error ? [error] : []} />
    <Notes items={notes} />
    {data && <>
      <Panel title={`At ${fmt(p.f, 3)} GHz`}>
        {marker ? <div className="flex flex-wrap gap-6 px-3 py-3">
          <Big label="S21 insertion loss" value={displayDb(-marker.s21Db)} unit="dB" />
          <Big label="S12 reverse loss" value={displayDb(-marker.s12Db)} unit="dB" />
          <Big label="S11 return loss" value={displayDb(-marker.s11Db)} unit="dB" />
          <Big label="S22 return loss" value={displayDb(-marker.s22Db)} unit="dB" />
        </div> : <p className="px-3 py-3 text-muted">Set the frequency marker within the file range to see values here.</p>}
      </Panel>
      {data.points.length > 1 && <>
        <Panel title="Insertion Loss"><div className="px-2 py-2"><TracePlot points={data.points} markerHz={p.f * 1e9} kind="insertion" /></div></Panel>
        <Panel title="Return Loss"><div className="px-2 py-2"><TracePlot points={data.points} markerHz={p.f * 1e9} kind="return" /></div></Panel>
      </>}
      <p className="text-faint">The plots use positive loss in dB (−20 log₁₀ |S|). A negative insertion-loss value indicates gain. Zero magnitude is shown as ∞ dB. Plot values above 120 dB are clipped for display.</p>
    </>}
    {!data && !error && <p className="px-1 text-muted">Open a connector, via, package or measured two-port .s2p file to inspect its response.</p>}
    <p className="px-1 text-muted">Need the PCB trace estimate and a routing frequency? <Link to="/interface-rules">Open Interface Design Rules</Link>. Do not simply add this file’s loss to the trace estimate: mismatches and reference impedances affect a combined channel.</p>
  </ToolPage>;
}

function Method() {
  return <>
    <h2>What the viewer calculates</h2>
    <p>For each frequency, insertion loss is −20 log₁₀ |S21| and reverse loss is −20 log₁₀ |S12|. Return loss at the input and output is −20 log₁₀ |S11| and −20 log₁₀ |S22|. RI, MA and DB file values are converted to magnitudes before plotting. The frequency marker linearly interpolates displayed dB values between neighbouring points. No extrapolation or pass/fail assessment is performed.</p>
    <p>Touchstone 1.x two-port data uses S11, S21, S12, S22 order. For Touchstone 2.x, the reader follows [Two-Port Data Order] and accepts Full, Lower and Upper matrices. A symmetric matrix supplies the same S21 and S12. Mixed-mode data is not interpreted by this viewer.</p>
    <p>The plotted response is for the network represented by the imported file at its stated port references. It does not automatically include the PCB trace, other connectors, transmitter, receiver, or a de-embedding correction.</p>
    <h2>Reference</h2>
    <p><a href="https://ibis.org/touchstone_ver2.1/touchstone_ver2_1.pdf" target="_blank" rel="noreferrer">IBIS Open Forum, Touchstone File Format Specification, version 2.1</a>, sections on option lines, two-port data order and network parameters.</p>
  </>;
}
