import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SiField } from '../components/SiField';
import { Sources } from '../components/Sources';
import { ToolPage } from '../components/ToolPage';
import { Big, Check, Notes, NumField, Panel, Result, Section, Segmented, SelectField, TextField } from '../components/ui';
import type { DataSource } from '../data/source';
import {
  combineSnrDb,
  decodePoints,
  encodePoints,
  enobFromSnr,
  integratePhaseNoise,
  jitterBudget,
  jitterForSnr,
  jitterSnrDb,
  parseFrequency,
  parseLevel,
  parseList,
  parsePastedPoints,
  type PhaseJitter,
  type PnPoint,
} from '../lib/jitter';
import { fmt, si } from '../lib/units';
import { RESET_EVENT, useUrlState } from '../state/useUrlState';

// Default curve: the Wenzel Sprinter 100 MHz oscillator of ADI MT-008 Figure 7.
const DEFAULT_PN = encodePoints([
  { f: 100, l: -120 },
  { f: 1e3, l: -150 },
  { f: 1e4, l: -165 },
  { f: 2e8, l: -165 },
]);

const DEFAULTS = {
  fc: 100e6,
  pn: DEFAULT_PN,
  band: 'sonet',
  fl: 12e3,
  fh: 20e6,
  ext: false,
  fin: 100e6,
  tap: 0, // ADC aperture jitter, fs
  snra: 0, // ADC SNR without clock jitter, dBFS; 0 = not given
  snrt: 74, // target SNR, dB
  rj: '',
  dj: '',
  incl: true,
  ber: 1e-12,
  lim: 0.3,
  limu: 'ui',
  rate: 10, // Gb/s
};

type Band = 'sonet' | 'adc' | 'custom';

const bandLimits = (band: Band, fc: number, fl: number, fh: number): [number, number] =>
  band === 'sonet' ? [12e3, 20e6] : band === 'adc' ? [100, 2 * fc] : [fl, fh];

/** Short text for an offset frequency in the point editor: 12k, 1.5M, 100. */
function freqText(f: number): string {
  const [m, p] = f >= 1e9 ? [1e9, 'G'] : f >= 1e6 ? [1e6, 'M'] : f >= 1e3 ? [1e3, 'k'] : [1, ''];
  return `${Number((f / m).toPrecision(7))}${p}`;
}

/** 1e-12 → 10⁻¹², 2.5e-12 → 2.5 × 10⁻¹² */
function berText(ber: number) {
  const [m, e] = ber.toExponential(3).split('e');
  const mant = Number(m);
  return (
    <>
      {mant === 1 ? '' : `${mant} × `}10<sup>{Number(e)}</sup>
    </>
  );
}

const split = (v: number, unit: string, sig = 4) => {
  const [num, u] = si(v, unit, sig).split(' ');
  return { num, u };
};

