import { Cite, Guide, TryIt } from './Guide';

export default function LNetworkMatching() {
  return (
    <Guide sources={[
      { text: 'D. M. Pozar, Microwave Engineering, 4th ed., Wiley, 2012, §5.1 and Example 5.1: two-element L-section matching of a complex load.' },
      { text: 'Rohde & Schwarz, Understanding the Smith Chart: normalised impedance, reflection coefficient and matching paths.', url: 'https://www.rohde-schwarz.com/au/products/test-and-measurement/essentials-test-equipment/spectrum-analyzers/understanding-the-smith-chart_257989.html' },
      { text: 'Analog Devices, RF Impedance Matching Calculator: different matching networks can meet the same centre-frequency target but differ outside it.', url: 'https://www.analog.com/en/resources/interactive-design-tools/rf-impedance-matching-calculator.html' },
    ]}>
      <p><b>An L-network can match a complex RF load with just two reactive parts at one frequency.</b> The same source and load can admit a low-pass and a high-pass solution, sometimes with two possible component arrangements as well. Their parts, harmonic behaviour and usable bandwidth differ. <Cite n={[1, 3]} /></p>

      <h2>What the Smith chart shows</h2>
      <p>A Smith chart plots Γ = (Z − Z<sub>0</sub>)/(Z + Z<sub>0</sub>) for an impedance normalised to Z<sub>0</sub>. Its centre is the match. Moving along a constant-resistance circle represents adding series reactance; moving along a constant-conductance circle represents adding shunt susceptance. A chart therefore shows <i>why</i> a series-plus-shunt path reaches the centre, rather than only listing L and C values. <Cite n={2} /></p>

      <h2>A complex-load example</h2>
      <p>Pozar's Example 5.1 matches a <b>200 − j100 Ω</b> load to a <b>100 Ω</b> source at <b>500 MHz</b>. With the shunt part next to the load, one path uses a shunt capacitor of about <b>0.92 pF</b> and a series inductor of about <b>38.8 nH</b>. A second path uses a shunt inductor of about <b>46.1 nH</b> and a series capacitor of about <b>2.61 pF</b>. Both meet the target at 500 MHz in the ideal two-part model. The first is low-pass; the second is high-pass and blocks DC through its series capacitor. <Cite n={1} /></p>
      <TryIt to="/impedance-matching?f=500000000&rs=100&rl=200&xl=-100">Show both matching paths and their Smith-chart arcs</TryIt>

      <h2>Do not choose by the centre-frequency number alone</h2>
      <p>At the design frequency the ideal network can make return loss arbitrarily high. The useful question is whether its return loss stays above the requirement <i>across the operating band</i>. The calculator sweeps each candidate, then checks nearby E-series part values against the selected return-loss threshold. A high impedance ratio raises the network's Q and normally narrows the band. <Cite n={[1, 3]} /></p>
      <p>At RF, pad capacitance, via inductance and component self-resonance can move the match. Measure or simulate the load at the intended reference plane; include its package and board geometry before accepting a component value. A data-sheet impedance quoted at another frequency is not automatically the load impedance at yours.</p>

      <h2>When another topology is better</h2>
      <p>An L-section is compact and useful for a modest band. A quarter-wave transformer uses a transmission-line section instead of discrete parts, but it directly matches <i>real</i> source and load impedances at its centre frequency; a complex load needs additional treatment. Multisection transformers can widen the passband when there is room for the lines. <Cite n={1} /></p>
      <TryIt to="/quarter-wave-transformer">Compare a distributed quarter-wave match</TryIt>
    </Guide>
  );
}
