import { Link } from 'react-router-dom';
import { ToolPage } from '../components/ToolPage';
import { Big, Check, Notes, NumField, Panel, Result, Section } from '../components/ui';
import { analyseBoost, boostPoint, validateBoost, type BoostAnalysis, type BoostDesign, type BoostPoint } from '../lib/boostDesign';
import { fmt, si } from '../lib/units';
import { useUrlState } from '../state/useUrlState';

const DEFAULTS = {
  vmin: 3, vnom: 3.7, vmax: 0, vout: 5, iout: 1, fs: 1000, fsmax: 0, eff: 85, rr: 30, l: 0, dv: 30, esr: 5, ilim: 0, vf: 0,
  ltol: 20, isat: 0, irms: 0, dcr: 0, cout: 0, ctol: 10, cbias: 80, crating: 0, cv: 0, total: 0,
  cin: 0, cintol: 10, cinbias: 80, cinesr: 0, dvin: 30, cinmin: 0, cinrating: 0, cinv: 0,
  dmax: 0, ton: 0, toff: 0, vsw: 0, vd: 0, probe: 0,
  // optional parts of the page; switching one off removes its inputs, its results and its checks
  xcin: true, xrat: true, xic: true, xsweep: true, xwave: true,
};

function evaluateBoost(input: BoostDesign) {
  const errors = validateBoost(input);
  if (errors.length) return { errors, r: null };
  try { return { errors, r: analyseBoost(input) }; }
  catch (e) { return { errors: [e instanceof Error ? e.message : 'Unable to calculate.'], r: null }; }
}

