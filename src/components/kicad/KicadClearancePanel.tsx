// The Clearance view of the KiCad project page: the nets you give a voltage are checked against the copper of
// every other net on the same layer, with the spacing of IPC-2221 Table 6-1 for the voltage between them.
// The places that are too close are listed and marked on the board, with a line across the gap. The engine
// is kicadClearance.ts.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Panel, Row, Segmented } from '../ui';
import { parseNumericInput } from '../../lib/numericInput';
import type { BoardDrawing } from '../../lib/kicadDrawing';
import { projectDrawing } from '../../lib/kicadDrawingClient';
import { decodeVolts, encodeVolts, type ClearanceFinding, type ClearanceResult, type OuterCoating } from '../../lib/kicadClearance';
import { checkClearanceInWorker } from '../../lib/kicadClearanceClient';
import { netVoltage } from '../../lib/kicadPower';
import type { KicadProjectData } from '../../lib/kicadProjectQueries';
import { netLeaf } from '../../lib/kicadRouting';
import { BoardView, layerColor, type BoardMarker, type BoardViewApi } from './BoardView';
import { useFullScreen } from './useFullScreen';
import { KicadPanelSettings } from './KicadPanelSettings';
import type { KicadAnalysisInputs, SetKicadInputs } from './useKicadAnalysis';

const mm = (v: number) => (Number.isFinite(v) ? v.toFixed(v < 1 ? 3 : 2) : '–');
const findingKey = (f: ClearanceFinding) => `${f.net}|${f.other}|${f.layer}`;
const otherName = (n: string) => (n ? netLeaf(n) : 'copper on no net');

