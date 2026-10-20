import { Link } from 'react-router-dom';
import { StackPreview } from '../components/StackPreview';
import { Sources } from '../components/Sources';
import { ToolPage } from '../components/ToolPage';
import { Notes, Panel, Section } from '../components/ui';
import { AnalysisMethod } from '../components/kicad/AnalysisMethod';
import { KicadBoardPanel } from '../components/kicad/KicadBoardPanel';
import { KicadPowerPanel } from '../components/kicad/KicadPowerPanel';
import { AnalysisProperties, BoardSummary, ImpedanceByLayerPanel, NoStackupNote, RoutingPanel } from '../components/kicad/KicadAnalysis';
import { analysisStatus, KICAD_ANALYSIS_DEFAULTS, useKicadAnalysis } from '../components/kicad/useKicadAnalysis';
import { useKicadFileLoader } from '../components/kicad/KicadFileLoader';
import { stackupItemThickness, versionDate } from '../lib/kicadImport';
import { netClasses, pairSummary, pairs, type KicadProjectData } from '../lib/kicadProjectQueries';
import { KICAD_DB_NAME } from '../state/kicadProjectStore';
import { useUrlState } from '../state/useUrlState';
import type { DataSource } from '../data/source';

/**
 * The tools that read the active project and what each takes from it. `ready`: the tool has its From KiCad
 * Project section (src/components/KicadProjectSource.tsx); set it when a tool gets one.
 */
const KICAD_PROJECT_TOOLS: { path: string; label: string; takes: string; ready: boolean }[] = [
  { path: '/impedance', label: 'Impedance', takes: 'a signal layer’s cross-section, and W and S from a net class or a routed pair', ready: true },
  { path: '/interface-rules', label: 'Interface rules', takes: 'the stackup layer and the routed pair to check against an interface', ready: true },
  { path: '/trace-loss', label: 'Trace loss', takes: 'the layer, the line width and the routed length', ready: true },
  { path: '/timing', label: 'Delay & timing', takes: 'the layer and the routed length and skew of a net or pair', ready: true },
  { path: '/crosstalk', label: 'Crosstalk', takes: 'the layer and two nets: width, spacing and parallel length', ready: true },
  { path: '/trace-width', label: 'Trace width / current', takes: 'the copper thickness of a layer and a net’s width', ready: false },
  { path: '/via', label: 'Via', takes: 'the board thickness and the copper layers', ready: false },
  { path: '/pdn', label: 'PDN', takes: 'the power and ground plane pair: overlap area, dielectric thickness and εr', ready: true },
  { path: '/stackup', label: 'Layer Stack Manager', takes: 'the whole stackup, to edit or export (Open in Layer Stack Manager under Impedance by Layer)', ready: true },
];

const mm = (v: number | undefined, L: (x: number) => string) => (v === undefined ? '—' : L(v));

function ProjectHeader({ data, persisted, storageNote, onClose }: { data: KicadProjectData; persisted: boolean; storageNote?: string; onClose: () => void }) {
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
          ? `From ${data.project.name}, resolved as KiCad ${data.project.kicad} does (see the method section). Routed nets: nets with tracks whose deciding class this is.`
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
      description="Drop a KiCad .kicad_pcb file or the whole project folder to read its physical stackup, net classes and differential pairs. Get the trace width for 50 Ω single-ended and the width and gap for 90 Ω and 100 Ω differential pairs on every signal layer, with the loss per inch, from a 2D field solver, and a routing check of every routed pair: width, gap, impedance, skew, length, loss and gaps in its reference plane. The Power tab checks the current capacity of the tracks and vias of a power net and solves its DC voltage drop, drawn as heat maps on the board. The project then stays loaded for the other calculators. The files are read in your browser and not uploaded."
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
        <nav aria-label="Project views" className="flex gap-1 border-b border-line">
          {(
            [
              ['overview', 'Overview'],
              ['board', 'Board'],
              ['power', 'Power'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-current={p.view === v ? 'page' : undefined}
              className={`-mb-px border-b-2 px-3 py-1.5 ${p.view === v ? 'border-[var(--accent-ink)] font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'}`}
              onClick={() => set({ view: v })}
            >
              {label}
            </button>
          ))}
        </nav>
      )}
      {data && p.view === 'board' && calc && (
        <KicadBoardPanel data={data} checked={a.routingCheck.checked} solving={a.routingCheck.progress.done < a.routingCheck.progress.total} selected={p.item} onSelect={(item) => set({ item })} />
      )}
      {data && p.view === 'board' && !calc && <Notes items={['The board view needs the stackup of the board: load a board saved with KiCad 6 or later.']} />}
      {data && p.view === 'power' && <KicadPowerPanel data={data} p={p} set={set} />}
      {data && p.view !== 'board' && p.view !== 'power' && (
        <>
          <Panel title="Project" allowInvalid>
            <ProjectHeader data={data} persisted={kp.persisted} storageNote={kp.storageNote} onClose={close} />
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
              <RoutingPanel a={a} onShow={(item) => set({ view: 'board', item })} />
            </>
          )}
          <UseInPanel />
          <Notes items={a.notes} />
        </>
      )}
    </ToolPage>
  );
}

