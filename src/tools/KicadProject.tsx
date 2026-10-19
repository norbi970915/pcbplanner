import { Link } from 'react-router-dom';
import { StackPreview } from '../components/StackPreview';
import { ToolPage } from '../components/ToolPage';
import { Notes, Panel, Section } from '../components/ui';
import { AnalysisProperties, BoardSummary, ImpedanceByLayerPanel, NoStackupNote, RoutingPanel } from '../components/kicad/KicadAnalysis';
import { analysisQuery, analysisStatus, KICAD_ANALYSIS_DEFAULTS, useKicadAnalysis } from '../components/kicad/useKicadAnalysis';
import { useKicadFileLoader } from '../components/kicad/KicadFileLoader';
import { stackupItemThickness, versionDate } from '../lib/kicadImport';
import { netClasses, pairSummary, pairs, type KicadProjectData } from '../lib/kicadProjectQueries';
import { KICAD_DB_NAME } from '../state/kicadProjectStore';
import { useUrlState } from '../state/useUrlState';

/**
 * The tools that read the active project and what each takes from it. `ready`: the tool has its From KiCad
 * Project section (src/components/KicadProjectSource.tsx); set it when a tool gets one.
 */
const KICAD_PROJECT_TOOLS: { path: string; label: string; takes: string; ready: boolean }[] = [
  { path: '/impedance', label: 'Impedance', takes: 'a signal layer’s cross-section, and W and S from a net class or a routed pair', ready: true },
  { path: '/interface-rules', label: 'Interface rules', takes: 'the stackup layer and the routed pair to check against an interface', ready: false },
  { path: '/trace-loss', label: 'Trace loss', takes: 'the layer, the line width and the routed length', ready: false },
  { path: '/timing', label: 'Delay & timing', takes: 'the layer and the routed length and skew of a net or pair', ready: false },
  { path: '/crosstalk', label: 'Crosstalk', takes: 'the layer and two nets: width, spacing and parallel length', ready: false },
  { path: '/trace-width', label: 'Trace width / current', takes: 'the copper thickness of a layer and a net’s width', ready: false },
  { path: '/via', label: 'Via', takes: 'the board thickness and the copper layers', ready: false },
  { path: '/pdn', label: 'PDN', takes: 'the plane layers and their distance', ready: false },
  { path: '/stackup', label: 'Layer Stack Manager', takes: 'the whole stackup, to edit or export (Open in Layer Stack Manager under Impedance by Layer)', ready: true },
];

const mm = (v: number | undefined, L: (x: number) => string) => (v === undefined ? '—' : L(v));

function ProjectHeader({ data, persisted, storageNote, onClose, query }: { data: KicadProjectData; persisted: boolean; storageNote?: string; onClose: () => void; query: string }) {
  const b = data.board;
  const thick = b.thickness ?? stackupItemThickness(b);
  const rows: [string, string][] = [
    ['Board file', data.boardName],
    ['Project file', data.projectName ? `${data.projectName}${data.project ? ` (net settings of KiCad ${data.project.kicad})` : ''}` : data.projectError ? data.projectError : 'none: every net is in Default'],
    ['Copper layers', `${b.copper.length} (${b.copper.map((c) => c.name).join(', ')})`],
    ['Board thickness', `${Number(thick.toFixed(4))} mm${b.stackup ? '' : ' (no stackup section)'}`],
    ['KiCad version', `${b.kicad} (file format ${versionDate(b.version)})`],
    ['Kept', persisted ? 'in this browser until you close the project' : (storageNote ?? 'in this tab only')],
  ];
  return (
    <>
      <dl className="grid grid-cols-[minmax(0,max-content)_minmax(0,1fr)] gap-x-4 gap-y-1 px-3 pt-3">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="px-3 pt-2 text-faint">
        <BoardSummary data={data} />
      </div>
      <div className="flex flex-wrap items-center gap-2 px-3 py-3">
        <button type="button" className="btn" onClick={onClose}>
          Close project
        </button>
        <Link className="btn" to={`/kicad-impedance${query}`}>
          Open in KiCad impedance
        </Link>
      </div>
    </>
  );
}

