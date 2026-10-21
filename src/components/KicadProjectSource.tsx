/**
 * "From KiCad Project": the Properties-panel section through which a tool takes values from the
 * active KiCad project (src/state/kicadProjectStore.ts). It never applies anything by itself: the user
 * chooses, then presses Apply, so the tool's own inputs are only overwritten on that click.
 *
 *   <KicadProjectSource pick={['layer', 'netclass', 'pair']} onApply={(v) => …} />
 *
 * Props
 *   pick         the selectors to show, in this order: 'layer' (a signal layer and its cross-section),
 *                'netclass', 'net', 'pair' (a differential pair), 'net2' (a second net: an aggressor, …)
 *   require      kinds that must be chosen before Apply is enabled (default: ['layer'] when 'layer' is
 *                picked, else none). Every other selector has a "None" choice.
 *   onApply      (values: KicadPickValues) => void, called on Apply. The values (see
 *                src/lib/kicadProjectQueries.ts) carry only what was picked and resolved:
 *                  layer       LayerGeometry: line kind, reference planes, the StackupGeometry `sg` that
 *                              /kicad-project solves, and `impedance` (the Impedance Calculator's
 *                              fields: type, h, er, h2, er2, dl, dl2, t, mask, c1, c2, erm, etch, acc)
 *                  copperT     copper thickness of the layer, mm
 *                  netClass    NetClassSummary: trackWidth, dpWidth, dpGap (mm), nets, pairs
 *                  net, net2   NetSummary: class, total length, vias, width and length per layer
 *                  pair        PairSummary: per-layer width, gap, coupled length; lengths, skew, vias
 *                  pairLayer, netLayer, net2Layer   the pair / net on the chosen layer, when routed there
 *   labels       optional label per kind, e.g. { net: 'Victim net', net2: 'Aggressor net' }
 *   note         optional text under the selectors (say which inputs Apply sets, or what it did)
 *   applyLabel   button text (default 'Apply')
 *   title        section title (default 'From KiCad Project')
 *   defaultOpen  open the section at first (default true)
 *
 * When no project is loaded the section holds one line linking to /kicad-project. Choosing a pair or
 * a net moves the layer to the one it is routed on most and the class to its class; that only changes
 * the selection, not the tool. Values are mm, like every length on the site.
 */
import { useId, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, Section } from './ui';
import { nets, netClasses, netSummary, pairs, pairSummary, resolvePick, signalLayers, type KicadPickKind, type KicadPickSelection, type KicadPickValues } from '../lib/kicadProjectQueries';
import { useKicadProject } from '../state/kicadProjectStore';

export type { KicadPickKind, KicadPickValues } from '../lib/kicadProjectQueries';

const DEFAULT_LABELS: Record<KicadPickKind, string> = { layer: 'Layer', netclass: 'Net class', net: 'Net', pair: 'Pair', net2: 'Second net' };
const leaf = (n: string) => n.slice(n.lastIndexOf('/') + 1) || n;

