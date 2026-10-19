import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { StackPreview } from '../components/StackPreview';
import { ToolPage } from '../components/ToolPage';
import { Check, LenField, Notes, NumField, Panel, Row, Section, Segmented, SelectField } from '../components/ui';
import { FOILS } from '../data/laminates';
import type { DesignResult } from '../lib/design';
import { boardNotes, guessRoles, kicadStackup, PLANE_RULE, stackupItemThickness, versionDate, type KicadBoard } from '../lib/kicadImport';
import { droppedFiles, inputFiles, readKicadFile, saveImportedStackup, type ProjectFile } from '../lib/kicadImportClient';
import { calcStackup, designRequest, impedanceLink, lossRequest, planLayers, TARGETS, toCsv, toText, type ImpedanceSettings, type LayerPlan, type Target } from '../lib/kicadImpedance';
import { COUPLING, decodeTargets, encodeTargets, parseKicadProject, pickProjectFiles, type KicadProject } from '../lib/kicadRouting';
import { cachedSolve, useRoutingCheck, type SolveReq } from '../lib/kicadRoutingSolve';
import type { CopperRole } from '../lib/stackups';
import { fmt, fromMm } from '../lib/units';
import { useSettings } from '../state/settings';
import { useTrackedState } from '../state/useTrackedState';
import { useUrlState } from '../state/useUrlState';
import { RoutingCheckPanel, RoutingTargets } from './KicadRoutingCheck';

const DEFAULTS = { t50: true, t90: true, t100: true, t85: false, grule: 'fixed', gap: 0.127, f: 4, mask: true, foil: 'ed', rt: '' };
const EXAMPLE_URL = '/examples/pcbplanner-example-6layer.kicad_pcb';
const EXAMPLE_PRO_URL = '/examples/pcbplanner-example-6layer.kicad_pro';
const STORE_KEY = 'pcbplanner:kicad-impedance:board';

interface Loaded {
  name: string;
  board: KicadBoard;
  /** Net classes from the .kicad_pro loaded with the board (never the file itself). */
  project?: KicadProject | null;
  projectError?: string;
  /** Other .kicad_pcb files found in a dropped folder. */
  otherBoards?: string[];
}

/** The extracted board summary (not the file) is kept for this tab, so returning to the page keeps the result. */
function readStored(): Loaded | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null');
    return v && typeof v.name === 'string' && v.board && Array.isArray(v.board.copper) ? (v as Loaded) : null;
  } catch {
    return null;
  }
}
function writeStored(v: Loaded | null) {
  try {
    if (v) sessionStorage.setItem(STORE_KEY, JSON.stringify(v));
    else sessionStorage.removeItem(STORE_KEY);
  } catch {
    /* storage unavailable: the page still works for this visit */
  }
}

type Req = SolveReq;

interface Cell {
  d?: DesignResult;
  err?: string;
  loss?: number; // dB/in
  lossErr?: string;
}

