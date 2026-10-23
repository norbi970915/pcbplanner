// The analysis of the active KiCad project that /kicad-project shows: the
// impedance width table of every signal layer, the routing check, the layer roles and the inputs
// they share (targets, pair gap, loss frequency, foil, solder mask, routing targets). Each page keeps
// its own inputs in its address (the same parameter names, so a link can carry them across); the
// board and the layer roles come from the shared project store.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, LenField, NumField, Panel, Row, Section, Segmented, SelectField } from '../ui';
import { FOILS } from '../../data/laminates';
import { stackupItemThickness, versionDate } from '../../lib/kicadImport';
import { saveImportedStackup } from '../../lib/kicadImportClient';
import { impedanceLink, toCsv, toText, type LayerPlan, type Target } from '../../lib/kicadImpedance';
import { layerRoles, type KicadProjectData } from '../../lib/kicadProjectQueries';
import type { CopperRole } from '../../lib/stackups';
import { fmt } from '../../lib/units';
import { kicadProjectStore } from '../../state/kicadProjectStore';
import { RoutingCheckPanel, RoutingTargets } from './RoutingCheck';
import { download, type KicadAnalysis, type KicadAnalysisInputs, type SetKicadInputs } from './useKicadAnalysis';

/** One line about the loaded board: name, layers, thickness, KiCad version, routing. */
export function BoardSummary({ data }: { data: KicadProjectData }) {
  const board = data.board;
  const thick = board.thickness ?? stackupItemThickness(board);
  return (
    <>
      <p className="break-words" role="status">
        <b>{data.boardName}</b> · {board.copper.length} copper layers · board {fmt(thick, 4)} mm · KiCad {board.kicad} file (format {versionDate(board.version)})
        {board.copperFinish ? ` · ${board.copperFinish}` : ''}
        {board.routing ? ` · ${board.routing.tracks + board.routing.arcs} tracks, ${board.routing.vias} vias, ${board.routing.pairs.length} differential ${board.routing.pairs.length === 1 ? 'pair' : 'pairs'}` : ''}
        {data.project ? ` · net classes from ${data.project.name}` : ''}
        <span className="text-faint"> · read in {fmt(Math.max(board.stats.ms, 1), 2)} ms</span>
      </p>
      {!!data.otherBoards.length && (
        <p className="text-faint">
          The folder holds more boards; {data.boardName} was read{data.project ? ' (it has a project file of the same name)' : ''}. Not read: {data.otherBoards.slice(0, 5).join(', ')}
          {data.otherBoards.length > 5 ? ` and ${data.otherBoards.length - 5} more` : ''}.
        </p>
      )}
    </>
  );
}

/** The board has no stackup section: say what to do. */
export function NoStackupNote({ data }: { data: KicadProjectData }) {
  const b = data.board;
  if (b.stackup) return null;
  return (
    <div className="border-l-[3px] border-[var(--note-line)] bg-[var(--note-bg)] px-2.5 py-1.5" role="status">
      {data.boardName} has no physical stackup section{b.version < 20200000 ? ` (it is a KiCad ${b.kicad} file; the stackup editor arrived in KiCad 6)` : ''}. The file gives only the board thickness
      {b.thickness !== undefined ? ` (${b.thickness} mm)` : ''} and {b.copper.length} copper layers, which is not enough for an impedance. Open the board in KiCad 6 or later, check Board Setup → Physical
      Stackup and save it, then load it here again; or enter the layers in the <Link to="/stackup">Layer Stack Manager</Link>.
    </div>
  );
}

/** Layer Roles section of the Properties panel: the detected role of each copper layer, changeable; shared by every page through the project store. */
export function LayerRolesSection({ data, defaultOpen = true }: { data: KicadProjectData; defaultOpen?: boolean }) {
  const { roles, guesses } = layerRoles(data);
  const overrides = data.roleOverrides;
  const store = kicadProjectStore();
  if (!data.board.copper.length) return null;
  return (
    <Section title="Layer Roles" defaultOpen={defaultOpen}>
      {data.board.copper.map((c) => {
        const g = guesses[c.name];
        const changed = overrides[c.name] !== undefined && overrides[c.name] !== g?.role;
        const id = `kr-${c.name.replace(/\W/g, '')}`;
        return (
          <Row key={c.name} label={`${c.name}${changed ? ' (changed)' : ''}`} htmlFor={id} hint={g ? `Detected: ${g.role}, ${g.reason}.` : undefined}>
            <select id={id} className="fld w-[96px]" value={roles[c.name] ?? 'signal'} onChange={(e) => store.setRole(c.name, e.target.value as CopperRole, g?.role)}>
              <option value="signal">Signal</option>
              <option value="plane">Plane</option>
            </select>
          </Row>
        );
      })}
      <p className="text-faint">Detected from the zones on each layer; see the Method section. Change a role if the detection is wrong. The roles are kept with the KiCad project and used by every page that reads it.</p>
      {Object.keys(overrides).length > 0 && (
        <div className="flex justify-end">
          <button type="button" className="btn" onClick={() => store.resetRoles()}>
            Use detected roles
          </button>
        </div>
      )}
    </Section>
  );
}