function NetClassesPanel({ data, L, unit }: { data: KicadProjectData; L: (mm: number) => string; unit: string }) {
  const classes = netClasses(data);
  return (
    <Panel title="Net Classes">
      <table className="tbl">
        <thead>
          <tr>
            <th>Class</th>
            <th className="v">
              Track width<span className="block font-normal text-faint">{unit}</span>
            </th>
            <th className="v">
              Diff-pair W / gap<span className="block font-normal text-faint">{unit}</span>
            </th>
            <th className="v">Routed nets</th>
            <th className="v">Pairs</th>
          </tr>
        </thead>
        <tbody>
          {classes.map((c) => (
            <tr key={c.name}>
              <td className="whitespace-nowrap">{c.name}</td>
              <td className="v whitespace-nowrap">{mm(c.trackWidth, L)}</td>
              <td className="v whitespace-nowrap">{c.dpWidth === undefined && c.dpGap === undefined ? '—' : `${mm(c.dpWidth, L)} / ${mm(c.dpGap, L)}`}</td>
              <td className="v">{c.nets}</td>
              <td className="v">{c.pairs}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-2.5 py-2 text-faint">
        {data.project
          ? `From ${data.project.name}, resolved as KiCad ${data.project.kicad} does (see the KiCad impedance method). Routed nets: nets with tracks whose deciding class this is.`
          : 'No .kicad_pro was loaded, so every net is in Default. Load the project folder, or the .kicad_pcb and .kicad_pro together, to use the net classes.'}
      </p>
    </Panel>
  );
}

function PairsPanel({ data, L, unit }: { data: KicadProjectData; L: (mm: number) => string; unit: string }) {
  const list = pairs(data);
  return (
    <Panel title="Differential Pairs">
      {list.length ? (
        <table className="tbl">
          <thead>
            <tr>
              <th>Pair</th>
              <th>Class</th>
              <th>Layers</th>
              <th className="v">
                Length<span className="block font-normal text-faint">{unit}</span>
              </th>
              <th className="v">
                Skew<span className="block font-normal text-faint">{unit}</span>
              </th>
              <th>Suggested target</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => {
              const s = pairSummary(data, p.name);
              return (
                <tr key={p.p}>
                  <td className="min-w-[140px]">
                    <span className="font-semibold">{p.name.replace(/[_.]$/, '') || p.name}</span>
                    <span className="block whitespace-nowrap text-faint">
                      {p.p} / {p.n}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">{p.cls}</td>
                  <td className="whitespace-nowrap">{p.layers.join(', ') || '—'}</td>
                  <td className="v whitespace-nowrap">{L(p.len)}</td>
                  <td className="v whitespace-nowrap">{s ? L(Math.round(s.skewMm * 1000) / 1000) : '—'}</td>
                  <td className="whitespace-nowrap">{p.suggested ? p.suggested.label : <span className="text-faint">none</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="p-3">No differential pairs: none of the routed nets is named as KiCad pairs them (USB_D+ / USB_D−, PCIE_TX0_P / PCIE_TX0_N).</p>
      )}
      {list.length > 0 && <p className="px-2.5 py-2 text-faint">Length is the longer of the two nets and skew the difference of their routed lengths, as in the routing check. Width, gap and impedance per layer are in the routing check below.</p>}
    </Panel>
  );
}

function UseInPanel() {
  return (
    <Panel title="Use This Project In">
      <ul className="divide-y divide-[var(--line)]">
        {KICAD_PROJECT_TOOLS.map((t) => (
          <li key={t.path} className="flex flex-wrap items-baseline gap-x-2 px-3 py-1.5">
            <Link to={t.path} className="font-semibold">
              {t.label}
            </Link>
            <span className="text-muted">{t.takes}</span>
            {!t.ready && <span className="text-faint">(not connected yet)</span>}
          </li>
        ))}
      </ul>
      <p className="px-3 py-2 text-faint">
        In a tool, open <b>From KiCad Project</b> in the Properties panel, choose the layer, net class, net or pair and press Apply. Nothing is changed in a tool until you press Apply.
      </p>
    </Panel>
  );
}

export default function KicadProject() {
  const [p, set, reset] = useUrlState(KICAD_ANALYSIS_DEFAULTS);
  const { kp, dropZone, inputs, busy, errors: loadErrors } = useKicadFileLoader();
  const data = kp.data;
  const a = useKicadAnalysis(data, p, set);
  const { calc, unit, L } = a;
  const close = () => {
    if (!data || typeof window === 'undefined' || window.confirm(`Close ${data.boardName}? It is removed from this browser; the files on your computer are not touched.`)) void kp.close();
  };

  const properties = (
    <>
      <div className="lg:hidden">
        <Section title="Board File">{dropZone(true)}</Section>
      </div>
      {data ? (
        <AnalysisProperties a={a} p={p} set={set} />
      ) : (
        <Section title="Project">
          <p className="text-faint">Load a board to see its layer roles, impedance targets and routing targets here.</p>
        </Section>
      )}
    </>
  );

  return (
    <ToolPage
      title="KiCad Project"
      description="The active KiCad project of this browser. Load a .kicad_pcb file or the whole project folder once to see its stackup, layer roles, net classes, differential pairs, impedance by layer and routing check, and to use its layers, net classes and pairs in the other calculators. The files stay in your browser and are not uploaded."
      properties={properties}
      status={analysisStatus(a, busy, kp.boardName)}
      onReset={reset}
      method={<Method />}
    >
      {inputs}
      {!data && (
        <Panel title="Load a KiCad Project" allowInvalid className="hidden lg:flex">
          <div className="p-3">{dropZone(false)}</div>
        </Panel>
      )}
      {!data && kp.status === 'loading' && (
        <p className="lg:hidden" role="status">
          Reading {kp.boardName ?? 'the saved project'}…
        </p>
      )}
      <Notes kind="error" items={[...loadErrors, ...(data ? a.errors : [])]} />
      {data && (
        <>
          <Panel title="Project" allowInvalid>
            <ProjectHeader data={data} persisted={kp.persisted} storageNote={kp.storageNote} onClose={close} query={analysisQuery(p)} />
            <div className="hidden px-3 pb-3 lg:block">{dropZone(true)}</div>
          </Panel>
          <NoStackupNote data={data} />
          {calc && (
            <Panel title="Stackup">
              <StackPreview layers={calc.layers} length={(v) => `${L(v)} ${unit}`} />
            </Panel>
          )}
          <NetClassesPanel data={data} L={L} unit={unit} />
          <PairsPanel data={data} L={L} unit={unit} />
          {calc && (
            <>
              <ImpedanceByLayerPanel a={a} p={p} />
              <RoutingPanel a={a} />
            </>
          )}
          <UseInPanel />
          <Notes items={a.notes} />
        </>
      )}
    </ToolPage>
  );
}

export function Method() {
  return (
    <>
      <h2>What the project page is</h2>
      <p>
        The board you load here, or on the <Link to="/kicad-impedance">KiCad impedance</Link> page, becomes the active KiCad project of this browser. Both pages show the same project, and the calculators
        that read it offer a <b>From KiCad Project</b> section in their Properties panel: choose a signal layer, a net class, a net or a differential pair and press Apply, and the tool takes the layer’s
        cross-section, the class widths or the routed width, gap and length from the project. A tool never changes your inputs until you press Apply. Loading another board replaces the project; when a
        different board is loaded, you are asked first.
      </p>
      <h2>What is stored, and where</h2>
      <p>
        Only in this browser. The text of the <code>.kicad_pcb</code> file and, when you loaded one, of the <code>.kicad_pro</code> file are kept in the browser’s IndexedDB storage (database{' '}
        <code>{KICAD_DB_NAME}</code>), together with the layer roles you changed. Nothing is uploaded: the files are read on your computer, in a background worker, and no server ever sees them. Other files of
        a dropped folder (schematics, libraries, backups) are not read and not kept.
      </p>
      <p>
        The board is not stored in a parsed form. Each time you open the site, the stored text is read again, so the project is there after a reload and on later visits, and a newer version of the reader
        always reads the file afresh. If the browser blocks storage (some private windows) or refuses a very large file, the project stays loaded only until the tab is closed; the Project panel says which.
        The project is not synchronised to your board file: after you change the board in KiCad, load it again.
      </p>
      <h2>How to remove it</h2>
      <p>
        Press <b>Close project</b> on this page: both stored files and the layer roles are deleted at once, in every open tab of the site. Clearing the site data of pcbplanner.com in your browser settings
        removes it as well. The files on your computer are never changed.
      </p>
      <h2>What is shown</h2>
      <p>
        The stackup, the plane detection and layer roles, the impedance by layer and the routing check are the ones of the <Link to="/kicad-impedance">KiCad impedance</Link> page and are explained in its
        method section: how the file is read, how plane layers are inferred from the zones, how widths and losses are solved, and how net classes, differential pairs, widths, gaps, lengths and skew are
        measured. The net class table lists the classes of the project file with their track width and differential-pair width and gap, and the number of routed nets (nets with tracks) and pairs for which
        each class decides. Without a project file every net is in Default.
      </p>
      <h2>Limits</h2>
      <ul>
        <li>One project at a time. Loading a board replaces the one that was loaded.</li>
        <li>The inputs of this page (targets, pair gap, loss frequency, routing targets) are kept in its address, like any calculator; the layer roles are kept with the project.</li>
        <li>Custom DRC rules (the .kicad_dru file), footprints and pads are not read.</li>
      </ul>
    </>
  );
}