const POWER_SOURCES: readonly DataSource[] = [
  {
    title: 'CircuitCalculator.com, PCB Trace Width Calculator',
    url: 'https://circuitcalculator.com/wordpress/2006/01/31/pcb-trace-width-calculator/',
    note: 'The IPC-2221 curve fit of the Power tab: I = k·ΔT^0.44·A^0.725 with k = 0.048 (external) and 0.024 (internal), A in square mils, fitted to the IPC-2221 (IPC-D-275) charts.',
  },
  {
    title: 'D. G. Brooks with J. Adam, "Trace Currents and Temperatures Revisited", UltraCAD Design, April 2015',
    url: 'https://www.mathscinotes.com/wp-content/uploads/2016/06/pcbtempr.pdf',
    note: 'IPC-2152 against the IPC-2221 charts: about 25 % lower currents for external traces, and internal traces that cool almost as well as external ones or better (introduction).',
  },
  {
    title: 'NBS Handbook 100, Copper Wire Tables (1966)',
    url: 'https://nvlpubs.nist.gov/nistpubs/Legacy/hb/nbshandbook100.pdf',
    note: 'International Annealed Copper Standard: 1/58 Ω·mm²/m at 20 °C and a temperature coefficient of 0.00393 per °C, the resistivity of the DC drop.',
  },
];

export function Method() {
  return (
    <>
      <h2>What the project page is</h2>
      <p>
        The board you load here becomes the active KiCad project of this browser. The calculators that read it offer a <b>From KiCad Project</b> section in their Properties panel: choose a signal
        layer, a net class, a net or a differential pair and press Apply, and the tool takes the layer’s cross-section, the class widths or the routed width, gap and length from the project. A tool never changes your inputs until you press Apply. Loading another board replaces the project; when a
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
      <h2>Board view</h2>
      <p>
        The Board tab draws the board from the same file: the outline, and on each copper layer the zone fills as KiCad last filled them, the tracks and arcs, the pads of every footprint
        in their shape and rotation, and the vias with their drill holes. A pad's position is taken from its footprint's position and angle, as KiCad does. The routing check marks
        where it found something: a gap in a reference plane, a via stub over the guideline, a via without a ground via near it (with a dashed line to the nearest one), and the
        closest spacing to another signal. Choose a pair or net in the list, a marker on the board, or the board link in the routing check to highlight its copper and zoom to it;
        a click on a track highlights its net. Problems that belong to the whole route, such as impedance, skew or length, highlight the pair without a marker.
      </p>
      <h2>Power view</h2>
      <p>
        The Power tab checks one net at a time, power nets first in the list. <b>Track current</b> is the quick, worst-case check: every track and via of the net is taken to carry the whole net
        current, and its temperature rise is the IPC-2221 curve fit <i>I</i> = <i>k</i> · Δ<i>T</i>
        <sup>0.44</sup> · <i>A</i>
        <sup>0.725</sup> (<i>A</i> in square mils, <i>k</i> = 0.048 on the outer layers and 0.024 on the inner ones), the formula of the Trace Width tool, with the copper thickness of each layer from
        the stackup. A via barrel is treated as the Via tool treats it: a ring of 25 µm plating around the drill, with the outer-layer constant. Tracks within half the allowed rise are green,
        up to it amber, above it red. The page also gives the IPC-2221 width for the current. The old charts are not exact either way: the IPC-2152 measurements allow about 25 %
        less current than the IPC-2221 curve on outer layers, while inner traces cool almost as well as outer ones or better, so the inner-layer constant (half the outer one) is
        conservative. For a track close to its limit, check it in the Trace Width tool with the IPC-2152 fit.
      </p>
      <p>
        <b>DC drop</b> solves the copper of the net as a resistor network. Choose the source part (the regulator or connector that feeds the net; the part with the most pad area on the net
        is offered first) and the parts that draw current, with their currents. On every layer with a zone of the net, the zone fills and pads are cut into square cells; neighbouring cells
        are joined by the sheet conductance <i>t</i>/ρ times the part of the cells that is copper, so a neck or a thermal spoke narrower than a cell keeps its own resistance. Within 0.8 mm of
        every pad of the source and the loads the cells are split to about 0.03 mm, so the thermal spokes and gaps the whole current goes through are resolved. Every track is a resistor
        ρ·<i>L</i>/(<i>W</i>·<i>t</i>) between its ends (a track that ends inside a via's ring, overlaps another track's end, or ends on the middle of another track is joined there, as KiCad
        joins copper by overlap); a via or a plated hole is a barrel resistor between neighbouring copper layers, over the height between the layers from the stackup. A pad is one node on
        each of its layers, and a track or via joins a zone over its own width, not at one point. The source pads are held at the reference, each load draws its current spread over its
        pads, and the network is solved by conjugate gradients with an aggregation multigrid preconditioner. ρ is annealed copper's 1/58 Ω·mm²/m at 20 °C with a temperature coefficient of
        0.393 %/°C, taken at the ambient plus the allowed rise, the hottest the copper may get.
      </p>
      <p>
        The result is the drop at every load (the mean over its pads), the copper loss, the real current and IPC-2221 rise of every track and via, and a heat map on a chosen layer of the
        drop or of the sheet current density in amperes per millimetre of width (its colours span 99 % of the copper; the few hottest cells by the vias and pads are shown at the top colour).
        A load the copper does not connect to the source is named and draws no current. The drop between two places changes by a few per cent with the grid, mostly through how a via
        meets a plane, so read the result to that accuracy. What is not modelled: the return current in the ground net (solve the ground net with the same parts for its share), the
        resistance inside the parts and their pins, solder, plating on the outer layers, temperature that varies over the board, and AC effects (decoupling, inductance).
      </p>
      <h2>Net classes and pairs</h2>
      <p>
        The net class table lists the classes of the project file with their track width and differential-pair width and gap, and the number of routed nets (nets with tracks) and pairs for which
        each class decides. Without a project file every net is in Default.
      </p>
      <AnalysisMethod
        limits={
          <>
            <li>One project at a time. Loading a board replaces the one that was loaded.</li>
            <li>The inputs of this page (targets, pair gap, loss frequency, routing targets) are kept in its address, like any calculator; the layer roles are kept with the project.</li>
          </>
        }
      />
      <Sources items={POWER_SOURCES} />
    </>
  );
}
