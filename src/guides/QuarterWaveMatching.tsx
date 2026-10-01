import { Cite, Guide, TryIt } from './Guide';

export default function QuarterWaveMatching() {
  return (
    <Guide sources={[
      { text: 'Keysight, RF Design Software Learning Kit, chapter 4: single- and multisection quarter-wave transformers, including the 50 Ω to 100 Ω, 70.71 Ω example.', url: 'https://www.keysight.com/us/en/assets/7018-05596/application-notes/5992-2079.pdf' },
      { text: 'Rohde & Schwarz, Cable Impedance Measurement: the quarter-wave impedance-inversion principle.', url: 'https://www.rohde-schwarz.com/us/products/test-and-measurement/essentials-test-equipment/spectrum-analyzers/cable-impedance-measurement_257988.html' },
      { text: 'D. M. Pozar, Microwave Engineering, 4th ed., Wiley, 2012, §2.3 and §§5.4–5.7: terminated-line input impedance and quarter-wave, binomial and Chebyshev transformers.' },
    ]}>
      <p><b>A quarter-wave section matches a real 100 Ω load to a 50 Ω system if that section is 70.71 Ω.</b> It works because a lossless 90° transmission line inverts a load impedance. The result is exact at its design frequency in the ideal line model, but the line must have the right <i>electrical</i> length and its match changes with frequency. <Cite n={[1, 2]} /></p>

      <h2>The impedance transformation</h2>
      <p>For a lossless line of characteristic impedance Z<sub>t</sub> terminated by Z<sub>L</sub>, its input impedance at a quarter wavelength is Z<sub>in</sub> = Z<sub>t</sub>²/Z<sub>L</sub>. To make Z<sub>in</sub> equal to a real source impedance Z<sub>0</sub>, choose: <Cite n={[1, 3]} /></p>
      <div className="eq">Z<sub>t</sub> = √(Z<sub>0</sub>Z<sub>L</sub>) &nbsp;·&nbsp; ℓ = <i>c</i>/(4<i>f</i><sub>0</sub>√ε<sub>eff</sub>)</div>
      <p>For 50 Ω and 100 Ω, Z<sub>t</sub> = √5000 = <b>70.71 Ω</b>. At 1 GHz with ε<sub>eff</sub> = 2.25, the length is <b>49.97 mm</b>. At the design frequency Z<sub>in</sub> = 70.71²/100 = 50 Ω. At twice that frequency the section is half a wavelength and repeats the 100 Ω load instead of matching it. <Cite n={[1, 3]} /></p>
      <TryIt to="/quarter-wave-transformer?f=1000000000&z0=50&zl=100&n=1&line=eeff&eeff=2.25">Check the 50 Ω to 100 Ω transformer and its frequency response</TryIt>

      <h2>Why the physical length is not always λ/4 in free space</h2>
      <p>The wavelength is shorter in a dielectric. For a stripline or uniform coax, ε<sub>eff</sub> is close to the filling dielectric's ε<sub>r</sub>; a microstrip's fields run partly in air, so its ε<sub>eff</sub> is lower and depends on the geometry. Enter a solved trace width and effective permittivity for the actual stackup rather than dividing the free-space wavelength by four. Bends, steps and open ends add parasitic reactance. <Cite n={3} /></p>

      <h2>When one section is too narrow-band</h2>
      <p>A single section produces a match at its centre frequency and a limited band around it. Adding sections trades board area for bandwidth. A binomial design makes the response flat near the centre; a Chebyshev design accepts controlled ripple to gain a wider specified passband. The tool shows both the designed impedances and an exact cascade response, because the simple design equations use a small-reflection approximation. <Cite n={[1, 3]} /></p>
      <p>A complex load is not matched by the real-to-real √(Z<sub>0</sub>Z<sub>L</sub>) formula alone. For that case, use a stub or an L-network and verify the full frequency sweep. <Cite n={3} /></p>
      <TryIt to="/impedance-matching">Design a lumped-element match for a complex load</TryIt>
    </Guide>
  );
}