export function KicadClearancePanel({ data, p, set }: { data: KicadProjectData; p: KicadAnalysisInputs; set: SetKicadInputs }) {
  const [drawing, setDrawing] = useState<{ board: object; d?: BoardDrawing; error?: string } | null>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [focus, setFocus] = useState<[number, number, number, number] | null>(null);
  const [selected, setSelected] = useState('');
  const [res, setRes] = useState<{ board: object; key: string; result?: ClearanceResult; error?: string } | null>(null);
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

  // nets with copper; the ones whose name says a high voltage first
  const nets = useMemo(() => {
    if (!d) return [];
    const all = new Set<string>();
    for (const x of d.pads) if (x.net) all.add(x.net);
    for (const x of d.tracks) if (x.net) all.add(x.net);
    for (const x of d.fills) if (x.net) all.add(x.net);
    return [...all].sort((a, b) => netVoltage(b) - netVoltage(a) || a.localeCompare(b));
  }, [d]);
  const volts = useMemo(() => decodeVolts(p.hvnets).filter((x) => nets.includes(x.net)), [p.hvnets, nets]);
  const outer: OuterCoating = p.hvouter === 'B4' ? 'B4' : 'B2';

  const key = `${encodeVolts(volts)}|${outer}`;
  useEffect(() => {
    if (!d || !volts.length) return;
    let live = true;
    const t = setTimeout(() => {
      setRes({ board: data.board, key });
      checkClearanceInWorker({ d: { copper: d.copper, tracks: d.tracks, vias: d.vias, pads: d.pads, fills: d.fills }, volts, outer }).then(
        (result) => live && setRes({ board: data.board, key, result }),
        (e: unknown) => live && setRes({ board: data.board, key, error: e instanceof Error ? e.message : String(e) }),
      );
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, key]);
  const now = res?.board === data.board && res.key === key ? res : null;
  const result = now?.result;

  // the parts with a pad on a high-voltage net, named on the board
  const hvParts = useMemo(() => {
    const hv = new Set(volts.map((x) => x.net));
    return [...new Set((d?.pads ?? []).filter((pd) => pd.ref && hv.has(pd.net)).map((pd) => pd.ref))];
  }, [d, volts]);
  const markers = useMemo((): BoardMarker[] => (result?.violations ?? []).map((v) => ({ id: findingKey(v), x: v.x1, y: v.y1, x2: v.x2, y2: v.y2, status: 'fail', note: `${mm(v.gap)} mm, needs ${mm(v.required)} mm`, item: findingKey(v), selected: findingKey(v) === selected })), [result, selected]);
  const highlight = useMemo(() => new Set(volts.map((x) => x.net)), [volts]);

  if (!drawing || drawing.board !== data.board) return <Panel title="Clearance"><p className="p-3" role="status" data-result-busy="true">Drawing the board…</p></Panel>;
  if (drawing.error || !d) return <Panel title="Clearance"><p className="p-3">{drawing.error}</p></Panel>;

  const setVolts = (next: { net: string; v: number }[]) => set({ hvnets: encodeVolts(next) });
  const used = new Set(volts.map((x) => x.net));
  const show = (f: ClearanceFinding) => {
    setSelected(findingKey(f));
    const x0 = Math.min(f.x1, f.x2);
    const y0 = Math.min(f.y1, f.y2);
    const x1 = Math.max(f.x1, f.x2);
    const y1 = Math.max(f.y1, f.y2);
    const pad = Math.max(1.5, f.required * 2);
    setFocus([x0 - pad, y0 - pad, x1 + pad, y1 + pad]);
  };

  const controls = (
    <div className="px-2.5 py-2">
      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
        <Row label="Outer layers">
          <Segmented
            label="Outer layers"
            value={outer}
            onChange={(v) => set({ hvouter: v })}
            options={[
              { value: 'B2', label: 'Bare (B2)' },
              { value: 'B4', label: 'Coated (B4)' },
            ]}
          />
        </Row>
      </div>
      <p className="mt-1 text-muted">
        Inner layers use column B1. Coated means a permanent polymer coating over the bare board (column B4); for an assembly with conformal coating or above 3050 m, use the Conductor
        Spacing tool.
      </p>
    </div>
  );

  const netsEditor = (
    <div className="border-t border-line px-2.5 py-2">
      <p className="mb-1 font-semibold">High-voltage nets</p>
      {volts.length === 0 && <p className="mb-1 text-muted">Add the nets that carry a high voltage, with their peak voltage to the 0 V of the circuit (for 230 V AC mains, 325 V). Nets you do not add are taken as 0 V.</p>}
      <ul className="grid max-h-[176px] gap-x-4 gap-y-1 overflow-y-auto" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,360px),1fr))' }}>
        {volts.map((x, k) => (
          <li key={`${x.net}-${k}`} className="flex flex-wrap items-center gap-1.5">
            <select className="fld min-w-0 max-w-[220px]" aria-label={`High-voltage net ${k + 1}`} value={x.net} onChange={(e) => setVolts(volts.map((y, j) => (j === k ? { ...y, net: e.target.value } : y)))}>
              {nets
                .filter((n) => n === x.net || !used.has(n))
                .map((n) => (
                  <option key={n} value={n}>
                    {netLeaf(n)}
                  </option>
                ))}
            </select>
            <input
              className="fld w-[72px] text-right"
              inputMode="decimal"
              aria-label={`Peak voltage of ${netLeaf(x.net)}, V`}
              defaultValue={x.v}
              key={`${x.net}-${x.v}`}
              onBlur={(e) => {
                const v = parseNumericInput(e.target.value.replace(',', '.'));
                if (v !== null) setVolts(volts.map((y, j) => (j === k ? { ...y, v } : y)));
                else e.target.value = String(x.v);
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
            <span className="text-muted">V peak</span>
            <button type="button" className="btn" onClick={() => setVolts(volts.filter((_, j) => j !== k))} aria-label={`Remove ${netLeaf(x.net)}`} title="Remove">
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-1.5">
        <button
          type="button"
          className="btn"
          disabled={!nets.some((n) => !used.has(n))}
          onClick={() => {
            const free = nets.find((n) => !used.has(n));
            if (free) setVolts([...volts, { net: free, v: netVoltage(free) > 50 ? netVoltage(free) : 325 }]);
          }}
        >
          Add net
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

  const vOf = (net: string) => volts.find((x) => x.net === net)?.v ?? 0;
  const summary = (
    <div aria-live="polite">
      {!volts.length ? (
        <p className="text-muted">Add a high-voltage net to check its clearance.</p>
      ) : now?.error ? (
        <p className="text-[var(--err-line)]">{now.error}</p>
      ) : !result ? (
        <p role="status">Checking the clearance…</p>
      ) : (
        <>
          <p className="font-semibold">
            {result.violations.length ? (
              <span className="text-[var(--err-line)]">
                {result.violations.length} {result.violations.length === 1 ? 'place is' : 'places are'} closer than IPC-2221 Table 6-1 allows
              </span>
            ) : (
              <span className="text-ok">Every high-voltage net keeps the Table 6-1 spacing to the other nets</span>
            )}
          </p>
          {result.violations.length > 0 && (
            <ul className={`mt-1 ${full ? 'lg:max-h-[30vh] lg:overflow-y-auto' : 'max-h-[220px] overflow-y-auto'}`}>
              {result.violations.map((v) => (
                <li key={findingKey(v)}>
                  <button
                    type="button"
                    data-report-value
                    className={`w-full rounded px-1.5 py-0.5 text-left hover:bg-[var(--hover)] ${findingKey(v) === selected ? 'bg-[var(--hover)] font-semibold' : ''}`}
                    aria-pressed={findingKey(v) === selected}
                    onClick={() => show(v)}
                  >
                    <span className="text-[var(--err-line)]">{mm(v.gap)} mm</span> {netLeaf(v.net)} to {otherName(v.other)} on {v.layer}{' '}
                    <span className="text-faint">
                      · needs {mm(v.required)} mm for {Math.round(v.dv)} V ({v.column})
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <table className="mt-2 w-full text-left">
            <thead className="text-faint">
              <tr>
                <th className="font-normal">Net</th>
                <th className="font-normal">Layer</th>
                <th className="font-normal">Closest other net</th>
                <th className="text-right font-normal">Gap</th>
                <th className="text-right font-normal">Needs</th>
              </tr>
            </thead>
            <tbody>
              {[...result.closest]
                .sort((a, b) => a.net.localeCompare(b.net) || d.copper.indexOf(a.layer) - d.copper.indexOf(b.layer))
                .map((c) => {
                  const ok = c.gap >= c.required - 1e-6;
                  return (
                    <tr key={`${c.net}|${c.layer}|${c.other}`}>
                      <td>
                        {netLeaf(c.net)} <span className="text-faint">{vOf(c.net)} V</span>
                      </td>
                      <td>{c.layer}</td>
                      <td>
                        <button type="button" className="underline decoration-dotted" onClick={() => show(c)}>
                          {otherName(c.other)}
                        </button>
                      </td>
                      <td className={`text-right ${ok ? 'text-ok' : 'text-[var(--err-line)]'}`}>{mm(c.gap)} mm</td>
                      <td className="text-right">
                        {mm(c.required)} mm <span className="text-faint">{c.column}</span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          {result.closest.length === 0 && <p className="mt-1 text-muted">No copper of another net comes within the search distance of these nets.</p>}
          <p className="mt-1 text-muted">Distances are copper edge to copper edge on the same layer, as the zones were last filled in KiCad. Spacing through the board between layers is not checked.</p>
        </>
      )}
    </div>
  );

  return (
    <Panel title="Clearance" allowInvalid>
      <div data-result-busy={volts.length > 0 && !now?.result && !now?.error || undefined} />
      <div ref={box} className={full ? `flex h-full flex-col bg-[var(--panel)] text-ink${full === 'overlay' ? ' fixed inset-0 z-[200]' : ''}` : undefined}>
        <KicadPanelSettings title="Clearance setup" full={!!full}>
          {controls}
          {netsEditor}
        </KicadPanelSettings>
        {toolbar}
        {!full && <div className="border-t border-line px-2.5 py-2" data-testid="clearance-summary">{summary}</div>}
        <div className={full ? 'flex min-h-0 flex-1 flex-col lg:flex-row' : undefined}>
          <div className={full ? 'min-h-0 flex-1' : undefined}>
            <BoardView
              ref={view}
              drawing={d}
              visible={visible}
              highlight={highlight}
              markers={markers}
              focus={focus}
              tagged={hvParts}
              onPick={(pk) => {
                const v = pk.marker && result?.violations.find((x) => findingKey(x) === pk.marker!.item);
                if (v) show(v);
                else setSelected('');
              }}
              height={full ? 'fill' : typeof window !== 'undefined' && window.innerWidth < 640 ? 400 : 560}
            />
          </div>
          {full && <div className="max-h-[38vh] overflow-y-auto border-t border-line px-2.5 py-2 lg:max-h-none lg:w-[420px] lg:border-l lg:border-t-0">{summary}</div>}
        </div>
      </div>
    </Panel>
  );
}
