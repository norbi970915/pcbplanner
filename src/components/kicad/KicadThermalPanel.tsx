// The Thermal view of the KiCad project page: the steady temperature of the board from the heat of the parts
// entered, spread by the copper of every layer and the laminate and given off by both faces to the air, as a
// heat map on a chosen layer. The engine is kicadThermal.ts.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, NumField, Panel, Row, Segmented } from '../ui';
import { parseNumericInput } from '../../lib/numericInput';
import { dcScenario, type DcRequest } from '../../lib/kicadPower';
import { netLeaf } from '../../lib/kicadRouting';
import type { BoardDrawing } from '../../lib/kicadDrawing';
import { projectDrawing } from '../../lib/kicadDrawingClient';
import { encodeNets, useZoneFill, ZoneFillNote } from './useZoneFill';
import { decodeSources, encodeSources, type Air } from '../../lib/kicadThermal';
import { solveThermalInWorker } from '../../lib/kicadThermalClient';
import type { KicadProjectData } from '../../lib/kicadProjectQueries';
import { BoardView, HEAT_GRADIENT, type BoardHeat, type BoardViewApi } from './BoardView';
import { settingsFor } from '../../lib/kicadPowerSettings';
import { useFullScreen } from './useFullScreen';
import { KicadPanelSettings } from './KicadPanelSettings';
import type { KicadAnalysisInputs, SetKicadInputs } from './useKicadAnalysis';
import { reviewInputKey, useKicadReviewState } from '../../state/kicadReviewState';

const num = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '–');
const PLATING_MM = 0.025;

