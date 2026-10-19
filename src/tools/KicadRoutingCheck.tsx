import { Fragment, useEffect, useState } from 'react';
import { NumField, Panel, Section, SelectField } from '../components/ui';
import { INTERFACES } from '../data/interfaces';
import { toCsv, toText } from '../lib/kicadImpedance';
import { COUPLING, PLAIN_TARGETS, targetById, type Fmt, type ItemResult, type KicadProject, type RouteGroup, type RoutingSummary } from '../lib/kicadRouting';
import { routingRows, statusLabel, type CheckedItem } from '../lib/kicadRoutingSolve';

type St = ItemResult['overall'];
const tone = (s: St) => (s === 'ok' ? 'text-ok' : s === 'fail' ? 'text-[var(--err-line)]' : s === 'warn' ? 'text-[var(--accent-ink)]' : 'text-muted');
const mark = (s: St) => (s === 'ok' ? '✓' : s === 'fail' ? '✗' : s === 'warn' ? '⚠' : s === 'pending' ? '…' : '—');
const rank: Record<St, number> = { fail: 0, warn: 1, pending: 2, ok: 3, info: 4 };

/** Status mark; the status is spelled out for screen readers unless the text already says it. */
function Mark({ s, text, says = false }: { s: St; text?: string; says?: boolean }) {
  return (
    // relative: keeps the screen-reader text inside a table that scrolls sideways on phones
    <span className={`relative whitespace-nowrap ${tone(s)}`}>
      <span aria-hidden="true">{mark(s)}</span>
      {!says && <span className="sr-only">{statusLabel(s).replace(/^[^ ]+ /, '')}</span>}
      {text ? ` ${text}` : ''}
    </span>
  );
}

const leaf = (n: string) => n.slice(n.lastIndexOf('/') + 1);

/** Properties section: the target of every pair group and checked net class. */
export function RoutingTargets({
  groups,
  overrides,
  onChange,
  project,
  projectError,
}: {
  groups: RouteGroup[];
  overrides: Record<string, string>;
  onChange: (key: string, id: string | undefined) => void;
  project: KicadProject | null;
  projectError?: string;
}) {
  return (
    <Section title="Routing Targets">
      <p className="text-faint">
        {project
          ? `Net classes from ${project.name} (KiCad ${project.kicad}, ${project.classes.length} ${project.classes.length === 1 ? 'class' : 'classes'}).`
          : projectError
            ? projectError
            : 'No .kicad_pro loaded, so every net is in Default. Drop the project folder, or the .kicad_pcb and .kicad_pro together, to use the net classes.'}
      </p>
      {!groups.length && <p className="text-faint">No differential pairs and no routed nets in a net class other than Default.</p>}
      {groups.map((g) => {
        const id = overrides[g.key] ?? g.suggest;
        const custom = /^c[sd]/.test(id);
        const kind = g.kind === 'pair' ? 'diff' : 'se';
        const options = [
          ...INTERFACES.filter((s) => s.z.kind === kind).map((s) => ({ value: s.id, label: s.name, group: 'Interface' })),
          ...PLAIN_TARGETS.filter((t) => t.kind === kind).map((t) => ({ value: t.id, label: `${t.label} ±10 %`, group: 'Impedance' })),
          { value: 'custom', label: 'Custom impedance ±10 %', group: 'Impedance' },
          { value: 'none', label: 'Not checked', group: 'None' },
        ];
        const changed = overrides[g.key] !== undefined && overrides[g.key] !== g.suggest;
        const sugg = targetById(g.suggest);
        const set = (v: string) => onChange(g.key, v === g.suggest ? undefined : v);
        return (
          <div key={g.key} className="border-b border-line pb-1.5 last:border-b-0">
            <SelectField
              label={`${g.label}${changed ? ' (changed)' : ''}`}
              value={custom ? 'custom' : id}
              width={172}
              options={options}
              onChange={(v) => set(v === 'custom' ? `c${kind === 'diff' ? 'd' : 's'}${kind === 'diff' ? 90 : 50}` : v)}
            />
            {custom && <NumField label="Custom impedance" value={Number(id.slice(2)) || 0} min={10} max={200} unit="Ω" onChange={(z) => set(`c${kind === 'diff' ? 'd' : 's'}${Number(z.toFixed(2))}`)} />}
            <p className="text-faint">
              Suggested: {sugg ? sugg.label : 'not checked'} ({g.why}).
            </p>
          </div>
        );
      })}
      {Object.keys(overrides).some((k) => groups.some((g) => g.key === k)) && (
        <div className="flex justify-end">
          <button type="button" className="btn" onClick={() => groups.forEach((g) => onChange(g.key, undefined))}>
            Use suggested targets
          </button>
        </div>
      )}
    </Section>
  );
}

