import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ToolPage } from '../components/ToolPage';
import { Notes, Panel } from '../components/ui';
import { geometryForLayer, newId, totalThickness, type Layer, type LayerKind, type Stackup } from '../lib/stackups';
import { fmt, fromMm, plain, toMm } from '../lib/units';
import { useSettings } from '../state/settings';
import { stackupStore, useStackups } from '../state/stackupStore';

const KIND_LABEL: Record<LayerKind, string> = { mask: 'Solder mask', copper: 'Copper', dielectric: 'Dielectric' };
const COLOR: Record<LayerKind, string> = { mask: 'var(--mask)', copper: 'var(--copper)', dielectric: 'var(--laminate)' };

function Num({ value, onChange, width = 72 }: { value: number; onChange: (v: number) => void; width?: number }) {
  const [text, setText] = useState(plain(value, 5));
  useEffect(() => setText(plain(value, 5)), [value]);
  return (
    <input
      className="fld text-right"
      style={{ width }}
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const v = Number.parseFloat(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
    />
  );
}

export default function StackupTool() {
  const stackups = useStackups();
  const navigate = useNavigate();
  const { unit } = useSettings();
  const [id, setId] = useState(stackups[0]?.id);
  const current = stackups.find((s) => s.id === id) ?? stackups[0];
  const [draft, setDraft] = useState<Stackup>(current);
  useEffect(() => setDraft(current), [current]);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(current), [draft, current]);
  const readOnly = !!draft.builtin;

  const update = (i: number, patch: Partial<Layer>) => setDraft((d) => ({ ...d, layers: d.layers.map((l, n) => (n === i ? { ...l, ...patch } : l)) }));
  const move = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.layers.length) return d;
      const layers = [...d.layers];
      [layers[i], layers[j]] = [layers[j], layers[i]];
      return { ...d, layers };
    });
  const insert = (i: number, kind: LayerKind) =>
    setDraft((d) => {
      const l: Layer =
        kind === 'copper'
          ? { id: newId(), kind, name: 'Signal', t: 0.035, role: 'signal' }
          : kind === 'mask'
            ? { id: newId(), kind, name: 'Solder mask', t: 0.0305, er: 3.8 }
            : { id: newId(), kind, name: 'Prepreg', t: 0.1, er: 4.2 };
      const layers = [...d.layers];
      layers.splice(i + 1, 0, l);
      return { ...d, layers };
    });
  const remove = (i: number) => setDraft((d) => ({ ...d, layers: d.layers.filter((_, n) => n !== i) }));

  const saveCopy = () => {
    const copy: Stackup = { ...draft, id: `custom-${Date.now().toString(36)}`, name: `${draft.name} (copy)`, builtin: false };
    stackupStore.save(copy);
    setId(copy.id);
  };
  const save = () => stackupStore.save(draft);
  const del = () => {
    stackupStore.remove(draft.id);
    setId(stackups[0]?.id);
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

  const total = totalThickness(draft);
  const copperCount = draft.layers.filter((l) => l.kind === 'copper').length;
  const L = (mm: number) => fmt(fromMm(mm, unit), 4);

  return (
    <ToolPage
      title="Stackup Editor"
      description="Build and store PCB layer stackups (copper, prepreg, core, solder mask), check the total thickness, and open any signal layer in the impedance calculator with the right dielectric heights."
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
        <Panel
          title="Layers"
          right={
            <div className="flex items-center gap-2">
              <select className="fld" aria-label="Stackup" value={draft.id} onChange={(e) => setId(e.target.value)}>
                {stackups.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.builtin ? '' : '★ '}
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          }
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
            <input className="fld min-w-[220px] flex-1" aria-label="Stackup name" value={draft.name} disabled={readOnly} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <button className="btn" onClick={saveCopy}>
              Save as copy
            </button>
            {!readOnly && (
              <>
                <button className="btn btn-primary" disabled={!dirty} onClick={save}>
                  Save
                </button>
                <button className="btn" onClick={del}>
                  Delete
                </button>
              </>
            )}
          </div>
          {readOnly && <p className="px-3 pt-2 text-[12.5px] text-muted">Built-in preset. Edits are temporary; use “Save as copy” to keep them. {draft.note}</p>}
          <div className="overflow-x-auto">
            <table className="tbl text-[13px]">
              <thead>
                <tr>
                  <th className="w-[18px]" />
                  <th>Layer</th>
                  <th>Type</th>
                  <th className="v">Thickness ({unit})</th>
                  <th className="v">εr</th>
                  <th>Copper role</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {draft.layers.map((l, i) => (
                  <tr key={l.id}>
                    <td>
                      <span className="inline-block h-3 w-3 rounded-sm align-middle" style={{ background: COLOR[l.kind] }} />
                    </td>
                    <td>
                      <input className="fld w-[130px]" value={l.name} aria-label="Layer name" onChange={(e) => update(i, { name: e.target.value })} />
                    </td>
                    <td className="text-muted">{KIND_LABEL[l.kind]}</td>
                    <td className="v">
                      <Num value={fromMm(l.t, unit)} onChange={(v) => update(i, { t: toMm(v, unit) })} />
                    </td>
                    <td className="v">{l.kind === 'copper' ? <span className="text-faint">—</span> : <Num value={l.er ?? 4} onChange={(v) => update(i, { er: v })} width={56} />}</td>
                    <td>
                      {l.kind === 'copper' && (
                        <select className="fld" aria-label="Copper role" value={l.role ?? 'signal'} onChange={(e) => update(i, { role: e.target.value as 'signal' | 'plane' })}>
                          <option value="signal">Signal</option>
                          <option value="plane">Plane (reference)</option>
                        </select>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      {l.kind === 'copper' && l.role !== 'plane' && (
                        <button className="btn mr-1" onClick={() => openInImpedance(l.id)} title="Open this layer in the impedance calculator">
                          Impedance →
                        </button>
                      )}
                      <button className="btn px-2" aria-label="Move up" onClick={() => move(i, -1)}>
                        ↑
                      </button>
                      <button className="btn ml-1 px-2" aria-label="Move down" onClick={() => move(i, 1)}>
                        ↓
                      </button>
                      <select className="fld ml-1 w-[70px]" aria-label="Insert below" value="" onChange={(e) => e.target.value && insert(i, e.target.value as LayerKind)}>
                        <option value="">+ add</option>
                        <option value="dielectric">Dielectric</option>
                        <option value="copper">Copper</option>
                        <option value="mask">Mask</option>
                      </select>
                      <button className="btn ml-1 px-2" aria-label="Remove layer" onClick={() => remove(i)}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Summary">
            <table className="tbl">
              <tbody>
                <tr>
                  <td>Copper layers</td>
                  <td className="v">{copperCount}</td>
                </tr>
                <tr>
                  <td>Total thickness</td>
                  <td className="v">
                    {L(total)} {unit}
                  </td>
                </tr>
                <tr>
                  <td>Without mask</td>
                  <td className="v">
                    {L(total - draft.layers.filter((l) => l.kind === 'mask').reduce((a, l) => a + l.t, 0))} {unit}
                  </td>
                </tr>
              </tbody>
            </table>
          </Panel>
          <Panel title="Preview">
            <div className="p-3">
              {draft.layers.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between px-2 text-[11px]"
                  style={{
                    background: COLOR[l.kind],
                    minHeight: Math.max(8, Math.min(34, (l.t / Math.max(total, 1e-6)) * 380)),
                    color: l.kind === 'dielectric' ? 'var(--ink)' : '#fff',
                  }}
                >
                  <span className="truncate">{l.name}</span>
                  <span>{L(l.t)}</span>
                </div>
              ))}
            </div>
          </Panel>
          <Notes items={draft.layers.some((l) => l.kind === 'copper' && l.role === 'plane') ? [] : ['Mark at least one copper layer as a plane so signal layers have a reference.']} />
        </div>
      </div>
    </ToolPage>
  );
}