/** Properties sections of the analysis: targets, pair gap, loss, solder mask, layer roles, routing targets. */
export function AnalysisProperties({ a, p, set, scope = 'all' }: { a: KicadAnalysis; p: KicadAnalysisInputs; set: SetKicadInputs; scope?: 'all' | 'routing' | 'stackup' }) {
  return (
    <>
      {scope !== 'stackup' && a.board?.routing && a.data && <RoutingTargets groups={a.routingCheck.groups} overrides={a.targetOverrides} onChange={a.setTarget} project={a.data.project} projectError={a.data.projectError} />}
      {scope !== 'routing' && <><Section title="Targets">
        <Check label="50 Ω single-ended" checked={p.t50} onChange={(v) => set({ t50: v })} />
        <Check label="90 Ω differential (USB)" checked={p.t90} onChange={(v) => set({ t90: v })} />
        <Check label="100 Ω differential" checked={p.t100} onChange={(v) => set({ t100: v })} />
        <Check label="85 Ω differential (PCIe)" checked={p.t85} onChange={(v) => set({ t85: v })} />
      </Section>
      <Section title="Differential Pairs">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <span className="text-muted">Gap rule</span>
          <Segmented
            label="Gap rule"
            value={p.grule === 'width' ? 'width' : 'fixed'}
            onChange={(v) => set({ grule: v })}
            options={[
              { value: 'fixed', label: 'Fixed gap' },
              { value: 'width', label: 'Gap = W' },
            ]}
          />
        </div>
        {p.grule !== 'width' && <LenField label="Gap" symbol="S" value={p.gap} onChange={(v) => set({ gap: v })} hint="Edge-to-edge spacing of the two traces of a pair. The Layer Stack Manager uses 0.127 mm (5 mil) by default." />}
        {p.grule === 'width' && <p className="text-faint">The gap equals the trace width (S = W), solved together.</p>}
      </Section>
      </>}
      <Section title="Loss">
        <NumField label="Frequency" symbol="f" value={p.f} onChange={(v) => set({ f: v })} unit="GHz" max={100} hint="Usually the Nyquist frequency of the link: half the bit rate for NRZ (PCIe Gen3 8 GT/s → 4 GHz)." />
        <SelectField label="Copper foil" value={a.foil.id} onChange={(v) => set({ foil: v })} options={FOILS.map((f) => ({ value: f.id, label: f.name }))} width={176} />
      </Section>
      <Section title="Solder Mask">
        <Check label="Solder mask over the outer layers" checked={p.mask} onChange={(v) => set({ mask: v })} hint="On: outer traces are coated microstrip with the mask thickness and Dk from the file. Off: bare microstrip, for example under a mask opening." />
      </Section>
      {a.data && <LayerRolesSection data={a.data} defaultOpen={scope !== 'routing'} />}
    </>
  );
}

