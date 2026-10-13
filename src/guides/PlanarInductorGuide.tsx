import { Cite, Guide, TryIt } from './Guide';

export default function PlanarInductorGuide() {
  return <Guide sources={[
    { text: 'S. S. Mohan, M. del Mar Hershenson, S. P. Boyd, T. H. Lee, “Simple Accurate Expressions for Planar Spiral Inductances”, IEEE Journal of Solid-State Circuits, vol. 34, no. 10, pp. 1419–1424, Oct. 1999: equations (1) and (2), Tables I and II, accuracy and fitted range.', url: 'https://web.stanford.edu/~boyd/papers/pdf/inductance_expressions.pdf' },
    { text: 'Texas Instruments SNOA930C, Sensor Design for Inductive Sensing Applications Using LDC (May 2021), sections 1.2, 2.2–2.5 and 4.2: AC resistance, turns, multiple layers, self-resonance and copper near the coil.', url: 'https://www.ti.com/lit/an/snoa930c/snoa930c.pdf' },
  ]}>
    <p><b>The inductance of a PCB spiral is set by its number of turns, its average diameter and its fill ratio, which follow from the outer diameter, trace width and spacing, and by the layout shape (square, hexagonal, octagonal or circular).</b> For a single-layer spiral with no copper close to it, use the modified Wheeler formula or the current-sheet expression of Mohan, Hershenson, Boyd and Lee; both reproduce field-solver results with typical errors of a few per cent. <Cite n={1} /> This guide works through a 1 µH square spiral on 1 oz copper, then shows how each dimension trades inductance against resistance and Q.</p>

    <h2>Geometry: outer diameter, inner diameter and fill ratio</h2>
    <p>Mohan et al. describe a spiral by its turns <i>n</i>, trace width <i>w</i>, spacing <i>s</i> and one of the outer diameter <i>d</i><sub>out</sub>, the inner diameter <i>d</i><sub>in</sub>, the average diameter or the fill ratio ρ. For the polygons the diameter is measured across flats. <Cite n={1} /> With the outer diameter given, the calculator derives the rest:</p>
    <div className="eq"><i>d</i><sub>in</sub> = <i>d</i><sub>out</sub> − 2<i>nw</i> − 2(<i>n</i> − 1)<i>s</i> &nbsp;&nbsp; <i>d</i><sub>avg</sub> = (<i>d</i><sub>out</sub> + <i>d</i><sub>in</sub>)/2 &nbsp;&nbsp; ρ = (<i>d</i><sub>out</sub> − <i>d</i><sub>in</sub>)/(<i>d</i><sub>out</sub> + <i>d</i><sub>in</sub>)</div>
    <p>A small ρ is a hollow coil (<i>d</i><sub>in</sub> close to <i>d</i><sub>out</sub>); a large ρ is a full coil wound almost to the centre. Two spirals with the same average diameter but different fill ratios have different inductances: the full one has less, because its inner turns are close to the centre and contribute less positive and more negative mutual inductance. <Cite n={1} /></p>

    <h2>The two formulas the calculator uses</h2>
    <p>The first is a modification of a formula Wheeler gave for discrete coils. The second comes from replacing each side of the spiral with a current sheet and evaluating self- and mutual inductances with geometric, arithmetic and arithmetic-square mean distances. <Cite n={1} /></p>
    <div className="eq"><i>L</i><sub>mw</sub> = <i>K</i><sub>1</sub> μ<sub>0</sub> <i>n</i><sup>2</sup> <i>d</i><sub>avg</sub> / (1 + <i>K</i><sub>2</sub> ρ)</div>
    <div className="eq"><i>L</i><sub>gmd</sub> = (μ<sub>0</sub> <i>n</i><sup>2</sup> <i>d</i><sub>avg</sub> <i>c</i><sub>1</sub>/2) · [ln(<i>c</i><sub>2</sub>/ρ) + <i>c</i><sub>3</sub>ρ + <i>c</i><sub>4</sub>ρ<sup>2</sup>]</div>
    <p>Here μ<sub>0</sub> = 4π × 10<sup>−7</sup> H/m, <i>d</i><sub>avg</sub> is in metres and ln is the natural logarithm. The coefficients depend only on the layout. The values below are Tables I and II of the paper, and they are the values in the calculator. <Cite n={1} /></p>
    <table className="tbl"><thead><tr><th>Layout</th><th className="v">K<sub>1</sub></th><th className="v">K<sub>2</sub></th><th className="v">c<sub>1</sub></th><th className="v">c<sub>2</sub></th><th className="v">c<sub>3</sub></th><th className="v">c<sub>4</sub></th></tr></thead><tbody>
      <tr><td>Square</td><td className="v">2.34</td><td className="v">2.75</td><td className="v">1.27</td><td className="v">2.07</td><td className="v">0.18</td><td className="v">0.13</td></tr>
      <tr><td>Hexagonal</td><td className="v">2.33</td><td className="v">3.82</td><td className="v">1.09</td><td className="v">2.23</td><td className="v">0.00</td><td className="v">0.17</td></tr>
      <tr><td>Octagonal</td><td className="v">2.25</td><td className="v">3.55</td><td className="v">1.07</td><td className="v">2.29</td><td className="v">0.00</td><td className="v">0.19</td></tr>
      <tr><td>Circular</td><td className="v">—</td><td className="v">—</td><td className="v">1.00</td><td className="v">2.46</td><td className="v">0.00</td><td className="v">0.20</td></tr>
    </tbody></table>
    <p>The paper gives no modified-Wheeler coefficients for a circle, so the calculator reports only the current-sheet value for that shape. The two expressions are alternatives. A single formula that multiplies the Wheeler factor <i>K</i><sub>1</sub>/(1 + <i>K</i><sub>2</sub>ρ) by the logarithmic bracket is not one of them. The paper also gives a third, data-fitted monomial expression (Table III), intended for geometric-programming optimisation; the calculator does not use it. <Cite n={1} /></p>

    <h2>Accuracy and where the formulas apply</h2>
    <p>Mohan et al. compared the expressions with about 19,000 spirals simulated in the ASITIC field solver. Typical errors were 1–2 %, and most were below about 3 %. Against about 60 measured inductors, 15 of their own and the rest from published work, they agreed within around 5 %, which the authors attribute partly to measurement error. The current-sheet expression becomes less accurate as <i>s</i>/<i>w</i> grows, with a maximum error of 8 % for <i>s</i> ≤ 3<i>w</i>. <Cite n={1} /></p>
    <p>Keep these limits in mind:</p>
    <ul>
      <li><b>They give the DC inductance</b> of a single planar spiral. Interwinding capacitance, losses and self-resonance are not part of either formula. <Cite n={1} /></li>
      <li><b>The fitted range</b> was <i>d</i><sub>out</sub> = 100–480 µm, <i>L</i> = 0.5–100 nH, <i>w</i> from 2 µm to 0.3<i>d</i><sub>out</sub>, <i>s</i> from 2 µm to 3<i>w</i>, and <i>d</i><sub>in</sub> from 0.1 to 0.9<i>d</i><sub>out</sub>. <Cite n={1} /> The calculator warns when <i>s</i> {'>'} 3<i>w</i> or <i>d</i><sub>in</sub>/<i>d</i><sub>out</sub> falls outside 0.1–0.9.</li>
      <li><b>PCB scale.</b> The spirals in the paper are on-chip. Both expressions contain only <i>n</i>, <i>d</i><sub>avg</sub> and ρ, so scaling every dimension by the same factor scales <i>L</i> by that factor, and the paper states that conductor thickness has only a very small effect on inductance. <Cite n={1} /> TI uses Mohan's expressions for single-layer PCB coils. <Cite n={2} /> The paper does not validate the coefficients at PCB dimensions, so measure a prototype when the value matters.</li>
      <li><b>No copper close to the coil.</b> Neither formula has a term for a plane, pour or other conductor near the spiral. Such copper changes the inductance (see below).</li>
      <li><b>Well below self-resonance.</b> Mohan et al. did not consider inductors above 100 nH because their total length is great enough that they can no longer be treated as lumped at the frequencies of interest. <Cite n={1} /> A 1 µH PCB coil has hundreds of millimetres of trace, so measure its self-resonant frequency.</li>
    </ul>

    <h2>Worked example: a 1 µH square spiral on 1 oz copper</h2>
    <p>Take a square spiral on an outer layer with <i>n</i> = 7, <i>w</i> = <i>s</i> = 0.2 mm, <i>d</i><sub>out</sub> = 14 mm and 35 µm (1 oz) copper. The geometry gives <i>d</i><sub>in</sub> = 14 − 2·7·0.2 − 2·6·0.2 = 8.8 mm, <i>d</i><sub>avg</sub> = 11.4 mm and ρ = 5.2/22.8 = 0.2281. The inner diameter is 0.629<i>d</i><sub>out</sub>, inside the fitted range, and <i>s</i> = <i>w</i>.</p>
    <p>Modified Wheeler: <i>L</i> = 2.34 × 4π × 10<sup>−7</sup> × 49 × 0.0114 / (1 + 2.75 × 0.2281) = <b>1,009.46 nH</b>. Current sheet: <i>L</i> = (4π × 10<sup>−7</sup> × 49 × 0.0114 × 1.27/2) × [ln(2.07/0.2281) + 0.18 × 0.2281 + 0.13 × 0.2281<sup>2</sup>] = <b>1,004.47 nH</b>. The two differ by 0.49 %.</p>
    <p>For resistance the calculator treats each turn as a closed ring. The mean of the ring diameters is exactly <i>d</i><sub>avg</sub>, so the trace length is <i>n</i> · 4 · <i>d</i><sub>avg</sub> = 319.2 mm for a square, leads excluded. With ρ<sub>Cu</sub> = 1.7241 µΩ·cm at 20 °C, <i>R</i><sub>DC</sub> = 1.7241 × 10<sup>−8</sup> × 0.3192 / (0.2 × 10<sup>−3</sup> × 35 × 10<sup>−6</sup>) = <b>0.7862 Ω</b>.</p>
    <table className="tbl"><thead><tr><th>Quantity</th><th className="v">Value</th></tr></thead><tbody>
      <tr><td>Inner diameter <i>d</i><sub>in</sub></td><td className="v">8.8 mm</td></tr>
      <tr><td>Fill ratio ρ</td><td className="v">0.2281</td></tr>
      <tr><td>Modified Wheeler <i>L</i><sub>mw</sub></td><td className="v">1,009.46 nH</td></tr>
      <tr><td>Current sheet <i>L</i><sub>gmd</sub></td><td className="v">1,004.47 nH</td></tr>
      <tr><td>Trace length (turns only)</td><td className="v">319.2 mm</td></tr>
      <tr><td>DC resistance at 20 °C</td><td className="v">0.7862 Ω</td></tr>
      <tr><td>Q = ω<i>L</i>/<i>R</i><sub>DC</sub> at 10 MHz</td><td className="v">80.68</td></tr>
    </tbody></table>
    <TryIt to="/planar-inductor?n=7&dOut=14">Open the 1 µH example in the Planar Spiral Inductor calculator</TryIt>
    <p>The Q figure uses DC resistance. It falls in proportion to frequency, to 8.07 at 1 MHz, and it is an upper bound at any frequency because AC resistance is higher than DC resistance (see Q and self-resonance below).</p>

    <h2>More turns or a different fill ratio</h2>
    <p>Keep <i>d</i><sub>out</sub> = 14 mm and <i>w</i> = <i>s</i> = 0.2 mm, and change only the number of turns. Each added turn goes inside the previous one, so <i>d</i><sub>avg</sub> shrinks and ρ grows:</p>
    <table className="tbl"><thead><tr><th className="v">n</th><th className="v">d<sub>in</sub>/d<sub>out</sub></th><th className="v">ρ</th><th className="v">L<sub>mw</sub>, nH</th><th className="v">L<sub>gmd</sub>, nH</th><th className="v">R<sub>DC</sub>, Ω</th><th className="v">Q at 10 MHz</th></tr></thead><tbody>
      <tr><td className="v">3</td><td className="v">0.857</td><td className="v">0.0769</td><td className="v">283.97</td><td className="v">308.76</td><td className="v">0.3842</td><td className="v">46.44</td></tr>
      <tr><td className="v">5</td><td className="v">0.743</td><td className="v">0.1475</td><td className="v">638.00</td><td className="v">649.96</td><td className="v">0.6010</td><td className="v">66.70</td></tr>
      <tr><td className="v">7</td><td className="v">0.629</td><td className="v">0.2281</td><td className="v">1,009.46</td><td className="v">1,004.47</td><td className="v">0.7862</td><td className="v">80.68</td></tr>
      <tr><td className="v">10</td><td className="v">0.457</td><td className="v">0.3725</td><td className="v">1,481.51</td><td className="v">1,465.09</td><td className="v">1.0049</td><td className="v">92.63</td></tr>
      <tr><td className="v">12</td><td className="v">0.343</td><td className="v">0.4894</td><td className="v">1,696.82</td><td className="v">1,686.53</td><td className="v">1.1113</td><td className="v">95.94</td></tr>
      <tr><td className="v">14</td><td className="v">0.229</td><td className="v">0.6279</td><td className="v">1,817.76</td><td className="v">1,825.49</td><td className="v">1.1862</td><td className="v">96.29</td></tr>
      <tr><td className="v">16</td><td className="v">0.114</td><td className="v">0.7949</td><td className="v">1,843.01</td><td className="v">1,883.91</td><td className="v">1.2295</td><td className="v">94.18</td></tr>
    </tbody></table>
    <p>Inductance does not grow as <i>n</i><sup>2</sup> at a fixed outer diameter. Going from 12 to 16 turns adds 8.6 % to <i>L</i><sub>mw</sub> and 10.6 % to the resistance, and the estimated Q falls after 14 turns. TI's 18 mm circular example with 0.15 mm width and spacing shows the same behaviour: its inductance levels off at about 20 turns. TI recommends <i>d</i><sub>in</sub>/<i>d</i><sub>out</sub> {'>'} 0.3 for most applications, because the inner turns add little inductance but still add resistance. <Cite n={2} /></p>
    <TryIt to="/planar-inductor?n=14&dOut=14">Compare the 14-turn version of the same footprint</TryIt>
    <p>The same 1 µH can come from different footprints. With <i>w</i> = <i>s</i> = 0.2 mm, 9 turns in 12 mm give 981.39 nH, 0.7625 Ω and Q = 80.86; 5 turns in 19 mm give 981.86 nH, 0.8473 Ω and Q = 72.81. The hollow 19 mm coil is larger and has more resistance. It also sits at <i>d</i><sub>in</sub>/<i>d</i><sub>out</sub> = 0.811, where the two expressions disagree by 5.0 % (current sheet 1,031.07 nH). A large disagreement between the models is a sign to check the design with a field solver or a measurement.</p>

    <h2>Trace width, spacing and copper thickness</h2>
    <p>With the turns and outer diameter fixed, a wider trace pushes the turns inward. Inductance falls, but resistance falls faster, so ω<i>L</i>/<i>R</i><sub>DC</sub> rises (<i>n</i> = 7, <i>d</i><sub>out</sub> = 14 mm, <i>s</i> = 0.2 mm, 35 µm copper):</p>
    <table className="tbl"><thead><tr><th className="v">w, mm</th><th className="v">d<sub>in</sub>, mm</th><th className="v">L<sub>mw</sub>, nH</th><th className="v">R<sub>DC</sub>, Ω</th><th className="v">Q at 10 MHz</th></tr></thead><tbody>
      <tr><td className="v">0.15</td><td className="v">9.5</td><td className="v">1,109.01</td><td className="v">1.0804</td><td className="v">64.49</td></tr>
      <tr><td className="v">0.2</td><td className="v">8.8</td><td className="v">1,009.46</td><td className="v">0.7862</td><td className="v">80.68</td></tr>
      <tr><td className="v">0.3</td><td className="v">7.4</td><td className="v">834.21</td><td className="v">0.4919</td><td className="v">106.55</td></tr>
      <tr><td className="v">0.4</td><td className="v">6.0</td><td className="v">686.12</td><td className="v">0.3448</td><td className="v">125.02</td></tr>
      <tr><td className="v">0.5</td><td className="v">4.6</td><td className="v">560.72</td><td className="v">0.2565</td><td className="v">137.33</td></tr>
    </tbody></table>
    <p>To keep 1 µH with a wider trace, enlarge the outer diameter or add turns. Wider spacing at a fixed width lowers both <i>L</i> and the estimated Q: with <i>w</i> = 0.2 mm, <i>s</i> = 0.15 mm gives 1,094.25 nH and Q = 85.21, while <i>s</i> = 0.6 mm gives 513.01 nH and Q = 51.93. Mohan et al. note that practical integrated spirals use <i>s</i> ≤ <i>w</i>, because smaller spacing improves magnetic coupling between turns and reduces area. A larger spacing reduces interwinding capacitance. <Cite n={1} /> TI's coil procedure starts from the minimum width and spacing the board process permits, commonly 0.1–0.15 mm, which fits the most turns into a given diameter. <Cite n={2} /> Where resistance or current matters more than footprint, a wider trace in a larger outer diameter is the alternative.</p>
    <p>Copper thickness does not enter the inductance formulas, but it sets the DC resistance. The same coil in 70 µm (2 oz) copper has <i>R</i><sub>DC</sub> = 0.3931 Ω and Q = 161.35 at 10 MHz. Scaling every planar dimension by two (<i>n</i> = 7, <i>w</i> = <i>s</i> = 0.4 mm, <i>d</i><sub>out</sub> = 28 mm) doubles the inductance to 2,018.91 nH and leaves the resistance at 0.7862 Ω, because length and width both double. If the fabricator quotes a finished outer-layer copper thickness, enter that value.</p>
    <TryIt to="/planar-inductor?n=7&dOut=14&w=0.4">Try the example with a 0.4 mm trace</TryIt>

    <h2>Square, hexagonal, octagonal or circular</h2>
    <p>For the same <i>n</i> = 7, <i>w</i> = <i>s</i> = 0.2 mm and a 14 mm diameter (across flats for the polygons), the shapes compare as follows:</p>
    <table className="tbl"><thead><tr><th>Layout</th><th className="v">L, nH</th><th className="v">Trace length, mm</th><th className="v">R<sub>DC</sub>, Ω</th><th className="v">Q at 10 MHz</th></tr></thead><tbody>
      <tr><td>Square</td><td className="v">1,009.46 (mw)</td><td className="v">319.20</td><td className="v">0.7862</td><td className="v">80.68</td></tr>
      <tr><td>Hexagonal</td><td className="v">874.06 (mw)</td><td className="v">276.44</td><td className="v">0.6809</td><td className="v">80.66</td></tr>
      <tr><td>Octagonal</td><td className="v">872.77 (mw)</td><td className="v">264.43</td><td className="v">0.6513</td><td className="v">84.20</td></tr>
      <tr><td>Circular</td><td className="v">838.37 (gmd)</td><td className="v">250.70</td><td className="v">0.6175</td><td className="v">85.31</td></tr>
    </tbody></table>
    <p>The square encloses the most area in a 14 mm footprint and gives the most inductance. The circle gives the most inductance per ohm of DC resistance. TI recommends a circular coil where possible for the best ratio of inductance to series resistance. <Cite n={2} /> A square spiral is the easiest to draw in a PCB editor; octagons are close to circles in Q.</p>
    <TryIt to="/planar-inductor?n=7&dOut=14&shape=circular">See the circular version</TryIt>

    <h2>Ground planes and copper near the coil</h2>
    <p>A conductor near a spiral carries eddy currents whose field opposes the coil's field, so the mutual inductance between them is negative and the coil's inductance falls. TI's curves for a 14 mm sensor show both inductance and parallel loss resistance decreasing as a conductive target approaches; TI notes that for some target materials they can increase instead. <Cite n={2} /> A solid copper plane on the next layer has the same effect, and the Mohan expressions do not include it. TI's layout guidance keeps ground planes, power planes and thick traces away from the coil and minimises any conductor within at least 30 % of the coil diameter, with no ground pour or copper thieving around it. <Cite n={2} /> For the 14 mm example that is 4.2 mm. Void the planes under and around the spiral on every layer, or model the plane with a field solver.</p>
    <p>A second layer can raise inductance without more area. Two aligned coils connected in series with fields adding give <i>L</i><sub>total</sub> = <i>L</i><sub>1</sub> + <i>L</i><sub>2</sub> + 2<i>M</i>; the winding direction must alternate between layers so that the current keeps circulating the same way. In TI's example, four 3.5 µH layers in a 1.0 mm board total 39 µH rather than 14 µH. <Cite n={2} /> The calculator models one layer only.</p>

    <h2>Q and self-resonance</h2>
    <p>The calculator's Q is ω<i>L</i>/<i>R</i><sub>DC</sub>. TI stresses using the AC resistance at the operating frequency, and identifies skin effect as the primary source of the increase in AC series resistance. In copper, more than 95 % of a 1 MHz current flows within 0.2 mm of the surface, and at 10 MHz within 0.06 mm. <Cite n={2} /> The site's skin-depth calculation gives δ = 66.1 µm at 1 MHz and 20.9 µm at 10 MHz at 20 °C. Treat the calculator's Q as an upper bound, and measure the coil's AC resistance or Q when it matters.</p>
    <TryIt to="/skin-effect?f=10&t=0.035&len=319.2&temp=20">Check the skin depth for the example trace at 10 MHz</TryIt>
    <p>Each turn sits next to the next across a dielectric, which forms small parasitic capacitances. At a high enough frequency the signal crosses this distributed capacitance instead of following the winding; that frequency is the self-resonant frequency (SRF). TI's sensor guidance keeps the operating frequency below 75 % of the SRF because the parasitic capacitance is not stable, and measures the SRF with an impedance analyser (where the phase crosses 0°) or a calibrated VNA. <Cite n={2} /> No formula in the calculator predicts the SRF of a PCB spiral; measure it on the first prototype.</p>

    <h2>Checklist</h2>
    <ul>
      <li>Fix the largest outer diameter the board allows, use the smallest spacing the process supports, and choose the width from the resistance budget.</li>
      <li>Choose turns for the target inductance, keeping <i>d</i><sub>in</sub>/<i>d</i><sub>out</sub> between 0.3 and 0.9 and <i>s</i> ≤ 3<i>w</i>.</li>
      <li>Compare the modified Wheeler and current-sheet results. A difference of more than a few per cent means the geometry is near the edge of the fit.</li>
      <li>Check DC resistance against the current and loss budget, and treat ω<i>L</i>/<i>R</i><sub>DC</sub> as an upper bound for Q.</li>
      <li>Remove planes and pours under and around the coil, at least 30 % of the coil diameter from it on every layer.</li>
      <li>Route the inner lead through a via to another layer; its length and resistance are not in the calculation.</li>
      <li>For two or more layers, align the coils and alternate the winding direction; calculate or measure the mutual inductance.</li>
      <li>Measure inductance, AC resistance and self-resonance on a prototype, and operate well below the SRF.</li>
    </ul>
  </Guide>;
}
