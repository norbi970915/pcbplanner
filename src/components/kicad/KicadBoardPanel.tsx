// The Board view of the KiCad project page: the board drawn from the project file with the routing
// check's findings on it. A finding in the list (or a marker on the board) selects its pair or net:
// the copper of its nets is highlighted, the view zooms to it, and its reasons are listed. A click on
// copper highlights that net.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Panel } from '../ui';
import type { BoardDrawing } from '../../lib/kicadDrawing';
import { projectDrawing } from '../../lib/kicadDrawingClient';
import type { KicadProjectData } from '../../lib/kicadProjectQueries';
import { itemReasons, netLeaf } from '../../lib/kicadRouting';
import { statusLabel, type CheckedItem } from '../../lib/kicadRoutingSolve';
import { BoardView, layerColor, type BoardMarker, type BoardViewApi } from './BoardView';
import { useFullScreen } from './useFullScreen';

export const itemKey = (c: CheckedItem) => `${c.group.key}|${c.item.name}`;
const itemNets = (c: CheckedItem) => (c.item.pair ? [c.item.pair.p, c.item.pair.n] : c.item.net ? [c.item.net.name] : []);
const title = (c: CheckedItem) => (c.item.kind === 'pair' ? netLeaf(c.item.name).replace(/[_.]$/, '') || c.item.name : netLeaf(c.item.name));

/** Every marked place of every pair or net with a warning or a failure. */
export function findingMarkers(checked: CheckedItem[]): BoardMarker[] {
  const out: BoardMarker[] = [];
  for (const c of checked) {
    if (!c.target || (c.res.overall !== 'warn' && c.res.overall !== 'fail')) continue;
    const key = itemKey(c);
    let n = 0;
    for (const l of c.res.layers) if (l.status === 'warn' || l.status === 'fail') for (const p of l.points ?? []) out.push({ id: `${key}#${n++}`, x: p.x, y: p.y, status: l.status, note: p.note, item: key });
    for (const s of c.res.checks ?? []) if (s.status === 'warn' || s.status === 'fail') for (const p of s.points ?? []) out.push({ id: `${key}#${n++}`, x: p.x, y: p.y, x2: p.x2, y2: p.y2, status: s.status, note: p.note, item: key });
  }
  return out;
}

const tone = (s: string) => (s === 'fail' ? 'text-[var(--err-line)]' : s === 'warn' ? 'text-[var(--accent-ink)]' : 'text-ok');