function download(name: string, data: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function KicadImpedance() {
  const [p, set, reset] = useUrlState(DEFAULTS);
  const { unit } = useSettings();
  const navigate = useNavigate();
  const [loaded, , replaceLoaded] = useTrackedState<Loaded | null>('kicad-board', readStored, Object.is);
  const [overrides, setOverrides, replaceOverrides] = useTrackedState<Record<string, CopperRole>>('kicad-roles', {});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const readSeq = useRef(0);

  /** Open a board, or a whole project: the .kicad_pcb and, when there is one, its .kicad_pro. */
  const open = async (files: ProjectFile[]) => {
    const id = ++readSeq.current;
    setError(null);
    setBusy(true);
    try {
      const pick = pickProjectFiles(files);
      if (!pick.board) {
        const one = files.length === 1 ? files[0].name : null;
        throw new Error(
          one
            ? `${one} is not a .kicad_pcb file. Choose the board file of a KiCad project (KiCad 6 to 10), or the whole project folder.`
            : `No .kicad_pcb file among the ${files.length} files. Choose the board file of a KiCad project (KiCad 6 to 10), or the whole project folder.`,
        );
      }
      const [board, project] = await Promise.all([
        readKicadFile(pick.board.file),
        pick.project
          ? pick.project.file.text().then(
              (t) => ({ project: parseKicadProject(t, pick.project!.name) }),
              () => ({ error: `${pick.project!.name} could not be read.` }),
            )
          : Promise.resolve(null),
      ]);
      if (id !== readSeq.current) return;
      let proj: KicadProject | null = null;
      let projectError: string | undefined;
      if (project && 'project' in project) proj = project.project;
      else if (project) projectError = project.error;
      const next: Loaded = { name: pick.board.name, board, project: proj, projectError, otherBoards: pick.otherBoards };
      replaceLoaded(next);
      replaceOverrides({});
      writeStored(next);
    } catch (e) {
      if (id === readSeq.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === readSeq.current) setBusy(false);
    }
  };
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });
  const tryExample = async () => {
    setBusy(true);
    try {
      const [r, rp] = await Promise.all([fetch(EXAMPLE_URL), fetch(EXAMPLE_PRO_URL)]);
      if (!r.ok) throw new Error(`The example could not be loaded (HTTP ${r.status}).`);
      const named = (b: Blob, name: string): ProjectFile => {
        const file = new File([b], name);
        return { file, name, path: name, size: file.size };
      };
      const files = [named(await r.blob(), 'pcbplanner-example-6layer.kicad_pcb')];
      if (rp.ok) files.push(named(await rp.blob(), 'pcbplanner-example-6layer.kicad_pro'));
      await openRef.current(files);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  // drag and drop anywhere on the page
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      if (!e.dataTransfer) return;
      // the entries are only available during the event: start walking the folder now
      void droppedFiles(e.dataTransfer).then(
        (files) => (files.length ? openRef.current(files) : setError('The drop held no .kicad_pcb file. Drop the board file of a KiCad project, or the whole project folder.')),
        () => setError('The dropped folder could not be read in this browser. Choose the files instead.'),
      );
    };
    document.addEventListener('dragenter', enter);
    document.addEventListener('dragover', over);
    document.addEventListener('dragleave', leave);
    document.addEventListener('drop', drop);
    return () => {
      document.removeEventListener('dragenter', enter);
      document.removeEventListener('dragover', over);
      document.removeEventListener('dragleave', leave);
      document.removeEventListener('drop', drop);
    };
  }, []);

  const board = loaded?.board ?? null;
  const guesses = useMemo(() => (board ? guessRoles(board) : {}), [board]);
  const roles = useMemo(() => {
    const r: Record<string, CopperRole> = {};
    for (const [k, g] of Object.entries(guesses)) r[k] = overrides[k] ?? g.role;
    return r;
  }, [guesses, overrides]);
  const conv = useMemo(() => {
    if (!board || !loaded) return null;
    try {
      return { ok: kicadStackup(board, { name: loaded.name.replace(/\.kicad_pcb$/i, '') + ' (KiCad)', roles }) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [board, loaded, roles]);
  const imported = conv?.ok ?? null;
  const calc = useMemo(() => (imported ? calcStackup(imported.stackup, p.mask) : null), [imported, p.mask]);
  const plans = useMemo(() => (calc ? planLayers(calc) : []), [calc]);
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
        let req: Req;
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

  const L = (mm: number) => fmt(fromMm(mm, unit), 4);

  // ---- routing check: measured pairs and nets against their targets ----
  const Lr = useMemo(() => (mm: number) => fmt(fromMm(mm, unit), 4), [unit]);
  const targetOverrides = useMemo(() => decodeTargets(p.rt), [p.rt]);
  const routingCheck = useRoutingCheck({ routing: board?.routing, project: loaded?.project ?? null, calc, plans, settings, overrides: targetOverrides, L: Lr, unit, enabled: !!calc && inputsOk });
  const setTarget = (key: string, id: string | undefined) => {
    const next = { ...targetOverrides };
    if (id === undefined) delete next[key];
    else next[key] = id;
    set({ rt: encodeTargets(next) });
  };
  const solving = progress.done < progress.total;
  const seTarget = targets.find((t) => t.kind === 'se');
  const diffTarget = targets.find((t) => t.id === 'd100') ?? targets.find((t) => t.kind === 'diff');
  const lossTargets = [seTarget, diffTarget].filter((t): t is Target => !!t);
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

  // ---- table export ----
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
  const baseName = (loaded?.name ?? 'board').replace(/\.kicad_pcb$/i, '');
  const settingsLine = `Etch 0.5 mil, ${settings.gapRule === 'width' ? 'gap = trace width' : `fixed gap ${L(settings.gap)} ${unit}`}, solder mask ${p.mask ? 'on' : 'off'}, ${foil.name}, loss at ${fmt(p.f, 4)} GHz.`;
  const copyTable = async () => {
    try {
      await navigator.clipboard.writeText(`${loaded?.name ?? ''}: impedance by layer (pcbplanner.com)\n${settingsLine}\n\n${toText(tableRows())}`);
      setCopied('Copied the table.');
    } catch {
      setCopied('Could not copy: the browser blocked the clipboard.');
    }
  };
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(''), 2500);
    return () => clearTimeout(t);
  }, [copied]);
  const openInManager = () => {
    if (calc) navigate(`/stackup?id=${encodeURIComponent(saveImportedStackup(calc))}`);
  };
  const openInterfaceRules = (layerId: string) => {
    if (calc) navigate(`/interface-rules?${new URLSearchParams({ stk: saveImportedStackup(calc), lay: layerId }).toString()}`);
  };

  const onReset = () => {
    ++readSeq.current;
    reset();
    replaceLoaded(null);
    replaceOverrides({});
    writeStored(null);
    setError(null);
    setBusy(false);
  };

  // ---- notes ----
  const notes: string[] = [];
  if (board) notes.push(...boardNotes(board));
  if (imported) notes.push(...imported.notes.map((n) => n.text));
  const unreferenced = plans.filter((pl) => !pl.sg).map((pl) => pl.layer.name);
  const anyPlane = !!calc?.layers.some((l) => l.kind === 'copper' && l.role === 'plane');
  if (unreferenced.length && anyPlane) notes.push(`${unreferenced.join(', ')}: no plane layer above or below, so there is no reference for an impedance. If a neighbouring layer is a plane, set it to Plane under Layer roles.`);
  if (board && calc && !anyPlane) notes.push('No plane layer was detected. Set the reference planes under Layer roles in the Properties panel.');
  const errors: string[] = [];
  if (error) errors.push(error);
  if (conv?.error) errors.push(conv.error);
  if (!(p.gap > 0)) errors.push('The pair gap must be greater than 0.');
  if (!(p.f > 0 && p.f <= 100)) errors.push('The loss frequency must be between 0 and 100 GHz.');
  if (!targets.length) errors.push('Choose at least one impedance target.');

  const coppers = board?.copper ?? [];
  // the drop zone: in the document on wide screens; on phones, where the inputs come first, at the top of the inputs
  const dropZone = (compact: boolean) => (
    <div className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed border-line px-4 text-center ${compact ? 'py-4' : 'py-10'}`}>
      <p className="text-[15px] font-semibold">Drop your .kicad_pcb file or the whole KiCad project folder</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className="btn btn-primary" onClick={() => fileInput.current?.click()} disabled={busy} title="One .kicad_pcb, or the .kicad_pcb and .kicad_pro together">
          Choose files
        </button>
        <button type="button" className="btn" onClick={() => folderInput.current?.click()} disabled={busy}>
          Choose folder
        </button>
        <button type="button" className="btn" onClick={() => void tryExample()} disabled={busy}>
          Try an example
        </button>
      </div>
      <p className="text-muted">The files stay in your browser — nothing is uploaded.</p>
      <p className="text-faint">
        {busy
          ? 'Reading the board…'
          : 'KiCad 6 to 10. From the .kicad_pcb: stackup, layers, outline, zones, tracks and vias; from the .kicad_pro (optional): the net classes. Other files are ignored.'}
      </p>
    </div>
  );
  const properties = (
    <>
      <div className="lg:hidden">
        <Section title="Board File">{dropZone(true)}</Section>
      </div>
      <Section title="Targets">
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
      <Section title="Loss">
        <NumField label="Frequency" symbol="f" value={p.f} onChange={(v) => set({ f: v })} unit="GHz" max={100} hint="Usually the Nyquist frequency of the link: half the bit rate for NRZ (PCIe Gen3 8 GT/s → 4 GHz)." />
        <SelectField label="Copper foil" value={foil.id} onChange={(v) => set({ foil: v })} options={FOILS.map((f) => ({ value: f.id, label: f.name }))} width={176} />
      </Section>
      <Section title="Solder Mask">
        <Check label="Solder mask over the outer layers" checked={p.mask} onChange={(v) => set({ mask: v })} hint="On: outer traces are coated microstrip with the mask thickness and Dk from the file. Off: bare microstrip, for example under a mask opening." />
      </Section>
      {coppers.length > 0 && (
        <Section title="Layer Roles">
          {coppers.map((c) => {
            const g = guesses[c.name];
            const changed = overrides[c.name] !== undefined && overrides[c.name] !== g?.role;
            const id = `kr-${c.name.replace(/\W/g, '')}`;
            return (
              <Row key={c.name} label={`${c.name}${changed ? ' (changed)' : ''}`} htmlFor={id} hint={g ? `Detected: ${g.role}, ${g.reason}.` : undefined}>
                <select
                  id={id}
                  className="fld w-[96px]"
                  value={roles[c.name] ?? 'signal'}
                  onChange={(e) => {
                    const v = e.target.value as CopperRole;
                    setOverrides((o) => {
                      const n = { ...o };
                      if (v === g?.role) delete n[c.name];
                      else n[c.name] = v;
                      return n;
                    });
                  }}
                >
                  <option value="signal">Signal</option>
                  <option value="plane">Plane</option>
                </select>
              </Row>
            );
          })}
          <p className="text-faint">Detected from the zones on each layer; see the Method section. Change a role if the detection is wrong.</p>
          {Object.keys(overrides).length > 0 && (
            <div className="flex justify-end">
              <button type="button" className="btn" onClick={() => setOverrides({})}>
                Use detected roles
              </button>
            </div>
          )}
        </Section>
      )}
      {board?.routing && <RoutingTargets groups={routingCheck.groups} overrides={targetOverrides} onChange={setTarget} project={loaded?.project ?? null} projectError={loaded?.projectError} />}
    </>
  );

  const rp = routingCheck.progress;
  const status = board
    ? `${loaded!.name} · ${coppers.length} copper layers${progress.total ? ` · ${solving ? `solving ${Math.floor(progress.done / 2)} of ${progress.total / 2}` : `${progress.total / 2} lines solved`}` : ''}${rp.total ? ` · routing check ${rp.done < rp.total ? `${rp.done} of ${rp.total}` : 'done'}` : ''}`
    : busy
      ? 'Reading the board…'
      : 'No board loaded';
  const thick = board ? (board.thickness ?? stackupItemThickness(board)) : 0;

  return (
    <ToolPage
      title="KiCad Stackup Impedance Calculator"
      description="Drop a KiCad .kicad_pcb file or the whole project folder to read its physical stackup and get the trace width for 50 Ω single-ended and the width and gap for 90 Ω and 100 Ω differential pairs on every signal layer, with the loss per inch, from a 2D field solver. The routing check then measures the width, gap, length and skew of every differential pair as routed and checks its impedance on each layer against the interface it carries. The files are read in your browser and not uploaded."
      properties={properties}
      status={status}
      onReset={onReset}
      method={<Method />}
    >
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center border-2 border-dashed border-[var(--accent)]" style={{ background: 'color-mix(in srgb, var(--doc) 80%, transparent)' }}>
          <span className="border border-line bg-sheet px-3 py-2 font-semibold">Drop the .kicad_pcb file or the project folder</span>
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        accept=".kicad_pcb,.kicad_pro"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose a KiCad board file, or the board and project files"
        onChange={(e) => {
          const files = inputFiles(e.target.files);
          if (files.length) void open(files);
          e.target.value = '';
        }}
      />
      <input
        ref={folderInput}
        type="file"
        // a folder pick: React passes the attribute through as it is
        {...{ webkitdirectory: '', directory: '' }}
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose a KiCad project folder"
        onChange={(e) => {
          const files = inputFiles(e.target.files);
          if (files.length) void open(files);
          e.target.value = '';
        }}
      />
      <Panel title="KiCad Board File" allowInvalid className={board ? '' : 'hidden lg:flex'}>
        <div className="p-3">
          <div className="hidden lg:block">{dropZone(!!board)}</div>
          {board && (
            <p className="break-words lg:mt-2" role="status">
              <b>{loaded!.name}</b> · {coppers.length} copper layers · board {fmt(thick, 4)} mm · KiCad {board.kicad} file (format {versionDate(board.version)})
              {board.copperFinish ? ` · ${board.copperFinish}` : ''}
              {board.routing ? ` · ${board.routing.tracks + board.routing.arcs} tracks, ${board.routing.vias} vias, ${board.routing.pairs.length} differential ${board.routing.pairs.length === 1 ? 'pair' : 'pairs'}` : ''}
              {loaded!.project ? ` · net classes from ${loaded!.project.name}` : ''}
              <span className="text-faint"> · read in {fmt(Math.max(board.stats.ms, 1), 2)} ms</span>
            </p>
          )}
          {board && !!loaded!.otherBoards?.length && (
            <p className="text-faint">
              The folder holds more boards; {loaded!.name} was read{loaded!.project ? ' (it has a project file of the same name)' : ''}. Not read: {loaded!.otherBoards.slice(0, 5).join(', ')}
              {loaded!.otherBoards.length > 5 ? ` and ${loaded!.otherBoards.length - 5} more` : ''}.
            </p>
          )}
        </div>
      </Panel>
      <Notes kind="error" items={errors} />
      {board && !board.stackup && (
        <div className="border-l-[3px] border-[var(--note-line)] bg-[var(--note-bg)] px-2.5 py-1.5" role="status">
          {loaded!.name} has no physical stackup section{board.version < 20200000 ? ` (it is a KiCad ${board.kicad} file; the stackup editor arrived in KiCad 6)` : ''}. The file gives only the board thickness
          {board.thickness !== undefined ? ` (${board.thickness} mm)` : ''} and {coppers.length} copper layers, which is not enough for an impedance. Open the board in KiCad 6 or later, check Board Setup → Physical
          Stackup and save it, then load it here again; or enter the layers in the <Link to="/stackup">Layer Stack Manager</Link>.
        </div>
      )}
      {calc && (
        <>
          <Panel title="Stackup">
            <StackPreview layers={calc.layers} length={(mm) => `${L(mm)} ${unit}`} />
          </Panel>
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
              <button type="button" className="btn" onClick={() => download(`${baseName}_impedance.csv`, toCsv(tableRows()), 'text/csv')} disabled={solving}>
                Download CSV
              </button>
              <button type="button" className="btn" onClick={openInManager} title="Saves this stackup to My stackups and opens it in the Layer Stack Manager">
                Open in Layer Stack Manager
              </button>
              <span className="text-faint" role="status">
                {copied}
              </span>
            </div>
            <p className="px-2.5 pb-2 text-faint">{settingsLine} Widths from the 2D field solver at normal accuracy, as in the Layer Stack Manager.</p>
          </Panel>
          {inputsOk && (
            <RoutingCheckPanel
              checked={routingCheck.checked}
              progress={routingCheck.progress}
              routing={board?.routing}
              hasProject={!!loaded?.project}
              L={Lr}
              unit={unit}
              boardName={loaded?.name ?? ''}
              baseName={baseName}
              download={download}
            />
          )}
          <Notes items={notes} />
        </>
      )}
      {!calc && board && <Notes items={notes} />}
    </ToolPage>
  );
}

export function Method() {
  return (
    <>
      <h2>What is read from the file</h2>
      <p>
        A <code>.kicad_pcb</code> file is a text file of nested lists (s-expressions). The page reads it in your browser, in a background worker, and looks only at the top-level items it needs: the file
        version, <code>(general (thickness …))</code>, the <code>(layers …)</code> list, the <code>(stackup …)</code> section inside <code>(setup …)</code>, the Edge.Cuts outline graphics, the header and outline
        of every <code>(zone …)</code>, every track segment and arc (start, mid and end point, width, layer, net) and every via (position, layers, net). Footprints, fill polygons and everything else are skipped,
        so a board of tens of megabytes is read in well under a second. Nets are named by their <code>(net N "name")</code> declarations in KiCad 6 to 9 and by <code>(net "name")</code> on each item from KiCad
        10. From a <code>.kicad_pro</code> file, dropped with the board or found in the project folder, only the net classes are read; everything else in the folder is ignored.
      </p>
      <p>
        Each stackup item is <code>(layer "name" (type "…") …)</code> with <code>(thickness mm [locked])</code>, <code>(material "…")</code>, <code>(epsilon_r …)</code> and <code>(loss_tangent …)</code>; a
        dielectric made of several plies lists them as sublayers separated by the bare token <code>addsublayer</code>. Every sublayer becomes its own ply here, so stacked prepregs with different Dk are modelled as
        they are. Where a value is missing, KiCad's own default is used and listed under the table: Dk 4.5 and loss tangent 0.02 for a dielectric, Dk 3.3 for solder mask, 0.035 mm copper. A mask without a loss
        tangent uses 0.027, a typical LPI mask. A dielectric with exactly Dk 4.5 and loss tangent 0.02 is flagged, because those are the values KiCad gives every new dielectric.
      </p>
      <h2>Plane layers</h2>
      <p>
        KiCad does not mark which copper layers are planes, so they are inferred. For each copper layer, the zone outlines are clipped to the board's bounding box and their area is added up per net. The board
        area is the largest closed Edge.Cuts outline (or its bounding box). A layer is taken as a plane when
      </p>
      <ul>
        <li>it is declared a <i>power</i> layer in Board Setup → Board Editor Layers, or</li>
        <li>
          zones of at most {PLANE_RULE.nets} nets cover at least {PLANE_RULE.coverage * 100} % of the board, and the layer carries less than {PLANE_RULE.trackShare * 100} % of the track length of the most-routed
          layer, or
        </li>
        <li>on a two-layer board, zones cover at least {PLANE_RULE.coverage * 100} % of one side and less than that of the other.</li>
      </ul>
      <p>
        A ground pour on a busy signal layer therefore stays a signal layer. Each layer's detected role and the reason are shown under Layer roles in the Properties panel, where you can change it. Zone outlines
        are used, not the filled copper, so antipads and clearances do not reduce the coverage.
      </p>
      <h2>Impedance and loss</h2>
      <p>
        The stackup is converted to the site's stackup model and every signal layer is handed to the same code as the{' '}
        <Link to="/stackup">Layer Stack Manager</Link>: the cross-section runs from the trace to the nearest plane above and below; a signal layer passed on the way counts as dielectric (dual stripline). Widths are
        solved with the site's 2D field solver at normal accuracy with a 0.5 mil trapezoidal etch, so the numbers equal the Layer Stack Manager's impedance view for the same stackup and pair gap. The solves run in
        parallel on the solver worker pool and are cached for the visit.
      </p>
      <p>
        Loss per inch is the conductor loss (skin effect with Hammerstad roughness for the chosen foil) plus the dielectric loss from the field solution, as on the <Link to="/trace-loss">Trace Loss</Link> and{' '}
        <Link to="/interface-rules">Interface Rules</Link> pages. Each ply keeps its own Dk and loss tangent from the file; Dk is moved to the loss frequency with the Djordjevic–Sarkar wideband model, taking the
        file's values as given at 1 GHz (KiCad's default specification frequency) unless the file states another frequency. For a differential pair the loss is that of the odd mode, which is the differential
        insertion loss per inch.
      </p>
      <h2>Routing check</h2>
      <p>
        <b>Net classes.</b> They are read from <code>net_settings</code> in the <code>.kicad_pro</code> file and resolved as the KiCad version that wrote the file does (the schema version is in{' '}
        <code>net_settings.meta.version</code>). KiCad 6 lists the member nets of each class by name. KiCad 7 and 8 use an explicit <code>netclass_assignments</code> entry, else the first matching{' '}
        <code>netclass_patterns</code> entry, else Default. KiCad 9 and 10 apply every assigned and every matching class; the one with the lowest priority number decides and missing values come from the next. A
        pattern matches when it matches the whole net name either as a regular expression or as a wildcard (<code>*</code> any run, <code>?</code> one character), case-sensitive, as KiCad's net-class matcher
        does; vector buses such as <code>D[0..7]</code> are expanded. Without a project file every net is in Default.
      </p>
      <p>
        <b>Differential pairs.</b> KiCad's own rule: reading the net name backwards, digits and underscores are skipped and the next character must be <code>+</code> or <code>P</code> (positive) or{' '}
        <code>-</code> or <code>N</code> (negative); the partner has that character swapped. So <code>USB_D+</code>/<code>USB_D-</code>, <code>PCIE_TX0_P</code>/<code>PCIE_TX0_N</code> and{' '}
        <code>LVDS_P1</code>/<code>LVDS_N1</code> are pairs; lower-case <code>p</code>/<code>n</code> are not.
      </p>
      <p>
        <b>Width and gap.</b> On each layer the width is the length-weighted most common track width of each net, with the range when it varies. Arcs count with their true length. For the gap, every piece of one
        trace is compared with the pieces of the other trace on the same layer that run within {COUPLING.parallelDeg}° of parallel; a uniform grid of the pieces keeps this fast on large boards. Where the two
        overlap when projected onto each other (as in KiCad's diff-pair DRC), the centre distance is taken at the middle of the overlap and the gap is that distance less half of each width; where several
        pieces overlap, the nearest counts. Arcs are cut into chords of at most {COUPLING.arcStepDeg}°. The gap reported is the length-weighted most common gap (in 1 µm steps). A section whose gap is more than{' '}
        {COUPLING.gapFactor} × that gap (and more than {COUPLING.gapSlack * 1000} µm above it), or that has no parallel partner at all, such as the breakout to pads and vias, is uncoupled: it is left out of the gap
        and shown as the difference between coupled and total length. The coupled length is the mean of what is measured along each of the two traces.
      </p>
      <p>
        <b>Impedance.</b> The measured width and gap of each layer are analysed with the same 2D field solver, cross-section, 0.5 mil etch and accuracy as the width table above, so a width designed for a target
        and then analysed gives the target back. A pair whose two traces differ in width is solved with their mean. A layer is checked when it has at least {COUPLING.minCoupled} mm of coupled length; shorter sections are breakout near pads and vias (and electrically short) and are listed, not checked. A layer with
        less than {COUPLING.apartCoupled} mm coupled over more than {COUPLING.apartLen} mm of routing is a warning: the two traces run apart there. The solves run on the solver worker pool and are cached
        by layer, width and gap.
      </p>
      <p>
        <b>Length, skew and loss.</b> The length of a net is the sum of its segments and arcs on all layers; the via count is the number of vias on the net. Intra-pair skew is the difference of the two routed
        lengths; via barrels, pad-to-die (package) lengths and any length-tuning settings in KiCad are not included. It is turned into picoseconds with the delay of the layer that carries the pair (from the
        solver's effective permittivity of the odd mode). Loss is each layer's routed length times its loss per inch at the interface's Nyquist frequency (the page's loss frequency for a plain impedance target),
        from the same loss model as the width table and the Interface Rules page.
      </p>
      <p>
        <b>Targets and results.</b> Each net class, split by the interface its names suggest, is matched to a target: an interface from the <Link to="/interface-rules">Interface Rules</Link> data, or a plain
        impedance. The suggestion comes from the class and net names (USB, HDMI, PCIe, SATA, MDI/ETH, MIPI/CSI/DSI, …); an impedance written in the class name, such as <code>85Ohm_PCIE</code>, is the designer's
        target: the interface is suggested when that impedance lies inside its range and within 10 % of its nominal impedance, otherwise the class's impedance is suggested as a plain target. Change any of them under Routing targets; the choice is kept in the page address. An interface target uses its impedance range from the
        specification or vendor guide; a plain or custom target allows ±10 %. Skew is checked against the interface's intra-pair limit (a time limit through the layer delay), length against its maximum length and
        loss against its loss budget (over 80 % of the budget is a warning), where the data has them. ✓ passes, ⚠ needs a look (no reference plane, long uncoupled sections, a tight loss budget), ✗ fails. When
        the impedance of one net differs by more than 10 % between layers, or one layer passes and another fails, the layer change is flagged: a width that is right on an outer layer is often wrong on an inner
        one.
      </p>
      <h2>Limits</h2>
      <ul>
        <li>
          The routing check measures tracks, not pads: the length inside pads, via barrels and package lengths are not counted, and a track ending on a pad is not joined to the next one. Coplanar ground beside a
          pair and the copper of other nets near it do not enter the impedance.
        </li>
        <li>Custom DRC rules (the .kicad_dru file) are not read. Bus groups such as <code>{'{A B}'}</code> in net-class patterns are not expanded.</li>
        <li>
          KiCad 5 and older files have no stackup section (only a board thickness), so no impedance can be given. Open them in KiCad 6 or later, check the physical stackup and save, or enter the layers in the
          Layer Stack Manager.
        </li>
        <li>Solder mask is taken as a uniform coating over the outer layers with the thickness in the file over the laminate and half of it over the trace. Switch it off for mask-free areas.</li>
        <li>Coplanar ground beside the trace, plane cut-outs and the copper roughness of each layer are not read from the file.</li>
        <li>KiCad's default stackup values are a placeholder; get the pressed thicknesses and laminate Dk/Df from your fabricator.</li>
      </ul>
      <h2>Sources</h2>
      <ol>
        <li>
          <a href="https://gitlab.com/kicad/code/kicad/-/blob/master/pcbnew/board_stackup_manager/board_stackup.cpp" target="_blank" rel="noopener noreferrer">
            KiCad source, board_stackup.cpp
          </a>
          : BOARD_STACKUP::FormatBoardStackup (how the stackup is written) and the defaults of a new stackup item.
        </li>
        <li>
          <a href="https://gitlab.com/kicad/code/kicad/-/blob/master/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr_parser.cpp" target="_blank" rel="noopener noreferrer">
            KiCad source, pcb_io_kicad_sexpr_parser.cpp
          </a>
          : PCB_IO_KICAD_SEXPR_PARSER::parseBoardStackup (how KiCad reads it back).
        </li>
        <li>
          <a href="https://gitlab.com/kicad/code/kicad/-/blob/master/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.h" target="_blank" rel="noopener noreferrer">
            KiCad source, pcb_io_kicad_sexpr.h
          </a>
          : the board file format versions.
        </li>
        <li>
          <a href="https://dev-docs.kicad.org/en/file-formats/sexpr-pcb/" target="_blank" rel="noopener noreferrer">
            KiCad developer documentation, board file format
          </a>
          .
        </li>
        <li>
          <a href="https://gitlab.com/kicad/code/kicad/-/blob/master/common/project/net_settings.cpp" target="_blank" rel="noopener noreferrer">
            KiCad source, net_settings.cpp
          </a>
          : NET_SETTINGS, the net classes in the project file, their schema migrations (version 2 in KiCad 6, 3 in KiCad 7 and 8, 4 in KiCad 9, 5 in KiCad 10) and GetEffectiveNetClass.
        </li>
        <li>
          <a href="https://gitlab.com/kicad/code/kicad/-/blob/master/common/eda_pattern_match.cpp" target="_blank" rel="noopener noreferrer">
            KiCad source, eda_pattern_match.cpp
          </a>
          : EDA_COMBINED_MATCHER for net-class patterns (anchored regular expression or anchored wildcard).
        </li>
        <li>
          <a href="https://gitlab.com/kicad/code/kicad/-/blob/master/pcbnew/board.cpp" target="_blank" rel="noopener noreferrer">
            KiCad source, board.cpp
          </a>
          : BOARD::MatchDpSuffix, the differential-pair naming rule.
        </li>
        <li>
          <a href="https://gitlab.com/kicad/code/kicad/-/blob/master/pcbnew/drc/drc_test_provider_diff_pair_coupling.cpp" target="_blank" rel="noopener noreferrer">
            KiCad source, drc_test_provider_diff_pair_coupling.cpp
          </a>
          : how KiCad's DRC finds the coupled sections of a pair (parallel projection of segment pairs).
        </li>
      </ol>
    </>
  );
}
