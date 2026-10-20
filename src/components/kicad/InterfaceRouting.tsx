// "Your routing" on the Interface Design Rules page: a pair of the active KiCad project checked against
// the interface the page shows, with the same requests, solve cache and checkItem as the routing check
// of /kicad-project (src/lib/kicadInterfaceRules.ts), beside the width and gap the page designs.
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Panel } from '../ui';
import type { InterfaceSpec } from '../../data/interfaces';
import { freqLabel } from '../../lib/interfaceRules';
import type { PairCheckPlan } from '../../lib/kicadInterfaceRules';
import type { KicadProjectData } from '../../lib/kicadProjectQueries';
import { itemReasons, type ItemResult } from '../../lib/kicadRouting';
import { statusLabel } from '../../lib/kicadRoutingSolve';
import type { KicadProjectStatus } from '../../state/kicadProjectStore';

type St = ItemResult['overall'];
const tone = (s: St) => (s === 'ok' ? 'text-ok' : s === 'fail' ? 'text-[var(--err-line)]' : s === 'warn' ? 'text-[var(--accent-ink)]' : 'text-muted');
const mark = (s: St) => (s === 'ok' ? '✓' : s === 'fail' ? '✗' : s === 'warn' ? '⚠' : s === 'pending' ? '…' : '—');
const leaf = (n: string) => n.slice(n.lastIndexOf('/') + 1) || n;

/** Status mark; the status is spelled out for screen readers unless the text already says it. */
function Mark({ s, text, says = false }: { s: St; text?: string; says?: boolean }) {
  return (
    <span className={`relative ${tone(s)}`}>
      <span aria-hidden="true">{mark(s)}</span>
      {!says && <span className="sr-only">{statusLabel(s).replace(/^[^ ]+ /, '')}</span>}
      {text ? ` ${text}` : ''}
    </span>
  );
}

export interface Designed {
  w: number;
  s?: number;
  fast?: boolean; // from the layer list (fast accuracy)
}