/** Document panel: summary and the table of every checked pair and net. */
export function RoutingCheckPanel({
  checked,
  progress,
  routing,
  hasProject,
  L,
  unit,
  boardName,
  baseName,
  download,
}: {
  checked: CheckedItem[];
  progress: { done: number; total: number };
  routing: RoutingSummary | undefined;
  hasProject: boolean;
  L: Fmt;
  unit: string;
  boardName: string;
  baseName: string;
  download: (name: string, data: string, type: string) => void;
}) {
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [copied, setCopied] = useState('');
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(''), 2500);
    return () => clearTimeout(t);
  }, [copied]);
  const solving = progress.done < progress.total;

  if (!routing)
    return (
      <Panel title="Routing Check">
        <p className="p-3">This board summary was read by an older version of the page. Load the board again to check its routing.</p>
      </Panel>
    );
  const targeted = checked.filter((c) => c.target);
  const count = (s: St) => targeted.filter((c) => c.res.overall === s).length;
  const pairs = targeted.filter((c) => c.item.kind === 'pair').length;
  const nets = targeted.length - pairs;
  const untargeted = checked.length - targeted.length;
  const sorted = [...checked].sort((a, b) => Number(!a.target) - Number(!b.target) || rank[a.res.overall] - rank[b.res.overall] || a.group.label.localeCompare(b.group.label) || a.item.name.localeCompare(b.item.name));
  const shown = onlyProblems ? sorted.filter((c) => c.res.overall === 'fail' || c.res.overall === 'warn') : sorted;
  const rows = () => routingRows(sorted, L, unit);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${boardName}: routing check (pcbplanner.com)\n\n${toText(rows())}`);
      setCopied('Copied the routing check.');
    } catch {
      setCopied('Could not copy: the browser blocked the clipboard.');
    }
  };

  if (!checked.length)
    return (
      <Panel title="Routing Check">
        <div className="space-y-1.5 p-3">
          <p>
            {routing.tracks + routing.arcs
              ? `${routing.tracks + routing.arcs} tracks on ${routing.nets.length} nets were read, but no differential pair${hasProject ? ' and no net in a class other than Default' : ''} was found.`
              : 'This board has no routed tracks yet.'}
          </p>
          <p className="text-muted">
            Pairs are found with KiCad's own rule: two nets whose names end in + and −, or P and N, followed only by digits or underscores (USB_D+ / USB_D−, PCIE_TX0_P / PCIE_TX0_N).
            {hasProject ? '' : ' To check single-ended nets, load the .kicad_pro with the board (drop the whole project folder) and give their net class a target under Routing Targets.'}
          </p>
        </div>
      </Panel>
    );

  const sk = (mm: number) => L(Math.round(mm * 1000) / 1000);
  const head = (
    <tr>
      <th>Pair / net</th>
      <th>Layer</th>
      <th className="v">
        W / gap<span className="block font-normal text-faint">{unit}</span>
      </th>
      <th className="v">Coupled</th>
      <th>Z and layer result</th>
      <th className="v">
        Skew<span className="block font-normal text-faint">{unit}</span>
      </th>
      <th className="v">
        Length, loss<span className="block font-normal text-faint">{unit}, dB</span>
      </th>
    </tr>
  );
  return (
    <Panel
      title="Routing Check"
      right={
        solving ? (
          <span className="flex items-center gap-2 text-faint" role="status">
            <progress className="h-[6px] w-[90px]" max={progress.total} value={progress.done} aria-label="Routing check progress" />
            {progress.done} / {progress.total}
          </span>
        ) : undefined
      }
    >
      <div className="space-y-1 px-2.5 py-2" role="status">
        <p>
          <b>
            {pairs} {pairs === 1 ? 'pair' : 'pairs'}
            {nets ? ` and ${nets} single-ended ${nets === 1 ? 'net' : 'nets'}` : ''} checked
          </b>
          {targeted.length > 0 && (
            <>
              : <Mark s="ok" says text={`${count('ok')} pass`} />, <Mark s="warn" says text={`${count('warn')} with warnings`} />, <Mark s="fail" says text={`${count('fail')} fail`} />
              {count('pending') ? `, ${count('pending')} solving` : ''}
            </>
          )}
          .{untargeted ? ` ${untargeted} ${untargeted === 1 ? 'pair has' : 'pairs have'} no target and ${untargeted === 1 ? 'is' : 'are'} listed with the measured impedance only.` : ''}
        </p>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
          Show only failures and warnings
        </label>
      </div>
      <table className="tbl">
        <thead>{head}</thead>
        {shown.map((c) => {
          const { item, res, target } = c;
          const ls = res.layers;
          const span = Math.max(1, ls.length);
          const why = [
            ...res.layers.filter((l) => l.status === 'fail' || l.status === 'warn').map((l) => l.reason),
            ...[res.skew, res.length, res.loss].filter((x) => x && (x.status === 'fail' || x.status === 'warn')).map((x) => x!.reason),
            ...res.notes,
          ];
          const title = item.kind === 'pair' ? leaf(item.name).replace(/[_.]$/, '') || item.name : leaf(item.name);
          const itemCell = (
            <td rowSpan={span} className="min-w-[150px] align-top">
              <span className="whitespace-nowrap font-semibold">{title}</span>{' '}
              {res.overall !== 'info' && <Mark s={res.overall} says text={statusLabel(res.overall).replace(/^[^ ]+ /, '')} />}
              {item.pair && <span className="block whitespace-nowrap text-faint">{`${leaf(item.pair.p)} / ${leaf(item.pair.n)}`}</span>}
              <span className="block text-muted">
                {item.cls.name} · {target ? target.label : 'no target'}
              </span>
            </td>
          );
          const tail = (
            <>
              <td rowSpan={span} className="v whitespace-nowrap align-top">
                {res.skew ? (
                  <>
                    {sk(res.skew.mm)} {res.skew.status !== 'info' && <Mark s={res.skew.status} />}
                    {res.skew.ps !== undefined && <span className="block text-faint">{res.skew.ps.toFixed(1)} ps</span>}
                  </>
                ) : (
                  '—'
                )}
              </td>
              <td rowSpan={span} className="v whitespace-nowrap align-top">
                {L(res.len)} {res.length && <Mark s={res.length.status} />}
                <span className="block text-faint">
                  {res.vias} {res.vias === 1 ? 'via' : 'vias'}
                </span>
                {res.loss && (
                  <span className="block">
                    {res.loss.status === 'pending' ? '…' : `${res.loss.db.toFixed(2)} dB`} {res.loss.status !== 'info' && res.loss.status !== 'pending' && <Mark s={res.loss.status} />}
                  </span>
                )}
              </td>
            </>
          );
          return (
            <tbody key={`${c.group.key}|${item.name}`} className="border-t border-line">
              {(ls.length ? ls : [null]).map((l, i) => (
                <tr key={l?.layer ?? 'none'}>
                  {i === 0 && itemCell}
                  {l ? (
                    <>
                      <td className="whitespace-nowrap">
                        {l.layer}
                        <span className="block text-faint">
                          {L(l.len)} {unit}
                        </span>
                      </td>
                      <td className="v whitespace-nowrap">
                        {L(l.w)}
                        {l.wN !== undefined ? `+${L(l.wN)}` : ''}
                        {l.gap !== undefined && item.kind === 'pair' ? ` / ${L(l.gap)}` : ''}
                        {l.wMax - l.wMin > 1e-6 && (
                          <span className="block text-faint">
                            W {L(l.wMin)}–{L(l.wMax)}
                          </span>
                        )}
                      </td>
                      <td className="v whitespace-nowrap">{item.kind === 'pair' && l.len > 0 ? `${Math.round((100 * (l.coupled ?? 0)) / l.len)} %` : '—'}</td>
                      <td className="whitespace-nowrap">
                        <span className="tnum">{l.solve.z !== undefined && (item.kind === 'se' || l.tag !== 'breakout') ? `${l.solve.z.toFixed(1)} Ω ` : l.status === 'pending' ? '… ' : ''}</span>
                        {l.status === 'info' ? <span className="text-faint">{l.tag || (target ? '' : 'no target')}</span> : <Mark s={l.status} text={l.tag} />}
                        {l.change && l.status === 'fail' && <span className="block text-[var(--err-line)]">impedance changes at the layer change</span>}
                      </td>
                    </>
                  ) : (
                    <td colSpan={4} className="text-faint">
                      not routed
                    </td>
                  )}
                  {i === 0 && tail}
                </tr>
              ))}
              {why.length > 0 && (
                <tr>
                  <td colSpan={7} className="text-muted">
                    {why.map((w, i) => (
                      <Fragment key={i}>
                        {i > 0 && <br />}
                        {w}
                      </Fragment>
                    ))}
                  </td>
                </tr>
              )}
            </tbody>
          );
        })}
      </table>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-2.5 py-2">
        <button type="button" className="btn" onClick={() => void copy()} disabled={solving}>
          Copy routing check
        </button>
        <button type="button" className="btn" onClick={() => download(`${baseName}_routing_check.csv`, toCsv(rows()), 'text/csv')} disabled={solving}>
          Download CSV
        </button>
        <span className="text-faint" role="status">
          {copied}
        </span>
      </div>
      <p className="px-2.5 pb-2 text-faint">
        Width and gap are the length-weighted values on each layer; sections more than {COUPLING.gapFactor} × the dominant gap apart count as uncoupled. Skew is the difference of the routed lengths, without
        via barrels and package lengths. Loss at the interface's Nyquist frequency.
      </p>
    </Panel>
  );
}
