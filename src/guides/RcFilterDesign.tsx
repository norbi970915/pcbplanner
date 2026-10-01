import { Cite, Guide, TryIt } from './Guide';

export default function RcFilterDesign() {
  return <Guide sources={[
    { text: 'Analog Devices University, An Introduction to Electrical Filters: passive RC topologies and frequency response.', url: 'https://wiki.analog.com/university/courses/engineering_discovery/lab_5' },
    { text: 'Analog Devices, A Filter Primer: poles, filter order and practical response characteristics.', url: 'https://www.analog.com/en/resources/technical-articles/a-filter-primer.html' },
    { text: 'Texas Instruments SBAA178, Determining Minimum Acquisition Times for SAR ADCs: input resistance, sample capacitance and settling.', url: 'https://www.ti.com/lit/pdf/sbaa178' },
    { text: 'Texas Instruments SPRACZ0A, Charge-Sharing Driving Circuits for C2000 ADCs: external filter capacitors and sample-capacitor charge sharing.', url: 'https://www.ti.com/lit/pdf/spracz0' },
  ]}>
    <p><b>A cutoff frequency does not uniquely specify an RC filter.</b> A 1 kΩ resistor with 100 nF and a 10 kΩ resistor with 10 nF have the same ideal pole, but they load the source differently and behave differently at an ADC input. Start with the frequency response you need, then check the surrounding circuit. <Cite n={[1, 3]} /></p>
    <h2>Low-pass or high-pass?</h2>
    <p>A low-pass has a series resistor and a capacitor from the output to ground; it preserves DC and attenuates high frequencies. A high-pass puts the capacitor in series and the resistor from output to ground; it blocks DC. For an ideal voltage source and an unloaded output, both have τ = RC and f<sub>c</sub> = 1/(2πRC). At that frequency the voltage magnitude is 1/√2 of the passband value, or −3.0103 dB. <Cite n={1} /></p>
    <div className="eq">H<sub>LP</sub>(jω) = 1/(1 + jωRC) &nbsp; · &nbsp; H<sub>HP</sub>(jω) = jωRC/(1 + jωRC)</div>
    <p>Far beyond the pole, the low-pass falls by approximately 20 dB per decade; the high-pass has that slope below its pole. These are first-order responses, with a gradual transition. A cutoff alone cannot show whether unwanted frequencies receive enough attenuation. <Cite n={2} /></p>
    <h2>Worked example: 1 kΩ and 100 nF</h2>
    <p>Use R = 1,000 Ω, C = 100 × 10<sup>−9</sup> F, no source resistance and no load. Then τ = 100 µs and f<sub>c</sub> = 1,591.55 Hz. The following values come directly from the two transfer functions:</p>
    <table className="tbl"><thead><tr><th>Probe frequency</th><th>Low-pass magnitude</th><th>High-pass magnitude</th></tr></thead><tbody>
      <tr><td>100 Hz</td><td>0.9980 (−0.0171 dB)</td><td>0.06271 (−24.05 dB)</td></tr>
      <tr><td>1,591.55 Hz</td><td>0.7071 (−3.0103 dB)</td><td>0.7071 (−3.0103 dB)</td></tr>
      <tr><td>10 kHz</td><td>0.1572 (−16.07 dB)</td><td>0.9876 (−0.1086 dB)</td></tr>
    </tbody></table>
    <TryIt to="/rc-filter?kind=lowpass&mode=analyse&r=1000&c=1e-7&rs=0&rl=0&f=10000">Try the low-pass example and inspect gain and phase</TryIt>
    <TryIt to="/rc-filter?kind=highpass&mode=analyse&r=1000&c=1e-7&rs=0&rl=0&f=10000">Switch to the corresponding high-pass example</TryIt>
    <h2>Source and load resistance change the result</h2>
    <p>For the low-pass, let R<sub>T</sub> = R + R<sub>S</sub> and connect a resistive load R<sub>L</sub> from output to ground. Circuit reduction gives a DC gain of R<sub>L</sub>/(R<sub>T</sub> + R<sub>L</sub>) and τ = (R<sub>T</sub> ∥ R<sub>L</sub>)C. The pole is measured relative to this reduced passband.</p>
    <p>Add a 10 kΩ load to the 1 kΩ / 100 nF example: DC gain becomes 10/11 = 0.9091, and the pole rises to 1,750.70 Hz. At the pole, the absolute gain is 0.6428, or approximately −3.838 dB relative to the source. A source resistance of 1 kΩ with no load instead doubles the time constant and lowers the pole to 795.77 Hz.</p>
    <TryIt to="/rc-filter?kind=lowpass&r=1000&c=1e-7&rs=0&rl=10000&f=1750.704374">Check the loaded example</TryIt>
    <p>For the high-pass topology used in the calculator, the output resistor and external load combine as R<sub>P</sub> = R ∥ R<sub>L</sub>. Its high-frequency gain is R<sub>P</sub>/(R<sub>S</sub> + R<sub>P</sub>), and τ = (R<sub>S</sub> + R<sub>P</sub>)C. Enter the source and load explicitly before choosing standard parts.</p>
    <h2>Check tolerances and settling</h2>
    <p>For an unloaded ideal circuit, independently bounded R = 1 kΩ ±1% and C = 100 nF ±10% put the cutoff between 1,432.54 and 1,786.25 Hz. These are worst-case product corners, not a statistical distribution. A nominal 1.59 kHz filter therefore needs margin if an attenuation requirement is tight.</p>
    <p>The ideal low-pass step error decays as e<sup>−t/τ</sup>. A full-span step settling below ½ LSB of a 12-bit converter needs t ≥ τ ln(8,192), or 901.09 µs for τ = 100 µs. This simple calculation describes the external filter reaching its final value; a switched SAR input has its own sample capacitor and acquisition window. <Cite n={3} /></p>
    <p>A large shunt capacitor can supply sampling charge, but it also has to recharge through the source between samples. Use the ADC input checker with the actual sampling-switch resistance and capacitance from the device datasheet. A passive filter does not automatically satisfy acquisition timing or provide enough anti-alias attenuation. <Cite n={4} /></p>
    <TryIt to="/adc-input">Check the selected filter against an ADC acquisition window</TryIt>
  </Guide>;
}