/** Results panel: the routed pair against the interface, next to the designed width and gap. */
export function YourRoutingPanel({
  status,
  data,
  pair,
  spec,
  plan,
  res,
  designed,
  designedNote,
  mask,
  L,
  onClear,
}: {
  status: KicadProjectStatus;
  data: KicadProjectData | null;
  pair: string;
  spec: InterfaceSpec;
  plan: PairCheckPlan | null;
  res: ItemResult | null;
  /** The width (and gap) this page designs for the interface on a layer of the project stackup; null when it is not known. */
  designed: (layer: string) => Designed | null;
  /** Why no designed values are shown, when they are not. */
  designedNote?: string;
  mask: boolean;
  L: (mm: number) => string; // with the unit
  onClear: () => void;
}) {
  const title = `Your routing: ${leaf(pair).replace(/[_.]$/, '') || pair}`;
  const clear = (
    <button type="button" className="btn" onClick={onClear}>
      Stop comparing
    </button>
  );
  const message = (text: ReactNode) => (
    <Panel title={title} className="mt-3" right={clear}>
      <p className="px-2.5 py-2">{text}</p>
    </Panel>
  );
  if (!data)
    return message(
      status === 'loading' ? (
        'Reading the KiCad project…'
      ) : (
        <>
          No KiCad project is loaded. <Link to="/kicad-project">Load the board</Link> to compare {pair} with {spec.name}.
        </>
      ),
    );
  if (!plan || !res) return message(`${pair} is not a differential pair in ${data.boardName}.`);
  const { item, target } = plan;
  if (!res.layers.length) return message(`${leaf(item.pair!.p)} / ${leaf(item.pair!.n)} are not routed yet: there are no tracks on either net, so there is nothing to compare.`);

  const kindOf = (layer: string) => plan.plans.find((p) => p.layer.name === layer)?.kind;
  const zWant = target ? (target.tol === '±10 %' ? `${target.z} Ω ±10 %` : `${target.min}–${target.max} Ω`) : '—';
  // W / S with the unit once (L gives '<number> <unit>')
  const num = (mm: number) => L(mm).split(' ')[0];
  const u = L(1).split(' ').slice(1).join(' ');
  const nb = '\u00a0'; // no break inside a W / S figure
  const geo = (w: number, s?: number, wN?: number) => `${wN !== undefined ? `${num(w)}+${num(wN)}` : num(w)}${s !== undefined ? `${nb}/${nb}${num(s)}` : ''}${nb}${u}`;
  const why = itemReasons(res);
  const skewSpec = spec.intraPairMm !== undefined ? `${Number((spec.intraPairMm / 0.0254).toPrecision(3))} mil` : spec.intraPairPs !== undefined ? `${spec.intraPairPs} ps` : undefined;

  return (
    <Panel title={title} className="mt-3" right={clear}>
      <div className="space-y-1 px-2.5 py-2" role="status">
        <p>
          {res.overall !== 'info' && (
            <>
              <Mark s={res.overall} says text={statusLabel(res.overall).replace(/^[^ ]+ /, '')} />
              {' · '}
            </>
          )}
          {leaf(item.pair!.p)} / {leaf(item.pair!.n)} · class {item.cls.name} · {target ? `checked against ${spec.name}` : plan.kindMismatch ? `${spec.name} is single-ended, so the pair has no impedance target` : 'no target'}
        </p>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Check</th>
            <th className="v">Routed</th>
            <th className="v">{spec.name}</th>
          </tr>
        </thead>
        <tbody>
          {res.layers.map((l) => {
            const d = designed(l.layer);
            const coupledPct = l.len > 0 ? Math.round((100 * (l.coupled ?? 0)) / l.len) : 0;
            const z = l.solve.z !== undefined && l.tag !== 'breakout' ? `${l.solve.z.toFixed(1)} Ω` : l.status === 'pending' ? '' : '—';
            return (
              <tr key={l.layer}>
                <td>
                  Impedance on {l.layer}
                  <div className="text-faint">
                    {kindOf(l.layer) ?? 'no reference plane'} · {L(l.len)}
                  </div>
                </td>
                <td className="v">
                  {z} {l.status !== 'info' && <Mark s={l.status} />}
                  <div className="whitespace-normal text-faint">
                    {geo(l.w, l.gap, l.wN)}, {`${coupledPct}${nb}%`} coupled
                  </div>
                  {l.tag && l.tag !== 'in range' && <div className={`whitespace-normal ${l.status === 'info' ? 'text-faint' : tone(l.status)}`}>{l.tag}</div>}
                </td>
                <td className="v">
                  {zWant}
                  <div className="whitespace-normal text-faint">{d ? `designed ${geo(d.w, d.s)}${d.fast ? ' (fast)' : ''}` : 'designed —'}</div>
                </td>
              </tr>
            );
          })}
          {res.skew && (
            <tr>
              <td>
                Intra-pair skew
                <div className="text-faint">routed lengths, P vs N</div>
              </td>
              <td className="v">
                {L(Math.round(res.skew.mm * 1000) / 1000)} {res.skew.status !== 'info' && <Mark s={res.skew.status} />}
                {res.skew.ps !== undefined && <div className="text-faint">{res.skew.ps.toFixed(1)} ps</div>}
              </td>
              <td className="v">
                {res.skew.limitMm !== undefined ? `≤ ${L(res.skew.limitMm)}` : skewSpec ? `≤ ${skewSpec}` : 'no limit'}
                {skewSpec && res.skew.limitMm !== undefined && (
                  <div className="text-faint">
                    {skewSpec}
                    {spec.intraPairGuideline || spec.intraPairBudgetPs !== undefined ? ' guideline' : ''}
                  </div>
                )}
                {spec.intraPairBudgetPs !== undefined && <div className="text-faint">spec ≤ {spec.intraPairBudgetPs} ps</div>}
              </td>
            </tr>
          )}
          <tr>
            <td>
              Length
              <div className="text-faint">longer net</div>
            </td>
            <td className="v">
              {L(res.len)} {res.length && <Mark s={res.length.status} />}
              <div className="text-faint">
                {res.vias} {res.vias === 1 ? 'via' : 'vias'}
              </div>
            </td>
            <td className="v">{spec.maxLenMm !== undefined ? `≤ ${L(spec.maxLenMm)}` : 'no limit'}</td>
          </tr>
          {res.loss && (
            <tr>
              <td>
                Insertion loss
                <div className="text-faint">at {freqLabel(plan.lossGHz)}, traces only</div>
              </td>
              <td className="v">
                {res.loss.status === 'pending' ? <Mark s="pending" /> : `${res.loss.db.toFixed(2)} dB`} {res.loss.status !== 'info' && res.loss.status !== 'pending' && <Mark s={res.loss.status} />}
              </td>
              <td className="v">{spec.lossBudgetDb !== undefined ? `≤ ${spec.lossBudgetDb} dB` : 'no budget'}</td>
            </tr>
          )}
        </tbody>
      </table>
      {why.length > 0 && (
        <p className="px-2.5 py-1.5 text-muted">
          {why.map((w, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              {w}
            </Fragment>
          ))}
        </p>
      )}
      <p className="px-2.5 pb-2 text-faint">
        Measured and solved as the <Link to="/kicad-project">routing check</Link> does it on the project's own stackup (solder mask {mask ? 'on' : 'off'}, ED copper, loss at the interface's Nyquist frequency), so the impedance, skew and loss are the ones it shows for the same target.
        Width / gap are the length-weighted values on each layer. {designedNote ?? 'Designed values are this page’s width and spacing for the interface on that layer (the selected layer at the chosen accuracy, the others from the layer list at fast accuracy).'}
      </p>
    </Panel>
  );
}
