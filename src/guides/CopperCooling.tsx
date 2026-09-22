import { Cite, Guide, TryIt } from './Guide';

export default function CopperCooling() {
  return (
    <Guide
      tools={['/copper-heat-spreading', '/ldo', '/thermal-vias', '/junction-temperature']}
      sources={[
        { text: 'T. L. Bergman, A. S. Lavine, F. P. Incropera, D. P. DeWitt, Fundamentals of Heat and Mass Transfer, 7th ed., Wiley, 2011 (§3.6 extended surfaces, §9.6 natural convection on plates).' },
        { text: 'JEDEC JESD51-7, High Effective Thermal Conductivity Test Board for Leaded Surface Mount Packages.' },
        { text: 'JEDEC JESD51-3, Low Effective Thermal Conductivity Test Board for Leaded Surface Mount Packages.' },
        { text: 'Texas Instruments SPRA953, “Semiconductor and IC Package Thermal Metrics.”', url: 'https://www.ti.com/lit/pdf/spra953' },
      ]}
    >
      <p>
        A linear regulator dropping 5 V to 3.3 V at 0.6 A turns about 1 W into heat. In a SOT-223 or DPAK package that heat has one good way out: through the tab into the copper it
        is soldered to, and from the copper into the air. How much copper you give it decides whether the part runs warm or shuts down. This guide puts numbers on it.
      </p>

      <h2>What the datasheet θJA really means</h2>
      <p>
        Datasheets quote a junction-to-ambient thermal resistance θ<sub>JA</sub>, but it is measured on a standardised JEDEC test board: a low-conductivity single-layer board
        (JESD51-3) or a high-conductivity four-layer board (JESD51-7) <Cite n={[2, 3]} />. Your board's copper, layers and airflow are different, so the real value can be much better
        or much worse. TI's thermal-metrics application note explains that θ<sub>JA</sub> is meant for comparing packages on that standard board, not for predicting temperatures in
        a particular design <Cite n={4} />.
      </p>
      <p>
        A more useful split is junction-to-board (θ<sub>JB</sub>, a property of the package) plus <b>board-to-ambient</b>, which is the part you control with copper.
      </p>

      <h2>How copper spreads heat</h2>
      <p>
        The copper under and around the part acts as a cooling fin: heat flows sideways through it and leaves both faces of the board by natural convection and radiation. A thin
        copper sheet has limited sideways conductance, so the copper far from the part is cooler and contributes less. Heat-transfer textbooks describe this with the <b>fin efficiency</b>
        <Cite n={1} />: 100 % means all of the copper is at the part's temperature, 50 % means the copper, on average, only sheds half of what it could.
      </p>

      <h2>The numbers</h2>
      <p>
        1 W into a 5 × 5 mm pad, 40 °C still air, horizontal board with solder mask, calculated with the copper-spreading tool (Bessel-function fin solution with natural-convection and
        radiation correlations from <Cite n={1} />):
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Copper pour (square)</th>
            <th className="v">1 oz, one layer</th>
            <th className="v">2 oz (or 1 oz on two tied layers)</th>
            <th className="v">2 oz on two tied layers</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>10 × 10 mm</td>
            <td className="v">163 °C/W</td>
            <td className="v">162 °C/W</td>
            <td className="v">161 °C/W</td>
          </tr>
          <tr>
            <td>25.4 × 25.4 mm (1 in²)</td>
            <td className="v">53 °C/W</td>
            <td className="v">48 °C/W</td>
            <td className="v">46 °C/W</td>
          </tr>
          <tr>
            <td>50 × 50 mm</td>
            <td className="v">32 °C/W</td>
            <td className="v">24 °C/W</td>
            <td className="v">19 °C/W</td>
          </tr>
        </tbody>
      </table>
      <p>These are board-to-air values; add the package's θ<sub>JB</sub> for the junction. Three things stand out:</p>
      <ul>
        <li>
          <b>A small pour is not enough.</b> 10 × 10 mm gives about 160 °C/W: at 1 W the copper under the part would sit around 200 °C. The area simply cannot shed 1 W to still air.
        </li>
        <li>
          <b>Area helps, with diminishing returns.</b> Going from 1 in² to 4× the area (50 mm square) on 1 oz copper only lowers the resistance from 53 to 32 °C/W, because the fin
          efficiency falls from about 80 % to 47 %: the outer copper stays cool.
        </li>
        <li>
          <b>Thicker copper and extra layers make large pours work.</b> The sideways conductance is what limits a large pour, so 2 oz copper, or a second 1 oz layer tied in with
          thermal vias, gives the same improvement, from 32 to 24 °C/W at 50 mm.
        </li>
      </ul>
      <TryIt to="/copper-heat-spreading">Find the smallest pour for your part and Tj limit</TryIt>

      <h2>Practical layout advice</h2>
      <ol>
        <li>Solder the tab or exposed pad to a solid copper area and keep it free of thermal-relief spokes.</li>
        <li>Place a grid of thermal vias under or right next to the pad to reach inner planes and the bottom layer; they turn one copper layer into several.</li>
        <li>Spread the copper evenly around the part rather than in one long strip; a compact square works best for a given area.</li>
        <li>Keep other hot parts away, and check the result: once the board exists, measure the case temperature under load.</li>
        <li>If the numbers do not close even with generous copper, reduce the dissipation (a buck converter instead of an LDO) or add airflow or a heatsink.</li>
      </ol>

      <h2>Limits of the model</h2>
      <p>
        The calculation assumes an isolated board in still air, a square pour centred on the part and no other heat sources. It neglects the sideways conduction of the FR-4 itself,
        which is slightly conservative. In an enclosure, use the air temperature inside the box as the ambient. For 1 in² of 2 oz copper the model gives about 50 °C/W from the pad to
        the air, which, with a typical θ<sub>JB</sub> added, is in the range of datasheet θ<sub>JA</sub> values for SOT-223 parts on similar copper.
      </p>
    </Guide>
  );
}
