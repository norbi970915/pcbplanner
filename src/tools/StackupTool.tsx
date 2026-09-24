import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { stackupGroup } from '../components/StackupPicker';
import { ToolPage } from '../components/ToolPage';
import { Notes, NumField, Panel, Section, Segmented } from '../components/ui';
import type { DesignResult } from '../lib/design';
import { runPooled } from '../lib/solverClient';
import { toAltium, toEagleDru, toKicad, zip } from '../lib/stackupExport';
import { boardThickness, copperCount, DEFAULT_DF, shortName, geometryForLayer, MASK_DF, newId, PRESETS, totalThickness, type Layer, type LayerKind, type Stackup } from '../lib/stackups';
import { fmt, fromMm, MM_PER_OZ, plain, toMm } from '../lib/units';
import { useSettings } from '../state/settings';
import { stackupStore, useStackups } from '../state/stackupStore';

const TYPE_LABEL: Record<LayerKind, string> = { mask: 'Solder Mask', copper: 'Signal', dielectric: 'Dielectric' };
const COLOR: Record<LayerKind, string> = { mask: 'var(--mask)', copper: 'var(--copper)', dielectric: 'var(--laminate)' };
const SESSION = 'pcbplanner:stackup-manager:';
const readSession = (key: string) => {
  try { return sessionStorage.getItem(SESSION + key); } catch { return null; }
};
const writeSession = (key: string, value: string) => {
  try { sessionStorage.setItem(SESSION + key, value); } catch { /* storage unavailable */ }
};
const clearSession = (key: string) => {
  try { sessionStorage.removeItem(SESSION + key); } catch { /* storage unavailable */ }
};
function readDraft(current: Stackup): Stackup {
  try {
    const saved = JSON.parse(readSession(`draft:${current.id}`) || 'null');
    return saved?.id === current.id && Array.isArray(saved.layers) ? saved as Stackup : current;
  } catch { return current; }
}
/** Altium's default layer colours for the outer copper; inner layers use the copper colour. */
const layerSwatch = (l: Layer, i: number, all: Layer[]) => {
  if (l.kind !== 'copper') return COLOR[l.kind];
  const coppers = all.filter((x) => x.kind === 'copper');
  if (coppers[0] === l) return '#ff0000';
  if (coppers[coppers.length - 1] === l) return '#0000ff';
  return i % 2 ? '#bcbc4e' : '#6e9a3c';
};

/** Numeric cell; only values above `min` (or at least `min` when `inclusive`) are accepted. */
function Num({ value, onChange, width = 70, disabled, min = 0, inclusive = false }: { value: number; onChange: (v: number) => void; width?: number; disabled?: boolean; min?: number; inclusive?: boolean }) {
  const [text, setText] = useState(plain(value, 5));
  useEffect(() => {
    setText(plain(value, 5));
  }, [value]);
  const n = Number.parseFloat(text);
  const valid = (v: number) => Number.isFinite(v) && (inclusive ? v >= min : v > min) && v < 1000;
  return (
    <input
      className="fld text-right"
      style={{ width }}
      inputMode="decimal"
      value={text}
      disabled={disabled}
      aria-invalid={!valid(n)}
      onChange={(e) => {
        setText(e.target.value);
        const v = Number.parseFloat(e.target.value);
        if (valid(v)) onChange(v);
      }}
    />
  );
}
/** Prepreg glass styles used in the library, with the thickness and Dk range they have there. */
const GLASS_TABLE = (() => {
  const m = new Map<string, { style: string; tMin: number; tMax: number; dkMin: number; dkMax: number }>();
  for (const s of PRESETS)
    for (const l of s.layers) {
      const g = l.kind === 'dielectric' ? /^Prepreg\s+(\d+)$/.exec(l.name)?.[1] : undefined;
      if (!g) continue;
      const e = m.get(g) ?? { style: g, tMin: Infinity, tMax: 0, dkMin: Infinity, dkMax: 0 };
      e.tMin = Math.min(e.tMin, l.t);
      e.tMax = Math.max(e.tMax, l.t);
      e.dkMin = Math.min(e.dkMin, l.er ?? Infinity);
      e.dkMax = Math.max(e.dkMax, l.er ?? 0);
      m.set(g, e);
    }
  return [...m.values()].sort((a, b) => a.tMin - b.tMin);
})();
const WEAVE: Record<string, string> = {
  '106': 'very fine, resin-rich',
  '1080': 'fine, resin-rich',
  '2313': 'medium',
  '3313': 'medium',
  '2116': 'medium-heavy',
  '7628': 'coarse, glass-rich',
};

