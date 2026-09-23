import { Cite, Guide, TryIt } from './Guide';

export default function CrosstalkSpacing() {
  return (
    <Guide
      sources={[
        { text: 'Autodesk, 10 High-Speed PCB Design Rules to Follow, rule 6: centre-to-centre 3W spacing and the adjacent reference plane.', url: 'https://www.autodesk.com/products/fusion-360/blog/10-high-speed-pcb-design-rules/' },
        { text: 'Texas Instruments SPRAAR7J, High-Speed Interface Layout Guidelines, sections 2.4, 3.1 and 3.4: reference planes and spacing between differential pairs.', url: 'https://www.ti.com/lit/an/spraar7j/spraar7j.pdf' },
        { text: 'pcbplanner Crosstalk Calculator, Method, formulas and references: even/odd-mode field solution and first-order NEXT/FEXT model.', url: '/crosstalk#method' },
      ]}
    >
      <p>
        <b>The 3W rule means a centre-to-centre pitch of three trace widths.</b> For two equal-width traces, that leaves an edge-to-edge gap of two widths. It is a starting point
        for reducing crosstalk, not a noise limit or a guarantee that a receiver will work. The distance to the reference plane, coupled length and edge speed also matter.
        <Cite n={1} />
      </p>
      <p>
        With 0.15 mm traces, 3W means 0.45 mm between the centres and a 0.30 mm copper clearance. This guide uses that geometry to show why the same routing rule can give
        different results on different boards.
      </p>

      <h2>Is 3W measured from the edges or the centres?</h2>
      <p>
        Call the trace width W, the edge gap S and the centre pitch P. For equal widths, P = W + S. The conventional 3W rule is P ≥ 3W, so S ≥ 2W. Always check the
        dimension arrows in a vendor guide: a requirement explicitly stated as three widths of clearance means S ≥ 3W, which is a larger gap.
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th>For W = 0.15 mm</th>
            <th className="v">Gap S</th>
            <th className="v">Pitch P</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>3W centre pitch</td><td className="v">0.30 mm</td><td className="v">0.45 mm</td></tr>
          <tr><td>3W edge clearance</td><td className="v">0.45 mm</td><td className="v">0.60 mm</td></tr>
        </tbody>
      </table>
      <p>
        The Crosstalk Calculator takes <b>edge-to-edge spacing</b>. Its sweep row labelled 2 W is therefore the conventional 3W centre-pitch case. Entering 3 W in the spacing
        field tests a centre pitch of 4 W.
      </p>

      <h2>What NEXT and FEXT measure</h2>
      <p>
        A switching trace is the aggressor; the neighbouring trace picking up noise is the victim. Near-end crosstalk (NEXT) is observed at the victim end beside the aggressor
        source. Far-end crosstalk (FEXT) is observed at the opposite end. The calculator solves the even and odd modes of the coupled cross-section to estimate both.
        <Cite n={3} />
      </p>
      <p>
        Its saturated NEXT coefficient is Kb = (Zeven − Zodd) / [2 × (Zeven + Zodd)]. NEXT initially increases with coupled length, reaching Kb × V when the round-trip
        propagation delay reaches the edge rise time. Shortening a long parallel run helps only after it is short enough to leave that saturated region.
      </p>
      <p>
        FEXT depends on the difference between the even- and odd-mode propagation delays. Ideal homogeneous stripline gives equal modal velocities and cancels this component;
        microstrip generally does not. Real discontinuities, unequal dielectric regions and imperfect terminations can spoil that cancellation.
      </p>

      <h2>Same 3W spacing, three distances to the plane</h2>
      <p>
        These are calculated examples from pcbplanner, using bare microstrip with W = 0.15 mm, copper thickness 0.035 mm, S = 0.30 mm and dielectric constant 4.1.
        The parallel run is 50 mm, the aggressor swing is 3.3 V and the 10–90 % rise time is 100 ps. Only the dielectric height H below the trace changes.
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th className="v">H</th>
            <th className="v">S/H</th>
            <th className="v">NEXT</th>
            <th className="v">Noise</th>
          </tr>
        </thead>
        <tbody>
          <tr><td className="v">0.10 mm</td><td className="v">3.0</td><td className="v">2.48 %</td><td className="v">82 mV</td></tr>
          <tr><td className="v">0.20 mm</td><td className="v">1.5</td><td className="v">5.88 %</td><td className="v">194 mV</td></tr>
          <tr><td className="v">0.40 mm</td><td className="v">0.75</td><td className="v">11.60 %</td><td className="v">383 mV</td></tr>
        </tbody>
      </table>
      <p>
        All three meet the same 3W rule. Moving the reference plane further away lets more of the field reach the neighbouring trace, and the estimated noise rises.
        These use the calculator's normal mesh and rounded results. The noise conversion assumes weak coupling and matched terminations; the more strongly coupled cases
        need particular care. This is a geometry comparison, not a pass/fail table.
      </p>
      <p>
        Changing H also changes the line impedance. To compare manufacturable alternatives at a fixed impedance, redesign the width on each stackup and repeat the spacing
        check. A fixed-width comparison isolates one effect but does not complete that design.
      </p>
      <TryIt to="/crosstalk?type=microstrip&mask=0&w=0.15&t=0.035&s=0.3&h=0.1&er=4.1&len=50&tr=100&v=3.3">Load the 0.10 mm reference-plane example</TryIt>
      <TryIt to="/crosstalk?type=microstrip&mask=0&w=0.15&t=0.035&s=0.3&h=0.4&er=4.1&len=50&tr=100&v=3.3">Compare the same traces with the plane 0.40 mm away</TryIt>

      <h2>Why edge speed matters more than clock frequency</h2>
      <p>
        The coupling calculation takes rise time, not clock repetition rate. A slowly repeating signal can still have a fast edge. Use the relevant output transition time
        from the device model or measurement, including the selected drive strength and load.
      </p>
      <p>
        In the first example the 50 mm section has about 283 ps of one-way delay. With a 100 ps edge, NEXT saturates after roughly 8.8 mm. Reducing the run from 50 mm to
        25 mm therefore leaves saturated NEXT about the same, although it shortens the noise pulse and reduces the first-order FEXT amplitude. Reducing it to 5 mm takes NEXT
        below saturation, to approximately 46 mV in this model.
      </p>
      <TryIt to="/crosstalk?type=microstrip&mask=0&w=0.15&t=0.035&s=0.3&h=0.1&er=4.1&len=5&tr=100&v=3.3">Check the shorter 5 mm parallel run</TryIt>

      <h2>Does the rule apply inside a differential pair?</h2>
      <p>
        The gap inside a differential pair is an impedance-design input. The clearance between that pair and another pair is an isolation requirement. Applying a generic
        3W clearance inside the pair can change its differential impedance.
      </p>
      <p>
        TI's high-speed layout guide gives its own pair-to-pair spacing and keep-outs, including a five-width spacing rule and larger clearance to clocks.
        Those are vendor layout recommendations for the interfaces covered by that document, not a universal replacement for a channel specification.
        Follow the applicable device guidance. <Cite n={2} />
      </p>
      <p>
        The two-line Crosstalk Calculator models one aggressor and one victim. It does not solve the four-conductor coupling between two complete differential pairs.
        Use it for the two-trace comparison above; use a suitable multi-conductor model for pair-to-pair coupling.
      </p>

      <h2>A practical spacing check</h2>
      <ol>
        <li>Start with the device's routing requirements and an uninterrupted reference plane.</li>
        <li>State whether the spacing is an edge gap or a centre pitch before entering it into the PCB rules.</li>
        <li>Use the actual stackup, solder mask, coupled length, signal swing and rise time in the calculation.</li>
        <li>Compare estimated noise with the receiver's available noise margin, allowing for other noise sources and modelling error.</li>
        <li>If the margin is poor, try more clearance, a closer reference plane or a shorter shared run, then recheck impedance.</li>
      </ol>
      <TryIt to="/impedance">Check the trace impedance after changing the stackup</TryIt>
    </Guide>
  );
}