export function KicadBoardPanel({ data, checked, selected, onSelect, solving }: { data: KicadProjectData; checked: CheckedItem[]; selected: string; onSelect: (key: string) => void; solving: boolean }) {
  const [drawing, setDrawing] = useState<{ board: object; d?: BoardDrawing; error?: string } | null>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [net, setNet] = useState('');
  const [note, setNote] = useState('');
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

  const problems = useMemo(
    () =>
      checked
        .filter((c) => c.target && (c.res.overall === 'warn' || c.res.overall === 'fail'))
        .sort((a, b) => Number(b.res.overall === 'fail') - Number(a.res.overall === 'fail') || a.item.name.localeCompare(b.item.name)),
    [checked],
  );
  const markers = useMemo(() => findingMarkers(checked).map((m) => ({ ...m, selected: m.item === selected })), [checked, selected]);
  const current = checked.find((c) => itemKey(c) === selected);
  const highlight = useMemo(() => new Set(current ? itemNets(current) : net ? [net] : []), [current, net]);

  // the area of the selected pair: its copper and its markers, with a millimetre around it
  const d = drawing?.board === data.board ? drawing.d : undefined;
  const focus = useMemo((): [number, number, number, number] | null => {
    if (!d || !current) return null;
    const nets = new Set(itemNets(current));
    let box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    const grow = (x: number, y: number) => (box = [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)]);
    for (const t of d.tracks)
      if (nets.has(t.net)) {
        grow(t.x1, t.y1);
        grow(t.x2, t.y2);
      }
    for (const m of markers) if (m.item === selected) grow(m.x, m.y);
    return Number.isFinite(box[0]) ? [box[0] - 1, box[1] - 1, box[2] + 1, box[3] + 1] : null;
  }, [d, current, markers, selected]);

  if (!drawing || drawing.board !== data.board) return <Panel title="Board"><p className="p-3" role="status">Drawing the board…</p></Panel>;
  if (drawing.error || !d) return <Panel title="Board"><p className="p-3">{drawing.error}</p></Panel>;

  const layerToggle = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-2">
      {d.copper.map((l) => (
        <label key={l} className="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={!!visible[l]} onChange={(e) => setVisible((v) => ({ ...v, [l]: e.target.checked }))} />
          <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: layerColor(l) }} />
          {l}
        </label>
      ))}
      <span className="ml-auto flex gap-2">
        <button type="button" className="btn" onClick={() => setVisible(Object.fromEntries(d.copper.map((l) => [l, true])))}>
          All layers
        </button>
        <button type="button" className="btn" onClick={() => view.current?.fit()}>
          Fit board
        </button>
        <button type="button" className="btn" aria-pressed={!!full} onClick={toggleFull}>
          {full ? 'Exit full screen' : 'Full screen'}
        </button>
      </span>
    </div>
  );

  return (
    <Panel title="Board">
      <div ref={box} className={full ? `flex h-full flex-col bg-[var(--panel)] text-ink${full === 'overlay' ? ' fixed inset-0 z-[200]' : ''}` : undefined}>
      {layerToggle}
      <div className={full ? 'flex min-h-0 flex-1 flex-col lg:flex-row' : undefined}>
      <div className={full ? 'min-h-0 flex-1' : undefined}>
      <BoardView
        ref={view}
        drawing={d}
        visible={visible}
        highlight={highlight}
        markers={markers}
        focus={focus}
        height={full ? 'fill' : typeof window !== 'undefined' && window.innerWidth < 640 ? 400 : 560}
        onPick={(p) => {
          if (p.marker) {
            onSelect(p.marker.item);
            setNet('');
            setNote(p.marker.note);
          } else {
            onSelect('');
            setNet(p.net ?? '');
            setNote('');
          }
        }}
      />
      </div>
      <div
        className={
          full
            ? 'flex max-h-[38vh] flex-col gap-3 overflow-y-auto border-t border-line px-2.5 py-2 lg:max-h-none lg:w-[380px] lg:border-l lg:border-t-0'
            : 'grid gap-3 border-t border-line px-2.5 py-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]'
        }
      >
        <div>
          <p className="mb-1 font-semibold">
            Findings:{' '}
            {problems.length
              ? `${problems.length} ${problems.length === 1 ? 'pair or net' : 'pairs and nets'} with warnings or failures${solving ? ', still checking…' : ''}`
              : solving
                ? 'checking the routing…'
                : 'none'}
          </p>
          <ul className={full ? 'lg:max-h-[45vh] lg:overflow-y-auto' : 'max-h-[260px] overflow-y-auto'}>
            {problems.map((c) => {
              const k = itemKey(c);
              return (
                <li key={k}>
                  <button
                    type="button"
                    className={`w-full rounded px-1.5 py-0.5 text-left hover:bg-[var(--hover)] ${k === selected ? 'bg-[var(--hover)] font-semibold' : ''}`}
                    aria-pressed={k === selected}
                    onClick={() => {
                      onSelect(k === selected ? '' : k);
                      setNet('');
                      setNote('');
                    }}
                  >
                    <span className={tone(c.res.overall)}>{statusLabel(c.res.overall)}</span> {title(c)} <span className="text-faint">· {c.target?.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div aria-live="polite">
          {current ? (
            <>
              <p className="font-semibold">
                {title(current)} <span className={tone(current.res.overall)}>{statusLabel(current.res.overall)}</span>
              </p>
              {note && <p className="text-muted">Marker: {note}</p>}
              <ul className="mt-1 list-disc pl-5 text-muted">
                {itemReasons(current.res).map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </>
          ) : net ? (
            <p>
              Net <b>{netLeaf(net)}</b> <span className="text-faint">({net})</span> is highlighted. Click empty board to clear it.
            </p>
          ) : (
            <p className="text-muted">
              Pick a finding in the list or a marker on the board to see it; click a track to highlight its net. Orange markers are warnings, red ones failures. A dashed line runs from a via to the nearest ground via.
            </p>
          )}
        </div>
      </div>
      </div>
      </div>
    </Panel>
  );
}
