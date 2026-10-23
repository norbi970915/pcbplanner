import { Link } from 'react-router-dom';
import { StackPreview } from '../components/StackPreview';
import { Sources } from '../components/Sources';
import { ToolPage } from '../components/ToolPage';
import { Notes, Panel, Section } from '../components/ui';
import { AnalysisMethod } from '../components/kicad/AnalysisMethod';
import { KicadBoardPanel } from '../components/kicad/KicadBoardPanel';
import { KicadCheckOverview } from '../components/kicad/KicadCheckOverview';
import { KicadPowerPanel } from '../components/kicad/KicadPowerPanel';
import { KicadThermalPanel } from '../components/kicad/KicadThermalPanel';
import { KicadClearancePanel } from '../components/kicad/KicadClearancePanel';
import { AnalysisProperties, BoardSummary, ImpedanceByLayerPanel, NoStackupNote, RoutingPanel } from '../components/kicad/KicadAnalysis';
import { analysisStatus, KICAD_ANALYSIS_DEFAULTS, useKicadAnalysis } from '../components/kicad/useKicadAnalysis';
import { useKicadFileLoader } from '../components/kicad/KicadFileLoader';
import { stackupItemThickness, versionDate } from '../lib/kicadImport';
import { netClasses, pairSummary, pairs, type KicadProjectData } from '../lib/kicadProjectQueries';
import { KICAD_DB_NAME } from '../state/kicadProjectStore';
import { useUrlState } from '../state/useUrlState';
import type { DataSource } from '../data/source';
import { captureProjectReport } from '../lib/kicadProjectReport';
import { EXAMPLE_SCENARIO } from '../lib/kicadExampleScenario';
import { KICAD_EXAMPLE } from '../state/kicadProjectStore';

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
  { path: '/trace-width', label: 'Trace width / current', takes: 'the copper thickness of a layer and a net’s width and routed length on that layer', ready: true },
  { path: '/via', label: 'Via', takes: 'the board thickness, or a selected via’s layer span, hole and pad diameters', ready: true },
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
  const { kp, dropZone, inputs, busy, errors: loadErrors, chooseBoard } = useKicadFileLoader(() => set(EXAMPLE_SCENARIO));
  const data = kp.data;
  const a = useKicadAnalysis(data, p, set);
  const { calc, unit, L } = a;
  const close = () => {
    if (!data || typeof window === 'undefined' || window.confirm(`Close ${data.boardName}? It is removed from this browser; the files on your computer are not touched.`)) void kp.close();
  };

  const properties = (
    <>
      {!data && <div className="lg:hidden">
        <Section title="Board File">{dropZone(true)}</Section>
      </div>}
      {data && p.view === 'board' ? (
        <AnalysisProperties a={a} p={p} set={set} scope="routing" />
      ) : data ? (
        <>
          <Section title="Project"><p className="break-words font-semibold">{data.boardName}</p><p className="text-faint">{data.board.copper.length} copper layers. Files stay in this browser.</p>
            {p.view === 'overview' ? <p className="mt-2 text-muted">Choose a check in the summary. Its settings appear here when you open it.</p> : <button className="btn" type="button" onClick={() => set({ view: 'overview' })}>Project overview</button>}
          </Section>
          {p.view === 'overview' && <>
            <Section title="Routing review"><p className="text-muted">Review pair and net findings on the board and assign routing targets.</p><button type="button" className="btn mt-2" onClick={() => set({ view: 'board' })}>Open routing settings</button></Section>
            <Section title="Stackup and impedance settings" defaultOpen={false}><AnalysisProperties a={a} p={p} set={set} scope="stackup" /></Section>
          </>}
        </>
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
      focusView
      description="Inspect a KiCad board’s stackup, routing, voltage drop, temperature and same-layer clearance. Open a .kicad_pcb or project folder; files stay in your browser."
      properties={properties}
      status={analysisStatus(a, busy, kp.boardName)}
      reportBusy={busy || a.solving || a.routingCheck.progress.done < a.routingCheck.progress.total || a.routingCheck.checked.some(c => c.res.overall === 'pending')}
      onReset={reset}
      method={<Method />}
      reportCapture={snapshot => data ? captureProjectReport(data, p, a, snapshot) : Promise.resolve({ ...snapshot, blocked: 'Load a KiCad board before creating a project report.' })}
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
      <Notes kind="error" items={[...loadErrors, ...(data && ['overview', 'board'].includes(p.view) ? a.errors : [])]} />
      {data?.boardName === KICAD_EXAMPLE.board.name && <div className="border border-line bg-sheet px-3 py-2" data-testid="example-scenario">
        <div className="flex flex-wrap items-center justify-between gap-2"><b>LinkBench-4 demonstration board</b><button type="button" className="btn" onClick={() => set(EXAMPLE_SCENARIO)}>Restore demonstration inputs</button></div>
        <p className="mt-1 text-muted">Four 100 Ω differential pairs and a 5 V load bank. Open Board to inspect the routing, Power for voltage drop, or Thermal and press Solve for the temperature map.</p>
        <details className="mt-1"><summary className="cursor-pointer text-muted">Demonstration assumptions and expected findings</summary>
        <p className="mt-1 text-muted">This passive interconnect has three pairs on F.Cu and one with a B.Cu transition, referenced to two ground planes. A 100 Ω target is assigned by its net class; the board is not qualified for a particular interface or data rate.</p>
        <p className="mt-1 text-muted">J3 supplies four 68 Ω resistors. At nominal 5 V, each load is modelled as 73.53 mA and 0.368 W: 294.12 mA and 1.47 W total. The DC model uses those constant currents. Thermal uses 25 °C still air, board convection/radiation and copper losses. Results are model estimates, not measurements or resistor surface temperatures.</p>
        <p className="mt-1 text-faint">The illustrative stackup and operating assumptions are included in the download. <a href="/examples/linkbench-4/LinkBench-4-example.zip" download>Download complete project</a> · <a href={KICAD_EXAMPLE.board.url} download>Board</a> · <a href={KICAD_EXAMPLE.project.url} download>Project settings</a></p>
        </details>
      </div>}
      {data?.boardName === 'pcbplanner-example-6layer.kicad_pcb' && <p className="border border-line bg-sheet px-3 py-2 text-muted">You have the earlier teaching example open. <button type="button" className="underline" disabled={busy} onClick={() => { void kp.loadExample().then(loaded => { if (loaded) set(EXAMPLE_SCENARIO); }); }}>Try LinkBench-4</button> for the new routing, power and thermal demonstration.</p>}
      {data && (
        <nav aria-label="Project views" className="flex gap-1 border-b border-line">
          {(
            [
              ['overview', 'Overview'],
              ['board', 'Board'],
              ['power', 'Power'],
              ['thermal', 'Thermal'],
              ['clearance', 'Clearance'],
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
        <KicadBoardPanel data={data} checked={a.routingCheck.checked} solving={a.routingCheck.progress.done < a.routingCheck.progress.total} selected={p.item} onSelect={(item) => set({ item })} onReloadBoard={chooseBoard} />
      )}
      {data && p.view === 'board' && !calc && <Notes items={['The board view needs the stackup of the board: load a board saved with KiCad 6 or later.']} />}
      {data && p.view === 'power' && <KicadPowerPanel data={data} p={p} set={set} />}
      {data && p.view === 'thermal' && <KicadThermalPanel data={data} p={p} set={set} />}
      {data && p.view === 'clearance' && <KicadClearancePanel data={data} p={p} set={set} />}
      {data && !['board', 'power', 'thermal', 'clearance'].includes(p.view) && (
        <>
          <KicadCheckOverview data={data} a={a} p={p} set={set} />
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
    title: 'onsemi AND9596/D, "A Quick PCB Thermal Calculation for Power Electronic Devices with Exposed Pad Packages", Rev. 1, 2017',
    url: 'https://www.onsemi.com/pub/Collateral/AND9596-D.PDF',
    note: 'Pp. 1–2: an empirical heat transfer coefficient, convection and radiation together, of 15, 30 and 45 W/m²K for air at 0, 1.0 and 2.5 m/s; Table 1: FR-4 0.35 W/m·K. The still-air check of the Thermal tab and the default through-plane conductivity.',
  },
  {
    title: 'J. E. Graebner, "Thermal Conductivity of Printed Wiring Boards", Electronics Cooling, October 1995',
    url: 'https://www.electronics-cooling.com/1995/10/thermal-conductivity-of-printed-wiring-boards/',
    note: 'Copper in boards 385 ± 15 W/m·K; a bare FR-4 board 0.81 W/m·K in-plane (sample PC5). The copper and in-plane laminate values of the Thermal tab.',
  },
  {
    title: 'Isola 370HR laminate and prepreg data sheet',
    url: 'https://www.isola-group.com/wp-content/uploads/data-sheets/370hr-laminate-prepreg.pdf',
    note: 'P. 2: thermal conductivity 0.4 W/m·K (ASTM E1952), an example of a laminate datasheet value for the through-plane field.',
  },
  {
    title: 'J. H. Lienhard IV, J. H. Lienhard V, A Heat Transfer Textbook, 6th ed., Phlogiston Press (free edition)',
    url: 'https://ahtt.mit.edu/wp-content/uploads/2024/04/AHTTv600.pdf',
    note: 'Eqs. 2.29–2.31: linearised radiation, about 6 W/m²K near room temperature; §8.3–8.4: Churchill–Chu for vertical plates, eqs. 8.37a–b (Raithby–Hollands) and 8.38 (Fujii–Imura) for horizontal plates, the comparison in the Thermal view; Table 10.1: emissivities.',
  },
  {
    title: 'A. Gorev et al., "Emissivity of printed circuit boards", IOP Conf. Ser.: Mater. Sci. Eng. 734 (2020) 012027 (open access)',
    url: 'https://iopscience.iop.org/article/10.1088/1757-899X/734/1/012027/pdf',
    note: 'Table 1: measured emissivity of solder-masked boards 0.88 (red) to 0.97 (black), polished copper 0.08; the default ε = 0.9.',
  },
  {
    title: 'Texas Instruments SPRA953D, "Semiconductor and IC Package Thermal Metrics", 2024',
    url: 'https://www.ti.com/lit/an/spra953d/spra953d.pdf',
    note: '§5: ψJB, and eq. 9, T_J = T_PCB + ψJB × Power, the junction estimate of the Thermal tab.',
  },
  {
    title: 'KiCad 9 PCB Editor documentation: zone and rule area properties, and the design rule checks',
    url: 'https://docs.kicad.org/9.0/en/pcbnew/pcbnew.html#zone_and_rule_area_properties',
    note: 'What the zone settings do (clearance, minimum width, pad connection, thermal relief gap and spoke width, island removal) and the board-level copper-to-edge clearance; the steps of the estimated fill.',
  },
  {
    title: 'P. F. Felzenszwalb, D. P. Huttenlocher, "Distance Transforms of Sampled Functions", Theory of Computing 8 (2012) 415–428 (open access)',
    url: 'https://theoryofcomputing.org/articles/v008a019/v008a019.pdf',
    note: 'The exact Euclidean distance transform in linear time, used for the clearances, the thermal gaps and the minimum width of the estimated fill.',
  },
  {
    title: 'smpspowersupply.com: IPC-2221B PCB trace spacing / clearance by voltage (L. Rozenblat)',
    url: 'https://www.smpspowersupply.com/ipc2221pcbclearance.html',
    note: 'Columns B1, B2 and B4 of IPC-2221B Table 6-1, the spacings of the Clearance tab, with the per-volt formula above 500 V and worked rows to 5000 V (the standard itself is sold by IPC).',
  },
  {
    title: 'PCBSync: IPC-2221 explained (Table 6-1, IPC-2221B)',
    url: 'https://pcbsync.com/ipc-2221/',
    note: 'A second reproduction of columns B1, B2 and B4; all nine bands agree with the first.',
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
        in their shape and rotation, and the vias with their drill holes. Over the copper it draws the body of each part, its fabrication drawing (F.Fab or B.Fab, else the courtyard), named with its reference once the part is large enough on screen; the Power, Thermal and Clearance tabs draw these too, and always name and brighten the parts they are about (the source and loads of a DC drop, the heat sources, the parts on a high-voltage net). A pad's position is taken from its footprint's position and angle, as KiCad does. The routing check marks
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
        meets a plane, so read the result to that accuracy. What is not modelled: the resistance inside the parts and their pins, solder, plating on the outer layers, temperature that
        varies over the board, and AC effects (decoupling, inductance).
      </p>
      <p>
        The current comes back through the return net. By default it is the ground net that reaches the source and the most loads (choose another, or none, under Return net). The
        return is solved the same way, with each load's current flowing from its pads on the return net back to the source's: the load sees the supply drop and the return drop added,
        and the table gives both and their total. A load with no pad on the return net returns its current some other way (through another part), so its total is left out; a source
        with no pad on the return net cannot be solved for the return. The map shows either net's copper.
      </p>
      <h2>Thermal view</h2>
      <p>
        The Thermal tab solves the steady temperature of the whole board from the power of the parts you enter. The board inside its outline is cut into square cells, the same on every
        copper layer; a cell of a layer stands for its copper and half the laminate on each side of it. Neighbouring cells of a layer are joined by <i>k</i>
        <sub>Cu</sub>·<i>t</i>·<i>c</i> + <i>k</i>
        <sub>xy</sub>·<i>d</i>, where <i>c</i> is the part of the cells that is copper (the zones, tracks, pads and via pads of every net), <i>t</i> the copper thickness and <i>d</i> the laminate the
        cell stands for; a cell is joined to the same cell of the next layer through the laminate, <i>k</i>
        <sub>z</sub>·<i>A</i>/<i>h</i>, and through every via and plated hole there, <i>k</i>
        <sub>Cu</sub>·<i>a</i>/<i>h</i> for its 25 µm copper ring. The copper of a board conducts 385 W/m·K (Graebner measured 385 ± 15 in boards; pure annealed copper is about 400); the
        laminate defaults to 0.8 W/m·K along the board and 0.35 through it, and both can be changed. A part's power enters the board through its pads on its own side. With <b>Add the copper loss</b> ticked, the DC drop set up on the Power tab is solved as well and its I²R (the tracks, planes and vias of the supply and of the
        return net) heats each layer where it is lost; the result names the watts added per net.
      </p>
      <p>
        The two faces give the heat to the air by convection and radiation. In still air the convection comes from the natural-convection correlations of the heat-spreading tool (hot
        upper face 0.54·Ra<sup>1/4</sup>, lower face 0.52·Ra<sup>1/5</sup> with <i>L</i> = area/perimeter; Churchill–Chu for an upright board). The free textbook of Lienhard gives other
        correlations of the same kind: Raithby and Hollands for the upper face (with its correction for thick boundary layers, 7 % below the value here for a 31 cm² board) and Fujii
        and Imura for the lower face, stated for larger plates (Ra ≥ 10⁶) than most boards. With them that board's faces would lose about 10 % less heat, and its rise would be about
        10 % higher: a measure of how well the convection of a small board is known. For moving air you enter the convection coefficient. Radiation is εσ(<i>T</i>
        <sub>s</sub>² + <i>T</i>
        <sub>a</sub>²)(<i>T</i>
        <sub>s</sub> + <i>T</i>
        <sub>a</sub>), about 6 W/m²K near room temperature, as much as still-air convection. Both depend on the temperature; since all the heat leaves through the faces, their mean
        rise is <i>P</i> / ((<i>h</i>
        <sub>top</sub> + <i>h</i>
        <sub>bottom</sub> + 2<i>h</i>
        <sub>r</sub>)·<i>A</i>), and the coefficients are iterated on it before the board is solved once. For a 31 cm² board 34 °C above ambient this gives about 14 W/m²K a face with
        radiation, against the empirical 15 W/m²K for still air in onsemi's AND9596.
      </p>
      <p>
        The result is the temperature on every layer (the map's colours span the coolest to the hottest point of the board), the hottest point, and the board temperature under each
        part (the highest of its pad cells). With the part's ψJB from its datasheet, the junction is <i>T</i>
        <sub>J</sub> = <i>T</i>
        <sub>PCB</sub> + ψ<sub>JB</sub>·<i>P</i>, as TI's SPRA953 defines it; θJB is a different, cold-plate measurement and does not belong in that formula. The tests check a
        well-spreading plate against <i>P</i> / (2<i>hA</i>), a heated copper strip against the exact fin solution, and a hot pad in a copper pour against the heat-spreading tool (within
        7 %). Not modelled: heat leaving the top of a package straight to the air (so the parts come out a little hot), enclosures, heatsinks and neighbouring boards, air that warms as
        it passes, and time (the result is the steady state). Read the temperatures to about ±20–30 %; the differences between two layouts of the same board are more reliable.
      </p>
      <h2>Unfilled zones: the estimated fill</h2>
      <p>
        KiCad writes the copper of a zone into the file only when the zones are filled; a board saved without that has only the zone outlines, and the Power and Thermal tabs leave
        those zones out. For a first look, the fill of the nets you tick is estimated on the page instead. It is not KiCad's filler, and the view says so with <b>Zone fill: estimate</b>.
        Each zone and layer is worked out on a raster of cells a third of the zone's clearance or minimum width across: the zone outline less its cut-outs, inside the board outline and
        outside the rule areas that keep pours out; less the copper of other nets (tracks, vias, pads, saved fills and the zones of other nets estimated before it, higher priority
        first) grown by the clearance, which is the larger of the zone's and the net-class clearances of both nets (or a clearance set on a pad or its footprint), the board edge grown by
        the board's copper-to-edge clearance (0.5 mm without a .kicad_pro), and the holes of other nets grown by the board's hole clearance; less a thermal gap around the pads of the
        zone's net that connect by thermal relief (the zone's pad connection, or the pad's or footprint's own), with four spokes of the zone's spoke width back to the fill; less copper
        narrower than the zone's minimum width (shrunk by half of it and grown back); and less the islands that touch no pad, track or via of the net, as the zone's island removal
        says. Distances are exact Euclidean distance transforms of the raster (Felzenszwalb and Huttenlocher), and the cells are traced back into outlines, stepped by one cell.
      </p>
      <p>
        On the open-source CM5 MINIMA carrier board (6 layers, 13 zones on 18 zone layers), with its fills taken out and estimated again, the estimate had 0.3 % more copper than KiCad's
        fill and 98.8 % of it in the same place (95–99 % layer by layer); the DC drop to the module came within 3 % of the drop on KiCad's fill, and the hottest point's rise above
        ambient within 4 %. Not modelled: custom design rules, KiCad's spoke angle and minimum spoke count, hatched fills and pads removed from unused layers. Fill the zones in KiCad,
        save and load the board again for the real copper.
      </p>
      <h2>Clearance view</h2>
      <p>
        The Clearance tab checks the nets you give a voltage (the peak voltage to the circuit's 0 V; nets you leave out are taken as 0 V) against the copper of every other net on the
        same layer. Each piece of copper is measured exactly: a track as its centre line and half its width (an arc as chords that stay within 1 µm of it), a via or a round pad as its
        centre and radius, any other pad and every zone fill by the edges of its outline. The closest gap between two nets is set against the spacing IPC-2221 Table 6-1 gives for the
        peak voltage between them: column B1 on inner layers, and on the outer layers B2 for a bare board or B4 with a permanent polymer coating, as you choose. Between 15 V and 500 V
        the table steps in bands; above 500 V it adds a fixed amount per volt (B1 0.0025 mm, B2 0.005 mm, B4 0.00305 mm). Each place that is too close is listed and marked on the
        board with a line across the gap. The zones are measured as KiCad last filled them, so fill the zones before you load the board.
      </p>
      <p>
        Not checked: spacing between layers through the laminate, creepage along the surface around slots and parts, the coated-assembly columns A5 to A7 and boards used above
        3050 m (the Conductor Spacing and Creepage tools cover those), and safety standards that ask for more than IPC-2221, such as IEC 62368-1 for mains equipment. The Table 6-1
        values are those of the Conductor Spacing tool, checked for B1, B2 and B4 against two free reproductions of the table.
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