export default function Boost() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const b: BoostDesign = {
    vinMin: p.vmin, vinNom: p.vnom, vinMax: p.vmax === 0 ? p.vnom : p.vmax, vout: p.vout, iout: p.iout,
    fs: p.fs * 1e3, fsMax: (p.fsmax === 0 ? p.fs : p.fsmax) * 1e3, eff: p.eff / 100, rippleRatio: p.rr / 100,
    l: p.l * 1e-6, dvout: p.dv * 1e-3, esr: p.esr * 1e-3, ilim: p.ilim, vf: p.vf,
    lTol: p.ltol / 100, isat: p.isat, irms: p.irms, dcr: p.dcr * 1e-3,
    cout: p.cout * 1e-6, cTol: p.ctol / 100, cBias: p.cbias / 100, dvTotal: p.total * 1e-3,
    // a switched-off group contributes nothing: its values are read as “not supplied”
    cin: p.xcin ? p.cin * 1e-6 : 0, cinTol: p.cintol / 100, cinBias: p.cinbias / 100, cinEsr: p.xcin ? p.cinesr * 1e-3 : 0,
    dvin: p.dvin * 1e-3, cinDataMin: p.xcin ? p.cinmin * 1e-6 : 0,
    cinRating: p.xcin && p.xrat ? p.cinrating : 0, cinVoltage: p.xcin && p.xrat ? p.cinv : 0,
    cRating: p.xrat ? p.crating : 0, cVoltage: p.xrat ? p.cv : 0,
    maxDuty: p.xic ? p.dmax / 100 : 0, minOn: p.xic ? p.ton * 1e-9 : 0, minOff: p.xic ? p.toff * 1e-9 : 0,
    switchVoltage: p.xic ? p.vsw : 0, diodeVoltage: p.xic ? p.vd : 0,
  };
  const analysis = evaluateBoost(b);
  const { r, errors } = analysis;
  // the inspected voltage is set from the sweep; without the sweep the waveform shows nominal input
  const voltage = Math.max(b.vinMin, Math.min(b.vinMax, (p.xsweep && p.probe) || p.vnom));
  const point = r ? boostPoint(b, r.lMin, voltage) : null;
  const notes: string[] = [];
  if (r && !r.ccm) notes.push('The input range includes boundary or discontinuous conduction at this load. CCM component results are withheld; increase inductance or use a converter-specific DCM model. Forced reverse-current operation is not modelled.');
  if (r && r.ccm && b.dvTotal > 0 && r.totalRequired === null) notes.push('ESR ripple alone meets or exceeds the total output-ripple budget. More capacitance cannot meet this budget with the entered ESR.');
  if (r && r.ccm && r.partialLoss > r.loss + 1e-9) notes.push('The entered winding, diode and capacitor losses exceed the loss budget implied by your efficiency estimate. Check the efficiency and component values.');
  const field = (label: string, k: keyof typeof DEFAULTS, unit: string, hint?: string, allowZero = false) =>
    <NumField key={k} label={label} value={p[k] as number} onChange={v => set({ [k]: v })} unit={unit} hint={hint} allowZero={allowZero} />;
  const optional = '0 = not supplied; no pass is claimed.';
  const toggle = (label: string, k: 'xcin' | 'xrat' | 'xic' | 'xsweep' | 'xwave', hint: string) =>
    <Check key={k} label={label} checked={p[k]} onChange={v => set({ [k]: v })} hint={hint} />;
  const properties = <>
    <Section title="Extras">
      <p className="pb-0.5 text-faint">Switch off anything this design does not need: its inputs, its results and its checks all disappear.</p>
      {toggle('Input capacitor', 'xcin', 'Sizing, ripple and the input-capacitor checks.')}
      {toggle('Capacitor ratings', 'xrat', 'Ripple-current and voltage ratings of the capacitor banks.')}
      {toggle('IC timing / voltage limits', 'xic', 'Duty cycle, minimum on and off time, switch and diode voltage.')}
      {toggle('Input-range sweep', 'xsweep', 'The plot across the input-voltage range.')}
      {toggle('Current waveform', 'xwave', 'The inductor current waveform at the inspected voltage.')}
    </Section>
    <Section title="Input / Output">
      {field('Input voltage min.', 'vmin', 'V')}
      {field('Input voltage nominal', 'vnom', 'V')}
      {field('Input voltage max.', 'vmax', 'V', '0 = nominal input, preserving existing saved designs.', true)}
      {field('Output voltage', 'vout', 'V')}
      {field('Output load current', 'iout', 'A', 'Checks apply at this load; lower loads may enter DCM.')}
    </Section>
    <Section title="Converter">
      {field('Switching frequency min.', 'fs', 'kHz')}
      {field('Switching frequency max.', 'fsmax', 'kHz', '0 = minimum frequency. Use the datasheet maximum for timing checks.', true)}
      {field('Estimated efficiency', 'eff', '%')}
      {field('Switch current limit (min.)', 'ilim', 'A', 'Guaranteed minimum peak-current limit, not a valley or average-current limit. ' + optional, true)}
      {field('Diode forward voltage', 'vf', 'V', '0 = omit diode loss (e.g. synchronous converter). This is not a synchronous MOSFET loss model.', true)}
    </Section>
    <Section title="Inductor">
      {field('Ripple target', 'rr', '%', 'Of Iout × Vout / Vin,nom, for the initial TI inductance estimate.')}
      {field('Inductor used', 'l', 'µH', '0 = use the calculated inductance.', true)}
      {field('Inductance tolerance', 'ltol', '%', 'Low inductance and minimum switching frequency are used for current and CCM checks.', true)}
      {field('Saturation current', 'isat', 'A', 'Use the hot rating at an acceptable inductance drop. ' + optional, true)}
      {field('Inductor RMS rating', 'irms', 'A', optional, true)}
      {field('Winding DCR', 'dcr', 'mΩ', 'At operating temperature. 0 = winding loss not supplied.', true)}
    </Section>
    <Section title="Output Capacitor">
      {field('Capacitive ripple budget', 'dv', 'mV', 'Excludes ESR and switching spikes. Existing links keep their original meaning.')}
      {field('Capacitance used', 'cout', 'µF', 'Total nominal bank capacitance; 0 = sizing only.', true)}
      {field('Capacitance tolerance', 'ctol', '%', 'Worst-case negative tolerance.', true)}
      {field('Capacitance retained', 'cbias', '%', 'Percentage remaining at operating DC voltage and temperature, before the tolerance above. Use your capacitor data.')}
      {field('Bank ESR', 'esr', 'mΩ', 'Effective ESR of the complete parallel bank at the relevant frequency.', true)}
      {field('Total ripple budget', 'total', 'mV', '0 = skip. Checks conservative capacitive + ESR ripple; excludes ESL spikes.', true)}
    </Section>
    {p.xcin && <Section title="Input Capacitor" defaultOpen={false}>
      {field('Input capacitive ripple', 'dvin', 'mV')}
      {field('Input capacitance used', 'cin', 'µF', 'Total nominal bank capacitance; 0 = sizing only.', true)}
      {field('Input capacitance tolerance', 'cintol', '%', undefined, true)}
      {field('Input capacitance retained', 'cinbias', '%', 'Retention at maximum input voltage and operating temperature, before tolerance.')}
      {field('Input bank ESR', 'cinesr', 'mΩ', undefined, true)}
      {field('Datasheet minimum Cin', 'cinmin', 'µF', 'Required effective capacitance. The larger of this and the ripple estimate is used.', true)}
    </Section>}
    {p.xrat && <Section title="Capacitor Ratings" defaultOpen={false}>
      {field('Output bank ripple rating', 'crating', 'A', optional, true)}
      {field('Output voltage rating', 'cv', 'V', optional, true)}
      {p.xcin && field('Input bank ripple rating', 'cinrating', 'A', optional, true)}
      {p.xcin && field('Input voltage rating', 'cinv', 'V', optional, true)}
    </Section>}
    {p.xic && <Section title="IC Timing / Voltage Limits" defaultOpen={false}>
      {field('Maximum duty cycle', 'dmax', '%', optional, true)}
      {field('Minimum on-time', 'ton', 'ns', 'Use the worst-case (maximum specified) minimum on-time. ' + optional, true)}
      {field('Minimum off-time', 'toff', 'ns', 'Use the worst-case (maximum specified) minimum off-time. ' + optional, true)}
      {field('Switch voltage rating', 'vsw', 'V', 'Steady-state check only; allow additional headroom for ringing and transients. ' + optional, true)}
      {field('Diode reverse rating', 'vd', 'V', 'Checked when a nonzero diode forward voltage is supplied. ' + optional, true)}
    </Section>}
  </>;
  const current = (n: number) => r?.ccm ? fmt(n, 4) : '—';
  const cap = (n: number) => r?.ccm ? si(n, 'F', 4) : '—';
  // checks belonging to a switched-off group are dropped, not shown as unchecked
  const shown = { cin: p.xcin, ratings: p.xrat, cinRating: p.xcin && p.xrat, ic: p.xic };
  const checks = r?.checks.filter(c => !c.group || shown[c.group]) ?? [];
  const failures = checks.filter(c => c.state === 'fail').length;
  return <ToolPage title="Boost Converter Calculator"
    description="Size a boost power stage and check real inductors, capacitor banks and IC limits across the input-voltage range, with conduction-mode checks and current waveforms."
    properties={properties} onReset={reset} method={<Method />}
    status={r ? (r.ccm ? failures ? `${failures} checks outside the entered limits` : 'CCM screening complete; review unspecified ratings' : 'Outside CCM — component results unavailable') : 'Check the inputs'}>
    <Notes kind="error" items={errors} />
    <Notes items={notes} />
    {r && point && <>
      <Panel title="Design Overview" right={<Link className="btn no-underline" to={`/feedback-divider?vout=${p.vout}`}>Feedback divider</Link>}>
        <div className="flex flex-wrap gap-8 px-2.5 py-2">
          <Big label={p.l ? 'Inductor used' : 'Calculated inductor'} value={si(r.l, 'H', 3).replace(/H$/, '')} unit="H" />
          <Big label="Peak inductor current" value={current(r.peak.iSwMax)} unit="A" />
          <Big label="Effective Cout needed" value={r.ccm ? si(r.requiredOut, 'F', 3).replace(/F$/, '') : '—'} unit="F" />
        </div>
        <p className="px-2.5 pb-2 text-muted">Current and capacitor checks use {si(r.lMin, 'H', 4)} at minimum frequency, across {fmt(b.vinMin)}–{fmt(b.vinMax)} V.
          {' '}The input sweep samples 201 points plus the nominal voltage and analytical ripple/CCM-boundary extrema. Ratings of 0 remain unchecked.</p>
      </Panel>
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="Inductor and Current">
          <table className="tbl"><tbody>
            <Result label="Calculated inductance" value={si(r.base.lCalc, 'H', 4)} sub="Initial estimate at nominal input; confirm the IC's recommended L range." />
            <Result label="Minimum inductance" value={si(r.lMin, 'H', 4)} sub={`After −${fmt(p.ltol)} % tolerance`} />
            <Result label="Maximum ripple current" value={current(r.worstRipple.dIl)} unit="A" sub={`At ${fmt(r.worstRipple.vin)} V`} />
            <Result label="Maximum peak current" value={current(r.peak.iSwMax)} unit="A" sub={`At ${fmt(r.peak.vin)} V`} />
            <Result label="Maximum RMS current" value={current(r.rms.ilRms)} unit="A" />
            <Result label="Lowest valley current" value={current(r.minValley.valley)} unit="A" />
            <Result label="Maximum CCM boundary load" value={fmt(r.boundary.boundary, 4)} unit="A" sub={`At ${fmt(r.boundary.vin)} V. Load must exceed this for CCM across the range.`} />
            <Result label="Winding copper loss" value={r.ccm && b.dcr ? fmt(r.rms.windingLoss, 4) : '—'} unit="W" sub="RMS² × hot DCR. Core and AC winding losses excluded." />
          </tbody></table>
        </Panel>
        <Panel title="Output Capacitor">
          <table className="tbl"><tbody>
            <Result label="Effective capacitance needed" value={cap(r.requiredOut)} sub={`For ${fmt(p.dv)} mV capacitive ripple`} strong />
            <Result label="Nominal bank needed" value={cap(r.requiredOut / ((1 - b.cTol) * b.cBias))} sub="Includes the entered retention and tolerance." />
            <Result label="Selected bank, effective" value={b.cout ? si(r.coutEffective, 'F', 4) : 'Not supplied'} />
            <Result label="Maximum capacitor RMS current" value={current(r.outputRms)} unit="A" />
            <Result label="Maximum ESR ripple" value={r.ccm ? fmt(r.esrOut * 1e3, 4) : '—'} unit="mV" />
            <Result label="Predicted total ripple (upper bound)" value={r.ccm && r.totalOut !== null ? fmt(r.totalOut * 1e3, 4) : '—'} unit="mV" sub="Selected bank: capacitive ripple + ESR. Switching spikes excluded." strong />
            {b.dvTotal > 0 && <Result label="Effective C for total budget" value={!r.ccm ? '—' : r.totalRequired === null ? 'ESR exceeds budget' : si(Math.max(r.requiredOut, r.totalRequired), 'F', 4)} />}
          </tbody></table>
        </Panel>
        {p.xcin && <Panel title="Input Capacitor">
          <table className="tbl"><tbody>
            <Result label="Effective input capacitance needed" value={cap(r.requiredIn)} sub="Larger of triangular-ripple estimate and datasheet minimum." strong />
            <Result label="Nominal input bank needed" value={cap(r.requiredIn / ((1 - b.cinTol) * b.cinBias))} />
            <Result label="Selected input bank, effective" value={b.cin ? si(r.cinEffective, 'F', 4) : 'Not supplied'} />
            <Result label="Maximum input capacitor RMS" value={current(r.inputRms)} unit="A" />
            <Result label="Predicted input ripple (upper bound)" value={r.ccm && r.totalIn !== null ? fmt(r.totalIn * 1e3, 4) : '—'} unit="mV" sub="Selected bank: capacitive + ESR, assuming a source supplying the average current." />
          </tbody></table>
        </Panel>}
        <Panel title="Duty Cycle and Power">
          <table className="tbl"><tbody>
            <Result label="Duty at minimum input" value={fmt(100 * r.dutyHigh, 4)} unit="%" />
            <Result label="Duty at maximum input" value={fmt(100 * r.dutyLow, 4)} unit="%" />
            <Result label="Shortest on / off time" value={`${fmt(r.on * 1e9, 4)} / ${fmt(r.off * 1e9, 4)}`} unit="ns" sub="At maximum switching frequency, using the efficiency-adjusted duty estimate." />
            <Result label="Output power" value={fmt(r.pout, 4)} unit="W" />
            <Result label="Estimated input power" value={fmt(r.pin, 4)} unit="W" />
            <Result label="Estimated total loss" value={fmt(r.loss, 4)} unit="W" sub="Pout × (1/η − 1); based on entered efficiency." />
            <Result label="Average input current at Vin,min" value={fmt(r.pin / b.vinMin, 4)} unit="A" sub="Power-balance estimate." />
            {p.vf > 0 && <Result label="Diode average current / loss" value={`${fmt(b.iout)} A / ${fmt(b.iout * p.vf)} W`} />}
            <Result label="Entered component loss subtotal" value={r.ccm ? fmt(r.partialLoss, 4) : '—'} unit="W" sub="DCR + capacitor ESR + diode loss. Already part of, not added to, the estimated total loss." />
          </tbody></table>
        </Panel>
      </div>
      <Panel title="Component and IC Checks">
        <p className="px-2.5 py-2 text-muted">Pass means the supplied rating covers this preliminary steady-state estimate. Voltage checks exclude ringing, start-up and transients.
          {' '}Inductor saturation during faults needs the IC's maximum current limit and overshoot, not just the operating peak.</p>
        <table className="tbl"><thead><tr><th>Check</th><th>Status</th><th>Detail</th></tr></thead><tbody>
          {checks.map(c => <tr key={c.label}><td>{c.label}</td><td className={c.state === 'fail' ? 'text-[var(--err-line)]' : c.state === 'pass' ? 'text-ok' : 'text-faint'}>{c.state === 'unknown' ? 'Not checked' : c.state === 'pass' ? 'Pass' : 'Outside limit'}</td><td>{c.detail}</td></tr>)}
        </tbody></table>
      </Panel>
      {p.xsweep && <Panel title="Explore the Input Range">
        <div className="px-2.5 py-2">
          <label className="flex items-center gap-3">Inspect input voltage
            <input aria-label="Inspect input voltage" className="min-w-0 flex-1" type="range" min={b.vinMin} max={b.vinMax}
              step={(b.vinMax - b.vinMin) / 200 || 0.001} value={voltage} disabled={b.vinMin === b.vinMax} onChange={e => set({ probe: Number(e.target.value) })} />
            <span className="tnum">{fmt(voltage, 4)} V</span>
          </label>
        </div>
        <RangePlot r={r} load={b.iout} voltage={voltage} onVoltage={v => set({ probe: v })} />
        <p className="px-2.5 pb-2 text-muted">At {fmt(voltage)} V: {point.ccm ? `peak ${fmt(point.iSwMax)} A; valley ${fmt(point.valley)} A` : 'outside CCM'}.
          {' '}CCM boundary load {fmt(point.boundary)} A.
          {point.ccm && point.ceiling !== null ? ` Current-limit ceiling ${fmt(point.ceiling)} A (not a guaranteed output rating).` : ''}</p>
      </Panel>}
      {p.xwave && <Panel title="Inductor Current Waveform">
        {point.ccm ? <Waveform p={point} fs={b.fs} /> : <div className="px-2.5 py-2 text-muted">No CCM waveform is shown at this voltage: the predicted current reaches zero. A DCM or forced-PWM model is required.</div>}
      </Panel>}
    </>}
  </ToolPage>;
}

