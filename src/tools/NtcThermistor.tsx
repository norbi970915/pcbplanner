import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SiField } from '../components/SiField';
import { Sources } from '../components/Sources';
import { ToolPage } from '../components/ToolPage';
import { Big, Check, Notes, NumField, Panel, Result, Section, Segmented, SelectField } from '../components/ui';
import { NTC_PARTS, partById, tableR, type NtcPart } from '../data/ntcParts';
import type { DataSource } from '../data/source';
import { eNearest, type ESeries } from '../lib/electronics';
import {
  adcCode, betaFromPoints, bitsValid, codeV, dividerV, fitSteinhartHart, kPerLsb, localBeta, lookupTable, LUT_MAX_ROWS, lutC, lutCsv, resistance, rFromV, rsMaxSlope, rsMaxSpan,
  rsThreePoint, rsTurningPoint, selfHeating, sensitivity, shMonotonic, temperature, thermistorPower, toC, toK, toleranceBand, type BetaModel, type Divider, type NtcModel,
  type ShModel,
} from '../lib/ntc';
import { cToF, fmt, si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = {
  part: 'vishay',
  r0: 10000, t0: 25, beta: 3977, bt2: 85,
  t1: -40, r1: 332094, t2: 25, r2: 10000, t3: 125, r3: 338.7,
  model: 'sh',
  probeT: 25, probeR: 10000,
  pos: 'low', rs: 10000, vs: 3.3, ratio: true, vref: 2.5, bits: 12,
  tmin: -40, tmax: 125, tdes: 25, series: 'E96',
  delta: 7, rtol: 5, btol: 0.75,
  code: 2048, step: 5, fmt: 'csv', fahr: false,
};

const N = 241;
const ABS_ZERO_C = -273.15;
const ok = (v: number) => Number.isFinite(v);
const tc = (v: number, sig = 4) => `${fmt(v, sig)} °C`;
const splitSi = (v: number, unit: string, sig = 4) => {
  const [num, ...u] = si(v, unit, sig).split(' ');
  return { num, u: u.join(' ') };
};
const signed = (v: number, sig = 3) => (ok(v) ? `${v > 0 ? '+' : ''}${fmt(v, sig)}` : '—');

/** Preset values written into the URL state when a part is chosen. */
function presetPatch(part: NtcPart) {
  const beta: BetaModel = { kind: 'beta', r0: part.r25, t0: toK(25), beta: part.beta };
  const [f1, f2, f3] = part.fit;
  const r = (t: number) => tableR(part, t) ?? Number(resistance(beta, toK(t)).toPrecision(7));
  return {
    part: part.id, r0: part.r25, t0: 25, beta: part.beta, ...(part.betaPair ? { bt2: part.betaPair[1] } : {}),
    t1: f1, r1: r(f1), t2: f2, r2: r(f2), t3: f3, r3: r(f3),
    ...(part.delta !== null ? { delta: part.delta } : {}),
    ...(part.rTol !== null ? { rtol: part.rTol } : {}),
    ...(part.bTol !== null ? { btol: part.bTol } : {}),
  };
}

export default function NtcThermistor() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const [resetKey, setResetKey] = useState(0);
  const part = partById(p.part);
  const series = (['E24', 'E96'].includes(p.series) ? p.series : 'E96') as ESeries;
  const pos = p.pos === 'high' ? 'high' : 'low';
  const useSh = p.model !== 'beta';
  const fmtOut = p.fmt === 'c' ? 'c' : 'csv';
  const tTxt = (c: number, sig = 4) => (ok(c) ? (p.fahr ? `${tc(c, sig)} (${fmt(cToF(c), sig)} °F)` : tc(c, sig)) : '—');

  /* ------------------------------------------------------------ validation */
  const errors: string[] = [];
  const notes: string[] = [];
  const aboveZero = (v: number) => ok(v) && v > ABS_ZERO_C;
  if (!(p.r0 > 0) || !(p.beta > 0) || !aboveZero(p.t0)) errors.push('Beta model: R0 and B must be greater than 0 and T0 above absolute zero (−273.15 °C).');
  const pts = [
    { t: p.t1, r: p.r1 },
    { t: p.t2, r: p.r2 },
    { t: p.t3, r: p.r3 },
  ];
  const ptsOk = pts.every((q) => aboveZero(q.t) && q.r > 0 && ok(q.r));
  if (!ptsOk) errors.push('Steinhart–Hart points: temperatures must be above −273.15 °C and resistances greater than 0 Ω.');
  const rangeOk = aboveZero(p.tmin) && aboveZero(p.tmax) && p.tmax > p.tmin && p.tmax - p.tmin <= 1000;
  if (!rangeOk) errors.push('Temperature range: Tmax must be above Tmin, both above −273.15 °C, and the span at most 1000 °C.');
  if (!aboveZero(p.tdes)) errors.push('The design temperature must be above −273.15 °C.');
  if (!(p.rs > 0) || !ok(p.rs)) errors.push('The series resistor must be greater than 0 Ω. With Rs = 0 the divider output does not change with temperature.');
  if (!(p.vs > 0) || !ok(p.vs)) errors.push('The divider supply must be greater than 0 V.');
  if (!p.ratio && (!(p.vref > 0) || !ok(p.vref))) errors.push('The ADC reference must be greater than 0 V.');
  if (!bitsValid(p.bits)) errors.push('ADC resolution must be a whole number of bits from 1 to 24.');
  if (!(p.delta > 0) || !ok(p.delta)) errors.push('The dissipation constant must be greater than 0 mW/K.');
  if (!(p.rtol >= 0 && p.rtol < 100) || !(p.btol >= 0 && p.btol < 100)) errors.push('Tolerances must be from 0 to less than 100 %.');

  const betaModel = useMemo<BetaModel | null>(() => (p.r0 > 0 && p.beta > 0 && aboveZero(p.t0) ? { kind: 'beta', r0: p.r0, t0: toK(p.t0), beta: p.beta } : null), [p.r0, p.t0, p.beta]);
  const fit = useMemo(
    () => (ptsOk ? fitSteinhartHart([[p.t1, p.r1], [p.t2, p.r2], [p.t3, p.r3]].map(([t, r]) => ({ t: toK(t), r }))) : null),
    [ptsOk, p.t1, p.r1, p.t2, p.r2, p.t3, p.r3],
  );
  if (fit && !fit.ok) errors.push(`Steinhart–Hart fit: ${fit.error}`);
  const sh: ShModel | null = fit?.ok ? fit.model : null;

  // Steinhart–Hart must stay one-to-one over everything it is used for
  const shRangeOk = !sh || !rangeOk || (() => {
    const rHi = resistance(sh, toK(p.tmin));
    const rLo = resistance(sh, toK(p.tmax));
    return ok(rHi) && ok(rLo) && shMonotonic(sh, rLo, rHi);
  })();
  if (sh && !shRangeOk) errors.push('The fitted Steinhart–Hart curve is not monotonic over the temperature range; choose calibration points closer to the range.');

  const active: NtcModel | null = useSh ? (shRangeOk ? sh : null) : betaModel;
  if (useSh && !sh && ptsOk && fit?.ok !== false) errors.push('No Steinhart–Hart model is available.');
  const vref = p.ratio ? p.vs : p.vref;
  const div = useMemo<Divider>(() => ({ position: pos, rs: p.rs, vs: p.vs, vref, bits: p.bits }), [pos, p.rs, p.vs, vref, p.bits]);
  const divOk = p.rs > 0 && p.vs > 0 && vref > 0 && bitsValid(p.bits);
  const ready = !!active && divOk && rangeOk && aboveZero(p.tdes) && p.delta > 0 && p.rtol >= 0 && p.rtol < 100 && p.btol >= 0 && p.btol < 100;

  /* --------------------------------------------------------------- sweeps */
  const ctx = useMemo<EvalCtx>(
    () => ({ sh: sh && shRangeOk ? sh : null, betaModel, active: ready ? active : null, useSh, div, delta: p.delta / 1000, rTol: p.rtol / 100, bTol: p.btol / 100, beta: p.beta }),
    [sh, shRangeOk, betaModel, ready, active, useSh, div, p.delta, p.rtol, p.btol, p.beta],
  );
  const sweep = useMemo(() => (rangeOk ? Array.from({ length: N }, (_, i) => evalPoint(p.tmin + ((p.tmax - p.tmin) * i) / (N - 1), ctx)) : null), [rangeOk, p.tmin, p.tmax, ctx]);
  const rangeRows = useMemo(() => {
    if (!rangeOk) return [];
    const step = niceStep(p.tmax - p.tmin, 8);
    const temps = [p.tmin];
    for (let t = Math.floor(p.tmin / step + 1) * step; t < p.tmax - step * 1e-6; t += step) if (t > p.tmin + step * 1e-6) temps.push(Number(t.toPrecision(12)));
    temps.push(p.tmax);
    return temps.map((t) => evalPoint(t, ctx));
  }, [rangeOk, p.tmin, p.tmax, ctx]);

  const tablePts = useMemo(() => {
    if (!part?.table || !rangeOk) return [];
    return part.table.filter(([t]) => t >= p.tmin - 1e-9 && t <= p.tmax + 1e-9).map(([t, r]) => ({
      t,
      r,
      eSh: sh && shRangeOk ? toC(temperature(sh, r)) - t : NaN,
      eBeta: betaModel ? toC(temperature(betaModel, r)) - t : NaN,
    }));
  }, [part, rangeOk, p.tmin, p.tmax, sh, shRangeOk, betaModel]);

  /* ----------------------------------------------------------- summaries */
  const maxOf = (vals: number[]) => {
    const f = vals.filter(ok);
    return f.length ? Math.max(...f) : NaN;
  };
  const maxAbs = (vals: number[]) => maxOf(vals.map(Math.abs));
  const betaErrMax = sweep ? maxAbs(sweep.map((s) => s.betaErr)) : NaN;
  const tableErrBeta = maxAbs(tablePts.map((q) => q.eBeta));
  const tableErrSh = maxAbs(tablePts.map((q) => q.eSh));

  const tdesK = toK(p.tdes);
  const at = ready && active ? (() => {
    const r = resistance(active, tdesK);
    const v = dividerV(div, r);
    return { r, v, code: adcCode(div, v), sens: sensitivity(active, div, tdesK), kpl: v <= vref ? kPerLsb(active, div, tdesK) : NaN, p: thermistorPower(div, r), tol: toleranceBand(active, tdesK, p.rtol / 100, p.btol / 100, p.beta) };
  })() : null;
  const worstKpl = sweep && ready ? maxOf(sweep.map((s) => s.kpl)) : NaN;
  const worstSelf = sweep && ready ? maxOf(sweep.map((s) => s.dT)) : NaN;
  const worstTol = sweep && ready ? maxAbs(sweep.flatMap((s) => [s.tolLo, s.tolHi])) : NaN;
  const vMin = sweep && ready ? Math.min(...sweep.map((s) => s.v).filter(ok)) : NaN;
  const vMax = sweep && ready ? Math.max(...sweep.map((s) => s.v).filter(ok)) : NaN;

  if (ready && vMax > vref) notes.push(`The divider output reaches ${si(vMax, 'V', 4)}, above the ${si(vref, 'V', 3)} ADC reference; codes clip at ${2 ** p.bits - 1}.`);
  if (ready && !p.ratio) notes.push('With a separate reference, any change in the divider supply shifts every reading; a ratiometric connection (reference = divider supply) cancels it.');
  if (sh && useSh && rangeOk) {
    const tl = Math.min(p.t1, p.t2, p.t3), th = Math.max(p.t1, p.t2, p.t3);
    if (p.tmin < tl - 1e-9 || p.tmax > th + 1e-9) notes.push(`The range extends beyond the calibration points (${fmt(tl, 4)} to ${fmt(th, 4)} °C); the Steinhart–Hart curve is extrapolated there.`);
  }
  if (part?.range && rangeOk && (p.tmin < part.range[0] || p.tmax > part.range[1])) notes.push(`${part.name} is specified from ${part.range[0]} to ${part.range[1]} °C.`);
  if (ok(worstSelf) && worstSelf > 0.1) notes.push(`Self-heating reaches ${fmt(worstSelf, 3)} °C. Increase Rs, lower the divider supply or power the divider only while sampling.`);
  if (p.part === 'generic') notes.push('The generic preset has no datasheet: enter the tolerances and dissipation constant of the part you use.');

  /* --------------------------------------------------- series resistor */
  const rsRows = ready && active ? (() => {
    const tmid = (p.tmin + p.tmax) / 2;
    const rMin = resistance(active, toK(p.tmin)), rMid = resistance(active, toK(tmid)), rMax = resistance(active, toK(p.tmax));
    return [
      { key: 'slope', rule: `Largest slope at ${tc(p.tdes)}`, formula: 'Rs = R(Tdes)', rs: rsMaxSlope(active, tdesK) },
      { key: 'turn', rule: `Turning point at ${tc(p.tdes)}`, formula: useSh ? 'Rs = 2 (dR/dT)² / (d²R/dT²) − R' : 'Rs = R (B − 2T) / (B + 2T)', rs: rsTurningPoint(active, tdesK) },
      { key: 'mid', rule: `Mid-range rule (${tc(tmid)})`, formula: 'Rs = R(Tmid)', rs: rMid },
      { key: 'span', rule: 'Largest output span', formula: 'Rs = √(R(Tmin) · R(Tmax))', rs: rsMaxSpan(rMin, rMax) },
      { key: '3pt', rule: 'Three-point linearisation', formula: 'V(Tmid) halfway between V(Tmin) and V(Tmax)', rs: rsThreePoint(rMin, rMid, rMax) },
    ].map((row) => {
      const std = ok(row.rs) ? eNearest(row.rs, series) : NaN;
      const d = { ...div, rs: std };
      const span = ok(std) ? Math.abs(dividerV(d, rMin) - dividerV(d, rMax)) : NaN;
      return { ...row, std, kpl: ok(std) ? kPerLsb(active, d, tdesK) : NaN, span };
    });
  })() : null;

  /* ------------------------------------------------------- code → T */
  const codeOk = bitsValid(p.bits) && Number.isInteger(p.code) && p.code >= 0 && p.code <= 2 ** p.bits - 1;
  if (ready && !codeOk) errors.push(`The ADC code must be a whole number from 0 to ${2 ** p.bits - 1}.`);
  const codeT = ready && active && codeOk ? toC(temperature(active, rFromV(div, codeV(div, p.code)))) : NaN;

  /* ---------------------------------------------------- lookup table */
  const lut = useMemo(() => {
    if (!ready || !active) return { text: '', rows: 0, error: '' };
    if (!(p.step >= 0.1) || !ok(p.step)) return { text: '', rows: 0, error: 'The table step must be at least 0.1 °C.' };
    const rows = lookupTable(active, div, p.tmin, p.tmax, p.step);
    if (!rows) return { text: '', rows: 0, error: `The step gives more than ${LUT_MAX_ROWS} rows; use a larger step or a narrower range.` };
    if (fmtOut === 'csv') return { text: lutCsv(rows), rows: rows.length, error: '' };
    const name = part ? part.name.replace(/[^\x20-\x7e]/g, '') : 'custom thermistor';
    const modelTxt = useSh && sh ? `Steinhart-Hart A=${sh.a.toPrecision(7)} B=${sh.b.toPrecision(7)} C=${sh.c.toPrecision(7)}` : `Beta model R0=${p.r0} ohm at ${p.t0} deg C, B=${p.beta} K`;
    const comment = [
      `NTC lookup table: ${name}`,
      modelTxt,
      `Divider: thermistor on the ${pos === 'low' ? 'low (ground)' : 'high (supply)'} side, Rs = ${Number(p.rs.toPrecision(6))} ohm, Vs = ${Number(p.vs.toPrecision(6))} V`,
      `ADC: ${p.bits} bit, ${p.ratio ? 'ratiometric (Vref = Vs)' : `Vref = ${Number(vref.toPrecision(6))} V`}, code = round(V / LSB), LSB = Vref / 2^${p.bits}`,
      `Temperatures from ${p.tmin} to ${p.tmax} deg C in steps of ${p.step} deg C; codes ${pos === 'low' ? 'fall' : 'rise'} with temperature`,
      ...(rows.some((r) => r.v > vref) ? ['WARNING: the divider output exceeds Vref in part of the range; those codes are clipped at full scale'] : []),
    ];
    return { text: lutC(rows, p.bits, comment), rows: rows.length, error: '' };
  }, [ready, active, div, pos, p.rs, p.vs, vref, p.bits, p.tmin, p.tmax, p.step, fmtOut, part, useSh, sh, p.r0, p.t0, p.beta, p.ratio]);

  /* ------------------------------------------------------------ handlers */
  const setPoint = (i: 1 | 2 | 3, tC: number) => {
    const r = tableR(part, tC);
    set(i === 1 ? { t1: tC, ...(r ? { r1: r } : {}) } : i === 2 ? { t2: tC, ...(r ? { r2: r } : {}) } : { t3: tC, ...(r ? { r3: r } : {}) });
  };
  const modified = part ? Object.entries(presetPatch(part)).some(([k, v]) => p[k as keyof typeof p] !== v) : false;

  /* --------------------------------------------------------- properties */
  const properties = (
    <div key={resetKey}>
      <Section title="Thermistor">
        <SelectField
          label="Part"
          value={part ? part.id : 'custom'}
          width={180}
          onChange={(id) => {
            const q = partById(id);
            if (q) set(presetPatch(q));
            else set({ part: 'custom' });
          }}
          options={[...NTC_PARTS.map((q) => ({ value: q.id, label: q.name })), { value: 'custom', label: 'Custom (own values)' }]}
        />
        {part && <p className="text-faint">{part.note}{modified ? ' Values changed from the preset.' : ''}</p>}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 pt-1">
          <span className="text-muted">Model for the circuit</span>
          <Segmented label="Model" value={useSh ? 'sh' : 'beta'} onChange={(v) => set({ model: v })} options={[{ value: 'sh', label: 'Steinhart–Hart' }, { value: 'beta', label: 'Beta' }]} />
        </div>
      </Section>
      <Section title="Beta model">
        <SiField label="Resistance at T0" symbol="R0" value={p.r0} onChange={(v) => set({ r0: v })} unit="Ω" prefixes={['', 'k', 'M']} />
        <NumField label="Reference temperature" symbol="T0" value={p.t0} onChange={(v) => set({ t0: v })} unit="°C" allowNegative />
        <NumField label="B value" symbol="B" value={p.beta} onChange={(v) => set({ beta: v })} unit="K" />
        <NumField label="B defined up to" symbol="T2" value={p.bt2} onChange={(v) => set({ bt2: v })} unit="°C" allowNegative hint="Second temperature of the datasheet B value, e.g. 85 for B25/85. Used for labels only." />
      </Section>
      <Section title="Steinhart–Hart points">
        {([1, 2, 3] as const).map((i) => (
          <div key={i} className="space-y-[3px]">
            <NumField label={`Point ${i} temperature`} symbol={`T${i}`} value={p[`t${i}`]} onChange={(v) => setPoint(i, v)} unit="°C" allowNegative hint="A datasheet table temperature fills in the resistance automatically for a preset part." />
            <SiField label={`Point ${i} resistance`} symbol={`R${i}`} value={p[`r${i}`]} onChange={(v) => set({ [`r${i}`]: v })} unit="Ω" prefixes={['', 'k', 'M']} digits={7} />
          </div>
        ))}
        <p className="text-faint">Use three points spread over the range, e.g. from the datasheet R/T table.</p>
      </Section>
      <Section title="Convert">
        <NumField label="Temperature" value={p.probeT} onChange={(v) => set({ probeT: v })} unit="°C" allowNegative />
        <SiField label="Resistance" value={p.probeR} onChange={(v) => set({ probeR: v })} unit="Ω" prefixes={['', 'k', 'M']} digits={7} />
        <Check label="Also show °F" checked={p.fahr} onChange={(v) => set({ fahr: v })} />
      </Section>
      <Section title="Divider and ADC">
        <SelectField label="Thermistor position" value={pos} width={150} onChange={(v) => set({ pos: v })} options={[{ value: 'low', label: 'Low side (to GND)' }, { value: 'high', label: 'High side (to supply)' }]} />
        <SiField label="Series resistor" symbol="Rs" value={p.rs} onChange={(v) => set({ rs: v })} unit="Ω" prefixes={['', 'k', 'M']} digits={6} />
        <NumField label="Divider supply" symbol="Vs" value={p.vs} onChange={(v) => set({ vs: v })} unit="V" />
        <Check label="Ratiometric (ADC reference = Vs)" checked={p.ratio} onChange={(v) => set({ ratio: v })} />
        {!p.ratio && <NumField label="ADC reference" symbol="Vref" value={p.vref} onChange={(v) => set({ vref: v })} unit="V" />}
        <NumField label="ADC resolution" symbol="N" value={p.bits} onChange={(v) => set({ bits: v })} unit="bits" />
      </Section>
      <Section title="Range and design">
        <NumField label="Lowest temperature" symbol="Tmin" value={p.tmin} onChange={(v) => set({ tmin: v })} unit="°C" allowNegative />
        <NumField label="Highest temperature" symbol="Tmax" value={p.tmax} onChange={(v) => set({ tmax: v })} unit="°C" allowNegative />
        <NumField label="Design temperature" symbol="Tdes" value={p.tdes} onChange={(v) => set({ tdes: v })} unit="°C" allowNegative hint="Temperature where the series resistor choices optimise the slope or linearity." />
        <SelectField label="Resistor series" value={series} onChange={(v) => set({ series: v })} options={[{ value: 'E24', label: 'E24 (5 %)' }, { value: 'E96', label: 'E96 (1 %)' }]} />
      </Section>
      <Section title="Self-heating and tolerance">
        <NumField label="Dissipation constant" symbol="δ" value={p.delta} onChange={(v) => set({ delta: v })} unit="mW/K" hint="From the datasheet; it depends on mounting (still air, PCB copper, potting)." />
        <NumField label="R25 tolerance" value={p.rtol} onChange={(v) => set({ rtol: v })} unit="± %" allowZero />
        <NumField label="B tolerance" value={p.btol} onChange={(v) => set({ btol: v })} unit="± %" allowZero />
        {part?.deltaNote && <p className="text-faint">{part.deltaNote}</p>}
      </Section>
      <Section title="Readout and table">
        <NumField label="ADC code to convert" value={p.code} onChange={(v) => set({ code: v })} allowZero />
        <NumField label="Table step" value={p.step} onChange={(v) => set({ step: v })} unit="°C" />
        <SelectField label="Table format" value={fmtOut} onChange={(v) => set({ fmt: v })} options={[{ value: 'csv', label: 'CSV' }, { value: 'c', label: 'C arrays' }]} />
      </Section>
    </div>
  );

  const status = ready && at ? `${useSh ? 'Steinhart–Hart' : 'Beta'} · Rs ${si(p.rs, 'Ω', 3)} · ${fmt(at.kpl, 3)} °C/LSB at ${tc(p.tdes, 3)} · self-heating ≤ ${fmt(worstSelf, 2)} °C` : 'Check the inputs';
  const pairLabel = `B${fmt(p.t0, 4)}/${fmt(p.bt2, 4)}`;
  const probeTK = toK(p.probeT);

  return (
    <ToolPage
      title="NTC Thermistor Calculator"
      description="Beta and Steinhart–Hart models, coefficient fitting from datasheet points, a thermistor divider into an ADC with sensitivity and resolution, series-resistor choice, self-heating, tolerance error and a firmware lookup table."
      onReset={() => {
        reset();
        setResetKey((k) => k + 1);
      }}
      properties={properties}
      status={status}
      method={<Method part={part} />}
    >
      <Notes kind="error" items={errors} />
      <Notes items={notes} />

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="Convert">
          <table className="tbl">
            <thead>
              <tr>
                <th />
                <th className="v">Steinhart–Hart</th>
                <th className="v">Beta ({pairLabel})</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>R at {tTxt(p.probeT)}</td>
                <td className="v">{sh && aboveZero(p.probeT) ? si(resistance(sh, probeTK), 'Ω', 5) : '—'}</td>
                <td className="v">{betaModel && aboveZero(p.probeT) ? si(resistance(betaModel, probeTK), 'Ω', 5) : '—'}</td>
              </tr>
              <tr>
                <td>T at {si(p.probeR, 'Ω', 5)}</td>
                <td className="v">{sh && p.probeR > 0 ? tTxt(toC(temperature(sh, p.probeR)), 5) : '—'}</td>
                <td className="v">{betaModel && p.probeR > 0 ? tTxt(toC(temperature(betaModel, p.probeR)), 5) : '—'}</td>
              </tr>
              <tr>
                <td>Local B at {tc(p.probeT)}</td>
                <td className="v">{sh && aboveZero(p.probeT) ? `${fmt(localBeta(sh, probeTK), 5)} K` : '—'}</td>
                <td className="v">{betaModel ? `${fmt(p.beta, 5)} K` : '—'}</td>
              </tr>
              <tr>
                <td>Temperature coefficient α</td>
                <td className="v">{sh && aboveZero(p.probeT) ? `${fmt((-100 * localBeta(sh, probeTK)) / probeTK ** 2, 4)} %/K` : '—'}</td>
                <td className="v">{betaModel && aboveZero(p.probeT) ? `${fmt((-100 * p.beta) / probeTK ** 2, 4)} %/K` : '—'}</td>
              </tr>
            </tbody>
          </table>
          {!(p.probeR > 0) && <p className="px-3 py-2 text-muted">Enter a resistance greater than 0 Ω.</p>}
          {!aboveZero(p.probeT) && <p className="px-3 py-2 text-muted">Enter a temperature above −273.15 °C.</p>}
        </Panel>

        <Panel title="Steinhart–Hart fit">
          {sh ? (
            <table className="tbl">
              <tbody>
                <Result label="A" value={sh.a.toExponential(7)} />
                <Result label="B" value={sh.b.toExponential(7)} />
                <Result label="C" value={sh.c.toExponential(7)} sub="1/T = A + B ln R + C (ln R)³, R in Ω, T in K" />
                <Result label="Fit error at the three points" value={maxAbs(pts.map((q) => toC(temperature(sh, q.r)) - q.t)) < 0.001 ? '< 0.001' : fmt(maxAbs(pts.map((q) => toC(temperature(sh, q.r)) - q.t)), 3)} unit="°C" sub="exact solution of the 3 × 3 system" />
                {tablePts.length > 0 && <Result label="Largest error against the datasheet table" value={fmt(tableErrSh, 3)} unit="°C" sub={`${tablePts.length} table points from ${tc(p.tmin)} to ${tc(p.tmax)}`} />}
              </tbody>
            </table>
          ) : (
            <p className="px-3 py-2 text-muted">Enter three valid calibration points.</p>
          )}
        </Panel>
      </div>

      <Panel title="B value depends on the temperature pair">
        <table className="tbl">
          <thead>
            <tr>
              <th>Pair</th>
              <th className="v">From the points</th>
              {part?.table && <th className="v">From the datasheet table</th>}
              <th />
            </tr>
          </thead>
          <tbody>
            {([[p.t1, p.r1, p.t2, p.r2], [p.t2, p.r2, p.t3, p.r3], [p.t1, p.r1, p.t3, p.r3]] as const).map(([ta, ra, tb, rb]) => {
              const b = betaFromPoints(toK(ta), ra, toK(tb), rb);
              return (
                <tr key={`p${ta}/${tb}`}>
                  <td>
                    B<sub>{fmt(ta, 4)}/{fmt(tb, 4)}</sub> (points)
                  </td>
                  <td className="v">{ok(b) ? `${fmt(b, 5)} K` : '—'}</td>
                  {part?.table && <td className="v">{ok(betaFromPoints(toK(ta), tableR(part, ta) ?? NaN, toK(tb), tableR(part, tb) ?? NaN)) ? `${fmt(betaFromPoints(toK(ta), tableR(part, ta)!, toK(tb), tableR(part, tb)!), 5)} K` : '—'}</td>}
                  <td>{ok(b) && <button type="button" className="btn" onClick={() => set({ beta: Number(b.toPrecision(5)), t0: ta, r0: ra, bt2: tb })}>Use in Beta model</button>}</td>
                </tr>
              );
            })}
            {sh && [50, 85, 100].map((t2) => {
              const b = betaFromPoints(toK(25), resistance(sh, toK(25)), toK(t2), resistance(sh, toK(t2)));
              const tb = part?.table && tableR(part, 25) && tableR(part, t2) ? betaFromPoints(toK(25), tableR(part, 25)!, toK(t2), tableR(part, t2)!) : NaN;
              return (
                <tr key={`s${t2}`}>
                  <td>
                    B<sub>25/{t2}</sub> (Steinhart–Hart curve)
                  </td>
                  <td className="v">{ok(b) ? `${fmt(b, 5)} K` : '—'}</td>
                  {part?.table && <td className="v">{ok(tb) ? `${fmt(tb, 5)} K` : '—'}</td>}
                  <td>{ok(b) && <button type="button" className="btn" onClick={() => set({ beta: Number(b.toPrecision(5)), t0: 25, r0: Number(resistance(sh, toK(25)).toPrecision(6)), bt2: t2 })}>Use in Beta model</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="px-3 py-2 text-muted">
          B = ln(R1/R2) / (1/T1 − 1/T2) is a chord of the ln R versus 1/T curve, so each temperature pair gives a different value. Compare like with like: a B25/50 of 3380 K and a B25/85 of 3434 K
          can describe the same part (Murata NCP18XH103).
        </p>
      </Panel>

      {sweep && (
        <Panel title="Resistance and model error">
          <div className="grid gap-3 xl:grid-cols-2">
            <Plot
              title="Resistance (Ω, log scale)"
              logY
              xMark={p.tdes}
              series={[
                { label: 'Steinhart–Hart', color: 'var(--accent)', pts: sweep.map((s) => [s.tC, s.rSh]) },
                { label: `Beta ${pairLabel}`, color: 'var(--copper)', dash: '6 4', pts: sweep.map((s) => [s.tC, s.rBeta]) },
                ...(tablePts.length ? [{ label: 'Datasheet table', color: 'var(--ink)', dots: true, pts: tablePts.map((q) => [q.t, q.r] as [number, number]) }] : []),
              ]}
              yFmt={(v) => si(v, 'Ω', 3)}
            />
            <Plot
              title="Temperature error of the Beta model (°C)"
              series={[
                { label: 'Beta vs Steinhart–Hart', color: 'var(--copper)', pts: sweep.map((s) => [s.tC, s.betaErr]) },
                ...(tablePts.length ? [
                  { label: 'Beta vs table', color: 'var(--copper)', dots: true, pts: tablePts.map((q) => [q.t, q.eBeta] as [number, number]) },
                  { label: 'Steinhart–Hart vs table', color: 'var(--accent)', dots: true, pts: tablePts.map((q) => [q.t, q.eSh] as [number, number]) },
                ] : []),
              ]}
              yFmt={(v) => fmt(v, 3)}
              zero
            />
          </div>
          <table className="tbl">
            <tbody>
              <Result label="Largest Beta-model error against Steinhart–Hart" value={fmt(betaErrMax, 3)} unit="°C" sub={`over ${tc(p.tmin)} to ${tc(p.tmax)}; the error is zero at T0 and where the curves cross`} />
              {tablePts.length > 0 && <Result label="Largest Beta-model error against the datasheet table" value={fmt(tableErrBeta, 3)} unit="°C" />}
            </tbody>
          </table>
          <p className="px-3 pb-2 text-faint">Error = temperature the Beta model reads for the resistance the reference gives, minus the true temperature. Positive: the Beta model reads high.</p>
        </Panel>
      )}

      {ready && at && sweep && (
        <>
          <Panel title={`Divider and ${p.bits}-bit ADC`}>
            <div className="flex flex-wrap gap-8 px-3 py-3">
              <Big label={`Vout at ${tc(p.tdes)}`} value={splitSi(at.v, 'V').num} unit={splitSi(at.v, 'V').u} />
              <Big label="ADC code" value={String(at.code)} unit={`of ${2 ** p.bits - 1}`} />
              <Big label="Sensitivity" value={fmt(at.sens * 1000, 4)} unit="mV/°C" />
              <Big label="Resolution" value={fmt(at.kpl, 3)} unit="°C/LSB" />
            </div>
            <table className="tbl">
              <tbody>
                <Result label="Output range" value={`${si(vMin, 'V', 4)} – ${si(vMax, 'V', 4)}`} sub={`${tc(p.tmin)} to ${tc(p.tmax)}, ${pos === 'low' ? 'falling' : 'rising'} with temperature`} />
                <Result label="Coarsest resolution in the range" value={fmt(worstKpl, 3)} unit="°C/LSB" sub={vMax > vref ? 'quantisation error is ± half of this; clipped temperatures excluded' : 'quantisation error is ± half of this'} />
                <Result label={`Thermistor power at ${tc(p.tdes)}`} value={si(at.p, 'W', 3)} sub={`largest possible: Vs²/(4 Rs) = ${si((p.vs * p.vs) / (4 * p.rs), 'W', 3)} when R = Rs`} />
                <Result label="Worst self-heating error in the range" value={`+${fmt(worstSelf, 3)}`} unit="°C" sub={`ΔT = P / δ with δ = ${fmt(p.delta, 3)} mW/K; the thermistor reads high`} />
                <Result label={`Tolerance error at ${tc(p.tdes)}`} value={`${signed(at.tol.low)} / ${signed(at.tol.high)}`} unit="°C" sub={`R25 ±${fmt(p.rtol, 3)} %, B ±${fmt(p.btol, 3)} %`} />
                <Result label="Worst tolerance error in the range" value={`±${fmt(worstTol, 3)}`} unit="°C" />
              </tbody>
            </table>
            <div className="grid gap-3 xl:grid-cols-2">
              <Plot
                title="Divider output (V)"
                xMark={p.tdes}
                series={[{ label: 'Vout', color: 'var(--accent)', pts: sweep.map((s) => [s.tC, s.v]) }, ...(!p.ratio ? [{ label: 'ADC reference', color: 'var(--muted)', dash: '3 3', pts: [[p.tmin, vref], [p.tmax, vref]] as [number, number][] }] : [])]}
                yFmt={(v) => fmt(v, 3)}
                yMin={0}
              />
              <Plot title="Resolution (°C per LSB)" xMark={p.tdes} series={[{ label: '°C/LSB', color: 'var(--copper)', pts: sweep.map((s) => [s.tC, s.kpl]) }]} yFmt={(v) => fmt(v, 3)} yMin={0} />
            </div>
            <RangeTable rows={rangeRows} useSh={useSh} />
          </Panel>

          {rsRows && (
            <Panel title="Series resistor">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Choice</th>
                    <th className="v">Exact</th>
                    <th className="v">Nearest {series}</th>
                    <th className="v">°C/LSB at {tc(p.tdes, 3)}</th>
                    <th className="v">Span</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rsRows.map((row) => (
                    <tr key={row.key}>
                      <td>
                        {row.rule}
                        <div className="text-[11px] text-faint">{row.formula}</div>
                      </td>
                      <td className="v">{ok(row.rs) ? si(row.rs, 'Ω', 4) : 'none'}</td>
                      <td className="v font-semibold">{ok(row.std) ? si(row.std, 'Ω', 3) : '—'}</td>
                      <td className="v">{fmt(row.kpl, 3)}</td>
                      <td className="v">{ok(row.span) ? si(row.span, 'V', 3) : '—'}</td>
                      <td>{ok(row.std) && <button type="button" className="btn" onClick={() => set({ rs: row.std })} aria-label={`Use ${si(row.std, 'Ω')}`}>Use</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-3 py-2 text-muted">
                Rs = R(Tdes) gives the steepest output at Tdes. The turning-point choice places the inflection of V(T), where the curve is straightest, at Tdes. The span is V(Tmin) − V(Tmax) with the
                standard value. The current Rs is {si(p.rs, 'Ω', 4)}.
              </p>
            </Panel>
          )}

          <Panel title="ADC code to temperature">
            <table className="tbl">
              <tbody>
                <Result label={`Code ${codeOk ? p.code : '—'}`} value={codeOk && p.code === 2 ** p.bits - 1 && vMax > vref ? 'full scale: the output is at or above Vref' : ok(codeT) ? tTxt(codeT, 5) : codeOk ? 'outside the thermistor range (open or short)' : '—'} strong sub={codeOk ? `Vout = ${si(codeV(div, p.code), 'V', 5)}, R = ${si(rFromV(div, codeV(div, p.code)), 'Ω', 5)}` : undefined} />
              </tbody>
            </table>
          </Panel>

          <Panel title={`Lookup table (${fmtOut === 'csv' ? 'CSV' : 'C arrays'})`} right={lut.text ? <CopyText text={lut.text} /> : undefined}>
            {lut.error ? (
              <p className="px-3 py-2 text-muted">{lut.error}</p>
            ) : (
              <>
                <p className="px-3 pt-2 text-muted">
                  {lut.rows} rows from {tc(p.tmin)} to {tc(p.tmax)} in {fmt(p.step, 4)} °C steps, {useSh ? 'Steinhart–Hart' : 'Beta'} model. Codes are round(V / LSB). In firmware, search the code array and
                  interpolate linearly between neighbouring entries.
                </p>
                <pre className="m-3 max-h-[320px] overflow-auto border border-line bg-field p-2 font-mono text-[12px] leading-snug">{lut.text}</pre>
              </>
            )}
          </Panel>

          <Panel title="Continue the design">
            <div className="flex flex-wrap gap-2 px-3 py-3">
              <Link className="btn no-underline" to={`/adc-input?${new URLSearchParams({ divider: '1', topOhms: String(pos === 'low' ? p.rs : at.r), bottomOhms: String(pos === 'low' ? at.r : p.rs), resolutionBits: String(p.bits), referenceVolts: String(vref) })}`}>
                Check ADC input settling
              </Link>
              <Link className="btn no-underline" to="/resistors">Divider and resistor tools</Link>
              <Link className="btn no-underline" to="/rc-filter">Add an RC filter</Link>
            </div>
          </Panel>
        </>
      )}
    </ToolPage>
  );
}

/* ------------------------------------------------------------------ table */

interface EvalCtx {
  sh: ShModel | null;
  betaModel: BetaModel | null;
  /** model for the circuit, null when the circuit inputs are invalid */
  active: NtcModel | null;
  useSh: boolean;
  div: Divider;
  /** W/K */
  delta: number;
  rTol: number;
  bTol: number;
  beta: number;
}

interface SweepRow {
  tC: number;
  rSh: number;
  rBeta: number;
  betaErr: number;
  v: number;
  code: number;
  sens: number;
  kpl: number;
  dT: number;
  tolLo: number;
  tolHi: number;
}

/** Everything shown for one temperature (°C). */
function evalPoint(tC: number, c: EvalCtx): SweepRow {
  const tK = toK(tC);
  const rSh = c.sh ? resistance(c.sh, tK) : NaN;
  const rBeta = c.betaModel ? resistance(c.betaModel, tK) : NaN;
  const betaErr = c.betaModel && ok(rSh) ? toC(temperature(c.betaModel, rSh)) - tC : NaN;
  const row: SweepRow = { tC, rSh, rBeta, betaErr, v: NaN, code: NaN, sens: NaN, kpl: NaN, dT: NaN, tolLo: NaN, tolHi: NaN };
  if (!c.active) return row;
  const r = c.useSh ? rSh : rBeta;
  const band = toleranceBand(c.active, tK, c.rTol, c.bTol, c.beta);
  row.v = dividerV(c.div, r);
  row.code = adcCode(c.div, row.v);
  row.sens = sensitivity(c.active, c.div, tK);
  // above the reference the code is clipped and carries no temperature information
  row.kpl = row.v <= c.div.vref ? kPerLsb(c.active, c.div, tK) : NaN;
  row.dT = selfHeating(thermistorPower(c.div, r), c.delta);
  row.tolLo = band.low;
  row.tolHi = band.high;
  return row;
}

function RangeTable({ rows, useSh }: { rows: SweepRow[]; useSh: boolean }) {
  return (
    <table className="tbl">
      <caption className="caption-bottom px-3 py-2 text-left text-faint">
        Tolerance: worst reading error of the four R25/B tolerance corners, read with the nominal model.
      </caption>
      <thead>
        <tr>
          <th className="v">T (°C)</th>
          <th className="v">R</th>
          <th className="v">Vout</th>
          <th className="v">Code</th>
          <th className="v">mV/°C</th>
          <th className="v">°C/LSB</th>
          <th className="v">Self-heating (°C)</th>
          <th className="v">Tolerance (°C)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => (
          <tr key={s.tC}>
            <td className="v">{fmt(s.tC, 4)}</td>
            <td className="v">{si(useSh ? s.rSh : s.rBeta, 'Ω', 4)}</td>
            <td className="v">{si(s.v, 'V', 4)}</td>
            <td className="v">{ok(s.code) ? s.code : '—'}</td>
            <td className="v">{fmt(s.sens * 1000, 3)}</td>
            <td className="v">{fmt(s.kpl, 3)}</td>
            <td className="v">{fmt(s.dT, 2)}</td>
            <td className="v">
              {signed(s.tolLo)} / {signed(s.tolHi)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------------- plot */

interface PlotSeries {
  label: string;
  color: string;
  pts: [number, number][];
  dash?: string;
  dots?: boolean;
}

function niceStep(span: number, n: number) {
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const k = raw / mag;
  return (k < 1.5 ? 1 : k < 3 ? 2 : k < 7 ? 5 : 10) * mag;
}

/** Interpolated y of a series sorted by x (NaN outside or across gaps). */
function yAt(pts: [number, number][], x: number) {
  for (let i = 1; i < pts.length; i++) {
    const [xa, ya] = pts[i - 1];
    const [xb, yb] = pts[i];
    if (x >= xa && x <= xb) return xb === xa ? ya : ya + ((yb - ya) * (x - xa)) / (xb - xa);
  }
  return NaN;
}

/** Line plot against temperature (°C) with an optional log y axis and a hover readout. */
function Plot({ title, series, logY = false, yFmt, xMark, zero = false, yMin }: { title: string; series: PlotSeries[]; logY?: boolean; yFmt: (v: number) => string; xMark?: number; zero?: boolean; yMin?: number }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const W = 600, H = 250, left = 66, right = 14, top = 38, bottom = 34;
  const usable = (y: number) => ok(y) && (!logY || y > 0);
  const all = series.flatMap((s) => s.pts).filter(([x, y]) => ok(x) && usable(y));
  if (all.length < 2) return <p className="px-3 py-2 text-muted">{title}: nothing to plot for these inputs.</p>;
  let x0 = Math.min(...all.map((q) => q[0]));
  let x1 = Math.max(...all.map((q) => q[0]));
  if (x1 === x0) {
    x0 -= 1;
    x1 += 1;
  }
  let y0: number, y1: number;
  const yticks: number[] = [];
  if (logY) {
    y0 = Math.floor(Math.log10(Math.min(...all.map((q) => q[1]))));
    y1 = Math.ceil(Math.log10(Math.max(...all.map((q) => q[1]))));
    if (y1 === y0) y1 += 1;
    for (let d = y0; d <= y1; d++) {
      yticks.push(10 ** d);
      if (y1 - y0 <= 2 && d < y1) yticks.push(2 * 10 ** d, 5 * 10 ** d);
    }
  } else {
    y0 = Math.min(...all.map((q) => q[1]));
    y1 = Math.max(...all.map((q) => q[1]));
    if (yMin !== undefined) y0 = Math.min(y0, yMin);
    if (zero) {
      y0 = Math.min(y0, 0);
      y1 = Math.max(y1, 0);
    }
    if (y1 - y0 < 1e-12 * Math.max(1, Math.abs(y1))) {
      const pad = Math.max(Math.abs(y1) * 0.1, 1e-3);
      y0 -= pad;
      y1 += pad;
    }
    const step = niceStep(y1 - y0, 5);
    y0 = Math.floor(y0 / step + 1e-9) * step;
    y1 = Math.ceil(y1 / step - 1e-9) * step;
    for (let v = y0; v <= y1 + step * 1e-6; v += step) yticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  }
  const X = (x: number) => left + ((x - x0) / (x1 - x0)) * (W - left - right);
  const Y = (y: number) => {
    const v = logY ? Math.log10(y) : y;
    return top + ((y1 - v) / (y1 - y0)) * (H - top - bottom);
  };
  const path = (pts: [number, number][]) => {
    let d = '';
    let pen = false;
    for (const [x, y] of pts) {
      if (!ok(x) || !usable(y)) {
        pen = false;
        continue;
      }
      d += `${pen ? 'L' : 'M'}${X(x).toFixed(2)},${Y(y).toFixed(2)} `;
      pen = true;
    }
    return d;
  };
  const xstep = niceStep(x1 - x0, 6);
  const xticks: number[] = [];
  for (let v = Math.ceil(x0 / xstep - 1e-9) * xstep; v <= x1 + 1e-9; v += xstep) xticks.push(Math.abs(v) < 1e-9 ? 0 : v);
  const lines = series.filter((s) => !s.dots);
  const hx = hover !== null && hover >= x0 && hover <= x1 ? hover : null;
  const pointerX = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    return x0 + Math.max(0, Math.min(1, (px - left) / (W - left - right))) * (x1 - x0);
  };
  return (
    <div className="min-w-0 px-2 pt-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title} onPointerMove={(e) => setHover(pointerX(e))} onPointerLeave={() => setHover(null)}>
        <title>{title} versus temperature</title>
        <defs>
          <clipPath id={id}>
            <rect x={left} y={top} width={W - left - right} height={H - top - bottom} />
          </clipPath>
        </defs>
        <text x={left} y={13} fontSize={12} fill="var(--ink)">{title}</text>
        {series.map((s, i) => {
          const lx = left + i * 150;
          return (
            <g key={s.label}>
              {s.dots ? <circle cx={lx + 9} cy={26} r={3} fill={s.color} /> : <line x1={lx} x2={lx + 18} y1={26} y2={26} stroke={s.color} strokeWidth={2} strokeDasharray={s.dash} />}
              <text x={lx + 23} y={30} fontSize={11} fill="var(--muted)">{s.label}</text>
            </g>
          );
        })}
        {xticks.map((x) => (
          <g key={`x${x}`}>
            <line x1={X(x)} x2={X(x)} y1={top} y2={H - bottom} stroke="var(--line)" />
            <text x={X(x)} y={H - bottom + 15} textAnchor="middle" fontSize={11} fill="var(--muted)">{fmt(x, 4)}</text>
          </g>
        ))}
        {yticks.map((y) => (
          <g key={`y${y}`}>
            <line x1={left} x2={W - right} y1={Y(y)} y2={Y(y)} stroke="var(--line)" />
            <text x={left - 5} y={Y(y) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{yFmt(y)}</text>
          </g>
        ))}
        <g clipPath={`url(#${id})`}>
          {zero && !logY && <line x1={left} x2={W - right} y1={Y(0)} y2={Y(0)} stroke="var(--muted)" />}
          {xMark !== undefined && xMark >= x0 && xMark <= x1 && <line x1={X(xMark)} x2={X(xMark)} y1={top} y2={H - bottom} stroke="var(--muted)" strokeDasharray="5 4" />}
          {series.map((s) =>
            s.dots ? (
              <g key={s.label} fill={s.color}>
                {s.pts.filter(([x, y]) => ok(x) && usable(y)).map(([x, y]) => <circle key={x} cx={X(x)} cy={Y(y)} r={2.6} />)}
              </g>
            ) : (
              <path key={s.label} d={path(s.pts)} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dash} />
            ),
          )}
          {hx !== null && <line x1={X(hx)} x2={X(hx)} y1={top} y2={H - bottom} stroke="var(--ink)" strokeDasharray="2 3" />}
        </g>
        <rect x={left} y={top} width={W - left - right} height={H - top - bottom} fill="none" stroke="var(--line)" />
        <text x={(left + W - right) / 2} y={H - 3} textAnchor="middle" fontSize={11} fill="var(--muted)">Temperature (°C)</text>
      </svg>
      <p className="px-2 pb-2 text-muted">
        {hx !== null
          ? `${fmt(hx, 4)} °C · ${lines.map((s) => `${s.label}: ${usable(yAt(s.pts, hx)) ? yFmt(yAt(s.pts, hx)) : '—'}`).join(' · ')}`
          : 'Move the pointer over the plot to read values.'}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------- copy */

function CopyText({ text }: { text: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  useEffect(() => {
    if (status === 'idle') return;
    const timer = setTimeout(() => setStatus('idle'), 1800);
    return () => clearTimeout(timer);
  }, [status]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('copied');
    } catch {
      setStatus('error');
    }
  };
  return (
    <button type="button" className="btn" onClick={copy} aria-live="polite">
      {status === 'copied' ? 'Copied' : status === 'error' ? 'Could not copy' : 'Copy'}
    </button>
  );
}

/* ----------------------------------------------------------------- method */

const SOURCES: readonly DataSource[] = [
  {
    title: 'J. S. Steinhart and S. R. Hart, "Calibration curves for thermistors", Deep-Sea Research 15 (1968) 497–503',
    url: 'https://doi.org/10.1016/0011-7471(68)90057-0',
    note: 'The equation 1/T = A + B ln R + C (ln R)³ and its calibration from measured points.',
  },
  {
    title: 'TDK (EPCOS), NTC thermistors, general technical information, January 2018',
    url: 'https://www.tdk-electronics.tdk.com/download/531116/19643b7ea798d7c4670141a88cd993f9/pdf-general-technical-information.pdf',
    note: 'Section 3.1: exponential (Beta) model, B value from two temperatures (formula 3), tolerance of R and B. Section 3.2: self-heating, dissipation factor δth, largest self-heating when Rs = R.',
  },
  {
    title: 'TDK (EPCOS), NTC thermistors, application notes, January 2018',
    url: 'https://www.tdk-electronics.tdk.com/download/531110/5608e4b12153bb12af2808fbedc5a55b/pdf-applicationnotes.pdf',
    note: 'Section 1.2: linearisation with a resistor, turning point at the mean temperature, RP = RT (B − 2T)/(B + 2T).',
  },
  {
    title: 'Microchip AN685, Thermistors in Single Supply Temperature Sensing Circuits (B. C. Baker, 1999)',
    url: 'https://ww1.microchip.com/downloads/en/appnotes/00685b.pdf',
    note: 'Series resistor equal to the thermistor resistance at the middle of the temperature range; Steinhart–Hart form.',
  },
  ...NTC_PARTS.flatMap((q) => (q.source ? [q.source] : [])),
];

export function Method({ part }: { part?: NtcPart }) {
  return (
    <>
      <h2>Beta model</h2>
      <p>The exponential approximation used in NTC datasheets describes the resistance with one material constant B and a reference point, normally 25 °C:</p>
      <div className="eq">
        <span className="no">(1)</span>
        <i>R</i>(<i>T</i>) = <i>R</i>
        <sub>0</sub> · exp[<i>B</i> (1/<i>T</i> − 1/<i>T</i>
        <sub>0</sub>)], <i>T</i> = 1 / (1/<i>T</i>
        <sub>0</sub> + ln(<i>R</i>/<i>R</i>
        <sub>0</sub>)/<i>B</i>)
      </div>
      <p>
        Temperatures are absolute (T = °C + 273.15). For real materials the local B changes with temperature (it rises with temperature in all three datasheet tables used here), so a single B describes
        the curve exactly only at the two temperatures it was measured at. The datasheet value is the chord between two points:
      </p>
      <div className="eq">
        <span className="no">(2)</span>
        <i>B</i>
        <sub>T1/T2</sub> = ln(<i>R</i>
        <sub>1</sub>/<i>R</i>
        <sub>2</sub>) / (1/<i>T</i>
        <sub>1</sub> − 1/<i>T</i>
        <sub>2</sub>)
      </div>
      <p>
        That is why manufacturers quote B25/50, B25/85 or B25/100 and why they differ for the same part: Murata gives 3380 K (25/50), 3434 K (25/85) and 3455 K (25/100) for the NCP18XH103. Use the pair
        closest to the temperatures that matter, or use the Steinhart–Hart model. The local B, −T² d(ln R)/dT, is shown by the converter; the temperature coefficient is α = −B/T².
      </p>
      <h2>Steinhart–Hart model</h2>
      <div className="eq">
        <span className="no">(3)</span>1/<i>T</i> = <i>A</i> + <i>B</i> ln <i>R</i> + <i>C</i> (ln <i>R</i>)³
      </div>
      <p>
        Steinhart and Hart proposed this form for oceanographic thermistors in 1968. With R in ohms and T in kelvin, three calibration points (T<sub>i</sub>, R<sub>i</sub>) give three linear equations in A,
        B and C, solved here exactly (Gaussian elimination with pivoting). The determinant is (L<sub>2</sub> − L<sub>1</sub>)(L<sub>3</sub> − L<sub>1</sub>)(L<sub>3</sub> − L<sub>2</sub>)(L<sub>1</sub> + L
        <sub>2</sub> + L<sub>3</sub>) with L<sub>i</sub> = ln R<sub>i</sub>, so the resistances must differ. The fit passes through the three points; between and beyond them the error depends on the
        material. Choose points that span the range you measure: for the Vishay table, points at −40, 25 and 125 °C keep the whole −40 to 125 °C table within 0.06 °C. The Beta model is the special case
        C = 0, B<sub>SH</sub> = 1/B, A = 1/T<sub>0</sub> − ln R<sub>0</sub>/B.
      </p>
      <p>
        Resistance from temperature needs the real root of C x³ + B x + (A − 1/T) = 0 with x = ln R. With y = (A − 1/T)/(2C) and p = B/(3C), Cardano's formula gives x = ∛(√(p³ + y²) − y) − ∛(√(p³ + y²)
        + y); the result is refined with Newton steps. The curve is used only where B + 3C (ln R)² {'>'} 0 over the whole range, so that resistance falls monotonically with temperature.
      </p>
      <h2>Divider into an ADC</h2>
      <p>With the thermistor from the output to ground (low side) and Rs to the supply Vs, or the other way round (high side):</p>
      <div className="eq">
        <span className="no">(4)</span>
        <i>V</i>
        <sub>low</sub> = <i>V</i>
        <sub>s</sub> · <i>R</i> / (<i>R</i> + <i>R</i>
        <sub>s</sub>), <i>V</i>
        <sub>high</sub> = <i>V</i>
        <sub>s</sub> · <i>R</i>
        <sub>s</sub> / (<i>R</i> + <i>R</i>
        <sub>s</sub>)
      </div>
      <div className="eq">
        <span className="no">(5)</span>
        d<i>V</i>/d<i>T</i> = ± <i>V</i>
        <sub>s</sub> <i>R</i>
        <sub>s</sub> / (<i>R</i> + <i>R</i>
        <sub>s</sub>)² · d<i>R</i>/d<i>T</i>
      </div>
      <p>
        with d<i>R</i>/d<i>T</i> = −<i>B R</i>/<i>T</i>² for the Beta model and −<i>R</i> / (<i>T</i>² (<i>B</i> + 3<i>C</i> ln²<i>R</i>)) for Steinhart–Hart; the sign is + for the low side.
      </p>
      <p>
        An N-bit ADC with reference V<sub>ref</sub> has 1 LSB = V<sub>ref</sub>/2<sup>N</sup>. Codes are taken as round(V/LSB), limited to 0…2<sup>N</sup> − 1, i.e. an ideal converter with code
        transitions at ½ LSB; a converter whose first transition is at 1 LSB reads up to one code lower. The resolution is LSB / |dV/dT| in °C per LSB and the quantisation error is ± half of it. When the
        ADC reference is the divider supply (ratiometric), the code is 2<sup>N</sup> · R/(R + Rs) and does not depend on Vs. With a separate reference every change of Vs appears as a temperature error.
        The code-to-temperature readout uses the centre voltage of the code, R = Rs V/(Vs − V) (low side) or Rs (Vs − V)/V (high side).
      </p>
      <h2>Choosing the series resistor</h2>
      <p>Four choices are listed, each with the nearest E24 or E96 value:</p>
      <ul>
        <li>
          <b>Largest slope at T<sub>des</sub>: Rs = R(T<sub>des</sub>).</b> From (5), |dV/dT| ∝ Rs/(R + Rs)², whose derivative with respect to Rs is (R − Rs)/(R + Rs)³, zero at Rs = R. The slope there is
          V<sub>s</sub> B/(4T²) for the Beta model. Applied at the middle of the range this is the rule given in Microchip AN685.
        </li>
        <li>
          <b>Turning point at T<sub>des</sub>.</b> For a fixed Rs, the slope of V(T) is largest at the inflection of the curve, where d²V/dT² = 0 and V(T) is locally straight. With s = dR/dT, (5) gives
          s′(R + Rs) = 2s², so Rs = 2s²/s′ − R. For the Beta model, s = −BR/T² and s′ = BR(B + 2T)/T⁴, which reduces to
        </li>
      </ul>
      <div className="eq">
        <span className="no">(6)</span>
        <i>R</i>
        <sub>s</sub> = <i>R</i>(<i>T</i>) · (<i>B</i> − 2<i>T</i>) / (<i>B</i> + 2<i>T</i>)
      </div>
      <p>
        TDK gives the same expression for a resistor in parallel with the thermistor, R ∥ RP = RP · R/(R + RP), which has the same shape as the low-side divider. It is smaller than R(T): for B = 3977 K at
        25 °C, Rs = 0.739 R(25 °C). Conversely, with Rs = R(T<sub>mid</sub>) the steepest point of the curve lies below T<sub>mid</sub>, where R = Rs (B + 2T)/(B − 2T). The Steinhart–Hart version uses the
        analytic derivatives of (3).
      </p>
      <ul>
        <li>
          <b>Largest output span: Rs = √(R(T<sub>min</sub>) · R(T<sub>max</sub>)).</b> The span V<sub>s</sub>[R<sub>1</sub>/(R<sub>1</sub> + Rs) − R<sub>3</sub>/(R<sub>3</sub> + Rs)] has zero derivative
          when R<sub>3</sub>(R<sub>1</sub> + Rs)² = R<sub>1</sub>(R<sub>3</sub> + Rs)², i.e. Rs² = R<sub>1</sub>R<sub>3</sub>. The outputs at the two ends are then symmetrical about Vs/2.
        </li>
        <li>
          <b>Three-point linearisation.</b> Requiring V(T<sub>mid</sub>) to be the mean of V(T<sub>min</sub>) and V(T<sub>max</sub>), 2R<sub>2</sub>/(R<sub>2</sub> + Rs) = R<sub>1</sub>/(R<sub>1</sub> + Rs) + R
          <sub>3</sub>/(R<sub>3</sub> + Rs), expands to a linear equation in Rs:
        </li>
      </ul>
      <div className="eq">
        <span className="no">(7)</span>
        <i>R</i>
        <sub>s</sub> = (<i>R</i>
        <sub>2</sub>(<i>R</i>
        <sub>1</sub> + <i>R</i>
        <sub>3</sub>) − 2<i>R</i>
        <sub>1</sub>
        <i>R</i>
        <sub>3</sub>) / (<i>R</i>
        <sub>1</sub> + <i>R</i>
        <sub>3</sub> − 2<i>R</i>
        <sub>2</sub>)
      </div>
      <p>The same results hold for the high-side position, whose output is Vs minus the low-side output.</p>
      <h2>Self-heating</h2>
      <div className="eq">
        <span className="no">(8)</span>
        <i>P</i> = <i>V</i>
        <sub>s</sub>² <i>R</i> / (<i>R</i> + <i>R</i>
        <sub>s</sub>)², Δ<i>T</i> = <i>P</i> / δ
      </div>
      <p>
        In steady state the thermistor sits ΔT above its surroundings and reads high by that amount. P is largest, V<sub>s</sub>²/(4Rs), where R = Rs, as TDK shows for its B57861S. The dissipation
        constant δ is measured by the manufacturer in a defined medium, usually still air; copper, potting or airflow change it. Preset values are the datasheet figures:{' '}
        {part?.delta ? `${part.delta} mW/K for the ${part.name}.` : 'enter the value from your datasheet.'} Powering the divider only while sampling reduces the average power.
      </p>
      <h2>Tolerance</h2>
      <p>
        The R25 tolerance applies at 25 °C. The B tolerance spreads the resistance away from 25 °C. A part at a tolerance corner has
      </p>
      <div className="eq">
        <span className="no">(9)</span>
        <i>R</i>
        <sub>act</sub>(<i>T</i>) = <i>R</i>(<i>T</i>) · (1 ± <i>t</i>
        <sub>R</sub>) · exp[± <i>t</i>
        <sub>B</sub>
        <i>B</i> (1/<i>T</i> − 1/<i>T</i>
        <sub>25</sub>)]
      </div>
      <p>
        and the error band is the spread of the temperatures read from the four corners with the nominal model. To first order this is TDK's ΔR/R = ΔR<sub>25</sub>/R<sub>25</sub> + (1/T − 1/T
        <sub>25</sub>) ΔB and Vishay's Z = (1 + X)(1 + Y) − 1 followed by ΔT = Z/α. Vishay's example, ±5 % R25 and the ±0.75 % B tolerance at 0 °C, gives Z = 5.966 % and ±1.17 °C. With the Vishay
        preset the calculator gives −1.13 / +1.19 °C there: the corners are evaluated exactly instead of linearised, so the band is slightly asymmetric. The B tolerance is taken as a fraction of the B value entered, which should be the one the datasheet specifies the tolerance for. The series
        resistor tolerance and drift, ADC offset, gain and non-linearity, reference noise and lead resistance are not included.
      </p>
      <h2>Lookup table</h2>
      <p>
        The table lists, for each temperature step, R from the selected model, the divider output and the ideal code. The C output has one array of codes and one of temperatures in 0.1 °C; firmware finds
        the two entries that bracket a reading and interpolates linearly. The interpolation error grows with the step and is largest where the curve bends most, at the ends of the range. Check the ADC
        input against its sampling requirements with the{' '}
        <Link to="/adc-input">ADC input settling checker</Link>: the source resistance of the divider is R ∥ Rs.
      </p>
      <Sources items={SOURCES} />
    </>
  );
}
