import { escapeHtml as esc, type ReportSnapshot } from './calculationReport';
import { projectDrawing } from './kicadDrawingClient';
import { dcScenario, netVoltage, quickCheck, type DcResult, type DcRequest } from './kicadPower';
import { solveDcInWorker } from './kicadPowerClient';
import { settingsFor } from './kicadPowerSettings';
import { decodeSources } from './kicadThermal';
import { solveThermalInWorker } from './kicadThermalClient';
import { decodeVolts } from './kicadClearance';
import { checkClearanceInWorker } from './kicadClearanceClient';
import { estimatedFills } from './kicadZoneFillClient';
import { unfilledNets } from './kicadZoneFill';
import { zoneFillRules } from './kicadZoneFillRules';
import { itemReasons } from './kicadRouting';
import { statusLabel } from './kicadRoutingSolve';
import type { KicadAnalysis, KicadAnalysisInputs } from '../components/kicad/useKicadAnalysis';
import { type KicadProjectData, netClasses } from './kicadProjectQueries';
import { stackupItemThickness } from './kicadImport';

// Every dynamic string (including net names and references from a board) is escaped at the boundary.
export const reportTable = (head: string[], rows: (string | number)[][]) => '<table><thead><tr>' + head.map(h => `<th>${esc(h)}</th>`).join('') + '</tr></thead><tbody>' + rows.map(row => '<tr>' + row.map(v => `<td>${esc(String(v))}</td>`).join('') + '</tr>').join('') + '</tbody></table>';
const paragraph = (text: string) => `<p>${esc(text)}</p>`;
const n = (v: number, digits = 2) => Number.isFinite(v) ? v.toFixed(digits) : 'Unavailable';
let nextReport = 1;

/** Standalone grid image: no dependency on which tab or map happened to be visible. */
function gridImage(layer: string, map: { nx: number; ny: number }, values: Float32Array, unit: string): string {
  if (typeof document === 'undefined' || !map.nx || !map.ny) return '';
  let lo = Infinity, hi = -Infinity;
  for (const v of values) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (!Number.isFinite(lo)) return '';
  const canvas = document.createElement('canvas'); canvas.width = map.nx; canvas.height = map.ny;
  const ctx = canvas.getContext('2d'); if (!ctx) return '';
  const image = ctx.createImageData(map.nx, map.ny);
  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i])) continue;
    const t = hi > lo ? (values[i] - lo) / (hi - lo) : 0;
    image.data.set([Math.round(40 + 210 * t), Math.round(100 + 70 * (1 - Math.abs(2 * t - 1))), Math.round(220 - 170 * t), 255], i * 4);
  }
  ctx.putImageData(image, 0, 0);
  return `<figure><img alt="${esc(layer)} calculation grid" src="${canvas.toDataURL()}"><figcaption>${esc(layer)} calculation grid: blue ${n(lo)} ${esc(unit)} to red ${n(hi)} ${esc(unit)}. Blank pixels are outside the modelled copper or board.</figcaption></figure>`;
}

