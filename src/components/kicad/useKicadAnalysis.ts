// State of the KiCad analysis shown by /kicad-project (see KicadAnalysis.tsx):
// its inputs, the width solves of every signal layer and the routing check, on the solver worker pool.
import { useEffect, useMemo, useState } from 'react';
import { FOILS } from '../../data/laminates';
import type { DesignResult } from '../../lib/design';
import { boardNotes } from '../../lib/kicadImport';
import { designRequest, lossRequest, TARGETS, type ImpedanceSettings, type Target } from '../../lib/kicadImpedance';
import { layerRoles, projectCalc, projectPlans, projectStackup, type KicadProjectData } from '../../lib/kicadProjectQueries';
import { decodeTargets, encodeTargets } from '../../lib/kicadRouting';
import { cachedSolve, useRoutingCheck, type SolveReq } from '../../lib/kicadRoutingSolve';
import { fmt, fromMm } from '../../lib/units';
import { useSettings } from '../../state/settings';

/** Inputs of the analysis, kept in the page address (useUrlState). */
export const KICAD_ANALYSIS_DEFAULTS = { t50: true, t90: true, t100: true, t85: false, grule: 'fixed', gap: 0.127, f: 4, mask: true, foil: 'ed', rt: '', view: 'overview', item: '', pnet: '', pmode: 'quick', pi: 1, pdt: 10, pamb: 25, psrc: '', ploads: '', pv: 0, pmap: 'drop', player: '', pret: '', pmapnet: 'supply', tsrc: '', tamb: 25, tair: 'h', th: 20, teps: 0.9, tkxy: 0.8, tkz: 0.35, tlayer: '', hvnets: '', hvouter: 'B2' };
export type KicadAnalysisInputs = typeof KICAD_ANALYSIS_DEFAULTS;
export type SetKicadInputs = (patch: Partial<KicadAnalysisInputs>) => void;

export interface Cell {
  d?: DesignResult;
  err?: string;
  loss?: number; // dB/in
  lossErr?: string;
}

