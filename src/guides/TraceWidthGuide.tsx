import { Cite, Guide, TryIt } from './Guide';

export default function TraceWidthGuide() {
  return <Guide sources={[
    { text: 'D. G. Brooks with J. Adam, Trace Currents and Temperatures Revisited, April 2015: IPC-2152 measurements, external-trace regression and board-condition limitations. Author paper, hosted copy.', url: 'https://www.mathscinotes.com/wp-content/uploads/2016/06/pcbtempr.pdf' },
    { text: 'PCBPlanner Trace Width calculator, Method, formulas and references: implemented IPC-2221 coefficients, units and IPC-2152 curve-fit scope.', url: 'https://www.pcbplanner.com/trace-width#method' },
    { text: 'D. Brooks and J. Adam, UltraCAD thermal mini-course: trace heating, cooling and current density.', url: 'https://www.ultracad.com/mini_course/mini.htm' },
  ]}>
    <p><b>A trace can meet a temperature-rise estimate and still lose too much voltage.</b> Size the conductor for both thermal and electrical requirements, using the actual copper thickness, route length and operating conditions. A calculator width is an estimate for its stated model, not a board-wide current rating.</p>
    <h2>What the IPC-2221 calculation does</h2>
    <p>The implemented relationship is:</p>
    <div className="eq">I = k · ΔT<sup>0.44</sup> · A<sup>0.725</sup></div>
    <p>I is in amperes, A in square mils, and ΔT is the rise above ambient in °C. PCBPlanner uses k = 0.048 for external layers and 0.024 for internal layers. It solves for cross-section, then divides by copper thickness to get width. Do not enter square millimetres into the square-mil equation. <Cite n={2} /></p>
    <h2>Worked example: 3 A through a 50 mm trace</h2>
    <p>Assume 35 µm copper, a 10 °C allowed rise, 25 °C ambient and 50 mm route length. The IPC-2221 model gives the following values; resistance is evaluated at the resulting 35 °C conductor temperature.</p>
    <table className="tbl"><thead><tr><th>Quantity</th><th className="v">External</th><th className="v">Internal</th></tr></thead><tbody>
      <tr><td>Calculated width</td><td className="v">1.367 mm</td><td className="v">3.556 mm</td></tr>
      <tr><td>Cross-section</td><td className="v">0.04785 mm²</td><td className="v">0.12447 mm²</td></tr>
      <tr><td>Trace resistance</td><td className="v">19.079 mΩ</td><td className="v">7.334 mΩ</td></tr>
      <tr><td>Voltage drop at 3 A</td><td className="v">57.238 mV</td><td className="v">22.002 mV</td></tr>
      <tr><td>Trace dissipation</td><td className="v">171.713 mW</td><td className="v">66.007 mW</td></tr>
    </tbody></table>
    <TryIt to="/trace-width?std=ipc2221&mode=width&current=3&t=0.035&dT=10&amb=25&len=50">Reproduce the 3 A trace-width and voltage-drop example</TryIt>
    <h2>Check voltage drop separately</h2>
    <div className="eq">R = ρ(TCOND)L/(W tCU) &nbsp;&nbsp; VDROP = IR &nbsp;&nbsp; PLOSS = I²R</div>
    <p>Here W is width, tCU is copper thickness and TCOND is conductor temperature. PCBPlanner uses copper resistivity 1.7241 × 10<sup>−8</sup> Ω·m at 20 °C and a temperature coefficient of 0.00393/°C. The external example loses about 1.73% of a 3.3 V rail in this one conductor. The return path, connector and vias add further drop.</p>
    <p>Changing only the length from 50 to 100 mm doubles this model's resistance, drop and loss. Its IPC width remains unchanged because route length is not an input to that empirical sizing relationship. If the drop is unacceptable, increase width or copper thickness and check again.</p>
    <TryIt to="/trace-width?std=ipc2221&mode=temp&current=3&width=2&t=0.035&amb=25&len=50">Check the temperature rise and drop of a chosen 2 mm trace</TryIt>
    <h2>What changes with the IPC-2152 option?</h2>
    <p>The tool's IPC-2152 option is the Brooks–Adam external-trace regression, rather than a reproduction of every IPC-2152 chart or modifier. It compares the fit with the IPC-2221 external result:</p>
    <div className="eq">ΔT = 215.3 · I² · W<sup>−1.15</sup> · Th<sup>−1</sup></div>
    <p>W and Th are width and thickness in mils. The fit was derived from 2 oz and 3 oz external-trace data; thinner copper is an extrapolation. The paper's plotted comparisons cover widths of 5–200 mil, current up to about 20 A and rises up to about 100 °C. Nearby copper, planes and the board construction affect cooling, so the fitted result does not model all the conditions of your board. <Cite n={1} /></p>
    <TryIt to="/trace-width?std=ipc2152&mode=width&current=3&t=0.07&dT=10&amb=25&len=50">Compare the implemented models using 70 µm copper</TryIt>
    <h2>Finish the current path, not just the straight trace</h2>
    <p>Check neck-downs at pads, vias and connector pins, and evaluate the complete supply and return loop. A current-density number alone does not describe heat removal. For pulsed loads, fault currents, strong airflow or closely coupled heat sources, choose an analysis that represents those conditions and confirm critical temperatures and drops on hardware. <Cite n={3} /></p>
    <TryIt to="/via?target=3&amb=25&dT=10&handoff=1">Carry the 3 A requirement into the Via Calculator</TryIt>
  </Guide>;
}
