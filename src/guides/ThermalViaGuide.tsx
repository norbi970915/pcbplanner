import { Cite, Guide, TryIt } from './Guide';

export default function ThermalViaGuide() {
  return <Guide sources={[
    { text: 'Texas Instruments SLMA002H, PowerPAD Thermally Enhanced Package, sections 2.3 and 2.4: thermal lands, vias, plane connections and assembly.', url: 'https://www.ti.com/lit/an/slma002h/slma002h.pdf' },
    { text: 'Texas Instruments SPRA953D, Semiconductor and IC Package Thermal Metrics: thermal-resistance definitions and the limitations of datasheet metrics.', url: 'https://www.ti.com/lit/pdf/spra953' },
  ]}>
    <p><b>A thermal via conducts heat through its plated copper barrel; filling the hole adds a parallel conduction path.</b> An array helps carry heat to other copper layers, but its vertical resistance is only part of the cooling problem. The package connection, lateral spreading and transfer to ambient still matter. <Cite n={[1, 2]} /></p>
    <h2>Use the finished hole and the barrel plating</h2>
    <p>PCBPlanner models a straight, uniform tube through board thickness h. If d is the finished hole and t is the radial plating thickness, the outside diameter is d + 2t:</p>
    <div className="eq">ABARREL = π[(d + 2t)² − d²]/4 &nbsp;&nbsp; AHOLE = πd²/4</div>
    <div className="eq">RVIA = h/(kCU ABARREL + kFILL AHOLE)</div>
    <p>Lengths must be in metres and areas in square metres for thermal resistance in K/W, numerically equal to °C/W. The tool uses kCU = 401 W/(m·K). An open hole uses zero fill conductivity in this simplified model. The remaining laminate beneath the pad adds another parallel path:</p>
    <div className="eq">1/RTOTAL = N/RVIA + kLAM ALAM/h</div>
    <p>ALAM excludes the outside cross-section of all barrels. The formula assumes a uniform temperature at each end of the array; it does not solve heat spreading within a real pad or plane.</p>
    <h2>Worked example: nine vias under a 3 mm pad</h2>
    <p>Take nine vias under a 3 × 3 mm pad, with 0.30 mm finished holes, 25 µm barrel plating, 1.6 mm board thickness and laminate conductivity of 0.3 W/(m·K). Assume 2 W passes through this modeled vertical path.</p>
    <table className="tbl"><thead><tr><th>Open-via quantity</th><th className="v">Calculated value</th></tr></thead><tbody>
      <tr><td>One copper barrel</td><td className="v">156.316 °C/W</td></tr>
      <tr><td>Nine barrels in parallel</td><td className="v">17.368 °C/W</td></tr>
      <tr><td>Array plus laminate</td><td className="v">16.920 °C/W</td></tr>
      <tr><td>Top-to-bottom drop at 2 W</td><td className="v">33.840 °C</td></tr>
    </tbody></table>
    <TryIt to="/thermal-vias?n=9&hole=0.3&plating=0.025&len=1.6&fill=none&padW=3&padH=3&kLam=0.3&p=2">Load the nine-via example in the Thermal Via Array calculator</TryIt>
    <h2>Does filling the hole improve cooling?</h2>
    <p>Keeping that geometry fixed gives the following model results. The conductivities are illustrative calculator presets; use the fabricator's actual fill-material value when it is available.</p>
    <table className="tbl"><thead><tr><th>Fill</th><th className="v">kFILL, W/(m·K)</th><th className="v">Array + laminate, °C/W</th><th className="v">Drop at 2 W, °C</th></tr></thead><tbody>
      <tr><td>Open</td><td className="v">0</td><td className="v">16.920</td><td className="v">33.840</td></tr>
      <tr><td>Non-conductive epoxy</td><td className="v">0.25</td><td className="v">16.892</td><td className="v">33.784</td></tr>
      <tr><td>Conductive epoxy</td><td className="v">3.5</td><td className="v">16.531</td><td className="v">33.062</td></tr>
      <tr><td>Copper</td><td className="v">401</td><td className="v">4.576</td><td className="v">9.152</td></tr>
    </tbody></table>
    <p>In this example, low-conductivity epoxy barely changes the thermal resistance because the barrel dominates conduction. Filling can still serve an assembly purpose. A resin-filled, copper-capped via is not a solid copper-filled via: its core remains resin, and this model does not separately represent the cap.</p>
    <TryIt to="/thermal-vias?n=9&hole=0.3&plating=0.025&len=1.6&fill=copper&padW=3&padH=3&kLam=0.3&p=2">Compare the same array with copper filling</TryIt>
    <p>To keep the open-via result alongside your edits, use Compare in the Results header, then change fill or via count. Baseline A stays fixed while the current calculation updates.</p>
    <h2>A temperature drop is not a junction temperature</h2>
    <p>The 33.840 °C figure is the difference between the modeled top and bottom surfaces when the specified 2 W crosses that path. It is not the rise above ambient. Real heat can leave by several paths, and inner planes intercept heat before it reaches the bottom. Avoid adding this resistance to a measured or datasheet θJA that already includes the PCB path. <Cite n={2} /></p>
    <h2>Check the assembly and plane connections</h2>
    <p>Follow the package's exposed-pad dimensions, electrical connection and via recommendations. TI's PowerPAD guidance explains the importance of soldering the exposed pad, controlling solder loss into holes and connecting thermal vias solidly to planes. Confirm the fill, cap and stencil process with the assembler; the schematic via drawing does not calculate pitch or certify that the array fits. <Cite n={1} /></p>
    <TryIt to="/copper-heat-spreading">Check how the receiving copper spreads heat and transfers it to air</TryIt>
  </Guide>;
}
