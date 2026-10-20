import { Link } from 'react-router-dom';
import { Cite, Guide, TryIt } from './Guide';

export default function PrepregGlassGuide() {
  return (
    <Guide
      sources={[
        { text: 'IPC-4412C, Specification for Finished Fabric Woven from “E” Glass for Printed Boards, IPC, September 2021: table of contents and section 1 (scope, plain weave, Appendix B style tables).', url: 'https://www.ipc.org/TOC/IPC-4412C_TOC.pdf' },
        { text: 'Isola, Glass Fabric (April 2022): p. 2 style table and yarn nomenclature, p. 3 definitions, p. 5 standard and spread 106, pp. 8–17 style pages, p. 18 glass yarn properties.', url: 'https://www.isola-group.com/wp-content/uploads/Isola-Glass-Fabric-04_2022.pdf' },
        { text: 'Isola, 370HR Dielectric Constant (Dk) / Dissipation Factor (Df) Table, Revision I, 24 February 2026: prepreg data pp. 4–5, note p. 6.', url: 'https://www.isola-group.com/wp-content/uploads/data-sheets/370hr-laminate-prepreg__Dk_Df_Tables.pdf' },
        { text: 'Shengyi Technology, S1141/S0401 Based Material Line Up CN-LU-2106-S03 (June 2021): section 2, prepreg (B-stage), p. 2; SPDR method.', url: 'https://www.syst.com.cn/ajax/download.aspx?name=2021/06/20210624182306479.pdf&type=&itemid=1670' },
        { text: 'D. Parsons, Prepreg Selection: Individual Dielectric Space, Isola application note, 2013.', url: 'https://www.isola-group.com/wp-content/uploads/Prepreg-Selection-Individulal-Dielectric-Space.pdf' },
        { text: 'R. Dudek, J. Kuhn, P. Goldman, “Opening Eyes on Fiber Weave and CAF”, IPC technical paper, 2009: Figure 1, Tables I and II.', url: 'https://www.electronics.org/system/files/technical_resource/E8%26S06_03.pdf' },
        { text: 'pcbplanner impedance calculator: 2D field solver, method and validation against a commercial 2D field solver.', url: '/impedance' },
        { text: 'Isola, 370HR data sheet (last updated 15 April 2021): Tg 180 °C (DSC), Dk 4.04 and Df 0.021 at 2 GHz (Bereskin stripline).', url: 'https://isola-group.com/wp-content/uploads/data-sheets/370hr.pdf' },
      ]}
    >
      <p>
        <b>106, 1080, 3313, 2116 and 7628 are designators for woven E-glass fabric styles, which IPC-4412 lists with their yarn, fabric count, thickness and weight <Cite n={1} />; a
        prepreg ply is one layer of that fabric impregnated with resin. In Isola's current 370HR table a standard ply is 0.061 mm thick for 106 at 76 % resin, 0.076 mm for 1080 at
        66 %, 0.097 mm for 3313 at 55 %, 0.130 mm for 2116 at 56 % and 0.185 mm for 7628 at 45 %, and the thinner, resin-rich styles have the lower Dk: 3.73 for 106 against 4.30
        for 7628 at 1 GHz <Cite n={3} />.</b> This guide compares the five styles with manufacturer data, shows what the choice does to a 50 Ω outer-layer trace, and covers resin
        fill and glass-weave skew.
      </p>

      <p>For the material immediately beside an internal trace, see the <Link to="/guides/resin-rich-layer-impedance">resin-rich layer and impedance guide</Link>. Its planar model treats a local resin-rich band separately from the bulk prepreg Dk.</p>

      <h2>What the style number describes</h2>
      <p>
        IPC-4412C covers finished fabrics woven from E-glass yarn for printed boards, and all of them are plain weave. Its Appendix B gives a style designator for each fabric with
        the yarn, fabric count, thickness and weight in SI and US units <Cite n={1} />. The standard is not free, but Isola publishes the same kind of data for the fabrics it uses <Cite n={2} />:
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Style</th>
            <th className="v">Warp × fill count (ends/in)</th>
            <th>Warp yarn</th>
            <th>Fill yarn</th>
            <th className="v">Fabric thickness</th>
            <th className="v">Weight</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>106</td><td className="v">56 × 56</td><td>ECD 900-1/0</td><td>ECD 900-1/0</td><td className="v">0.0013 in (0.033 mm)</td><td className="v">25 g/m²</td></tr>
          <tr><td>1080</td><td className="v">60 × 47</td><td>ECD 450-1/0</td><td>ECD 450-1/0</td><td className="v">0.0021 in (0.053 mm)</td><td className="v">49 g/m²</td></tr>
          <tr><td>3313</td><td className="v">61 × 62</td><td>ECDE 300-1/0</td><td>ECDE 300-1/0</td><td className="v">0.0033 in (0.084 mm)</td><td className="v">82 g/m²</td></tr>
          <tr><td>2116</td><td className="v">60 × 58</td><td>ECE 225-1/0</td><td>ECE 225-1/0</td><td className="v">0.0037 in (0.094 mm)</td><td className="v">109 g/m²</td></tr>
          <tr><td>7628</td><td className="v">44 × 31</td><td>ECG 75-1/0</td><td>ECG 75-1/0</td><td className="v">0.0068 in (0.173 mm)</td><td className="v">203 g/m²</td></tr>
        </tbody>
      </table>
      <p>
        Counts, yarns, inch thicknesses and weights are from Isola's style table; the millimetre values are from its individual style pages, which match the inch values (the table's
        own millimetre column differs by up to 11 µm for some styles) <Cite n={2} />.
      </p>
      <p>
        The yarn code reads letter by letter: E for E-glass, C for continuous filaments, then the filament diameter class (C, D, E, DE or G). The first number is the yardage in one
        pound and the second is the number of strands <Cite n={2} />. ECD 900 in 106 is therefore 900 yards per pound, a twelfth of the mass per length of the ECG 75 yarn in 7628.
        Isola calls a fabric with balanced density or yarn counts in warp and fill a square weave <Cite n={2} />; by the counts above, 106, 3313 and 2116 are close to balanced, while
        1080 (60 × 47) and 7628 (44 × 31) have fewer fill yarns than warp yarns.
      </p>
      <p>
        The glass itself has a much higher Dk than the laminate built from it: Isola gives E-glass a Dk of 6.8 and a Df of 0.0035 at 1 GHz <Cite n={2} />. The more of a ply's volume is
        resin, the lower its Dk, which is the trend in every table below.
      </p>

      <h2>Thickness, resin content and Dk: Isola 370HR</h2>
      <p>
        370HR is a 180 °C Tg FR-4 epoxy <Cite n={8} />, and Isola publishes Dk and Df for every prepreg it offers, each marked as a standard or an alternate offering. These are
        all the 106, 1080, 3313, 2116 and 7628 rows of the prepreg table <Cite n={3} />.
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Style</th>
            <th className="v">Resin content</th>
            <th>Offering</th>
            <th className="v">Thickness per ply</th>
            <th className="v">Dk / Df at 1 GHz</th>
            <th className="v">Dk / Df at 10 GHz</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>106</td><td className="v">71 %</td><td>Alternate</td><td className="v">0.051 mm (0.0020 in)</td><td className="v">3.81 / 0.020</td><td className="v">3.63 / 0.025</td></tr>
          <tr><td>106</td><td className="v">76 %</td><td>Standard</td><td className="v">0.061 mm (0.0024 in)</td><td className="v">3.73 / 0.025</td><td className="v">3.54 / 0.031</td></tr>
          <tr><td>1080</td><td className="v">61 %</td><td>Alternate</td><td className="v">0.070 mm (0.0028 in)</td><td className="v">3.92 / 0.020</td><td className="v">3.80 / 0.025</td></tr>
          <tr><td>1080</td><td className="v">66 %</td><td>Standard</td><td className="v">0.076 mm (0.0030 in)</td><td className="v">3.90 / 0.023</td><td className="v">3.72 / 0.028</td></tr>
          <tr><td>1080</td><td className="v">68 %</td><td>Standard</td><td className="v">0.081 mm (0.0032 in)</td><td className="v">3.86 / 0.023</td><td className="v">3.68 / 0.029</td></tr>
          <tr><td>1080</td><td className="v">71 %</td><td>Standard</td><td className="v">0.091 mm (0.0036 in)</td><td className="v">3.81 / 0.024</td><td className="v">3.63 / 0.030</td></tr>
          <tr><td>3313</td><td className="v">55 %</td><td>Standard</td><td className="v">0.097 mm (0.0038 in)</td><td className="v">4.10 / 0.020</td><td className="v">3.95 / 0.025</td></tr>
          <tr><td>2116</td><td className="v">52 %</td><td>Alternate</td><td className="v">0.119 mm (0.0047 in)</td><td className="v">4.15 / 0.020</td><td className="v">4.01 / 0.025</td></tr>
          <tr><td>2116</td><td className="v">56 %</td><td>Standard</td><td className="v">0.130 mm (0.0051 in)</td><td className="v">4.08 / 0.020</td><td className="v">3.92 / 0.025</td></tr>
          <tr><td>2116</td><td className="v">60 %</td><td>Alternate</td><td className="v">0.147 mm (0.0058 in)</td><td className="v">3.99 / 0.021</td><td className="v">3.84 / 0.026</td></tr>
          <tr><td>7628</td><td className="v">45 %</td><td>Standard</td><td className="v">0.185 mm (0.0073 in)</td><td className="v">4.30 / 0.018</td><td className="v">4.16 / 0.021</td></tr>
          <tr><td>7628</td><td className="v">50 %</td><td>Standard</td><td className="v">0.208 mm (0.0082 in)</td><td className="v">4.19 / 0.019</td><td className="v">4.05 / 0.023</td></tr>
        </tbody>
      </table>
      <p>Three things follow from the table <Cite n={3} />:</p>
      <ul>
        <li>
          <b>One style, several thicknesses.</b> 1080 is offered from 61 % to 71 % resin. The glass is the same, so the extra resin makes the ply thicker (0.070 to 0.091 mm) and
          lowers its Dk (3.92 to 3.81 at 1 GHz). A style name alone does not fix the thickness or the Dk; the resin content does.
        </li>
        <li>
          <b>Dk follows resin content more than style.</b> 106 and 1080 at 71 % resin both have Dk 3.81 at 1 GHz, and 3313 and 2113 at 55 % both have 4.10. 3313 at 55 % and 2116 at
          56 % differ by 0.02 in Dk but by 33 µm in thickness.
        </li>
        <li>
          <b>Resin-rich plies tend to have a higher Df.</b> At 1 GHz the standard 7628 at 45 % resin has 0.018 and the standard 106 has 0.025. For every row, Dk is lower and Df higher at 10 GHz
          than at 1 GHz.
        </li>
      </ul>
      <p>
        The 370HR data sheet gives a headline Dk of 4.04 at 2 GHz (Bereskin stripline), and 4.24 to 3.92 from 100 MHz to 10 GHz <Cite n={8} />. The table shows that a ply's Dk depends on its style and resin content, so for
        a thin prepreg under a trace, use the row for the ply that is actually in the stackup. The{' '}
        <Link to="/pcb-materials/370hr">370HR material page</Link> lists the data-sheet values.
      </p>

      <h2>A second material: Shengyi S1141</h2>
      <p>
        S1141 is an FR-4 from Shengyi. Its line-up table, measured with a split-post dielectric resonator (SPDR), lists prepreg by style and resin content. One row per style, at
        1 GHz <Cite n={4} />:
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Style</th>
            <th className="v">Resin content</th>
            <th className="v">Thickness per ply</th>
            <th className="v">Dk / Df at 1 GHz</th>
            <th className="v">Dk at 10 GHz</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>106/1037</td><td className="v">71 %</td><td className="v">0.053 mm</td><td className="v">3.66 / 0.019</td><td className="v">3.49</td></tr>
          <tr><td>1080/1078</td><td className="v">64 %</td><td className="v">0.081 mm</td><td className="v">3.85 / 0.018</td><td className="v">3.71</td></tr>
          <tr><td>2313/3313</td><td className="v">55 %</td><td className="v">0.105 mm</td><td className="v">4.09 / 0.016</td><td className="v">3.99</td></tr>
          <tr><td>2116</td><td className="v">52 %</td><td className="v">0.123 mm</td><td className="v">4.17 / 0.015</td><td className="v">4.08</td></tr>
          <tr><td>7628</td><td className="v">43 %</td><td className="v">0.199 mm</td><td className="v">4.40 / 0.013</td><td className="v">4.36</td></tr>
        </tbody>
      </table>
      <p>
        The table lists 1080 with 1078, 106 with 1037 and 2313 with 3313 in shared rows, and other resin contents for most, for example 2116 from 50 % to 58 % and 7628 from 43 % to
        50 % <Cite n={4} />. The trend is the same as for 370HR, but the numbers come from a different resin, test method and set of resin contents, so do not combine
        rows from the two tables in one stackup. The <Link to="/pcb-materials/s1141">S1141 material page</Link> has the laminate data sheet values.
      </p>

      <h2>Why the ply under L1 sets the trace width</h2>
      <p>
        On a four- or six-layer board the dielectric between an outer-layer trace and its reference plane is usually the prepreg under it, and the width for a given impedance scales
        roughly with that thickness. The <Link to="/guides/choosing-a-pcb-stackup">stackup guide</Link> explains the layer order and why controlled-impedance boards put a thin,
        fine-weave prepreg on the outside. Here is the same question with the 370HR rows: the width of a 50 Ω microstrip over one ply of each standard style.
      </p>
      <p>
        <b>Model.</b> The 2D field solver of the <Link to="/impedance">impedance calculator</Link> at its default (normal) accuracy, solving for width <Cite n={7} />. Inputs: 35 µm
        (1 oz) copper, 12.7 µm etch (top width = bottom width − 0.0127 mm), solder mask 30.5 µm over laminate and 15.2 µm over copper with Dk 3.8, and the ply thickness and 1 GHz Dk
        from the 370HR table as H and εr <Cite n={3} />. The uncoated column removes the mask; Hammerstad–Jensen is the closed-form check the calculator shows for an uncoated microstrip,
        evaluated at the mean of top and bottom width.
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th>One ply of 370HR</th>
            <th className="v">H, Dk</th>
            <th className="v">50 Ω width, with mask</th>
            <th className="v">Delay, with mask</th>
            <th className="v">50 Ω width, no mask</th>
            <th className="v">Hammerstad–Jensen at that width</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>106, 76 %</td><td className="v">0.061 mm, 3.73</td><td className="v">0.094 mm</td><td className="v">5.91 ps/mm</td><td className="v">0.110 mm</td><td className="v">51.3 Ω</td></tr>
          <tr><td>1080, 66 %</td><td className="v">0.076 mm, 3.90</td><td className="v">0.119 mm</td><td className="v">5.98 ps/mm</td><td className="v">0.136 mm</td><td className="v">51.0 Ω</td></tr>
          <tr><td>3313, 55 %</td><td className="v">0.097 mm, 4.10</td><td className="v">0.153 mm</td><td className="v">6.06 ps/mm</td><td className="v">0.171 mm</td><td className="v">50.9 Ω</td></tr>
          <tr><td>2116, 56 %</td><td className="v">0.130 mm, 4.08</td><td className="v">0.216 mm</td><td className="v">6.02 ps/mm</td><td className="v">0.236 mm</td><td className="v">50.7 Ω</td></tr>
          <tr><td>7628, 45 %</td><td className="v">0.185 mm, 4.30</td><td className="v">0.309 mm</td><td className="v">6.12 ps/mm</td><td className="v">0.331 mm</td><td className="v">50.5 Ω</td></tr>
        </tbody>
      </table>
      <p>
        The field solver gives 50.0 Ω at each rounded width (49.97–50.06 Ω), and 50.1–50.4 Ω at high accuracy. Hammerstad–Jensen reads 0.5–1.2 Ω (1.0–2.4 %) higher on the uncoated
        traces, the largest difference on the thinnest ply. Going from 1080 to 7628 multiplies the width by 2.6 for a 2.4 times thicker ply; the higher Dk of 7628 pulls the width down slightly, but
        thickness dominates. Solder mask narrows every width by 16–22 µm.
      </p>
      <p>
        The same calculation over the S1141 rows above gives 0.130 mm for 1080 (0.081 mm, Dk 3.85), 0.199 mm for 2116 (0.123 mm, Dk 4.17) and 0.329 mm for 7628 (0.199 mm, Dk 4.40),
        with mask. The stackup guide's figures differ again because its fab stackup uses other ply thicknesses. In every case the answer depends on the thickness your fabricator
        actually presses, so use its stackup sheet for the final width.
      </p>
      <TryIt to="/impedance?w=0.119&h=0.076&er=3.9">Open the 1080 example (0.119 mm over 0.076 mm, Dk 3.90) in the impedance calculator</TryIt>
      <TryIt to="/impedance?w=0.216&h=0.13&er=4.08">Open the 2116 example (0.216 mm over 0.130 mm, Dk 4.08)</TryIt>
      <TryIt to="/impedance?w=0.309&h=0.185&er=4.3">Open the 7628 example (0.309 mm over 0.185 mm, Dk 4.30)</TryIt>
      <TryIt to="/impedance?w=0.136&h=0.076&er=3.9&mask=0">Open the uncoated 1080 trace with the Hammerstad–Jensen check</TryIt>

      <h2>Resin fill and thin plies</h2>
      <p>
        Isola's prepreg-selection note describes how a fabricator turns per-ply thicknesses into a pressed dielectric <Cite n={5} />. Add the overall thickness of each ply as delivered.
        Then subtract the resin that flows into the etched areas of the neighbouring copper layers: for each layer, the etched fraction times the copper thickness. The difference
        between a ply's overall thickness and its glass thickness is the “unsupported resin volume” available for that fill.
      </p>
      <p>
        The note's warning is the useful part: if the calculated dielectric thickness is equal to or less than the total glass thickness of the plies, the construction may not have
        enough resin for the application. Its example bonds two 1 oz signal layers, each 75 % etched, with two plies of 106. The plies give 2 × 0.0023 in = 0.0046 in, the fill takes
        about 0.002 in, and the 0.0026 in that remains is less than the 0.0028 in of glass, so some compression of the glass fabric is to be expected. The same two plies on an outer
        layer, filling only a 1 oz ground layer with 20 % etched area, leave 0.00432 in, with plenty of resin <Cite n={5} />.
      </p>
      <p>
        In the same note, 7628 at 42 % resin and 1080 at 65 % are marked as having very low unsupported resin volume (0.0004 in and 0.0005 in per ply), and 2116 at 62 % and 7628 at 50 %
        as very high (0.0023 in and 0.002 in) <Cite n={5} />. Its glass thicknesses (for example 0.0025 in for 1080) are not identical to the 2022 fabric table above; both are Isola
        figures from different years. For a prepreg under an outer-layer trace the adjacent layer is normally a plane, so little resin is consumed (0.0046 in became 0.00432 in
        in the note's outer-layer example); a single thin ply between two etched signal layers is the case to check with the fabricator.
      </p>

      <h2>Glass weave and differential skew</h2>
      <p>
        A woven fabric is not a uniform dielectric. Where yarns cross there are two yarn thicknesses of glass, along a yarn one, and in the gaps between yarns none; each region has
        its own local Dk, and the step between them is proportional to the difference in Dk between glass and resin <Cite n={6} />. If the two traces of a differential pair see
        different local Dk, their delays differ and the pair develops skew. Isola's photographs of standard 106 show open windows between the yarns; in spread glass each strand is
        enlarged and flattened, which narrows the windows <Cite n={2} />.
      </p>
      <p>
        Dudek, Kuhn and Goldman compared traditional E-glass fabric with spread-fibre fabric; the two fabrics in their Figure 1 are both style 1080 with equal amounts of glass{' '}
        <Cite n={6} />. In a low-loss resin the measured range of laminate Dk across trace positions was 0.50 for traditional E-glass and 0.14 for spread E-glass. For a 100 Ω
        differential pair, their finite-element model predicted worst-case skew (their Table II, which does not state a fabric style) of
        13.8 ps/in for traditional E-glass and 2.52 ps/in for spread E-glass, and their HyperLynx simulations gave 9.87 and 2.23 ps/in. Traditional E-glass with FR-4 resin came out
        lower than with the low-loss resin (7.26 ps/in simulated, 9.71 ps/in predicted), because FR-4 resin has a Dk closer to that of E-glass <Cite n={6} />.
      </p>
      <p>
        The weave matters as much as the style number: the same 1080 style can be a traditional or a spread fabric. Isola now describes spread glass in both directions as the industry
        standard, and states that all 370HR glass is spread weave in both directions <Cite n={[2, 3]} />. For multi-gigabit pairs, ask your fabricator which glass its prepreg uses, and
        see the <Link to="/guides/glass-weave-skew">glass weave skew guide</Link> for the skew budget per data rate and routing at an angle to the weave.
      </p>

      <h2>Choosing a style</h2>
      <ol>
        <li>Pick the prepreg under each outer layer for the trace width your parts can escape: one ply of 106 or 1080 for narrow 50 Ω traces, 2116 or 7628 where wider traces are acceptable.</li>
        <li>Take thickness and Dk from the row for the exact style and resin content in the stackup, at your signal frequency, not from the laminate's headline value.</li>
        <li>Do not mix rows from different material systems in one stackup.</li>
        <li>Check single thin plies between etched signal layers for resin fill with the fabricator.</li>
        <li>For fast differential pairs, specify spread glass and check how the fabricator's prepreg is woven.</li>
        <li>Order controlled impedance and let the fabricator adjust the width to its pressed thickness.</li>
      </ol>
      <TryIt to="/stackup">Build the stackup ply by ply in the Layer Stack Manager</TryIt>
      <TryIt to="/stackup-advisor">Let the Stackup Advisor rank stackups for your impedance targets</TryIt>
    </Guide>
  );
}