export function KicadProjectSource({
  pick,
  require,
  onApply,
  labels,
  note,
  applyLabel = 'Apply',
  title = 'From KiCad Project',
  defaultOpen = true,
  layerMode = 'signal',
}: {
  pick: KicadPickKind[];
  require?: KicadPickKind[];
  onApply: (values: KicadPickValues) => void;
  labels?: Partial<Record<KicadPickKind, string>>;
  note?: ReactNode;
  applyLabel?: string;
  title?: string;
  defaultOpen?: boolean;
  /** Current/width tools can use every copper layer, including planes and unreferenced layers. */
  layerMode?: 'signal' | 'copper';
}) {
  const kp = useKicadProject();
  const data = kp.data;
  const uid = useId();
  const [sel, setSel] = useState<KicadPickSelection>({});
  const want = (k: KicadPickKind) => pick.includes(k);
  const required = require ?? (want('layer') ? ['layer' as const] : []);
  const label = (k: KicadPickKind) => labels?.[k] ?? DEFAULT_LABELS[k];

  const options = useMemo(() => {
    if (!data) return null;
    return {
      layers: layerMode === 'copper'
        ? data.board.copper.map((l, i) => ({ name: l.name, referenced: true, kind: i === 0 || i === data.board.copper.length - 1 ? 'outer copper' : 'inner copper', outer: false }))
        : signalLayers(data, { mask: sel.mask ?? true }),
      classes: netClasses(data),
      nets: nets(data),
      pairs: pairs(data),
    };
  }, [data, sel.mask, layerMode]);

  if (!data || !options) {
    return (
      <Section title={title} defaultOpen={defaultOpen}>
        <p className="text-faint">
          {kp.status === 'loading' ? (
            `Reading ${kp.boardName ?? 'the KiCad project'}…`
          ) : (
            <>
              No KiCad project loaded. <Link to="/kicad-project">Load a board</Link> to take the layer, net class or pair from it.
            </>
          )}
        </p>
      </Section>
    );
  }

  // the selection in use: a layer that is no longer a signal layer (roles changed) falls back to the first one with a reference
  const firstLayer = options.layers.find((l) => l.referenced)?.name ?? options.layers[0]?.name;
  const layer = sel.layer && options.layers.some((l) => l.name === sel.layer) ? sel.layer : firstLayer;
  const current: KicadPickSelection = {
    mask: sel.mask ?? true,
    ...(want('layer') && layer ? { layer } : {}),
    ...(want('netclass') && sel.netclass && options.classes.some((c) => c.name === sel.netclass) ? { netclass: sel.netclass } : {}),
    ...(want('net') && sel.net && options.nets.some((n) => n.name === sel.net) ? { net: sel.net } : {}),
    ...(want('net2') && sel.net2 && options.nets.some((n) => n.name === sel.net2) ? { net2: sel.net2 } : {}),
    ...(want('pair') && sel.pair && options.pairs.some((p) => p.name === sel.pair) ? { pair: sel.pair } : {}),
  };
  const has = (k: KicadPickKind) => (k === 'netclass' ? !!current.netclass : !!current[k]);
  const missing = required.filter((k) => !has(k));
  const layerInfo = options.layers.find((l) => l.name === current.layer);
  const layerUnusable = want('layer') && !!current.layer && !layerInfo?.referenced;
  const canApply = !missing.length && !layerUnusable && (!want('layer') || options.layers.length > 0);

  /** Follow a chosen pair or net with the layer it is routed on most and its class (selection only). */
  const follow = (patch: KicadPickSelection, mainLayer: string | undefined, cls: string | undefined): KicadPickSelection => ({
    ...patch,
    ...(want('layer') && mainLayer && options.layers.some((l) => l.name === mainLayer && l.referenced) ? { layer: mainLayer } : {}),
    ...(want('netclass') && cls ? { netclass: cls } : {}),
  });
  const choose = (k: KicadPickKind, value: string) => {
    const v = value || undefined;
    if (k === 'pair' && v) {
      const s = pairSummary(data, v);
      setSel((x) => follow({ ...x, pair: v }, s?.mainLayer, s?.cls.name));
    } else if (k === 'net' && v) {
      const s = netSummary(data, v);
      setSel((x) => follow({ ...x, net: v }, s?.mainLayer, s?.cls.name));
    } else setSel((x) => ({ ...x, [k]: v }));
  };

  const id = (k: string) => `${uid}-${k}`;
  const select = (k: KicadPickKind, value: string | undefined, opts: { value: string; label: string; disabled?: boolean }[], none: boolean) => (
    <div key={k} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
      <label className="text-muted" htmlFor={id(k)}>
        {label(k)}
      </label>
      <select data-report-ignore id={id(k)} className="fld w-[176px]" value={value ?? ''} onChange={(e) => choose(k, e.target.value)}>
        {none && <option value="">None</option>}
        {opts.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <Section title={title} defaultOpen={defaultOpen}>
      <p className="text-faint">
        <Link to="/kicad-project">{data.boardName}</Link> · {data.board.copper.length} copper layers{data.project ? ` · classes from ${data.project.name}` : ''}
      </p>
      {pick.map((k) => {
        if (k === 'layer')
          return select(
            k,
            current.layer,
            options.layers.map((l) => ({ value: l.name, label: `${l.name}${l.referenced ? ` · ${l.kind}` : ' · no reference plane'}`, disabled: !l.referenced })),
            false,
          );
        if (k === 'netclass') return select(k, current.netclass, options.classes.map((c) => ({ value: c.name, label: c.name })), !required.includes(k));
        if (k === 'pair') return select(k, current.pair, options.pairs.map((p) => ({ value: p.name, label: `${leaf(p.name).replace(/[_.]$/, '') || p.name} (${p.cls})` })), !required.includes(k));
        const other = k === 'net' ? current.net2 : current.net;
        return select(
          k,
          k === 'net' ? current.net : current.net2,
          options.nets.filter((n) => n.name !== other).map((n) => ({ value: n.name, label: `${leaf(n.name)}${n.cls !== 'Default' ? ` (${n.cls})` : ''}` })),
          !required.includes(k),
        );
      })}
      {want('layer') && layerInfo?.outer && <Check label="Solder mask over the outer layers" checked={current.mask ?? true} onChange={(v) => setSel((x) => ({ ...x, mask: v }))} />}
      {want('layer') && !options.layers.length && <p className="text-faint">The board has no signal layer with a stackup to take. See the KiCad project page.</p>}
      {note && <div className="text-faint">{note}</div>}
      <div className="flex items-center justify-end gap-2">
        {!canApply && missing.length > 0 && <span className="text-faint">Choose {missing.map((k) => label(k).toLowerCase()).join(' and ')}</span>}
        <button type="button" className="btn" disabled={!canApply} onClick={() => onApply(resolvePick(data, current))}>
          {applyLabel}
        </button>
      </div>
    </Section>
  );
}
