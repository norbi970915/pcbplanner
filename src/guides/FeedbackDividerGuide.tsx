import { Cite, Guide, TryIt } from './Guide';

export default function FeedbackDividerGuide() {
  return <Guide sources={[
    { text: 'Analog Devices, How to Improve Power Supply Output Regulation Accuracy with the LTpowerCAD Resistor Divider Tool: resistor selection, reference accuracy and bias-current direction.', url: 'https://www.analog.com/en/resources/analog-dialogue/articles/how-to-improve-power-supply-output-regulation-accuracy-with-the-ltpowercad-resistor-divider-tool.html' },
    { text: 'Analog Devices, Voltage Dividers in Power Supplies: divider current, power loss and feedback-node sensitivity.', url: 'https://www.analog.com/en/resources/technical-articles/a101121-voltage-dividers-in-power-supplies.html' },
    { text: 'Texas Instruments TPS62160 datasheet, section 9.2.2.2: an example of device-specific feedback-resistor requirements.', url: 'https://www.ti.com/lit/ds/symlink/tps62160.pdf' },
  ]}>
    <p><b>The resistor ratio sets the nominal output; the absolute resistor values set the divider current and its sensitivity to feedback-pin current.</b> Choosing a pair means checking both. This guide uses R1 for the upper resistor from VOUT to FB and R2 for the lower resistor from FB to ground. Datasheets may name them differently. <Cite n={[1, 2]} /></p>
    <h2>Start with the ratio and the divider current</h2>
    <p>For a regulator that holds FB at VFB, with negligible pin current:</p>
    <div className="eq">VOUT = VFB(1 + R1/R2)</div>
    <div className="eq">R2 = VFB/IDIV &nbsp;&nbsp; R1 = R2(VOUT/VFB − 1)</div>
    <p>For an illustrative 0.8 V reference, a 3.3 V target and 100 µA through R2, the exact values are R2 = 8.00 kΩ and R1 = 25.0 kΩ. These are a starting point before selecting preferred values, not a complete regulator design.</p>
    <h2>Worked example: selecting E96 values</h2>
    <p>With those inputs and zero FB bias current, PCBPlanner selects the following pair from its candidate list. It ranks output-voltage error among nearby divider candidates, so the actual current can differ from the entered starting value. Check the reported current as well as the voltage.</p>
    <table className="tbl"><thead><tr><th>Quantity</th><th className="v">Calculated value</th></tr></thead><tbody>
      <tr><td>R1, output to FB</td><td className="v">35.7 kΩ</td></tr>
      <tr><td>R2, FB to ground</td><td className="v">11.5 kΩ</td></tr>
      <tr><td>Nominal output</td><td className="v">3.28348 V</td></tr>
      <tr><td>Error from 3.3 V</td><td className="v">−0.501%</td></tr>
      <tr><td>Current through R2</td><td className="v">69.565 µA</td></tr>
    </tbody></table>
    <TryIt to="/feedback-divider?vfb=0.8&vout=3.3&idiv=100&ifb=0&tol=1&series=E96">Load the 3.3 V E96 divider example and see both resistors</TryIt>
    <h2>Resistor tolerance changes the ratio</h2>
    <p>The highest output for this positive divider occurs with R1 high and R2 low; the lowest uses R1 low and R2 high. Holding the reference exact and neglecting bias current, independent ±1% resistors give:</p>
    <div className="eq">VHIGH = 0.8[1 + 35.7(1.01)/(11.5(0.99))] = 3.33365 V</div>
    <div className="eq">VLOW = 0.8[1 + 35.7(0.99)/(11.5(1.01))] = 3.23430 V</div>
    <p>This interval includes the selected pair's nominal ratio error. It excludes reference tolerance, load and line regulation, temperature drift and leakage variation. Use the IC's specified accuracy over your operating conditions; do not add a reference error a second time if it is already included in a combined datasheet specification. <Cite n={1} /></p>
    <h2>Check the direction of feedback-pin current</h2>
    <p>PCBPlanner defines positive IFB as current flowing from the divider into FB. The upper resistor then supplies both R2 and the pin, giving:</p>
    <div className="eq">VOUT = VFB(1 + R1/R2) + IFB R1</div>
    <p>For the fixed pair above, an assumed 100 nA into FB adds 3.57 mV. Multiplying both resistors by ten keeps the ideal ratio, but increases this shift to 35.7 mV and divides the R2 current by ten. A pin that sources current instead has the opposite sign. The calculator re-ranks its candidate pairs when IFB changes, so it may choose a different pair to compensate the nominal shift.</p>
    <TryIt to="/feedback-divider?vfb=0.8&vout=3.3&idiv=10&ifb=100&tol=1&series=E96">Explore a lower-current divider with 100 nA flowing into FB</TryIt>
    <h2>Choose values the regulator can use</h2>
    <p>There is no universal divider-current rule. As one example, TI's TPS62160 specifies at least 2 µA through its divider and limits R2 to 400 kΩ; this is a requirement for that device. Follow the selected IC's resistor ranges, leakage limits and any feed-forward capacitor guidance. <Cite n={3} /></p>
    <p>Higher resistance reduces wasted divider power but makes leakage and noise pickup more significant. Keep FB routing short and away from switching nodes, and check resistor voltage and power ratings. Preferred-value series and tolerance are separate choices: selecting E96 values does not itself guarantee the resistors you buy are 1%. <Cite n={[1, 2]} /></p>
  </Guide>;
}
