import { Link } from 'react-router-dom';
import { StackPreview } from '../components/StackPreview';
import { ToolPage } from '../components/ToolPage';
import { Notes, Panel, Section } from '../components/ui';
import { AnalysisProperties, BoardSummary, ImpedanceByLayerPanel, NoStackupNote, RoutingPanel } from '../components/kicad/KicadAnalysis';
import { analysisQuery, analysisStatus, KICAD_ANALYSIS_DEFAULTS, useKicadAnalysis } from '../components/kicad/useKicadAnalysis';
import { useKicadFileLoader } from '../components/kicad/KicadFileLoader';
import { PLANE_RULE } from '../lib/kicadImport';
import { COUPLING } from '../lib/kicadRouting';
import { useUrlState } from '../state/useUrlState';

export default function KicadImpedance() {
  const [p, set, reset] = useUrlState(KICAD_ANALYSIS_DEFAULTS);
  const { kp, dropZone, inputs, busy, errors: loadErrors } = useKicadFileLoader();
  const data = kp.data;
  const a = useKicadAnalysis(data, p, set);
  const board = data?.board ?? null;
  const { calc, unit, L } = a;

  const properties = (
    <>
      <div className="lg:hidden">
        <Section title="Board File">{dropZone(true)}</Section>
      </div>
      <AnalysisProperties a={a} p={p} set={set} />
    </>
  );

  return (
    <ToolPage
      title="KiCad Stackup Impedance Calculator"
      description="Drop a KiCad .kicad_pcb file or the whole project folder to read its physical stackup and get the trace width for 50 Ω single-ended and the width and gap for 90 Ω and 100 Ω differential pairs on every signal layer, with the loss per inch, from a 2D field solver. The routing check then measures the width, gap, length and skew of every differential pair as routed and checks its impedance on each layer against the interface it carries. The files are read in your browser and not uploaded."
      properties={properties}
      status={analysisStatus(a, busy, kp.boardName)}
      onReset={reset}
      method={<Method />}
    >
      {inputs}
      <Panel title="KiCad Board File" allowInvalid className={board ? '' : 'hidden lg:flex'}>
        <div className="p-3">
          <div className="hidden lg:block">{dropZone(!!board)}</div>
          {data && (
            <div className="lg:mt-2">
              <BoardSummary data={data} />
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <Link className="btn" to={`/kicad-project${analysisQuery(p)}`}>
                  Open in KiCad Project
                </Link>
                <span className="text-faint">
                  {kp.persisted ? 'Kept in this browser as the active KiCad project; the tools can read it from there.' : (kp.storageNote ?? 'The active KiCad project for this visit.')}
                </span>
              </p>
            </div>
          )}
        </div>
      </Panel>
      <Notes kind="error" items={[...loadErrors, ...a.errors]} />
      {data && <NoStackupNote data={data} />}
      {calc && (
        <>
          <Panel title="Stackup">
            <StackPreview layers={calc.layers} length={(mm) => `${L(mm)} ${unit}`} />
          </Panel>
          <ImpedanceByLayerPanel a={a} p={p} />
          <RoutingPanel a={a} />
          <Notes items={a.notes} />
        </>
      )}
      {!calc && board && <Notes items={a.notes} />}
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
        The board you load becomes the active KiCad project of this browser, shared with the <Link to="/kicad-project">KiCad project</Link> page and the calculators that read it, and it stays loaded
        after a reload. Its files are kept only in this browser, until you close the project on that page; its method section says what is stored and how to remove it.
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