function download(name: string, data: string | Uint8Array, type: string) {
  const blob = new Blob([typeof data === 'string' ? data : (data as BlobPart)], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function StackupTool() {
  const stackups = useStackups();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { unit } = useSettings();
  const id = params.get('id') ?? readSession('selected') ?? stackups.find((s) => s.id === 'std-6l-16-1080-2')?.id ?? stackups[0]?.id;
  const current = stackups.find((s) => s.id === id) ?? stackups[0];
  const [draft, setDraft] = useState<Stackup>(() => readDraft(current));
  useEffect(() => {
    setDraft(readDraft(current));
  }, [current]);
  useEffect(() => { writeSession('selected', current.id); }, [current.id]);
  useEffect(() => {
    if (draft.id !== current.id) return;
    const key = `draft:${current.id}`;
    if (JSON.stringify(draft) === JSON.stringify(current)) clearSession(key);
    else writeSession(key, JSON.stringify(draft));
  }, [current, draft]);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(current), [draft, current]);
  const [tab, setTab] = useState<'stackup' | 'impedance'>(() => readSession('tab') === 'impedance' ? 'impedance' : 'stackup');
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { writeSession('tab', tab); }, [tab]);
  const setId = (v: string) => setParams({ id: v }, { replace: true });

  const update = (i: number, patch: Partial<Layer>) => setDraft((d) => ({ ...d, layers: d.layers.map((l, n) => (n === i ? { ...l, ...patch } : l)) }));
  const selIdx = draft.layers.findIndex((l) => l.id === sel);
  const move = (dir: -1 | 1) =>
    setDraft((d) => {
      const i = d.layers.findIndex((l) => l.id === sel);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.layers.length) return d;
      const layers = [...d.layers];
      [layers[i], layers[j]] = [layers[j], layers[i]];
      return { ...d, layers };
    });
  const insert = (kind: LayerKind) =>
    setDraft((d) => {
      const i = Math.max(0, d.layers.findIndex((l) => l.id === sel));
      const l: Layer =
        kind === 'copper'
          ? { id: newId(), kind, name: 'Layer', t: MM_PER_OZ, role: 'signal' }
          : kind === 'mask'
            ? { id: newId(), kind, name: 'Solder Mask', t: 0.0305, er: 3.8, df: MASK_DF }
            : { id: newId(), kind, name: 'Prepreg', t: 0.1, er: 4.2, df: DEFAULT_DF };
      const layers = [...d.layers];
      layers.splice(i + 1, 0, l);
      return { ...d, layers };
    });
  const remove = () => {
    setDraft((d) => ({ ...d, layers: d.layers.filter((l) => l.id !== sel) }));
    setSel(null);
  };

  const saveCopy = () => {
    const copy: Stackup = { ...draft, id: `custom-${Date.now().toString(36)}`, name: `${draft.name} (copy)`, label: undefined, builtin: false };
    stackupStore.save(copy);
    setId(copy.id);
  };

  const openInImpedance = (layerId: string) => {
    const g = geometryForLayer(draft, layerId);
    if (!g) return;
    const q = new URLSearchParams({ type: g.type, h: String(g.h), er: String(g.er), t: String(g.t) });
    if (g.h2 !== undefined) {
      q.set('h2', String(g.h2));
      q.set('er2', String(g.er2 ?? g.er));
    }
    if (g.type === 'microstrip') {
      q.set('mask', g.mask ? '1' : '0');
      if (g.mask) {
        q.set('c1', String(g.mask.c1));
        q.set('c2', String(g.mask.c2));
        q.set('erm', String(g.mask.er));
      }
    }
    navigate(`/impedance?${q.toString()}`);
  };

  // ---- impedance tab: widths for common targets on every signal layer ----
  const [targets, setTargets] = useState(() => {
    try {
      const saved = JSON.parse(readSession('targets') || 'null');
      if (saved && [saved.se, saved.diff, saved.s].every((v) => typeof v === 'number' && Number.isFinite(v))) return saved as { se: number; diff: number; s: number };
    } catch { /* use defaults */ }
    return { se: 50, diff: 100, s: 0.127 };
  });
  useEffect(() => { writeSession('targets', JSON.stringify(targets)); }, [targets]);
  const [imp, setImp] = useState<Record<string, { se?: DesignResult | string; diff?: DesignResult | string }>>({});
  const impKey = JSON.stringify([draft.layers, targets]);
  useEffect(() => {
    if (tab !== 'impedance') return;
    let alive = true;
    setImp({});
    const sig = draft.layers.filter((l) => l.kind === 'copper' && l.role !== 'plane');
    for (const l of sig) {
      const sg = geometryForLayer(draft, l.id);
      if (!sg) continue;
      const base = { sg, etch: 0.0127, accuracy: 'normal' as const };
      runPooled({ type: 'design', req: { ...base, kind: 'se', target: targets.se } }).then(
        (r) => alive && setImp((m) => ({ ...m, [l.id]: { ...m[l.id], se: r.ok && r.design ? r.design : r.ok ? '—' : r.error } })),
      );
      runPooled({ type: 'design', req: { ...base, kind: 'diff', target: targets.diff, rule: { mode: 'fixed', s: targets.s, ratio: 1, minS: 0 } } }).then(
        (r) => alive && setImp((m) => ({ ...m, [l.id]: { ...m[l.id], diff: r.ok && r.design ? r.design : r.ok ? '—' : r.error } })),
      );
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, impKey]);

  // ---- export ----
  const [exportMsg, setExportMsg] = useState<{ text: string; error?: boolean } | null>(null);
  useEffect(() => {
    setExportMsg(null);
  }, [draft]);
  const runExport = (kind: 'kicad' | 'altium' | 'fusion') => {
    try {
      if (kind === 'kicad') {
        const files = toKicad(draft);
        const base = files[0].name.replace(/\.kicad_pcb$/, '');
        download(`${base}_kicad_stackup.zip`, zip(files), 'application/zip');
        setExportMsg({ text: `Saved ${base}_kicad_stackup.zip: unzip it, then in your board use Board Setup → Import Settings from Another Board → select ${base}.kicad_pcb → tick “Board layers and physical stackup”.` });
      } else if (kind === 'altium') {
        const f = toAltium(draft);
        download(f.name, f.content, 'application/xml');
        setExportMsg({ text: `Saved ${f.name}: in Altium open the Layer Stack Manager → File → Load Stackup from File.` });
      } else {
        const f = toEagleDru(draft);
        download(f.name, f.content, 'text/plain');
        setExportMsg({ text: `Saved ${f.name}: in Fusion open Design Rules → File → Load. Then enter Dk/Df in the Layer Stack Manager (DRU files carry thicknesses only).` });
      }
    } catch (e) {
      setExportMsg({ text: e instanceof Error ? e.message : String(e), error: true });
    }
  };

  const L = (mm: number) => fmt(fromMm(mm, unit), 4);
  const total = totalThickness(draft);
  const board = boardThickness(draft);
  const groups = [...new Set(stackups.map(stackupGroup))];
  const readOnly = !!draft.builtin;

  const properties = (
    <>
      <Section title="Stackup">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <label className="text-muted" htmlFor="lsm-s">
            Library
          </label>
          <select id="lsm-s" className="fld w-[176px]" value={draft.id} onChange={(e) => setId(e.target.value)}>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {stackups
                  .filter((s) => stackupGroup(s) === g)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {shortName(s)}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <label className="text-muted" htmlFor="lsm-n">
            Name
          </label>
          <input id="lsm-n" className="fld w-[176px]" value={draft.name} disabled={readOnly} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </div>
        <div className="flex flex-wrap justify-end gap-1 pt-0.5">
          <button className="btn" onClick={saveCopy}>
            Save as Copy
          </button>
          {!readOnly && (
            <>
              <button className="btn btn-primary" disabled={!dirty} onClick={() => stackupStore.save(draft)}>
                Save
              </button>
              <button
                className="btn"
                onClick={() => {
                  stackupStore.remove(draft.id);
                  setId(PRESETS[0].id);
                }}
              >
                Delete
              </button>
            </>
          )}
        </div>
        {readOnly && <p className="text-faint">Library stackup: edits are temporary until you save a copy. {draft.note}</p>}
      </Section>
      <Section title="Board Information">
        <table className="w-full">
          <tbody className="[&_td]:py-[3px]">
            <tr>
              <td className="text-muted">Copper layers</td>
              <td className="tnum text-right">{copperCount(draft)}</td>
            </tr>
            <tr>
              <td className="text-muted">Board thickness</td>
              <td className="tnum text-right">
                {L(board)} {unit}
              </td>
            </tr>
            <tr>
              <td className="text-muted">Incl. solder mask</td>
              <td className="tnum text-right">
                {L(total)} {unit}
              </td>
            </tr>
            <tr>
              <td className="text-muted">Nominal (fab)</td>
              <td className="tnum text-right">{draft.nominal ? `${draft.nominal} mm` : '—'}</td>
            </tr>
          </tbody>
        </table>
      </Section>
      <Section title="Export">
        <div className="flex flex-wrap gap-1">
          <button className="btn" onClick={() => runExport('kicad')}>
            KiCad
          </button>
          <button className="btn" onClick={() => runExport('altium')}>
            Altium
          </button>
          <button className="btn" onClick={() => runExport('fusion')}>
            Fusion 360 / EAGLE
          </button>
        </div>
        {exportMsg && <p className={exportMsg.error ? 'text-[var(--err-line)]' : 'text-faint'}>{exportMsg.text}</p>}
        {!exportMsg && <p className="text-faint">Downloads the stackup shown, including unsaved edits. See “Importing the stackup” below the stack preview.</p>}
      </Section>
      {tab === 'impedance' && (
        <Section title="Impedance Profiles">
          <NumField label="Single-ended target" value={targets.se} onChange={(v) => setTargets((t) => ({ ...t, se: v }))} unit="Ω" />
          <NumField label="Differential target" value={targets.diff} onChange={(v) => setTargets((t) => ({ ...t, diff: v }))} unit="Ω" />
          <NumField label="Pair spacing" value={fromMm(targets.s, unit)} onChange={(v) => setTargets((t) => ({ ...t, s: toMm(v, unit) }))} unit={unit} />
        </Section>
      )}
    </>
  );

  return (
    <ToolPage
      title="Layer Stack Manager"
      description={`${PRESETS.length} standard FR-4 stackups (2 to 12 layers, 0.8–2.0 mm) plus your own. Edit materials and thicknesses, assign signal and plane layers, and see the trace widths for your impedance targets on every layer.`}
      properties={properties}
      status={`${draft.name} · ${copperCount(draft)} layers · ${L(board)} ${unit}${dirty ? ' · modified' : ''}`}
    >
      <Panel
        title={draft.name}
        right={
          <Segmented
            label="Stack manager view"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'stackup', label: 'Stackup' },
              { value: 'impedance', label: 'Impedance' },
            ]}
          />
        }
      >
        {tab === 'stackup' ? (
          <>
            <div className="flex flex-wrap items-center gap-1 border-b border-line px-2 py-1">
              <button className="btn" onClick={() => insert('dielectric')} disabled={!sel}>
                + Dielectric
              </button>
              <button className="btn" onClick={() => insert('copper')} disabled={!sel}>
                + Copper
              </button>
              <button className="btn" onClick={() => insert('mask')} disabled={!sel}>
                + Mask
              </button>
              <button className="btn" onClick={() => move(-1)} disabled={selIdx <= 0}>
                Move Up
              </button>
              <button className="btn" onClick={() => move(1)} disabled={selIdx < 0 || selIdx >= draft.layers.length - 1}>
                Move Down
              </button>
              <button className="btn" onClick={remove} disabled={!sel}>
                Delete Layer
              </button>
              <span className="ml-auto text-faint">{sel ? 'Layer selected' : 'Click a row to select it'}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="w-[30px]">#</th>
                    <th className="w-[20px]" />
                    <th>Name</th>
                    <th>Material</th>
                    <th>Type</th>
                    <th className="v">Thickness ({unit})</th>
                    <th className="v">Weight</th>
                    <th className="v">Dk</th>
                    <th className="v">Df</th>
                    <th>Role</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {draft.layers.map((l, i) => {
                    const copperNo = draft.layers.slice(0, i + 1).filter((x) => x.kind === 'copper').length;
                    return (
                      <tr key={l.id} className={sel === l.id ? 'sel' : ''} onClick={() => setSel(l.id)}>
                        <td className="tnum text-muted">{l.kind === 'copper' ? copperNo : ''}</td>
                        <td>
                          <span className="inline-block h-[12px] w-[12px] border border-black/40 align-middle" style={{ background: layerSwatch(l, copperNo, draft.layers) }} />
                        </td>
                        <td>
                          <input className="fld w-[150px]" value={l.name} aria-label="Layer name" onChange={(e) => update(i, { name: e.target.value })} />
                        </td>
                        <td className="text-muted">{l.kind === 'copper' ? 'Copper' : l.kind === 'mask' ? 'Solder Resist' : /core/i.test(l.name) ? 'FR-4 core' : 'FR-4 prepreg'}</td>
                        <td>{l.kind === 'copper' ? (l.role === 'plane' ? 'Plane' : 'Signal') : TYPE_LABEL[l.kind]}</td>
                        <td className="v">
                          <Num value={fromMm(l.t, unit)} onChange={(v) => update(i, { t: toMm(v, unit) })} />
                        </td>
                        <td className="v text-muted">{l.kind === 'copper' ? `${fmt(l.t / MM_PER_OZ, 2)} oz` : ''}</td>
                        <td className="v">{l.kind === 'copper' ? <span className="text-faint">—</span> : <Num value={l.er ?? 4} onChange={(v) => update(i, { er: v })} width={52} min={1} inclusive />}</td>
                        <td className="v">{l.kind === 'copper' ? <span className="text-faint">—</span> : <Num value={l.df ?? (l.kind === 'mask' ? MASK_DF : DEFAULT_DF)} onChange={(v) => update(i, { df: v })} width={60} min={0} inclusive />}</td>
                        <td>
                          {l.kind === 'copper' && (
                            <select className="fld" aria-label="Copper role" value={l.role ?? 'signal'} onChange={(e) => update(i, { role: e.target.value as 'signal' | 'plane' })}>
                              <option value="signal">Signal</option>
                              <option value="plane">Plane</option>
                            </select>
                          )}
                        </td>
                        <td className="text-right">
                          {l.kind === 'copper' && l.role !== 'plane' && (
                            <button className="btn" onClick={() => openInImpedance(l.id)} title="Open this layer in the impedance calculator">
                              Impedance →
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Layer</th>
                  <th>Structure</th>
                  <th className="v">H / H2 ({unit})</th>
                  <th className="v">εr</th>
                  <th className="v">
                    W for {fmt(targets.se, 3)} Ω SE ({unit})
                  </th>
                  <th className="v">
                    W for {fmt(targets.diff, 3)} Ω diff @ S {L(targets.s)} ({unit})
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {draft.layers
                  .filter((l) => l.kind === 'copper' && l.role !== 'plane')
                  .map((l) => {
                    const g = geometryForLayer(draft, l.id);
                    const r = imp[l.id] ?? {};
                    const cell = (v: DesignResult | string | undefined) =>
                      v === undefined ? <span className="text-faint">solving…</span> : typeof v === 'string' ? <span className="text-[var(--err-line)]">{v}</span> : L(v.w);
                    return (
                      <tr key={l.id}>
                        <td>{l.name}</td>
                        <td className="text-muted">{g ? (g.type === 'microstrip' ? `Microstrip${g.mask ? ' + mask' : ''}` : g.type === 'stripline' ? 'Stripline' : 'Embedded microstrip') : 'no reference plane'}</td>
                        <td className="v">{g ? `${L(g.h)}${g.h2 !== undefined ? ` / ${L(g.h2)}` : ''}` : '—'}</td>
                        <td className="v">{g ? `${fmt(g.er, 3)}${g.er2 !== undefined ? ` / ${fmt(g.er2, 3)}` : ''}` : '—'}</td>
                        <td className="v">{g ? cell(r.se) : '—'}</td>
                        <td className="v">{g ? cell(r.diff) : '—'}</td>
                        <td className="text-right">
                          {g && (
                            <button className="btn" onClick={() => openInImpedance(l.id)}>
                              Open →
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            <p className="px-2.5 py-1.5 text-faint">Widths from the field solver (normal accuracy) with 0.5 mil etch. Change the targets in the Properties panel.</p>
          </div>
        )}
      </Panel>

      <Panel title="Stack Preview">
        <div className="p-2.5">
          {draft.layers.map((l, i) => {
            const n = draft.layers.slice(0, i + 1).filter((x) => x.kind === 'copper').length;
            return (
              <div
                key={l.id}
                className="flex items-center justify-between px-2 text-[11px]"
                style={{
                  background: l.kind === 'copper' ? 'var(--copper)' : COLOR[l.kind],
                  minHeight: Math.max(7, Math.min(30, (l.t / Math.max(total, 1e-6)) * 420)),
                  color: l.kind === 'dielectric' ? 'var(--ink)' : '#fff',
                  outline: sel === l.id ? '2px solid var(--accent)' : undefined,
                  opacity: l.kind === 'copper' && l.role === 'plane' ? 0.8 : 1,
                }}
                onClick={() => setSel(l.id)}
              >
                <span className="truncate">
                  {l.kind === 'copper' && l.name !== `L${n}` ? `L${n} ` : ''}
                  {l.name}
                  {l.kind === 'copper' ? ` (${l.role === 'plane' ? 'plane' : 'signal'})` : ''}
                </span>
                <span className="tnum">
                  {L(l.t)} {unit}
                </span>
              </div>
            );
          })}
        </div>
      </Panel>
      <Notes items={draft.layers.some((l) => l.kind === 'copper' && l.role === 'plane') ? [] : ['Mark at least one copper layer as a plane so signal layers have a reference.']} />
      <Method />
    </ToolPage>
  );
}

/** Naming and import help: shown below the stack, and rendered into the static page for search engines. */
export function Method() {
  return (
    <>
      <Panel title="Reading the Stackup Names">
        <div className="prose-doc px-4 pt-3">
          <p>
            Library stackups are named by how they are built: <b>the prepreg under the outer layers</b>, then <b>the core thickness</b>, for example “1080 prepreg · core 0.6 mm”.
            “2×2116” means two plies of 2116; “7628+1080” means a 7628 ply plus a 1080 ply. Where two stackups would otherwise share a name, the prepreg between L3 and L4 is added.
          </p>
          <p>
            The numbers are standard glass-fabric styles (IPC-4412), the woven fibreglass inside the prepreg. A finer weave is thinner and resin-rich, so it has a lower Dk; a coarse
            weave is thicker with more glass. The outer prepreg sets the distance from an outer trace to its plane, so it decides the trace width for a given impedance. For fast
            differential pairs, fine weaves (1080, 2116, 3313) reduce the skew caused by the glass weave.
          </p>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Glass style</th>
              <th className="v">Ply thickness in the library</th>
              <th className="v">Dk in the library</th>
              <th>Weave</th>
            </tr>
          </thead>
          <tbody>
            {GLASS_TABLE.map((g) => (
              <tr key={g.style}>
                <td>{g.style}</td>
                <td className="v">
                  {g.tMin === g.tMax ? fmt(g.tMin, 3) : `${fmt(g.tMin, 3)} – ${fmt(g.tMax, 3)}`} mm
                </td>
                <td className="v">{g.dkMin === g.dkMax ? fmt(g.dkMin, 3) : `${fmt(g.dkMin, 3)} – ${fmt(g.dkMax, 3)}`}</td>
                <td className="text-muted">{WEAVE[g.style] ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel title="Importing the Stackup">
        <div className="prose-doc px-4 py-3">
          <h3>KiCad 8, 9 and 10</h3>
          <ol>
            <li>Click Export → KiCad and unzip the download. It contains a small board file and its project file; keep them together.</li>
            <li>In your own board: File → Board Setup → <i>Import Settings from Another Board…</i>, choose the exported .kicad_pcb.</li>
            <li>Tick <i>Board layers and physical stackup</i> and import. Copper layers, thicknesses, Dk, Df and the prepreg plies (as sublayers) appear in Board Setup → Physical Stackup.</li>
          </ol>
          <p>The import replaces the board's layer setup. Tested by loading the exported files in KiCad 10 for 2- to 12-layer stackups.</p>
          <h3>Altium Designer</h3>
          <ol>
            <li>Click Export → Altium to download a .stackupx file.</li>
            <li>In the Layer Stack Manager: File → Load Stackup from File, and choose it.</li>
          </ol>
          <p>
            Every prepreg and core ply becomes its own dielectric layer with thickness, Dk, Df and material. Plane layers are exported as signal layers; change them to planes in Altium
            if you use negative planes. The file follows the published .stackupx structure but could not be tested in Altium here.
          </p>
          <h3>Fusion 360 Electronics and EAGLE</h3>
          <ol>
            <li>Click Export → Fusion 360 / EAGLE to download a .dru design-rules file.</li>
            <li>In the PCB editor: Design Rules → File → Load, and choose it. The layer setup, copper thicknesses and isolation (dielectric) thicknesses are set.</li>
            <li>DRU files cannot carry Dk or Df: enter them in the Layer Stack Manager, using the values in the table above.</li>
          </ol>
          <p>
            Loading a DRU file replaces the board's design rules: rules that are not in the file (clearances, sizes, restring) go back to the defaults, so check them afterwards or load the
            file into a new board first.
          </p>
        </div>
      </Panel>
    </>
  );
}
