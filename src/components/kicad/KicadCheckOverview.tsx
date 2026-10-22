import { Panel } from '../ui';
import type { KicadProjectData } from '../../lib/kicadProjectQueries';
import { decodeLoads } from '../../lib/kicadPower';
import { decodeSources } from '../../lib/kicadThermal';
import { decodeVolts } from '../../lib/kicadClearance';
import { reviewInputKey, useKicadReviewSnapshot } from '../../state/kicadReviewState';
import type { KicadAnalysis, KicadAnalysisInputs, SetKicadInputs } from './useKicadAnalysis';

type Status = 'Needs inputs' | 'Not run' | 'Running' | 'Out of date' | 'Needs review' | 'Estimate ready' | 'No findings' | 'Not checked';
interface Card { name: string; status: Status; detail: string; action: string; open: () => void }

export function KicadCheckOverview({ data, a, p, set }: { data: KicadProjectData; a: KicadAnalysis; p: KicadAnalysisInputs; set: SetKicadInputs }) {
  const saved = useKicadReviewSnapshot(data.board);
  const counts = (s: string) => a.routingCheck.checked.filter(c => c.target && c.res.overall === s).length;
  const failures = counts('fail'), warnings = counts('warn'), checked = counts('ok');
  const first = a.routingCheck.checked.find(c => c.target && c.res.overall === 'fail') ?? a.routingCheck.checked.find(c => c.target && c.res.overall === 'warn');
  const running = a.solving || a.routingCheck.progress.done < a.routingCheck.progress.total;
  const cards: Card[] = [{ name: 'Routing',
    status: !a.calc || a.errors.length ? 'Needs inputs' : running ? 'Running' : failures || warnings ? 'Needs review' : checked ? 'No findings' : 'Not checked',
    detail: !a.calc ? 'Load a board with a saved stackup.' : a.errors.length ? 'Review the routing inputs below.' : `${failures} routing ${failures === 1 ? 'failure' : 'failures'} · ${warnings} ${warnings === 1 ? 'warning' : 'warnings'} · ${checked} items without findings. Only assigned targets are checked.`,
    action: first ? 'Review findings' : 'Open board', open: () => set({ view: 'board', item: first ? `${first.group.key}|${first.item.name}` : '' }) }];

  const powerKey = reviewInputKey('power', p), power = p.pmode === 'dc' ? saved.supply : saved.quick;
  let powerStatus: Status = 'Not run', powerDetail = 'Open Power to calculate the selected net.';
  if (p.pmode === 'dc' ? !decodeLoads(p.ploads).some(l => l.amps > 0) : !(p.pi > 0)) {
    powerStatus = 'Needs inputs'; powerDetail = 'Choose a net and enter a positive load current in Power.';
  } else if (power && power.inputs !== powerKey) {
    powerStatus = 'Out of date'; powerDetail = 'Operating conditions changed. Open Power to update the estimate.';
  } else if (p.pmode === 'dc' && saved.supply) {
    const s = saved.supply.value;
    const needsReturn = s.returnRequired ?? p.pret !== 'none';
    const r = needsReturn && saved.return?.inputs === powerKey ? saved.return.value : null;
    if (s.error || (s.result && !s.result.ok)) { powerStatus = 'Needs review'; powerDetail = s.error ?? (s.result && !s.result.ok ? s.result.error : 'DC solve failed.'); }
    else if (!s.result) { powerStatus = 'Running'; powerDetail = 'Solving DC current and voltage drop…'; }
    else if (s.result.loads.some(l => !l.connected) || s.result.tracks.some(t => !t.ok) || s.result.vias.some(v => !v.ok) || r?.error || (r?.result && (!r.result.ok || r.result.tracks.some(t => !t.ok) || r.result.vias.some(v => !v.ok)))) {
      powerStatus = 'Needs review'; powerDetail = 'Review disconnected loads, current limits and the return path in Power.';
    } else if (r && !r.result) { powerStatus = 'Running'; powerDetail = 'Supply solved; calculating the return path…'; }
    else {
      const complete = r?.result?.ok && s.result.loads.filter(l => l.amps > 0).every(l => r.result?.ok && r.result.loads.some(x => x.ref === l.ref && x.connected));
      powerStatus = needsReturn && !complete ? 'Needs review' : 'Estimate ready';
      powerDetail = complete ? 'Supply and return estimates available. Review allowable voltage drop in Power.' : !needsReturn ? 'Selected-net estimate available; a separate return path is excluded.' : 'Supply estimate available. The return path is incomplete or has not been solved; review it in Power.';
    }
  } else if (p.pmode !== 'dc' && saved.quick) {
    const { tracks, vias } = saved.quick.value.result;
    powerStatus = !tracks.length && !vias.length || [...tracks, ...vias].some(t => !t.ok) ? 'Needs review' : 'Estimate ready';
    powerDetail = !tracks.length && !vias.length ? 'No tracks or vias checked on this net. Use DC drop to include zones and pads.' : `Quick current estimate for ${saved.quick.value.net}; assumes the full entered current in every segment.`;
  }
  cards.push({ name: 'Power', status: powerStatus, detail: powerDetail, action: 'Open Power', open: () => set({ view: 'power' }) });

  const thermal = saved.thermal;
  let thermalStatus: Status = 'Not run', thermalDetail = 'Enter dissipation in Thermal, then press Solve.';
  if (!decodeSources(p.tsrc).some(s => s.watts > 0) && !(p.tloss && decodeLoads(p.ploads).some(l => l.amps > 0))) thermalStatus = 'Needs inputs';
  else if (thermal && thermal.inputs !== reviewInputKey('thermal', p)) { thermalStatus = 'Out of date'; thermalDetail = 'Thermal inputs changed. Press Solve again to update the map.'; }
  else if (thermal) {
    const s = thermal.value;
    if (s.error || (s.result && !s.result.ok)) { thermalStatus = 'Needs review'; thermalDetail = s.error ?? (s.result && !s.result.ok ? s.result.error : 'Thermal solve failed.'); }
    else if (s.solving || !s.result) { thermalStatus = 'Running'; thermalDetail = 'Solving the board temperature estimate…'; }
    else if (s.result.copperLoss?.some(l => l.error) || s.result.parts.some(part => !part.placed)) { thermalStatus = 'Needs review'; thermalDetail = 'Some heat sources or copper losses could not be included. Review Thermal.'; }
    else { thermalStatus = 'Estimate ready'; thermalDetail = `Peak board temperature ${s.result.hottest.c.toFixed(1)} °C. Compare with your design limits; no temperature limit is assigned here.`; }
  }
  cards.push({ name: 'Thermal', status: thermalStatus, detail: thermalDetail, action: 'Open Thermal', open: () => set({ view: 'thermal' }) });

  const clearance = saved.clearance;
  let clearanceStatus: Status = 'Not run', clearanceDetail = 'Open Clearance to check the assigned net voltages.';
  if (!decodeVolts(p.hvnets).length) { clearanceStatus = 'Needs inputs'; clearanceDetail = 'Assign net voltages in Clearance before checking spacing.'; }
  else if (clearance && clearance.inputs !== reviewInputKey('clearance', p)) { clearanceStatus = 'Out of date'; clearanceDetail = 'Net voltages or coating changed. Open Clearance to recheck.'; }
  else if (clearance) {
    const s = clearance.value;
    if (s.error) { clearanceStatus = 'Needs review'; clearanceDetail = s.error; }
    else if (!s.result) { clearanceStatus = 'Running'; clearanceDetail = 'Checking same-layer copper spacing…'; }
    else { const n = s.result.violations.length; clearanceStatus = n ? 'Needs review' : s.result.checked ? 'No findings' : 'Not checked'; clearanceDetail = `${n} spacing ${n === 1 ? 'finding' : 'findings'} across ${s.result.checked} checks. Same-layer copper clearance only; creepage is excluded.`; }
  }
  cards.push({ name: 'Clearance', status: clearanceStatus, detail: clearanceDetail, action: 'Open Clearance', open: () => set({ view: 'clearance' }) });

  return <Panel title="Check summary" allowInvalid>
    <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(c => <section key={c.name} aria-label={`${c.name} check`} className="flex min-w-0 flex-col gap-2 rounded border border-line p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{c.name}</h3><span className={c.status === 'Needs review' ? 'font-semibold text-[var(--err-line)]' : c.status === 'No findings' || c.status === 'Estimate ready' ? 'font-semibold text-ok' : 'font-semibold text-muted'} role="status">{c.status}</span></div>
        <p className="grow text-muted">{c.detail}</p><button type="button" className="btn self-start" onClick={c.open}>{c.action}</button>
      </section>)}
    </div>
    <p className="px-3 pb-3 text-faint">Each check covers its stated scope and operating conditions. An unconfigured check is not a pass. Fix findings in KiCad, save the board, then load the corrected file to recheck.</p>
  </Panel>;
}
