import { Cite, Guide, TryIt } from './Guide';

export default function DecouplingCapacitors() {
  return (
    <Guide
      sources={[
        { text: 'Texas Instruments Precision Labs, Decoupling capacitors: practical capacitor model and resonance from different capacitor values.', url: 'https://www.ti.com/content/dam/videos/external-videos/en-us/9/3816841626001/6313253251112.mp4/subassets/notes-decoupling_capacitors.pdf' },
        { text: 'Murata, Noise Suppression Measures around Digital IC Power Supplies, section 6-3: mounting inductance, parallel capacitors and antiresonance.', url: 'https://www.murata.com/en-GB/products/emc/emifil/library/knowhow/basic/s2-chapter06-p1' },
        { text: 'Murata, Ceramic Capacitors FAQ: capacitance changes under applied DC voltage.', url: 'https://www.murata.com/en-us/support/faqs/capacitor/ceramiccapacitor/char/0005' },
        { text: 'pcbplanner PDN Impedance Calculator, Method, formulas and references: target impedance and the lumped capacitor/plane model.', url: '/pdn#method' },
      ]}
    >
      <p>
        <b>There is no universal choice between 100 nF and 10 µF.</b> Start with the IC's supply requirements, then check the effective capacitance and mounted impedance.
        The smaller value has a higher self-resonant frequency if the inductance is the same; the larger value stores more charge. Neither fact by itself tells you which
        arrangement gives the lower supply impedance across the frequencies that matter.
      </p>
      <p>
        A useful design question is: how much may the rail move, how quickly does its current change, and what impedance does the complete path present? This guide compares
        two explicit capacitor models so those trade-offs can be reproduced.
      </p>

      <h2>What a real decoupling capacitor looks like electrically</h2>
      <p>
        A first-order model is a capacitance C in series with resistance ESR and inductance L. Here L is the <b>mounted</b> inductance, including the capacitor and its connection
        path. Its impedance magnitude and series-resonant frequency are:
      </p>
      <p>|Z(f)| = √[ESR² + (2πfL − 1/(2πfC))²]; fSRF = 1 / (2π√(LC)).</p>
      <p>
        Below resonance the capacitive term dominates. At resonance the reactances cancel and the impedance reaches ESR. Above resonance the inductive term grows.
        This is why a capacitance value alone cannot describe high-frequency decoupling. TI presents this series-RLC model in its decoupling training. <Cite n={1} />
      </p>

      <h2>100 nF versus 10 µF: a numerical comparison</h2>
      <p>
        Assume both capacitors have 20 mΩ ESR and 1 nH of mounted inductance. Use their effective capacitances as 100 nF and 10 µF.
        These are illustrative lumped models, not measurements or specifications for a particular package. Holding ESR and L equal isolates the effect of capacitance.
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Quantity</th>
            <th className="v">100 nF</th>
            <th className="v">10 µF</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Series resonance</td><td className="v">15.92 MHz</td><td className="v">1.592 MHz</td></tr>
          <tr><td>|Z| at 1 MHz</td><td className="v">1.585 Ω</td><td className="v">0.0222 Ω</td></tr>
          <tr><td>|Z| at 10 MHz</td><td className="v">0.0984 Ω</td><td className="v">0.0644 Ω</td></tr>
          <tr><td>|Z| at 100 MHz</td><td className="v">0.613 Ω</td><td className="v">0.628 Ω</td></tr>
        </tbody>
      </table>
      <p>
        At 10 MHz the 10 µF capacitor is already inductive but still has the lower impedance. Near 15.92 MHz the 100 nF capacitor reaches its 20 mΩ minimum and wins instead.
        By 100 MHz both are dominated by roughly the same inductance. A higher self-resonant frequency does not mean lower impedance at every frequency.
      </p>
      <TryIt to="/pdn?v=3.3&ripple=3&step=1&useMax=0&pl=100&pw=100&pd=0.1&er=4.3&c=100&esr=20&esl=1&f=10&auto=0&n=1">Load the 100 nF model at 10 MHz</TryIt>
      <TryIt to="/pdn?v=3.3&ripple=3&step=1&useMax=0&pl=100&pw=100&pd=0.1&er=4.3&c=10000&esr=20&esl=1&f=10&auto=0&n=1">Compare the 10 µF model at 10 MHz</TryIt>
      <p>
        Read the calculator's single-capacitor impedance for the table values. Its total PDN result also includes the plane capacitance, so that is a different quantity.
      </p>

      <h2>Why adding both values can produce antiresonance</h2>
      <p>
        Between the two series-resonant frequencies, one branch can be inductive while the other remains capacitive. Their susceptances can cancel, producing an impedance
        peak in the parallel combination. Adding capacitance can therefore raise the impedance over part of the band. TI demonstrates this effect, and Murata shows how
        connection inductance influences it. <Cite n={[1, 2]} />
      </p>
      <p>
        For the two equal-inductance models above, the susceptances cancel at approximately 11.31 MHz. At that frequency each capacitor alone has about 0.0725 Ω impedance,
        but the two in parallel give about 0.131 Ω. These numbers come from adding the complex branch admittances, not the impedance magnitudes.
      </p>
      <p>
        This example excludes planes, regulator, package and shared connection inductance. It demonstrates one possible resonance, not a prediction for every 100 nF plus
        10 µF combination. Real ESR and other losses change the peak. Identical parts on equivalent connections avoid this particular separation of resonant frequencies,
        but different mounting paths and the rest of the PDN can still introduce resonances. <Cite n={2} />
      </p>
      <p>
        A mixed capacitor bank can be appropriate when it is designed for the device and checked across frequency. The useful rule is to verify the combined impedance,
        rather than assume that each added value fills a harmless gap.
      </p>

      <h2>Set a target from the rail's noise budget</h2>
      <p>
        A first estimate is Ztarget = ΔV / ΔI. For a 3.3 V rail with 3 % allocated to the transient excursion, ΔV = 99 mV.
        A 1 A load step gives a target of 0.099 Ω. This allocation needs to fit inside the device's supply limits after allowing for regulator accuracy, DC drop and other noise.
        <Cite n={4} />
      </p>
      <p>
        At 10 MHz, either single-capacitor model in the table is just below that illustrative target, although the 100 nF model has almost no margin.
        At 100 MHz both are above it. Passing at one chosen frequency therefore does not establish that the rail meets its transient requirement.
      </p>
      <p>
        The PDN Calculator places identical capacitors in parallel with an ideal plane capacitance. It is useful for exploring count, mounted inductance and the frequency
        response, but it does not model the mixed bank calculated above. Its count estimate at one frequency is a starting point; its plot also needs checking.
        Regulator response, package and on-die capacitance, shared inductance and capacitor positions need a fuller model where they affect the result.
      </p>

      <h2>Use the capacitance available at the working voltage</h2>
      <p>
        High-permittivity ceramic capacitors such as X5R and X7R can lose capacitance under DC bias. The amount depends on the specific part and voltage;
        the dielectric label and voltage rating alone do not give the remaining capacitance. Consult the manufacturer's bias curve, including temperature and tolerance
        where relevant. <Cite n={3} />
      </p>
      <p>
        For example, if a nominal 10 µF part has 4 µF effective capacitance in your application, enter 4000 nF in the calculator.
        With the same assumed 1 nH, its series resonance becomes approximately 2.52 MHz. That 4 µF is an example input, not a generic derating factor for all 10 µF capacitors.
      </p>

      <h2>Placement and bulk capacitance</h2>
      <p>
        Short, wide connections and a compact supply-to-ground loop reduce the inductance added by the layout. A capacitor placed close to a pin can still have a long
        electrical path if its ground connection takes a detour. Murata's examples explicitly include the installation pattern when comparing impedance. <Cite n={2} />
      </p>
      <p>
        The charge requirement is a separate check: C ≥ ΔI × Δt / ΔV for a capacitor supplying a constant extra current over Δt.
        Supplying 0.1 A for 10 µs while allowing 0.1 V of droop requires 10 µF of effective capacitance in that ideal calculation.
        Real behaviour also includes the regulator's response, the immediate ESR voltage step and inductive effects. Local bypassing and bulk energy storage both need
        consideration, even when the final selection happens to use the same capacitor value.
      </p>

      <h2>A practical selection sequence</h2>
      <ol>
        <li>Follow the IC and regulator requirements for capacitance, ESR, pin placement and supply stability.</li>
        <li>Allocate the allowed voltage excursion and estimate the load-current change and relevant time scales.</li>
        <li>Choose actual capacitor parts using effective capacitance and frequency-dependent manufacturer data.</li>
        <li>Include the mounting path and inspect the combined impedance across the required band, especially any peaks.</li>
        <li>Check transient behaviour at the load pins on the assembled board before relying on a small calculated margin.</li>
      </ol>
      <TryIt to="/pdn?v=3.3&ripple=3&step=1&useMax=0&pl=100&pw=100&pd=0.1&er=4.3&c=100&esr=20&esl=1&f=10&auto=0&n=4">Explore four identical capacitors and the plane in the PDN tool</TryIt>
    </Guide>
  );
}
