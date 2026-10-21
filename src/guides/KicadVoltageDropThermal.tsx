import { Cite, Guide, TryIt } from './Guide';

export default function KicadVoltageDropThermal() {
  return (
    <Guide
      sources={[
        { text: 'NBS Handbook 100, Copper Wire Tables (1966): International Annealed Copper Standard, 1/58 Ω·mm²/m at 20 °C and a temperature coefficient of 0.00393 per °C.', url: 'https://nvlpubs.nist.gov/nistpubs/Legacy/hb/nbshandbook100.pdf' },
        { text: 'onsemi AND9596/D, A Quick PCB Thermal Calculation for Power Electronic Devices with Exposed Pad Packages, Rev. 1, 2017: an empirical surface coefficient of 15, 30 and 45 W/m²K (convection and radiation together) for air at 0, 1.0 and 2.5 m/s; FR-4 0.35 W/m·K.', url: 'https://www.onsemi.com/pub/Collateral/AND9596-D.PDF' },
        { text: 'J. H. Lienhard IV and J. H. Lienhard V, A Heat Transfer Textbook, 6th ed. (free edition), eqs. 2.29–2.31: the linearised radiation coefficient, about 6 W/m²K near room temperature, about the size of natural convection in a gas.', url: 'https://ahtt.mit.edu/wp-content/uploads/2024/04/AHTTv600.pdf' },
        { text: 'J. E. Graebner, Thermal Conductivity of Printed Wiring Boards, Electronics Cooling, October 1995: copper in boards 385 ± 15 W/m·K; a bare FR-4 board 0.81 W/m·K in-plane.', url: 'https://www.electronics-cooling.com/1995/10/thermal-conductivity-of-printed-wiring-boards/' },
        { text: 'Texas Instruments SPRA953D, Semiconductor and IC Package Thermal Metrics, 2024: ψJB and T_J = T_PCB + ψJB × Power (§5), and why θJB is a different, cold-plate measurement.', url: 'https://www.ti.com/lit/an/spra953d/spra953d.pdf' },
        { text: 'D. G. Brooks with J. Adam, Trace Currents and Temperatures Revisited, April 2015: IPC-2152 against the IPC-2221 charts, about 25 % lower currents for external traces and internal traces that cool almost as well or better.', url: 'https://www.mathscinotes.com/wp-content/uploads/2016/06/pcbtempr.pdf' },
        { text: 'PCBPlanner KiCad Project page, Method: how the Power and Thermal tabs model the copper, the faces of the board and the parts, and their limits.', url: 'https://www.pcbplanner.com/kicad-project#method' },
      ]}
    >
      <p>
        <b>A power rail loses millivolts in its copper, and every watt a part burns has to leave through the board.</b> Both depend on the copper you actually drew: the planes,
        the necks between vias, the thermal spokes around a pad, the vias between layers. A single-trace calculator cannot see any of that. This guide shows the numbers behind both
        checks, how to read them, and how to get them from the .kicad_pcb file itself.
      </p>

      <h2>Copper is a resistor you can count in squares</h2>
      <p>The resistance of a track is</p>
      <div className="eq">R = ρ · L / (W · t) = R<sub>□</sub> · L / W, &nbsp;&nbsp; R<sub>□</sub> = ρ / t</div>
      <p>
        with ρ the resistivity of copper, L the length, W the width and t the copper thickness. Annealed copper is 1/58 Ω·mm²/m at 20 °C, rising 0.393 % per °C. <Cite n={1} />{' '}
        For 35 µm (1 oz) copper that makes the sheet resistance R<sub>□</sub> = 0.49 mΩ per square: any square of copper, 1 mm or 10 mm on a side, has the same 0.49 mΩ from one
        edge to the opposite one. So a track or a plane is just a count of squares in series and in parallel.
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th>2.5 A through 10 mm of 0.4 mm track, 35 µm copper, 20 °C</th>
            <th className="v">Value</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Squares (L / W)</td>
            <td className="v">25</td>
          </tr>
          <tr>
            <td>Resistance (25 × 0.49 mΩ)</td>
            <td className="v">12.3 mΩ</td>
          </tr>
          <tr>
            <td>Voltage drop (I · R)</td>
            <td className="v">31 mV</td>
          </tr>
          <tr>
            <td>Power lost (I² · R)</td>
            <td className="v">77 mW</td>
          </tr>
        </tbody>
      </table>
      <p>
        That is cold copper. At 2.5 A this track heats itself about 50 °C above the air (IPC-2221, outer layer), and copper at 70 °C conducts about 20 % worse: 14.7 mΩ, 37 mV and
        92 mW. <Cite n={[1, 6]} /> The Trace Width calculator works the drop out at the copper's own temperature.
      </p>
      <TryIt to="/trace-width?std=ipc2221&mode=temp&current=2.5&width=0.4&t=0.035&amb=20&len=10">Check this track, with its self-heating, in the Trace Width calculator</TryIt>
      <p>
        A plane is many squares side by side, which is why it carries current so well, until the current has to squeeze through a gap between a row of vias or the four spokes of a
        thermal relief. Those few narrow squares often hold most of the drop, and they are exactly what a hand calculation leaves out.
      </p>

      <h2>The load sees the supply drop and the return drop</h2>
      <p>
        Current comes back through ground, and the ground copper has resistance too. What a chip actually gets is its supply voltage minus the drop on the supply net minus the drop
        on the ground net between it and the source. On the open-source CM5 MINIMA carrier board, with the module drawing 2.5 A from the 5 V input connector, the Power tab of the
        KiCad Project page solves 19.08 mV on +5V and 1.12 mV on GND: 20.20 mV in all, 0.40 % of 5 V. <Cite n={7} /> Here the ground is a solid plane on several layers and adds
        little; on a two-layer board with a ground pour full of cut-outs it can be the larger half.
      </p>
      <TryIt to="/kicad-project?view=power">Open the Power tab (load your board or press Try an example)</TryIt>

      <h2>Where the heat goes</h2>
      <p>
        Every watt a part dissipates ends up in the air, and almost all of it leaves through the two faces of the board. In still air a face loses heat by natural convection and by
        radiation in about equal parts; radiation alone is about 6 W/m²K near room temperature for a solder-masked surface. <Cite n={3} /> Together that is roughly 15 W/m²K per face
        for still air, the empirical figure onsemi uses. <Cite n={2} /> So the average rise of a board is about
      </p>
      <div className="eq">ΔT<sub>mean</sub> ≈ P / (h · 2A)</div>
      <p>
        with P the total power, h the coefficient of a face and A the area of the board. A 31 cm² board dissipating 2 W in still air sits about 2 / (15 × 2 × 0.0031) ≈ 22 °C above the
        air on average. The solver on the CM5 MINIMA gives 24.5 °C for the same 2 W, its correlations giving a little less than 15 W/m²K for a board that small.
      </p>
      <p>
        The hot spots above that average come from how well the copper spreads the heat away from each part. Copper in a board conducts about 385 W/m·K; FR-4 conducts about 0.8 W/m·K
        along the board and about 0.35 through it. <Cite n={[2, 4]} /> So the planes do nearly all the spreading, and the laminate between the layers is the thermal bottleneck, which is
        what thermal vias get around.
      </p>

      <h2>From the board to the junction</h2>
      <p>The chip is hotter than the board under it. With the package's ψJB from its datasheet:</p>
      <div className="eq">T<sub>J</sub> = T<sub>PCB</sub> + ψ<sub>JB</sub> · P</div>
      <p>
        ψJB is measured with the part on a board, from the junction to the board at the package (its centre pin), so it belongs in this formula. θJB is a different measurement, taken between
        cold plates, and does not. <Cite n={5} /> On the CM5 MINIMA, a regulator dissipating 1 W with ψJB = 15 °C/W sits on board copper at 77.2 °C, so its junction is near 92 °C.
      </p>
      <TryIt to="/junction-temperature?mode=psijb&p=1&tref=77.2&psi=15">Work out this junction temperature in the Junction Temperature calculator</TryIt>
      <TryIt to="/kicad-project?view=thermal">Open the Thermal tab (load your board or press Try an example)</TryIt>

      <h2>Two traps</h2>
      <ul>
        <li>
          <b>Unfilled zones.</b> KiCad writes the copper of a zone into the file only after the zones are filled (Fill All Zones, B) and the board saved. A board saved without fills
          has no planes for any tool to see, and the drop and the temperature come out far too high. Fill, save, then load. For a first look at a board saved without fills, the
          Power and Thermal tabs can estimate the fill of the nets you choose; it comes close to KiCad's on the CM5 MINIMA (within a few per cent of the drop and the rise), but it is
          an estimate, not KiCad's fill.
        </li>
        <li>
          <b>The old trace-temperature charts.</b> The IPC-2221 curve that most track-current checks use is optimistic for outer layers (the newer IPC-2152 measurements allow about 25 %
          less current) and pessimistic for inner ones, which cool almost as well as outer traces. <Cite n={6} /> For a track close to its limit, check it against IPC-2152.
        </li>
      </ul>

      <h2>How the KiCad Project page does it</h2>
      <p>
        Drop the .kicad_pcb (or the whole project folder) on the page; nothing is uploaded. The Power tab solves a power net as a resistor network made from its zone fills, tracks,
        pads and via barrels, with the return through ground, and draws the drop or the current density as a heat map. The Thermal tab cuts the whole board into cells on every copper
        layer, joins them through the copper, the laminate and the vias, cools both faces by convection and radiation, and heats it with the parts you give a power to, and, if you
        tick it, with the copper loss of the DC drop. Each tab names its sources and limits in the Method section. <Cite n={7} /> Read the temperatures to about ±20–30 %; the drop is
        good to a few per cent, and the difference between two layouts of the same board is more reliable than either number alone.
      </p>
      <TryIt to="/kicad-project">Load a KiCad board</TryIt>
    </Guide>
  );
}
