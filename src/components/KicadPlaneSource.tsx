/**
 * "From KiCad Project" for the PDN Impedance Calculator: a power net and a ground net of the active KiCad
 * project, the plane pairs they form (zones on adjacent copper layers, src/lib/kicadPlanes.ts) and the
 * plane-pair inputs of the chosen pair. Like KicadProjectSource it applies nothing by itself: the tool's
 * inputs change only on Apply.
 *
 * It has its own selectors rather than KicadProjectSource's because the nets it needs are the nets with
 * zones (a plane net often has no tracks, so the routed-net list misses it), and the ground net starts at
 * the largest ground-like net.
 */
import { useId, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Section } from './ui';
import {
  adjacentByName,
  adjacentCoppers,
  defaultGroundNet,
  isGroundName,
  netLeaf,
  pdnPlaneFields,
  planePairMessage,
  planePairs,
  planePairsFromAreas,
  sameDielectric,
  zoneNets,
  type AdjacentCopper,
  type PdnPlaneFields,
  type PlanePair,
  type ZoneNet,
} from '../lib/kicadPlanes';
import { projectStackup, type KicadProjectData } from '../lib/kicadProjectQueries';
import { fmt, si } from '../lib/units';
import { useKicadBoardGeometry } from '../state/kicadBoardGeometry';
import { useKicadProject } from '../state/kicadProjectStore';

export interface KicadPlaneApplied {
  fields: PdnPlaneFields;
  pairs: PlanePair[];
  c: number; // capacitance of the chosen pair(s), F
  label: string; // the pair(s) in words
}

const pairKey = (p: PlanePair) => `${p.powerLayer}|${p.groundLayer}`;
const cm2 = (mm2: number) => `${fmt(mm2 / 100, 4)} cm²`;

/** Zone nets from the zone areas the parsed board keeps (no geometry): at most six nets per layer. */
function netsFromAreas(d: KicadProjectData): ZoneNet[] {
  const by = new Map<string, ZoneNet>();
  for (const c of d.board.copper)
    for (const n of c.nets) {
      if (!n.net || n.net === '(no net)' || !(n.area > 0)) continue;
      const z = by.get(n.net) ?? { net: n.net, area: 0, layers: [], ground: isGroundName(n.net) };
      z.area += n.area;
      z.layers.push({ layer: c.name, area: n.area });
      by.set(n.net, z);
    }
  return [...by.values()].sort((a, b) => b.area - a.area || a.net.localeCompare(b.net));
}

/** One pair in words: "+3V3 on In4.Cu over GND on In3.Cu: 48 cm², 0.6 mm, εr 4.36". */
function describePair(p: PlanePair, power: string, ground: string): string {
  const plies = p.plies.length > 1 ? `${p.plies.length} plies, ${fmt(p.d, 4)} mm, series εr ${fmt(p.er, 4)}` : p.plies.length ? `${fmt(p.d, 4)} mm of ${p.plies[0].name}, εr ${fmt(p.er, 4)}` : 'no stackup';
  return `${netLeaf(power)} on ${p.powerLayer}, ${netLeaf(ground)} on ${p.groundLayer}: ${p.estimate ? 'at most ' : ''}${cm2(p.area)} overlap; ${plies}`;
}

