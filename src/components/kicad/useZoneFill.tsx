// Zones saved without their fill, for the Power and Thermal views: the nets they belong to, the nets the user
// chose to estimate (inputs.zfill, shared by both views), the drawing with those estimated fills added, and
// the note with the choice.
import { useEffect, useMemo, useState } from 'react';
import { Check } from '../ui';
import type { BoardDrawing } from '../../lib/kicadDrawing';
import type { KicadProjectData } from '../../lib/kicadProjectQueries';
import { netClassResolver, netLeaf } from '../../lib/kicadRouting';
import { unfilledNets, type EstimatedFill, type FillRules } from '../../lib/kicadZoneFill';
import { estimatedFills } from '../../lib/kicadZoneFillClient';

export const decodeNets = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => decodeURIComponent(x));
export const encodeNets = (nets: string[]) => nets.map((n) => encodeURIComponent(n)).join(',');

export interface ZoneFill {
  /** The drawing with the estimated fills of the chosen nets, once they are ready (the drawing as read before). */
  d: BoardDrawing | undefined;
  available: { net: string; zones: number }[];
  chosen: string[];
  busy: boolean;
  error?: string;
  result?: EstimatedFill;
  /** Changes when the copper changes: for the solve keys. */
  key: string;
}

export function useZoneFill(data: KicadProjectData, raw: BoardDrawing | undefined, zfill: string): ZoneFill {
  const available = useMemo(() => (raw ? unfilledNets(raw) : []), [raw]);
  const chosen = useMemo(() => decodeNets(zfill).filter((n) => available.some((a) => a.net === n)), [zfill, available]);
  const rules = useMemo((): FillRules => {
    const resolve = netClassResolver(data.project);
    const netClearance: Record<string, number> = {};
    if (raw) for (const n of new Set([...raw.pads, ...raw.tracks, ...raw.vias, ...raw.fills].map((x) => x.net))) {
      const c = resolve(n).clearance;
      if (c !== undefined) netClearance[n] = c;
    }
    return { netClearance, edgeClearance: data.project?.edgeClearance, holeClearance: data.project?.holeClearance };
  }, [data.project, raw]);
  const key = chosen.join('\n');
  const [state, setState] = useState<{ d: BoardDrawing; key: string; result?: EstimatedFill; error?: string } | null>(null);
  useEffect(() => {
    if (!raw || !chosen.length) return;
    let live = true;
    estimatedFills(raw, chosen, rules).then(
      (result) => live && setState({ d: raw, key, result }),
      (e: unknown) => live && setState({ d: raw, key, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, key, rules]);
  const ready = !!raw && chosen.length > 0 && state?.d === raw && state.key === key ? state : null;
  const d = useMemo(() => (raw && ready?.result ? { ...raw, fills: [...raw.fills, ...ready.result.fills] } : raw), [raw, ready]);
  return {
    d,
    available,
    chosen,
    busy: !!raw && chosen.length > 0 && !ready,
    error: ready?.error,
    result: ready?.result,
    key: ready?.result ? `est:${key}` : '',
  };
}

/** The note on unfilled zones, with a choice of the nets whose fill is estimated. */
export function ZoneFillNote({ zf, onChange, what }: { zf: ZoneFill; onChange: (nets: string[]) => void; what: string }) {
  if (!zf.available.length) return null;
  const count = zf.available.reduce((a, x) => a + x.zones, 0);
  const toggle = (net: string, on: boolean) => onChange(on ? [...zf.chosen, net] : zf.chosen.filter((n) => n !== net));
  const all = !!zf.result && zf.chosen.length === zf.available.length;
  return (
    <div className="px-2.5 pb-2">
      <p className="text-[var(--accent-ink)]">
        {count === 1 ? 'A zone' : `${count} zones`} of this board {count === 1 ? 'is' : 'are'} not filled in the file (in KiCad: Fill All Zones, then save).{' '}
        {all ? 'Their copper is estimated here:' : <>The copper of a zone left unfilled is left out and {what}. For a first look, the fill of a net can be estimated here:</>}
      </p>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {zf.available.map((a) => (
          <Check
            key={a.net}
            label={`Estimate ${netLeaf(a.net)} (${a.zones} ${a.zones === 1 ? 'zone' : 'zones'})`}
            checked={zf.chosen.includes(a.net)}
            onChange={(v) => toggle(a.net, v)}
          />
        ))}
      </div>
      {zf.busy && (
        <p className="mt-1 text-muted" role="status">
          Estimating the fill…
        </p>
      )}
      {zf.error && <p className="mt-1 text-[var(--err-line)]">The fill could not be estimated: {zf.error}</p>}
      {zf.result && (
        <p className="mt-1 text-muted">
          <b>Estimated fill</b> of {zf.chosen.map(netLeaf).join(', ')}: worked out here from the zone outlines, clearances, thermal reliefs, minimum width and island removal. It
          is an estimate, not KiCad's fill; for the real copper, fill the zones in KiCad, save and load the board again.
        </p>
      )}
    </div>
  );
}
