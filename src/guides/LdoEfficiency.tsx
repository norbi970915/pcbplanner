import { Cite, Guide, TryIt } from './Guide';

export default function LdoEfficiency() {
  return <Guide sources={[
    { text: 'Analog Devices, Understand Low-Dropout Regulator Concepts to Achieve Optimal Designs: efficiency, ground current, headroom and dropout.', url: 'https://www.analog.com/en/resources/analog-dialogue/articles/understand-ldo-concepts.html' },
    { text: 'Analog Devices AN-140, Basic Concepts of Linear Regulator and Switching Mode Power Supplies: linear versus switching power conversion.', url: 'https://www.analog.com/en/resources/app-notes/an-140.html' },
    { text: 'Texas Instruments SPRA953D, Semiconductor and IC Package Thermal Metrics: limitations of θJA and correct uses of thermal metrics.', url: 'https://www.ti.com/lit/pdf/spra953' },
    { text: 'Analog Devices, How to Successfully Apply Low-Dropout Regulators: operating conditions, dropout and noise-sensitive supplies.', url: 'https://www.analog.com/en/resources/analog-dialogue/articles/applying-low-dropout-regulators.html' },
  ]}>
    <p><b>An LDO’s efficiency is limited by the ratio of output voltage to input voltage.</b> A larger package can help remove heat, but cannot recover the power lost across the pass element. Calculate efficiency and dissipation before deciding whether a linear regulator is suitable for the rail. <Cite n={[1, 2]} /></p>
    <h2>Include the ground current</h2>
    <p>In steady regulation, the source supplies both the load and the regulator’s ground-pin current. If I<sub>G</sub> is the ground current at the actual load, input power is V<sub>IN</sub>(I<sub>OUT</sub> + I<sub>G</sub>). Subtract the load’s output power to find what the regulator dissipates:</p>
    <div className="eq">P<sub>D</sub> = (V<sub>IN</sub> − V<sub>OUT</sub>)I<sub>OUT</sub> + V<sub>IN</sub>I<sub>G</sub></div>
    <div className="eq">η = V<sub>OUT</sub>I<sub>OUT</sub> / [V<sub>IN</sub>(I<sub>OUT</sub> + I<sub>G</sub>)]</div>
    <p>Only when ground current is small relative to load current does η ≈ V<sub>OUT</sub>/V<sub>IN</sub>. At a light load, that approximation can become optimistic. Use the datasheet’s ground-current figure for the operating point; unloaded quiescent current and loaded ground current need not be identical. <Cite n={1} /></p>
    <h2>Worked example: 5 V to 3.3 V at 500 mA</h2>
    <p>This illustrative operating point assumes 1 mA ground current, 0.3 V dropout, 40 °C ambient and an effective θ<sub>JA</sub> of 60 °C/W. These are inputs for the calculation, not specifications of a selected component.</p>
    <table className="tbl"><thead><tr><th>Quantity</th><th className="v">Calculation</th></tr></thead><tbody>
      <tr><td>Output power</td><td className="v">3.3 × 0.5 = 1.65 W</td></tr>
      <tr><td>Input power</td><td className="v">5 × 0.501 = 2.505 W</td></tr>
      <tr><td>Pass-element dissipation</td><td className="v">1.7 × 0.5 = 0.850 W</td></tr>
      <tr><td>Ground-current dissipation</td><td className="v">5 × 0.001 = 0.005 W</td></tr>
      <tr><td>Total dissipation</td><td className="v">0.855 W</td></tr>
      <tr><td>Efficiency</td><td className="v">65.87%</td></tr>
      <tr><td>Estimated junction temperature</td><td className="v">40 + 0.855 × 60 = 91.3 °C</td></tr>
    </tbody></table>
    <TryIt to="/ldo?vin=5&vout=3.3&iout=500&iq=1&ja=60&ta=40&tj=125&vdo=0.3">Reproduce the operating point in the LDO calculator</TryIt>
    <h2>How much load can the thermal budget support?</h2>
    <p>For a 125 °C junction limit, the assumed thermal path allows (125 − 40)/60 = 1.4167 W. After subtracting 5 mW for ground current, the model allows 1.4117/1.7 = 830.4 mA. That is a thermal estimate only: the IC’s current rating, dropout at that current and protection behaviour still have to permit it.</p>
    <p>Changing only the input to 12 V makes dissipation 4.362 W and efficiency 27.44%. The linear temperature estimate becomes 301.7 °C, far beyond the entered limit. That calculation identifies an infeasible operating point; it does not predict stable operation at that temperature.</p>
    <TryIt to="/ldo?vin=12&vout=3.3&iout=500&iq=1&ja=60&ta=40&tj=125&vdo=0.3">See why the direct 12 V linear conversion exceeds the thermal budget</TryIt>
    <h2>Dropout is a separate limit</h2>
    <p>The nominal headroom at 5 V is 1.7 V, comfortably above the illustrative 0.3 V dropout. Reducing the input improves efficiency, but sufficient headroom must remain at minimum input, maximum output, peak load and the relevant temperature. Once the pass element cannot maintain regulation, the efficiency formula no longer describes the requested regulated output. <Cite n={4} /></p>
    <h2>Use the right thermal and supply assumptions</h2>
    <p>θ<sub>JA</sub> depends on the test board and environment. Datasheet values help compare conditions, but your copper area, vias, airflow and nearby heat sources change the result. θ<sub>JC</sub> is a different metric and cannot simply replace θ<sub>JA</sub> in the ambient-temperature calculation. <Cite n={3} /></p>
    <p>A buck feeding an LDO can reduce the voltage dropped in the linear stage. For example, an assumed 90%-efficient buck feeding the 5 V example gives a combined efficiency of 0.90 × 0.6587 ≈ 59.28%, with losses distributed between the stages. Choose the intermediate rail with dropout margin and check the LDO’s PSRR at the buck’s switching frequency; the cascade does not guarantee a quiet output. <Cite n={[2, 4]} /></p>
    <TryIt to="/power-tree">Compare the currents and losses of a buck-plus-LDO supply tree</TryIt>
  </Guide>;
}