/** A project-wide report, freshly solved from frozen inputs, rather than a scrape of the active tab. */
export async function captureProjectReport(data: KicadProjectData, p: KicadAnalysisInputs, a: KicadAnalysis, snapshot: ReportSnapshot): Promise<ReportSnapshot> {
  if (a.solving || a.routingCheck.progress.done < a.routingCheck.progress.total || a.routingCheck.checked.some(c => c.res.overall === 'pending')) throw new Error('Wait for the stackup and routing checks to finish, then create the report.');
  if (a.errors.length) throw new Error(a.errors.join(' '));
  const channel = `report-${nextReport++}`;
  const raw = await projectDrawing(data);
  const selected = p.zfill.split(',').flatMap(x => { try { return [decodeURIComponent(x)]; } catch { return []; } }).filter(x => unfilledNets(raw).some(z => z.net === x));
  const estimate = selected.length ? await estimatedFills(raw, selected, zoneFillRules(data, raw)) : null;
  const d = estimate ? { ...raw, fills: [...raw.fills, ...estimate.fills] } : raw;
  const parts = new Set(d.parts.map(x => x.ref));
  let html = '<h3>Project identity and scope</h3>' + reportTable(['File / setting', 'Value'], [
    ['Board', data.boardName], ['Project', data.projectName ?? 'Not loaded'], ['KiCad', data.board.kicad],
    ['Board thickness', `${n(data.board.thickness ?? stackupItemThickness(data.board), 4)} mm`],
    ['Copper layers', d.copper.join(', ')], ['Routing assumptions', a.settingsLine],
    ['Power / thermal copper', selected.length ? `Estimated fill added for ${selected.join(', ')}; saved KiCad fills retained.` : 'Only copper saved in the file; no estimated fill.'],
    ['Zones without saved fill', unfilledNets(raw).map(x => `${x.net}: ${x.zones}`).join('; ') || 'None'],
    ['Clearance copper', 'Only saved KiCad fills; estimated fill is excluded.'],
  ]);
  html += '<h3>Physical stackup</h3>' + (data.board.stackup ? reportTable(['Layer', 'Type', 'Thickness (mm)', 'Material', 'Dk / Df'], data.board.stackup.flatMap(l => l.subs.map(s => [l.name, l.type, s.t === undefined ? 'Not specified' : n(s.t, 4), s.material ?? '—', `${s.er ?? '—'} / ${s.df ?? '—'}`]))) : paragraph('No physical stackup is present in the file.'));
  html += '<h3>Net classes</h3>' + reportTable(['Class', 'Track width (mm)', 'Pair width / gap (mm)'], netClasses(data).map(c => [c.name, c.trackWidth ?? '—', `${c.dpWidth ?? '—'} / ${c.dpGap ?? '—'}`]));
  html += '<h3>Designed trace widths by layer</h3>' + reportTable(['Layer', 'Reference planes', 'Target', 'Width (mm)', 'Pair gap (mm)', 'Loss (dB/in)'], a.plans.flatMap(plan => a.targets.map(target => {
    const cell = a.cells[`${plan.layer.id}|${target.id}`];
    return [plan.layer.name, plan.refs.join(' / ') || 'None', target.label, cell?.d ? n(cell.d.w, 4) : cell?.err ?? 'Unavailable', cell?.d?.s === undefined ? '—' : n(cell.d.s, 4), cell?.loss === undefined ? cell?.lossErr ?? 'Unavailable' : n(cell.loss, 3)];
  })));
  html += '<h3>Routing check</h3>' + (a.routingCheck.checked.length ? reportTable(['Pair / net', 'Target', 'Result', 'Length (mm)', 'Findings'], a.routingCheck.checked.map(c => [c.item.name, c.target?.label ?? 'Not checked', statusLabel(c.res.overall), n(c.res.len), itemReasons(c.res).join(' · ') || 'No finding in the checks performed.'])) : paragraph('No routed pair or targeted single-ended net was checked. This is not a pass.'));
  const routeLayers = a.routingCheck.checked.flatMap(c => c.res.layers.map(l => [c.item.name, l.layer, n(l.w, 4), l.gap === undefined ? '—' : n(l.gap, 4), l.solve.z === undefined ? 'Unavailable' : n(l.solve.z, 1), statusLabel(l.status)]));
  if (routeLayers.length) html += reportTable(['Pair / net', 'Layer', 'Width (mm)', 'Gap (mm)', 'Impedance (Ω)', 'Result'], routeLayers);

  const scenario = dcScenario(d, p);
  const s = settingsFor(data, d.copper, p.pdt, p.pamb);
  html += '<h3>Power: track current</h3>' + paragraph(`Net ${scenario.net || 'not selected'}, ${n(p.pi, 3)} A through every track and via (worst case); allowed rise ${n(p.pdt, 1)} °C; ambient ${n(p.pamb, 1)} °C; barrel plating ${n(s.platingMm * 1000, 0)} µm.`);
  if (scenario.nc) {
    const quick = quickCheck(scenario.nc, p.pi, s);
    html += reportTable(['Check', 'Count', 'Over allowed rise'], [['Tracks', quick.tracks.length, quick.tracks.filter(x => !x.ok).length], ['Vias', quick.vias.length, quick.vias.filter(x => !x.ok).length]]);
  }
  html += '<h3>Power: DC voltage drop</h3>';
  const requests: DcRequest[] = [];
  let supply: DcResult | undefined, ret: DcResult | undefined;
  if (scenario.nc && scenario.source && scenario.loads.some(l => l.amps > 0)) {
    html += paragraph(`Supply ${scenario.net}; source ${scenario.source}; return ${scenario.returnNet || 'none (supply only)'}. Copper resistance evaluated at ${n(s.tempC, 1)} °C.`);
    const request = { nc: scenario.nc, source: scenario.source, loads: scenario.loads, s }; requests.push(request);
    supply = await solveDcInWorker(request, channel + '-supply');
    if (scenario.retNc && scenario.retSourceOk && scenario.retLoads.some(l => l.amps > 0)) {
      const request = { nc: scenario.retNc, source: scenario.source, loads: scenario.retLoads, s }; requests.push(request);
      ret = await solveDcInWorker(request, channel + '-return');
    }
    if (!supply.ok) throw new Error(`Report DC drop: ${supply.error}`);
    if (ret && !ret.ok) throw new Error(`Report return drop: ${ret.error}`);
    const returnResult = ret?.ok ? ret : undefined;
    const volts = p.pv > 0 ? p.pv : netVoltage(scenario.net);
    html += reportTable(['Load', 'Current (A)', 'Supply (mV)', 'Return (mV)', 'Total (mV)', 'Drop (%)'], supply.loads.map(l => {
      const r = returnResult?.loads.find(x => x.ref === l.ref);
      const total = l.connected && (!scenario.returnNet || r?.connected) ? l.dropMv + (r?.dropMv ?? 0) : NaN;
      return [l.ref, n(l.amps, 3), l.connected ? n(l.dropMv) : 'Not connected', !scenario.returnNet ? 'Not requested' : r?.connected ? n(r.dropMv) : 'Not connected / no return pad', n(total), volts > 0 ? n(total / 10 / volts) : 'Voltage not entered'];
    }));
    html += paragraph(`Copper loss: ${n((supply.powerW + (returnResult?.powerW ?? 0)) * 1000)} mW. Grid ${n(supply.res, 3)} mm, locally refined at pads. Supply-only totals exclude all return resistance.`);
    const map = supply.layers.find(l => l.layer === p.player) ?? supply.layers[0];
    if (map) html += gridImage(map.layer, map, map.drop, 'mV');
  } else html += paragraph('Not configured: choose a source and at least one load with a positive current. No DC pass is implied.');

  html += '<h3>Thermal</h3>';
  const sources = decodeSources(p.tsrc).filter(x => parts.has(x.ref));
  const withLoss = p.tloss && requests.length > 0;
  if (sources.some(x => x.watts > 0) || withLoss) {
    const thermal = await solveThermalInWorker({ d, thickness: s.thickness, layerZ: s.layerZ, boardThickness: data.board.thickness ?? stackupItemThickness(data.board), sources, ambientC: p.tamb,
      air: p.tair === 'f' ? { mode: 'forced', h: p.th } : { mode: 'natural', orient: p.tair === 'v' ? 'vertical' : 'horizontal' }, emissivity: p.teps, kXY: p.tkxy, kZ: p.tkz, platingMm: s.platingMm,
      copperLoss: withLoss ? requests.map(r => ({ ...r, s: settingsFor(data, d.copper, p.pdt, p.tamb) })) : undefined }, channel);
    if (!thermal.ok) throw new Error(`Report thermal analysis: ${thermal.error}`);
    if (thermal.copperLoss.some(x => x.error)) throw new Error('The copper-loss contribution could not be solved. Review the Power inputs before exporting.');
    html += paragraph(`Ambient ${n(p.tamb, 1)} °C; air ${p.tair === 'f' ? `moving, h=${n(p.th, 1)} W/m²K` : p.tair === 'v' ? 'still, upright' : 'still, flat'}; emissivity ${p.teps}; laminate conductivity ${p.tkxy} in-plane / ${p.tkz} through-plane W/m·K. Copper loss ${withLoss ? 'included' : 'not included'}.`);
    html += reportTable(['Part', 'Dissipation (W)', 'Board under part (°C)', 'ψJB (°C/W)', 'Junction (°C)'], thermal.parts.map(part => {
      const psi = sources.find(x => x.ref === part.ref)?.psi;
      return [part.ref, n(part.watts, 3), n(part.maxC, 1), psi ?? 'Not entered', psi === undefined ? 'Not calculated' : n(part.maxC + psi * part.watts, 1)];
    }));
    html += paragraph(`Hottest point ${n(thermal.hottest.c, 1)} °C on ${thermal.hottest.layer} at ${n(thermal.hottest.x)}, ${n(thermal.hottest.y)} mm. Total power ${n(thermal.powerW, 3)} W; grid ${n(thermal.res, 3)} mm. Steady-state estimate, approximately ±20–30%; package-top cooling, enclosures and heatsinks are not modelled.`);
    const map = thermal.layers.find(l => l.layer === thermal.hottest.layer);
    if (map) html += gridImage(map.layer, map, map.temp, '°C');
  } else html += paragraph('Not configured: no positive part dissipation or configured copper-loss contribution. No thermal pass is implied.');

  html += '<h3>Clearance</h3>';
  const nets = new Set([...raw.pads, ...raw.tracks, ...raw.fills].map(x => x.net));
  const volts = decodeVolts(p.hvnets).filter(x => nets.has(x.net));
  if (volts.length) {
    const outer = p.hvouter === 'B4' ? 'B4' : 'B2';
    const clearance = await checkClearanceInWorker({ d: raw, volts, outer }, channel);
    html += paragraph(`Configured peak voltages: ${volts.map(x => `${x.net} ${x.v} V`).join(', ')}. Unlisted nets are assumed to be 0 V. Outer column ${outer}; inner B1; ${clearance.checked} copper pieces checked; ${clearance.violations.length} spacing findings. Only saved fills were checked.`);
    html += reportTable(['Net', 'Other net', 'Layer', 'Gap (mm)', 'Required (mm)', 'Table column'], clearance.closest.map(x => [x.net, x.other || 'No net', x.layer, n(x.gap, 3), n(x.required, 3), x.column]));
    html += paragraph('Same-layer copper clearance only. This does not check creepage, spacing through the laminate or compliance with an end-product safety standard.');
  } else html += paragraph('Not configured: no net peak voltages entered. No clearance pass is implied.');
  if (a.notes.length) html += '<h3>Import notes and assumptions</h3>' + a.notes.map(paragraph).join('');
  return { ...snapshot, title: `${data.boardName.replace(/\.kicad_pcb$/i, '')} — project report`, inputs: [], results: html, resultsHeading: 'Project analysis', comparison: '', usesLocalData: true, preparing: false, blocked: null };
}
