// The Power view of the KiCad project page: current capacity and DC voltage drop of one power net, drawn on
// the board. Track current: every track and via of the net carries the whole net current (worst case), and
// its IPC-2221 temperature rise colours it. DC drop: the source part feeds the net, the load parts draw their
// currents, and the solved copper shows the drop (or the current density) as a heat map on a layer, with the
// real current and rise of every track and via. The currents come back through the return (ground) net from
// the loads' ground pads to the source's, solved the same way: a load sees the supply and the return drop
// added. The engine is kicadPower.ts.
import { useEffect, useMemo, useRef, useState } from 'react';
import { NumField, Panel, Row, Segmented, SelectField } from '../ui';
import type { BoardDrawing } from '../../lib/kicadDrawing';
import { projectDrawing } from '../../lib/kicadDrawingClient';
import {
  decodeLoads,
  encodeLoads,
  netCopper,
  netParts,
  netVoltage,
  powerNets,
  quickCheck,
  requiredWidth,
  type DcResult,
  type PowerSettings,
  type TrackLoad,
  type ViaLoad,
} from '../../lib/kicadPower';
import { solveDcInWorker } from '../../lib/kicadPowerClient';
import { copperThickness, type KicadProjectData } from '../../lib/kicadProjectQueries';
import { netLeaf } from '../../lib/kicadRouting';
import { copperFaces } from '../../lib/kicadVias';
import { BoardView, HEAT_GRADIENT, layerColor, type BoardHeat, type BoardViewApi } from './BoardView';
import { useFullScreen } from './useFullScreen';
import type { KicadAnalysisInputs, SetKicadInputs } from './useKicadAnalysis';

const PLATING_MM = 0.025; // via barrel plating, as the Via tool's default

/** Green within half the allowed rise, amber up to it, red above it. */
const riseColor = (dT: number, limit: number) => (dT > limit ? '#f85149' : dT > limit / 2 ? '#d29922' : '#3fb950');
const riseTone = (dT: number, limit: number) => (dT > limit ? 'text-[var(--err-line)]' : dT > limit / 2 ? 'text-[var(--accent-ink)]' : 'text-ok');
const num = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '–');

export function settingsFor(data: KicadProjectData, copper: string[], dT: number, ambient: number): PowerSettings {
  const thickness: Record<string, number> = {};
  for (const l of copper) thickness[l] = copperThickness(data, l) ?? 0.035;
  const faces = copperFaces(data.board.stackup);
  const layerZ: Record<string, number> = {};
  const total = data.board.thickness ?? 1.6;
  copper.forEach((l, i) => {
    const f = faces?.get(l);
    layerZ[l] = f ? (f.top + f.bottom) / 2 : copper.length > 1 ? (i * total) / (copper.length - 1) : 0;
  });
  // the resistance of copper at the hottest it is allowed to get
  return { thickness, layerZ, platingMm: PLATING_MM, tempC: ambient + dT, dTC: dT };
}