export function KicadPlaneSource({ onApply, note }: { onApply: (v: KicadPlaneApplied) => void; note?: ReactNode }) {
  const kp = useKicadProject();
  const data = kp.data;
  const geo = useKicadBoardGeometry(data, kp.persisted, kp.storageNote);
  const uid = useId();
  const [sel, setSel] = useState<{ power?: string; ground?: string; pair?: string }>({});

  const base = useMemo(() => {
    if (!data) return null;
    const ps = projectStackup(data);
    const copper = data.board.copper.map((c) => c.name);
    const adjacent: AdjacentCopper[] = ps && 'stackup' in ps ? adjacentCoppers(ps.stackup) : adjacentByName(copper);
    const stackNote = !ps ? 'The board file has no stackup, so the dielectric thickness and εr are not known; only the area is applied.' : 'error' in ps ? `${ps.error} Only the area is applied.` : null;
    return { adjacent, copper, stackNote };
  }, [data]);

  const geom = geo.status === 'ready' ? geo.geom : null;
  const fallback = geo.status === 'unavailable';
  const zn = useMemo(() => (!data || !base ? [] : geom ? zoneNets(geom, base.copper) : fallback ? netsFromAreas(data) : []), [data, base, geom, fallback]);
  const ground = sel.ground && zn.some((n) => n.net === sel.ground) ? sel.ground : defaultGroundNet(zn);
  // the pairs every other zone net forms with the ground net
  const byPower = useMemo(() => {
    const m = new Map<string, PlanePair[]>();
    if (!data || !base || !ground) return m;
    for (const n of zn) {
      if (n.net === ground) continue;
      m.set(n.net, geom ? planePairs(geom, base.adjacent, n.net, ground) : fallback ? planePairsFromAreas(data.board.copper, base.adjacent, n.net, ground) : []);
    }
    return m;
  }, [data, base, geom, fallback, zn, ground]);

  if (!data || !base) {
    return (
      <Section title="From KiCad Project">
        <p className="text-faint">
          {kp.status === 'loading' ? (
            `Reading ${kp.boardName ?? 'the KiCad project'}…`
          ) : (
            <>
              No KiCad project loaded. <Link to="/kicad-project">Load a board</Link> to take the plane pair from its zones and stackup.
            </>
          )}
        </p>
      </Section>
    );
  }

  const candidates = zn.filter((n) => n.net !== ground);
  const totalC = (net: string) => (byPower.get(net) ?? []).reduce((a, p) => a + (Number.isFinite(p.c) ? p.c : p.area), 0);
  const bestPower = ground ? [...candidates].sort((a, b) => totalC(b.net) - totalC(a.net) || b.area - a.area)[0]?.net : undefined;
  const power = sel.power && candidates.some((n) => n.net === sel.power) ? sel.power : bestPower;
  const pairs = (power && byPower.get(power)) || [];
  const summable = sameDielectric(pairs);
  const chosen: PlanePair[] = sel.pair === 'all' && summable ? pairs : [pairs.find((p) => pairKey(p) === sel.pair) ?? pairs[0]].filter((p): p is PlanePair => !!p);
  const fields = pdnPlaneFields(chosen);
  const c = chosen.reduce((a, p) => a + p.c, 0);
  const loading = geo.status === 'loading' || geo.status === 'none';

  const id = (k: string) => `${uid}-${k}`;
  const select = (k: string, label: string, value: string, opts: { value: string; label: string }[], onChange: (v: string) => void) => (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
      <label className="text-muted" htmlFor={id(k)}>
        {label}
      </label>
      <select data-report-ignore id={id(k)} className="fld w-[176px]" value={value} onChange={(e) => onChange(e.target.value)}>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
  const netLabel = (n: ZoneNet) => `${netLeaf(n.net)} (${n.layers.length} layer${n.layers.length > 1 ? 's' : ''})`;

  const message = loading ? 'Reading the zone outlines…' : planePairMessage(zn, power, ground, pairs);

  const apply = () => {
    if (!fields || !power || !ground) return;
    const label = chosen.length > 1 ? `${chosen.length} pairs of ${netLeaf(power)} and ${netLeaf(ground)} (${chosen.map((p) => `${p.upper}/${p.lower}`).join(', ')})` : `${netLeaf(power)} on ${chosen[0].powerLayer}, ${netLeaf(ground)} on ${chosen[0].groundLayer}`;
    onApply({ fields, pairs: chosen, c, label });
  };

  return (
    <Section title="From KiCad Project">
      <p className="text-faint">
        <Link to="/kicad-project">{data.boardName}</Link> · {data.board.copper.length} copper layers
      </p>
      {!loading && zn.length > 0 && (
        <>
          {select('power', 'Power net', power ?? '', candidates.map((n) => ({ value: n.net, label: netLabel(n) })), (v) => setSel((x) => ({ ...x, power: v, pair: undefined })))}
          {select('ground', 'Ground net', ground ?? '', zn.map((n) => ({ value: n.net, label: netLabel(n) })), (v) => setSel((x) => ({ ...x, ground: v, pair: undefined })))}
          {pairs.length > 1 &&
            select(
              'pair',
              'Plane pair',
              chosen.length > 1 ? 'all' : chosen[0] ? pairKey(chosen[0]) : '',
              [...pairs.map((p) => ({ value: pairKey(p), label: `${p.upper} / ${p.lower} · ${cm2(p.area)}` })), ...(summable ? [{ value: 'all', label: `All ${pairs.length} (summed)` }] : [])],
              (v) => setSel((x) => ({ ...x, pair: v })),
            )}
        </>
      )}
      {message && <p className="text-faint">{message}</p>}
      {chosen.length > 0 && power && ground && (
        <div className="text-faint">
          {chosen.map((p) => (
            <p key={pairKey(p)}>{describePair(p, power, ground)}.</p>
          ))}
          {Number.isFinite(c) && <p>Plane capacitance {si(c, 'F')}{chosen.length > 1 ? ' (sum)' : ''}.</p>}
          {pairs.length > 1 && !summable && <p>The calculator models one plane pair, and these pairs have different dielectrics, so choose one.</p>}
        </div>
      )}
      {fallback && geo.status === 'unavailable' && pairs.length > 0 && (
        <p className="text-faint">The zone outlines could not be read ({geo.reason}), so the overlap is taken as the smaller of the two zone areas: an upper bound.</p>
      )}
      {base.stackNote && pairs.length > 0 && <p className="text-faint">{base.stackNote}</p>}
      {note && <div className="text-faint">{note}</div>}
      <div className="flex items-center justify-end gap-2">
        <button type="button" className="btn" disabled={!fields} onClick={apply}>
          Apply
        </button>
      </div>
    </Section>
  );
}
