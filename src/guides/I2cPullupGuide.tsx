import { Cite, Guide, TryIt } from './Guide';

export default function I2cPullupGuide() {
  return <Guide sources={[
    { text: 'Texas Instruments SLVA689, I2C Bus Pull-Up Resistor Calculation: resistance bounds and the 3.3 V, 200 pF Fast-mode example.', url: 'https://www.ti.com/lit/pdf/slva689' },
    { text: 'NXP UM10204, I2C-bus Specification and User Manual, Rev. 7: Standard/Fast/Fast-mode Plus electrical limits and bus capacitance.', url: 'https://www.nxp.com/docs/en/user-guide/UM10204.pdf' },
    { text: 'Texas Instruments SLVA704, Understanding the I2C Bus: open-drain signalling and bus design considerations.', url: 'https://www.ti.com/lit/pdf/slva704' },
  ]}>
    <p><b>4.7 kΩ is a component value, not an I²C design rule.</b> On a lightly loaded line it can be suitable; on a larger Fast-mode bus it can be too slow. A smaller resistor speeds up the rising edge but increases the current each device must sink. Calculate both limits for SDA and SCL. <Cite n={[1, 2]} /></p>
    <h2>Why the resistance has two bounds</h2>
    <p>An open-drain driver actively pulls the line LOW. When every driver releases it, the pull-up charges the total bus capacitance. The LOW-voltage guarantee sets the minimum resistor; the permitted rise time sets the maximum. The familiar RC rise-time relation measures 30% to 70% of the supply:</p>
    <div className="eq">R<sub>P,min</sub> = (V<sub>DD</sub> − V<sub>OL,max</sub>)/I<sub>OL</sub></div>
    <div className="eq">t<sub>r</sub> = ln(7/3) R<sub>P</sub>C<sub>B</sub> ≈ 0.8473 R<sub>P</sub>C<sub>B</sub></div>
    <div className="eq">R<sub>P,max</sub> = t<sub>r,max</sub>/(0.8473 C<sub>B</sub>)</div>
    <p>Use the weakest guaranteed driver on that line, at your supply voltage and operating conditions. Mode-specific minimum rise time and bus-capacitance limits must also be checked; a passive resistor cannot fix an oversized bus by itself. <Cite n={[1, 2]} /></p>
    <h2>Worked example: 3.3 V, 200 pF, 400 kHz</h2>
    <p>TI’s Fast-mode example uses 3.3 V, 200 pF, a 0.4 V maximum LOW voltage and a 3 mA sink guarantee. The maximum 30–70% rise time is 300 ns. It gives R<sub>P,min</sub> = 966.67 Ω and R<sub>P,max</sub> ≈ 1,770.3 Ω. <Cite n={1} /></p>
    <table className="tbl"><thead><tr><th>Pull-up</th><th className="v">Nominal rise time</th><th className="v">Current at 0.4 V LOW</th><th>Fast-mode rise check</th></tr></thead><tbody>
      <tr><td>4.7 kΩ</td><td className="v">796.5 ns</td><td className="v">0.617 mA</td><td>Too slow</td></tr>
      <tr><td>2.2 kΩ</td><td className="v">372.8 ns</td><td className="v">1.318 mA</td><td>Too slow</td></tr>
      <tr><td>1.5 kΩ</td><td className="v">254.2 ns</td><td className="v">1.933 mA</td><td>Within the rise-time limit</td></tr>
    </tbody></table>
    <TryIt to="/i2c-pullup?mode=fast&vdd=3.3&cap=200&vol=0.4&sink=3&resistance=1500&tolerance=1">Check 1.5 kΩ against both limits and resistor tolerance</TryIt>
    <p>With 1% tolerance, the nominal resistance must lie between R<sub>P,min</sub>/0.99 and R<sub>P,max</sub>/1.01, approximately 976.4 Ω to 1,752.8 Ω. The 1.5 kΩ part still fits. Its maximum-resistance rise time is approximately 256.7 ns. Supply, capacitance and device limits in this example stay fixed; use their worst-case bounds in a real design.</p>
    <p>For the same 200 pF bus in Standard-mode, the 1,000 ns maximum rise time would permit the nominal 4.7 kΩ example, subject to the remaining device and timing checks. If capacitance falls to 50 pF, 4.7 kΩ instead gives about 199.1 ns and can meet the Fast-mode rise-time requirement. The useful resistor changes with the bus. <Cite n={2} /></p>
    <h2>Estimate capacitance on each line</h2>
    <p>Add every connected pin’s capacitance, the copper on every branch, cables, connectors, protection parts and level shifters. SDA and SCL can have different totals. The calculator’s optional estimator sums a trace model or known capacitance per length, pin capacitance, cable capacitance and extra capacitance. Enter maximum datasheet values where available. <Cite n={[2, 3]} /></p>
    <p>Trace length alone is insufficient: width, dielectric spacing, dielectric constant and adjacent copper change capacitance per length. Use the geometry estimator for a preliminary value, or enter a known pF/cm value from a solver. A cable’s pF/m also needs its own specification. Keep the estimator disabled when you already have a total from measurement or simulation.</p>
    <TryIt to="/i2c-pullup?capSource=estimate">Enable the capacitance estimator and build a per-line budget</TryIt>
    <h2>Include module pull-ups already on the bus</h2>
    <p>Resistors fitted to multiple modules act in parallel. Three 4.7 kΩ pull-ups give 1,566.7 Ω, not 4.7 kΩ; six give 783.3 Ω. At 3.3 V and 0.4 V LOW, the latter asks for approximately 3.70 mA, exceeding the example’s 3 mA guarantee. More pull-ups can cure a slow edge and simultaneously invalidate the LOW-level guarantee.</p>
    <p>Before choosing a resistor, count all fitted pull-ups and confirm the voltage they connect to is compatible with every pin. Check the actual LOW voltage and rise time on the assembled bus. These resistor calculations address electrical edges; protocol timing, buffers, level translation and wiring still need their own checks. <Cite n={[2, 3]} /></p>
  </Guide>;
}