export function KicadThermalPanel({ data, p, set }: { data: KicadProjectData; p: KicadAnalysisInputs; set: SetKicadInputs }) {
  const [drawing, setDrawing] = useState<{ board: object; d?: BoardDrawing; error?: string } | null>(null);
  const [focus, setFocus] = useState<[number, number, number, number] | null>(null);
  const [sol, setSol] = useKicadReviewState(data.board, 'thermal', reviewInputKey('thermal', p));
  const view = useRef<BoardViewApi>(null);
  const { box, full, toggle: toggleFull } = useFullScreen();

  useEffect(() => {
    let live = true;
    projectDrawing(data).then(
      (d) => live && setDrawing({ board: data.board, d }),
      (e: unknown) => live && setDrawing({ board: data.board, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [data]);
  const zf = useZoneFill(data, drawing?.board === data.board ? drawing.d : undefined, p.zfill);
  const d = zf.d;

  // parts, the largest pad area first (the parts most likely to run hot)
  const parts = useMemo(() => {
    if (!d) return [];
    const area = new Map<string, number>();
    for (const q of d.pads) if (q.ref) area.set(q.ref, (area.get(q.ref) ?? 0) + q.w * q.h);
    return d.parts
      .filter((x) => x.ref && !x.ref.startsWith('#'))
      .map((x) => ({ ...x, area: area.get(x.ref) ?? 0 }))
      .sort((a, b) => b.area - a.area || a.ref.localeCompare(b.ref, undefined, { numeric: true }));
  }, [d]);
  const sources = useMemo(() => decodeSources(p.tsrc).filter((s) => parts.some((x) => x.ref === s.ref)), [p.tsrc, parts]);
  const settings = useMemo(() => (d ? settingsFor(data, d.copper, 0, p.tamb) : null), [data, d, p.tamb]);
  const air: Air = p.tair === 'f' ? { mode: 'forced', h: p.th } : { mode: 'natural', orient: p.tair === 'v' ? 'vertical' : 'horizontal' };

  // the copper loss of the Power tab's DC drop (its net, source, loads and return net), as heat
  const scenario = useMemo(() => (d ? dcScenario(d, p) : null), [d, p.pnet, p.psrc, p.ploads, p.pret]); // eslint-disable-line react-hooks/exhaustive-deps
  const lossRequests = useMemo((): DcRequest[] => {
    if (!scenario?.nc || !d || !scenario.loads.some((l) => l.amps > 0)) return [];
    const s = settingsFor(data, d.copper, p.pdt, p.tamb);
    const out: DcRequest[] = [{ nc: scenario.nc, source: scenario.source, loads: scenario.loads, s }];
    if (scenario.retNc && scenario.retSourceOk && scenario.retLoads.some((l) => l.amps > 0)) out.push({ nc: scenario.retNc, source: scenario.source, loads: scenario.retLoads, s });
    return out;
  }, [scenario, d, data, p.pdt, p.tamb]);
  const withLoss = p.tloss && lossRequests.length > 0;
  const key = `${encodeSources(sources)}|${p.tamb}|${p.tair}|${p.th}|${p.teps}|${p.tkxy}|${p.tkz}|${withLoss ? `${p.pnet}|${p.psrc}|${p.ploads}|${p.pret}|${p.pdt}` : ''}|${zf.key}`;
  const solve = () => {
    if (!d || !settings || (!sources.some((s) => s.watts > 0) && !withLoss)) return;
    setSol((prev) => ({ board: data.board, key, ambient: p.tamb, result: prev?.board === data.board ? prev.result : undefined, solving: true }));
    solveThermalInWorker({
      d: { copper: d.copper, outline: d.outline, tracks: d.tracks, vias: d.vias, fills: d.fills, pads: d.pads, parts: d.parts },
      thickness: settings.thickness,
      layerZ: settings.layerZ,
      boardThickness: data.board.thickness ?? 1.6,
      sources: sources.map((s) => ({ ref: s.ref, watts: s.watts })),
      copperLoss: withLoss ? lossRequests : undefined,
      ambientC: p.tamb,
      air,
      emissivity: p.teps,
      kXY: p.tkxy,
      kZ: p.tkz,
      platingMm: PLATING_MM,
    }).then(
      (result) => setSol(prev => prev?.key === key ? { board: data.board, key, ambient: p.tamb, result } : prev),
      (e: unknown) => setSol(prev => prev?.key === key ? { board: data.board, key, ambient: p.tamb, error: e instanceof Error ? e.message : String(e) } : prev),
    );
  };
  // the last solve stays on the board until the next one; it is marked out of date when the inputs change
  const now = sol?.board === data.board ? sol : null;
  const solving = !!now?.solving;
  const solved = now?.result?.ok ? now.result : null;
  const stale = !!solved && now?.key !== key;

  const mapLayer = solved?.layers.some((l) => l.layer === p.tlayer) ? p.tlayer : (solved?.hottest.layer ?? '');
  const heat = useMemo((): BoardHeat | null => {
    const m = solved?.layers.find((l) => l.layer === mapLayer);
    if (!solved || !m) return null;
    // the colours span the coolest to the hottest point of the board, on all layers alike
    let max = -Infinity;
    let min = Infinity;
    for (const l of solved.layers)
      for (const v of l.temp)
        if (Number.isFinite(v)) {
          max = Math.max(max, v);
          min = Math.min(min, v);
        }
    return { layer: m.layer, x0: m.x0, y0: m.y0, res: m.res, nx: m.nx, ny: m.ny, values: m.temp, min, max, smooth: true };
  }, [solved, mapLayer]);
  const visible = useMemo(() => Object.fromEntries((d?.copper ?? []).map((l) => [l, true])), [d]);

  if (!drawing || drawing.board !== data.board) return <Panel title="Thermal"><p className="p-3" role="status" data-result-busy="true">Drawing the board…</p></Panel>;
  if (drawing.error || !d) return <Panel title="Thermal"><p className="p-3">{drawing.error}</p></Panel>;

  const setSources = (next: { ref: string; watts: number; psi?: number }[]) => set({ tsrc: encodeSources(next) });
  const zoomPart = (ref: string) => {
    const ps = d.pads.filter((q) => q.ref === ref);
    const part = d.parts.find((x) => x.ref === ref);
    const xs = ps.length ? ps.map((q) => q.x) : part ? [part.x] : [];
    const ys = ps.length ? ps.map((q) => q.y) : part ? [part.y] : [];
    if (xs.length) setFocus([Math.min(...xs) - 4, Math.min(...ys) - 4, Math.max(...xs) + 4, Math.max(...ys) + 4]);
  };

  const controls = (
    <div className="grid gap-x-6 gap-y-1 px-2.5 py-2" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,310px),1fr))' }}>
      <NumField label="Ambient" value={p.tamb} unit="°C" allowNegative onChange={(v) => set({ tamb: v })} hint="Air temperature around the board. Inside a closed box, use the air temperature in the box." />
      <Row label="Air">
        <Segmented
          label="Air"
          value={p.tair === 'v' || p.tair === 'f' ? p.tair : 'h'}
          onChange={(v) => set({ tair: v })}
          options={[
            { value: 'h', label: 'Still, flat' },
            { value: 'v', label: 'Still, upright' },
            { value: 'f', label: 'Moving' },
          ]}
        />
      </Row>
      {p.tair === 'f' && (
        <NumField label="Convection" symbol="h" value={p.th} unit="W/m²K" onChange={(v) => set({ th: v })} hint="Convection per face for moving air; radiation is added to it. About 20 W/m²K at 1 m/s over a board (onsemi AND9596 gives 30 with radiation included)." />
      )}
      <NumField label="Surface emissivity" symbol="ε" value={p.teps} max={1} allowZero onChange={(v) => set({ teps: v })} hint="Solder mask about 0.9 (measured 0.88–0.97 for red, white and black mask); bare copper 0.05–0.15. In still air, radiation carries about as much heat as convection." />
      <NumField label="Laminate in-plane" symbol="k" value={p.tkxy} unit="W/m·K" onChange={(v) => set({ tkxy: v })} hint="Thermal conductivity of the laminate along the board: 0.81 W/m·K measured on a bare FR-4 board (Graebner). The copper does nearly all the spreading, so this matters little." />
      <NumField label="Laminate through" symbol="k" value={p.tkz} unit="W/m·K" onChange={(v) => set({ tkz: v })} hint="Thermal conductivity of the laminate through the board, from its datasheet: FR-4 about 0.25–0.4 (Isola 370HR 0.4)." />
      <div className="col-span-full">
        <Check
          label={
            lossRequests.length
              ? `Add the copper loss of the Power tab's DC drop (${[scenario?.net, lossRequests.length > 1 ? scenario?.returnNet : ''].filter(Boolean).map((n) => netLeaf(n!)).join(' and ')})`
              : "Add the copper loss of the Power tab's DC drop (set up a DC drop on the Power tab first)"
          }
          checked={p.tloss && lossRequests.length > 0}
          onChange={(v) => set({ tloss: v })}
          hint="Heats the board with the I²R of the tracks, planes and vias of the DC drop set up on the Power tab (its net, source, loads and return net), each watt where it is lost. Usually small next to the parts, but not on a narrow track carrying amperes."
        />
      </div>
    </div>
  );

  const used = new Set(sources.map((s) => s.ref));
  const sourcesEditor = (
    <div className="border-t border-line px-2.5 py-2">
      <p className="mb-1 font-semibold">Heat sources</p>
      {sources.length === 0 && <p className="mb-1 text-muted">Add the parts that dissipate power, with their power. ψJB from the datasheet (optional) gives the junction temperature.</p>}
      <ul className="grid max-h-[176px] gap-x-4 gap-y-1 overflow-y-auto" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,330px),1fr))' }}>
        {sources.map((s, k) => (
          <li key={`${s.ref}-${k}`} className="flex flex-wrap items-center gap-1.5">
            <select className="fld min-w-0 max-w-[110px]" aria-label={`Heat source ${k + 1}`} value={s.ref} onChange={(e) => setSources(sources.map((x, j) => (j === k ? { ...x, ref: e.target.value } : x)))}>
              {parts
                .filter((x) => x.ref === s.ref || !used.has(x.ref))
                .map((x) => (
                  <option key={x.ref} value={x.ref}>
                    {x.ref}
                  </option>
                ))}
            </select>
            <input
              className="fld w-[56px] text-right"
              inputMode="decimal"
              aria-label={`Power of ${s.ref}, W`}
              defaultValue={s.watts}
              key={`w-${s.ref}-${s.watts}`}
              onBlur={(e) => {
                const v = parseNumericInput(e.target.value.replace(',', '.'));
                if (v !== null && v >= 0) setSources(sources.map((x, j) => (j === k ? { ...x, watts: v } : x)));
                else e.target.value = String(s.watts);
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
            <span className="text-muted">W</span>
            <input
              className="fld w-[48px] text-right"
              inputMode="decimal"
              aria-label={`ψJB of ${s.ref}, °C/W (optional)`}
              placeholder="ψJB"
              defaultValue={s.psi ?? ''}
              key={`p-${s.ref}-${s.psi}`}
              onBlur={(e) => {
                const t = e.target.value.trim().replace(',', '.');
                const v = Number(t);
                if (t === '') setSources(sources.map((x, j) => (j === k ? { ref: x.ref, watts: x.watts } : x)));
                else if (Number.isFinite(v) && v >= 0) setSources(sources.map((x, j) => (j === k ? { ...x, psi: v } : x)));
                else e.target.value = s.psi === undefined ? '' : String(s.psi);
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
            <span className="text-muted">°C/W</span>
            <button type="button" className="btn" onClick={() => setSources(sources.filter((_, j) => j !== k))} aria-label={`Remove ${s.ref}`} title="Remove">
              ✕
            </button>
          </li>
        ))}
      </ul>
      {parts.length === 0 && (
        <p className="mb-1 text-[var(--err-line)]">
          This board has no footprints, so it has no parts to heat. Load the board with its parts placed, or try the demonstration project.
        </p>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary" disabled={solving || zf.busy || (!sources.some((x) => x.watts > 0) && !withLoss)} onClick={solve}>
          {solving ? 'Solving…' : 'Solve'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!parts.some((x) => !used.has(x.ref))}
          onClick={() => {
            const free = parts.find((x) => !used.has(x.ref));
            if (free) setSources([...sources, { ref: free.ref, watts: 0.5 }]);
          }}
        >
          Add part
        </button>
        {stale && !solving && <span className="text-[var(--accent-ink)]">The inputs changed: press Solve to update the map.</span>}
      </div>
      <div className="-mx-2.5 mt-1">
        <ZoneFillNote zf={zf} onChange={(n) => set({ zfill: encodeNets(n) })} what="the board spreads heat only through its other copper: the temperatures come out higher than they will be" />
      </div>
    </div>
  );

  const toolbar = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-2.5 py-2">
      {solved && (
        <label className="flex items-center gap-1.5">
          Layer
          <select className="fld" value={mapLayer} onChange={(e) => set({ tlayer: e.target.value })}>
            {solved.layers.map((l) => (
              <option key={l.layer} value={l.layer}>
                {l.layer}
              </option>
            ))}
          </select>
        </label>
      )}
      <span className="ml-auto flex gap-2">
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

  const legend = heat && (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-2.5 py-1.5 text-[11px] text-muted">
      <span className="flex items-center gap-1.5">
        {heat.layer}: {num(heat.min ?? p.tamb)} °C
        <i aria-hidden="true" className="inline-block h-2 w-28 rounded-sm" style={{ background: HEAT_GRADIENT }} />
        {num(heat.max)} °C (coolest to hottest of the board; ambient {num(now?.ambient ?? p.tamb)} °C)
      </span>
    </div>
  );

  const summary = (
    <div aria-live="polite">
      {!solved && !now?.error && !(now?.result && !now.result.ok) && !solving ? (
        <p className="text-muted">
          {sources.some((s) => s.watts > 0) || withLoss ? 'Press Solve to work out the temperature of the board.' : 'Add the parts that dissipate power, with their power, then press Solve.'}
        </p>
      ) : now?.error ? (
        <p className="text-[var(--err-line)]">{now.error}</p>
      ) : now?.result && !now.result.ok ? (
        <p className="text-[var(--err-line)]">{now.result.error}</p>
      ) : !solved ? (
        <p role="status">Solving the temperature of the board…</p>
      ) : (
        <>
          <table className="w-full text-left">
            <thead className="text-faint">
              <tr>
                <th className="font-normal">Part</th>
                <th className="text-right font-normal">Power</th>
                <th className="text-right font-normal">Board under it</th>
                <th className="text-right font-normal">Junction</th>
              </tr>
            </thead>
            <tbody>
              {solved.parts.map((x) => {
                const psi = sources.find((s) => s.ref === x.ref)?.psi;
                return (
                  <tr key={x.ref}>
                    <td>
                      <button type="button" className="underline decoration-dotted" onClick={() => zoomPart(x.ref)}>
                        {x.ref}
                      </button>
                      {x.back && <span className="text-faint"> (back)</span>}
                    </td>
                    <td className="text-right">{num(x.watts, 2)} W</td>
                    <td className="text-right">{num(x.maxC)} °C</td>
                    <td className="text-right">{psi !== undefined ? <b>{num(x.maxC + psi * x.watts)} °C</b> : <span className="text-faint">enter ψJB</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-1 text-muted">
            Hottest {num(solved.hottest.c)} °C on {solved.hottest.layer} at {num(solved.hottest.x)}, {num(solved.hottest.y)} mm. The faces average {num(solved.meanRise)} °C above
            ambient: {num(solved.powerW, 2)} W leave {num(solved.boardAreaMm2 / 100, 0)} cm² of board by convection ({num(solved.hTop)} W/m²K on top, {num(solved.hBottom)} below) and
            radiation ({num(solved.hRad)} W/m²K a face). Grid {num(solved.res, 2)} mm on {solved.layers.length} layers.
          </p>
          {solved.parts.some((x) => !x.placed) && <p className="mt-1 text-muted">A part with no pads on its side is heated at its position.</p>}
          {solved.copperLoss.length > 0 && (
            <p className="mt-1 text-muted">
              Copper loss included:{' '}
              {solved.copperLoss.map((c) => (c.error ? `${netLeaf(c.net)} not solved (${c.error})` : `${(c.w * 1000).toFixed(1)} mW on ${netLeaf(c.net)}`)).join(', ')}.
            </p>
          )}
          {solved.outlineUsed === 'copper' && (
            <p className="mt-1 text-[var(--accent-ink)]">
              The file has no closed board outline around the copper (Edge.Cuts), so the board is taken as the rectangle the copper fills. Close the outline in KiCad for the real shape.
            </p>
          )}
        </>
      )}
    </div>
  );

  return (
    <Panel title="Thermal" allowInvalid>
      <div data-result-busy={solving || zf.busy || undefined} data-result-stale={stale || undefined} />
      <div ref={box} className={full ? `flex h-full flex-col bg-[var(--panel)] text-ink${full === 'overlay' ? ' fixed inset-0 z-[200]' : ''}` : undefined}>
        <KicadPanelSettings title="Thermal setup" full={!!full}>
          {controls}
          {sourcesEditor}
        </KicadPanelSettings>
        {toolbar}
        {!full && <div className="border-t border-line px-2.5 py-2" data-testid="thermal-summary">{summary}</div>}
        <div className={full ? 'flex min-h-0 flex-1 flex-col lg:flex-row' : undefined}>
          <div className={full ? 'flex min-h-0 flex-1 flex-col' : undefined}>
            <div className={full ? 'min-h-0 flex-1' : undefined}>
              <BoardView
                ref={view}
                drawing={d}
                visible={visible}
                markers={[]}
                focus={focus}
                heat={heat}
                tagged={sources.map((x) => x.ref)}
                height={full ? 'fill' : typeof window !== 'undefined' && window.innerWidth < 640 ? 400 : 560}
              />
            </div>
            {legend}
          </div>
          {full && <div className="max-h-[38vh] overflow-y-auto border-t border-line px-2.5 py-2 lg:max-h-none lg:w-[400px] lg:border-l lg:border-t-0">{summary}</div>}
        </div>
      </div>
    </Panel>
  );
}
