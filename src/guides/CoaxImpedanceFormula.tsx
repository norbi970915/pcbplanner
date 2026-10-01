import { Cite, Guide, TryIt } from './Guide';

export default function CoaxImpedanceFormula() {
  return (
    <Guide sources={[
      { text: 'Analog Devices, Transmission Lines and Standing Waves laboratory guide: characteristic impedance from distributed L and C and the coaxial diameter-ratio formula.', url: 'https://wiki.analog.com/university/labs/tlines_standing_waves_adalm2000' },
      { text: 'D. M. Pozar, Microwave Engineering, 4th ed., Wiley, 2012, §2.2/Table 2.1 and §2.7: coaxial TEM line parameters and conductor loss.' },
      { text: 'Analog Devices, Impact of Cable Losses: skin-effect and dielectric-loss contributions to cable attenuation.', url: 'https://www.analog.com/en/resources/technical-articles/impact-of-cable-losses.html' },
      { text: 'Rohde & Schwarz, Cable Impedance Measurement: measuring a cable impedance with a VNA and a quarter-wave section.', url: 'https://www.rohde-schwarz.com/us/products/test-and-measurement/essentials-test-equipment/spectrum-analyzers/cable-impedance-measurement_257988.html' },
    ]}>
      <p><b>Coax impedance comes from a diameter <i>ratio</i>, not a particular cable diameter.</b> Making both conductors twice as large keeps an ideal coax at the same characteristic impedance. It changes loss and the frequency at which higher-order modes can propagate, so impedance alone does not identify a usable cable. <Cite n={[1, 2]} /></p>

      <h2>The concentric-coax formula</h2>
      <p>Let <i>d</i> be the outside diameter of the centre conductor and <i>D</i> the <i>inside</i> diameter of the shield. For a uniform dielectric with relative permittivity ε<sub>r</sub>, non-magnetic conductors and a TEM wave, the characteristic impedance is <Cite n={[1, 2]} />:</p>
      <div className="eq">Z<sub>0</sub> = (η<sub>0</sub> / 2π√ε<sub>r</sub>) ln(<i>D</i>/<i>d</i>) ≈ (59.96 Ω / √ε<sub>r</sub>) ln(<i>D</i>/<i>d</i>)</div>
      <p>Use the natural logarithm, ln. If the logarithm on a calculator is base 10, the equivalent coefficient is about 138 Ω. The dielectric and the ratio <i>D/d</i> both matter: a higher ε<sub>r</sub> lowers Z<sub>0</sub>, while a larger space between the conductors raises it.</p>

      <h2>A worked 50 Ω example</h2>
      <p>Take <i>d</i> = 1.00 mm, <i>D</i> = 3.50 mm and ε<sub>r</sub> = 2.25. The formula gives Z<sub>0</sub> = 59.96/1.5 × ln(3.5) = <b>50.08 Ω</b>. The velocity factor is 1/√2.25 = 0.667, so the delay is √2.25/<i>c</i> = <b>5.00 ns/m</b>. At 1 GHz a quarter wavelength in this dielectric is about 50.0 mm. These are ideal uniform-line values, not a guarantee for a finished cable. <Cite n={2} /></p>
      <TryIt to="/coax-impedance?D=3.5&d=1&er=2.25">Check the diameter ratio and delay in the coax calculator</TryIt>

      <h2>Choosing a diameter or a cable</h2>
      <p>For a target impedance, rearrange the formula: <i>D/d</i> = exp(2πZ<sub>0</sub>√ε<sub>r</sub>/η<sub>0</sub>). This solves an ideal geometry, but a cable data sheet may specify a velocity factor rather than a single bulk ε<sub>r</sub>. It may also use a foamed dielectric, a plated or stranded conductor and a braided shield. Enter its documented dimensions or velocity factor; do not treat the ideal smooth-conductor loss estimate as a cable data-sheet rating. <Cite n={[2, 3]} /></p>
      <p>The coax tool also estimates the first higher-order TE11 cutoff. TEM operation does not end at that exact number in a real connector assembly: connectors, bends and an off-centre conductor can disturb the field, and loss usually matters well before the cutoff. Use the cable and connector data sheets for operating limits. <Cite n={[2, 4]} /></p>
    </Guide>
  );
}