function RangePlot({ r, load, voltage, onVoltage }: { r: BoostAnalysis; load: number; voltage: number; onVoltage: (v: number) => void }) {
  const w = 620, h = 240, left = 55, right = 18, top = 22, bottom = 35;
  const lo = r.points[0].vin, hi = r.points[r.points.length - 1].vin;
  const max = Math.max(load, ...r.points.map(p => Math.max(p.ccm ? p.iSwMax : 0, p.boundary, p.ccm ? p.ceiling ?? 0 : 0))) * 1.15;
  const x = (v: number) => left + (hi === lo ? 0.5 : (v - lo) / (hi - lo)) * (w - left - right);
  const y = (v: number) => h - bottom - v / max * (h - top - bottom);
  const path = (value: (p: BoostPoint) => number | null) => {
    let pen = false;
    return r.points.map(p => { const v = value(p); if (v === null) { pen = false; return ''; } const cmd = pen ? 'L' : 'M'; pen = true; return `${cmd}${x(p.vin)},${y(v)}`; }).join(' ');
  };
  return <div className="px-2 pb-2">
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Peak inductor current, CCM boundary load and current-limit output ceiling versus input voltage"
      onPointerDown={e => { const box = e.currentTarget.getBoundingClientRect(); onVoltage(lo + Math.max(0, Math.min(1, ((e.clientX - box.left) / box.width * w - left) / (w - left - right))) * (hi - lo)); }}>
      <text x={left} y={14} fill="var(--muted)" fontSize={11}>Current (A)</text>
      {[0, 1, 2, 3, 4].map(i => <g key={i}>
        <line x1={left} x2={w - right} y1={y(max * i / 4)} y2={y(max * i / 4)} stroke="var(--line)" />
        <text x={left - 6} y={y(max * i / 4) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{fmt(max * i / 4, 3)}</text>
      </g>)}
      {(hi === lo ? [lo] : [lo, (lo + hi) / 2, hi]).map(v => <text key={v} x={x(v)} y={h - 15} textAnchor="middle" fontSize={11} fill="var(--muted)">{fmt(v, 3)} V</text>)}
      <line x1={left} x2={w - right} y1={y(load)} y2={y(load)} stroke="var(--muted)" strokeDasharray="4 4" />
      <path d={path(p => p.ccm ? p.iSwMax : null)} fill="none" stroke="var(--copper)" strokeWidth={2} />
      <path d={path(p => p.boundary)} fill="none" stroke="var(--accent)" strokeWidth={2} strokeDasharray="5 3" />
      <path d={path(p => p.ccm ? p.ceiling : null)} fill="none" stroke="var(--ok)" strokeWidth={2} />
      {hi === lo && <circle cx={x(lo)} cy={y(r.points[0].boundary)} r={3} fill="var(--accent)" />}
      <line x1={x(voltage)} x2={x(voltage)} y1={top} y2={h - bottom} stroke="var(--ink)" strokeDasharray="2 3" />
    </svg>
    <p className="text-muted"><span className="text-[var(--copper)]">— Peak inductor current</span> · <span className="text-[var(--accent)]">-- CCM boundary load</span> · <span className="text-ok">— Output current-limit ceiling</span> · -- Entered output load</p>
  </div>;
}

function Waveform({ p, fs }: { p: BoostPoint; fs: number }) {
  const w = 620, h = 200, left = 55, right = 18, top = 20, bottom = 35;
  const x = (t: number) => left + t / 3 * (w - left - right);
  const y = (i: number) => h - bottom - i / (p.iSwMax * 1.2) * (h - top - bottom);
  const rows: string[] = [];
  for (let i = 0; i < 3; i++) rows.push(`${x(i)},${y(p.valley)} ${x(i + p.d)},${y(p.iSwMax)} ${x(i + 1)},${y(p.valley)}`);
  return <div className="px-2 py-2"><svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Three cycles of estimated CCM inductor current at minimum inductance and switching frequency">
    <text x={left} y={13} fill="var(--muted)" fontSize={11}>Inductor current (A)</text>
    {[0, 1, 2].map(i => <rect key={i} x={x(i)} y={top} width={x(i + p.d) - x(i)} height={h - top - bottom} fill="var(--accent)" fillOpacity={0.1} />)}
    {[0, p.ilAvg, p.iSwMax].map(v => <g key={v}><line x1={left} x2={w - right} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray={v === p.ilAvg ? '4 3' : undefined} /><text x={left - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{fmt(v, 3)}</text></g>)}
    <polyline points={rows.join(' ')} fill="none" stroke="var(--copper)" strokeWidth={2} />
    {[0, 1, 2, 3].map(i => <text key={i} x={x(i)} y={h - 14} textAnchor="middle" fill="var(--muted)" fontSize={11}>{fmt(i / fs * 1e6, 3)} µs</text>)}
  </svg><p className="text-muted">Shaded: switch on. Dashed line: average current. Idealised triangular CCM waveform; excludes ringing, saturation and switching transients.</p></div>;
}

export function Method() {
  return <>
    <h2>Model and operating limits</h2>
    <p>This is a preliminary continuous-conduction boost design based on TI SLVA372D. Efficiency is a user estimate: D = 1 − ηVin/Vout and IL,avg = Iout/(1 − D).
      This efficiency-adjusted duty is a sizing approximation, not a device-specific switching simulation. The diode drop contributes to the displayed diode loss and switch voltage check, not an additional duty-cycle correction.</p>
    <p>The initial inductance follows TI: ΔIestimate = ripple ratio × Iout × Vout/Vin,nom; L = Vin,nom(Vout − Vin,nom)/(ΔIestimate fs,min Vout).
      Enter the actual part value before finalising a design. Current screening uses Lmin = L(1 − tolerance) and fs,min. Inductance reduction under DC current, temperature and saturation must be included in the effective minimum value you choose.</p>
    <div className="eq">ΔIL = Vin D / (fs Lmin); Ipeak = IL,avg + ΔIL/2; Ivalley = IL,avg − ΔIL/2; IL,rms = √(IL,avg² + ΔIL²/12).</div>
    <p>CCM requires Ivalley &gt; 0. The boundary output load is ΔIL(1 − D)/2. Boundary/DCM operation and synchronous forced reverse-current operation are not solved.
      If any point in the checked range leaves CCM, range-wide current and capacitor results are withheld. The waveform is shown only for a selected point in CCM.</p>
    <h2>Capacitors and ripple</h2>
    <p>Ceff = Cnom × (1 − tolerance) × retained fraction. Retention is taken from the selected capacitor's voltage and temperature data; it is not inferred from an X5R/X7R label.
      Enter complete-bank capacitance, ESR and RMS ratings. A value of zero for the bank means sizing only.</p>
    <div className="eq">Icin,rms = ΔIL/√12; Icout,rms = √(Iout² D/(1 − D) + (1 − D)ΔIL²/12).</div>
    <p>Output-capacitor charge swing is integrated from −Iout during on-time and IL − Iout during off-time. This equals Iout D/fs when the entire off-time inductor current exceeds the load,
      and includes the additional discharge when the valley falls below Iout. Cmin = charge swing / capacitive ripple budget. Output ESR ripple is bounded by ESR × Ipeak.
      The sum of capacitive and ESR ripple is a conservative upper bound, since their extrema need not coincide; ESL spikes are excluded.</p>
    <p>Input capacitance uses ΔIL/(8 fs ΔVin), assuming the source supplies average input current and the capacitor carries the triangular AC component.
      The displayed minimum is the larger of this estimate and the IC datasheet minimum. Source impedance, cable inductance, start-up and load transients can demand substantially more capacitance.
      Output capacitance must also stay within the IC's compensation/stability recommendations.</p>
    <h2>Rating checks and range screening</h2>
    <p>The input range is sampled at 201 evenly spaced voltages plus the nominal input, Vin = Vout/(2η) (maximum ripple), and Vin = 2Vout/(3η) (maximum CCM boundary), when inside the range.
      Component extrema other than these analytical points are screening estimates. Checks apply at the entered load and constant efficiency, not a full load/temperature sweep.</p>
    <p>Current-limit ceiling = (Ilim,min − ΔIL/2)(1 − D), for peak-current-limited ICs and only where the limit can support CCM.
      This excludes thermal limits, start-up and protection behaviour. A saturation-current check at operating peak does not certify survival at the maximum IC current limit.</p>
    <p>Shortest on-time = Dmin/fs,max; shortest off-time = (1 − Dmax)/fs,max. Compare with guaranteed worst-case IC limits.
      Switch voltage is screened against Vout + Vf; diode reverse voltage against Vout. Voltage-rating passes cover steady state only; additional transient and ringing headroom is required.
      Unspecified ratings remain unchecked.</p>
    <p>Total estimated loss = Pout(1/η − 1). Winding I²R, capacitor ESR and diode losses are a partial breakdown of that budget, never added to it.
      MOSFET conduction/switching loss, inductor core loss and thermal behaviour are not separately modelled.</p>
    <h2>References</h2>
    <ol>
      <li><a href="https://www.ti.com/lit/an/slva372d/slva372d.pdf" target="_blank" rel="noopener noreferrer">TI SLVA372D — Basic Calculation of a Boost Converter's Power Stage</a>, revised November 2022.</li>
      <li><a href="https://www.analog.com/en/resources/technical-articles/how-to-select-a-boost-regulator-controller-ic-and-use-ltspice.html" target="_blank" rel="noopener noreferrer">Analog Devices — How to Select a Boost Regulator/Controller IC</a>, March 2021.</li>
    </ol>
  </>;
}