export function download(name: string, data: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


/** Everything the width table, the routing check and the notes need, solved on the worker pool. */
export function useKicadAnalysis(data: KicadProjectData | null, p: KicadAnalysisInputs, set: SetKicadInputs) {
  const { unit } = useSettings();
  const board = data?.board ?? null;
  const roleInfo = useMemo(() => (data ? layerRoles(data) : { roles: {}, guesses: {} }), [data]);
  const conv = data ? projectStackup(data) : null;
  const imported = conv && 'stackup' in conv ? conv : null;
  const calc = data && imported ? projectCalc(data, p.mask) : null;
  const plans = useMemo(() => (data && calc ? projectPlans(data, p.mask) : []), [data, calc, p.mask]);
  const foil = FOILS.find((f) => f.id === p.foil) ?? FOILS.find((f) => f.id === 'ed') ?? FOILS[0];
  const settings: ImpedanceSettings = useMemo(() => ({ gapRule: p.grule === 'width' ? 'width' : 'fixed', gap: p.gap, fGHz: p.f, rqUm: foil.rq }), [p.grule, p.gap, p.f, foil.rq]);
  const targets = useMemo(() => TARGETS.filter((t) => (t.id === 'se50' ? p.t50 : t.id === 'd90' ? p.t90 : t.id === 'd100' ? p.t100 : p.t85)), [p.t50, p.t90, p.t100, p.t85]);
  const inputsOk = p.gap > 0 && p.f > 0 && p.f <= 100;

  // ---- solve every (layer, target) on the worker pool, then the loss of each designed line ----
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const solveKey = JSON.stringify([plans.map((pl) => [pl.layer.id, pl.sg]), targets.map((t) => t.id), settings, inputsOk]);
  useEffect(() => {
    let alive = true;
    setCells({});
    const jobs = inputsOk && calc ? plans.filter((pl) => pl.sg).flatMap((pl) => targets.map((t) => ({ pl, t }))) : [];
    setProgress({ done: 0, total: jobs.length * 2 });
    const tick = () => alive && setProgress((x) => ({ ...x, done: x.done + 1 }));
    const put = (key: string, patch: Cell) => alive && setCells((m) => ({ ...m, [key]: { ...m[key], ...patch } }));
    for (const { pl, t } of jobs) {
      const key = `${pl.layer.id}|${t.id}`;
      void cachedSolve({ type: 'design', req: designRequest(pl.sg!, t, settings) }).then((r) => {
        tick();
        if (!r.ok || !r.design) {
          put(key, { err: r.ok ? 'no result' : r.error });
          tick();
          return;
        }
        const d = r.design;
        put(key, { d });
        let req: SolveReq;
        try {
          req = { type: 'loss', req: lossRequest(calc!, pl, d.w, d.s, t.kind === 'diff', settings) };
        } catch (e) {
          put(key, { lossErr: e instanceof Error ? e.message : String(e) });
          tick();
          return;
        }
        void cachedSolve(req).then((l) => {
          tick();
          put(key, l.ok && l.loss ? { loss: (l.loss.points[0].alpha / 1000) * 25.4 } : { lossErr: l.ok ? 'no result' : l.error });
        });
      });
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solveKey]);

  // ---- routing check: measured pairs and nets against their targets ----
  const L = useMemo(() => (mm: number) => fmt(fromMm(mm, unit), 4), [unit]);
  const targetOverrides = useMemo(() => decodeTargets(p.rt), [p.rt]);
  const routingCheck = useRoutingCheck({ routing: board?.routing, project: data?.project ?? null, calc, plans, settings, overrides: targetOverrides, L, unit, enabled: !!calc && inputsOk });
  const setTarget = (key: string, id: string | undefined) => {
    const next = { ...targetOverrides };
    if (id === undefined) delete next[key];
    else next[key] = id;
    set({ rt: encodeTargets(next) });
  };

  // ---- notes and errors ----
  const notes: string[] = [];
  if (board) notes.push(...boardNotes(board));
  if (imported) notes.push(...imported.notes.map((n) => n.text));
  const unreferenced = plans.filter((pl) => !pl.sg).map((pl) => pl.layer.name);
  const anyPlane = !!calc?.layers.some((l) => l.kind === 'copper' && l.role === 'plane');
  if (unreferenced.length && anyPlane) notes.push(`${unreferenced.join(', ')}: no plane layer above or below, so there is no reference for an impedance. If a neighbouring layer is a plane, set it to Plane under Layer roles.`);
  if (board && calc && !anyPlane) notes.push('No plane layer was detected. Set the reference planes under Layer roles in the Properties panel.');
  const errors: string[] = [];
  if (conv && 'error' in conv) errors.push(conv.error);
  if (!(p.gap > 0)) errors.push('The pair gap must be greater than 0.');
  if (!(p.f > 0 && p.f <= 100)) errors.push('The loss frequency must be between 0 and 100 GHz.');
  if (!targets.length) errors.push('Choose at least one impedance target.');

  const solving = progress.done < progress.total;
  const seTarget = targets.find((t) => t.kind === 'se');
  const diffTarget = targets.find((t) => t.id === 'd100') ?? targets.find((t) => t.kind === 'diff');
  const lossTargets = [seTarget, diffTarget].filter((t): t is Target => !!t);
  const baseName = (data?.boardName ?? 'board').replace(/\.kicad_pcb$/i, '');
  const settingsLine = `Etch 0.5 mil, ${settings.gapRule === 'width' ? 'gap = trace width' : `fixed gap ${L(settings.gap)} ${unit}`}, solder mask ${p.mask ? 'on' : 'off'}, ${foil.name}, loss at ${fmt(p.f, 4)} GHz.`;

  return { data, board, roleInfo, imported, calc, plans, foil, settings, targets, inputsOk, cells, progress, solving, L, unit, targetOverrides, routingCheck, setTarget, notes, errors, lossTargets, baseName, settingsLine };
}

export type KicadAnalysis = ReturnType<typeof useKicadAnalysis>;

/** Status-bar text for a page that shows the analysis. */
export function analysisStatus(a: KicadAnalysis, busy: boolean, boardName?: string): string {
  const rp = a.routingCheck.progress;
  if (!a.data) return busy ? `Reading ${boardName ?? 'the board'}…` : 'No board loaded';
  const solved = a.progress.total ? ` · ${a.solving ? `solving ${Math.floor(a.progress.done / 2)} of ${a.progress.total / 2}` : `${a.progress.total / 2} lines solved`}` : '';
  return `${a.data.boardName} · ${a.data.board.copper.length} copper layers${solved}${rp.total ? ` · routing check ${rp.done < rp.total ? `${rp.done} of ${rp.total}` : 'done'}` : ''}`;
}