/** The width (and gap) for each impedance target on every signal layer, with the loss per inch. */
export function ImpedanceByLayerPanel({ a, p }: { a: KicadAnalysis; p: KicadAnalysisInputs }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState('');
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(''), 2500);
    return () => clearTimeout(t);
  }, [copied]);
  const { cells, targets, lossTargets, plans, calc, unit, L, solving, progress } = a;
  if (!calc) return null;
  const lossText = (pl: LayerPlan) =>
    lossTargets
      .map((t) => {
        const c = cells[`${pl.layer.id}|${t.id}`];
        return c?.loss !== undefined ? fmt(c.loss, 3) : c?.err || c?.lossErr ? '—' : '…';
      })
      .join(' / ');
  const widthText = (pl: LayerPlan, t: Target) => {
    const c = cells[`${pl.layer.id}|${t.id}`];
    if (!c) return '…';
    if (c.err) return '—';
    if (!c.d) return '…';
    return t.kind === 'diff' ? `${L(c.d.w)} / ${L(c.d.s ?? 0)}` : L(c.d.w);
  };
  const tableRows = (): string[][] => {
    const headerRow = ['Layer', 'Type', 'Reference planes'];
    for (const t of targets) headerRow.push(...(t.kind === 'diff' ? [`${t.label} W (${unit})`, `${t.label} gap (${unit})`] : [`${t.label} W (${unit})`]));
    for (const t of targets) headerRow.push(`Loss ${t.label} at ${fmt(p.f, 4)} GHz (dB/in)`);
    const rows = [headerRow];
    for (const pl of plans) {
      const r = [pl.layer.name, pl.kind ?? 'no reference plane', pl.refs.join(' / ') || '—'];
      for (const t of targets) {
        const c = cells[`${pl.layer.id}|${t.id}`];
        const w = c?.d ? L(c.d.w) : '';
        r.push(...(t.kind === 'diff' ? [w, c?.d?.s !== undefined ? L(c.d.s) : ''] : [w]));
      }
      for (const t of targets) {
        const c = cells[`${pl.layer.id}|${t.id}`];
        r.push(c?.loss !== undefined ? fmt(c.loss, 3) : '');
      }
      rows.push(r);
    }
    return rows;
  };
  const copyTable = async () => {
    try {
      await navigator.clipboard.writeText(`${a.data?.boardName ?? ''}: impedance by layer (pcbplanner.com)\n${a.settingsLine}\n\n${toText(tableRows())}`);
      setCopied('Copied the table.');
    } catch {
      setCopied('Could not copy: the browser blocked the clipboard.');
    }
  };
  const openInManager = () => navigate(`/stackup?id=${encodeURIComponent(saveImportedStackup(calc))}`);
  const openInterfaceRules = (layerId: string) => navigate(`/interface-rules?${new URLSearchParams({ stk: saveImportedStackup(calc), lay: layerId }).toString()}`);
  return (
    <Panel
      title="Impedance by Layer"
      right={
        solving ? (
          <span className="flex items-center gap-2 text-faint" role="status">
            <progress className="h-[6px] w-[90px]" max={progress.total} value={progress.done} aria-label="Solving progress" />
            {Math.floor(progress.done / 2)} / {progress.total / 2}
          </span>
        ) : undefined
      }
    >
      <table className="tbl">
        <thead>
          <tr>
            <th>Layer</th>
            <th>Type</th>
            <th>Reference plane(s)</th>
            {targets.map((t) => (
              <th key={t.id} className="v">
                {t.label}
                <span className="block font-normal text-faint">{t.kind === 'diff' ? `W / gap (${unit})` : `W (${unit})`}</span>
              </th>
            ))}
            {lossTargets.length > 0 && (
              <th className="v">
                Loss at {fmt(p.f, 4)} GHz
                <span className="block font-normal text-faint">dB/in ({lossTargets.map((t) => t.label).join(' / ')})</span>
              </th>
            )}
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {plans.map((pl) => {
            const first = targets[0];
            const fc = first ? cells[`${pl.layer.id}|${first.id}`] : undefined;
            return (
              <tr key={pl.layer.id}>
                <td className="whitespace-nowrap">{pl.layer.name}</td>
                <td className="whitespace-nowrap">{pl.kind ?? <span className="text-[var(--err-line)]">no reference plane</span>}</td>
                <td className="whitespace-nowrap text-muted">{pl.refs.join(' / ') || '—'}</td>
                {targets.map((t) => {
                  const c = cells[`${pl.layer.id}|${t.id}`];
                  return (
                    <td key={t.id} className="v whitespace-nowrap" title={c?.err}>
                      {!pl.sg ? '—' : c?.err ? <span className="text-[var(--err-line)]">no solution</span> : widthText(pl, t) === '…' ? <span className="text-faint">solving…</span> : widthText(pl, t)}
                    </td>
                  );
                })}
                {lossTargets.length > 0 && <td className="v whitespace-nowrap">{pl.sg ? lossText(pl) : '—'}</td>}
                <td className="whitespace-nowrap text-right">
                  {pl.sg && first && fc?.d && (
                    <Link className="btn" to={impedanceLink(pl.sg, first, fc.d.w, fc.d.s)} title={`Open ${pl.layer.name} in the Impedance Calculator with the ${first.label} line`}>
                      Impedance →
                    </Link>
                  )}{' '}
                  {pl.sg && (
                    <button type="button" className="btn" onClick={() => openInterfaceRules(pl.layer.id)} title="Saves this stackup to My stackups and opens Interface Rules on this layer">
                      Interface rules →
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-2.5 py-2">
        <button type="button" className="btn" onClick={() => void copyTable()} disabled={solving}>
          Copy table
        </button>
        <button type="button" className="btn" onClick={() => download(`${a.baseName}_impedance.csv`, toCsv(tableRows()), 'text/csv')} disabled={solving}>
          Download CSV
        </button>
        <button type="button" className="btn" onClick={openInManager} title="Saves this stackup to My stackups and opens it in the Layer Stack Manager">
          Open in Layer Stack Manager
        </button>
        <span className="text-faint" role="status">
          {copied}
        </span>
      </div>
      <p className="px-2.5 pb-2 text-faint">{a.settingsLine} Widths from the 2D field solver at normal accuracy, as in the Layer Stack Manager.</p>
    </Panel>
  );
}

/** The routing check of the loaded board (shown once the inputs are valid). */
export function RoutingPanel({ a, onShow }: { a: KicadAnalysis; onShow?: (key: string) => void }) {
  if (!a.inputsOk || !a.data) return null;
  return (
    <RoutingCheckPanel
      onShow={onShow}
      checked={a.routingCheck.checked}
      progress={a.routingCheck.progress}
      routing={a.data.board.routing}
      hasProject={!!a.data.project}
      L={a.L}
      unit={a.unit}
      boardName={a.data.boardName}
      baseName={a.baseName}
      download={download}
    />
  );
}
