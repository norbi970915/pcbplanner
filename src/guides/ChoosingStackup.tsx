import { Cite, Guide, TryIt } from './Guide';

export default function ChoosingStackup() {
  return (
    <Guide
      tools={['/stackup-advisor', '/stackup', '/impedance', '/pcb-materials']}
      sources={[
        { text: 'IPC-4412, Specification for Finished Fabric Woven from “E” Glass for Printed Boards, IPC.' },
        { text: 'IPC-4101, Specification for Base Materials for Rigid and Multilayer Printed Boards, IPC.' },
        { text: 'Shengyi Technology, S1141 line-up table CN-LU-2106-S03 (Dk/Df per glass style and resin content, SPDR method), 2021.', url: 'https://www.syst.com.cn/ajax/download.aspx?name=2021/06/20210624182306479.pdf&type=&itemid=1670' },
        { text: 'J. Loyer, R. Kunze, X. Ye, “Fiber Weave Effect: Practical Impact Analysis and Mitigation Strategies,” DesignCon 2007.' },
        { text: 'H. W. Ott, Electromagnetic Compatibility Engineering, Wiley, 2009 (return currents and plane assignment).' },
        { text: 'E. Bogatin, Signal and Power Integrity – Simplified, 3rd ed., Prentice Hall, 2018.' },
      ]}
    >
      <p>
        The stackup (the order and thickness of copper and dielectric layers) is decided before routing starts and is hard to change afterwards. It sets your trace widths, how well
        signals are shielded and how cleanly return currents flow. This guide covers the two decisions that matter most: <b>which layer is which</b>, and <b>what dielectric sits under
        the outer layers</b>.
      </p>

      <h2>Rule one: every signal layer next to a plane</h2>
      <p>
        High-frequency return current flows in the plane directly under the signal trace, as close to it as it can get <Cite n={[5, 6]} />. Give every signal layer an adjacent solid
        plane (usually ground), and the loop between signal and return stays small: lower inductance, less radiation, less crosstalk and a controlled impedance.
      </p>
      <p>Common assignments:</p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Layers</th>
            <th>Arrangement (top to bottom)</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>4</td>
            <td>Signal · Ground · Power · Signal</td>
            <td>The standard 4-layer build. Put fast signals on the top layer, over the ground plane.</td>
          </tr>
          <tr>
            <td>4</td>
            <td>Signal · Ground · Ground · Signal</td>
            <td>Both outer layers get a ground reference; power is routed as wide pours on the signal layers.</td>
          </tr>
          <tr>
            <td>6</td>
            <td>Signal · Ground · Signal · Power · Ground · Signal</td>
            <td>Two outer and one inner signal layer, each next to a plane; the tool's default for 6 layers.</td>
          </tr>
          <tr>
            <td>6</td>
            <td>Signal · Ground · Signal · Signal · Ground · Signal</td>
            <td>More routing, but the two inner signal layers are adjacent: route them at right angles to limit crosstalk.</td>
          </tr>
        </tbody>
      </table>
      <p>
        When a signal changes layers, its return current has to change planes too. Place a ground via next to the signal via so the return path stays short, and never route a fast
        signal across a split or slot in its reference plane.
      </p>

      <h2>What 1080, 2116, 3313 and 7628 mean</h2>
      <p>
        Prepreg and core are woven glass fabric impregnated with epoxy. The numbers are standard <b>glass-fabric styles</b> <Cite n={1} />: finer weaves are thinner and carry more
        resin, which has a lower dielectric constant than glass, so their Dk is lower. The same material (IPC-4101 FR-4 <Cite n={2} />) therefore has different Dk values
        depending on the style. For one common FR-4, the laminate maker's own table gives <Cite n={3} />:
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Glass style</th>
            <th className="v">Resin content</th>
            <th className="v">Pressed thickness per ply</th>
            <th className="v">Dk at 1 GHz</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>106</td>
            <td className="v">71 %</td>
            <td className="v">0.053 mm</td>
            <td className="v">3.66</td>
          </tr>
          <tr>
            <td>1080</td>
            <td className="v">64 %</td>
            <td className="v">0.081 mm</td>
            <td className="v">3.85</td>
          </tr>
          <tr>
            <td>2313 / 3313</td>
            <td className="v">55 %</td>
            <td className="v">0.105 mm</td>
            <td className="v">4.09</td>
          </tr>
          <tr>
            <td>2116</td>
            <td className="v">52 %</td>
            <td className="v">0.123 mm</td>
            <td className="v">4.17</td>
          </tr>
          <tr>
            <td>7628</td>
            <td className="v">43 %</td>
            <td className="v">0.199 mm</td>
            <td className="v">4.40</td>
          </tr>
        </tbody>
      </table>
      <p>Each fab uses its own resin contents, so check its stackup sheet for the exact values; the trend is always the same.</p>

      <h2>The outer prepreg decides your trace widths</h2>
      <p>
        For an outer-layer trace, the dielectric to the first plane is the prepreg under it. The trace width for a given impedance scales roughly with that thickness. On standard
        4-layer, 1.6 mm FR-4 boards with 1 oz outer copper and solder mask, the field solver gives:
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Prepreg under L1</th>
            <th className="v">Thickness</th>
            <th className="v">50 Ω single-ended</th>
            <th className="v">90 Ω differential (W / S)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1080</td>
            <td className="v">0.076 mm</td>
            <td className="v">0.12 mm</td>
            <td className="v">0.125 / 0.19 mm</td>
          </tr>
          <tr>
            <td>3313</td>
            <td className="v">0.099 mm</td>
            <td className="v">0.16 mm</td>
            <td className="v">0.17 / 0.26 mm</td>
          </tr>
          <tr>
            <td>2116</td>
            <td className="v">0.116 mm</td>
            <td className="v">0.19 mm</td>
            <td className="v">0.20 / 0.31 mm</td>
          </tr>
          <tr>
            <td>7628</td>
            <td className="v">0.210 mm</td>
            <td className="v">0.35 mm</td>
            <td className="v">0.39 / 0.59 mm</td>
          </tr>
          <tr>
            <td>3 × 7628</td>
            <td className="v">0.646 mm</td>
            <td className="v">1.17 mm</td>
            <td className="v">1.31 / 1.97 mm</td>
          </tr>
        </tbody>
      </table>
      <p>
        Differential pairs here use a spacing of 1.5 × the width. A 0.12 mm trace can escape fine-pitch parts and connectors such as USB-C and M.2; a 0.35 mm trace often cannot. That is why impedance-controlled boards use a thin, fine-weave prepreg on the outside even when the total thickness is the standard 1.6 mm: the remaining thickness
        goes into the cores in the middle.
      </p>
      <TryIt to="/stackup-advisor">Let the Stackup Advisor rank stackups for your impedance targets</TryIt>

      <h2>Glass weave and differential skew</h2>
      <p>
        A coarse weave such as 7628 has visible bundles of glass with resin-rich gaps between them. If one trace of a differential pair runs over glass and the other over resin, the two
        see different Dk and arrive at different times. This “fibre-weave effect” can create picoseconds of skew per inch, which matters at multi-gigabit data rates <Cite n={4} />. Fine and
        spread-glass styles (1080, 1078, 1067, 2116, 3313) reduce it; routing pairs at a small angle to the weave is another mitigation described in the same study.
      </p>

      <h2>A practical order of decisions</h2>
      <ol>
        <li>Count the signal layers you need, including the ones that must be next to ground (fast signals first).</li>
        <li>Pick the layer count and arrangement so every signal layer has an adjacent plane.</li>
        <li>Choose the outer prepreg for the trace widths your parts can escape (fine pitch → thin prepreg).</li>
        <li>Use your fab's standard stackups: they are cheaper and have measured Dk values.</li>
        <li>Calculate widths for each impedance on each layer, then order controlled impedance.</li>
      </ol>
      <TryIt to="/stackup">Browse and edit stackups in the Layer Stack Manager</TryIt>
    </Guide>
  );
}