export default function ClockJitter() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const band: Band = p.band === 'adc' || p.band === 'custom' ? p.band : 'sonet';
  const [fLow, fHigh] = bandLimits(band, p.fc, p.fl, p.fh);
  const decoded = useMemo(() => decodePoints(p.pn), [p.pn]);
  const jr = useMemo(
    () => (decoded === null ? ({ ok: false, error: 'The phase noise points in the link could not be read; reset the tool or re-enter them.' } as const) : integratePhaseNoise(decoded, p.fc, fLow, fHigh, p.ext)),
    [decoded, p.fc, fLow, fHigh, p.ext],
  );
  const pj: PhaseJitter | null = jr.ok ? jr.value : null;

  const errors: string[] = [];
  const notes: string[] = [];
  if (!jr.ok) errors.push(jr.error);
  if (pj?.extended) notes.push(`Above ${si(pj.points[pj.points.length - 1].f, 'Hz', 4)} the last level, ${fmt(pj.points[pj.points.length - 1].l, 4)} dBc/Hz, is held flat to the upper limit. That is right only if the curve has reached its noise floor there.`);

  // ADC
  const adcErr: string[] = [];
  if (!(p.fin > 0)) adcErr.push('Input frequency must be greater than 0.');
  if (!(p.tap >= 0)) adcErr.push('Aperture jitter cannot be negative.');
  if (!(p.snra >= 0)) adcErr.push('ADC SNR cannot be negative; enter 0 to leave it out.');
  const tAp = p.tap * 1e-15;
  const sigmaTotal = pj ? Math.hypot(pj.seconds, tAp) : NaN;
  const snrJ = pj && adcErr.length === 0 ? jitterSnrDb(p.fin, sigmaTotal) : NaN;
  const snrT = Number.isFinite(snrJ) && p.snra > 0 ? combineSnrDb(snrJ, p.snra) : NaN;
  const sigmaReq = p.fin > 0 ? jitterForSnr(p.fin, p.snrt) : NaN;
  const clockAllowed = sigmaReq > tAp ? Math.sqrt(sigmaReq * sigmaReq - tAp * tAp) : NaN;

  // jitter budget (ps)
  const rjList = parseList(p.rj);
  const djList = parseList(p.dj);
  const budErr: string[] = [];
  if (rjList === null) budErr.push('Random jitter terms must be non-negative numbers in ps rms, separated by commas.');
  if (djList === null) budErr.push('Deterministic jitter terms must be non-negative numbers in ps peak-to-peak, separated by commas.');
  if (!(p.ber > 0 && p.ber < 0.5)) budErr.push('Bit error ratio must be between 0 and 0.5, e.g. 1e-12.');
  if (p.limu === 'ui' && !(p.rate > 0)) budErr.push('Enter the data rate to use a limit in UI.');
  if (!(p.lim >= 0)) budErr.push('The total jitter limit cannot be negative.');
  const uiPs = p.rate > 0 ? 1000 / p.rate : NaN;
  const clockPs = p.incl && pj ? pj.seconds * 1e12 : null;
  const rjAll = rjList ? (clockPs !== null ? [clockPs, ...rjList] : rjList) : [];
  const bud = budErr.length === 0 && rjList && djList ? jitterBudget(rjAll, djList, p.ber) : null;
  const limitPs = p.limu === 'ui' ? p.lim * uiPs : p.lim;

  const properties = (
    <>
      <Section title="Clock">
        <SiField label="Carrier frequency" symbol="fc" value={p.fc} onChange={(v) => set({ fc: v })} unit="Hz" prefixes={['k', 'M', 'G']} digits={8} />
      </Section>
      <Section title="Integration band">
        <SelectField
          label="Band"
          value={band}
          onChange={(v) => set(v === 'custom' ? { band: v, fl: fLow, fh: fHigh } : { band: v })}
          options={[
            { value: 'sonet', label: '12 kHz – 20 MHz' },
            { value: 'adc', label: 'ADC: 100 Hz – 2·fc' },
            { value: 'custom', label: 'Custom' },
          ]}
          width={160}
        />
        {band === 'custom' ? (
          <>
            <SiField label="Lower limit" value={p.fl} onChange={(v) => set({ fl: v })} unit="Hz" prefixes={['', 'k', 'M']} digits={7} />
            <SiField label="Upper limit" value={p.fh} onChange={(v) => set({ fh: v })} unit="Hz" prefixes={['', 'k', 'M', 'G']} digits={7} />
          </>
        ) : (
          <div className="text-muted">
            {si(fLow, 'Hz', 4)} to {si(fHigh, 'Hz', 4)}
          </div>
        )}
        <Check label="Hold the last level flat above the last point" checked={p.ext} onChange={(v) => set({ ext: v })} hint="Extends a measured noise floor to the upper limit (Skyworks AN279). Off: the upper limit must lie within the points." />
      </Section>
      <Section title={`Phase noise points (${decoded?.length ?? 0})`}>
        <PointsEditor value={p.pn} onChange={(v) => set({ pn: v })} />
      </Section>
      <Section title="ADC sampling clock">
        <SiField label="Input frequency" symbol="fin" value={p.fin} onChange={(v) => set({ fin: v })} unit="Hz" prefixes={['k', 'M', 'G']} digits={7} />
        <NumField label="ADC aperture jitter" symbol="ta" value={p.tap} onChange={(v) => set({ tap: v })} unit="fs rms" allowZero hint="From the ADC data sheet; added to the clock jitter as root-sum-square. 0 = clock only." />
        <NumField label="ADC SNR without jitter" value={p.snra} onChange={(v) => set({ snra: v })} unit="dBFS" allowZero hint="The converter's own SNR at low input frequency. 0 = not given." />
        <NumField label="Target SNR" value={p.snrt} onChange={(v) => set({ snrt: v })} unit="dB" allowNegative hint="For the jitter needed to reach this SNR at the input frequency." />
      </Section>
      <Section title="Jitter budget">
        <TextField label="Random jitter terms" value={p.rj} onChange={(v) => set({ rj: v })} invalid={rjList === null} placeholder="ps rms, e.g. 0.5, 0.3" width={140} />
        <TextField label="Deterministic jitter terms" value={p.dj} onChange={(v) => set({ dj: v })} invalid={djList === null} placeholder="ps p-p, e.g. 10, 5" width={140} />
        <Check label="Add the clock phase jitter as a random term" checked={p.incl} onChange={(v) => set({ incl: v })} />
        <NumField label="Bit error ratio" value={p.ber} onChange={(v) => set({ ber: v })} hint="e.g. 1e-12" />
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <span className="text-muted">Limit unit</span>
          <Segmented
            label="Limit unit"
            value={p.limu === 'ps' ? 'ps' : 'ui'}
            onChange={(v) => set({ limu: v })}
            options={[
              { value: 'ui', label: 'UI' },
              { value: 'ps', label: 'ps' },
            ]}
          />
        </div>
        <NumField label="Total jitter limit" symbol="TJ" value={p.lim} onChange={(v) => set({ lim: v })} unit={p.limu === 'ps' ? 'ps p-p' : 'UI p-p'} allowZero />
        <NumField label="Data rate" value={p.rate} onChange={(v) => set({ rate: v })} unit="Gb/s" allowZero hint="Sets the unit interval, 1 / rate. 0 = not given (limit in ps only)." />
      </Section>
    </>
  );

  const status = pj ? `σ = ${si(pj.seconds, 's', 4)} rms over ${si(fLow, 'Hz', 3)} – ${si(fHigh, 'Hz', 3)}, ${fmt(pj.dbc, 4)} dBc` : 'Check the inputs';
  const big = pj ? split(pj.seconds, 's') : null;

  return (
    <ToolPage
      title="Phase Noise to Jitter & Jitter Budget"
      description="RMS phase jitter from an oscillator phase noise curve by exact segment integration, the jitter-limited SNR and ENOB of an ADC, and a total-jitter budget at a bit error ratio."
      onReset={reset}
      properties={properties}
      status={status}
      method={<Method />}
    >
      <Notes kind="error" items={errors} />
      <Notes items={notes} />
      {pj && big && (
        <Panel title="RMS phase jitter">
          <div className="flex flex-wrap gap-8 px-3 py-3">
            <Big label="RMS jitter" value={big.num} unit={`${big.u} rms`} />
            <Big label="Integrated phase noise" value={fmt(pj.dbc, 4)} unit="dBc" />
            <Big label="Phase jitter" value={fmt(pj.rad * 1e3, 4)} unit="mrad rms" />
          </div>
          <table className="tbl">
            <tbody>
              <Result label="Integration band" value={`${si(fLow, 'Hz', 4)} – ${si(fHigh, 'Hz', 4)}`} sub={band === 'sonet' ? 'the 12 kHz – 20 MHz telecom convention' : band === 'adc' ? 'MT-008 for an ADC clock: 100 Hz to twice the clock frequency' : 'custom'} />
              <Result label="Phase jitter" value={fmt((pj.rad * 180) / Math.PI, 4)} unit="° rms" sub="√(2 · 10^(A/10)) rad" />
              <Result label="Jitter as a share of the period" value={fmt(pj.seconds * p.fc * 1e3, 4)} unit="mUI rms" sub={`period ${si(1 / p.fc, 's', 4)}`} />
            </tbody>
          </table>
        </Panel>
      )}
      {pj && (
        <Panel title="Phase noise L(f)">
          <PnPlot pj={pj} lo={fLow} hi={fHigh} />
        </Panel>
      )}
      {pj && (
        <Panel title="Contribution of each segment">
          <table className="tbl">
            <thead>
              <tr>
                <th className="text-left">Offset range</th>
                <th className="v">Slope</th>
                <th className="v">Integrated</th>
                <th className="v">Jitter</th>
                <th className="v">Share</th>
              </tr>
            </thead>
            <tbody>
              {pj.segments.map((g) => (
                <tr key={`${g.f1}-${g.f2}`}>
                  <td>
                    {si(g.f1, 'Hz', 4)} – {si(g.f2, 'Hz', 4)}
                    {g.extended ? ' (held flat)' : ''}
                  </td>
                  <td className="v">{fmt(g.slope, 4)} dB/dec</td>
                  <td className="v">{fmt(g.areaDbc, 4)} dBc</td>
                  <td className="v">{si(g.jitter, 's', 3)}</td>
                  <td className="v">{fmt(g.share * 100, 3)} %</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td>Total</td>
                <td />
                <td className="v">{fmt(pj.dbc, 4)} dBc</td>
                <td className="v">{si(pj.seconds, 's', 4)}</td>
                <td className="v">100 %</td>
              </tr>
            </tbody>
          </table>
          <p className="px-3 py-2 text-muted">Segment jitters add as root-sum-square; the share is of the integrated noise power, so it shows where the jitter comes from.</p>
        </Panel>
      )}
      <Notes kind="error" items={adcErr} />
      {pj && adcErr.length === 0 && (
        <Panel title="ADC: jitter-limited SNR">
          <table className="tbl">
            <tbody>
              <Result label="Total sampling jitter" value={si(sigmaTotal, 's', 4)} unit="rms" sub={tAp > 0 ? `clock ${si(pj.seconds, 's', 3)} and aperture ${si(tAp, 's', 3)}, root-sum-square` : 'clock only'} />
              <Result label={`SNR limit at ${si(p.fin, 'Hz', 4)}`} value={fmt(snrJ, 4)} unit="dB" strong sub="−20 log10(2π fin σ), full-scale sine" />
              <Result label="Equivalent ENOB" value={fmt(enobFromSnr(snrJ), 3)} unit="bits" sub="(SNR − 1.76) / 6.02" />
              {Number.isFinite(snrT) && <Result label="SNR with the ADC's own noise" value={fmt(snrT, 4)} unit="dBFS" sub={`${fmt(p.snra, 4)} dBFS ADC combined with the jitter limit`} />}
              <Result
                label={`Jitter for ${fmt(p.snrt, 4)} dB at ${si(p.fin, 'Hz', 4)}`}
                value={si(sigmaReq, 's', 4)}
                unit="rms"
                sub={`ENOB ${fmt(enobFromSnr(p.snrt), 3)} bits; ${tAp > 0 ? (Number.isFinite(clockAllowed) ? `clock may have ${si(clockAllowed, 's', 3)} after the aperture jitter` : 'the aperture jitter alone exceeds it') : 'total of clock and aperture jitter'}`}
              />
            </tbody>
          </table>
        </Panel>
      )}
      <Notes kind="error" items={budErr} />
      {bud && rjAll.length + (djList?.length ?? 0) > 0 && (
        <Panel title={<>Total jitter at BER {berText(p.ber)}</>}>
          <table className="tbl">
            <tbody>
              <Result label="Random jitter, RSS" value={fmt(bud.rj, 4)} unit="ps rms" sub={`${rjAll.length} term${rjAll.length === 1 ? '' : 's'}${clockPs !== null ? `, including the clock phase jitter ${fmt(clockPs, 3)} ps` : ''}`} />
              <Result label="Deterministic jitter, sum" value={fmt(bud.dj, 4)} unit="ps p-p" sub={`${djList?.length ?? 0} term${djList?.length === 1 ? '' : 's'}`} />
              <Result label="Q at this BER" value={fmt(bud.q, 5)} sub={`peak-to-peak RJ = 2Q · RJ = ${fmt(2 * bud.q, 5)} × RJ`} />
              <Result label="Random jitter, peak-to-peak" value={fmt(bud.rjPp, 4)} unit="ps p-p" />
              <Result label="Total jitter TJ = DJ + 2Q · RJ" value={fmt(bud.tj, 4)} unit="ps p-p" strong sub={p.rate > 0 ? `${fmt(bud.tj / uiPs, 4)} UI at ${fmt(p.rate, 4)} Gb/s (UI ${fmt(uiPs, 4)} ps)` : undefined} />
              {Number.isFinite(limitPs) && limitPs > 0 && (
                <Result
                  label={bud.tj <= limitPs ? 'Margin to the limit' : 'Over the limit by'}
                  value={fmt(Math.abs(limitPs - bud.tj), 4)}
                  unit="ps"
                  strong
                  sub={`limit ${fmt(limitPs, 4)} ps${p.limu === 'ui' ? ` (${fmt(p.lim, 4)} UI)` : p.rate > 0 ? ` (${fmt(p.lim / uiPs, 4)} UI)` : ''}; ${fmt((bud.tj / limitPs) * 100, 3)} % used`}
                />
              )}
            </tbody>
          </table>
          {clockPs !== null && (
            <p className="px-3 py-2 text-muted">
              A receiver tracks jitter below its clock-recovery bandwidth, so only the clock jitter above that corner belongs in a link budget. Set the integration band to the
              interface&rsquo;s jitter band before adding it here.
            </p>
          )}
        </Panel>
      )}
    </ToolPage>
  );
}

/* ------------------------------------------------------------- point editor */

type Row = { f: string; l: string };
const toRows = (s: string): Row[] => (decodePoints(s) ?? []).map((q) => ({ f: freqText(q.f), l: String(q.l) }));

function PointsEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [rows, setRows] = useState<Row[]>(() => toRows(value));
  const emitted = useRef(value);
  const latest = useRef(value);
  const [paste, setPaste] = useState('');
  const [pasteErr, setPasteErr] = useState<string[]>([]);
  const id = useId();
  useEffect(() => {
    latest.current = value;
    if (value !== emitted.current) {
      emitted.current = value;
      setRows(toRows(value));
    }
  }, [value]);
  useEffect(() => {
    const onReset = () => {
      emitted.current = latest.current;
      setRows(toRows(latest.current));
      setPaste('');
      setPasteErr([]);
    };
    window.addEventListener(RESET_EVENT, onReset);
    return () => window.removeEventListener(RESET_EVENT, onReset);
  }, []);

  const commit = (next: Row[]) => {
    setRows(next);
    const pts = next.map((r) => ({ f: parseFrequency(r.f), l: parseLevel(r.l) }));
    if (pts.every((q) => q.f !== null && q.f > 0 && q.l !== null)) {
      const s = encodePoints(pts as PnPoint[]);
      emitted.current = s;
      onChange(s);
    }
  };
  const edit = (i: number, patch: Partial<Row>) => commit(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => {
    const last = rows[rows.length - 1];
    const lf = last ? parseFrequency(last.f) : null;
    commit([...rows, { f: lf ? freqText(lf * 10) : '1k', l: last?.l ?? '-100' }]);
  };
  const applyPaste = () => {
    const { points, errors } = parsePastedPoints(paste);
    setPasteErr(errors);
    if (errors.length === 0 && points.length > 0) {
      commit(points.map((q) => ({ f: freqText(q.f), l: String(q.l) })));
      setPaste('');
    }
  };

  return (
    <div className="space-y-[3px]">
      <div className="grid grid-cols-[minmax(0,1fr)_76px_22px] items-center gap-1 text-[11px] text-faint">
        <span>Offset (Hz, k, M)</span>
        <span className="text-right">dBc/Hz</span>
        <span />
      </div>
      {rows.map((r, i) => {
        const fv = parseFrequency(r.f);
        const badF = fv === null || !(fv > 0);
        const badL = parseLevel(r.l) === null;
        return (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_76px_22px] items-center gap-1">
            <input className="fld w-full text-right" data-field="code" aria-label={`Offset ${i + 1}`} aria-invalid={badF || undefined} value={r.f} spellCheck={false} onChange={(e) => edit(i, { f: e.target.value })} />
            <input className="fld w-full text-right" aria-label={`Phase noise ${i + 1}`} aria-invalid={badL || undefined} inputMode="decimal" value={r.l} onChange={(e) => edit(i, { l: e.target.value })} />
            <button type="button" className="h-[20px] text-muted hover:bg-hover hover:text-ink" title="Remove point" aria-label={`Remove point ${i + 1}`} onClick={() => commit(rows.filter((_, j) => j !== i))}>
              ×
            </button>
          </div>
        );
      })}
      <div className="flex gap-1 pt-1">
        <button type="button" className="btn" onClick={add}>
          Add point
        </button>
      </div>
      <details className="pt-1">
        <summary className="cursor-pointer text-muted">Paste points</summary>
        <label htmlFor={id} className="block pt-1 text-[11px] text-faint">
          One “offset, dBc/Hz” per line, e.g. “10k, -150”. Replaces the table.
        </label>
        <textarea id={id} className="fld mt-1 h-[96px] w-full font-mono" value={paste} spellCheck={false} onChange={(e) => setPaste(e.target.value)} />
        {pasteErr.length > 0 && <Notes kind="error" items={pasteErr} />}
        <button type="button" className="btn mt-1" onClick={applyPaste} disabled={!paste.trim()}>
          Replace points
        </button>
      </details>
    </div>
  );
}

/* ------------------------------------------------------------------- plot */

function PnPlot({ pj, lo, hi }: { pj: PhaseJitter; lo: number; hi: number }) {
  const clip = useId();
  const W = 640, H = 260, left = 56, right = 16, top = 22, bottom = 36;
  const pts = pj.points;
  const fMin = Math.min(pts[0].f, lo);
  const fMax = Math.max(pts[pts.length - 1].f, hi);
  const a = Math.floor(Math.log10(fMin));
  const b = Math.max(a + 1, Math.ceil(Math.log10(fMax)));
  const levels = pts.map((q) => q.l);
  const ymax = Math.ceil((Math.max(...levels) + 5) / 10) * 10;
  const ymin = Math.floor((Math.min(...levels) - 5) / 10) * 10;
  const X = (f: number) => left + ((Math.log10(f) - a) / (b - a)) * (W - left - right);
  const Y = (v: number) => top + ((ymax - v) / (ymax - ymin)) * (H - top - bottom);
  const yb = H - bottom;
  const xstep = Math.max(1, Math.ceil((b - a) / 9));
  const xticks: number[] = [];
  for (let d = a; d <= b; d += xstep) xticks.push(10 ** d);
  // ten-dB multiples, at most about nine ticks however wide the entered levels are
  const ystep = Math.max(10, Math.ceil((ymax - ymin) / 9 / 10) * 10);
  const yticks: number[] = [];
  for (let v = ymin; v <= ymax; v += ystep) yticks.push(v);
  const segs = pj.segments;
  const area = segs.length
    ? `M${X(segs[0].f1).toFixed(2)},${yb} ` + segs.map((g) => `L${X(g.f1).toFixed(2)},${Y(g.l1).toFixed(2)} L${X(g.f2).toFixed(2)},${Y(g.l2).toFixed(2)}`).join(' ') + ` L${X(segs[segs.length - 1].f2).toFixed(2)},${yb} Z`
    : '';
  const curve = pts.map((q, i) => `${i ? 'L' : 'M'}${X(q.f).toFixed(2)},${Y(q.l).toFixed(2)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <div className="min-w-0 px-2 pt-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full max-w-[740px]" role="img" aria-label={`Phase noise from ${si(pts[0].f, 'Hz', 3)} to ${si(last.f, 'Hz', 3)} with the integration band ${si(lo, 'Hz', 3)} to ${si(hi, 'Hz', 3)} shaded`}>
        <defs>
          <clipPath id={clip}>
            <rect x={left} y={top} width={W - left - right} height={H - top - bottom} />
          </clipPath>
        </defs>
        <text x={left} y={14} fontSize={12} fill="var(--ink)">L(f) (dBc/Hz)</text>
        {xticks.map((x) => (
          <g key={x}>
            <line x1={X(x)} x2={X(x)} y1={top} y2={yb} stroke="var(--line)" />
            <text x={X(x)} y={yb + 16} textAnchor="middle" fontSize={11} fill="var(--muted)">{si(x, 'Hz', 2)}</text>
          </g>
        ))}
        {yticks.map((y) => (
          <g key={y}>
            <line x1={left} x2={W - right} y1={Y(y)} y2={Y(y)} stroke="var(--line)" />
            <text x={left - 6} y={Y(y) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{y}</text>
          </g>
        ))}
        <g clipPath={`url(#${clip})`}>
          <rect x={X(lo)} y={top} width={Math.max(0, X(hi) - X(lo))} height={yb - top} fill="var(--accent)" fillOpacity={0.08} />
          <path d={area} fill="var(--accent)" fillOpacity={0.22} />
          <line x1={X(lo)} x2={X(lo)} y1={top} y2={yb} stroke="var(--accent)" strokeDasharray="4 3" />
          <line x1={X(hi)} x2={X(hi)} y1={top} y2={yb} stroke="var(--accent)" strokeDasharray="4 3" />
          <path d={curve} fill="none" stroke="var(--accent)" strokeWidth={2} />
          {pj.extended && <line x1={X(last.f)} x2={X(hi)} y1={Y(last.l)} y2={Y(last.l)} stroke="var(--accent)" strokeWidth={2} strokeDasharray="6 4" />}
          {pts.map((q) => (
            <circle key={q.f} cx={X(q.f)} cy={Y(q.l)} r={3} fill="var(--sheet)" stroke="var(--accent)" strokeWidth={1.5} />
          ))}
        </g>
        <rect x={left} y={top} width={W - left - right} height={yb - top} fill="none" stroke="var(--line)" />
        <text x={(left + W - right) / 2} y={H - 3} textAnchor="middle" fontSize={11} fill="var(--muted)">Offset frequency</text>
      </svg>
      <p className="px-2 pb-2 text-muted">Straight lines between the points on the log-log axes, integrated exactly. The shaded area is the integrated band.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ method */

const SOURCES: DataSource[] = [
  {
    title: 'ADI MT-008, Converting Oscillator Phase Noise to Time Jitter (W. Kester, Rev. A, 10/08)',
    url: 'https://www.analog.com/media/en/training-seminars/tutorials/MT-008.pdf',
    note: 'Eq. 1 jitter-limited SNR; Eq. 2 and 3 RMS phase jitter in radians and seconds from the integrated phase noise; integration by line segments, upper limit 2·fc and lower limit 100 Hz for an ADC clock. Figures 5, 7 and 11 (−67 dBc → 1 ps; 0.064 ps; 0.18 ps; 1.57 ps for the ADF4360-1) are reproduced by this tool’s tests.',
  },
  {
    title: 'Skyworks (Silicon Labs) AN279, Estimating Period Jitter from Phase Noise (Rev. 0.1)',
    url: 'https://www.skyworksinc.com/-/media/Skyworks/SL/documents/public/application-notes/AN279.pdf',
    note: 'L(f) = Sφ(f) / 2; extending a measured noise floor to the upper limit; the −54.46 dBc → 2.663 ps example at 160 MHz (tested). Its period-jitter weighting is not implemented here.',
  },
  {
    title: 'TI SBAA653A, Practical Clocking Considerations That Give Your Next High-Speed Converter Design an Edge (April 2025)',
    url: 'https://www.ti.com/lit/pdf/sbaa653',
    note: 'RMS phase jitter = √(2·10^(A/10)), jitter = that / (2π Fs); SNR_J = −20 log10(2π fin tJ); clock and aperture jitter combined as root-sum-square; integration from about 20 Hz to at least Fs, 2·Fs recommended.',
  },
  {
    title: 'TI SLWA034, Implementing a CDC7005 Low Jitter Clock Solution for High-Speed, High-IF ADC Devices (December 2004)',
    url: 'https://www.ti.com/lit/an/slwa034/slwa034.pdf',
    note: '§2: total SNR from the jitter SNR and the ADC’s own SNR on a power basis; 78.9 dBFS and 72.4 dBFS give 71.5 dBFS (tested).',
  },
  {
    title: 'ADI MT-001, Taking the Mystery out of the Infamous Formula “SNR = 6.02N + 1.76 dB”',
    url: 'https://www.analog.com/media/en/training-seminars/tutorials/MT-001.pdf',
    note: 'Eq. 9, SNR of an ideal N-bit converter for a full-scale sine over dc to fs/2; inverted here for the equivalent number of bits.',
  },
  {
    title: 'Renesas (IDT) AN-815, Understanding Jitter Units (Rev. A, 03/2014)',
    url: 'https://www.renesas.com/en/document/apn/815-understanding-jitter-units',
    note: 'TJ = DJ + RJ; Table 1 RMS-to-peak-to-peak multipliers N (= 2Q) from BER 10⁻³ to 10⁻¹⁶, all reproduced by the tests; the 12 kHz – 20 MHz telecom band.',
  },
  {
    title: 'Maxim HFAN-4.3.0, Jitter Specifications Made Easy (Rev. 1, 04/08)',
    url: 'https://www.analog.com/media/en/technical-documentation/app-notes/hfan0430-jitter-specifications-made-easy.pdf',
    note: 'Random jitter sources add as RMS, and a peak-to-peak value at a BER is needed to add them to deterministic jitter (14.1 × RMS at 10⁻¹²); the receiver’s high-pass jitter weighting (637 kHz Fibre Channel, 625 kHz 1000BASE Ethernet).',
  },
];

export function Method() {
  return (
    <>
      <h2>Phase noise and phase jitter</h2>
      <p>
        Oscillator data sheets give the single-sideband phase noise <i>L</i>(<i>f</i>) in dBc/Hz: the noise power in 1 Hz at an offset <i>f</i> from the carrier, relative to the
        carrier. It is half the spectral density of the phase fluctuation, <i>L</i>(<i>f</i>) = <i>S</i>
        <sub>φ</sub>(<i>f</i>) / 2, because <i>L</i>(<i>f</i>) counts one sideband and the phase noise appears in both. The integrated phase noise over the band from <i>f</i>
        <sub>1</sub> to <i>f</i>
        <sub>2</sub> is
      </p>
      <div className="eq">
        <span className="no">(1)</span>
        <i>A</i> = 10 log<sub>10</sub> ∫ <i>L</i>(<i>f</i>) d<i>f</i> &nbsp;[dBc], with <i>L</i>(<i>f</i>) as a power ratio
      </div>
      <p>and the phase variance is the integral of <i>S</i>
        <sub>φ</sub>, twice the integral of <i>L</i>. That is the factor of 2 in MT-008 Eq. 2 and in TI SBAA653:
      </p>
      <div className="eq">
        <span className="no">(2)</span>
        φ<sub>rms</sub> = √(2 · 10<sup><i>A</i>/10</sup>) rad, &nbsp; σ = φ<sub>rms</sub> / (2π <i>f</i>
        <sub>c</sub>)
      </div>
      <p>
        σ is the RMS phase jitter: the time error of the clock edges against an ideal clock, in the band integrated. Always quote the band with the number.
      </p>
      <h2>Integration between the points</h2>
      <p>
        As in MT-008 the curve is taken as straight lines between the points on the log-log plot. A straight line of slope <i>s</i> dB/decade is a power law, <i>L</i>(<i>f</i>) =
        <i> L</i>
        <sub>1</sub> (<i>f</i> / <i>f</i>
        <sub>1</sub>)<sup><i>b</i></sup> with <i>b</i> = <i>s</i> / 10, so each segment integrates exactly:
      </p>
      <div className="eq">
        <span className="no">(3)</span>∫<sub><i>f</i>a</sub>
        <sup><i>f</i>b</sup> <i>L</i> d<i>f</i> = <i>L</i>
        <sub>1</sub> <i>f</i>
        <sub>1</sub>
        <sup>−<i>b</i></sup> (<i>f</i>
        <sub>b</sub>
        <sup><i>b</i>+1</sup> − <i>f</i>
        <sub>a</sub>
        <sup><i>b</i>+1</sup>) / (<i>b</i> + 1), &nbsp; <i>b</i> ≠ −1
      </div>
      <div className="eq">
        <span className="no">(4)</span>∫<sub><i>f</i>a</sub>
        <sup><i>f</i>b</sup> <i>L</i> d<i>f</i> = <i>L</i>
        <sub>1</sub> <i>f</i>
        <sub>1</sub> ln(<i>f</i>
        <sub>b</sub> / <i>f</i>
        <sub>a</sub>), &nbsp; <i>b</i> = −1 (−10 dB/decade)
      </div>
      <p>
        The segment areas are added and converted with (1) and (2); equivalently the segment jitters add as root-sum-square, which is how MT-008 labels its examples. Points are sorted by
        offset. The curve is not extrapolated below the first point, because close-in noise rises towards the carrier. Above the last point the last level can be held flat to the upper
        limit, as AN279 does for a measured noise floor; the tool says so when it does.
      </p>
      <h2>Integration band</h2>
      <ul>
        <li>12 kHz – 20 MHz is the band telecom practice uses (AN-815) and many oscillator data sheets quote.</li>
        <li>
          For an ADC sampling clock MT-008 integrates from about 100 Hz (or the lowest offset given) to twice the clock frequency, the approximate bandwidth of the clock input; TI SBAA653
          uses about 20 Hz to at least the sample rate, with twice the sample rate recommended.
        </li>
        <li>
          Serial-link reference-clock limits, such as those of PCI Express, are defined through the specification&rsquo;s own jitter filter functions, so a brick-wall band only approximates
          them.
        </li>
      </ul>
      <p>
        Phase jitter is not period jitter or cycle-to-cycle jitter. AN279 estimates period jitter by weighting <i>S</i>
        <sub>φ</sub>(<i>f</i>) with 4 sin²(π<i>f</i>
        <i>T</i>
        <sub>0</sub>) before integrating; this tool does not do that conversion.
      </p>
      <h2>ADC signal-to-noise ratio</h2>
      <p>Sampling a full-scale sine at <i>f</i>
        <sub>in</sub> with an RMS timing error σ limits the SNR to
      </p>
      <div className="eq">
        <span className="no">(5)</span>
        SNR = −20 log<sub>10</sub>(2π <i>f</i>
        <sub>in</sub> σ), &nbsp; σ = √(σ<sub>clock</sub>² + <i>t</i>
        <sub>a</sub>²)
      </div>
      <p>
        independent of the sample rate. The ADC&rsquo;s aperture jitter <i>t</i>
        <sub>a</sub> adds to the clock jitter as root-sum-square. The jitter limit and the converter&rsquo;s own SNR combine on a power basis, SNR<sub>T</sub> = −10 log<sub>10</sub>(10
        <sup>−SNR<sub>j</sub>/10</sup> + 10<sup>−SNR<sub>ADC</sub>/10</sup>) (TI SLWA034). The equivalent number of bits inverts the ideal-converter SNR, ENOB = (SNR − 1.76 dB) /
        6.02 dB (MT-001). Rearranging (5) for σ gives the jitter a target SNR allows.
      </p>
      <h2>Jitter budget at a bit error ratio</h2>
      <p>
        Deterministic jitter (duty-cycle distortion, intersymbol interference, crosstalk, periodic jitter) is bounded and quoted peak-to-peak; the tool adds the terms linearly, which is
        the worst case. Random jitter is Gaussian and quoted RMS; independent sources add as root-sum-square (HFAN-4.3.0). A Gaussian has no peak, so its peak-to-peak value is taken at
        the probability the link may be wrong, the bit error ratio:
      </p>
      <div className="eq">
        <span className="no">(6)</span>
        BER = ½ erfc(<i>Q</i> / √2), &nbsp; TJ = DJ + 2<i>Q</i> · RJ<sub>rms</sub>
      </div>
      <p>
        <i>Q</i> is found by inverting the complementary error function numerically: 7.034 at 10<sup>−12</sup>, 6.706 at 10<sup>−11</sup>, so 2<i>Q</i> = 14.069 and 13.412, the
        multipliers of Renesas AN-815 Table 1. Where a standard specifies its own multiplier, use that.
      </p>
      <p>
        A receiver&rsquo;s clock recovery follows slow jitter, so only jitter above its tracking corner closes the eye (HFAN-4.3.0 shows a 20 dB/decade high-pass at 625–637 kHz for
        gigabit Ethernet and Fibre Channel). Integrate the clock&rsquo;s phase noise over that band before adding it to a link budget.
      </p>
      <p>
        For the frequency accuracy of the clock rather than its jitter, see <Link to="/crystal">crystal load capacitors and ppm budget</Link>.
      </p>
      <Sources items={SOURCES} />
    </>
  );
}