export function KicadPowerPanel({ data, p, set }: { data: KicadProjectData; p: KicadAnalysisInputs; set: SetKicadInputs }) {
  const [drawing, setDrawing] = useState<{ board: object; d?: BoardDrawing; error?: string } | null>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [focus, setFocus] = useState<[number, number, number, number] | null>(null);
  const [dc, setDc] = useState<{ key: string; result?: DcResult; error?: string } | null>(null);
  const [ret, setRet] = useState<{ key: string; result?: DcResult; error?: string } | null>(null);
  const view = useRef<BoardViewApi>(null);
  const { box, full, toggle: toggleFull } = useFullScreen();

  useEffect(() => {
    let live = true;
    projectDrawing(data).then(
      (d) => {
        if (!live) return;
        setDrawing({ board: data.board, d });
        setVisible(Object.fromEntries(d.copper.map((l) => [l, true])));
      },
      (e: unknown) => live && setDrawing({ board: data.board, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [data]);

  const d = drawing?.board === data.board ? drawing.d : undefined;
  const nets = useMemo(() => (d ? powerNets(d) : []), [d]);
  const net = nets.some((n) => n.net === p.pnet) ? p.pnet : (nets.find((n) => n.kind === 'power')?.net ?? nets[0]?.net ?? '');
  const nc = useMemo(() => (d && net ? netCopper(d, net) : null), [d, net]);
  const parts = useMemo(() => (nc ? netParts(nc) : []), [nc]);
  const settings = useMemo(() => (d ? settingsFor(data, d.copper, p.pdt, p.pamb) : null), [data, d, p.pdt, p.pamb]);
  const mode = p.pmode === 'dc' ? 'dc' : 'quick';
  const source = parts.some((x) => x.ref === p.psrc) ? p.psrc : (parts[0]?.ref ?? '');
  const loads = useMemo(() => decodeLoads(p.ploads).filter((l) => l.ref !== source && parts.some((x) => x.ref === l.ref)), [p.ploads, parts, source]);
  const volts = p.pv > 0 ? p.pv : netVoltage(net);

  const quick = useMemo(() => (nc && settings && mode === 'quick' ? quickCheck(nc, p.pi, settings) : null), [nc, settings, mode, p.pi]);

  // the DC solve, in a worker, a moment after the inputs settle
  const dcKey = `${net}|${source}|${encodeLoads(loads)}|${p.pdt}|${p.pamb}`;
  useEffect(() => {
    if (mode !== 'dc' || !nc || !settings || !source || !loads.some((l) => l.amps > 0)) return;
    let live = true;
    const t = setTimeout(() => {
      setDc({ key: dcKey });
      solveDcInWorker({ nc, source, loads, s: settings }).then(
        (result) => live && setDc({ key: dcKey, result }),
        (e: unknown) => live && setDc({ key: dcKey, error: e instanceof Error ? e.message : String(e) }),
      );
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, nc, settings, dcKey]);
  const dcNow = dc?.key === dcKey ? dc : null;
  const solved = dcNow?.result?.ok ? dcNow.result : null;

  // the return: the ground net the loads send their current back on, from their ground pads to the source's.
  // Auto picks the ground net that reaches the source and the most loads.
  const grounds = nets.filter((n) => n.kind === 'ground' && n.net !== net);
  const returnNet = useMemo(() => {
    if (mode !== 'dc' || !d || p.pret === 'none' || nets.find((n) => n.net === net)?.kind === 'ground') return '';
    if (grounds.some((g) => g.net === p.pret)) return p.pret;
    const score = (g: string) => {
      const refs = new Set(d.pads.filter((q) => q.net === g).map((q) => q.ref));
      return (refs.has(source) ? 1000 : 0) + loads.filter((l) => refs.has(l.ref)).length;
    };
    return grounds.map((g) => g.net).sort((a, b) => score(b) - score(a))[0] ?? '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, d, p.pret, net, nets, source, encodeLoads(loads)]);
  const retNc = useMemo(() => (d && returnNet ? netCopper(d, returnNet) : null), [d, returnNet]);
  const retRefs = useMemo(() => new Set(retNc?.pads.map((q) => q.ref) ?? []), [retNc]);
  const retLoads = useMemo(() => loads.filter((l) => retRefs.has(l.ref)), [loads, retRefs]);
  const retKey = `${returnNet}|${source}|${encodeLoads(retLoads)}|${p.pdt}|${p.pamb}`;
  const retSourceOk = !!returnNet && retRefs.has(source);
  useEffect(() => {
    if (mode !== 'dc' || !retNc || !settings || !retSourceOk || !retLoads.some((l) => l.amps > 0)) return;
    let live = true;
    const t = setTimeout(() => {
      setRet({ key: retKey });
      solveDcInWorker({ nc: retNc, source, loads: retLoads, s: settings }, 'return').then(
        (result) => live && setRet({ key: retKey, result }),
        (e: unknown) => live && setRet({ key: retKey, error: e instanceof Error ? e.message : String(e) }),
      );
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, retNc, settings, retKey, retSourceOk]);
  const retNow = returnNet && ret?.key === retKey ? ret : null;
  const retSolved = retNow?.result?.ok ? retNow.result : null;

  // the map: a layer of the solved copper of the supply or the return net
  const mapOf = p.pmapnet === 'return' && retSolved ? retSolved : solved;
  const mapLayers = mapOf ? mapOf.layers.map((l) => l.layer) : [];
  const mapLayer = mapLayers.includes(p.player) ? p.player : (mapOf?.layers.slice().sort((a, b) => count(b.drop) - count(a.drop))[0]?.layer ?? '');
  const heat = useMemo((): BoardHeat | null => {
    if (!mapOf || p.pmap === 'off') return null;
    const m = mapOf.layers.find((l) => l.layer === mapLayer);
    if (!m) return null;
    const values = p.pmap === 'density' ? m.density : m.drop;
    // the density peaks at a few cells by the vias and pads: the colours span 99 % of the copper
    const finite = Array.from(values).filter(Number.isFinite).sort((a, b) => a - b);
    const max = finite.length ? (p.pmap === 'density' ? finite[Math.floor(0.99 * (finite.length - 1))] : finite[finite.length - 1]) : 0;
    return { layer: m.layer, x0: m.x0, y0: m.y0, res: m.res, nx: m.nx, ny: m.ny, values, max };
  }, [mapOf, mapLayer, p.pmap]);

  const loadsOf = useMemo((): { tracks: TrackLoad[]; vias: ViaLoad[] } | null => {
    if (mode === 'quick') return quick;
    if (!solved) return null;
    return retSolved ? { tracks: [...solved.tracks, ...retSolved.tracks], vias: [...solved.vias, ...retSolved.vias] } : solved;
  }, [mode, quick, solved, retSolved]);
  const trackColors = useMemo(() => {
    const m = new Map<number, string>();
    for (const t of loadsOf?.tracks ?? []) m.set(t.i, t.amps > 0 ? riseColor(t.dT, p.pdt) : '#6e7681');
    return m;
  }, [loadsOf, p.pdt]);
  const viaColors = useMemo(() => {
    const m = new Map<number, string>();
    for (const v of loadsOf?.vias ?? []) m.set(v.i, v.amps > 0 ? riseColor(v.dT, p.pdt) : '#6e7681');
    return m;
  }, [loadsOf, p.pdt]);
  const highlight = useMemo(() => new Set([net, returnNet].filter(Boolean)), [net, returnNet]);

  if (!drawing || drawing.board !== data.board) return <Panel title="Power"><p className="p-3" role="status">Drawing the board…</p></Panel>;
  if (drawing.error || !d || !settings) return <Panel title="Power"><p className="p-3">{drawing.error}</p></Panel>;
  if (!nets.length) return <Panel title="Power"><p className="p-3">This board has no nets with pads to check.</p></Panel>;

  const setLoads = (next: { ref: string; amps: number }[]) => set({ ploads: encodeLoads(next) });
  const unfilled = (data.board.stats.zones ?? 0) > 0 && d.fills.length === 0;
  const others = parts.filter((x) => x.ref !== source);
  const zoomTrack = (t: TrackLoad) => {
    const tr = d.tracks[t.i];
    if (tr) setFocus([Math.min(tr.x1, tr.x2) - 1.5, Math.min(tr.y1, tr.y2) - 1.5, Math.max(tr.x1, tr.x2) + 1.5, Math.max(tr.y1, tr.y2) + 1.5]);
  };
  const zoomAt = (x: number, y: number) => setFocus([x - 2, y - 2, x + 2, y + 2]);
  const zoomPart = (ref: string) => {
    const ps = [...(nc?.pads ?? []), ...(retNc?.pads ?? [])].filter((q) => q.ref === ref);
    if (!ps.length) return;
    setFocus([Math.min(...ps.map((q) => q.x)) - 2, Math.min(...ps.map((q) => q.y)) - 2, Math.max(...ps.map((q) => q.x)) + 2, Math.max(...ps.map((q) => q.y)) + 2]);
  };

  // outer and inner copper thickness most used, for the IPC-2221 width hint
  const outerT = settings.thickness[d.copper[0]] ?? 0.035;
  const innerT = d.copper.length > 2 ? (settings.thickness[d.copper[1]] ?? 0.035) : undefined;

  const controls = (
    <div className="grid gap-x-6 gap-y-1 px-2.5 py-2 sm:grid-cols-2 xl:grid-cols-3">
      <SelectField
        label="Net"
        value={net}
        width={170}
        onChange={(v) => set({ pnet: v, psrc: '', ploads: '', pv: 0, player: '' })}
        options={nets.map((n) => ({ value: n.net, label: `${netLeaf(n.net)} (${n.pads} pads)`, group: n.kind === 'power' ? 'Power nets' : n.kind === 'ground' ? 'Ground nets' : 'Other nets' }))}
      />
      <Row label="Check">
        <Segmented
          label="Check"
          value={mode}
          onChange={(v) => set({ pmode: v })}
          options={[
            { value: 'quick', label: 'Track current' },
            { value: 'dc', label: 'DC drop' },
          ]}
        />
      </Row>
      <NumField
        label={mode === 'quick' ? 'Net current' : 'Total current'}
        value={p.pi}
        unit="A"
        onChange={(v) => set({ pi: v })}
        hint={mode === 'quick' ? 'Current every track and via of the net is checked at: the whole current of the net, the worst case.' : 'Spread over the loads by the button below the loads.'}
      />
      <NumField label="Allowed rise" symbol="ΔT" value={p.pdt} unit="°C" onChange={(v) => set({ pdt: v })} hint="Temperature rise above ambient a track or via may reach (IPC-2221). 10 °C is a common choice; the Trace Width tool uses it too." />
      <NumField label="Ambient" value={p.pamb} unit="°C" allowNegative onChange={(v) => set({ pamb: v })} hint="The copper resistance of the DC drop is taken at ambient plus the allowed rise, the hottest the copper is allowed to get." />
      {mode === 'dc' && (
        <>
          <SelectField label="Source" value={source} width={170} onChange={(v) => set({ psrc: v })} options={parts.map((x) => ({ value: x.ref, label: `${x.ref} (${x.pads} ${x.pads === 1 ? 'pad' : 'pads'})` }))} />
          <NumField label="Net voltage" value={volts} unit="V" allowZero onChange={(v) => set({ pv: v })} hint="Read from the net name where it says it (+3V3, 5V); used only to give the drop in percent." />
          {nets.find((n) => n.net === net)?.kind !== 'ground' && (
            <SelectField
              label="Return net"
              value={p.pret === 'none' ? 'none' : grounds.some((g) => g.net === p.pret) ? p.pret : ''}
              width={170}
              onChange={(v) => set({ pret: v, pmapnet: 'supply', player: '' })}
              options={[
                { value: '', label: returnNet ? `Auto (${netLeaf(returnNet)})` : 'Auto (none found)' },
                ...grounds.map((g) => ({ value: g.net, label: netLeaf(g.net) })),
                { value: 'none', label: 'None: the supply only' },
              ]}
            />
          )}
        </>
      )}
    </div>
  );

  const loadsEditor = mode === 'dc' && (
    <div className="border-t border-line px-2.5 py-2">
      <p className="mb-1 font-semibold">Loads on {netLeaf(net)}</p>
      {loads.length === 0 && <p className="mb-1 text-muted">Add the parts that draw current from the net, with their current.</p>}
      <ul className="grid max-h-[176px] gap-x-4 gap-y-1 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
        {loads.map((l, k) => (
          <li key={`${l.ref}-${k}`} className="flex items-center gap-1.5">
            <select
              className="fld min-w-0 max-w-[130px]"
              aria-label={`Load ${k + 1}`}
              value={l.ref}
              onChange={(e) => setLoads(loads.map((x, j) => (j === k ? { ...x, ref: e.target.value } : x)))}
            >
              {others.map((x) => (
                <option key={x.ref} value={x.ref}>
                  {x.ref}
                </option>
              ))}
            </select>
            <input
              className="fld w-[64px] text-right"
              inputMode="decimal"
              aria-label={`Current of ${l.ref}, A`}
              defaultValue={l.amps}
              key={`${l.ref}-${l.amps}`}
              onBlur={(e) => {
                const v = Number(e.target.value.replace(',', '.'));
                if (Number.isFinite(v) && v >= 0) setLoads(loads.map((x, j) => (j === k ? { ...x, amps: v } : x)));
                else e.target.value = String(l.amps);
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
            <span className="text-muted">A</span>
            <button type="button" className="btn" onClick={() => setLoads(loads.filter((_, j) => j !== k))} aria-label={`Remove ${l.ref}`} title="Remove">
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-1.5 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn"
          disabled={others.length === loads.length}
          onClick={() => {
            const free = others.find((x) => !loads.some((l) => l.ref === x.ref));
            if (free) setLoads([...loads, { ref: free.ref, amps: 0.1 }]);
          }}
        >
          Add load
        </button>
        <button type="button" className="btn" disabled={!others.length || !(p.pi > 0)} onClick={() => setLoads(others.map((x) => ({ ref: x.ref, amps: p.pi / others.length })))}>
          Spread {num(p.pi, 3).replace(/\.?0+$/, '')} A over every other part
        </button>
      </div>
    </div>
  );

  const toolbar = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-2.5 py-2">
      {d.copper.map((l) => (
        <label key={l} className="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={!!visible[l]} onChange={(e) => setVisible((v) => ({ ...v, [l]: e.target.checked }))} />
          <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: layerColor(l) }} />
          {l}
        </label>
      ))}
      {mode === 'dc' && solved && (solved.layers.length > 0 || (retSolved?.layers.length ?? 0) > 0) && (
        <span className="flex flex-wrap items-center gap-2">
          {retSolved && (
            <Segmented
              label="Map net"
              value={p.pmapnet === 'return' ? 'return' : 'supply'}
              onChange={(v) => set({ pmapnet: v, player: '' })}
              options={[
                { value: 'supply', label: netLeaf(net) },
                { value: 'return', label: netLeaf(returnNet) },
              ]}
            />
          )}
          <Segmented
            label="Map"
            value={(['drop', 'density', 'off'] as const).includes(p.pmap as 'drop') ? (p.pmap as 'drop' | 'density' | 'off') : 'drop'}
            onChange={(v) => set({ pmap: v })}
            options={[
              { value: 'drop', label: 'Drop' },
              { value: 'density', label: 'Current density' },
              { value: 'off', label: 'Off' },
            ]}
          />
          {p.pmap !== 'off' && mapLayers.length > 1 && (
            <select className="fld" aria-label="Map layer" value={mapLayer} onChange={(e) => set({ player: e.target.value })}>
              {mapLayers.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          )}
        </span>
      )}
      <span className="ml-auto flex gap-2">
        <button type="button" className="btn" onClick={() => setVisible(Object.fromEntries(d.copper.map((l) => [l, true])))}>
          All layers
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setFocus(null);
            view.current?.fit();
          }}
        >
          Fit board
        </button>
        <button type="button" className="btn" aria-pressed={!!full} onClick={toggleFull}>
          {full ? 'Exit full screen' : 'Full screen'}
        </button>
      </span>
    </div>
  );

  const legend = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-2.5 py-1.5 text-[11px] text-muted">
      <span className="flex items-center gap-1.5">
        <i aria-hidden="true" className="inline-block h-2 w-4 rounded-sm" style={{ background: '#3fb950' }} />
        rise ≤ {p.pdt / 2} °C
      </span>
      <span className="flex items-center gap-1.5">
        <i aria-hidden="true" className="inline-block h-2 w-4 rounded-sm" style={{ background: '#d29922' }} />≤ {p.pdt} °C
      </span>
      <span className="flex items-center gap-1.5">
        <i aria-hidden="true" className="inline-block h-2 w-4 rounded-sm" style={{ background: '#f85149' }} />
        over {p.pdt} °C
      </span>
      {heat && visible[heat.layer] && (
        <span className="flex items-center gap-1.5">
          {p.pmap === 'density' ? 'Current density' : 'Drop'} of {netLeaf(mapOf === retSolved ? returnNet : net)} on {heat.layer}: 0
          <i aria-hidden="true" className="inline-block h-2 w-24 rounded-sm" style={{ background: HEAT_GRADIENT }} />
          {p.pmap === 'density' ? `≥ ${num(heat.max, 2)} A/mm` : `${num(heat.max, 2)} mV`}
        </span>
      )}
    </div>
  );

  const worstTracks = [...(loadsOf?.tracks ?? [])].filter((t) => t.amps > 0).sort((a, b) => b.dT - a.dT);
  const worstVias = [...(loadsOf?.vias ?? [])].filter((v) => v.amps > 0).sort((a, b) => b.dT - a.dT);
  const overT = worstTracks.filter((t) => !t.ok).length;
  const overV = worstVias.filter((v) => !v.ok).length;

  const itemLists = (
    <>
      {worstTracks.length > 0 && (
        <div>
          <p className="mb-1 font-semibold">Tracks, hottest first</p>
          <ul className={full ? 'lg:max-h-[30vh] lg:overflow-y-auto' : 'max-h-[220px] overflow-y-auto'}>
            {worstTracks.slice(0, 40).map((t) => (
              <li key={t.i}>
                <button type="button" className="w-full rounded px-1.5 py-0.5 text-left hover:bg-[var(--hover)]" onClick={() => zoomTrack(t)}>
                  <span className={riseTone(t.dT, p.pdt)}>ΔT {num(t.dT, 1)} °C</span> {retSolved && `${netLeaf(d.tracks[t.i]?.net ?? '')}, `}
                  {t.layer}, {num(t.w, 3)} mm wide, {num(t.len, 1)} mm long
                  {mode === 'dc' && <span className="text-faint"> · {num(t.amps, 2)} A</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {worstVias.length > 0 && (
        <div>
          <p className="mb-1 font-semibold">Vias, hottest first</p>
          <ul className={full ? 'lg:max-h-[20vh] lg:overflow-y-auto' : 'max-h-[160px] overflow-y-auto'}>
            {worstVias.slice(0, 20).map((v) => {
              const via = d.vias[v.i];
              return (
                <li key={v.i}>
                  <button type="button" className="w-full rounded px-1.5 py-0.5 text-left hover:bg-[var(--hover)]" onClick={() => zoomAt(v.x, v.y)}>
                    <span className={riseTone(v.dT, p.pdt)}>ΔT {num(v.dT, 1)} °C</span> {retSolved && `${netLeaf(via?.net ?? '')} `}via {num(via?.drill ?? 0.3, 2)} mm drill at{' '}
                    {num(v.x, 1)}, {num(v.y, 1)}
                    {mode === 'dc' && <span className="text-faint"> · {num(v.amps, 2)} A</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );

  const quickSummary = quick && (
    <div>
      <p className="font-semibold">
        {overT || overV ? (
          <span className="text-[var(--err-line)]">
            {overT} of {quick.tracks.length} tracks and {overV} of {quick.vias.length} vias rise more than {p.pdt} °C at {p.pi} A
          </span>
        ) : quick.tracks.length || quick.vias.length ? (
          <span className="text-ok">
            All {quick.tracks.length} tracks and {quick.vias.length} vias carry {p.pi} A within a {p.pdt} °C rise
          </span>
        ) : (
          `${netLeaf(net)} has no tracks or vias; its copper is zones and pads only. Use DC drop.`
        )}
      </p>
      {p.pi > 0 && p.pdt > 0 && (
        <p className="mt-1 text-muted">
          IPC-2221 width for {p.pi} A at {p.pdt} °C: {num(requiredWidth(p.pi, p.pdt, outerT, true), 3)} mm on an outer layer ({Math.round(outerT * 1000)} µm)
          {innerT !== undefined && `, ${num(requiredWidth(p.pi, p.pdt, innerT, false), 3)} mm on an inner layer (${Math.round(innerT * 1000)} µm)`}. Zones are not
          checked here: use DC drop for the current in them.
        </p>
      )}
    </div>
  );

  // the drop each load sees: its supply drop plus its return drop
  const totals = (solved?.loads ?? []).map((l) => {
    const r = retSolved?.loads.find((x) => x.ref === l.ref);
    const total = !l.connected ? NaN : retSolved ? (r?.onNet && r.connected ? l.dropMv + r.dropMv : NaN) : l.dropMv;
    return { ref: l.ref, amps: l.amps, supply: l, ret: r, total };
  });
  const worstTotal = Math.max(0, ...totals.map((t) => t.total).filter(Number.isFinite));
  const returnNote =
    mode !== 'dc' || !returnNet
      ? ''
      : !retSourceOk
        ? `${source} has no pad on ${netLeaf(returnNet)}, so the return could not be solved: choose a source with a ground pad, or another return net.`
        : retNow?.error
          ? retNow.error
          : retNow?.result && !retNow.result.ok
            ? retNow.result.error
            : !retSolved
              ? `Solving the return through ${netLeaf(returnNet)}…`
              : totals.some((t) => t.supply.connected && !t.ret?.onNet)
                ? `A load without a pad on ${netLeaf(returnNet)} returns its current some other way; its total is left out.`
                : '';

  const dcSummary = mode === 'dc' && (
    <div aria-live="polite">
      {!loads.some((l) => l.amps > 0) ? (
        <p className="text-muted">Add a load with a current to solve the drop.</p>
      ) : dcNow?.error ? (
        <p className="text-[var(--err-line)]">{dcNow.error}</p>
      ) : dcNow?.result && !dcNow.result.ok ? (
        <p className="text-[var(--err-line)]">{dcNow.result.error}</p>
      ) : !solved ? (
        <p role="status">Solving the copper of {netLeaf(net)}…</p>
      ) : (
        <>
          <table className="w-full text-left">
            <thead className="text-faint">
              <tr>
                <th className="font-normal">Load</th>
                <th className="text-right font-normal">Current</th>
                <th className="text-right font-normal">{retSolved ? netLeaf(net) : 'Drop'}</th>
                {retSolved && <th className="text-right font-normal">{netLeaf(returnNet)}</th>}
                {retSolved && <th className="text-right font-normal">Total</th>}
                {volts > 0 && <th className="text-right font-normal">of {volts} V</th>}
              </tr>
            </thead>
            <tbody>
              {totals.map((l) => (
                <tr key={l.ref}>
                  <td>
                    <button type="button" className="underline decoration-dotted" onClick={() => zoomPart(l.ref)}>
                      {l.ref}
                    </button>
                  </td>
                  <td className="text-right">{num(l.amps, 3)} A</td>
                  <td className="text-right">{l.supply.connected ? `${num(l.supply.dropMv, 2)} mV` : <span className="text-[var(--err-line)]">not connected</span>}</td>
                  {retSolved && (
                    <td className="text-right">
                      {!l.ret?.onNet ? <span className="text-faint">no pad</span> : l.ret.connected ? `${num(l.ret.dropMv, 2)} mV` : <span className="text-[var(--err-line)]">not connected</span>}
                    </td>
                  )}
                  {retSolved && <td className="text-right font-semibold">{Number.isFinite(l.total) ? `${num(l.total, 2)} mV` : '–'}</td>}
                  {volts > 0 && <td className="text-right">{Number.isFinite(l.total) ? `${num(l.total / 10 / volts, 2)} %` : '–'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-muted">
            {retSolved ? (
              <>
                Largest drop seen by a load {num(worstTotal, 2)} mV{volts > 0 && ` (${num(worstTotal / 10 / volts, 2)} % of ${volts} V)`}: up to {num(solved.maxDropMv, 2)} mV on {netLeaf(net)} and{' '}
                {num(retSolved.maxDropMv, 2)} mV on {netLeaf(returnNet)}. {num((solved.powerW + retSolved.powerW) * 1000, 1)} mW lost in the copper of both nets.
              </>
            ) : (
              <>
                Largest drop {num(solved.maxDropMv, 2)} mV{volts > 0 && ` (${num(solved.maxDropMv / 10 / volts, 2)} % of ${volts} V)`}, {num(solved.powerW * 1000, 1)} mW lost in the copper.
              </>
            )}{' '}
            Grid {num(solved.res, 2)} mm, finer around the source and the loads; {(solved.nodes + (retSolved?.nodes ?? 0)).toLocaleString()} nodes.
          </p>
          {returnNote && <p className="mt-1 text-muted">{returnNote}</p>}
          {solved.loads.some((l) => !l.connected) && (
            <p className="mt-1 text-[var(--err-line)]">A load not connected to {source} by the copper of {netLeaf(net)} (a missing track or an unfilled zone) draws no current.</p>
          )}
          {(overT > 0 || overV > 0) && (
            <p className="mt-1 text-[var(--err-line)]">
              {overT} {overT === 1 ? 'track' : 'tracks'} and {overV} {overV === 1 ? 'via' : 'vias'} rise more than {p.pdt} °C.
            </p>
          )}
        </>
      )}
    </div>
  );

  return (
    <Panel title="Power" allowInvalid>
      <div ref={box} className={full ? `flex h-full flex-col bg-[var(--panel)] text-ink${full === 'overlay' ? ' fixed inset-0 z-[200]' : ''}` : undefined}>
        <div className={full ? 'max-h-[40vh] shrink-0 overflow-y-auto border-b border-line' : undefined}>
          {controls}
          {unfilled && (
            <p className="px-2.5 pb-2 text-[var(--accent-ink)]">
              The zones of this board are not filled in the file (in KiCad: Fill All Zones, then save), so its planes and pours are left out: the DC drop counts only tracks and pads, and
              comes out higher than it will be.
            </p>
          )}
          {loadsEditor}
        </div>
        {toolbar}
        <div className={full ? 'flex min-h-0 flex-1 flex-col lg:flex-row' : undefined}>
          <div className={full ? 'flex min-h-0 flex-1 flex-col' : undefined}>
            <div className={full ? 'min-h-0 flex-1' : undefined}>
              <BoardView
                ref={view}
                drawing={d}
                visible={visible}
                highlight={highlight}
                markers={[]}
                focus={focus}
                trackColors={trackColors}
                viaColors={viaColors}
                heat={heat}
                height={full ? 'fill' : typeof window !== 'undefined' && window.innerWidth < 640 ? 400 : 560}
              />
            </div>
            {legend}
          </div>
          <div
            className={
              full
                ? 'flex max-h-[38vh] flex-col gap-3 overflow-y-auto border-t border-line px-2.5 py-2 lg:max-h-none lg:w-[400px] lg:border-l lg:border-t-0'
                : 'grid gap-3 border-t border-line px-2.5 py-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]'
            }
          >
            <div>{mode === 'quick' ? quickSummary : dcSummary}</div>
            <div className="flex flex-col gap-3">{itemLists}</div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

const count = (a: Float32Array) => {
  let n = 0;
  for (const v of a) if (Number.isFinite(v)) n++;
  return n;
};
