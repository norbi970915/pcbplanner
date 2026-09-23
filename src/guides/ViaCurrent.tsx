import { Cite, Guide, TryIt } from './Guide';

export default function ViaCurrent() {
  return (
    <Guide
      sources={[
        { text: 'Texas Instruments SLVA959B, Best Practices for Board Layout of Motor Drivers, sections 3.1 and 3.2: via current guidance, parallel vias and placement.', url: 'https://www.ti.com/lit/an/slva959b/slva959b.pdf' },
        { text: 'pcbplanner Via Calculator, Method, formulas and references: finished-hole barrel geometry and the IPC-2221 cross-section estimate.', url: '/via#method' },
        { text: 'IPC, The Value of IPC-2152: measurements and the influence of the board construction on conductor temperature rise.', url: 'https://www.ipc.org/system/files/technical_resource/E7%26S22_03.pdf' },
      ]}
    >
      <p>
        <b>A 0.3 mm via does not have one universal current rating.</b> The finished hole, copper plating, conducting length, nearby copper and permitted temperature all matter.
        For a 1.6 mm long via with 25 µm barrel plating, the calculated resistance is about 1.14 mΩ at 35 °C. That gives a useful voltage-drop estimate; it does not establish
        a safe current by itself.
      </p>
      <p>
        This guide works through that via and a 5 A layer transition, keeping the electrical calculation separate from the assumptions used to estimate heating.
      </p>

      <h2>The current flows through the copper barrel</h2>
      <p>
        A plated through via is a copper tube. If d is the <b>finished hole diameter</b> and t is the barrel plating thickness, the outer copper diameter is d + 2t.
        The conducting cross-section is:
      </p>
      <p>A = π × [(d + 2t)² − d²] / 4 = π × t × (d + t).</p>
      <p>
        Use millimetres for d and t to get A in mm². The pad diameter is not the barrel diameter: making the annular ring wider does not add copper down the hole.
        Likewise, an outer-layer copper weight does not specify the minimum copper thickness on the hole wall. Obtain that plating value from the fabrication specification.
        <Cite n={2} />
      </p>

      <h2>A worked example: 0.3 mm hole, 25 µm plating</h2>
      <p>
        With d = 0.30 mm and t = 0.025 mm, the barrel outer diameter is 0.35 mm and A = 0.02553 mm².
        Resistance follows R = ρL/A. Using the calculator's copper resistivity of 1.7241 × 10⁻⁸ Ω·m at 20 °C and temperature coefficient 0.00393/°C gives:
      </p>
      <p>ρ at 35 °C ≈ 1.826 × 10⁻⁸ Ω·m; R ≈ 1.144 mΩ for L = 1.6 mm.</p>
      <p>
        At 1 A that is 1.144 mV of drop and 1.144 mW of barrel dissipation. At 5 A it becomes 5.72 mV and 28.61 mW, because voltage drop is IR and power is I²R.
        The temperature is an input to these calculations, not a temperature predicted from the dissipated power.
      </p>
      <TryIt to="/via?hole=0.3&plating=0.025&len=1.6&pad=0.6&antipad=0.9&er=4.3&dT=10&amb=25&z0=50">Load the 0.3 mm via example</TryIt>
      <p>
        The calculator displays voltage drop and power at its estimated capacity current. For another load current, use its DC resistance with IR and I²R as above.
        The following comparison holds the finished hole, length and copper temperature fixed:
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th className="v">Plating</th>
            <th className="v">Area</th>
            <th className="v">Resistance</th>
          </tr>
        </thead>
        <tbody>
          <tr><td className="v">20 µm</td><td className="v">0.02011 mm²</td><td className="v">1.453 mΩ</td></tr>
          <tr><td className="v">25 µm</td><td className="v">0.02553 mm²</td><td className="v">1.144 mΩ</td></tr>
          <tr><td className="v">35 µm</td><td className="v">0.03684 mm²</td><td className="v">0.793 mΩ</td></tr>
        </tbody>
      </table>
      <p>
        These are calculated barrel values. They exclude the resistance of the pads, connecting traces, plane spreading and any narrow neck where the current enters the array.
      </p>

      <h2>Why via current calculators disagree</h2>
      <p>
        pcbplanner applies the IPC-2221 conductor formula to the barrel cross-section. At a requested 10 °C rise, the example above gives approximately 1.90 A with the
        external-layer coefficient and 0.95 A with the internal-layer coefficient. Both come from the same cross-section; changing the empirical coefficient halves the result.
        <Cite n={2} />
      </p>
      <p>
        This is a conductor-formula approximation applied to a via. Neither result is a measured rating for this board, and the two values are not proven upper and lower
        bounds on its temperature. A via exchanges heat with the copper on the connected layers, while adjacent vias can heat the same region.
        IPC's discussion of IPC-2152 shows why board construction and heat spreading matter to conductor sizing. <Cite n={3} />
      </p>
      <p>
        As a separate reference, TI's motor-driver layout guide lists 0.84 A for a 12 mil via in its table for a 10 °C rise and a 1 oz PCB.
        Twelve mil is 0.3048 mm, close to this example's hole size, but the table does not fully define the same barrel geometry and thermal environment.
        Treat that value as TI's published guidance, not a validation of either calculator coefficient. <Cite n={1} />
      </p>
      <p>
        Compare assumptions before comparing the final amperes: finished versus drill diameter, minimum plating, layer connections, copper temperature and the thermal model.
        A small resistance can be calculated accurately enough for a voltage-drop budget while the permissible continuous current remains less certain.
      </p>

      <h2>How many vias for a 5 A rail?</h2>
      <p>
        For N identical vias with equal current sharing, the barrel resistance is R/N and each carries I/N. With the 25 µm example at an assumed 35 °C, a 5 A transition gives:
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th className="v">Vias</th>
            <th className="v">A/via</th>
            <th className="v">Drop</th>
            <th className="v">Total loss</th>
          </tr>
        </thead>
        <tbody>
          <tr><td className="v">1</td><td className="v">5.00</td><td className="v">5.72 mV</td><td className="v">28.61 mW</td></tr>
          <tr><td className="v">2</td><td className="v">2.50</td><td className="v">2.86 mV</td><td className="v">14.31 mW</td></tr>
          <tr><td className="v">4</td><td className="v">1.25</td><td className="v">1.43 mV</td><td className="v">7.15 mW</td></tr>
          <tr><td className="v">6</td><td className="v">0.83</td><td className="v">0.95 mV</td><td className="v">4.77 mW</td></tr>
        </tbody>
      </table>
      <p>
        The table describes ideal electrical sharing, not approved current ratings. For example, a 1 mV barrel-drop budget requires at least six of these vias at 5 A and
        the assumed temperature: N ≥ IR / 0.001 V. A 2 mV budget requires at least three. Temperature, manufacturing margin and the copper feeding the vias still need checking.
      </p>
      <p>
        Vias at the front of an array can take more current when a narrow trace feeds that side. Place the transition where the current enters or leaves the layer and provide
        enough copper for it to spread into the array. TI illustrates multiple-via power connections and also warns that grouped clearances can cut the return plane.
        <Cite n={1} />
      </p>
      <TryIt to="/trace-width">Check the current path feeding the via array</TryIt>

      <h2>Continuous current, pulses and shorter transitions</h2>
      <p>
        For a rectangular current pulse switching between zero and Ipeak with duty cycle D, Irms = Ipeak × √D. Average resistive loss is Irms²R when resistance is approximately
        constant. Peak voltage drop still uses Ipeak. A 10 A pulse at 25 % duty cycle has 5 A RMS, but that alone does not establish its peak-temperature or surge capability:
        the pulse duration and thermal time response also matter.
      </p>
      <p>
        If current leaves the barrel on an inner layer, use the actual current-carrying length for that resistance calculation. Halving the length halves the barrel resistance.
        It does not automatically double the allowed current; the heat paths and the copper attached to the via also change.
      </p>

      <h2>Before choosing the final via count</h2>
      <ol>
        <li>Use the finished hole and the fabricator's minimum barrel plating, with the actual conducting length.</li>
        <li>Set a voltage-drop budget and calculate barrel loss at a realistic copper temperature.</li>
        <li>Check current sharing, trace necks, plane connections and the return path around the array.</li>
        <li>Use the current-capacity estimate as a preliminary check, then verify temperature on the intended construction where the margin matters.</li>
      </ol>
    </Guide>
  );
}
